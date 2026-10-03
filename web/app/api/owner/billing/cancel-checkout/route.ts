import "server-only";

import { billingOwnedSpot, billingRow, ownerActor, serviceClient, stripeClient } from "@/lib/owner-billing/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await ownerActor(request);
    if (!actor) return Response.json({ error: "authentication_required" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const spotId = body && typeof body === "object" && "spotId" in body && typeof body.spotId === "string" ? body.spotId : "";
    if (!await billingOwnedSpot(actor, spotId)) return Response.json({ error: "owner_spot_not_owned" }, { status: 403 });
    const row = await billingRow(spotId);
    if (!row || row.owner_id !== actor.id || row.subscription_status !== "CHECKOUT_PENDING" || !row.checkout_nonce)
      return Response.json({ canceled: false });
    if (row.stripe_checkout_session_id) {
      const stripe = stripeClient();
      const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
      if (session.status === "complete") return Response.json({ canceled: false });
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    }
    const result = await serviceClient().rpc("owner_pro_billing_release_checkout_v1", {
      p_spot_id: spotId, p_owner_id: actor.id, p_checkout_nonce: row.checkout_nonce,
    });
    if (result.error) throw new Error("checkout_release_failed");
    return Response.json({ canceled: result.data === true });
  } catch {
    return Response.json({ error: "checkout_cancel_unavailable" }, { status: 503 });
  }
}
