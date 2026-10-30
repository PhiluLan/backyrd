import { contentHash } from "./canonical.js";
import { ACCEPTED_SOURCE_POLICY, OFFER_CONCEPTS, type ExperienceConditions, type ExperienceOffer } from "@backyrd/world-knowledge-core";
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
    /** A generic daypart describes the experience, not a dated opening claim. */
    readonly undatedDayPhase: boolean;
    readonly timezone: string | null;
    readonly excludedMinutes: readonly number[];
    readonly expired?: boolean;
};
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const visitWeekday = (day: string) => ((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
export function createLibrarianVisitWindow(facts: readonly LibrarianFact[], timezone: string | null, now?: string): VisitWindow {
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
    const undatedDayPhase = phases.length > 0 && temporal.length === phases.length
        && !facts.some(f => f.modality === "EXCLUDED" && ["DAY_PHASE", "DATE"].includes(f.value.kind))
        && phases.every(f => f.value.kind === "DAY_PHASE" && f.value.timezone === timezone) && end > start;
    let expired = false;
    if (now && timezone && days.length === 1) {
        const today = librarianLocalDate(now, timezone);
        const parts = new Intl.DateTimeFormat("en-GB", {timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(now));
        const currentMinute = Number(parts.find(part => part.type === "hour")!.value) * 60 + Number(parts.find(part => part.type === "minute")!.value);
        expired = days[0]! < today || days[0] === today && (end <= currentMinute || exact && start < currentMinute);
        if (days[0] === today && !exact) start = Math.max(start, currentMinute);
    }
    return { dates: days, start, end, exact, requested: temporal.length > 0 || originalWithoutCalendar, complete: (!temporal.length && !originalWithoutCalendar) || complete, undatedDayPhase, timezone, excludedMinutes, ...(expired ? {expired} : {}) };
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
    if (visit.expired) return { intervals: [], state: "FAILED", hashes: [], reason: "VISIT_WINDOW_ELAPSED" };
    if (!visit.requested)
        return { intervals: [], state: "MET", hashes: [], reason: "NO_TIME_REQUIREMENT" };
    if (visit.undatedDayPhase)
        return { intervals: [], state: "MET", hashes: [], reason: "NO_CALENDAR_AVAILABILITY_CLAIM" };
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
    if (visit.undatedDayPhase) {
        // Respect a documented recurring restriction without inventing a day,
        // current opening or availability. No schedule means no calendar claim.
        const compatible = !offer.schedule.length || offer.schedule.some(slot => {
            const start = minute(slot.start), end = minute(slot.end);
            const intervals = end <= start ? [[start, 1440], [0, end]] as const : [[start, end]] as const;
            return intervals.some(([from, to]) => Math.max(from, visit.start) < Math.min(to, visit.end));
        });
        return { state: compatible ? "MET" : "FAILED", hashes: [], reason: compatible ? "UNDATED_OFFER_DAYPART_COMPATIBLE" : "OFFER_OUTSIDE_REQUESTED_DAYPART" };
    }
    const day = visit.dates[0];
    if (visit.complete && day && (offer.validFrom && day < offer.validFrom || offer.validUntil && day > offer.validUntil))
        return { state: "FAILED", hashes: [contentHash({ offerId: offer.id, validFrom: offer.validFrom, validUntil: offer.validUntil })], reason: "OFFER_OUTSIDE_VALIDITY" };
    const venue = librarianVenueAvailability(world, visit);
    if (venue.state !== "MET") return venue;
    if (!day) return { state: "UNKNOWN", hashes: venue.hashes, reason: "VISIT_DATE_UNKNOWN" };
    const today = offer.schedule.filter(s => s.weekday === visitWeekday(day));
    if (!today.length)
        return { state: "UNKNOWN", hashes: venue.hashes, reason: "OFFER_WEEKDAY_UNKNOWN" };
    const intervals = today.map(s => [minute(s.start), minute(s.end) <= minute(s.start) ? 1440 : minute(s.end)] as const);
    let venueIntervals = venue.intervals;
    let kitchenHashes: readonly string[] = [];
    if ((OFFER_CONCEPTS[offer.kind] ?? []).includes("meal")) {
        const kitchen = librarianKitchenAvailability(world, visit);
        if (kitchen.state !== "MET") return kitchen;
        kitchenHashes = kitchen.hashes;
        venueIntervals = venueIntervals.flatMap(v => kitchen.intervals.flatMap(k => {
            const from = Math.max(v[0], k[0]), to = Math.min(v[1], k[1]);
            return from < to ? [[from, to] as const] : [];
        }));
    }
    const compatible = intervals.some(o => venueIntervals.some(v => {
        const from = Math.max(o[0], v[0], visit.start), to = Math.min(o[1], v[1], visit.end);
        if (visit.exact)
            return from <= visit.start && visit.end <= to && !visit.excludedMinutes.includes(visit.start);
        return from < to && to - from > visit.excludedMinutes.filter(n => from <= n && n < to).length;
    }));
    return { state: compatible ? "MET" : "FAILED", hashes: [...new Set([...venue.hashes, ...kitchenHashes])], reason: compatible ? "OFFER_AND_VENUE_OPEN" : "OFFER_NOT_AVAILABLE_AT_REQUESTED_TIME" };
}

/** The venue, kitchen and offer schedule must overlap. Existing venue hours
 * are the Founder-defined fallback only when separate kitchen hours are absent. */
export function librarianKitchenAvailability(world: ProductWorldView, visit: VisitWindow): LibrarianVenueAvailability {
    const closure = world.currentStates.find(row => row.key === "state.current" && row.value && typeof row.value === "object" && "kind" in row.value && row.value.kind === "KITCHEN_CLOSED");
    if (closure && visit.requested && !visit.undatedDayPhase && visit.dates.length === 1) {
        const value = closure.value as {kind: string; scope: string};
        const day = visit.dates[0]!;
        const from = closure.validFrom ? librarianLocalDate(closure.validFrom, visit.timezone!) : null;
        const to = closure.validUntil ? librarianLocalDate(closure.validUntil, visit.timezone!) : null;
        if ((from === null || from <= day) && (to === null || day <= to)) {
            const authorized = closure.authorizedUseCases?.includes("OPENING_HOURS_ELIGIBILITY");
            const wholeDay = (from === null || from < day) && (to === null || day < to);
            return {state: authorized && wholeDay && ["VENUE", "SPOT"].includes(value.scope) ? "FAILED" : "UNKNOWN", hashes: [closure.entryHash], intervals: [], reason: !authorized ? "KITCHEN_CLOSURE_NOT_AUTHORIZED" : wholeDay && ["VENUE", "SPOT"].includes(value.scope) ? "VERIFIED_KITCHEN_CLOSURE" : "KITCHEN_CLOSURE_SCOPE_OR_TIME_UNRESOLVED"};
        }
    }
    const kitchen = world.operationalRules.filter(row => ["hours.kitchen", "hours.kitchen_special"].includes(row.key));
    if (world.conflicts.some(conflict => conflict.severity === "BLOCKING" && conflict.attributeKeys.some(key => ["hours.kitchen", "hours.kitchen_special"].includes(key)))) return {intervals: [], state: "UNKNOWN", hashes: kitchen.map(row => row.entryHash), reason: "KITCHEN_HOURS_CONFLICT"};
    if (world.explicitUnknowns.some(row => ["hours.kitchen", "hours.kitchen_special"].includes(row.key))) return {intervals: [], state: "UNKNOWN", hashes: [], reason: "KITCHEN_HOURS_EXPLICITLY_UNKNOWN"};
    if (!kitchen.length) return librarianVenueAvailability(world, visit);
    const kitchenWorld = { ...world, operationalRules: [...world.operationalRules.filter(row => !row.key.startsWith("hours.")), ...kitchen.map(row => ({ ...row, key: row.key === "hours.kitchen" ? "hours.regular" : "hours.special" }))] };
    const result = librarianVenueAvailability(kitchenWorld, visit);
    return { ...result, reason: result.state === "MET" ? "KITCHEN_OPEN_AT_REQUESTED_TIME" : result.state === "FAILED" ? "KITCHEN_CLOSED_AT_REQUESTED_TIME" : "KITCHEN_HOURS_UNKNOWN" };
}
const localDate = (at: string, zone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
export const librarianLocalDate = localDate;
