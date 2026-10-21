export type SpotHoursRow = { day_of_week: string | null; open_time: string | null; close_time: string | null };
export type SpotOpeningStatus = "open" | "closed" | "openingSoon" | "closingSoon" | "unknown";
const DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const SOON_WINDOW_MINUTES = 30;
function minutes(value: string | null) {
  if (!value || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 24 && minute >= 0 && minute < 60 && (hour !== 24 || minute === 0) ? hour * 60 + minute : null;
}
/** Presentation only: a window belongs to its opening day, including midnight carry-over. */
export function spotOpeningStatusNow(rows: SpotHoursRow[], now = new Date(), missingDayIsUnknown = false): SpotOpeningStatus {
  const today = DAYS[now.getDay()];
  const yesterday = DAYS[(now.getDay() + 6) % 7];
  const clock = now.getHours() * 60 + now.getMinutes();
  const todayRows = rows.filter(row => row.day_of_week === today);
  const validWindows: { start: number; end: number }[] = [];
  let malformed = false;
  for (const row of rows) {
    if (row.day_of_week !== today && row.day_of_week !== yesterday) continue;
    if (!row.open_time && !row.close_time) continue; // Explicitly closed.
    const start = minutes(row.open_time), close = minutes(row.close_time);
    if (start === null || close === null || start === 1440) { if (row.day_of_week === today) malformed = true; continue; }
    const offset = row.day_of_week === yesterday ? -1440 : 0;
    validWindows.push({ start: start + offset, end: close + offset + (close <= start ? 1440 : 0) });
  }
  // Merge overlapping/adjacent service windows before reporting a closing warning.
  const merged: { start: number; end: number }[] = [];
  for (const window of validWindows.sort((a,b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  const active = merged.find(window => clock >= window.start && clock < window.end);
  if (active) return active.end - clock <= SOON_WINDOW_MINUTES ? "closingSoon" : "open";
  if (merged.some(window => window.start > clock && window.start - clock <= SOON_WINDOW_MINUTES)) return "openingSoon";
  if (malformed || !todayRows.length && (missingDayIsUnknown || !rows.length)) return "unknown";
  return "closed";
}
export const SPOT_OPENING_STATUS_COPY: Record<SpotOpeningStatus, string> = {
  open: "Geöffnet", closed: "Geschlossen", openingSoon: "Öffnet bald", closingSoon: "Schließt bald", unknown: "Öffnungszeiten unbekannt",
};
