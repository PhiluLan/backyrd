/** Exact anonymous booking surfaces; never exempt Console/Owner/team paths. */
export function isGuestBookingPath(path: string) {
  try { path = decodeURIComponent(path); } catch { return false; }
  return path === "/booking/manage" || /^\/booking\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path);
}
