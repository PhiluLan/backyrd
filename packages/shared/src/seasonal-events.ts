/** Annual editions use the normal Event/Occurrence path. Never infer next year's dates. */
export type SeasonalPlace = {
  key: string;
  name: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  environment: "INDOOR" | "OUTDOOR" | "UNKNOWN";
  startDate: string;
  endDate: string;
  sourceUrl: string;
  description: string;
  hours: { weekdays: number[]; start: string; end: string }[];
  exceptions: { date: string; closed: boolean; start: string; end: string }[];
};
export type SeasonalEditionInput = {
  id: string;
  seriesKey: string;
  seriesName: string;
  year: number;
  title: string;
  description: string;
  city: string;
  organizer: string;
  sourceUrl: string;
  checkedAt: string;
  admissionNote: string;
  categories: string[];
  familyFriendly: boolean | null;
  activities: string[];
  places: SeasonalPlace[];
};
export type SeasonalEventFields = {
  series_id?: string | null;
  series_name?: string | null;
  edition_year?: number | null;
  edition_start_date?: string | null;
  edition_end_date?: string | null;
  admission_note?: string | null;
  place_environment?: "INDOOR" | "OUTDOOR" | "UNKNOWN" | null;
};
const day = (date: string) =>
  new Intl.DateTimeFormat("de-CH", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Zurich",
  }).format(new Date(`${date}T12:00:00Z`));
export function seasonalDateLabel(
  event: SeasonalEventFields,
  now = new Date(),
): string | null {
  if (!event.series_id || !event.edition_start_date || !event.edition_end_date)
    return null;
  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Zurich",
  }).format(now);
  if (today > event.edition_end_date) return `Beendet · ${event.edition_year}`;
  if (today >= event.edition_start_date)
    return `Bis ${day(event.edition_end_date)}`;
  return `Ab ${day(event.edition_start_date)}`;
}
/** One card per edition; ordinary concerts retain their individual dates. */
export function groupSeasonalEvents<
  T extends SeasonalEventFields & { event_id: string },
>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.series_id) return true;
    if (seen.has(row.event_id)) return false;
    seen.add(row.event_id);
    return true;
  });
}
/** Select a current/next day per actual venue; keep past venues visible in the archive. */
export function seasonalPlaceRows<
  T extends {
    venue_id: string | null;
    start_at: string;
    end_at: string | null;
  },
>(rows: readonly T[], now = new Date()): T[] {
  const chosen = new Map<string, T>();
  for (const row of [...rows].sort((a, b) =>
    a.start_at.localeCompare(b.start_at),
  )) {
    if (!row.venue_id) continue;
    const previous = chosen.get(row.venue_id);
    if (
      !previous ||
      Date.parse(previous.end_at ?? previous.start_at) < now.getTime()
    )
      chosen.set(row.venue_id, row);
  }
  return [...chosen.values()];
}
