"use client";
import { parseGuestAvailability, parseGuestCheckoutRecovery, parseGuestReceipt, record, type GuestRequest } from "./booking-guest-contract";

export class GuestRequestError extends Error {
  constructor(readonly code: string, readonly uncertain: boolean) { super(code); }
}
export async function guestRequest(request: GuestRequest) {
  const write = request.operation === "create" || request.operation === "cancel";
  try {
    const response = await fetch("/api/booking/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(30000), redirect: "error" });
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
  }
}
