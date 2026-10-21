import { bookingTableIds, occupiesInventory, restaurantDate, type BookingReservation, type BookingSnapshot } from "./booking-api";

export type ServiceOverrun = { reservation: BookingReservation; plannedEnd: string; next: BookingReservation | null };
export function serviceOverruns(snapshot: BookingSnapshot, selectedDate: string, now: number): ServiceOverrun[] {
  if (!Number.isFinite(now) || !snapshot.capabilities?.current_seating || !snapshot.capabilities.service_lifecycle
    || selectedDate !== snapshot.operating_date || restaurantDate(new Date(now)) !== snapshot.operating_date) return [];
  const result: ServiceOverrun[] = [];
  for (const reservation of snapshot.reservations) {
    if (reservation.status !== "seated" || restaurantDate(new Date(reservation.starts_at)) !== snapshot.operating_date) continue;
    const plannedEnd = reservation.allocation_ends_at ?? reservation.ends_at, end = Date.parse(plannedEnd);
    const seated = reservation.seated_at == null ? null : Date.parse(reservation.seated_at);
    const allocated = reservation.allocation_starts_at == null ? null : Date.parse(reservation.allocation_starts_at);
    if (!Number.isFinite(end) || end > now || (seated !== null && seated > now) || (allocated !== null && allocated > now)) continue;
    const ids = new Set(bookingTableIds(reservation));
    const next = snapshot.reservations.filter(other => other.id !== reservation.id && occupiesInventory(other.status)
      && Date.parse(other.allocation_starts_at ?? other.starts_at) >= end
      && bookingTableIds(other).some(id => ids.has(id)))
      .sort((a, b) => Date.parse(a.allocation_starts_at ?? a.starts_at) - Date.parse(b.allocation_starts_at ?? b.starts_at) || a.id.localeCompare(b.id))[0] ?? null;
    result.push({ reservation, plannedEnd, next });
  }
  return result.sort((a, b) => Date.parse(a.plannedEnd) - Date.parse(b.plannedEnd) || a.reservation.id.localeCompare(b.reservation.id));
}
export const serviceClock = (value: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(value));
