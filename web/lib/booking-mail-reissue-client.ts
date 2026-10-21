import { bookingMailActor, staffMailRequest } from "./booking-mail-staff-client";
export { BookingStaffMailError as MailReissueError } from "./booking-mail-staff-client";
import { parseMailReissueResult, type MailReissueIntent } from "./booking-mail-reissue-contract";
export { type MailReissueIntent } from "./booking-mail-reissue-contract";
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
export const mailReissueActor=bookingMailActor;
export async function mailContactHash(contact: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contact));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function reissueBookingMail(intent: MailReissueIntent, actorId: string, recover=false) {
  return staffMailRequest("reissue",intent,actorId,recover,value=>parseMailReissueResult(value,intent),copy);
}
