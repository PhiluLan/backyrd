import { guestUuid, record } from "./booking-guest-contract";
import { parseStaffMailResult } from "./booking-mail-reissue-contract";
export type MailSummaryIntent = { spotId: string; reservationId: string; requestId: string; revision: number; email: string };
export type MailSummaryRequest = MailSummaryIntent & { operation: "prepare" | "recover" };
export function parseMailSummaryRequest(value: unknown): MailSummaryRequest {
  const r = record(value), keys = ["operation", "spotId", "reservationId", "requestId", "revision", "email"];
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r,k)) || (r.operation !== "prepare" && r.operation !== "recover") || typeof r.revision !== "number" || !Number.isSafeInteger(r.revision) || r.revision<0 || typeof r.email !== "string" || r.email.length>254 || /[\u0000-\u001f\u007f]/u.test(r.email)) throw new Error("invalid_mail_summary");
  const email=r.email.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) throw new Error("invalid_mail_summary");
  return { operation: r.operation, spotId: guestUuid(r.spotId), reservationId: guestUuid(r.reservationId), requestId: guestUuid(r.requestId), revision: r.revision, email };
}
export function parseMailSummaryResult(value: unknown,intent: MailSummaryIntent) {
  return parseStaffMailResult(value,intent);
}
