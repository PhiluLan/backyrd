import { ACCEPTED_SOURCE_POLICY, type ExperienceConditions, type ExperienceOffer } from "@backyrd/world-knowledge-core";
import { evaluateOpeningDay } from "./opening-state.js";
import type { LibrarianFact } from "./product-luna-librarian.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
export type MatchTruth = "MET" | "FAILED" | "UNKNOWN";
export type VisitWindow = {
    readonly dates: readonly string[];
    readonly start: number;
    readonly end: number;
    readonly exact: boolean;
    readonly requested: boolean;
    readonly complete: boolean;
    readonly timezone: string | null;
    readonly excludedMinutes: readonly number[];
};
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const visitWeekday = (day: string) => ((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
export function createLibrarianVisitWindow(facts: readonly LibrarianFact[], timezone: string | null): VisitWindow {
    const dates = facts.filter(f => f.modality !== "EXCLUDED" && f.modality !== "NOT_REQUIRED" && f.value.kind === "DATE");
    const equal = dates.filter(f => f.value.kind === "DATE" && f.value.operator === "EQ").map(f => f.value.kind === "DATE" ? f.value.date : "");
    let days = [...new Set(equal)];
    let complete = days.length === 1;
    if (!days.length) {
        const lower = dates.find(f => f.value.kind === "DATE" && ["GTE", "GT"].includes(f.value.operator)), upper = dates.find(f => f.value.kind === "DATE" && ["LTE", "LT"].includes(f.value.operator));
        if (lower?.value.kind === "DATE" && upper?.value.kind === "DATE") {
            const from = Date.parse(lower.value.date + "T12:00:00Z") + (lower.value.operator === "GT" ? 86400000 : 0), end = Date.parse(upper.value.date + "T12:00:00Z") - (upper.value.operator === "LT" ? 86400000 : 0);
            if (end >= from && (end - from) / 86400000 < 14) {
                for (let t = from; t <= end; t += 86400000)
                    days.push(new Date(t).toISOString().slice(0, 10));
                complete = true;
            }
        }
    }
    const excluded = facts.filter(f => f.modality === "EXCLUDED" && f.value.kind === "DATE" && f.value.operator === "EQ").map(f => f.value.kind === "DATE" ? f.value.date : "");
    days = days.filter(day => !excluded.includes(day));
    const phases = facts.filter(f => f.modality !== "EXCLUDED" && f.modality !== "NOT_REQUIRED" && f.value.kind === "DAY_PHASE");
    const phaseRange: Readonly<Record<string, readonly [
        number,
        number
    ]>> = { MORNING: [360, 720], MIDDAY: [660, 900], AFTERNOON: [720, 1080], EVENING: [1020, 1440], NIGHT: [0, 360] };
    let start = 0, end = 1440, exact = false;
    for (const fact of phases)
        if (fact.value.kind === "DAY_PHASE") {
            const range = phaseRange[fact.value.phase]!;
            if (fact.value.phase === "NIGHT")
                complete = false;
            start = Math.max(start, range[0]);
            end = Math.min(end, range[1]);
        }
    const clocks = facts.filter(f => f.modality !== "EXCLUDED" && f.modality !== "NOT_REQUIRED" && f.value.kind === "CLOCK");
    for (const fact of clocks)
        if (fact.value.kind === "CLOCK") {
            const n = minute(fact.value.time), op = fact.value.operator;
            if (fact.key === "time.clock_end") {
                if (op === "EQ" || op === "LTE" || op === "LT") {
                    end = Math.min(end, n + (op === "LT" ? -1 : 0));
                    if (op === "EQ")
                        exact = true;
                }
                else
                    complete = false;
            }
            else if (op === "EQ") {
                start = Math.max(start, n);
                if (fact.key === "time.clock")
                    end = Math.min(end, n + 1);
                exact = true;
            }
            else if (op === "GTE" || op === "GT")
                start = Math.max(start, n + (op === "GT" ? 1 : 0));
            else if (op === "LTE" || op === "LT")
                end = Math.min(end, n + (op === "LT" ? -1 : 0));
            else
                complete = false;
        }
    const weekdays = facts.filter(f => f.key === "time.weekday" && f.modality !== "NOT_REQUIRED");
    const weekdayNames: Readonly<Record<string, number>> = { montag: 1, monday: 1, dienstag: 2, tuesday: 2, mittwoch: 3, wednesday: 3, donnerstag: 4, thursday: 4, freitag: 5, friday: 5, samstag: 6, saturday: 6, sonntag: 7, sunday: 7 };
    for (const f of weekdays) {
        const n = f.value.kind === "TEXT" ? weekdayNames[f.value.text.trim().toLowerCase()] : undefined;
        if (n === undefined || !days.length)
            complete = false;
        else {
            days = days.filter(day => f.modality === "EXCLUDED" ? visitWeekday(day) !== n : visitWeekday(day) === n);
            if (!days.length)
                complete = false;
        }
    }
    const exclusions = facts.filter(f => f.modality === "EXCLUDED" && f.value.kind === "CLOCK");
    const excludedMinutes = exclusions.flatMap(f => f.value.kind === "CLOCK" && f.value.operator === "EQ" ? [minute(f.value.time)] : []);
    if (exclusions.some(f => f.value.kind !== "CLOCK" || f.value.operator !== "EQ") || facts.some(f => f.modality === "EXCLUDED" && f.value.kind === "DAY_PHASE"))
        complete = false;
    if (exact && end - start > 1 && excludedMinutes.some(n => start <= n && n < end))
        complete = false;
    const originalWithoutCalendar = facts.some(f => f.key === "time.original") && !dates.length && !phases.length && !clocks.length;
    if (originalWithoutCalendar)
        complete = false;
    const temporal = [...dates, ...phases, ...clocks, ...weekdays, ...exclusions];
    if (temporal.some(f => "timezone" in f.value && f.value.timezone !== timezone))
        complete = false;
    if (end <= start)
        complete = false;
    return { dates: days, start, end, exact, requested: temporal.length > 0 || originalWithoutCalendar, complete: (!temporal.length && !originalWithoutCalendar) || complete, timezone, excludedMinutes };
}
export function librarianConditions(conditions: ExperienceConditions, visit: VisitWindow, event: string | null = null): MatchTruth {
    if (conditions.event !== null && conditions.event !== event)
        return "UNKNOWN";
    if ((conditions.weekdays.length || conditions.validFrom || conditions.validUntil) && !visit.dates.length)
        return "UNKNOWN";
    if (visit.dates.length > 1)
        return "UNKNOWN";
    const day = visit.dates[0];
    if (day && ((conditions.validFrom && day < conditions.validFrom) || (conditions.validUntil && day > conditions.validUntil)))
        return "FAILED";
    if (day && conditions.weekdays.length && !conditions.weekdays.includes(visitWeekday(day)))
        return "FAILED";
    if (conditions.dayparts.length) {
        if (!visit.requested)
            return "UNKNOWN";
        const ranges: Readonly<Record<string, readonly [
            number,
            number
        ]>> = { MORNING: [360, 720], MIDDAY: [660, 900], AFTERNOON: [720, 1080], EVENING: [1020, 1440], NIGHT: [0, 360] };
        const fits = conditions.dayparts.some(phase => { const r = ranges[phase]!; return r[0] <= visit.start && visit.end <= r[1]; });
        if (!fits)
            return "UNKNOWN"; // overlap with only part of an imprecise phase proves nothing universal
    }
    return "MET";
}
export type LibrarianVenueAvailability = {
    readonly state: MatchTruth;
    readonly hashes: readonly string[];
    readonly reason: string;
    readonly intervals: readonly (readonly [
        number,
        number
    ])[];
};
/** Venue opening alone is not an offering schedule or booking guarantee. */
export function librarianVenueAvailability(world: ProductWorldView, visit: VisitWindow): LibrarianVenueAvailability {
    if (!visit.requested)
        return { intervals: [], state: "MET", hashes: [], reason: "NO_TIME_REQUIREMENT" };
    if (!visit.complete || visit.dates.length !== 1 || !world.spot.location.timezone)
        return { intervals: [], state: "UNKNOWN", hashes: [], reason: "VISIT_TIME_UNRESOLVED" };
    const day = visit.dates[0]!;
    const temporal = [...world.operationalRules, ...world.currentStates].filter(r => r.key.startsWith("hours.") || r.key === "state.current");
    if (temporal.some(r => !r.authorizedUseCases?.includes("OPENING_HOURS_ELIGIBILITY")))
        return { intervals: [], state: "UNKNOWN", hashes: [], reason: "OPENING_NOT_AUTHORIZED" };
    const venue = evaluateOpeningDay(world, day, { version: ACCEPTED_SOURCE_POLICY.policyVersion, configured: true, authorizedTrustStates: ["VERIFIED"] });
    if (venue.status === "closed")
        return { intervals: [], state: "FAILED", hashes: venue.basisEntryHashes, reason: "VENUE_CLOSED" };
    if (venue.status !== "open")
        return { intervals: [], state: "UNKNOWN", hashes: venue.basisEntryHashes, reason: "VENUE_HOURS_UNKNOWN" };
    const current = world.currentStates.find(r => r.key === "state.current");
    if (current && current.value && typeof current.value === "object" && !Array.isArray(current.value) && "scope" in current.value && "kind" in current.value) {
        const s = current.value as {
            readonly scope: string;
            readonly kind: string;
        };
        if (["VENUE", "SPOT"].includes(s.scope) && ["CLOSED", "TEMPORARILY_CLOSED", "AREA_CLOSED"].includes(s.kind)) {
            const sameStart = current.validFrom ? localDate(current.validFrom, visit.timezone!) : null, sameEnd = current.validUntil ? localDate(current.validUntil, visit.timezone!) : null;
            if ((sameStart === null || sameStart < day) && (sameEnd === null || day < sameEnd))
                return { intervals: [], state: "FAILED", hashes: [current.entryHash], reason: "VERIFIED_VENUE_CLOSURE" };
            if (sameStart === day || sameEnd === day)
                return { intervals: [], state: "UNKNOWN", hashes: [current.entryHash], reason: "CLOSURE_TIME_BOUNDARY_UNRESOLVED" };
        }
    }
    const intervals = venue.intervals.map(s => [minute(s.start), minute(s.end) <= minute(s.start) ? 1440 : minute(s.end)] as const);
    const compatible = intervals.some(([start, end]) => { const from = Math.max(start, visit.start), to = Math.min(end, visit.end); return visit.exact ? from <= visit.start && visit.end <= to && !visit.excludedMinutes.includes(visit.start) : from < to && to - from > visit.excludedMinutes.filter(n => from <= n && n < to).length; });
    return { intervals, state: compatible ? "MET" : "FAILED", hashes: venue.basisEntryHashes, reason: compatible ? "VENUE_OPEN_AT_REQUESTED_TIME" : "VENUE_NOT_OPEN_AT_REQUESTED_TIME" };
}
export function librarianOfferAvailability(offer: ExperienceOffer, world: ProductWorldView, visit: VisitWindow): {
    state: MatchTruth;
    hashes: readonly string[];
    reason: string;
} {
    if (!visit.requested)
        return { state: "MET", hashes: [], reason: "NO_TIME_REQUIREMENT" };
    const venue = librarianVenueAvailability(world, visit);
    if (venue.state !== "MET")
        return venue;
    const day = visit.dates[0]!;
    if (offer.validFrom && day < offer.validFrom || offer.validUntil && day > offer.validUntil)
        return { state: "FAILED", hashes: [], reason: "OFFER_OUTSIDE_VALIDITY" };
    const today = offer.schedule.filter(s => s.weekday === visitWeekday(day));
    if (!today.length)
        return { state: "UNKNOWN", hashes: venue.hashes, reason: "OFFER_WEEKDAY_UNKNOWN" };
    const intervals = today.map(s => [minute(s.start), minute(s.end) <= minute(s.start) ? 1440 : minute(s.end)] as const);
    const venueIntervals = venue.intervals;
    const compatible = intervals.some(o => venueIntervals.some(v => {
        const from = Math.max(o[0], v[0], visit.start), to = Math.min(o[1], v[1], visit.end);
        if (visit.exact)
            return from <= visit.start && visit.end <= to && !visit.excludedMinutes.includes(visit.start);
        return from < to && to - from > visit.excludedMinutes.filter(n => from <= n && n < to).length;
    }));
    return { state: compatible ? "MET" : "FAILED", hashes: venue.hashes, reason: compatible ? "OFFER_AND_VENUE_OPEN" : "OFFER_NOT_AVAILABLE_AT_REQUESTED_TIME" };
}
const localDate = (at: string, zone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
export const librarianLocalDate = localDate;
