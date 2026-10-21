import "server-only";
import { parseGuestAvailability, parseGuestReceipt, parseGuestRequest, record, type GuestOperation, type GuestRequest } from "./booking-guest-contract";
import { boundedJson, hashGuestKey } from "./booking-guest-security";
import { BookingRpcRejection as GuestRpcRejection } from "./booking-service-rpc";
export { BookingRpcRejection as GuestRpcRejection } from "./booking-service-rpc";

type RpcArguments = Record<string, string | number | null>;
export type GuestDependencies = {
  origin: string;
  newIntakeReady: boolean;
  subject: (headers: Headers) => string;
  rpc: (name: string, args: RpcArguments) => Promise<unknown>;
  verifyChallenge: (token: string) => Promise<boolean>;
  seal: (key: string, spot: string, request: string) => string;
};
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
function failure(status: number, code: string, unknown = false) {
  return Response.json({ error: code, outcome: unknown ? "unknown" : "rejected" }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
function databaseFailure(error: GuestRpcRejection, operation: GuestOperation) {
  const message = error.databaseMessage;
  if (message === "booking_request_reused") return failure(409, "request_reused");
  if (message === "booking_public_policy_changed" || message === "booking_changed_reload") return failure(409, "changed");
  if (message === "booking_slot_unavailable") return failure(409, "slot_unavailable");
  if (message === "booking_guest_cancel_unavailable") return failure(409, "cancellation_unavailable");
  if (message === "booking_guest_request_unavailable") return failure(429, "rate_limited");
  if (error.databaseCode === "P0002" || error.databaseCode === "42501") return failure(404, operation === "read" || operation === "recover" || operation === "cancel" ? "link_unavailable" : "not_available");
  if (error.databaseCode === "22023") return failure(400, "bad_request");
  // An unrecognized server error does not prove that an intermediate proxy failed before commit.
  return failure(503, operation === "create" || operation === "cancel" ? "outcome_unknown" : "temporarily_unavailable", operation === "create" || operation === "cancel");
}
function rpcRequest(r: GuestRequest, d: GuestDependencies): [string, RpcArguments] {
  switch (r.operation) {
    case "availability": return ["booking_guest_availability_v1", { p_spot_id: r.spotId, p_date: r.date, p_party_size: r.partySize }];
    case "create": return ["booking_guest_create_v1", { p_spot_id: r.spotId, p_request_id: r.requestId, p_policy_revision: r.policyRevision, p_starts_at: r.startsAt, p_party_size: r.partySize, p_guest_name: r.name, p_email: r.email, p_key_hash: hashGuestKey(r.key), p_sealed_key: d.seal(r.key, r.spotId, r.requestId), p_note: r.note || null }];
    case "read": return ["booking_guest_read_v1", { p_reservation_id: r.reservationId, p_key_hash: hashGuestKey(r.key) }];
    case "recover": return ["booking_guest_recover_v1", { p_spot_id: r.spotId, p_request_id: r.requestId, p_key_hash: hashGuestKey(r.key) }];
    case "cancel": return ["booking_guest_cancel_v1", { p_reservation_id: r.reservationId, p_request_id: r.requestId, p_expected_revision: r.revision, p_key_hash: hashGuestKey(r.key) }];
  }
}

/** Separate quota transaction: rejected/rolled-back booking attempts still consume the shared budget. */
async function quota(d: GuestDependencies, r: GuestRequest, request: Request) {
  const write = r.operation === "create" || r.operation === "cancel";
  const result = record(await d.rpc("backyrd_consume_launch_cost_boundary_v1", {
    p_operation: write ? "booking_guest_write" : "booking_guest_read", p_subject_key: d.subject(request.headers),
    p_subject_minute_limit: write ? 8 : 40, p_subject_day_limit: write ? 100 : 800,
    p_global_minute_limit: write ? 120 : 600, p_global_day_limit: write ? 2000 : 20000,
  }));
  if (typeof result.allowed !== "boolean") throw new Error("guest_rate_unavailable");
  return result.allowed;
}

export async function handleGuestRequest(request: Request, d: GuestDependencies | null): Promise<Response> {
  if (request.method !== "POST") return failure(405, "bad_request");
  if (!d) return failure(503, "temporarily_unavailable");
  if (new URL(request.url).search || request.headers.get("origin") !== d.origin || request.headers.get("sec-fetch-site") === "cross-site") return failure(403, "bad_request");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") || request.headers.has("content-encoding")) return failure(415, "bad_request");
  let r: GuestRequest;
  try { r = parseGuestRequest(await boundedJson(request, 8192, 5000)); }
  catch { return failure(400, "bad_request"); }
  if ((r.operation === "availability" || r.operation === "create") && !d.newIntakeReady) return failure(503, "not_available");
  try {
    if (!await quota(d, r, request)) return failure(429, "rate_limited");
    if (r.operation === "create" && !await d.verifyChallenge(r.challenge)) return failure(403, "challenge_required");
  } catch { return failure(503, "temporarily_unavailable"); }
  // Sealing/argument preparation happens before dispatch. A failure here is a definite non-write.
  let rpc: [string, RpcArguments];
  try { rpc = rpcRequest(r, d); } catch { return failure(503, "temporarily_unavailable"); }
  const write = r.operation === "create" || r.operation === "cancel";
  try {
    const data = await d.rpc(...rpc);
    const result = r.operation === "availability" ? parseGuestAvailability(data) : parseGuestReceipt(data);
    // Fence accidental cross-entity responses before returning any guest details.
    if (("spotId" in r && result.spot_id !== r.spotId) || ("reservationId" in r && (!("id" in result) || result.id !== r.reservationId))) throw new Error("guest_response_mismatch");
    if (r.operation === "availability" && (!("date" in result) || result.date !== r.date || result.party_size !== r.partySize)) throw new Error("guest_response_mismatch");
    return Response.json({ data: result }, { headers });
  } catch (error) {
    if (error instanceof GuestRpcRejection) return databaseFailure(error, r.operation);
    return failure(503, write ? "outcome_unknown" : "temporarily_unavailable", write);
  }
}
