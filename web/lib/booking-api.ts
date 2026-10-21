import { validTableLayout, type TableLayout } from "./booking-table-layout";
import { getOwnerSpots } from "./owner-api";
import { supabase } from "@/lib/supabase/client";

export type BookingStatus = "pending" | "confirmed" | "arrived" | "seated" | "completed" | "cancelled" | "declined" | "no_show";
export type BookingSource = "phone" | "walk_in" | "email" | "operator" | "website";
export type ConsoleBookingSource = Exclude<BookingSource, "website">;
export type BookingArea = { id: string; name: string; is_active: boolean };
export type BookingTable = { id: string; area_id: string; label: string; seats: number; is_active: boolean; layout?: TableLayout | null };
export type BookingService = { id: string; name: string; weekdays: number[]; opens_at: string; closes_at: string; interval_minutes: number; is_active: boolean; ends_next_day?: boolean };
export type BookingSetup = { duration_minutes: number; max_party_size: number; areas: BookingArea[]; tables: BookingTable[]; services: BookingService[] };
export type BookingReservation = {
  id: string; table_id: string; service_id: string; guest_name: string; guest_contact: string | null; note: string | null;
  party_size: number; starts_at: string; ends_at: string; status: BookingStatus; source: BookingSource;
  arrived_at?: string | null; seated_at?: string | null; completed_at?: string | null;
  revision?: number;
  is_walk_in?: boolean;
  table_ids?: string[]; combination_id?: string | null;
  allocation_starts_at?: string | null; allocation_ends_at?: string | null;
};
export type BookingSnapshot = { capabilities?: { service_lifecycle: boolean; reservation_amendments?: boolean; current_seating?: boolean; walk_ins?: boolean; table_layouts?: boolean; week_planning?: boolean; team_access?: boolean; reservation_history?: boolean; special_hours?: boolean; table_combinations?: boolean; seated_transfers?: boolean; guest_mail?: boolean; guest_link_reissue?: boolean; public_booking?: boolean }; access?: BookingAccess; operating_date?: string; settings: { revision: number; duration_minutes: number; max_party_size: number } | null; areas: BookingArea[]; tables: BookingTable[]; services: BookingService[]; reservations: BookingReservation[]; unclosed_visits?: BookingReservation[]; closures?: BookingClosure[]; special_hours?: BookingSpecialHours[]; combinations?: BookingCombination[]; archived_combination_count?: number };
export type BookingSlot = { service_id: string; table_id: string; starts_at: string; ends_at: string; table_ids?: string[]; combination_id?: string | null; allocation_label?: string };

const statuses: BookingStatus[] = ["pending", "confirmed", "arrived", "seated", "completed", "cancelled", "declined", "no_show"];
export function occupiesInventory(status: BookingStatus) { return status === "pending" || status === "confirmed" || status === "arrived" || status === "seated"; }
const sources: BookingSource[] = ["phone", "walk_in", "email", "operator", "website"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new Error("booking_invalid_response"); }
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
  const team = capabilities?.team_access == null ? false : boolean(capabilities.team_access);
  const transfers = capabilities?.seated_transfers == null ? false : boolean(capabilities.seated_transfers);
  const combinations = capabilities?.table_combinations == null ? false : boolean(capabilities.table_combinations);
  const specialHours = capabilities?.special_hours == null ? false : boolean(capabilities.special_hours);
  const planning = capabilities?.week_planning == null ? false : boolean(capabilities.week_planning);
  const layouts = capabilities?.table_layouts == null ? false : boolean(capabilities.table_layouts);
  const layout = (value: unknown) => { if (value === null || (value === undefined && !layouts)) return null; if (!validTableLayout(value)) return invalid(); return value; };
  const walkIns = capabilities?.walk_ins == null ? false : boolean(capabilities.walk_ins);
  const reservation = (r: Record<string, unknown>): BookingReservation => ({ id: uuid(r.id), table_id: uuid(r.table_id), service_id: uuid(r.service_id), guest_name: string(r.guest_name), guest_contact: nullable(r.guest_contact), note: nullable(r.note), party_size: integer(r.party_size), starts_at: timestamp(r.starts_at), ends_at: timestamp(r.ends_at), status: enumeration(r.status, statuses), source: enumeration(r.source, sources), arrived_at: r.arrived_at == null ? null : timestamp(r.arrived_at), seated_at: r.seated_at == null ? null : timestamp(r.seated_at), completed_at: r.completed_at == null ? null : timestamp(r.completed_at), revision: r.revision == null && !amendments ? 0 : integer(r.revision), is_walk_in: r.is_walk_in == null && !walkIns ? false : boolean(r.is_walk_in), ...(transfers ? parseTransferWindow(r) : {}), ...(combinations ? { table_ids: parseTableIds(r.table_ids, uuid(r.table_id)), combination_id: r.combination_id === null ? null : uuid(r.combination_id) } : {}) });
  return {
    capabilities: { service_lifecycle: capabilities == null ? false : boolean(capabilities.service_lifecycle), reservation_amendments: amendments, current_seating: seating, walk_ins: walkIns, table_layouts: layouts, week_planning: planning, team_access: team, reservation_history: capabilities?.reservation_history == null ? false : boolean(capabilities.reservation_history), special_hours: specialHours, table_combinations: combinations, seated_transfers: transfers, guest_mail: capabilities?.guest_mail == null ? false : boolean(capabilities.guest_mail), guest_link_reissue: capabilities?.guest_link_reissue == null ? false : boolean(capabilities.guest_link_reissue), public_booking: capabilities?.public_booking == null ? false : boolean(capabilities.public_booking) },
    access: team ? parseBookingAccess(row.access) : ownerBookingAccess,
    operating_date: row.operating_date == null && !seating ? undefined : calendarDate(row.operating_date),
    settings: settings ? { revision: integer(settings.revision), duration_minutes: integer(settings.duration_minutes), max_party_size: integer(settings.max_party_size) } : null,
    areas: array(row.areas, (a) => ({ id: uuid(a.id), name: string(a.name), is_active: boolean(a.is_active) })),
    tables: array(row.tables, (t) => ({ id: uuid(t.id), area_id: uuid(t.area_id), label: string(t.label), seats: integer(t.seats), is_active: boolean(t.is_active), layout: layout(t.layout) })),
    services: array(row.services, (s) => {
      if (!Array.isArray(s.weekdays)) return invalid();
      const weekdays = s.weekdays.map(integer);
      if (!weekdays.length || weekdays.some((d) => d < 0 || d > 6)) return invalid();
      return { id: uuid(s.id), name: string(s.name), weekdays, opens_at: time(s.opens_at), closes_at: endTime(s.closes_at), interval_minutes: integer(s.interval_minutes), is_active: boolean(s.is_active), ends_next_day: s.ends_next_day == null && !specialHours ? false : boolean(s.ends_next_day) };
    }),
    reservations: array(row.reservations, reservation),
    combinations: combinations ? array(row.combinations, parseCombination) : [],
    archived_combination_count: combinations ? count(row.archived_combination_count) : 0,
    special_hours: row.special_hours == null && !specialHours ? [] : array(row.special_hours, parseSpecialHours),
    closures: row.closures == null && !planning ? [] : array(row.closures, parseClosure),
    unclosed_visits: row.unclosed_visits == null && !seating ? [] : array(row.unclosed_visits, reservation),
  };
}

async function bookingRpcPayload(method: "booking_console_public_settings_v2" | "booking_console_save_public_settings_v2" | "booking_console_public_settings_recover_v1" | "booking_console_mail_v1" | "booking_console_transfer_choices_v1" | "booking_console_transfer_v1" | "booking_console_slots_v2" | "booking_console_create_v2" | "booking_console_amend_v2" | "booking_console_walk_in_v2" | "booking_console_walk_in_slots_v2" | "booking_console_save_combination_v1" | "booking_console_save_hours_v1" | "booking_console_history_v1" | "booking_console_read_v1" | "booking_console_week_v1" | "booking_console_save_closure_v1" | "booking_console_spots_v1" | "booking_console_access_v1" | "booking_console_team_v1" | "booking_console_invite_v1" | "booking_console_revoke_invite_v1" | "booking_console_member_v1" | "booking_console_invitation_v1", args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
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
export async function readBookingSlots(spotId: string, date: string, partySize: number, options?: { combinations: boolean; serviceId?: string; areaId?: string; time?: string }): Promise<BookingSlot[]> {
  if (options?.combinations) return array(await bookingRpcPayload("booking_console_slots_v2", { p_spot_id: spotId, p_date: date, p_party_size: partySize, p_service_id: options.serviceId || null, p_area_id: options.areaId || null, p_time: options.time || null }), parseAllocationSlot);
  const { data, error } = await supabase.rpc("booking_console_slots_v1", { p_spot_id: spotId, p_date: date, p_party_size: partySize });
  if (error) throw error;
  return array(data, (s) => ({ service_id: uuid(s.service_id), table_id: uuid(s.table_id), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at) }));
}
export type NewBooking = { requestId: string; slot: BookingSlot; partySize: number; name: string; contact: string; note: string; source: ConsoleBookingSource; status: "pending" | "confirmed" };
export async function createBooking(spotId: string, booking: NewBooking) {
  if (booking.slot.table_ids) {
    const row = record(await bookingRpcPayload("booking_console_create_v2", { p_spot_id: spotId, p_request_id: booking.requestId, p_service_id: booking.slot.service_id, p_table_id: booking.slot.table_id, p_table_ids: booking.slot.table_ids, p_combination_id: booking.slot.combination_id ?? null,
      p_starts_at: booking.slot.starts_at, p_duration_minutes: (Date.parse(booking.slot.ends_at) - Date.parse(booking.slot.starts_at)) / 60_000, p_party_size: booking.partySize, p_guest_name: booking.name, p_guest_contact: booking.contact, p_note: booking.note, p_source: booking.source, p_status: booking.status }));
    const saved = parseAllocationSlot(row);
    if (!sameAllocation(saved, booking.slot) || Date.parse(saved.starts_at) !== Date.parse(booking.slot.starts_at) || Date.parse(saved.ends_at) !== Date.parse(booking.slot.ends_at)) return invalid();
    return uuid(row.id);
  }
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

export async function readAmendmentSlots(spotId: string, reservationId: string, date: string, partySize: number, duration: number, combinations = false, serviceId?: string, preferredTime?: string): Promise<BookingSlot[]> {
  if (combinations) return array(await bookingRpcPayload("booking_console_slots_v2", { p_spot_id: spotId, p_reservation_id: reservationId, p_date: date, p_party_size: partySize, p_duration_minutes: duration, p_service_id: serviceId || null, p_time: preferredTime || null }), parseAllocationSlot);
  const { data, error } = await supabase.rpc("booking_console_amendment_slots_v1", {
    p_spot_id: spotId, p_reservation_id: reservationId, p_date: date, p_party_size: partySize, p_duration_minutes: duration,
  });
  if (error) throw error;
  return array(data, (s) => ({ service_id: uuid(s.service_id), table_id: uuid(s.table_id), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at) }));
}
export type BookingAmendment = { requestId: string; revision: number; reservationId: string; slot: BookingSlot; partySize: number; duration: number; name: string; contact: string; note: string };
export async function amendBooking(spotId: string, amendment: BookingAmendment) {
  if (amendment.slot.table_ids) return uuid(await bookingRpcPayload("booking_console_amend_v2", { p_spot_id: spotId, p_reservation_id: amendment.reservationId, p_request_id: amendment.requestId, p_expected_revision: amendment.revision, p_service_id: amendment.slot.service_id, p_table_id: amendment.slot.table_id, p_table_ids: amendment.slot.table_ids, p_combination_id: amendment.slot.combination_id ?? null,
    p_starts_at: amendment.slot.starts_at, p_duration_minutes: amendment.duration, p_party_size: amendment.partySize, p_guest_name: amendment.name, p_guest_contact: amendment.contact, p_note: amendment.note }));
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
export async function readWalkInSlots(spotId: string, partySize: number, duration: number, combinations = false): Promise<WalkInPreview> {
  const data = combinations ? await bookingRpcPayload("booking_console_walk_in_slots_v2", { p_spot_id: spotId, p_party_size: partySize, p_duration_minutes: duration }) : await (async () => { const response = await supabase.rpc("booking_console_walk_in_slots_v1", { p_spot_id: spotId, p_party_size: partySize, p_duration_minutes: duration }); if (response.error) throw response.error; return response.data; })();
  const row = record(data);
  const preview = { observedAt: timestamp(row.observed_at), services: array(row.services, (s) => ({ id: uuid(s.id), name: string(s.name) })), slots: array(row.slots, (s) => ({
    service_id: uuid(s.service_id), table_id: uuid(s.table_id), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at),
    ...(combinations ? parseAllocationSlot(s) : {}), table_label: string(s.table_label), seats: integer(s.seats), area_id: uuid(s.area_id), area_name: string(s.area_name), service_name: string(s.service_name),
  })) };
  if (preview.slots.some((slot) => !preview.services.some((service) => service.id === slot.service_id) || slot.seats < partySize || slot.seats > 30
    || Date.parse(slot.starts_at) !== Date.parse(preview.observedAt) || Date.parse(slot.ends_at) - Date.parse(slot.starts_at) !== duration * 60_000)) return invalid();
  return preview;
}
export type NewWalkIn = { tableIds?: string[]; combinationId?: string | null; requestId: string; serviceId: string; tableId: string; partySize: number; duration: number; name: string; contact: string; note: string };
export async function createWalkIn(spotId: string, walkIn: NewWalkIn): Promise<{ id: string; slot: BookingSlot }> {
  if (walkIn.tableIds) {
    const row = record(await bookingRpcPayload("booking_console_walk_in_v2", { p_spot_id: spotId, p_request_id: walkIn.requestId, p_service_id: walkIn.serviceId, p_table_id: walkIn.tableId, p_table_ids: walkIn.tableIds, p_combination_id: walkIn.combinationId ?? null, p_party_size: walkIn.partySize, p_duration_minutes: walkIn.duration, p_guest_name: walkIn.name, p_guest_contact: walkIn.contact, p_note: walkIn.note }));
    const slot = parseAllocationSlot(row);
    if (!sameAllocation(slot, { ...slot, service_id: walkIn.serviceId, table_id: walkIn.tableId, table_ids: walkIn.tableIds, combination_id: walkIn.combinationId ?? null }) || Date.parse(slot.ends_at) - Date.parse(slot.starts_at) !== walkIn.duration * 60_000) return invalid();
    return { id: uuid(row.id), slot };
  }
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
  invalid_booking_transfer_duration: "Wähle eine verbleibende Dauer zwischen 15 und 480 Minuten.",
  invalid_booking_transfer_request: "Prüfe die gewählten Tische und die verbleibende Dauer.",
  invalid_booking_combination: "Wähle zwei bis vier aktive Tische im selben Bereich und eine passende Gruppengrösse.",
  booking_combination_limit: "Es sind bereits 100 Kombinationen aktiv. Hebe eine nicht mehr benötigte Kombination auf.",
  booking_combination_configuration_invalid: "Passe zuerst die betroffenen aktiven Tischkombinationen an oder hebe sie auf.",
  booking_combination_reserved_resources: "Diese Tische sind gemeinsam reserviert oder belegt. Buche die betroffenen Gruppen zuerst um oder beende abgeschlossene Besuche.",
  booking_combination_requires_allocation_rpc: "Diese Gruppe nutzt mehrere Tische. Lade die aktuelle Console und ändere die vollständige Zuteilung.",
  booking_availability_scope_too_large: "Grenze die Auswahl mit einem Service, Bereich oder einer Uhrzeit ein und prüfe die Zeiten erneut.",
  booking_hours_not_running: "Der Service des Vortags ist nicht mehr geöffnet. Änderungen am Vortag sind nur für laufende oder jetzt wieder geöffnete Nachtservices möglich.",
  invalid_booking_hours: "Prüfe Datum, Beginn, Ende und Buchungsintervall. Nachtservices dürfen höchstens 24 Ortsstunden umfassen.",
  invalid_booking_hours_time: "Diese Ortszeit existiert am gewählten Tag nicht. Wähle eine andere Öffnungszeit.",
  booking_hours_has_reservations: "Die Änderung betrifft bestehende Reservierungen. Bestätige ausdrücklich, dass diese erhalten bleiben.",
  invalid_booking_setup: "Prüfe die Restaurant-Einrichtung und die Servicezeiten.",
  booking_invalid_response: "Booking hat eine ungültige Antwort geliefert. Bitte erneut laden.",
  invalid_booking_history_cursor: "Der Verlauf wurde inzwischen geändert. Lade den Verlauf erneut.",
  booking_team_backend_required: "Teamzugänge sind auf diesem Backend noch nicht vollständig verfügbar. Bitte nach der Freischaltung erneut versuchen.",
  invalid_booking_invitation: "Prüfe die E-Mail-Adresse und die gewählte Rolle.",
  booking_invitation_unavailable: "Die Einladung ist nicht verfügbar. Melde dich mit der bestätigten eingeladenen E-Mail-Adresse an oder fordere einen neuen Link beim Betreiber an.",
  booking_invitation_exists: "Für diese Adresse besteht bereits eine Einladung. Widerrufe den bisherigen Link, bevor du einen neuen erstellst.",
  booking_team_member_exists: "Diese Person hat bereits Zugang. Passe die Rolle im Team an.",
  booking_team_owner_has_access: "Du hast als Betreiber bereits vollständigen Zugang.",
  booking_team_member_revoked: "Dieser Zugang wurde entzogen. Eine neue Einladung ist erforderlich.",
  booking_team_member_not_found: "Der Teamzugang ist nicht mehr verfügbar. Lade den aktuellen Stand.",
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
    if (message.includes("booking_combination_active_members")) return "Diese Tischkombination ist bereits aktiv. Öffne den bestehenden Eintrag.";
    if (message.includes("booking_allocation_one_seated")) return errorCopy.booking_table_occupied;
    if (message.includes("booking_service_hours_active_date")) return "Für diesen Service und dieses Datum bestehen bereits Sonderzeiten. Öffne den vorhandenen Eintrag.";
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
  const offset = reference && restaurantOffset(value) !== restaurantOffset(reference) ? " (" + restaurantOffset(value) + ")" : "";
  const days = reference ? Math.round((Date.parse(restaurantDate(new Date(value)) + "T12:00:00Z") - Date.parse(restaurantDate(new Date(reference)) + "T12:00:00Z")) / 86_400_000) : 0;
  return label + offset + (days > 0 ? ` (+${days} ${days === 1 ? "Tag" : "Tage"})` : "");
}
export function bookingAtLocalTime(booking: Pick<BookingReservation, "starts_at" | "ends_at" | "allocation_starts_at" | "allocation_ends_at">, date: string, time: string) {
  if (!time) return true;
  const base = Date.parse(date + "T" + time + ":00Z");
  if (!Number.isFinite(base)) return false;
  // Both modern Zurich offsets are verified by a roundtrip; spring gaps match neither.
  return [base - 3_600_000, base - 7_200_000].some((instant) => restaurantDate(new Date(instant)) === date && restaurantTime(new Date(instant).toISOString()) === time && instant >= Date.parse(booking.allocation_starts_at ?? booking.starts_at) && instant < Date.parse(booking.allocation_ends_at ?? booking.ends_at));
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
export type BookingWeekDay = { date: string; active_reservations: number; active_guests: number; pending: number; completed: number; cancelled: number; no_show: number; closed: boolean; closures: BookingClosure[]; special_hours?: BookingSpecialHours[] };
export type BookingWeek = { start_date: string; revision: number; observed_at: string; days: BookingWeekDay[] };
export async function readBookingWeek(spotId: string, startDate: string, serviceId: string, areaId: string, signal?: AbortSignal, expectHours = false): Promise<BookingWeek> {
  const row = record(await bookingRpcPayload("booking_console_week_v1", { p_spot_id: spotId, p_start_date: startDate, p_service_id: serviceId || null, p_area_id: areaId || null }, signal));
  const days = array(row.days, (day): BookingWeekDay => ({ date: calendarDate(day.date), active_reservations: count(day.active_reservations), active_guests: count(day.active_guests), pending: count(day.pending), completed: count(day.completed), cancelled: count(day.cancelled), no_show: count(day.no_show), closed: boolean(day.closed), closures: array(day.closures, parseClosure), special_hours: day.special_hours == null && !expectHours ? [] : array(day.special_hours, parseSpecialHours) }));
  if (calendarDate(row.start_date) !== startDate || days.length !== 7 || days.some((day, index) => day.date !== shiftBookingDate(startDate, index) || day.pending > day.active_reservations || day.closures.some((closure) => closure.book_date !== day.date) || day.special_hours?.some((hours) => hours.book_date !== day.date))) return invalid();
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


export type BookingTeamRole = "viewer" | "host" | "manager";
export type BookingRole = BookingTeamRole | "owner";
export type BookingAccess = { role: BookingRole; can_write: boolean; can_manage: boolean; can_manage_team: boolean };
export const ownerBookingAccess: BookingAccess = { role: "owner", can_write: true, can_manage: true, can_manage_team: true };
function parseBookingAccess(value: unknown): BookingAccess {
  const row = record(value), role = enumeration(row.role, ["owner", "manager", "host", "viewer"] as BookingRole[]);
  const access = { role, can_write: boolean(row.can_write), can_manage: boolean(row.can_manage), can_manage_team: boolean(row.can_manage_team) };
  if (access.can_write !== (role !== "viewer") || access.can_manage !== ["owner", "manager"].includes(role) || access.can_manage_team !== (role === "owner")) return invalid();
  return access;
}
export type BookingSpot = { spot_id: string; name: string; city: string | null; access_role: BookingRole };
export async function readBookingSpots(): Promise<BookingSpot[]> {
  let value: unknown;
  try { value = await bookingRpcPayload("booking_console_spots_v1", {}); }
  catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "PGRST202") throw error;
    // Only the absent new RPC may use the canonical legacy Owner list.
    value = (await getOwnerSpots(100)).map((spot) => ({ ...spot, access_role: "owner" }));
  }
  return array(value, (row) => ({ spot_id: uuid(row.spot_id), name: string(row.name), city: nullable(row.city), access_role: enumeration(row.access_role, ["owner", "manager", "host", "viewer"] as BookingRole[]) }));
}
export async function readBookingAccess(spotId: string, signal?: AbortSignal) { return parseBookingAccess(await bookingRpcPayload("booking_console_access_v1", { p_spot_id: spotId }, signal)); }
export type BookingTeamMember = { user_id: string; email: string | null; role: BookingTeamRole; revision: number; revoked_at: string | null };
export type BookingInvitation = { id: string; email: string; role: BookingTeamRole; expires_at: string; accepted_at: string | null; revoked_at: string | null };
export type BookingTeam = { members: BookingTeamMember[]; invitations: BookingInvitation[] };
const teamRoles: BookingTeamRole[] = ["viewer", "host", "manager"];
export async function readBookingTeam(spotId: string, signal?: AbortSignal): Promise<BookingTeam> {
  const row = record(await bookingRpcPayload("booking_console_team_v1", { p_spot_id: spotId }, signal));
  return { members: array(row.members, (m) => ({ user_id: uuid(m.user_id), email: nullable(m.email), role: enumeration(m.role, teamRoles), revision: count(m.revision), revoked_at: m.revoked_at === null ? null : timestamp(m.revoked_at) })),
    invitations: array(row.invitations, (i) => ({ id: uuid(i.id), email: string(i.email), role: enumeration(i.role, teamRoles), expires_at: timestamp(i.expires_at), accepted_at: i.accepted_at === null ? null : timestamp(i.accepted_at), revoked_at: i.revoked_at === null ? null : timestamp(i.revoked_at) })) };
}
export type BookingInviteRequest = { id: string; email: string; role: BookingTeamRole; token: string };
export function newBookingInvite(email: string, role: BookingTeamRole): BookingInviteRequest { return { id: crypto.randomUUID(), email: email.trim().toLowerCase(), role, token: [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("") }; }
export async function inviteBookingMember(spotId: string, invite: BookingInviteRequest) {
  const row = record(await bookingRpcPayload("booking_console_invite_v1", { p_spot_id: spotId, p_request_id: invite.id, p_email: invite.email, p_role: invite.role, p_token: invite.token }));
  if (uuid(row.id) !== invite.id) return invalid(); return { id: invite.id, expires_at: timestamp(row.expires_at) };
}
export async function changeBookingMember(spotId: string, member: Pick<BookingTeamMember, "user_id" | "revision">, role: BookingTeamRole | null) { return count(await bookingRpcPayload("booking_console_member_v1", { p_spot_id: spotId, p_user_id: member.user_id, p_revision: member.revision, p_role: role })); }
export async function revokeBookingInvite(spotId: string, id: string) { await bookingRpcPayload("booking_console_revoke_invite_v1", { p_spot_id: spotId, p_id: id }); }
export type BookingInvitePreview = { spot_id: string; spot_name: string; role: BookingTeamRole; expires_at: string; accepted: boolean };
export async function inspectBookingInvite(token: string, accept: boolean): Promise<BookingInvitePreview> {
  const row = record(await bookingRpcPayload("booking_console_invitation_v1", { p_token: token, p_accept: accept }));
  const result = { spot_id: uuid(row.spot_id), spot_name: string(row.spot_name), role: enumeration(row.role, teamRoles), expires_at: timestamp(row.expires_at), accepted: boolean(row.accepted) };
  if (accept && !result.accepted) return invalid(); return result;
}

export type BookingHistoryState = {
  revision: number; status: BookingStatus; party_size: number; starts_at: string; ends_at: string;
  table_id: string; table_label: string; table_ids?: string[]; table_labels?: string[]; allocation_starts_at?: string | null; allocation_ends_at?: string | null; service_id: string; service_name: string;
  arrived_at: string | null; seated_at: string | null; completed_at: string | null;
};
export type BookingHistoryEvent = {
  id: string; at: string; action: string; actor_id: string | null; actor_is_you: boolean;
  details: { actor_role: BookingRole | "guest"; before: BookingHistoryState | null; after: BookingHistoryState; changed_fields: ("guest_name" | "guest_contact" | "note")[] } | null;
};
export type BookingHistory = { reservationId: string; revision: number; observedAt: string; events: BookingHistoryEvent[]; nextCursor: string | null };
function parseHistoryState(value: unknown): BookingHistoryState {
  const s = record(value);
  const result = { revision: integer(s.revision), status: enumeration(s.status, statuses), party_size: integer(s.party_size), starts_at: timestamp(s.starts_at), ends_at: timestamp(s.ends_at), table_id: uuid(s.table_id), table_label: string(s.table_label), service_id: uuid(s.service_id), service_name: string(s.service_name), arrived_at: s.arrived_at == null ? null : timestamp(s.arrived_at), seated_at: s.seated_at == null ? null : timestamp(s.seated_at), completed_at: s.completed_at == null ? null : timestamp(s.completed_at) };
  if (result.revision < 0 || result.party_size < 1 || result.party_size > 30 || Date.parse(result.ends_at) <= Date.parse(result.starts_at) || !result.table_label.trim() || [...result.table_label].length > 40 || !result.service_name.trim() || [...result.service_name].length > 80) return invalid();
  if (s.allocation_starts_at !== undefined || s.allocation_ends_at !== undefined) Object.assign(result, parseTransferWindow(s));
  if (s.table_ids != null) { const ids = parseTableIds(s.table_ids, result.table_id); if (!Array.isArray(s.table_labels) || s.table_labels.length !== ids.length) return invalid(); return { ...result, table_ids: ids, table_labels: s.table_labels.map(string) }; }
  return result;
}
export async function readBookingHistory(spotId: string, reservationId: string, beforeId: string | null, signal?: AbortSignal): Promise<BookingHistory> {
  const row = record(await bookingRpcPayload("booking_console_history_v1", { p_spot_id: spotId, p_reservation_id: reservationId, p_before_id: beforeId }, signal));
  const result: BookingHistory = { reservationId: uuid(row.reservation_id), revision: integer(row.revision), observedAt: timestamp(row.observed_at), nextCursor: row.next_cursor == null ? null : uuid(row.next_cursor), events: array(row.events, (e) => {
    let details: BookingHistoryEvent["details"] = null;
    if (e.details != null) {
      const d = record(e.details);
      if (d.schema !== "reservation_history_v1" || !Array.isArray(d.changed_fields)) return invalid();
      const changed = d.changed_fields.map((f) => enumeration<"guest_name" | "guest_contact" | "note">(f, ["guest_name", "guest_contact", "note"]));
      if (new Set(changed).size !== changed.length) return invalid();
      details = { actor_role: enumeration<BookingRole | "guest">(d.actor_role, ["owner", "manager", "host", "guest"]), before: d.before == null ? null : parseHistoryState(d.before), after: parseHistoryState(d.after), changed_fields: changed };
      if (details.before && details.after.revision !== details.before.revision + 1) return invalid();
    }
    const action = string(e.action);
    if (!action || action.length > 100) return invalid();
    return { id: uuid(e.id), at: timestamp(e.at), action, actor_id: e.actor_id == null ? null : uuid(e.actor_id), actor_is_you: boolean(e.actor_is_you), details };
  }) };
  if (result.reservationId !== reservationId || result.revision < 0 || result.events.length > 50 || new Set(result.events.map((e) => e.id)).size !== result.events.length || result.events.some((e) => e.details && e.details.after.revision > result.revision)
    || (result.nextCursor !== null && (result.events.length !== 50 || result.events.at(-1)?.id !== result.nextCursor || result.nextCursor === beforeId))) return invalid();
  return result;
}

export type BookingSpecialHours = { id: string; service_id: string; book_date: string; opens_at: string | null; closes_at: string | null; next_day: boolean; is_closed: boolean; interval_minutes: number; starts_at: string | null; ends_at: string | null; note: string | null };
function endTime(value: unknown) { return value === "24:00" || value === "24:00:00" ? "24:00" : time(value); }
function parseSpecialHours(row: Record<string, unknown>): BookingSpecialHours {
  const h = { id: uuid(row.id), service_id: uuid(row.service_id), book_date: calendarDate(row.book_date), opens_at: row.opens_at === null ? null : time(row.opens_at), closes_at: row.closes_at === null ? null : endTime(row.closes_at), next_day: boolean(row.next_day), is_closed: boolean(row.is_closed), interval_minutes: integer(row.interval_minutes), starts_at: row.starts_at === null ? null : timestamp(row.starts_at), ends_at: row.ends_at === null ? null : timestamp(row.ends_at), note: nullable(row.note) };
  if (h.interval_minutes < 15 || h.interval_minutes > 120 || (h.note && [...h.note].length > 160)) return invalid();
  if (h.is_closed) { if (h.opens_at !== null || h.closes_at !== null || h.starts_at !== null || h.ends_at !== null || h.next_day) return invalid(); }
  else if (!h.opens_at || !h.closes_at || !h.starts_at || !h.ends_at || Date.parse(h.ends_at) <= Date.parse(h.starts_at) || restaurantDate(new Date(h.starts_at)) !== h.book_date
    || restaurantDate(new Date(h.ends_at)) !== shiftBookingDate(h.book_date, h.next_day || h.closes_at === "24:00" ? 1 : 0)
    || (h.next_day ? h.closes_at > h.opens_at || h.closes_at === "24:00" : h.closes_at <= h.opens_at)) return invalid();
  return h;
}
export type BookingHoursChange = { id: string; serviceId: string; date: string; opensAt: string | null; closesAt: string | null; nextDay: boolean; closed: boolean; interval: number; note: string; keepExisting: boolean; archive: boolean };
export async function saveBookingHours(spotId: string, revision: number, change: BookingHoursChange) {
  const row = record(await bookingRpcPayload("booking_console_save_hours_v1", { p_spot_id: spotId, p_revision: revision, p_id: change.id, p_service_id: change.serviceId, p_date: change.date, p_opens_at: change.opensAt, p_closes_at: change.closesAt, p_next_day: change.nextDay, p_closed: change.closed, p_interval: change.interval, p_note: change.note, p_keep_existing: change.keepExisting, p_archive: change.archive }));
  return { revision: count(row.revision), existingReservations: count(row.existing_reservations) };
}

export type BookingCombination = { id: string; name: string; primary_table_id: string; table_ids: string[]; max_party_size: number; is_active: boolean; is_available: boolean };
function parseTableIds(value: unknown, primary: string) {
  if (!Array.isArray(value)) return invalid();
  const ids = value.map(uuid);
  if (ids.length < 1 || ids.length > 4 || new Set(ids).size !== ids.length || !ids.includes(primary)) return invalid();
  return ids;
}
function parseCombination(row: Record<string, unknown>): BookingCombination {
  const primary = uuid(row.primary_table_id), ids = parseTableIds(row.table_ids, primary), size = integer(row.max_party_size), name = string(row.name);
  if (ids.length < 2 || size < 1 || size > 30 || !name.trim() || [...name].length > 80) return invalid();
  return { id: uuid(row.id), name, primary_table_id: primary, table_ids: ids, max_party_size: size, is_active: boolean(row.is_active), is_available: boolean(row.is_available) };
}
function parseAllocationSlot(row: Record<string, unknown>): BookingSlot {
  const primary = uuid(row.table_id), ids = parseTableIds(row.table_ids, primary), combination = row.combination_id === null ? null : uuid(row.combination_id);
  const start = timestamp(row.starts_at), end = timestamp(row.ends_at);
  if (Date.parse(end) <= Date.parse(start) || (combination === null ? ids.length !== 1 : ids.length < 2)) return invalid();
  return { table_id: primary, table_ids: ids, combination_id: combination, service_id: uuid(row.service_id), starts_at: start, ends_at: end, ...(row.allocation_label == null ? {} : { allocation_label: string(row.allocation_label) }) };
}
type AllocationIdentity = Pick<BookingSlot, "table_id" | "table_ids" | "combination_id">;
function sameTableAllocation(a: AllocationIdentity, b: AllocationIdentity) { return a.table_id === b.table_id && (a.combination_id ?? null) === (b.combination_id ?? null) && JSON.stringify([...(a.table_ids ?? [a.table_id])].sort()) === JSON.stringify([...(b.table_ids ?? [b.table_id])].sort()); }
function sameAllocation(a: BookingSlot, b: BookingSlot) { return a.service_id === b.service_id && sameTableAllocation(a, b); }
export function bookingTableIds(item: { table_id: string; table_ids?: string[] }) { return item.table_ids ?? [item.table_id]; }
export function bookingAllocationLabel(item: { table_id: string; table_ids?: string[]; allocation_label?: string }, snapshot: Pick<BookingSnapshot, "tables">) { return item.allocation_label ?? bookingTableIds(item).map((id) => snapshot.tables.find((t) => t.id === id)?.label ?? "Tisch").join(" + "); }
export async function saveBookingCombination(spotId: string, revision: number, combination: Omit<BookingCombination, "is_available">) {
  return count(await bookingRpcPayload("booking_console_save_combination_v1", { p_spot_id: spotId, p_revision: revision, p_id: combination.id, p_name: combination.name, p_primary_table_id: combination.primary_table_id, p_table_ids: combination.table_ids, p_max_party_size: combination.max_party_size, p_active: combination.is_active }));
}

function parseTransferWindow(row: Record<string, unknown>): { allocation_starts_at: string | null; allocation_ends_at: string | null } {
  const start = row.allocation_starts_at === null ? null : timestamp(row.allocation_starts_at);
  const end = row.allocation_ends_at === null ? null : timestamp(row.allocation_ends_at);
  if ((start === null) !== (end === null) || (start !== null && end !== null && Date.parse(end) <= Date.parse(start))) return invalid();
  return { allocation_starts_at: start, allocation_ends_at: end };
}
export type TransferChoice = { table_id: string; table_ids: string[]; combination_id: string | null; allocation_label: string; area_id: string; seats: number };
export type TransferPreview = { reservation_id: string; revision: number; observed_at: string; ends_at: string; choices: TransferChoice[] };
export async function readTransferChoices(spotId: string, reservationId: string, duration: number): Promise<TransferPreview> {
  const row = record(await bookingRpcPayload("booking_console_transfer_choices_v1", { p_spot_id: spotId, p_reservation_id: reservationId, p_duration_minutes: duration }));
  const preview = { reservation_id: uuid(row.reservation_id), revision: count(row.revision), observed_at: timestamp(row.observed_at), ends_at: timestamp(row.ends_at), choices: array(row.choices, (r) => {
    const primary = uuid(r.table_id), ids = parseTableIds(r.table_ids, primary), group = r.combination_id === null ? null : uuid(r.combination_id), seats = integer(r.seats);
    if ((group === null ? ids.length !== 1 : ids.length < 2) || seats < 1 || seats > 30) return invalid();
    return { table_id: primary, table_ids: ids, combination_id: group, allocation_label: string(r.allocation_label), area_id: uuid(r.area_id), seats };
  }) };
  if (preview.reservation_id !== reservationId || Date.parse(preview.ends_at) - Date.parse(preview.observed_at) !== duration * 60_000) return invalid();
  return preview;
}
export type BookingTransfer = { requestId: string; reservationId: string; revision: number; duration: number; choice: TransferChoice };
export async function transferBooking(spotId: string, transfer: BookingTransfer) {
  const { choice } = transfer;
  const row = record(await bookingRpcPayload("booking_console_transfer_v1", { p_spot_id: spotId, p_reservation_id: transfer.reservationId, p_request_id: transfer.requestId, p_expected_revision: transfer.revision, p_duration_minutes: transfer.duration,
    p_table_id: choice.table_id, p_table_ids: choice.table_ids, p_combination_id: choice.combination_id }));
  const result = { id: uuid(row.id), revision: count(row.revision), ...parseTransferWindow(row) };
  const returned = { ...choice, table_id: uuid(row.table_id), table_ids: parseTableIds(row.table_ids, uuid(row.table_id)), combination_id: row.combination_id === null ? null : uuid(row.combination_id) };
  if (result.id !== transfer.reservationId || result.revision !== transfer.revision + 1 || !sameTableAllocation(returned, choice) || !result.allocation_starts_at || !result.allocation_ends_at || Date.parse(result.allocation_ends_at) - Date.parse(result.allocation_starts_at) !== transfer.duration * 60_000) return invalid();
  return result;
}


export type BookingMailState = "pending" | "leased" | "sending" | "accepted" | "delivered" | "bounced" | "complained" | "failed" | "suppressed" | "review_required";
export type BookingMailMessage = { id: string; revision: number; kind: "created" | "changed" | "cancelled"; state: BookingMailState; createdAt: string; updatedAt: string; attempts: number; prepared: boolean; firstAttemptAt: string | null; nextAttemptAt: string | null; superseded: boolean; delayed: boolean };
export type BookingMail = { reservationId: string; revision: number; observedAt: string; guestAccess: "none" | "active" | "revoked" | "expired"; deliveryBlocked: boolean; messages: BookingMailMessage[]; nextCursor: string | null };
export function parseBookingMail(value: unknown, reservationId: string, beforeId: string | null = null): BookingMail {
  const row = record(value);
  const result: BookingMail = { reservationId: uuid(row.reservation_id), revision: count(row.revision), observedAt: timestamp(row.observed_at), guestAccess: enumeration(row.guest_access, ["none", "active", "revoked", "expired"]), deliveryBlocked: boolean(row.delivery_blocked), nextCursor: row.next_cursor == null ? null : uuid(row.next_cursor), messages: array(row.messages, (m) => {
    const message: BookingMailMessage = { id: uuid(m.id), revision: count(m.revision), kind: enumeration(m.kind, ["created", "changed", "cancelled"]), state: enumeration(m.state, ["pending", "leased", "sending", "accepted", "delivered", "bounced", "complained", "failed", "suppressed", "review_required"]), createdAt: timestamp(m.created_at), updatedAt: timestamp(m.updated_at), attempts: count(m.attempts), prepared: boolean(m.prepared), firstAttemptAt: m.first_attempt_at == null ? null : timestamp(m.first_attempt_at), nextAttemptAt: m.next_attempt_at == null ? null : timestamp(m.next_attempt_at), superseded: boolean(m.superseded), delayed: boolean(m.delayed) };
    if (Date.parse(message.updatedAt) < Date.parse(message.createdAt) || (message.attempts === 0) !== (message.firstAttemptAt === null) || (message.firstAttemptAt !== null && !message.prepared) || (message.nextAttemptAt !== null) !== (message.state === "pending") || (message.delayed && message.state !== "accepted") || (["sending", "accepted", "delivered", "bounced", "complained"].includes(message.state) && message.firstAttemptAt === null)) return invalid();
    return message;
  }) };
  if (result.reservationId !== reservationId || result.messages.length > 50 || new Set(result.messages.map((m) => m.id)).size !== result.messages.length || result.messages.some((m) => m.revision > result.revision) || (result.nextCursor !== null && (result.messages.length !== 50 || result.messages.at(-1)?.id !== result.nextCursor || result.nextCursor === beforeId))) return invalid();
  return result;
}
export async function readBookingMail(spotId: string, reservationId: string, beforeId: string | null, signal?: AbortSignal): Promise<BookingMail> {
  return parseBookingMail(await bookingRpcPayload("booking_console_mail_v1", { p_spot_id: spotId, p_reservation_id: reservationId, p_before_id: beforeId }, signal), reservationId, beforeId);
}


export type BookingPublicSettings = { enabled: boolean; serviceIds: string[]; noticeMinutes: number; horizonDays: number; cancellationMinutes: number; confirmationStatus: "pending" | "confirmed"; privacyContact: string; guestNotice: string; policyRevision: number };
export type BookingPublicValues = Omit<BookingPublicSettings, "policyRevision">;
export type BookingPublicConfig = { actorId: string; revision: number; observedAt: string; settings: BookingPublicSettings | null };
function parsePublicValues(value: unknown): BookingPublicValues {
  const p = record(value);
  if (!Array.isArray(p.serviceIds)) return invalid();
  const settings: BookingPublicValues = { enabled: boolean(p.enabled), serviceIds: p.serviceIds.map(uuid), noticeMinutes: integer(p.noticeMinutes), horizonDays: integer(p.horizonDays), cancellationMinutes: integer(p.cancellationMinutes), confirmationStatus: enumeration(p.confirmationStatus, ["pending", "confirmed"]), privacyContact: string(p.privacyContact), guestNotice: string(p.guestNotice) };
  if (settings.serviceIds.length < 1 || settings.serviceIds.length > 30 || new Set(settings.serviceIds).size !== settings.serviceIds.length || settings.noticeMinutes < 15 || settings.noticeMinutes > 10080 || settings.horizonDays < 1 || settings.horizonDays > 365 || settings.cancellationMinutes < 0 || settings.cancellationMinutes > 10080 || settings.privacyContact.trim().length < 3 || settings.privacyContact.length > 254 || settings.guestNotice.length > 1000 || /[\u0000-\u001f\u007f]/u.test(settings.privacyContact) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(settings.guestNotice)) return invalid();
  return settings;
}
export function parseBookingPublicConfig(value: unknown, spotId: string): BookingPublicConfig {
  const r = record(value); let settings: BookingPublicSettings | null = null;
  if (r.settings !== null) {
    const p = record(r.settings);
    if (uuid(p.spot_id) !== spotId) return invalid();
    const policyRevision = count(p.revision); if (policyRevision < 1) return invalid();
    settings = { ...parsePublicValues({ enabled: p.enabled, serviceIds: p.service_ids, noticeMinutes: p.notice_minutes, horizonDays: p.horizon_days, cancellationMinutes: p.cancellation_minutes, confirmationStatus: p.confirmation_status, privacyContact: p.privacy_contact, guestNotice: p.guest_notice }), policyRevision };
  }
  return { actorId: uuid(r.actor_id), revision: count(r.restaurant_revision), observedAt: timestamp(r.observed_at), settings };
}
export async function readBookingPublicConfig(spotId: string, signal?: AbortSignal) { return parseBookingPublicConfig(await bookingRpcPayload("booking_console_public_settings_v2", { p_spot_id: spotId }, signal), spotId); }
export type BookingPublicIntent = { requestId: string; revision: number; settings: BookingPublicValues };
export type BookingPublicOutcome = { notCommitted: boolean; revision: number; policyRevision: number | null };
export async function saveBookingPublicConfig(spotId: string, intent: BookingPublicIntent, recover = false): Promise<BookingPublicOutcome | null> {
  const p = intent.settings;
  const value = await bookingRpcPayload(recover ? "booking_console_public_settings_recover_v1" : "booking_console_save_public_settings_v2", { p_spot_id: spotId, p_request_id: intent.requestId, p_revision: intent.revision, p_settings: { enabled: p.enabled, service_ids: p.serviceIds, notice_minutes: p.noticeMinutes, horizon_days: p.horizonDays, cancellation_minutes: p.cancellationMinutes, confirmation_status: p.confirmationStatus, privacy_contact: p.privacyContact, guest_notice: p.guestNotice } });
  if (value === null && recover) return null;
  const r = record(value), revision = count(r.restaurant_revision);
  if (r.not_committed === true) { if (revision <= intent.revision) return invalid(); return { notCommitted: true, revision, policyRevision: null }; }
  const policyRevision = count(r.policy_revision);
  if (revision < intent.revision || policyRevision < 1) return invalid();
  return { notCommitted: false, revision, policyRevision };
}
export function parseBookingPublicIntent(value: unknown): BookingPublicIntent {
  const r = record(value); return { requestId: uuid(r.requestId), revision: count(r.revision), settings: parsePublicValues(r.settings) };
}
