import type { ProductWorldView } from "./product-world-resolver-binding.js";

const OPENING_STATE_VERSION = "backyrd-vnext-opening-state-evaluator-v1" as const;
const SYNTHETIC_OPENING_POLICY_VERSION = "backyrd-vnext-synthetic-opening-source-policy-v1-unapproved" as const;

export type OpeningStatus = "open" | "closed" | "unknown" | "not_authorized" | "expired" | "disputed";

export interface OpeningSourcePolicy {
  readonly version: string;
  readonly configured: boolean;
  readonly authorizedTrustStates: readonly ("REFERENCED" | "VERIFIED")[];
}

export const SYNTHETIC_OPENING_SOURCE_POLICY: OpeningSourcePolicy = Object.freeze({
  version: SYNTHETIC_OPENING_POLICY_VERSION,
  configured: true,
  authorizedTrustStates: ["REFERENCED", "VERIFIED"] as const,
});

export interface OpeningStateEvaluation {
  readonly evaluatorVersion: typeof OPENING_STATE_VERSION;
  readonly sourcePolicyVersion: string;
  readonly status: OpeningStatus;
  readonly basisEntryHashes: readonly string[];
  readonly limitations: readonly string[];
}

export interface OpeningDayEvaluation extends OpeningStateEvaluation {
  readonly localDate: string;
  readonly weekday: string;
  readonly intervals: readonly Interval[];
}

type Interval = { readonly start: string; readonly end: string };
type WeeklyRow = { readonly day: string; readonly intervals: readonly Interval[] };
type SpecialRow = { readonly date: string; readonly status: "OPEN" | "CLOSED"; readonly intervals: readonly Interval[] };

const weekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
const minutes = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const previousDate = (value: string): string => {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
const weekdayForDate = (value: string): string => weekdays[new Date(`${value}T12:00:00.000Z`).getUTCDay()] ?? "SUNDAY";

function localClock(at: string, timeZone: string): { readonly date: string; readonly minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

type OpeningEntry = ProductWorldView["facts"][number];
function authorized(entry: OpeningEntry | undefined, policy: OpeningSourcePolicy): boolean {
  return entry !== undefined && entry.freshness === "CURRENT" && entry.resolution === "KNOWN_VALUE" && policy.authorizedTrustStates.includes(entry.trust as "REFERENCED" | "VERIFIED");
}

const rows = <T>(entry: OpeningEntry | undefined): readonly T[] => Array.isArray(entry?.value) ? entry.value as readonly T[] : [];
const containsSameDay = (intervals: readonly Interval[], minute: number) => intervals.some((interval) => {
  const start = minutes(interval.start); const end = minutes(interval.end);
  return start < end ? start <= minute && minute < end : start > end && start <= minute;
});
const containsCarryOver = (intervals: readonly Interval[], minute: number) => intervals.some((interval) => minutes(interval.start) > minutes(interval.end) && minute < minutes(interval.end));

export function evaluateOpeningState(snapshot: ProductWorldView, at: string, policy: OpeningSourcePolicy): OpeningStateEvaluation {
  const result = (status: OpeningStatus, basisEntryHashes: readonly string[] = [], limitations: readonly string[] = []): OpeningStateEvaluation => ({ evaluatorVersion: OPENING_STATE_VERSION, sourcePolicyVersion: policy.version, status, basisEntryHashes: [...basisEntryHashes].sort(), limitations: [...limitations].sort() });
  const temporalConflict = snapshot.conflicts.some((conflict) => conflict.severity === "BLOCKING" && conflict.attributeKeys.some((key) => key === "hours.regular" || key === "hours.special" || key === "state.current"));
  if (temporalConflict) return result("disputed", [], ["blocking-temporal-conflict"]);
  if (!policy.configured) return result("not_authorized", [], ["opening-source-policy-not-configured"]);

  const globalStates = snapshot.currentStates.filter((entry) => entry.key === "state.current" && typeof entry.value === "object" && entry.value !== null && !Array.isArray(entry.value) && "scope" in entry.value && ["SPOT", "VENUE"].includes(String(entry.value.scope)));
  if (globalStates.length > 1) return result("disputed", globalStates.map((entry) => entry.entryHash), ["multiple-global-current-states"]);
  const current = globalStates[0];
  if (current) {
    if (!authorized(current, policy)) return result("not_authorized", [current.entryHash], ["current-state-not-authorized"]);
    if (current.validFrom && Date.parse(at) < Date.parse(current.validFrom) || current.validUntil && Date.parse(at) >= Date.parse(current.validUntil)) return result("expired", [current.entryHash], ["current-state-outside-validity"]);
    const kind = String((current.value as { readonly kind?: string }).kind);
    if (kind === "OPEN") return result("open", [current.entryHash]);
    if (kind === "CLOSED" || kind === "TEMPORARILY_CLOSED" || kind === "AREA_CLOSED") return result("closed", [current.entryHash]);
  }

  const regular = snapshot.operationalRules.find((entry) => entry.key === "hours.regular");
  const special = snapshot.operationalRules.find((entry) => entry.key === "hours.special");
  const temporalEntries = [regular, special].filter((entry): entry is OpeningEntry => entry !== undefined);
  if (temporalEntries.some((entry) => !authorized(entry, policy))) return result("not_authorized", temporalEntries.map((entry) => entry.entryHash), ["opening-hours-not-authorized"]);
  if (!snapshot.spot.location.timezone) return result("unknown", temporalEntries.map((entry) => entry.entryHash), ["spot-timezone-unknown"]);
  if (!regular && !special) {
    if (snapshot.exclusions.some((entry) => entry.code === "ASSERTED_OPENING_HOURS")) return result("not_authorized", [], ["opening-hours-not-authorized"]);
    if (snapshot.exclusions.some((entry) => entry.code === "EXPIRED_CURRENT_STATES")) return result("expired", [], ["current-state-expired"]);
    return result("unknown", [], ["opening-hours-unknown"]);
  }

  const local = localClock(at, snapshot.spot.location.timezone);
  const priorDate = previousDate(local.date);
  const specialRows = rows<SpecialRow>(special);
  const todaySpecial = specialRows.find((entry) => entry.date === local.date);
  const priorSpecial = specialRows.find((entry) => entry.date === priorDate);
  if (todaySpecial) {
    if (todaySpecial.status === "CLOSED") return result("closed", [special!.entryHash]);
    return result(containsSameDay(todaySpecial.intervals, local.minute) || (priorSpecial?.status === "OPEN" && containsCarryOver(priorSpecial.intervals, local.minute)) ? "open" : "closed", [special!.entryHash]);
  }
  if (priorSpecial?.status === "OPEN" && containsCarryOver(priorSpecial.intervals, local.minute)) return result("open", [special!.entryHash]);

  const regularRows = rows<WeeklyRow>(regular);
  if (!regular) return result("unknown", [special!.entryHash], ["regular-hours-unknown"]);
  const today = regularRows.find((entry) => entry.day === weekdayForDate(local.date));
  const prior = regularRows.find((entry) => entry.day === weekdayForDate(priorDate));
  return result(containsSameDay(today?.intervals ?? [], local.minute) || containsCarryOver(prior?.intervals ?? [], local.minute) ? "open" : "closed", [regular.entryHash, ...(special ? [special.entryHash] : [])]);
}

/**
 * Evaluates whether a venue has at least one verified opening interval on the
 * requested local calendar day. This is deliberately different from
 * `evaluateOpeningState`: a day-only request must not claim that a venue is
 * open *now*, but it may prove that the venue opens at some point that day.
 */
export function evaluateOpeningDay(snapshot: ProductWorldView, localDate: string, policy: OpeningSourcePolicy): OpeningDayEvaluation {
  const weekday = weekdayForDate(localDate);
  const result = (status: OpeningStatus, intervals: readonly Interval[] = [], basisEntryHashes: readonly string[] = [], limitations: readonly string[] = []): OpeningDayEvaluation => ({
    evaluatorVersion: OPENING_STATE_VERSION,
    sourcePolicyVersion: policy.version,
    status,
    localDate,
    weekday,
    intervals: [...intervals],
    basisEntryHashes: [...basisEntryHashes].sort(),
    limitations: [...limitations].sort(),
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(Date.parse(`${localDate}T12:00:00.000Z`))) return result("unknown", [], [], ["requested-local-date-invalid"]);
  const temporalConflict = snapshot.conflicts.some((conflict) => conflict.severity === "BLOCKING" && conflict.attributeKeys.some((key) => key === "hours.regular" || key === "hours.special"));
  if (temporalConflict) return result("disputed", [], [], ["blocking-temporal-conflict"]);
  if (!policy.configured) return result("not_authorized", [], [], ["opening-source-policy-not-configured"]);

  const regular = snapshot.operationalRules.find((entry) => entry.key === "hours.regular");
  const special = snapshot.operationalRules.find((entry) => entry.key === "hours.special");
  const temporalEntries = [regular, special].filter((entry): entry is OpeningEntry => entry !== undefined);
  if (temporalEntries.some((entry) => !authorized(entry, policy))) return result("not_authorized", [], temporalEntries.map((entry) => entry.entryHash), ["opening-hours-not-authorized"]);
  if (!snapshot.spot.location.timezone) return result("unknown", [], temporalEntries.map((entry) => entry.entryHash), ["spot-timezone-unknown"]);
  if (!regular && !special) return result("unknown", [], [], ["opening-hours-unknown"]);

  const specialRows = rows<SpecialRow>(special);
  const exactSpecial = specialRows.find((entry) => entry.date === localDate);
  if (exactSpecial) {
    if (exactSpecial.status === "CLOSED") return result("closed", [], [special!.entryHash]);
    return result(exactSpecial.intervals.length ? "open" : "closed", exactSpecial.intervals, [special!.entryHash]);
  }

  if (!regular) return result("unknown", [], [special!.entryHash], ["regular-hours-unknown"]);
  const regularRows = rows<WeeklyRow>(regular);
  const priorDate = previousDate(localDate);
  const priorSpecial = specialRows.find((entry) => entry.date === priorDate);
  const priorRegular = regularRows.find((entry) => entry.day === weekdayForDate(priorDate));
  const priorIntervals = priorSpecial?.status === "OPEN" ? priorSpecial.intervals : priorSpecial?.status === "CLOSED" ? [] : priorRegular?.intervals ?? [];
  const carryOver = priorIntervals
    .filter((interval) => minutes(interval.start) > minutes(interval.end))
    .map((interval) => ({ start: "00:00", end: interval.end }));
  const today = regularRows.find((entry) => entry.day === weekday);
  if (!today && !carryOver.length) return result("unknown", [], [regular.entryHash, ...(special ? [special.entryHash] : [])], ["requested-weekday-unknown"]);
  const intervals = [...carryOver, ...(today?.intervals ?? [])];
  return result(intervals.length ? "open" : "closed", intervals, [regular.entryHash, ...(special ? [special.entryHash] : [])]);
}
