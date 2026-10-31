import { experienceBookingMode, hasAreaModule, hasOfferModule, librarianConcept, type ConsumptionRule, type ExperienceBookingMode, type ExperienceProfile, type ExperienceProperty, type ReservationRule } from "@backyrd/world-knowledge-core";
import { contentHash } from "./canonical.js";
import type { LibrarianFact } from "./product-luna-librarian.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import { librarianConditions, visitWeekday, type MatchTruth, type VisitWindow } from "./product-librarian-time.js";
import { librarianExternalConsumptionKind, librarianTerm } from "./product-librarian-language.js";

export const LIBRARIAN_KNOWLEDGE_POLICY = "backyrd.librarian-knowledge-policy@2" as const;
export type DomainEvidence = {
    readonly state: MatchTruth;
    readonly reason: string;
    readonly offerId: string | null;
    readonly areaId: string | null;
    readonly sourceKeys: readonly string[];
    readonly sourceHashes: readonly string[];
    readonly details: Readonly<Record<string, string | number | boolean | null>>;
};
type BookingObservation = { readonly mode: ExperienceBookingMode | null; readonly condition: MatchTruth; readonly sourceKey: string; readonly hash: string };
const authorized = (row: ProductWorldView["facts"][number], use: "PRICE" | "HARD_CONSTRAINTS") => row.trust === "VERIFIED" && row.freshness === "CURRENT" && row.resolution === "KNOWN_VALUE" && row.authorizedUseCases?.includes(use);
const dedupe = <T,>(values: readonly T[]): T[] => [...new Set(values)];
const minute = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

/** Bounded administrative rule grammar. Unknown qualifications stay unknown;
 * examples after a category heading never become unrestricted permission. */
function diningException(value: string): boolean {
    const normalized = librarianTerm(value).replace(/\.$/u, "");
    const [heading, ...rest] = normalized.split(":");
    if (!["nicht in den restaurationsbetrieben", "nicht in restaurants", "nicht in den restaurants", "nicht im restaurant", "nicht in gastronomiebereichen", "nicht in den gastronomiebereichen", "except in restaurants"].includes(heading!.trim())) return false;
    if (!rest.length) return true;
    if (rest.length !== 1 || /[;!?]|\b(?:nur|wenn|falls|sofern|ausser|außer|auch|nicht|uhr|ab|bis|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/u.test(rest[0]!)) return false;
    return rest[0]!.split(/,\s*|\s+und\s+/u).every(example => /^(?:cafeteria|café|cafe|bistro|selbstbedienungsrestaurant|restaurant)(?=\s|$)/u.test(example.trim()));
}

export function externalConsumptionEvidence(fact: LibrarianFact, world: ProductWorldView, profile: ExperienceProfile | null, visit: VisitWindow): readonly DomainEvidence[] | null {
    const kind = librarianExternalConsumptionKind(fact);
    if (!kind) return null;
    const key = kind === "FOOD" ? "rule.external_food" : "rule.external_drink";
    const concept = kind === "FOOD" ? "own_food" : "own_drinks";
    const defaults = [...world.operationalRules, ...world.facts].filter(row => row.key === key && authorized(row, "HARD_CONSTRAINTS"));
    const profileHash = world.facts.find(row => row.key === "experience.profile")?.entryHash;
    const forbidden = kind === "FOOD" ? ["eigene speisen nicht erlaubt", "eigenes essen nicht erlaubt", "eigenes essen verboten", "own_food_not_allowed"]
        : ["eigene getränke nicht erlaubt", "eigene getränke verboten", "own_drinks_not_allowed"];
    type Observation = { state: MatchTruth; reason: string; sourceKey: string; hash: string; exceptions: string };
    const scoped = (properties: readonly ExperienceProperty[]): Observation[] => properties.flatMap(property => {
        if (property.key !== "participation.permission") return [];
        const labelMatches = property.label !== null && librarianConcept(property.label) === concept;
        const value = typeof property.value === "string" ? librarianTerm(property.value) : null;
        const positive = value !== null && (librarianConcept(value) === concept || labelMatches && ["erlaubt", "allowed"].includes(value));
        const negative = value !== null && (forbidden.includes(value) || labelMatches && ["nicht erlaubt", "verboten", "not allowed"].includes(value));
        if (!labelMatches && !positive && !negative) return [];
        const condition = librarianConditions(property.conditions, visit);
        if (condition === "FAILED") return [];
        const state: MatchTruth = property.state !== "KNOWN" || condition !== "MET" || !positive && !negative ? "UNKNOWN" : negative ? "FAILED" : "MET";
        return [{ state, reason: state === "UNKNOWN" ? "EXTERNAL_CONSUMPTION_SCOPED_RULE_UNRESOLVED" : negative ? "EXTERNAL_CONSUMPTION_NOT_ALLOWED" : "EXTERNAL_CONSUMPTION_ALLOWED", sourceKey: property.key, hash: contentHash(property), exceptions: "" }];
    });
    const outcome = (offerId: string | null, areaId: string | null): DomainEvidence => {
        if (world.conflicts.some(conflict => conflict.attributeKeys.includes(key))) return {
            state: "UNKNOWN", reason: "EXTERNAL_CONSUMPTION_RULE_CONFLICT", offerId, areaId,
            sourceKeys: [key], sourceHashes: [world.snapshotHash], details: { policy: LIBRARIAN_KNOWLEDGE_POLICY, consumption: kind, suppliedByVenue: false },
        };
        const offer = profile?.offers.find(o => o.id === offerId), area = profile?.areas.find(a => a.id === areaId);
        const rows: Observation[] = defaults.map(row => {
            const rule = row.value as ConsumptionRule;
            const dining = !!(offer && hasOfferModule(offer.kind, "food") || area && (hasAreaModule(area.kind, "dining")
                || profile?.offers.some(o => o.areaIds.includes(area.id) && hasOfferModule(o.kind, "food"))));
            const scopeKnown = dining || !!area && area.kind !== "OTHER";
            const understood = rule.exceptions.every(diningException);
            const state: MatchTruth = rule.policy === "CONDITIONAL" || rule.exceptions.length > 0 && (!understood || !scopeKnown || rule.policy !== "ALLOWED") ? "UNKNOWN"
                : rule.policy === "NOT_ALLOWED" || rule.exceptions.length > 0 && dining ? "FAILED" : "MET";
            return {state, reason: state === "UNKNOWN" ? "EXTERNAL_CONSUMPTION_EXCEPTION_UNRESOLVED" : state === "FAILED" ? "EXTERNAL_CONSUMPTION_NOT_ALLOWED" : "EXTERNAL_CONSUMPTION_ALLOWED", sourceKey: row.key, hash: row.entryHash, exceptions: rule.exceptions.join(" ")};
        });
        const local = [...scoped(profile?.properties ?? []), ...scoped(offer?.properties ?? []), ...scoped(area?.properties ?? [])];
        const all = [...rows, ...local];
        const denied = all.some(r => r.state === "FAILED"), allowed = all.some(r => r.state === "MET"), unknown = all.some(r => r.state === "UNKNOWN");
        const conflict = denied && allowed && (rows.some(r => r.state === "FAILED") && local.some(r => r.state === "MET") || local.some(r => r.state === "FAILED") && local.some(r => r.state === "MET"));
        const state: MatchTruth = !all.length || unknown || conflict ? "UNKNOWN" : denied ? "FAILED" : "MET";
        const reason = !all.length ? "EXTERNAL_CONSUMPTION_RULE_NOT_RECORDED" : conflict ? "EXTERNAL_CONSUMPTION_RULE_CONFLICT" : unknown ? all.find(r => r.state === "UNKNOWN")!.reason : state === "FAILED" ? "EXTERNAL_CONSUMPTION_NOT_ALLOWED" : "EXTERNAL_CONSUMPTION_ALLOWED";
        return {state, reason, offerId, areaId, sourceKeys: dedupe(all.map(r => r.sourceKey)), sourceHashes: dedupe([...all.map(r => r.hash), ...(local.length && profileHash ? [profileHash] : [])]),
            details: { policy: LIBRARIAN_KNOWLEDGE_POLICY, consumption: kind, exceptions: dedupe(all.map(r => r.exceptions).filter(Boolean)).join(" "), suppliedByVenue: false }};
    };
    return profile?.offers.length ? profile.offers.flatMap(offer => (offer.areaIds.length ? offer.areaIds : [null]).map(areaId => outcome(offer.id, areaId))) : [outcome(null, null)];
}

function reservationCondition(rule: ReservationRule, facts: readonly LibrarianFact[], visit: VisitWindow): MatchTruth {
    if (rule.days.length && (!visit.dates.length || visit.dates.some(day => !rule.days.includes((["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const)[visitWeekday(day) - 1]!)))) return "UNKNOWN";
    if ((rule.fromTime || rule.toTime) && (!visit.requested || visit.start < (rule.fromTime ? minute(rule.fromTime) : 0) || visit.end > (rule.toTime ? minute(rule.toTime) : 1440))) return "UNKNOWN";
    if (rule.minimumPartySize !== null) {
        const counts = facts.filter(f => f.key === "people.count" && f.modality === "REQUIRED" && f.value.kind === "COUNT" && f.value.operator === "EQ");
        if (counts.length !== 1 || counts[0]!.value.kind !== "COUNT" || counts[0]!.value.amount < rule.minimumPartySize) return "UNKNOWN";
    }
    return "MET";
}
function bookingProperties(properties: readonly ExperienceProperty[], visit: VisitWindow): BookingObservation[] {
    return properties.filter(p => ["participation.booking", "participation.entry_mode"].includes(p.key)).map(p => ({
        mode: p.state === "KNOWN" ? experienceBookingMode(p.value) : null,
        condition: librarianConditions(p.conditions, visit), sourceKey: p.key, hash: contentHash(p),
    })).filter(p => p.condition !== "FAILED");
}
function bookingOutcome(rows: readonly BookingObservation[], desired: "NOT_REQUIRED" | "REQUIRED", offerId: string | null, areaId: string | null): DomainEvidence {
    const common = { offerId, areaId, sourceKeys: dedupe(rows.map(r => r.sourceKey)), sourceHashes: rows.map(r => r.hash), details: { policy: LIBRARIAN_KNOWLEDGE_POLICY, guaranteesFreePlace: false } };
    if (!rows.length) return { ...common, state: "UNKNOWN", reason: "BOOKING_RULE_NOT_RECORDED" };
    if (rows.some(r => r.condition !== "MET")) return { ...common, state: "UNKNOWN", reason: "BOOKING_RULE_CONDITIONS_UNRESOLVED" };
    if (rows.some(r => r.mode === null)) return { ...common, state: "UNKNOWN", reason: "BOOKING_RULE_VALUE_NOT_UNDERSTOOD" };
    if (rows.some(r => r.mode === "CONDITIONAL")) return { ...common, state: "UNKNOWN", reason: "BOOKING_RULE_CONDITIONS_UNRESOLVED" };
    const required = rows.some(r => r.mode === "REQUIRED"), optional = rows.some(r => r.mode === "NOT_REQUIRED" || r.mode === "RECOMMENDED");
    if (required && optional) return { ...common, state: "UNKNOWN", reason: "BOOKING_RULE_CONFLICT" };
    const met = desired === "REQUIRED" ? required : !required;
    return { ...common, state: met ? "MET" : "FAILED", reason: required ? "BOOKING_OBLIGATION_CONFIRMED" : rows.some(r => r.mode === "RECOMMENDED") ? "BOOKING_RECOMMENDED_NOT_MANDATORY" : "BOOKING_NOT_MANDATORY", details: { ...common.details, reservationRequired: required, reservationRecommended: rows.some(r => r.mode === "RECOMMENDED") } };
}

/** A request for optional booking is not a prediction of spare seats. Specific
 * offer rules override broader defaults; simultaneous same-scope conflicts do not. */
export function bookingEvidence(fact: LibrarianFact, facts: readonly LibrarianFact[], world: ProductWorldView, profile: ExperienceProfile | null, visit: VisitWindow): readonly DomainEvidence[] | null {
    if (!["participation.booking", "participation.entry_mode"].includes(fact.key) || fact.value.kind !== "TEXT") return null;
    const mode = experienceBookingMode(fact.value.text);
    if (mode !== "NOT_REQUIRED" && mode !== "REQUIRED") return null;
    const defaultRows: BookingObservation[] = [...world.operationalRules, ...world.facts].filter(row => row.key === "rule.reservation" && authorized(row, "HARD_CONSTRAINTS")).map(row => {
        const rule = row.value as ReservationRule;
        return { mode: rule.mode, condition: reservationCondition(rule, facts, visit), sourceKey: row.key, hash: row.entryHash };
    });
    const profileHash = world.facts.find(row => row.key === "experience.profile")?.entryHash;
    const sourced = (properties: readonly ExperienceProperty[]) => bookingProperties(properties, visit);
    const outcome = (rows: readonly BookingObservation[], offerId: string | null, areaId: string | null) => {
        const result = bookingOutcome(rows, mode, offerId, areaId);
        return {...result, sourceHashes: dedupe([...result.sourceHashes, ...(profileHash && rows.some(row => row.sourceKey !== "rule.reservation") ? [profileHash] : [])])};
    };
    const spotRows = profile ? sourced(profile.properties) : [];
    const broader = spotRows.length ? spotRows : defaultRows;
    if (!profile?.offers.length) return [outcome(broader, null, null)];
    return profile.offers.flatMap(offer => (offer.areaIds.length ? offer.areaIds : [null]).map(areaId => {
        const offerRows = sourced(offer.properties);
        const areaRows = sourced(profile.areas.find(area => area.id === areaId)?.properties ?? []);
        return outcome(offerRows.length ? offerRows : areaRows.length ? areaRows : broader, offer.id, areaId);
    }));
}

export type QualitativePricePolicy = "CLARIFY" | "PRICE_LEVEL";
/** Product policy, distinct from the user's explicit monetary limit. No
 * amount, currency conversion or personal budget is manufactured here. */
export const QUALITATIVE_PRICE_POLICY: QualitativePricePolicy = "CLARIFY";
const priceLevels = ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "PREMIUM"] as const;
const priceWishes: Readonly<Record<string, number>> = {
    "günstig": 1, "guenstig": 1, "preiswert": 1, "cheap": 1, "inexpensive": 1, "low": 1,
    "nicht zu teuer": 2, "nicht teuer": 2, "bezahlbar": 2, "not too expensive": 2, "affordable": 2, "moderate": 2, "medium": 2,
};
export function qualitativePriceEvidence(fact: LibrarianFact, world: ProductWorldView, profile: ExperienceProfile | null, policy: QualitativePricePolicy = QUALITATIVE_PRICE_POLICY): readonly DomainEvidence[] | null {
    if (fact.key !== "budget.qualitative" || fact.value.kind !== "TEXT") return null;
    const maximum = priceWishes[librarianTerm(fact.value.text)];
    const rows = [...world.facts, ...world.operationalRules].filter(row => row.key === "operation.price_level" && authorized(row, "PRICE"));
    const make = (offerId: string | null): DomainEvidence => {
        const base = { offerId, areaId: null, sourceKeys: ["operation.price_level"], sourceHashes: rows.map(row => row.entryHash), details: { policy: LIBRARIAN_KNOWLEDGE_POLICY, qualitativePricePolicy: policy, monetaryBudgetInferred: false, evidenceScope: "SPOT" } };
        if (maximum === undefined) return { ...base, state: "UNKNOWN", reason: "QUALITATIVE_PRICE_MEANING_UNSUPPORTED" };
        if (policy === "CLARIFY") return { ...base, state: "UNKNOWN", reason: "QUALITATIVE_PRICE_POLICY_UNDEFINED" };
        if (rows.length !== 1 || typeof rows[0]!.value !== "string") return { ...base, state: "UNKNOWN", reason: rows.length > 1 ? "QUALITATIVE_PRICE_EVIDENCE_CONFLICT" : "QUALITATIVE_PRICE_EVIDENCE_MISSING" };
        const actual = priceLevels.indexOf(rows[0]!.value as typeof priceLevels[number]);
        return { ...base, state: actual < 0 ? "UNKNOWN" : actual <= maximum ? "MET" : "FAILED", reason: actual < 0 ? "QUALITATIVE_PRICE_VALUE_UNSUPPORTED" : "QUALITATIVE_PRICE_LEVEL_COMPARED", details: { ...base.details, actualLevel: rows[0]!.value, maximumLevel: priceLevels[maximum]! } };
    };
    return profile?.offers.length ? profile.offers.map(offer => make(offer.id)) : [make(null)];
}
