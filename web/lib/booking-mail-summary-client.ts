import { staffMailRequest } from "./booking-mail-staff-client";
import { parseMailSummaryResult, type MailSummaryIntent } from "./booking-mail-summary-contract";
export { bookingMailActor, BookingStaffMailError } from "./booking-mail-staff-client";
const copy: Record<string,string>={
  authentication_required:"Bitte melde dich erneut an.",access_denied:"Dein Booking-Zugang ist nicht mehr verfügbar.",
  changed:"Die Reservierung wurde inzwischen geändert. Lade den aktuellen Stand.",request_reused:"Diese Anfrage gehört zu einem anderen Auftrag. Prüfe den aktuellen Stand.",
  recipient_blocked:"Für diese Adresse liegt eine Zustellsperre vor. Es wird keine neue Nachricht vorbereitet.",rate_limited:"Zu viele Anfragen. Warte bitte kurz und prüfe denselben Auftrag erneut.",
  not_available:"Für diesen Buchungsstand kann gerade keine Nachricht vorbereitet werden.",sender_unavailable:"Der Buchungsversand ist noch nicht betriebsbereit. Dieser Versuch hat keine neue Nachricht vorbereitet.",mail_unavailable:"Die Vorbereitung ist gerade nicht verfügbar. Prüfe den Stand oder versuche es später erneut.",
};
export function prepareBookingSummary(intent:MailSummaryIntent,actorId:string,recover=false){
  return staffMailRequest("summary",intent,actorId,recover,value=>parseMailSummaryResult(value,intent),copy);
}
