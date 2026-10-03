import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const OWNER_PRO_MONTHLY_CHF = 39;
export const OWNER_PRO_MONTHLY_RAPPEN = 3900;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BillingRow = {
  spot_id: string;
  owner_id: string;
  checkout_nonce: string | null;
  checkout_expires_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: "CHECKOUT_PENDING" | "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "UNPAID" | "PAUSED" | "CANCELED";
  paid_until: string | null;
  cancel_at_period_end: boolean;
};

export type OwnerActor = {
  id: string;
  email: string | null;
  client: SupabaseClient;
};

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("billing_backend_unavailable");
  return { url, anonKey, serviceKey };
}

export function billingConfigured() {
  return process.env.OWNER_PRO_BILLING_ENABLED === "true"
    && process.env.OWNER_PRO_TWINT_VERIFIED === "true"
    && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
      && process.env.STRIPE_OWNER_PRO_PRICE_ID && process.env.OWNER_PRO_BILLING_ORIGIN);
}

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe_not_configured");
  return new Stripe(key);
}

export function serviceClient(): SupabaseClient {
  const { url, serviceKey } = supabaseConfig();
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function ownerActor(request: Request): Promise<OwnerActor | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const { url, anonKey } = supabaseConfig();
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, client };
}

export async function verifiedOwnedSpot(actor: OwnerActor, spotId: string): Promise<{ name: string } | null> {
  if (!uuid.test(spotId)) return null;
  const { data, error } = await actor.client.rpc("world_product_authoring_detail_v1", { p_spot_id: spotId });
  const detail = data as { name?: unknown; actor?: { role?: unknown } } | null;
  if (error || detail?.actor?.role !== "VERIFIED_OWNER" || typeof detail.name !== "string") return null;
  return { name: detail.name };
}

// Billing history and cancellation must remain reachable even if the World
// Knowledge authoring service is unavailable or Owner verification changes.
export async function billingOwnedSpot(actor: OwnerActor, spotId: string): Promise<{ name: string } | null> {
  if (!uuid.test(spotId)) return null;
  const { data, error } = await actor.client.rpc("get_owner_spots_v1", { p_limit: 200 });
  if (error || !Array.isArray(data)) throw new Error("owner_spots_unavailable");
  const spot = data.find((item: { spot_id?: unknown }) => item.spot_id === spotId) as { name?: unknown } | undefined;
  return spot && typeof spot.name === "string" ? { name: spot.name } : null;
}

export async function billingRow(spotId: string): Promise<BillingRow | null> {
  const { data, error } = await serviceClient().from("owner_pro_billing_v1")
    .select("spot_id,owner_id,checkout_nonce,checkout_expires_at,stripe_checkout_session_id,stripe_customer_id,stripe_subscription_id,subscription_status,paid_until,cancel_at_period_end")
    .eq("spot_id", spotId).maybeSingle();
  if (error) throw new Error("billing_state_unavailable");
  return data as BillingRow | null;
}

export function billingPublicState(row: BillingRow | null) {
  const pendingExpired = row?.subscription_status === "CHECKOUT_PENDING"
    && (!row.checkout_expires_at || Date.parse(row.checkout_expires_at) <= Date.now());
  return {
    status: pendingExpired ? "NONE" : row?.subscription_status ?? "NONE",
    active: row?.subscription_status === "ACTIVE" && Boolean(row.paid_until && Date.parse(row.paid_until) > Date.now()),
    paidUntil: row?.paid_until ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
  };
}

export function billingOrigin(request: Request) {
  const configured = process.env.OWNER_PRO_BILLING_ORIGIN;
  if (!configured) throw new Error("billing_origin_not_configured");
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("billing_origin_invalid");
  const requestHost = request.headers.get("host");
  if (requestHost && requestHost !== url.host) throw new Error("billing_origin_mismatch");
  return url.origin;
}

export async function verifiedPrice(stripe: Stripe): Promise<string> {
  const priceId = process.env.STRIPE_OWNER_PRO_PRICE_ID;
  if (!priceId) throw new Error("billing_price_not_configured");
  const price = await stripe.prices.retrieve(priceId);
  if (!price.active || price.currency !== "chf" || price.unit_amount !== OWNER_PRO_MONTHLY_RAPPEN
    || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1
    || price.tax_behavior !== "inclusive") throw new Error("billing_price_invalid");
  return price.id;
}
