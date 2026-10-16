import type { LibrarianFact, LibrarianRequest } from "./product-luna-librarian.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import type { ExperienceProfile } from "@backyrd/world-knowledge-core";
import { librarianConditions, visitWeekday, type MatchTruth, type VisitWindow } from "./product-librarian-time.js";
export type LibrarianEligibility = {
    readonly state: MatchTruth;
    readonly reason: string;
    readonly hashes: readonly string[];
    readonly offerIds?: readonly string[];
};
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const range = (fact: LibrarianFact): readonly [
    number,
    number
] | null => {
    if (fact.value.kind !== "AGE" || fact.modality === "EXCLUDED")
        return null;
    const { amount: n, operator: op } = fact.value;
    return op === "EQ" ? [n, n] : op === "LT" ? [0, n - 1] : op === "LTE" ? [0, n] : op === "GT" ? [n + 1, 130] : op === "GTE" ? [n, 130] : null;
};
export function librarianGlobalEligibility(input: {
    readonly request: LibrarianRequest;
    readonly facts: readonly LibrarianFact[];
    readonly world: ProductWorldView;
    readonly visit: VisitWindow;
    readonly profile: ExperienceProfile | null;
    readonly areaIds: readonly string[];
    readonly offerIds: readonly string[];
    readonly offerParticipants: Readonly<Record<string, readonly string[]>>;
    readonly now: string;
}): readonly LibrarianEligibility[] {
    const { facts, world, visit, request } = input;
    const results: LibrarianEligibility[] = [];
    const current = world.currentStates.find(r => r.key === "state.current");
    if (!visit.requested && current && current.freshness === "CURRENT" && current.trust === "VERIFIED" && current.value !== null && typeof current.value === "object" && !Array.isArray(current.value) && "scope" in current.value && "kind" in current.value) {
        const value = current.value as {
            readonly kind: string;
            readonly scope: string;
        };
        if (["VENUE", "SPOT"].includes(value.scope) && ["CLOSED", "TEMPORARILY_CLOSED", "AREA_CLOSED", "FULL"].includes(value.kind) && (!current.validFrom || Date.parse(current.validFrom) <= Date.parse(input.now)) && current.validUntil && Date.parse(input.now) < Date.parse(current.validUntil))
            results.push({ state: "FAILED", reason: "VERIFIED_CURRENT_VENUE_UNAVAILABLE", hashes: [current.entryHash] });
    }
    const rows = world.operationalRules.filter(r => ["rule.age_access_conditions", "rule.age_access"].includes(r.key));
    const activeGroups = request.entities.filter(e => e.kind === "GROUP" && facts.some(f => !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.subjectIds.includes(e.id)));
    // A partial GROUP must never hide an explicitly mentioned participant's age.
    const ageFacts = facts.filter(f => f.key === "people.age" && !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.subjectIds.length === 1);
    const counts = facts.filter(f => f.key === "people.count" && !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.value.kind === "COUNT" && f.value.operator === "EQ");
    const count = counts.length === 1 && counts[0]!.value.kind === "COUNT" ? counts[0]!.value.amount : null;
    const capacity = world.facts.find(r => r.key === "capacity.group_size_supported" && r.trust === "VERIFIED" && r.freshness === "CURRENT");
    if (capacity && count !== null && typeof capacity.value === "object" && capacity.value !== null && "min" in capacity.value && "max" in capacity.value) {
        const c = capacity.value as {
            min: number;
            max: number;
        };
        if (count < c.min || count > c.max)
            results.push({ state: capacity.authorizedUseCases?.includes("HARD_CONSTRAINTS") ? "FAILED" : "UNKNOWN", reason: capacity.authorizedUseCases?.includes("HARD_CONSTRAINTS") ? "GROUP_OUTSIDE_VERIFIED_VENUE_CAPACITY" : "GROUP_CAPACITY_HARD_AUTHORITY_MISSING", hashes: [capacity.entryHash] });
    }
    const scopedAgeCovered = new Set<string>();
    const profileRow = world.facts.find(r => r.key === "experience.profile" && r.trust === "VERIFIED"
        && r.freshness === "CURRENT" && r.authorizedUseCases?.includes("HARD_CONSTRAINTS"));
    if (input.profile && profileRow) for (const offer of input.profile.offers.filter(o => input.offerIds.includes(o.id))) {
        if(offer.properties.some(p=>p.key==="stay.minimum_booking_age" && p.state==="KNOWN" && typeof p.value==="number" && librarianConditions(p.conditions,visit)==="MET"))
            results.push({state:"UNKNOWN",reason:"BOOKING_PERSON_AGE_NOT_VERIFIED",hashes:[profileRow.entryHash],offerIds:[offer.id]});
        const audience = offer.properties.filter(p=>p.key==="participation.audience" && p.state==="KNOWN"
            && librarianConditions(p.conditions,visit)==="MET");
        if(audience.some(p=>p.value==="Nur für Hotelgäste" || p.value==="Nur für Mitglieder"))
            results.push({state:"UNKNOWN",reason:"RESTRICTED_OFFER_ACCESS_NOT_PROVEN",hashes:[profileRow.entryHash],offerIds:[offer.id]});

        const limits = offer.properties.filter(p => p.key === "participation.minimum_age" && p.state === "KNOWN"
            && typeof p.value === "number" && librarianConditions(p.conditions, visit) === "MET");
        const minimums = [...new Set(limits.map(p => p.value as number))];
        if (minimums.length > 1) {
            results.push({ state: "UNKNOWN", reason: "CONFLICTING_OFFER_MINIMUM_AGES", hashes: [profileRow.entryHash], offerIds: [offer.id] });
            continue;
        }
        if (!minimums.length) continue;
        const minimum = minimums[0]!;
        const participants = input.offerParticipants[offer.id] ?? [];
        for (const fact of ageFacts.filter(f => !participants.length || participants.includes(f.subjectIds[0]!))) {
            const bounds = range(fact);
            if (!bounds) continue;
            scopedAgeCovered.add(`${offer.id}:${fact.id}`);
            if (bounds[1] < minimum)
                results.push({ state: "FAILED", reason: "PARTICIPANT_BELOW_OFFER_MINIMUM_AGE", hashes: [profileRow.entryHash], offerIds: [offer.id] });
            else if (bounds[0] < minimum)
                results.push({ state: "UNKNOWN", reason: "OFFER_MINIMUM_AGE_UNRESOLVED", hashes: [profileRow.entryHash], offerIds: [offer.id] });

        }
    }
    if (!rows.length) {
        if (ageFacts.some(f => { const bounds = range(f); return bounds && bounds[1] < 18
            && (!input.offerIds.length || input.offerIds.some(id => (!(input.offerParticipants[id]?.length) || input.offerParticipants[id]!.includes(f.subjectIds[0]!)) && !scopedAgeCovered.has(`${id}:${f.id}`))); }))
            results.push({ state: "UNKNOWN", reason: "CHILD_ENTRY_RULE_NOT_DOCUMENTED", hashes: [] });
        return results;
    }
    for (const row of rows) {
        if (row.trust !== "VERIFIED" || row.freshness !== "CURRENT" || !row.authorizedUseCases?.includes("HARD_CONSTRAINTS")) {
            results.push({ state: "UNKNOWN", reason: "ENTRY_RULE_NOT_AUTHORIZED", hashes: [row.entryHash] });
            continue;
        }
        const value = row.value as {
            readonly rules?: readonly {
                readonly mode: string;
                readonly minimumAge: number | null;
                readonly accompaniment: string;
                readonly days: readonly string[];
                readonly area: string | null;
                readonly event: string | null;
                readonly appliesFromTime: string | null;
            }[];
            readonly policy?: string;
            readonly minimumAge?: number | null;
            readonly appliesFromTime?: string | null;
        };
        const rules = value.rules ?? [{ mode: value.policy === "ALL_AGES" ? "NO_MINIMUM" : "GENERAL_MINIMUM", minimumAge: value.minimumAge ?? null, accompaniment: "NONE", days: [], area: null, event: null, appliesFromTime: value.appliesFromTime ?? null }];
        for (const rule of rules) {
            let applicability: MatchTruth = "MET";
            if (rule.event !== null)
                applicability = "UNKNOWN";
            if (rule.area !== null) {
                const areas = input.profile?.areas.filter(a => input.areaIds.includes(a.id)) ?? [];
                if (!areas.length)
                    applicability = "UNKNOWN";
                else if (!areas.some(a => a.name === rule.area))
                    continue;
            }
            if (rule.days.length) {
                if (visit.dates.length !== 1)
                    applicability = "UNKNOWN";
                else if (!rule.days.includes(weekdays[visitWeekday(visit.dates[0]!) - 1]!))
                    continue;
            }
            if (rule.appliesFromTime !== null) {
                if (!visit.requested || !visit.complete)
                    applicability = "UNKNOWN";
                else {
                    const n = Number(rule.appliesFromTime.slice(0, 2)) * 60 + Number(rule.appliesFromTime.slice(3));
                    if (visit.end <= n)
                        continue;
                    if (visit.start < n)
                        applicability = "UNKNOWN";
                }
            }
            if (rule.mode === "NO_MINIMUM")
                continue;
            if (applicability === "UNKNOWN" || rule.minimumAge === null) {
                results.push({ state: "UNKNOWN", reason: "ENTRY_RULE_CONDITIONS_UNRESOLVED", hashes: [row.entryHash] });
                continue;
            }
            const ages = ageFacts.map(range), below = ages.some(bounds => bounds !== null && bounds[1] < rule.minimumAge!);
            if (rule.mode === "GENERAL_MINIMUM" && below) {
                results.push({ state: "FAILED", reason: "PARTICIPANT_BELOW_VERIFIED_MINIMUM_AGE", hashes: [row.entryHash] });
                continue;
            }
            if (rule.mode === "UNACCOMPANIED_MINIMUM" && below) {
                const adult = activeGroups.length === 1 && ages.some(bounds => bounds !== null && bounds[0] >= 18);
                if (rule.accompaniment === "ADULT" && adult && count !== null && ageFacts.length === count)
                    continue;
                results.push({ state: "UNKNOWN", reason: "REQUIRED_ACCOMPANIMENT_NOT_PROVEN", hashes: [row.entryHash] });
                continue;
            }
            if (count === null || ageFacts.length !== count || new Set(ageFacts.flatMap(f => f.subjectIds)).size !== count || ages.some(bounds => bounds === null || bounds[0] < rule.minimumAge!))
                results.push({ state: "UNKNOWN", reason: "PARTICIPANT_AGE_COVERAGE_INCOMPLETE", hashes: [row.entryHash] });
        }
    }
    return results;
}
