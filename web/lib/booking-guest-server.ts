import "server-only";
import { GuestRpcRejection, type GuestDependencies } from "./booking-guest-handler";
import { boundedJson, guestRateSubject, guestSealKeys, sealGuestKey, verifyGuestChallenge } from "./booking-guest-security";
import { record } from "./booking-guest-contract";

const rpcNames = new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_guest_availability_v1", "booking_guest_create_v1", "booking_guest_read_v1", "booking_guest_recover_v1", "booking_guest_cancel_v1"]);

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
    // Deliberately closed until the immutable outbox dispatcher, verified sender and
    // callback/retry acceptance are implemented. No environment flag can skip that work.
    newIntakeReady: false,
    subject: headers => guestRateSubject(headers, process.env.VERCEL === "1", rateSecret),
    async rpc(name, args) {
      if (!rpcNames.has(name)) throw new Error("guest_rpc_not_allowed");
      const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
      });
      const result = await boundedJson(response, 1_500_000);
      if (!response.ok) {
        const error = record(result);
        // A gateway HTML/JSON failure is not proof of a rolled-back database transaction.
        if (typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) && typeof error.message === "string") throw new GuestRpcRejection(error.code, error.message);
        throw new Error("guest_backend_unavailable");
      }
      return result;
    },
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
