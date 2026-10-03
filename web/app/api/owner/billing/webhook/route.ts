import "server-only";

import type Stripe from "stripe";
import { serviceClient, stripeClient, verifiedPrice } from "@/lib/owner-billing/server";

export const runtime = "nodejs";

const handledTypes = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function idOf(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function subscriptionId(event: Stripe.Event): string | null {
  if (event.type.startsWith("customer.subscription.")) return (event.data.object as Stripe.Subscription).id;
  if (event.type.startsWith("checkout.session.")) return idOf((event.data.object as Stripe.Checkout.Session).subscription);
  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    return idOf(invoice.parent?.subscription_details?.subscription);
  }
  return null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_OWNER_PRO_PRICE_ID)
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });

  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
  if (event.livemode !== process.env.STRIPE_SECRET_KEY.startsWith("sk_live_"))
    return Response.json({ error: "environment_mismatch" }, { status: 400 });
  if (!handledTypes.has(event.type)) return Response.json({ received: true });

  const id = subscriptionId(event);
  if (!id) return Response.json({ received: true, ignored: "subscription_missing" });
  try {
    const expectedPriceId = await verifiedPrice(stripe);
    // Read current Stripe state: webhook deliveries may arrive out of order.
    const subscription = await stripe.subscriptions.retrieve(id, { expand: ["latest_invoice"] });
    const { owner_id: ownerId, spot_id: spotId, checkout_nonce: nonce } = subscription.metadata;
    const item = subscription.items.data[0];
    if (!ownerId || !spotId || !nonce || subscription.items.data.length !== 1
      || item.price.id !== expectedPriceId || item.price.currency !== "chf")
      return Response.json({ received: true, ignored: "not_owner_pro" });
    const customerId = idOf(subscription.customer);
    if (!customerId) return Response.json({ error: "customer_missing" }, { status: 500 });
    const latestInvoice = typeof subscription.latest_invoice === "string" || !subscription.latest_invoice
      ? null : subscription.latest_invoice;
    const invoicePayments = latestInvoice?.status === "paid"
      ? await stripe.invoicePayments.list({ invoice: latestInvoice.id, limit: 10 }) : null;
    const paid = invoicePayments?.data.some((payment) => payment.status === "paid"
      && (payment.amount_paid ?? 0) > 0
      && ["payment_intent", "charge"].includes(payment.payment.type)) ?? false;
    const status = subscription.status.toUpperCase();
    const normalizedStatus = ["INCOMPLETE", "ACTIVE", "PAST_DUE", "UNPAID", "PAUSED", "CANCELED"].includes(status)
      ? status : "INCOMPLETE";
    const paidUntil = normalizedStatus === "ACTIVE" && paid && item.current_period_end > Math.floor(Date.now() / 1000)
      ? new Date(item.current_period_end * 1000).toISOString() : null;
    const applied = await serviceClient().rpc("owner_pro_billing_apply_stripe_v1", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_spot_id: spotId,
      p_owner_id: ownerId,
      p_checkout_nonce: nonce,
      p_customer_id: customerId,
      p_subscription_id: subscription.id,
      p_price_id: item.price.id,
      p_status: normalizedStatus,
      p_paid_until: paidUntil,
      p_cancel_at_period_end: subscription.cancel_at_period_end,
    });
    if (applied.error) throw new Error("billing_apply_failed");
    return Response.json({ received: true, applied: applied.data === true });
  } catch {
    // A non-2xx response asks Stripe to retry; no payment is treated as paid.
    return Response.json({ error: "billing_sync_failed" }, { status: 503 });
  }
}
