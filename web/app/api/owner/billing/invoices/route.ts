import "server-only";

import { billingOwnedSpot, billingRow, ownerActor, stripeClient } from "@/lib/owner-billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await ownerActor(request);
    if (!actor) return Response.json({ error: "authentication_required" }, { status: 401 });
    const spotId = new URL(request.url).searchParams.get("spotId") ?? "";
    if (!await billingOwnedSpot(actor, spotId)) return Response.json({ error: "owner_spot_not_owned" }, { status: 403 });
    const row = await billingRow(spotId);
    if (!row || row.owner_id !== actor.id || !row.stripe_customer_id || !row.stripe_subscription_id)
      return Response.json({ invoices: [] }, { headers: { "cache-control": "no-store" } });
    const invoices = await stripeClient().invoices.list({ customer: row.stripe_customer_id, limit: 20 });
    const own = invoices.data.filter((invoice) => {
      const subscription = invoice.parent?.subscription_details?.subscription;
      return (typeof subscription === "string" ? subscription : subscription?.id) === row.stripe_subscription_id;
    }).slice(0, 12).map((invoice) => ({
      id: invoice.id,
      createdAt: new Date(invoice.created * 1000).toISOString(),
      amountRappen: invoice.amount_paid,
      status: invoice.status,
      url: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
    }));
    return Response.json({ invoices: own }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "invoices_unavailable" }, { status: 503 });
  }
}
