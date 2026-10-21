import "server-only";
import { mailEmail } from "./booking-mail";
import { createHash, randomBytes } from "node:crypto";
import { guestUuid, record } from "./booking-guest-contract";
import { boundedJson, hashGuestKey } from "./booking-guest-security";
import { BookingRpcRejection, type BookingRpc } from "./booking-service-rpc";
import { parseMailReissueRequest, parseMailReissueResult } from "./booking-mail-reissue-contract";
export type MailReissueDependencies = { origin: string; actor: (request: Request) => Promise<string | null>; rpc: BookingRpc; senderReady: () => Promise<boolean>; seal: (key: string, spot: string, creationRequest: string) => string };
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string, unknown = false) => Response.json({ error, outcome: unknown ? "unknown" : "rejected" }, { status, headers });
export async function handleMailReissue(request: Request, d: MailReissueDependencies | null): Promise<Response> {
  if (request.method !== "POST") return fail(405, "bad_request");
  if (!d) return fail(503, "mail_unavailable");
  if (new URL(request.url).search || request.headers.get("origin") !== d.origin || request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "bad_request");
  if (request.headers.has("content-encoding") || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return fail(415, "bad_request");
  let r: ReturnType<typeof parseMailReissueRequest>;
  try { r = parseMailReissueRequest(await boundedJson(request, 4096, 5000)); } catch { return fail(400, "bad_request"); }
  let writing = false;
  try {
    const actor = await d.actor(request);
    if (!actor) return fail(401, "authentication_required");
    const args = { p_actor: guestUuid(actor), p_spot_id: r.spotId, p_reservation_id: r.reservationId, p_request_id: r.requestId, p_expected_revision: r.revision, p_contact_hash: r.contactHash };
    const quota = record(await d.rpc("backyrd_consume_launch_cost_boundary_v1", { p_operation: "booking_mail_reissue", p_subject_key: actor, p_subject_minute_limit: 10, p_subject_day_limit: 100, p_global_minute_limit: 120, p_global_day_limit: 2000 }));
    if (typeof quota.allowed !== "boolean") return fail(503, "mail_unavailable");
    if (!quota.allowed) return fail(429, "rate_limited");
    // Recovery and replay work independently of current sender/key readiness.
    const prior = await d.rpc("booking_mail_reissue_recover_v1", args);
    if (prior !== null) return Response.json({ data: parseMailReissueResult(prior, r) }, { headers });
    if (r.operation === "recover") return Response.json({ data: null }, { headers });
    const context = record(await d.rpc("booking_mail_reissue_context_v1", { p_actor: args.p_actor, p_spot_id: r.spotId, p_reservation_id: r.reservationId, p_expected_revision: r.revision, p_contact_hash: r.contactHash }));
    if (context.reservation_id !== r.reservationId || context.revision !== r.revision) throw new Error("mail_context_mismatch");
    const email = mailEmail(context.email);
    if (createHash("sha256").update(email, "utf8").digest("hex") !== r.contactHash) throw new Error("mail_context_mismatch");
    const creationRequest = guestUuid(context.creation_request_id);
    if (!await d.senderReady()) return fail(503, "sender_unavailable");
    const key = randomBytes(32).toString("base64url"), sealed = d.seal(key, r.spotId, creationRequest);
    writing = true;
    const result = await d.rpc("booking_mail_reissue_v1", { ...args, p_key_hash: hashGuestKey(key), p_sealed_key: sealed });
    return Response.json({ data: parseMailReissueResult(result, r) }, { headers });
  } catch (error) {
    if (error instanceof BookingRpcRejection) {
      if (error.databaseCode === "42501" || error.databaseMessage.startsWith("SAFETY_")) return fail(403, "access_denied");
      if (error.databaseCode === "40001") return fail(409, "changed");
      if (error.databaseMessage === "booking_request_reused") return fail(409, "request_reused");
      if (error.databaseMessage === "booking_mail_recipient_blocked") return fail(409, "recipient_blocked");
      if (error.databaseMessage === "booking_mail_legacy_review_required") return fail(409, "review_required");
      if (error.databaseMessage === "booking_mail_reissue_rate_limited") return fail(429, "rate_limited");
      if (error.databaseCode === "22023") return fail(400, "not_available");
    }
    return fail(503, writing ? "outcome_unknown" : "mail_unavailable", writing);
  }
}
