import { parseAttributeValue, type SpecialHoursDay, type Weekday, type WeeklyScheduleDay } from "./contracts.js";
import { date as parseDate } from "./schema.js";

const UTC_WEEKDAYS: readonly Weekday[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export interface EffectiveHours {
  readonly date: string;
  readonly source: "SPECIAL" | "REGULAR" | "NONE";
  readonly status: "OPEN" | "CLOSED" | "UNKNOWN";
  readonly intervals: readonly { readonly start: string; readonly end: string }[];
}

export function effectiveVenueHours(date: string, regular: readonly WeeklyScheduleDay[] | null, special: readonly SpecialHoursDay[] | null): EffectiveHours;
export function effectiveVenueHours(dateValue: unknown, regularValue: unknown, specialValue: unknown): EffectiveHours {
  const date = parseDate(dateValue, "$.date");
  const regular = regularValue === null ? null : parseAttributeValue("hours.regular", regularValue, "$.regular") as readonly WeeklyScheduleDay[];
  const special = specialValue === null ? null : parseAttributeValue("hours.special", specialValue, "$.special") as readonly SpecialHoursDay[];
  const override = special?.find((entry) => entry.date === date);
  if (override) return { date, source: "SPECIAL", status: override.status, intervals: override.intervals };
  if (!regular) return { date, source: "NONE", status: "UNKNOWN", intervals: [] };
  const parsed = new Date(`${date}T12:00:00.000Z`); const day = UTC_WEEKDAYS[parsed.getUTCDay()]; const row = regular.find((entry) => entry.day === day);
  return row?.intervals.length ? { date, source: "REGULAR", status: "OPEN", intervals: row.intervals } : { date, source: "REGULAR", status: "CLOSED", intervals: [] };
}
