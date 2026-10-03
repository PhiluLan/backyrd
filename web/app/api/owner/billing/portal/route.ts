import "server-only";

import { billingOrigin, billingOwnedSpot, billingRow, ownerActor, stripeClient } from "@/lib/owner-billing/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await ownerActor(request);
    if (!actor) return Response.json({ error: "authentication_required" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const spotId = body && typeof body === "object" && "spotId" in body && typeof body.spotId === "string" ? body.spotId : "";
    if (!await billingOwnedSpot(actor, spotId)) return Response.json({ error: "owner_spot_not_owned" }, { status: 403 });
    const row = await billingRow(spotId);
    if (!row || row.owner_id !== actor.id || !row.stripe_customer_id || !row.stripe_subscription_id)
      return Response.json({ error: "subscription_not_found" }, { status: 404 });
    const origin = billingOrigin(request);
    const session = await stripeClient().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}/owner/billing?spot=${encodeURIComponent(spotId)}`,
    });
    return Response.json({ url: session.url }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "billing_portal_unavailable" }, { status: 503 });
  }
}
