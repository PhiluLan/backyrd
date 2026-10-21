import { guestKey, guestUuid, record } from "./booking-guest-contract";
export type GuestCredential = { reservationId: string; key: string; cancellation: { requestId: string; revision: number } | null };
const latest = "backyrd.booking.guest-link.v1";
const scoped = (id: string) => `${latest}:${guestUuid(id)}`;
function parse(raw: string | null): GuestCredential | null {
  if (!raw) return null;
  if (raw.length > 1000) throw new Error("invalid_guest_storage");
  const value = record(JSON.parse(raw));
  let cancellation: GuestCredential["cancellation"] = null;
  if (value.cancellation !== null) {
    const c = record(value.cancellation);
    if (typeof c.revision !== "number" || !Number.isSafeInteger(c.revision) || c.revision < 0) throw new Error("invalid_guest_storage");
    cancellation = { requestId: guestUuid(c.requestId), revision: c.revision };
  }
  return { reservationId: guestUuid(value.reservationId), key: guestKey(value.key), cancellation };
}
export function readGuestCredential(id?: string): GuestCredential | null {
  try {
    const own = id ? parse(sessionStorage.getItem(scoped(id))) : null;
    if (own && own.reservationId === id) return own;
    const previous = parse(sessionStorage.getItem(latest));
    if (id) return previous?.reservationId === id ? previous : null;
    if (!previous) return null;
    const saved = parse(sessionStorage.getItem(scoped(previous.reservationId)));
    return saved?.key === previous.key ? saved : previous;
  } catch { return null; }
}
export function storeGuestCredential(value: GuestCredential): boolean {
  try {
    const encoded = JSON.stringify(value), key = scoped(value.reservationId);
    sessionStorage.setItem(key, encoded);
    if (sessionStorage.getItem(key) !== encoded) return false;
    sessionStorage.setItem(latest, encoded);
    return sessionStorage.getItem(latest) === encoded;
  } catch { return false; }
}
export function clearLatestGuestCredential() { try { sessionStorage.removeItem(latest); } catch { /* No request is dispatched. */ } }
export function forgetGuestCredential(id: string): boolean {
  try {
    const key = scoped(id);
    sessionStorage.removeItem(key);
    let current: GuestCredential | null = null;
    try { current = parse(sessionStorage.getItem(latest)); } catch { sessionStorage.removeItem(latest); }
    if (current?.reservationId === id) sessionStorage.removeItem(latest);
    return sessionStorage.getItem(key) === null && parse(sessionStorage.getItem(latest))?.reservationId !== id;
  } catch { return false; }
}
