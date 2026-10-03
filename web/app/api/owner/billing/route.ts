import "server-only";

import { billingConfigured, billingPublicState, ownerActor, serviceClient, type BillingRow } from "@/lib/owner-billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await ownerActor(request);
    if (!actor) return Response.json({ error: "authentication_required" }, { status: 401 });
    const { data: owned, error: ownerError } = await actor.client.rpc("get_owner_spots_v1", { p_limit: 200 });
    if (ownerError || !Array.isArray(owned)) throw new Error("owner_spots_unavailable");
    const spots = owned.filter((spot: { spot_id?: unknown; name?: unknown }) =>
      typeof spot.spot_id === "string" && typeof spot.name === "string");
    const ids = spots.map((spot: { spot_id: string }) => spot.spot_id);
    const { data: rows, error } = ids.length
      ? await serviceClient().from("owner_pro_billing_v1")
        .select("spot_id,owner_id,checkout_nonce,checkout_expires_at,stripe_checkout_session_id,stripe_customer_id,stripe_subscription_id,subscription_status,paid_until,cancel_at_period_end")
        .eq("owner_id", actor.id).in("spot_id", ids)
      : { data: [], error: null };
    if (error) throw new Error("billing_state_unavailable");
    const bySpot = new Map((rows as BillingRow[]).map((row) => [row.spot_id, row]));
    return Response.json({
      checkoutAvailable: billingConfigured(),
      spots: spots.map((spot: { spot_id: string; name: string; city?: string | null; status?: string }) => ({
        spotId: spot.spot_id,
        name: spot.name,
        city: spot.city ?? null,
        checkoutEligible: spot.status === "approved",
        billing: billingPublicState(bySpot.get(spot.spot_id) ?? null),
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "billing_state_unavailable" }, { status: 503 });
  }
}
