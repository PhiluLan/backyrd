import { parseGuestAvailability, parseGuestCheckoutRecovery, parseGuestReceipt, record, type GuestRequest } from "./booking-guest";

export class GuestRequestError extends Error {
  constructor(readonly code: string, readonly uncertain: boolean) { super(code); }
}
export type GuestFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal; cache: "no-store"; credentials: "omit"; redirect: "error"; referrerPolicy: "no-referrer" }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Expo native transport and browser fetch share validation, scopes and uncertain outcomes. */
export function createGuestClient(endpoint: string, transport: GuestFetch, nativeOrigin?: string) {
 return async function guestRequest(request: GuestRequest) {
  const write = request.operation === "create" || request.operation === "cancel";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await transport(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(nativeOrigin ? { Origin: nativeOrigin } : {}) }, body: JSON.stringify(request), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal, redirect: "error" });
    const body = record(await response.json());
    if (!response.ok) {
      const allowed = ["bad_request", "temporarily_unavailable", "not_available", "link_unavailable", "changed", "slot_unavailable", "request_reused", "cancellation_unavailable", "rate_limited", "challenge_required", "outcome_unknown"];
      const code = typeof body.error === "string" && allowed.includes(body.error) ? body.error : "temporarily_unavailable";
      if (body.outcome !== "rejected" && body.outcome !== "unknown") throw new Error("invalid_guest_response");
      throw new GuestRequestError(code, body.outcome === "unknown");
    }
    const result = request.operation === "availability" ? parseGuestAvailability(body.data) : request.operation === "checkout_recover" ? parseGuestCheckoutRecovery(body.data, request) : parseGuestReceipt(body.data);
    if (("reservationId" in request && (!("id" in result) || result.id !== request.reservationId)) || ("spotId" in request && result.spot_id !== request.spotId)) throw new Error("invalid_guest_response");
    if (request.operation === "availability" && (!("date" in result) || result.date !== request.date || result.party_size !== request.partySize)) throw new Error("invalid_guest_response");
    return result;
  } catch (error) {
    if (error instanceof GuestRequestError) throw error;
    throw new GuestRequestError(write ? "outcome_unknown" : "temporarily_unavailable", write);
  } finally { clearTimeout(timer); }
 };
}
