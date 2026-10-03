import "server-only";

import { randomUUID } from "node:crypto";
import {
  billingConfigured, billingOrigin, ownerActor, serviceClient, stripeClient, verifiedOwnedSpot, verifiedPrice,
} from "@/lib/owner-billing/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let spotId = "";
  let ownerId = "";
  let nonce = "";
  let sessionId = "";
  try {
    const actor = await ownerActor(request);
    if (!actor) return Response.json({ error: "authentication_required" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    spotId = body && typeof body === "object" && "spotId" in body && typeof body.spotId === "string" ? body.spotId : "";
    const spot = await verifiedOwnedSpot(actor, spotId);
    if (!spot) return Response.json({ error: "owner_spot_not_verified" }, { status: 403 });
    if (!billingConfigured()) return Response.json({ error: "checkout_not_available" }, { status: 503 });

    const stripe = stripeClient();
    const priceId = await verifiedPrice(stripe);
    const origin = billingOrigin(request);
    ownerId = actor.id;
    nonce = randomUUID();
    const service = serviceClient();
    const reservation = await service.rpc("owner_pro_billing_reserve_checkout_v1", {
      p_spot_id: spotId, p_owner_id: ownerId, p_checkout_nonce: nonce,
    });
    if (reservation.error) throw new Error("checkout_reservation_unavailable");
    if (reservation.data !== true) return Response.json({ error: "subscription_or_checkout_exists" }, { status: 409 });

    const returnPath = `/owner/billing?spot=${encodeURIComponent(spotId)}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      allowed_payment_method_types: ["card", "twint"],
      customer_email: actor.email ?? undefined,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      locale: "de",
      client_reference_id: `${ownerId}:${spotId}`,
      metadata: { owner_id: ownerId, spot_id: spotId, checkout_nonce: nonce },
      subscription_data: { metadata: { owner_id: ownerId, spot_id: spotId, checkout_nonce: nonce } },
      success_url: `${origin}${returnPath}&checkout=return`,
      cancel_url: `${origin}${returnPath}&checkout=cancel`,
      expires_at: Math.floor(Date.now() / 1000) + 1860,
    }, { idempotencyKey: `owner-pro:${spotId}:${nonce}` });
    sessionId = session.id;
    // Dynamic eligibility is account-specific: fail closed if TWINT is absent.
    if (!session.url || !session.payment_method_types.includes("twint")) throw new Error("twint_not_available");
    const saved = await service.from("owner_pro_billing_v1")
      .update({ stripe_checkout_session_id: session.id })
      .eq("spot_id", spotId).eq("owner_id", ownerId).eq("checkout_nonce", nonce)
      .eq("subscription_status", "CHECKOUT_PENDING").select("spot_id").single();
    if (saved.error || !saved.data) throw new Error("checkout_binding_failed");
    return Response.json({ url: session.url }, { headers: { "cache-control": "no-store" } });
  } catch {
    if (sessionId) {
      try { await stripeClient().checkout.sessions.expire(sessionId); } catch { /* session may already be complete */ }
    }
    if (spotId && ownerId && nonce) {
      try {
        await serviceClient().rpc("owner_pro_billing_release_checkout_v1", {
          p_spot_id: spotId, p_owner_id: ownerId, p_checkout_nonce: nonce,
        });
      } catch { /* reservation expires independently */ }
    }
    return Response.json({ error: "checkout_unavailable" }, { status: 503 });
  }
}
