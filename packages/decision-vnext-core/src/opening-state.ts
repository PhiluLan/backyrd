import type { PortKnowledgeEntry, WorldKnowledgeSnapshot } from "@backyrd/world-knowledge-core";
import { PHASE1_VERSIONS } from "./manifest.js";

export type OpeningStatus = "open" | "closed" | "unknown" | "not_authorized" | "expired" | "disputed";

export interface OpeningSourcePolicy {
  readonly version: string;
  readonly configured: boolean;
  readonly authorizedTrustStates: readonly ("REFERENCED" | "VERIFIED")[];
}

export const SYNTHETIC_OPENING_SOURCE_POLICY: OpeningSourcePolicy = Object.freeze({
  version: PHASE1_VERSIONS.openingSourcePolicy,
  configured: true,
  authorizedTrustStates: ["REFERENCED", "VERIFIED"] as const,
});

export interface OpeningStateEvaluation {
  readonly evaluatorVersion: typeof PHASE1_VERSIONS.openingState;
  readonly sourcePolicyVersion: string;
  readonly status: OpeningStatus;
  readonly basisEntryHashes: readonly string[];
  readonly limitations: readonly string[];
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

function authorized(entry: PortKnowledgeEntry | undefined, policy: OpeningSourcePolicy): boolean {
  return entry !== undefined && entry.freshness === "CURRENT" && entry.resolution === "KNOWN_VALUE" && policy.authorizedTrustStates.includes(entry.trust as "REFERENCED" | "VERIFIED");
}

const rows = <T>(entry: PortKnowledgeEntry | undefined): readonly T[] => Array.isArray(entry?.value) ? entry.value as readonly T[] : [];
const containsSameDay = (intervals: readonly Interval[], minute: number) => intervals.some((interval) => {
  const start = minutes(interval.start); const end = minutes(interval.end);
  return start < end ? start <= minute && minute < end : start > end && start <= minute;
});
const containsCarryOver = (intervals: readonly Interval[], minute: number) => intervals.some((interval) => minutes(interval.start) > minutes(interval.end) && minute < minutes(interval.end));

export function evaluateOpeningState(snapshot: WorldKnowledgeSnapshot, at: string, policy: OpeningSourcePolicy): OpeningStateEvaluation {
  const result = (status: OpeningStatus, basisEntryHashes: readonly string[] = [], limitations: readonly string[] = []): OpeningStateEvaluation => ({ evaluatorVersion: PHASE1_VERSIONS.openingState, sourcePolicyVersion: policy.version, status, basisEntryHashes: [...basisEntryHashes].sort(), limitations: [...limitations].sort() });
  const temporalConflict = snapshot.conflicts.some((conflict) => conflict.severity === "BLOCKING" && conflict.attributeKeys.some((key) => key === "hours.regular" || key === "hours.special" || key === "state.current"));
  if (temporalConflict) return result("disputed", [], ["blocking-temporal-conflict"]);
  if (!policy.configured) return result("not_authorized", [], ["opening-source-policy-not-configured"]);

  const globalStates = snapshot.currentStates.filter((entry) => entry.key === "state.current" && typeof entry.value === "object" && entry.value !== null && !Array.isArray(entry.value) && "scope" in entry.value && ["SPOT", "VENUE"].includes(String(entry.value.scope)));
  if (globalStates.length > 1) return result("disputed", globalStates.map((entry) => entry.entryHash), ["multiple-global-current-states"]);
  const current = globalStates[0];
  if (current) {
    if (!authorized(current, policy)) return result("not_authorized", [current.entryHash], ["current-state-not-authorized"]);
    const kind = String((current.value as { readonly kind?: string }).kind);
    if (kind === "OPEN") return result("open", [current.entryHash]);
    if (kind === "CLOSED" || kind === "TEMPORARILY_CLOSED") return result("closed", [current.entryHash]);
  }

  const regular = snapshot.operationalRules.find((entry) => entry.key === "hours.regular");
  const special = snapshot.operationalRules.find((entry) => entry.key === "hours.special");
  const temporalEntries = [regular, special].filter((entry): entry is PortKnowledgeEntry => entry !== undefined);
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
