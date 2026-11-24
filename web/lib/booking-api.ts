import { validTableLayout, type TableLayout } from "./booking-table-layout";
import { supabase } from "@/lib/supabase/client";

export type BookingStatus = "pending" | "confirmed" | "arrived" | "seated" | "completed" | "cancelled" | "declined" | "no_show";
export type BookingSource = "phone" | "walk_in" | "email" | "operator";
export type BookingArea = { id: string; name: string; is_active: boolean };
export type BookingTable = { id: string; area_id: string; label: string; seats: number; is_active: boolean; layout?: TableLayout | null };
export type BookingService = { id: string; name: string; weekdays: number[]; opens_at: string; closes_at: string; interval_minutes: number; is_active: boolean };
export type BookingSetup = { duration_minutes: number; max_party_size: number; areas: BookingArea[]; tables: BookingTable[]; services: BookingService[] };
export type BookingReservation = {
  id: string; table_id: string; service_id: string; guest_name: string; guest_contact: string | null; note: string | null;
  party_size: number; starts_at: string; ends_at: string; status: BookingStatus; source: BookingSource;
  arrived_at?: string | null; seated_at?: string | null; completed_at?: string | null;
  revision?: number;
  is_walk_in?: boolean;
};
export type BookingSnapshot = { capabilities?: { service_lifecycle: boolean; reservation_amendments?: boolean; current_seating?: boolean; walk_ins?: boolean; table_layouts?: boolean; week_planning?: boolean }; operating_date?: string; settings: { revision: number; duration_minutes: number; max_party_size: number } | null; areas: BookingArea[]; tables: BookingTable[]; services: BookingService[]; reservations: BookingReservation[]; unclosed_visits?: BookingReservation[]; closures?: BookingClosure[] };
export type BookingSlot = { service_id: string; table_id: string; starts_at: string; ends_at: string };

const statuses: BookingStatus[] = ["pending", "confirmed", "arrived", "seated", "completed", "cancelled", "declined", "no_show"];
export function occupiesInventory(status: BookingStatus) { return status === "pending" || status === "confirmed" || status === "arrived" || status === "seated"; }
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
function calendarDate(value: unknown): string { const result = string(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result + "T12:00:00Z")) || new Date(result + "T12:00:00Z").toISOString().slice(0, 10) !== result) return invalid(); return result; }
function array<T>(value: unknown, parse: (item: Record<string, unknown>) => T): T[] { if (!Array.isArray(value)) return invalid(); return value.map((item) => parse(record(item))); }
function enumeration<T extends string>(value: unknown, values: T[]): T { const result = string(value); if (!values.includes(result as T)) return invalid(); return result as T; }
function time(value: unknown): string { const result = string(value); if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(result)) return invalid(); return result.slice(0, 5); }

export function parseBookingSnapshot(value: unknown): BookingSnapshot {
  const row = record(value);
  const settings = row.settings == null ? null : record(row.settings);
  const capabilities = row.capabilities == null ? null : record(row.capabilities);
  const amendments = capabilities?.reservation_amendments == null ? false : boolean(capabilities.reservation_amendments);
  const seating = capabilities?.current_seating == null ? false : boolean(capabilities.current_seating);
  const planning = capabilities?.week_planning == null ? false : boolean(capabilities.week_planning);
  const layouts = capabilities?.table_layouts == null ? false : boolean(capabilities.table_layouts);
  const layout = (value: unknown) => { if (value === null || (value === undefined && !layouts)) return null; if (!validTableLayout(value)) return invalid(); return value; };
  const walkIns = capabilities?.walk_ins == null ? false : boolean(capabilities.walk_ins);
  const reservation = (r: Record<string, unknown>): BookingReservation => ({ id: uuid(r.id), table_id: uuid(r.table_id), service_id: uuid(r.service_id), guest_name: string(r.guest_name), guest_contact: nullable(r.guest_contact), note: nullable(r.note), party_size: integer(r.party_size), starts_at: timestamp(r.starts_at), ends_at: timestamp(r.ends_at), status: enumeration(r.status, statuses), source: enumeration(r.source, sources), arrived_at: r.arrived_at == null ? null : timestamp(r.arrived_at), seated_at: r.seated_at == null ? null : timestamp(r.seated_at), completed_at: r.completed_at == null ? null : timestamp(r.completed_at), revision: r.revision == null && !amendments ? 0 : integer(r.revision), is_walk_in: r.is_walk_in == null && !walkIns ? false : boolean(r.is_walk_in) });
  return {
    capabilities: { service_lifecycle: capabilities == null ? false : boolean(capabilities.service_lifecycle), reservation_amendments: amendments, current_seating: seating, walk_ins: walkIns, table_layouts: layouts, week_planning: planning },
    operating_date: row.operating_date == null && !seating ? undefined : calendarDate(row.operating_date),
    settings: settings ? { revision: integer(settings.revision), duration_minutes: integer(settings.duration_minutes), max_party_size: integer(settings.max_party_size) } : null,
    areas: array(row.areas, (a) => ({ id: uuid(a.id), name: string(a.name), is_active: boolean(a.is_active) })),
    tables: array(row.tables, (t) => ({ id: uuid(t.id), area_id: uuid(t.area_id), label: string(t.label), seats: integer(t.seats), is_active: boolean(t.is_active), layout: layout(t.layout) })),
    services: array(row.services, (s) => {
      if (!Array.isArray(s.weekdays)) return invalid();
      const weekdays = s.weekdays.map(integer);
      if (!weekdays.length || weekdays.some((d) => d < 0 || d > 6)) return invalid();
      return { id: uuid(s.id), name: string(s.name), weekdays, opens_at: time(s.opens_at), closes_at: time(s.closes_at), interval_minutes: integer(s.interval_minutes), is_active: boolean(s.is_active) };
    }),
    reservations: array(row.reservations, reservation),
    closures: row.closures == null && !planning ? [] : array(row.closures, parseClosure),
    unclosed_visits: row.unclosed_visits == null && !seating ? [] : array(row.unclosed_visits, reservation),
  };
}

async function bookingRpcPayload(method: "booking_console_read_v1" | "booking_console_week_v1" | "booking_console_save_closure_v1", args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => { controller.abort(); reject(new Error("Booking-Anfrage abgebrochen oder Zeitgrenze erreicht.")); }; });
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    // The explicit deadline also bounds an SDK auth refresh before fetch starts.
    const { data, error, status } = await Promise.race([supabase.rpc(method, args).abortSignal(controller.signal), cancelled]);
    if (error) throw { ...error, status };
    return data;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}
export async function readBookingConsole(spotId: string, date: string, signal?: AbortSignal): Promise<BookingSnapshot> {
  return parseBookingSnapshot(await bookingRpcPayload("booking_console_read_v1", { p_spot_id: spotId, p_date: date }, signal));
}
export function bookingReadDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  return row.status === 401 || row.status === 403 || ["42501", "PGRST301", "PGRST302"].includes(typeof row.code === "string" ? row.code : "")
    || (row.code === "P0001" && ["not_authenticated", "SAFETY_ACCOUNT_RESTRICTED", "SAFETY_WRITE_RESTRICTED", "SAFETY_POSTING_RESTRICTED", "SAFETY_COMMENTING_RESTRICTED", "SAFETY_MESSAGING_RESTRICTED", "SAFETY_OWNER_EDIT_RESTRICTED", "SAFETY_ACTION_RESTRICTED"].includes(typeof row.message === "string" ? row.message : ""));
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

export async function readAmendmentSlots(spotId: string, reservationId: string, date: string, partySize: number, duration: number): Promise<BookingSlot[]> {
  const { data, error } = await supabase.rpc("booking_console_amendment_slots_v1", {
    p_spot_id: spotId, p_reservation_id: reservationId, p_date: date, p_party_size: partySize, p_duration_minutes: duration,
  });
  if (error) throw error;
  return array(data, (s) => ({ service_id: uuid(s.service_id), table_id: uuid(s.table_id), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at) }));
}
export type BookingAmendment = { requestId: string; revision: number; reservationId: string; slot: BookingSlot; partySize: number; duration: number; name: string; contact: string; note: string };
export async function amendBooking(spotId: string, amendment: BookingAmendment) {
  const { data, error } = await supabase.rpc("booking_console_amend_v1", {
    p_spot_id: spotId, p_reservation_id: amendment.reservationId, p_request_id: amendment.requestId, p_expected_revision: amendment.revision,
    p_service_id: amendment.slot.service_id, p_table_id: amendment.slot.table_id, p_starts_at: amendment.slot.starts_at,
    p_duration_minutes: amendment.duration, p_party_size: amendment.partySize, p_guest_name: amendment.name,
    p_guest_contact: amendment.contact, p_note: amendment.note,
  });
  if (error) throw error;
  return uuid(data);
}

export type WalkInSlot = BookingSlot & { table_label: string; seats: number; area_id: string; area_name: string; service_name: string };
export type WalkInPreview = { observedAt: string; services: { id: string; name: string }[]; slots: WalkInSlot[] };
export async function readWalkInSlots(spotId: string, partySize: number, duration: number): Promise<WalkInPreview> {
  const { data, error } = await supabase.rpc("booking_console_walk_in_slots_v1", { p_spot_id: spotId, p_party_size: partySize, p_duration_minutes: duration });
  if (error) throw error;
  const row = record(data);
  const preview = { observedAt: timestamp(row.observed_at), services: array(row.services, (s) => ({ id: uuid(s.id), name: string(s.name) })), slots: array(row.slots, (s) => ({
    service_id: uuid(s.service_id), table_id: uuid(s.table_id), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at),
    table_label: string(s.table_label), seats: integer(s.seats), area_id: uuid(s.area_id), area_name: string(s.area_name), service_name: string(s.service_name),
  })) };
  if (preview.slots.some((slot) => !preview.services.some((service) => service.id === slot.service_id) || slot.seats < partySize || slot.seats > 30
    || Date.parse(slot.starts_at) !== Date.parse(preview.observedAt) || Date.parse(slot.ends_at) - Date.parse(slot.starts_at) !== duration * 60_000)) return invalid();
  return preview;
}
export type NewWalkIn = { requestId: string; serviceId: string; tableId: string; partySize: number; duration: number; name: string; contact: string; note: string };
export async function createWalkIn(spotId: string, walkIn: NewWalkIn): Promise<{ id: string; slot: BookingSlot }> {
  const { data, error } = await supabase.rpc("booking_console_walk_in_v1", {
    p_spot_id: spotId, p_request_id: walkIn.requestId, p_service_id: walkIn.serviceId, p_table_id: walkIn.tableId,
    p_party_size: walkIn.partySize, p_duration_minutes: walkIn.duration, p_guest_name: walkIn.name, p_guest_contact: walkIn.contact, p_note: walkIn.note,
  });
  if (error) throw error;
  const row = record(data);
  const result = { id: uuid(row.id), slot: { service_id: uuid(row.service_id), table_id: uuid(row.table_id), starts_at: timestamp(row.starts_at), ends_at: timestamp(row.ends_at) } };
  if (result.slot.service_id !== walkIn.serviceId || result.slot.table_id !== walkIn.tableId
    || Date.parse(result.slot.ends_at) - Date.parse(result.slot.starts_at) !== walkIn.duration * 60_000) return invalid();
  return result;
}

export function bookingWriteUncertain(error: unknown): boolean {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : {};
  // Only explicit transactional rejection codes establish a failed write.
  // Network/gateway errors and malformed success responses remain uncertain.
  return !["22023", "22P02", "23502", "23503", "23505", "23514", "23P01", "40001", "40P01", "42501", "42P01", "PGRST202", "PGRST301", "PGRST302"].includes(typeof row.code === "string" ? row.code : "");
}

const errorCopy: Record<string, string> = {
  invalid_booking_closure: "Prüfe Datum, Zeitfenster und die Angaben der Buchungssperre.",
  invalid_booking_closure_time: "Diese Ortszeit existiert am gewählten Tag nicht. Wähle ein anderes Zeitfenster.",
  booking_closure_has_reservations: "Die Sperre betrifft bestehende Reservierungen. Bestätige ausdrücklich, dass diese erhalten bleiben.",
  booking_operator_required: "Für dieses Restaurant fehlt dir der Betreiberzugang.",
  booking_setup_changed_reload: "Die Einrichtung wurde inzwischen geändert. Bitte neu laden, bevor du speicherst.",
  booking_changed_reload: "Die Reservierung wurde inzwischen geändert. Bitte neu laden.",
  booking_slot_unavailable: "Dieser Tisch ist inzwischen belegt. Bitte freie Zeiten erneut prüfen.",
  booking_setup_required: "Bitte zuerst die Restaurant-Einrichtung speichern.",
  booking_table_has_larger_reservation: "Ein Tisch hat noch eine grössere Reservierung. Die Sitzplätze können deshalb nicht reduziert werden.",
  invalid_booking_status_transition: "Dieser Statuswechsel ist nicht möglich. Bitte neu laden.",
  invalid_booking_date_or_party: "Wähle ein Datum innerhalb der nächsten 365 Tage und eine passende Personenzahl.",
  booking_request_reused: "Diese Anfrage wurde mit anderen Angaben bereits erfasst. Bitte neu laden.",
  booking_not_found: "Diese Reservierung ist nicht mehr verfügbar. Bitte neu laden.",
  invalid_booking_duration: "Wähle eine Dauer zwischen 30 und 480 Minuten.",
  invalid_booking_party_size: "Wähle eine passende Personenzahl für dein Restaurant.",
  booking_table_occupied: "An diesem Tisch ist noch ein Besuch als «Am Tisch» erfasst. Prüfe den laufenden Besuch, bevor du weitere Gäste platzierst.",
};
export function bookingError(error: unknown): string {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof row.message === "string" ? row.message : "";
  if (Object.prototype.hasOwnProperty.call(errorCopy, message)) return errorCopy[message];
  if (row.code === "PGRST202" || row.code === "42P01") return "Die Booking Console ist auf diesem Backend noch nicht freigeschaltet. Bitte nach dem Backend-Release erneut versuchen.";
  if (row.code === "23P01") return errorCopy.booking_slot_unavailable;
  if (row.code === "23505") {
    if (message.includes("booking_reservations_one_seated_per_table")) return errorCopy.booking_table_occupied;
    if (message.includes("booking_reservations_amend_request")) return errorCopy.booking_request_reused;
    if (message.includes("booking_table_active_label")) return "Tischnamen müssen innerhalb deines Restaurants eindeutig sein.";
    return "Dieser Vorgang wurde möglicherweise bereits gespeichert. Bitte lade den aktuellen Stand, bevor du es erneut versuchst.";
  }
  if (row.code === "23514" || row.code === "23502" || row.code === "22023" || row.code === "22P02") return "Bitte prüfe die Angaben: Namen, Plätze, Wochentage und Servicezeiten müssen vollständig und gültig sein.";
  return "Booking konnte die Aktion nicht abschliessen. Bitte prüfe die Verbindung und versuche es erneut.";
}

export function restaurantDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function restaurantOffset(value: string) { return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", timeZoneName: "shortOffset" }).formatToParts(new Date(value)).find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC"); }
export function restaurantTime(value: string, reference?: string) {
  const label = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return reference && restaurantOffset(value) !== restaurantOffset(reference) ? label + " (" + restaurantOffset(value) + ")" : label;
}
export function bookingAtLocalTime(booking: Pick<BookingReservation, "starts_at" | "ends_at">, date: string, time: string) {
  if (!time) return true;
  const base = Date.parse(date + "T" + time + ":00Z");
  if (!Number.isFinite(base)) return false;
  // Both modern Zurich offsets are verified by a roundtrip; spring gaps match neither.
  return [base - 3_600_000, base - 7_200_000].some((instant) => restaurantDate(new Date(instant)) === date && restaurantTime(new Date(instant).toISOString()) === time && instant >= Date.parse(booking.starts_at) && instant < Date.parse(booking.ends_at));
}

export async function saveBookingLayout(spotId: string, revision: number, entries: { table_id: string; area_id: string; layout: TableLayout | null }[]) {
  const { data, error } = await supabase.rpc("booking_console_save_layout_v1", { p_spot_id: spotId, p_revision: revision, p_entries: entries });
  if (error) throw error;
  return integer(data);
}


export type BookingClosure = { id: string; book_date: string; start_time: string | null; end_time: string | null; starts_at: string; ends_at: string; service_id: string | null; area_id: string | null; note: string | null; affected_reservations: number };
function count(value: unknown) { const result = integer(value); if (result < 0) return invalid(); return result; }
function parseClosure(row: Record<string, unknown>): BookingClosure {
  const start = timestamp(row.starts_at), end = timestamp(row.ends_at), date = calendarDate(row.book_date);
  const startTime = row.start_time === null ? null : time(row.start_time), endTime = row.end_time === null ? null : (row.end_time === "24:00:00" || row.end_time === "24:00" ? "24:00" : time(row.end_time));
  if ((startTime === null) !== (endTime === null) || Date.parse(end) <= Date.parse(start) || restaurantDate(new Date(start)) !== date) return invalid();
  return { id: uuid(row.id), book_date: date, start_time: startTime, end_time: endTime, starts_at: start, ends_at: end,
    service_id: row.service_id === null ? null : uuid(row.service_id), area_id: row.area_id === null ? null : uuid(row.area_id), note: nullable(row.note), affected_reservations: count(row.affected_reservations) };
}
export function shiftBookingDate(date: string, days: number) { const value = new Date(date + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function bookingWeekStart(date: string) { const weekday = new Date(date + "T12:00:00Z").getUTCDay(); return shiftBookingDate(date, -((weekday + 6) % 7)); }
export type BookingWeekDay = { date: string; active_reservations: number; active_guests: number; pending: number; completed: number; cancelled: number; no_show: number; closed: boolean; closures: BookingClosure[] };
export type BookingWeek = { start_date: string; revision: number; observed_at: string; days: BookingWeekDay[] };
export async function readBookingWeek(spotId: string, startDate: string, serviceId: string, areaId: string, signal?: AbortSignal): Promise<BookingWeek> {
  const row = record(await bookingRpcPayload("booking_console_week_v1", { p_spot_id: spotId, p_start_date: startDate, p_service_id: serviceId || null, p_area_id: areaId || null }, signal));
  const days = array(row.days, (day): BookingWeekDay => ({ date: calendarDate(day.date), active_reservations: count(day.active_reservations), active_guests: count(day.active_guests), pending: count(day.pending), completed: count(day.completed), cancelled: count(day.cancelled), no_show: count(day.no_show), closed: boolean(day.closed), closures: array(day.closures, parseClosure) }));
  if (calendarDate(row.start_date) !== startDate || days.length !== 7 || days.some((day, index) => day.date !== shiftBookingDate(startDate, index) || day.pending > day.active_reservations || day.closures.some((closure) => closure.book_date !== day.date))) return invalid();
  return { start_date: startDate, revision: count(row.revision), observed_at: timestamp(row.observed_at), days };
}
export type ClosureChange = { id: string; date: string; startTime: string | null; endTime: string | null; serviceId: string | null; areaId: string | null; note: string; keepExisting: boolean; remove: boolean };
export async function saveBookingClosure(spotId: string, revision: number, change: ClosureChange) {
  const data = await bookingRpcPayload("booking_console_save_closure_v1", { p_spot_id: spotId, p_revision: revision, p_id: change.id, p_date: change.date,
    p_start_time: change.startTime, p_end_time: change.endTime, p_service_id: change.serviceId, p_area_id: change.areaId, p_note: change.note, p_keep_existing: change.keepExisting, p_remove: change.remove });
  const row = record(data); return { revision: count(row.revision), existingReservations: count(row.existing_reservations) };
}
export function restaurantSlotTime(value: string, alternatives: string[]) {
  const label = restaurantTime(value);
  if (!alternatives.some((other) => other !== value && restaurantTime(other) === label && Date.parse(other) !== Date.parse(value))) return label;
  return label + " (" + restaurantOffset(value) + ")";
}
