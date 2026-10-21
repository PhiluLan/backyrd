import { guestUuid, record } from "./booking-guest-contract";
export type MailReissueIntent = { spotId: string; reservationId: string; requestId: string; revision: number; contactHash: string };
export type MailReissueRequest = MailReissueIntent & { operation: "issue" | "recover" };
export type MailReissueResult = { id: string; revision: number; message_id: string; queued_at: string };
export function parseMailReissueRequest(value: unknown): MailReissueRequest {
  const r = record(value), keys = ["operation", "spotId", "reservationId", "requestId", "revision", "contactHash"];
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k)) || (r.operation !== "issue" && r.operation !== "recover") || typeof r.revision !== "number" || !Number.isSafeInteger(r.revision) || r.revision < 0 || typeof r.contactHash !== "string" || !/^[0-9a-f]{64}$/.test(r.contactHash)) throw new Error("invalid_mail_reissue");
  return { operation: r.operation, spotId: guestUuid(r.spotId), reservationId: guestUuid(r.reservationId), requestId: guestUuid(r.requestId), revision: r.revision, contactHash: r.contactHash };
}
export type MailReissueResolution = MailReissueResult | { not_committed: true; id: string; revision: number };
export function parseMailReissueResult(value: unknown, intent: MailReissueIntent): MailReissueResolution {
  const r = record(value);
  if (r.not_committed === true) {
    if (r.id !== intent.reservationId || typeof r.revision !== "number" || !Number.isSafeInteger(r.revision) || r.revision <= intent.revision) throw new Error("invalid_mail_reissue");
    return { not_committed: true, id: guestUuid(r.id), revision: r.revision };
  }
  if (r.id !== intent.reservationId || r.revision !== intent.revision + 1 || typeof r.queued_at !== "string" || !Number.isFinite(Date.parse(r.queued_at))) throw new Error("invalid_mail_reissue");
  return { id: guestUuid(r.id), revision: r.revision as number, message_id: guestUuid(r.message_id), queued_at: r.queued_at };
}
