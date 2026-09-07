export type SpotHoursRow = {
  day_of_week: string | null;
  open_time: string | null;
  close_time: string | null;
};

export type SpotOpeningStatus = "open" | "closed" | "openingSoon" | "closingSoon" | "unknown";

const DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const SOON_WINDOW_MINUTES = 30;

function minutes(value: string | null) {
  if (!value) return null;
  const [hours, minutesPart] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutesPart)) return null;
  return hours * 60 + minutesPart;
}

/**
 * Presentation-only opening state. It never changes availability or ranking;
 * unknown data stays unknown rather than being presented as closed.
 */
export function spotOpeningStatusNow(rows: SpotHoursRow[], now = new Date()): SpotOpeningStatus {
  const today = DAYS[now.getDay()];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayRows = rows.filter((row) => row.day_of_week === today);

  if (!todayRows.length) return rows.length ? "closed" : "unknown";

  for (const row of todayRows) {
    const open = minutes(row.open_time);
    const close = minutes(row.close_time);
    if (open === null || close === null) continue;

    const overnight = close <= open;
    const isOpen = overnight ? nowMinutes >= open || nowMinutes < close : nowMinutes >= open && nowMinutes < close;
    if (isOpen) {
      const minutesUntilClose = overnight && nowMinutes >= open ? 24 * 60 - nowMinutes + close : close - nowMinutes;
      return minutesUntilClose <= SOON_WINDOW_MINUTES ? "closingSoon" : "open";
    }

    if (nowMinutes < open && open - nowMinutes <= SOON_WINDOW_MINUTES) return "openingSoon";
  }

  return "closed";
}

export const SPOT_OPENING_STATUS_COPY: Record<SpotOpeningStatus, string> = {
  open: "Geöffnet",
  closed: "Geschlossen",
  openingSoon: "Öffnet bald",
  closingSoon: "Schließt bald",
  unknown: "Öffnungszeiten unbekannt",
};
