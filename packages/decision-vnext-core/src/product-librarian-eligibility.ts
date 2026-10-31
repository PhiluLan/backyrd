import type { LibrarianFact, LibrarianRequest } from "./product-luna-librarian.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import { hasOfferModule, librarianConcept, librarianTerm, type ExperienceProfile, type ExperienceOffer } from "@backyrd/world-knowledge-core";
import { librarianConditions, visitWeekday, type MatchTruth, type VisitWindow } from "./product-librarian-time.js";
import { contentHash } from "./canonical.js";
export type LibrarianEligibility = {
    readonly state: MatchTruth;
    readonly reason: string;
    readonly offerIds?: readonly string[];
    readonly ageRequirement?: {readonly minimumAge:number;readonly scope:"OFFER"|"SPOT";readonly label:string|null};
} & (
    // A generated mandatory prerequisite must cite its actual source. Missing
    // restriction documentation belongs to context, never an unsourced duty.
    { readonly modality?: "REQUIRED"; readonly hashes: readonly [string, ...string[]] }
    | { readonly modality: "CONTEXT"; readonly hashes: readonly string[] }
);
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
// Offer prerequisites, not invented user requirements. Read explicit offer
// captions and typed occasion facts, never the raw user query.
const occasionTerms = {
    BIRTHDAY: /\b(?:kindergeburtstag(?:e|en)?|geburtstags[- ]?(?:feier(?:n)?|fest(?:e)?|part(?:y|ies)|anlass|event(?:s)?|paket(?:e)?)|geburtstag|birthday(?: party)?)\b/iu,
    WEDDING: /\b(?:hochzeit(?:en|sfeier(?:n)?|sbankett(?:e)?|spaket(?:e)?)?|wedding(?: reception)?)\b/iu,
    COMPANY: /\b(?:firmen(?:feier|anlass|event)|betriebsausflug|company event|corporate event)\b/iu,
    PRIVATE: /\b(?:private(?:n|r)? (?:feier(?:n)?|anlass|anlässe(?:n)?|veranstaltung(?:en)?)|private (?:party|celebration))\b/iu,
} as const;
type OfferOccasion = keyof typeof occasionTerms;
function occasionsIn(text: string): readonly OfferOccasion[] {
    const normalized = librarianTerm(text);
    // Qualify the occasion itself, not unrelated words later in the caption:
    // "also for birthdays" is optional; "birthday without registration" is not.
    return (Object.keys(occasionTerms) as OfferOccasion[]).filter(key =>
        [...normalized.matchAll(new RegExp(occasionTerms[key].source, "giu"))].some(match =>
            !/\b(?:auch(?: für)?|beispielsweise|optional(?: für)?|kein(?:e|en|er)?|ohne|nicht(?: für)?|not|without)\s*(?:(?:einen?|a|the)\s*)?$/iu.test(normalized.slice(0, match.index))));
}
function offerOccasions(offer: ExperienceOffer): readonly OfferOccasion[] {
    // A wedding exhibition or a play titled "Birthday" is a programme theme,
    // not a request to organise that occasion. Restrict service/package offers.
    if (!["instructed", "movement", "sport", "food", "work"].some(module => hasOfferModule(offer.kind, module))
        && offer.kind !== "PRIVATE_CELEBRATION") return [];
    const declared = occasionsIn(offer.name);
    return declared.length ? declared : offer.kind === "PRIVATE_CELEBRATION" ? ["PRIVATE"] : [];
}
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
    readonly offerSubjects: Readonly<Record<string, readonly string[]>>;
    readonly now: string;
}): readonly LibrarianEligibility[] {
    const { facts, world, visit, request } = input;
    const results: LibrarianEligibility[] = [];
    // No requested date/time means discovery, not a visit now. Current opening
    // states must not invent a present-time constraint. Dated availability is
    // checked independently against the requested window by the time evaluator.
    const rows = world.operationalRules.filter(r => ["rule.age_access_conditions", "rule.age_access"].includes(r.key));
    const activeGroups = request.entities.filter(e => e.kind === "GROUP" && facts.some(f => !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.subjectIds.includes(e.id)));
    // A partial GROUP must never hide an explicitly mentioned participant's age.
    const ageFacts = facts.filter(f => f.key === "people.age" && !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.subjectIds.length === 1);
    const companionFacts = facts.filter(f => f.key === "people.relationship" && ["CONTEXT", "REQUIRED"].includes(f.modality) && f.value.kind === "TEXT");
    const hasCompanionTerm = (terms: readonly string[]) => companionFacts.some(f => f.value.kind === "TEXT" && terms.includes(librarianTerm(f.value.text)));
    const unaccompanied = hasCompanionTerm(["unaccompanied", "children_alone", "ohne begleitung", "kinder allein"]);
    const familyCompanionship = hasCompanionTerm(["adult_accompanied", "family_outing", "familie", "familienausflug", "familienaktivität", "mit meiner tochter", "mit meinem sohn"]);
    const selfIds = facts.filter(f => f.key === "people.role" && ["CONTEXT", "REQUIRED"].includes(f.modality)
        && f.value.kind === "TEXT" && ["self", "requester", "ich"].includes(librarianTerm(f.value.text))).flatMap(f => f.subjectIds);
    const selfKnownMinor = ageFacts.some(f => selfIds.includes(f.subjectIds[0]!) && (range(f)?.[1] ?? 130) < 18);
    const explicitAdult = ageFacts.some(f => (range(f)?.[0] ?? 0) >= 18) && (activeGroups.length === 1 || familyCompanionship);
    const adultAccompaniment = !unaccompanied && (explicitAdult || familyCompanionship && !selfKnownMinor);
    const counts = facts.filter(f => f.key === "people.count" && !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.value.kind === "COUNT" && f.value.operator === "EQ");
    const count = counts.length === 1 && counts[0]!.value.kind === "COUNT" ? counts[0]!.value.amount : null;
    const participantIds = [...new Set([...ageFacts.flatMap(f => f.subjectIds), ...facts.filter(f => !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality))
        .flatMap(f => f.subjectIds).filter(id => request.entities.some(e => e.id === id && e.kind === "PERSON")), ...activeGroups.flatMap(group => group.members)])];
    const agesCoverKnownParticipants = (minimum: number) => minimum <= 0 || participantIds.length > 0
        && (count === null || count === participantIds.length)
        && participantIds.every(id => ageFacts.some(f => f.subjectIds.includes(id) && (range(f)?.[0] ?? -1) >= minimum)
            || minimum <= 18 && adultAccompaniment && selfIds.includes(id));
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
        const occasions = offerOccasions(offer);
        if (occasions.length) {
            const subjects = input.offerSubjects[offer.id] ?? [];
            const relevant = facts.filter(f => ["experience.occasion", "experience.activity", "offer.kind"].includes(f.key) && f.value.kind === "TEXT"
                && (!f.subjectIds.some(id => request.entities.some(e => e.id === id && ["ACTIVITY", "OFFER", "AREA"].includes(e.kind)))
                    || f.subjectIds.some(id => subjects.includes(id))));
            const sameOccasion = (f: LibrarianFact, occasion: OfferOccasion) => f.value.kind === "TEXT" && (occasionsIn(f.value.text).includes(occasion)
                || occasion === "PRIVATE" && (occasionsIn(f.value.text).length > 0 || librarianConcept(f.value.text) === "party"));
            const remaining = occasions.filter(occasion => !relevant.some(f => f.modality === "EXCLUDED" && sameOccasion(f, occasion)));
            if (!remaining.length)
                results.push({state:"FAILED",reason:"OFFER_OCCASION_EXCLUDED",hashes:[profileRow.entryHash],offerIds:[offer.id]});
            else if (!remaining.some(occasion => relevant.some(f => ["REQUIRED", "CONTEXT"].includes(f.modality) && sameOccasion(f, occasion))))
                results.push({state:"UNKNOWN",reason:"OFFER_OCCASION_CONTEXT_NOT_PROVEN",hashes:[profileRow.entryHash],offerIds:[offer.id]});
        }
        if(offer.properties.some(p=>p.key==="stay.minimum_booking_age" && p.state==="KNOWN" && typeof p.value==="number" && p.value > 0 && librarianConditions(p.conditions,visit)!=="FAILED"))
            results.push({state:"UNKNOWN",reason:"BOOKING_PERSON_AGE_NOT_VERIFIED",hashes:[profileRow.entryHash],offerIds:[offer.id]});
        const audience = offer.properties.filter(p=>p.key==="participation.audience" && p.state==="KNOWN"
            && librarianConditions(p.conditions,visit)!=="FAILED");
        if(audience.some(p=>p.value==="Nur für Hotelgäste" || p.value==="Nur für Mitglieder"))
            results.push({state:"UNKNOWN",reason:"RESTRICTED_OFFER_ACCESS_NOT_PROVEN",hashes:[profileRow.entryHash],offerIds:[offer.id]});

        const participantAges = ageFacts.filter(f => !input.offerParticipants[offer.id]?.length || input.offerParticipants[offer.id]!.includes(f.subjectIds[0]!));
        if (participantAges.length && offer.properties.some(p => p.key === "participation.minimum_age" && p.state === "UNKNOWN"
            && librarianConditions(p.conditions, visit) !== "FAILED"))
            results.push({state:"UNKNOWN",modality:"CONTEXT",reason:"OFFER_MINIMUM_AGE_NOT_DOCUMENTED",hashes:[profileRow.entryHash],offerIds:[offer.id]});
        if (offer.properties.some(p => p.key === "participation.minimum_age" && p.state === "KNOWN" && typeof p.value === "number"
            && librarianConditions(p.conditions, visit) === "UNKNOWN"))
            results.push({state:"UNKNOWN",reason:"OFFER_MINIMUM_AGE_CONDITIONS_UNRESOLVED",hashes:[profileRow.entryHash],offerIds:[offer.id]});
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
        const relevantParticipants = participants.length ? participants : participantIds;
        const missingParticipantAge = relevantParticipants.length
            ? relevantParticipants.some(id => !participantAges.some(f => f.subjectIds.includes(id))
                && !(minimum <= 18 && adultAccompaniment && selfIds.includes(id)))
            : !participantAges.length;
        if (minimum > 0 && missingParticipantAge)
            results.push({state:"UNKNOWN",modality:"CONTEXT",reason:"AGE_REQUIREMENT_TO_CHECK",hashes:[profileRow.entryHash],offerIds:[offer.id],
                ageRequirement:{minimumAge:minimum,scope:"OFFER",label:offer.name}});
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
            results.push({ state: "UNKNOWN", modality: "CONTEXT", reason: "CHILD_ENTRY_RULE_NOT_DOCUMENTED", hashes: [] });
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
            if (rule.minimumAge === null) {
                results.push({ state: "UNKNOWN", reason: "ENTRY_RULE_CONDITIONS_UNRESOLVED", hashes: [row.entryHash] });
                continue;
            }
            // A restriction is an implication: if it applies, every known
            // participant must satisfy it. Unknown applicability is harmless
            // only when the consequence is already proven. No invented exact
            // headcount or extra ages are required for an identified party.
            if (["GENERAL_MINIMUM", "UNACCOMPANIED_MINIMUM"].includes(rule.mode) && agesCoverKnownParticipants(rule.minimumAge)) {
                results.push({state:"MET",reason:"PARTICIPANT_AGES_MEET_VERIFIED_MINIMUM",hashes:[row.entryHash,contentHash({ageFacts,selfIds,adultAccompaniment,participantIds,count})]});
                continue;
            }
            // A minimum age for going alone is not a minimum admission age.
            // Family/parent accompaniment is visit context, not an invented
            // exact age or a demand for a complete passenger manifest.
            if (rule.mode === "UNACCOMPANIED_MINIMUM" && rule.accompaniment === "ADULT" && adultAccompaniment) {
                results.push({state:"MET",reason:"ADULT_ACCOMPANIMENT_CONTEXT_CONFIRMED",hashes:[row.entryHash,contentHash({companionFacts,selfIds,ageFacts})]});
                continue;
            }
            if (applicability === "UNKNOWN") {
                results.push({ state: "UNKNOWN", reason: "ENTRY_RULE_CONDITIONS_UNRESOLVED", hashes: [row.entryHash] });
                continue;
            }
            const ages = ageFacts.map(range), below = ages.some(bounds => bounds !== null && bounds[1] < rule.minimumAge!);
            if (rule.mode === "GENERAL_MINIMUM" && below) {
                results.push({ state: "FAILED", reason: "PARTICIPANT_BELOW_VERIFIED_MINIMUM_AGE", hashes: [row.entryHash] });
                continue;
            }
            if (rule.mode === "UNACCOMPANIED_MINIMUM" && below) {
                if (unaccompanied && rule.accompaniment === "ADULT") {
                    results.push({state:"FAILED",reason:"REQUIRED_ADULT_ACCOMPANIMENT_EXPLICITLY_ABSENT",hashes:[row.entryHash,contentHash(companionFacts)]});
                    continue;
                }
                const adult = activeGroups.length === 1 && ages.some(bounds => bounds !== null && bounds[0] >= 18);
                if (rule.accompaniment === "ADULT" && adult && count !== null && ageFacts.length === count)
                    continue;
                results.push({ state: "UNKNOWN", reason: "REQUIRED_ACCOMPANIMENT_NOT_PROVEN", hashes: [row.entryHash] });
                continue;
            }
            if (!agesCoverKnownParticipants(rule.minimumAge)) {
                // Missing ages permit discovery with the exact documented
                // limit. Known contradictions, uncertain age ranges, unknown
                // applicability and missing accompaniment stay separate gates.
                const knownAgesMeetMinimum = ages.every(bounds => bounds !== null && bounds[0] >= rule.minimumAge!);
                if (rule.mode === "GENERAL_MINIMUM" && knownAgesMeetMinimum)
                    results.push({state:"UNKNOWN",modality:"CONTEXT",reason:"AGE_REQUIREMENT_TO_CHECK",hashes:[row.entryHash],
                        ageRequirement:{minimumAge:rule.minimumAge,scope:"SPOT",label:null}});
                else results.push({ state: "UNKNOWN", reason: "PARTICIPANT_AGE_COVERAGE_INCOMPLETE", hashes: [row.entryHash] });
            }
        }
    }
    return results;
}
