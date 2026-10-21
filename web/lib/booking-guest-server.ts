import "server-only";
import type { GuestDependencies } from "./booking-guest-handler";
import { guestRateSubject, guestSealKeys, sealGuestKey, verifyGuestChallenge } from "./booking-guest-security";
import { createBookingServiceRpc } from "./booking-service-rpc";

const rpcNames = new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_guest_availability_v1", "booking_guest_create_v1", "booking_guest_read_v1", "booking_guest_recover_v1", "booking_guest_checkout_recover_v1", "booking_guest_cancel_v1"]);

export function guestDependencies(): GuestDependencies | null {
  const origin = process.env.BOOKING_GUEST_ORIGIN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rateSecret = process.env.BOOKING_GUEST_RATE_SECRET;
  if (!origin || !url || !serviceKey || !rateSecret || Buffer.byteLength(rateSecret, "utf8") < 32) return null;
  try {
    const parsedOrigin = new URL(origin), parsedBackend = new URL(url);
    const local = process.env.NODE_ENV === "development" && parsedOrigin.hostname === "localhost" && (parsedBackend.hostname === "127.0.0.1" || parsedBackend.hostname === "localhost");
    if ((!local && (parsedOrigin.protocol !== "https:" || parsedBackend.protocol !== "https:")) || parsedOrigin.origin !== origin || parsedBackend.username || parsedBackend.password || parsedBackend.search || parsedBackend.hash || parsedBackend.pathname !== "/") return null;
  } catch { return null; }
  return {
    origin,
    // Deliberately closed until production sender/callback/scheduler acceptance
    // and public checkout/publishing are complete. An environment flag cannot skip that work.
    newIntakeReady: false,
    subject: headers => guestRateSubject(headers, process.env.VERCEL === "1", rateSecret),
    rpc: createBookingServiceRpc({ url, key: serviceKey, development: process.env.NODE_ENV === "development" }, rpcNames),
    verifyChallenge(token) {
      const secret = process.env.BOOKING_TURNSTILE_SECRET;
      return secret ? verifyGuestChallenge(token, origin, secret) : Promise.resolve(false);
    },
    seal(key, spot, request) {
      const active = process.env.BOOKING_GUEST_SEAL_ACTIVE, keys = process.env.BOOKING_GUEST_SEAL_KEYS;
      if (!active || !keys) throw new Error("guest_keys_unavailable");
      return sealGuestKey(key, spot, request, guestSealKeys(active, keys));
    },
  };
}
