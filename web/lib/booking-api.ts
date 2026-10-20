import { supabase } from "@/lib/supabase/client";

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "declined" | "no_show";
export type BookingSource = "phone" | "walk_in" | "email" | "operator";
export type BookingArea = { id: string; name: string; is_active: boolean };
export type BookingTable = { id: string; area_id: string; label: string; seats: number; is_active: boolean };
export type BookingService = { id: string; name: string; weekdays: number[]; opens_at: string; closes_at: string; interval_minutes: number; is_active: boolean };
export type BookingSetup = { duration_minutes: number; max_party_size: number; areas: BookingArea[]; tables: BookingTable[]; services: BookingService[] };
export type BookingReservation = {
  id: string; table_id: string; guest_name: string; guest_contact: string | null; note: string | null;
  party_size: number; starts_at: string; ends_at: string; status: BookingStatus; source: BookingSource;
};
export type BookingSnapshot = { settings: { revision: number; duration_minutes: number; max_party_size: number } | null; areas: BookingArea[]; tables: BookingTable[]; services: BookingService[]; reservations: BookingReservation[] };
export type BookingSlot = { service_id: string; table_id: string; starts_at: string; ends_at: string };

const statuses: BookingStatus[] = ["pending", "confirmed", "cancelled", "declined", "no_show"];
const sources: BookingSource[] = ["phone", "walk_in", "email", "operator"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new Error("Booking hat eine ungültige Antwort geliefert. Bitte erneut laden."); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== "string") return invalid(); return value; }
function nullable(value: unknown): string | null { return value == null ? null : string(value); }
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value)) return invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function uuid(value: unknown): string { const result = string(value); if (!uuidPattern.test(result)) return invalid(); return result; }
function timestamp(value: unknown): string { const result = string(value); if (!Number.isFinite(Date.parse(result))) return invalid(); return result; }
function array<T>(value: unknown, parse: (item: Record<string, unknown>) => T): T[] { if (!Array.isArray(value)) return invalid(); return value.map((item) => parse(record(item))); }
function enumeration<T extends string>(value: unknown, values: T[]): T { const result = string(value); if (!values.includes(result as T)) return invalid(); return result as T; }
function time(value: unknown): string { const result = string(value); if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(result)) return invalid(); return result.slice(0, 5); }

export function parseBookingSnapshot(value: unknown): BookingSnapshot {
  const row = record(value);
  const settings = row.settings == null ? null : record(row.settings);
  return {
    settings: settings ? { revision: integer(settings.revision), duration_minutes: integer(settings.duration_minutes), max_party_size: integer(settings.max_party_size) } : null,
    areas: array(row.areas, (a) => ({ id: uuid(a.id), name: string(a.name), is_active: boolean(a.is_active) })),
    tables: array(row.tables, (t) => ({ id: uuid(t.id), area_id: uuid(t.area_id), label: string(t.label), seats: integer(t.seats), is_active: boolean(t.is_active) })),
    services: array(row.services, (s) => {
      if (!Array.isArray(s.weekdays)) return invalid();
      const weekdays = s.weekdays.map(integer);
      if (!weekdays.length || weekdays.some((d) => d < 0 || d > 6)) return invalid();
      return { id: uuid(s.id), name: string(s.name), weekdays, opens_at: time(s.opens_at), closes_at: time(s.closes_at), interval_minutes: integer(s.interval_minutes), is_active: boolean(s.is_active) };
    }),
    reservations: array(row.reservations, (r) => ({ id: uuid(r.id), table_id: uuid(r.table_id), guest_name: string(r.guest_name), guest_contact: nullable(r.guest_contact), note: nullable(r.note), party_size: integer(r.party_size), starts_at: timestamp(r.starts_at), ends_at: timestamp(r.ends_at), status: enumeration(r.status, statuses), source: enumeration(r.source, sources) })),
  };
}

export async function readBookingConsole(spotId: string, date: string): Promise<BookingSnapshot> {
  const { data, error } = await supabase.rpc("booking_console_read_v1", { p_spot_id: spotId, p_date: date });
  if (error) throw error;
  return parseBookingSnapshot(data);
}
export async function saveBookingSetup(spotId: string, revision: number, setup: BookingSetup) {
  const { data, error } = await supabase.rpc("booking_console_save_setup_v1", { p_spot_id: spotId, p_revision: revision, p_setup: setup });
  if (error) throw error;
  return integer(data);
}
export async function readBookingSlots(spotId: string, date: string, partySize: number): Promise<BookingSlot[]> {
  const { data, error } = await supabase.rpc("booking_console_slots_v1", { p_spot_id: spotId, p_date: date, p_party_size: partySize });
  if (error) throw error;
  return array(data, (s) => ({ service_id: uuid(s.service_id), table_id: uuid(s.table_id), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at) }));
}
export type NewBooking = { requestId: string; slot: BookingSlot; partySize: number; name: string; contact: string; note: string; source: BookingSource; status: "pending" | "confirmed" };
export async function createBooking(spotId: string, booking: NewBooking) {
  const { data, error } = await supabase.rpc("booking_console_create_v1", {
    p_spot_id: spotId, p_request_id: booking.requestId, p_service_id: booking.slot.service_id, p_table_id: booking.slot.table_id,
    p_starts_at: booking.slot.starts_at, p_party_size: booking.partySize, p_guest_name: booking.name,
    p_guest_contact: booking.contact, p_note: booking.note, p_source: booking.source, p_status: booking.status,
  });
  if (error) throw error;
  return uuid(data);
}
export async function setBookingStatus(spotId: string, reservation: BookingReservation, nextStatus: BookingStatus) {
  const { error } = await supabase.rpc("booking_console_set_status_v1", { p_spot_id: spotId, p_reservation_id: reservation.id, p_expected_status: reservation.status, p_status: nextStatus });
  if (error) throw error;
}

const errorCopy: Record<string, string> = {
  booking_operator_required: "Für dieses Restaurant fehlt dir der Betreiberzugang.",
  booking_setup_changed_reload: "Die Einrichtung wurde inzwischen geändert. Bitte neu laden, bevor du speicherst.",
  booking_changed_reload: "Die Reservierung wurde inzwischen geändert. Bitte neu laden.",
  booking_slot_unavailable: "Dieser Tisch ist inzwischen belegt. Bitte freie Zeiten erneut prüfen.",
  booking_setup_required: "Bitte zuerst die Restaurant-Einrichtung speichern.",
  booking_table_has_larger_reservation: "Ein Tisch hat noch eine grössere Reservierung. Die Sitzplätze können deshalb nicht reduziert werden.",
  invalid_booking_status_transition: "Dieser Statuswechsel ist nicht möglich. Bitte neu laden.",
  invalid_booking_date_or_party: "Wähle ein Datum innerhalb der nächsten 365 Tage und eine passende Personenzahl.",
  booking_request_reused: "Diese Anfrage wurde mit anderen Angaben bereits erfasst. Bitte neu laden.",
};
export function bookingError(error: unknown): string {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof row.message === "string" ? row.message : "";
  if (errorCopy[message]) return errorCopy[message];
  if (row.code === "PGRST202" || row.code === "42P01") return "Die Booking Console ist auf diesem Backend noch nicht freigeschaltet. Bitte nach dem Backend-Release erneut versuchen.";
  if (row.code === "23505") return "Tischnamen müssen innerhalb deines Restaurants eindeutig sein.";
  if (row.code === "23514" || row.code === "23502" || row.code === "22023" || row.code === "22P02") return "Bitte prüfe die Angaben: Namen, Plätze, Wochentage und Servicezeiten müssen vollständig und gültig sein.";
  return "Booking konnte die Aktion nicht abschliessen. Bitte prüfe die Verbindung und versuche es erneut.";
}

export function restaurantDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function restaurantTime(value: string) { return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
