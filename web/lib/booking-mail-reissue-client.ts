import { requireOwnerSession } from "./owner-api";
import { parseMailReissueResult, type MailReissueIntent } from "./booking-mail-reissue-contract";
export { type MailReissueIntent } from "./booking-mail-reissue-contract";
export class MailReissueError extends Error {
  constructor(message: string, readonly uncertain: boolean, readonly status = 0) { super(message); }
}
const copy: Record<string, string> = {
  access_denied: "Dein Booking-Zugang ist nicht mehr verfügbar.", authentication_required: "Bitte melde dich erneut an.",
  changed: "Die Reservierung oder Kontaktadresse wurde geändert. Lade den aktuellen Stand.", request_reused: "Diese Anfrage gehört zu einem anderen Auftrag. Prüfe den aktuellen Stand.",
  recipient_blocked: "Für diese Adresse liegt eine Zustellsperre vor. Es wird keine neue Nachricht vorbereitet.",
  review_required: "Ein früherer Versand benötigt eine manuelle Prüfung, bevor ein neuer Gastlink ausgestellt werden kann.",
  rate_limited: "Zu viele Anfragen. Bitte warte, bevor du denselben Auftrag erneut prüfst.",
  not_available: "Für diese Reservierung kann aktuell kein neuer Gastlink ausgestellt werden.",
  sender_unavailable: "Der Bestätigungsversand ist noch nicht betriebsbereit. Es wurde mit dieser Anfrage kein Gastlink ersetzt.",
  mail_unavailable: "Die Neuausstellung ist gerade nicht verfügbar. Prüfe den Stand oder versuche es später erneut.",
};
export async function mailReissueActor() { const session = await requireOwnerSession(); return session?.user.id ?? null; }
export async function mailContactHash(contact: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contact));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function reissueBookingMail(intent: MailReissueIntent, actorId: string, recover = false) {
  let dispatched = false;
  try {
    const session = await requireOwnerSession();
    if (!session || session.user.id !== actorId) throw new MailReissueError(copy.authentication_required, false, 401);
    dispatched = true;
    const response = await fetch("/api/booking/mail/reissue", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...intent, operation: recover ? "recover" : "issue" }) });
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_mail_reissue");
    const row = value as Record<string, unknown>;
    if (!response.ok) throw new MailReissueError(copy[typeof row.error === "string" ? row.error : ""] ?? "Der Auftragsstatus ist nicht bekannt.", row.outcome !== "rejected", response.status);
    if (recover && row.data === null) return null;
    return parseMailReissueResult(row.data, intent);
  } catch (failure) {
    if (failure instanceof MailReissueError) throw failure;
    throw new MailReissueError("Der Auftragsstatus konnte nicht sicher geprüft werden.", dispatched && !recover);
  }
}
