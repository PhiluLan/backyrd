import { assessLegacyLibrarianFact, assessLibrarianPlaceType, requestedLibrarianPlaceType, LIBRARIAN_PLACE_TYPE_LANGUAGE, LIBRARIAN_WORLD_LANGUAGE_VERSION } from "./product-librarian-world-language.js";
import { LibrarianSemanticIndex, parseAcceptedLibrarianMeaningRegistry } from "./product-librarian-semantics.js";
import { librarianGlobalEligibility } from "./product-librarian-eligibility.js";
import { spotTypeSupports, experienceActivitySupports, parseExperienceProfile, type ExperienceProfile, type ExperienceProperty, type ExperienceOffer, type ExperiencePrice } from "@backyrd/world-knowledge-core";
import { contentHash, deepFreeze } from "./canonical.js";
import { prepareLibrarianRequest, LUNA_LIBRARIAN_CONTRACT_VERSION, type LibrarianFact, type LibrarianRequest, type LunaExpression } from "./product-luna-librarian.js";
import { parseProductWorldResolverBinding, type ProductWorldView } from "./product-world-resolver-binding.js";
import { LIBRARIAN_MATCHING_VERSION, LIBRARIAN_LANGUAGE, LIBRARIAN_FAMILY_STRATEGIES, OFFER_CONCEPTS, AREA_CONCEPTS, BOOLEAN_CONCEPTS, librarianConcept, sameLibrarianText, librarianTerm } from "./product-librarian-language.js";
import { createLibrarianVisitWindow, librarianVenueAvailability, librarianConditions, librarianOfferAvailability, librarianLocalDate, type MatchTruth, type VisitWindow } from "./product-librarian-time.js";
export { LIBRARIAN_MATCHING_VERSION } from "./product-librarian-language.js";
export type LibrarianFactAssessment = {
    readonly factId: string;
    readonly family: string;
    readonly modality: string;
    readonly state: MatchTruth | "CONTEXT" | "NOT_REQUIRED";
    readonly reason: string;
    readonly evidenceHashes: readonly string[];
    readonly offerIds: readonly string[];
    readonly areaIds: readonly string[];
};
export type LibrarianCandidate = {
    readonly spotId: string;
    readonly name: string | null;
    readonly status: "CONFIRMED" | "PARTIAL" | "INELIGIBLE";
    readonly facts: readonly LibrarianFactAssessment[];
    readonly selectedFactIds: readonly string[];
    readonly inactiveFactIds: readonly string[];
    readonly matchedPreferences: readonly string[];
    readonly unknownFactIds: readonly string[];
    readonly failedFactIds: readonly string[];
    readonly offerIds: readonly string[];
    readonly areaIds: readonly string[];
    readonly limitations: readonly string[];
    readonly candidateHash: string;
    readonly snapshotHash: string;
    readonly alternativeOrder: readonly number[];
    readonly conditionalPlans: readonly {
        readonly conditions: readonly {
            readonly conditionId: string;
            readonly truth: boolean;
        }[];
        readonly status: "CONFIRMED" | "PARTIAL" | "INELIGIBLE";
        readonly facts: readonly LibrarianFactAssessment[];
        readonly offerIds: readonly string[];
        readonly areaIds: readonly string[];
    }[];
};
export type LibrarianSearchResult = {
    readonly contractVersion: typeof LIBRARIAN_MATCHING_VERSION;
    readonly requestHash: string;
    readonly languageHash: string;
    readonly catalogHash: string;
    readonly evaluatedAt: string;
    readonly ranked: readonly LibrarianCandidate[];
    readonly excluded: readonly LibrarianCandidate[];
    readonly unresolved: readonly LibrarianCandidate[];
    readonly unresolvedFamilyKeys: readonly string[];
    readonly conditionUnknownIds: readonly string[];
    readonly conditionEvidenceHash: string;
    readonly resultHash: string;
};
/** Server-only, request-local evidence. No browser data is accepted as a weather
 * truth source; callers must bind these observations to their trusted source. */
export type LibrarianConditionEvidence = {
    readonly requestHash: string;
    readonly conditionId: string;
    readonly spotId: string;
    readonly localDate: string;
    readonly state: "TRUE" | "FALSE" | "UNKNOWN";
    readonly sourceHash: string;
    readonly validUntil: string;
};
type Witness = {
    readonly evidenceHashes: readonly string[];
    readonly offerIds: readonly string[];
    readonly areaIds: readonly string[];
    readonly assignments: Readonly<Record<string, string>>;
    readonly conditionUnresolved: boolean;
    readonly chargeable: boolean;
};
type Atom = {
    readonly report: LibrarianFactAssessment;
    readonly witnesses: readonly Witness[];
};
type Scenario = {
    readonly ids: readonly string[];
    readonly preferredIds: readonly string[];
    readonly order: readonly number[];
};
type State = {
    readonly assignments: Readonly<Record<string, string>>;
    readonly hashes: readonly string[];
    readonly offerIds: readonly string[];
    readonly areaIds: readonly string[];
    readonly uncertain: boolean;
    readonly chargeOfferIds: readonly string[];
};
const MAX_SCENARIOS = 64, MAX_STATES = 256;
const mergeSorted = (left: readonly string[], right: readonly string[]): readonly string[] =>
    right.every(value => left.includes(value)) ? left : sorted([...left, ...right]);
const sorted = (items: readonly string[]) => [...new Set(items)].sort();
const emptyState = (): State => ({ assignments: {}, hashes: [], offerIds: [], areaIds: [], chargeOfferIds: [], uncertain: false });
function failure(code: string): never { throw new Error(`librarian_matching_${code}`); }
function scenarios(node: LunaExpression, conditions: ReadonlyMap<string, boolean>): readonly Scenario[] {
    if (node.kind === "FACT")
        return [{ ids: [node.factId], preferredIds: [], order: [] }];
    if (node.kind === "IF")
        return conditions.get(node.conditionFactId) ? scenarios(node.then, conditions) : node.else ? scenarios(node.else, conditions) : [{ ids: [], preferredIds: [], order: [] }];
    if (node.kind === "ANY" && node.strength === "PREFERRED")
        return [{ ids: [], preferredIds: [], order: [] }, ...node.children.flatMap(child => scenarios(child, conditions).map(s => ({ ...s, preferredIds: s.ids })))];
    if (node.kind === "ANY" || node.kind === "FALLBACK")
        return (node.kind === "ANY" ? node.children : node.options).flatMap((child, i) => scenarios(child, conditions).map(s => ({ ...s, order: node.kind === "FALLBACK" ? [i, ...s.order] : s.order })));
    let result: readonly Scenario[] = [{ ids: [], preferredIds: [], order: [] }];
    for (const child of node.children) {
        const next = scenarios(child, conditions);
        if (result.length * next.length > MAX_SCENARIOS)
            failure("scenario_limit");
        result = result.flatMap(a => next.map(b => ({ ids: sorted([...a.ids, ...b.ids]), preferredIds: sorted([...a.preferredIds, ...b.preferredIds]).filter(id => !a.ids.filter(id => !a.preferredIds.includes(id)).includes(id) && !b.ids.filter(id => !b.preferredIds.includes(id)).includes(id)), order: [...a.order, ...b.order] })));
    }
    return result;
}
function collectFacts(node: LunaExpression): readonly string[] {
    if (node.kind === "FACT")
        return [node.factId];
    if (node.kind === "IF")
        return sorted([...collectFacts(node.then), ...(node.else ? collectFacts(node.else) : [])]);
    return sorted((node.kind === "FALLBACK" ? node.options : node.children).flatMap(collectFacts));
}
const semanticPropertyKeys: Readonly<Record<string, readonly string[]>> = { "experience.activity": ["experience.activity", "food.drink"], "experience.character": ["atmosphere.character"], "offer.facility": ["offer.feature"], "offer.kind": ["offer.kind", "stay.room_type"], "offer.area": ["offer.area", "location.setting"], "participation.accessibility": ["participation.accessibility", "amenity.step_free", "amenity.stroller"], "offer.feature": ["offer.feature", ...Object.keys(BOOLEAN_CONCEPTS)] };
/** Catalogued offer duties may arrive in a domain family. Preserve the
 * emitted family; only establish which typed offer can witness it. Specific
 * drinks (wine, beer, etc.) still need their own property evidence. */
function offerDuty(fact: LibrarianFact): boolean {
    if (["experience.activity", "offer.kind"].includes(fact.key)) return true;
    if (fact.value.kind !== "TEXT") return false;
    const concept = librarianConcept(fact.value.text);
    return fact.key === "food.meal" && ["meal", "lunch", "dinner", "breakfast", "snacks", "aperitif"].includes(concept ?? "")
        || fact.key === "food.drink" && concept === "drinks";
}
const contextual = (fact: LibrarianFact) => fact.modality === "CONTEXT" || LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "CONTEXT";
const neutral = (fact: LibrarianFact) => contextual(fact) || fact.modality === "NOT_REQUIRED";
function assignments(request: LibrarianRequest, fact: LibrarianFact, offerId: string | null, areaId: string | null): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    if (fact.key === "offer.facility")
        return result;
    const concept = fact.value.kind === "TEXT" ? librarianConcept(fact.value.text) : null;
    if (offerId && (fact.key.startsWith("food.") && fact.key !== "food.drink" || fact.key === "experience.activity" && ["meal", "lunch", "dinner", "breakfast"].includes(concept ?? ""))) {
        for (const id of fact.subjectIds)
            result[`meal:${id}`] = offerId;
        if (!fact.subjectIds.length)
            result["meal:*"] = offerId;
    }
    const spatial = fact.subjectIds.flatMap(id => { const e = request.entities.find(e => e.id === id); return e && ["ACTIVITY", "AREA", "OFFER"].includes(e.kind) ? [e] : []; });
    if (offerId)
        for (const id of fact.subjectIds)
            result[`owner:${id}:offer:${offerId}`] = offerId;
    for (const e of spatial) {
        if (e.kind === "OFFER" && offerId)
            result[`offer:${e.id}`] = offerId;
        if (areaId)
            result[`area:${e.id}`] = areaId;
    }
    if (!spatial.length && areaId)
        result["area:*"] = areaId;
    return result;
}
function join(a: State, b: Witness): State | null {
    if (Object.entries(b.assignments).some(([key, value]) => a.assignments[key] !== undefined && a.assignments[key] !== value))
        return null;
    const combined = { ...a.assignments, ...b.assignments };
    if (combined["area:*"] !== undefined && Object.entries(combined).some(([key, value]) => key.startsWith("area:") && value !== combined["area:*"]))
        return null;
    if (combined["meal:*"] !== undefined && Object.entries(combined).some(([key, value]) => key.startsWith("meal:") && value !== combined["meal:*"]))
        return null;
    return { chargeOfferIds: mergeSorted(a.chargeOfferIds, b.chargeable ? b.offerIds : []), assignments: combined, hashes: mergeSorted(a.hashes, b.evidenceHashes), offerIds: mergeSorted(a.offerIds, b.offerIds), areaIds: mergeSorted(a.areaIds, b.areaIds), uncertain: a.uncertain || b.conditionUnresolved };
}
const compare = (a: number, b: number, operator: string) => operator === "EQ" ? a === b : operator === "NEQ" ? a !== b : operator === "LTE" ? a <= b : operator === "LT" ? a < b : operator === "GTE" ? a >= b : operator === "GT" ? a > b : null;
function propertyTruth(property: ExperienceProperty, fact: LibrarianFact): MatchTruth {
    if (property.state !== "KNOWN")
        return "UNKNOWN";
    if (fact.value.kind === "TEXT") {
        const desired = librarianConcept(fact.value.text);
        // A documented consumable coffee proves coffee drinking in that same
        // offer. This does not turn a beverage into a venue, workshop or meal.
        if (fact.key === "experience.activity" && property.key === "food.drink")
            return desired === "coffee" && typeof property.value === "string" && librarianConcept(property.value) === "coffee" ? "MET" : "UNKNOWN";
        if (typeof property.value === "boolean") {
            const concept = BOOLEAN_CONCEPTS[property.key];
            return concept && desired === concept ? (property.value ? "MET" : "FAILED") : "UNKNOWN";
        }
        if (typeof property.value !== "string")
            return "UNKNOWN";
        if (sameLibrarianText(property.value, fact.value.text))
            return "MET";
        if (fact.key === "experience.activity" && property.key === "experience.activity") {
            const actual = librarianConcept(property.value);
            if (actual && desired && experienceActivitySupports(actual, desired)) return "MET";
        }
        const actual = librarianConcept(property.value);
        if (fact.key === "atmosphere.music" && desired === "music")
            return actual === "no_music" ? "FAILED" : ["music", "live_music", "background_music", "music_event"].includes(actual ?? "") ? "MET" : "UNKNOWN";
        if (fact.key === "atmosphere.music" && desired === "no_music")
            return actual === "no_music" ? "MET" : ["music", "live_music", "background_music"].includes(actual ?? "") ? "FAILED" : "UNKNOWN";
        if (fact.key === "atmosphere.noise" && ["quiet", "loud"].includes(desired ?? "") && ["quiet", "loud"].includes(actual ?? ""))
            return "FAILED";
        return "UNKNOWN"; // Open positive lists are not complete absence evidence.
    }
    if (typeof property.value !== "number" || !("amount" in fact.value) || !("operator" in fact.value))
        return "UNKNOWN";
    if (fact.key === "time.duration" && fact.value.kind === "DURATION" && fact.value.measurementScope === "AVAILABLE_TOTAL")
        return "UNKNOWN";
    const result = compare(property.value, fact.value.amount, fact.value.operator);
    return result === null ? "UNKNOWN" : result ? "MET" : "FAILED";
}
function profileFor(world: ProductWorldView, visit: VisitWindow, now: string): {
    profile: ExperienceProfile;
    hash: string;
} | null {
    const row = world.facts.find(r => r.key === "experience.profile" && r.freshness === "CURRENT" && r.trust === "VERIFIED" && r.resolution === "KNOWN_VALUE" && r.authorizedUseCases?.includes("DISCOVERY") && r.authorizedUseCases.includes("HARD_CONSTRAINTS"));
    if (!row || row.validFrom === undefined || row.validUntil === undefined)
        return null;
    if (!visit.dates.length && (row.validFrom !== null && Date.parse(now) < Date.parse(row.validFrom) || row.validUntil !== null && Date.parse(now) >= Date.parse(row.validUntil)))
        return null;
    if (visit.dates.some(day => row.validFrom !== null && day < librarianLocalDate(row.validFrom!, visit.timezone ?? "Europe/Zurich") || row.validUntil !== null && day >= librarianLocalDate(row.validUntil!, visit.timezone ?? "Europe/Zurich")))
        return null;
    return { profile: parseExperienceProfile(row.value), hash: row.entryHash };
}
function atom(request: LibrarianRequest, fact: LibrarianFact, world: ProductWorldView, profile: ExperienceProfile | null, profileHash: string | null, visit: VisitWindow, preferenceOnly = false, semantics: LibrarianSemanticIndex | null = null, offerAvailability = librarianOfferAvailability): Atom {
    const report = (state: LibrarianFactAssessment["state"], reason: string, witnesses: readonly Witness[] = []): Atom => ({ report: { factId: fact.id, family: fact.key, modality: preferenceOnly ? "PREFERRED" : fact.modality, state, reason, evidenceHashes: sorted(witnesses.flatMap(w => w.evidenceHashes)), offerIds: sorted(witnesses.flatMap(w => w.offerIds)), areaIds: sorted(witnesses.flatMap(w => w.areaIds)) }, witnesses });
    if (fact.modality === "NOT_REQUIRED")
        return report("NOT_REQUIRED", "NO_MATCHING_DUTY");
    if (contextual(fact))
        return report("CONTEXT", "RETAINED_AS_REQUEST_CONTEXT");
    if (fact.key === "location.destination" || fact.key === "location.country") {
        const key = fact.key === "location.destination" ? "location.locality" : "location.country_code", row = world.facts.find(r => r.key === key);
        if (!row || typeof row.value !== "string" || fact.value.kind !== "TEXT")
            return report("UNKNOWN", "LOCATION_EVIDENCE_MISSING");
        const locationTerm = (text: string) => librarianTerm(text).normalize("NFKD").replace(/\p{M}/gu, "");
        const equal = locationTerm(row.value) === locationTerm(fact.value.text), state = equal ? "MET" : "FAILED";
        return report(fact.modality === "EXCLUDED" ? (equal ? "FAILED" : "MET") : state, "VERIFIED_LOCATION", [{ evidenceHashes: [row.entryHash], offerIds: [], areaIds: [], assignments: {}, conditionUnresolved: false, chargeable: false }]);
    }
    if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL" || LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "PRICE")
        return report("UNKNOWN", "DEFERRED_TO_JOINT_VISIT_EVALUATION");
    // Overlapping words such as Café can denote an actual embedded offer.
    // Its real scoped witness takes precedence over whole-venue classification.
    const concept = fact.value.kind === "TEXT" ? librarianConcept(fact.value.text) : null;
    const scopedKind = profile && concept && offerDuty(fact)
        && profile.offers.some(offer => concept === "zoo" && offer.kind === "VISIT" || (OFFER_CONCEPTS[offer.kind] ?? []).includes(concept));
    const placeType = !scopedKind ? assessLibrarianPlaceType(preferenceOnly ? { ...fact, modality: "PREFERRED" } : fact, world) : null;
    if (placeType) return report(placeType.state, placeType.reason, placeType.hashes.length ? [{ evidenceHashes: placeType.hashes, offerIds: [], areaIds: [], assignments: {}, conditionUnresolved: placeType.state === "UNKNOWN", chargeable: false }] : []);
    if (!profile || !profileHash) {
        const legacy = assessLegacyLibrarianFact(preferenceOnly ? { ...fact, modality: "PREFERRED" } : fact, world, visit);
        return report(legacy.state, legacy.reason, legacy.hashes.length ? [{ evidenceHashes: legacy.hashes, offerIds: [], areaIds: [], assignments: {}, conditionUnresolved: legacy.state === "UNKNOWN", chargeable: false }] : []);
    }
    // A global spatial requirement applies to the requested activities, not
    // an unrelated cafe or facility elsewhere at the same spot.
    const physicalArea = fact.key === "offer.area" || fact.key === "location.setting" && ["indoor", "outdoor", "terrace"].includes(concept ?? "");
    const spatialActivities = physicalArea && (!fact.subjectIds.length || fact.subjectIds.every(id => request.entities.some(e => e.id === id && e.kind === "GROUP")))
        ? request.facts.filter(f => offerDuty(f) && ["REQUIRED"].includes(f.modality)
            && collectFacts(request.logic).includes(f.id))
            .map(f => atom(request, f, world, profile, profileHash, visit, false, semantics, offerAvailability)) : [];
    const positives: Witness[] = [], negatives: Witness[] = [], uncertain: Witness[] = [];
    const add = (truth: MatchTruth, offer: ExperienceOffer | null, areaId: string | null, evidence: unknown, conditional = false) => {
        // A nonmatching/unknown value is not evidence of semantic support.
        if (truth === "UNKNOWN") return;
        if (truth === "MET" && spatialActivities.length) {
            const supportsArea = (a: Atom) => a.witnesses.some(w => w.offerIds.some(id =>
                profile.offers.some(o => o.id === id && areaId !== null && o.areaIds.includes(areaId)))
                && (!w.areaIds.length || areaId !== null && w.areaIds.includes(areaId)));
            if (!offer || !spatialActivities.some(a => a.witnesses.some(w => w.offerIds.includes(offer.id)))
                || spatialActivities.some(a => a.report.state !== "MET" || !supportsArea(a))) return;
        }
        const availability = offer ? offerAvailability(offer, world, visit) : { state: "MET" as const, hashes: [], reason: "AREA_FACT" };
        const witness: Witness = { evidenceHashes: sorted([profileHash, contentHash(evidence), ...availability.hashes]), offerIds: offer ? [offer.id] : [], areaIds: areaId ? [areaId] : [], assignments: assignments(request, fact, offer?.id ?? null, areaId), conditionUnresolved: conditional || availability.state === "UNKNOWN" && !visit.complete, chargeable: fact.key !== "offer.facility" };
        if (fact.modality === "EXCLUDED" && availability.state !== "MET")
            uncertain.push(witness);
        else if (availability.state === "FAILED")
            negatives.push(witness);
        else if (truth === "MET" && !witness.conditionUnresolved)
            positives.push(witness);
        else if (truth === "FAILED" && !conditional)
            negatives.push(witness);
        else
            uncertain.push(witness);
    };
    const desired = fact.value.kind === "TEXT" ? librarianConcept(fact.value.text) : null;
    if (offerDuty(fact) && desired) {
        const classification = world.facts.find(r => r.key === "classification.place_types" && Array.isArray(r.value));
        const place = classification?.value as readonly string[] | undefined;
        const categoryProof = desired === "zoo" ? place?.some(type=>spotTypeSupports(type,"ZOO")) : desired === "museum" ? place?.some(type=>spotTypeSupports(type,"MUSEUM")) : desired === "restaurant" ? (LIBRARIAN_PLACE_TYPE_LANGUAGE.children.RESTAURANT ?? []).some(type => place?.includes(type)) : desired === "bar" ? (LIBRARIAN_PLACE_TYPE_LANGUAGE.children.BAR ?? []).some(type => place?.includes(type)) : null;
        for (const offer of profile.offers) {
            const offered = sorted([...(OFFER_CONCEPTS[offer.kind] ?? []), ...(offer.kind === "VISIT" && place?.some(type=>spotTypeSupports(type,"ZOO")) ? ["zoo"] : [])]);
            const matches = desired === "zoo" ? categoryProof && offer.kind === "VISIT" : offered.some(concept => experienceActivitySupports(concept, desired)) && (categoryProof === null || categoryProof === true);
            if (matches) {
                // Zoo-wide activity support does not place animals in every
                // linked room, terrace or cafe. Preserve the actual offer only.
                const derived = !offered.includes(desired);
                for (const areaId of derived ? [null] : offer.areaIds.length ? offer.areaIds : [null])
                    add("MET", offer, areaId, { kind: offer.kind, name: offer.name, activityRelation: derived ? { offered, requested: desired } : null, classificationHash: classification?.entryHash ?? null });
            }
        }
    }
    if (["offer.area", "location.setting"].includes(fact.key) && desired && ["indoor", "outdoor", "terrace"].includes(desired)) {
        for (const area of profile.areas)
            if ((AREA_CONCEPTS[area.kind] ?? []).includes(desired)) {
                const offers = profile.offers.filter(o => o.areaIds.includes(area.id));
                for (const offer of offers)
                    add("MET", offer, area.id, area, offer.kind === "VISIT" && offer.areaIds.length > 1);
            }
    }
    const keys = sorted([...(semanticPropertyKeys[fact.key] ?? [fact.key]), ...(semantics?.sourceKeys(fact) ?? [])]);
    const inspect = (properties: readonly ExperienceProperty[], offer: ExperienceOffer | null, areaId: string | null, areaScoped = false) => {
        for (const property of properties.filter(p => keys.includes(p.key))) {
            const condition = librarianConditions(property.conditions, visit);
            if (condition === "FAILED")
                continue;
            const translated = semantics?.resolve(fact, property);
            const offeredActivity = typeof property.value === "string" ? librarianConcept(property.value) : null;
            const derivedActivity = fact.key === "experience.activity" && property.key === "experience.activity"
                && desired && offeredActivity && desired !== offeredActivity && experienceActivitySupports(offeredActivity, desired);
            add(translated?.state ?? propertyTruth(property, fact), offer, derivedActivity && !areaScoped ? null : areaId, translated ? { property, meaningLinkHash: translated.evidenceHash } : property, condition === "UNKNOWN");
        }
    };
    inspect(profile.properties, null, null);
    for (const offer of profile.offers)
        for (const areaId of offer.areaIds.length ? offer.areaIds : [null])
            inspect(offer.properties, offer, areaId);
    for (const area of profile.areas) {
        const offers = profile.offers.filter(o => o.areaIds.includes(area.id));
        if (offers.length)
            for (const offer of offers)
                inspect(area.properties, offer, area.id, true);
        else
            inspect(area.properties, null, area.id, true);
    }
    const unique = (rows: readonly Witness[]) => [...new Map(rows.map(w => [contentHash(w), w])).values()];
    if (fact.modality === "EXCLUDED") {
        const certainAbsences = negatives.filter(n => !positives.some(p => contentHash(n.assignments) === contentHash(p.assignments)));
        if (certainAbsences.length)
            return report("MET", "EXCLUDED_FEATURE_EXPLICITLY_ABSENT", unique(certainAbsences));
        if (positives.length && !negatives.length && !uncertain.length)
            return report("FAILED", "EXCLUDED_FEATURE_PRESENT", unique(positives));
        return report("UNKNOWN", "EXCLUSION_NOT_PROVEN", unique([...uncertain, ...positives, ...negatives]));
    }
    if (positives.length && negatives.some(n => positives.some(p => contentHash(n.assignments) === contentHash(p.assignments))))
        return report("UNKNOWN", "CONFLICTING_SCOPED_EVIDENCE", unique([...positives, ...negatives]));
    if (positives.length)
        return report("MET", "SCOPED_EVIDENCE_CONFIRMED", unique(positives));
    if (negatives.length && !uncertain.length)
        return report("FAILED", "SCOPED_REQUIREMENT_CONTRADICTED", unique(negatives));
    return report("UNKNOWN", uncertain.length ? "CONDITIONS_OR_AVAILABILITY_UNKNOWN" : "FAMILY_OR_VALUE_NOT_PROVEN", unique(uncertain));
}
function countPeople(facts: readonly LibrarianFact[], request: LibrarianRequest): number | null {
    const counts = facts.filter(f => f.key === "people.count" && !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality) && f.value.kind === "COUNT" && f.value.operator === "EQ");
    if (counts.length === 1 && counts[0]!.value.kind === "COUNT") {
        const count = counts[0]!;
        const named = count.subjectIds.flatMap(id => request.entities.find(e => e.id === id)?.members ?? []);
        return named.length > counts[0]!.value.amount ? null : counts[0]!.value.amount;
    }
    if (counts.length > 1)
        return null;
    // Named members need not enumerate the full party. Only a count fact is
    // authority for quantities, prices and capacity.
    return null;
}
function jointPrice(fact: LibrarianFact, facts: readonly LibrarianFact[], request: LibrarianRequest, profile: ExperienceProfile | null, state: State, visit: VisitWindow): LibrarianFactAssessment {
    const money = fact.value;
    const base = { factId: fact.id, family: fact.key, modality: fact.modality, evidenceHashes: [] as readonly string[], offerIds: state.offerIds, areaIds: state.areaIds };
    const result = (s: MatchTruth, reason: string, hashes: readonly string[] = []): LibrarianFactAssessment => ({ ...base, state: s, reason, evidenceHashes: hashes });
    if (!profile || money.kind !== "MONEY" || !state.offerIds.length)
        return result("UNKNOWN", "PRICE_SCOPE_UNBOUND");
    const physicalSubjects = fact.subjectIds.filter(id => ["ACTIVITY", "OFFER"].includes(request.entities.find(e => e.id === id)?.kind ?? ""));
    const scopedOfferIds = physicalSubjects.length ? sorted(Object.entries(state.assignments).filter(([key]) => physicalSubjects.some(id => key.startsWith(`owner:${id}:offer:`))).map(([, id]) => id)).filter(id => state.chargeOfferIds.includes(id)) : state.chargeOfferIds;
    if (!scopedOfferIds.length)
        return result("UNKNOWN", "PRICE_SCOPE_UNBOUND");
    const scopes = facts.filter(f => f.key === "budget.scope" && f.value.kind === "BUDGET_SCOPE" && (!f.subjectIds.length || f.subjectIds.some(id => fact.subjectIds.includes(id)))), scope = scopes.length === 1 && scopes[0]!.value.kind === "BUDGET_SCOPE" ? scopes[0]!.value.scope : null;
    if (!scope || !["PER_PERSON", "GROUP_TOTAL"].includes(scope) || money.currency === "UNSPECIFIED")
        return result("UNKNOWN", "BUDGET_BASIS_OR_CURRENCY_UNKNOWN");
    if (facts.some(f => ["budget.coverage", "budget.cost_treatment"].includes(f.key)))
        return result("UNKNOWN", "BUDGET_COMPONENT_COVERAGE_NOT_STRUCTURED");
    const people = countPeople(facts, request);
    if (scope === "GROUP_TOTAL" && people === null)
        return result("UNKNOWN", "GROUP_PRICE_HEADCOUNT_UNKNOWN");
    const explicitGroups = fact.subjectIds.filter(id => request.entities.find(e => e.id === id)?.kind === "GROUP");
    const countGroups = facts.filter(f => f.key === "people.count" && !['EXCLUDED', 'PREFERRED', 'NOT_REQUIRED'].includes(f.modality)).flatMap(f => f.subjectIds.filter(id => request.entities.find(e => e.id === id)?.kind === "GROUP"));
    const groupIds = explicitGroups.length ? explicitGroups : sorted(countGroups), participantIds = new Set(groupIds.flatMap(id => request.entities.find(e => e.id === id)?.members ?? []));
    const ages = facts.filter(f => f.key === "people.age" && !['EXCLUDED', 'PREFERRED', 'NOT_REQUIRED'].includes(f.modality) && f.value.kind === "AGE" && f.value.operator === "EQ" && (!participantIds.size || f.subjectIds.every(id => participantIds.has(id))));
    let min = 0, max = 0;
    const hashes: string[] = [];
    for (const offerId of scopedOfferIds) {
        const offer = profile.offers.find(o => o.id === offerId)!;
        if(offer.prices.some(p=>["PER_ROOM_NIGHT","PER_PERSON_NIGHT","PER_SITE_NIGHT"].includes(p.basis)))
            return result("UNKNOWN", "OVERNIGHT_PRICE_QUANTITY_OR_SCOPE_UNRESOLVED");
        const concepts = sorted([...(OFFER_CONCEPTS[offer.kind] ?? []), ...facts.filter(f => ["experience.activity", "offer.kind"].includes(f.key) && f.value.kind === "TEXT" && f.subjectIds.some(id => state.assignments[`owner:${id}:offer:${offerId}`] === offerId)).flatMap(f => f.value.kind === "TEXT" ? [librarianConcept(f.value.text) ?? ""] : [])]);
        const purpose = ["meal", "lunch", "dinner", "breakfast"].some(c => concepts.includes(c)) ? "meal" : concepts.includes("coffee") ? "coffee" : concepts.includes("drinks") ? "drinks" : ["VISIT", "PERMANENT_EXHIBITION", "SPECIAL_EXHIBITION"].includes(offer.kind) ? "entry" : null;
        if (purpose === null)
            return result("UNKNOWN", "PRICE_PURPOSE_UNSTRUCTURED");
        const prices = offer.prices.filter(p => (librarianConcept(p.includes) === purpose || purpose === "meal" && ["lunch", "dinner", "breakfast"].includes(librarianConcept(p.includes) ?? "")) && p.currency === money.currency && librarianConditions(p.conditions, visit) === "MET");
        const universal = prices.filter(p => p.minimumAge === null && p.maximumAge === null);
        const choose = (options: readonly ExperiencePrice[]): ExperiencePrice | null => {
            // Distinct labelled tariffs/components are not interchangeable offers.
            if (options.length !== 1)
                return null;
            return options[0]!;
        };
        let components: readonly {
            price: ExperiencePrice;
            factor: number;
        }[] = [];
        const universalPrice = choose(universal);
        if (universalPrice) {
            const p = universalPrice;
            if (["PER_ROOM_NIGHT","PER_PERSON_NIGHT","PER_SITE_NIGHT"].includes(p.basis))
                return result("UNKNOWN", "OVERNIGHT_PRICE_QUANTITY_OR_SCOPE_UNRESOLVED");
            if (p.basis === "PER_ITEM")
                return result("UNKNOWN", "ITEM_PRICE_QUANTITY_UNKNOWN");
            const factor = p.basis === "PER_GROUP" ? (scope === "GROUP_TOTAL" ? 1 : people === null ? null : 1 / people) : (scope === "GROUP_TOTAL" ? people : 1);
            if (factor === null || !Number.isFinite(factor) || factor <= 0)
                return result("UNKNOWN", "PRICE_CONVERSION_SCOPE_UNKNOWN");
            components = [{ price: p, factor }];
        }
        else if (scope === "GROUP_TOTAL" && people !== null && ages.length === people && ages.every(f => f.subjectIds.length === 1) && new Set(ages.flatMap(f => f.subjectIds)).size === people) {
            const perPerson = ages.map(f => { const age = f.value.kind === "AGE" ? f.value.amount : 0; const p = choose(prices.filter(p => p.basis === "PER_PERSON" && (p.minimumAge === null || p.minimumAge <= age) && (p.maximumAge === null || age <= p.maximumAge))); return p ? { price: p, factor: 1 } : null; });
            if (perPerson.some(p => p === null))
                return result("UNKNOWN", "AGE_SPECIFIC_PRICE_NOT_PROVEN");
            components = perPerson as readonly {
                price: ExperiencePrice;
                factor: number;
            }[];
        }
        else
            return result("UNKNOWN", "PRICE_COMPONENT_OR_AGE_SCOPE_AMBIGUOUS");
        for (const c of components) {
            const groupPerPerson = c.price.basis === "PER_GROUP" && scope === "PER_PERSON";
            if (groupPerPerson && ["EQ", "NEQ"].includes(money.operator))
                return result("UNKNOWN", "GROUP_ALLOCATION_NOT_DOCUMENTED", hashes);
            const roundShare = (value: number) => ["GTE", "GT"].includes(money.operator) ? Math.floor((value + 1e-9) * 100) / 100 : Math.ceil((value - 1e-9) * 100) / 100;
            min += groupPerPerson ? roundShare(c.price.min * c.factor) : c.price.min * c.factor;
            if (c.price.max === null || c.price.mandatoryFeesIncluded !== true)
                return result(compare(min, money.amount, money.operator) === false && ["LTE", "LT"].includes(money.operator) ? "FAILED" : "UNKNOWN", "PRICE_MAXIMUM_OR_MANDATORY_COSTS_UNKNOWN", hashes);
            max += groupPerPerson ? roundShare(c.price.max * c.factor) : c.price.max * c.factor;
            hashes.push(contentHash(c.price));
        }
    }
    const pass = compare(max, money.amount, money.operator), minimumPass = compare(min, money.amount, money.operator);
    let truth: MatchTruth;
    if (money.operator === "EQ")
        truth = min === max && min === money.amount ? "MET" : money.amount < min || max < money.amount ? "FAILED" : "UNKNOWN";
    else if (money.operator === "NEQ")
        truth = money.amount < min || max < money.amount ? "MET" : min === max && min === money.amount ? "FAILED" : "UNKNOWN";
    else if (["GTE", "GT"].includes(money.operator))
        truth = minimumPass === true ? "MET" : pass === false ? "FAILED" : "UNKNOWN";
    else
        truth = pass === null ? "UNKNOWN" : pass ? "MET" : minimumPass === false ? "FAILED" : "UNKNOWN";
    return result(fact.modality === "EXCLUDED" ? (truth === "MET" ? "FAILED" : truth === "FAILED" ? "MET" : "UNKNOWN") : truth, truth === "MET" ? "SCOPED_COMPLETE_PRICE_CONFIRMED" : "BUDGET_NOT_PROVEN_OR_EXCEEDED", hashes);
}
function assessScenario(request: LibrarianRequest, world: ProductWorldView, scenario: Scenario, preferenceIds: ReadonlySet<string>, now: string, semantics: LibrarianSemanticIndex | null): Omit<LibrarianCandidate, "candidateHash"> {
    const referenced = new Set(collectFacts(request.logic));
    const branchEntities = new Set(request.facts.filter(f => scenario.ids.includes(f.id)).flatMap(f => f.subjectIds));
    const selected = request.facts.filter(f => scenario.ids.includes(f.id) || f.modality === "CONTEXT" && !referenced.has(f.id) && (!f.subjectIds.some(id => ["ACTIVITY", "OFFER", "AREA"].includes(request.entities.find(e => e.id === id)?.kind ?? "")) || f.subjectIds.some(id => branchEntities.has(id))));
    const activeRequest = { ...request, facts: selected.map(f => preferenceIds.has(f.id) ? { ...f, modality: "PREFERRED" as const } : f) };
    const visit = createLibrarianVisitWindow(selected.filter(f => f.modality !== "PREFERRED" && !preferenceIds.has(f.id)), world.spot.location.timezone);
    const source = profileFor(world, visit, now), profile = source?.profile ?? null;
    // Availability is pure for this immutable world and visit window. Reuse
    // its proof across witnesses/states instead of rebuilding calendar data.
    const availabilityByVisit = new WeakMap<VisitWindow, Map<string, ReturnType<typeof librarianOfferAvailability>>>();
    const offerAvailability: typeof librarianOfferAvailability = (offer, snapshot, window) => {
        let cache = availabilityByVisit.get(window);
        if (!cache) { cache = new Map(); availabilityByVisit.set(window, cache); }
        let value = cache.get(offer.id);
        if (!value) { value = librarianOfferAvailability(offer, snapshot, window); cache.set(offer.id, value); }
        return value;
    };
    const temporalVisits = new Map(selected.filter(f => LIBRARIAN_FAMILY_STRATEGIES[f.key] === "TEMPORAL").map(f => [f.id,
        f.modality === "PREFERRED" || preferenceIds.has(f.id)
            ? createLibrarianVisitWindow([...selected.filter(s => s.modality !== "PREFERRED" && !preferenceIds.has(s.id)), { ...f, modality: "REQUIRED" }], world.spot.location.timezone)
            : visit]));
    let states: readonly State[] = [emptyState()], limited = false;
    const reports: LibrarianFactAssessment[] = [], allAtoms: Atom[] = [];
    for (const id of scenario.ids) {
        const fact = request.facts.find(f => f.id === id);
        if (!fact) {
            reports.push({ factId: id, family: "extension", modality: request.extensions.find(e => e.id === id)?.modality ?? "REQUIRED", state: "UNKNOWN", reason: "OPEN_EXTENSION_REQUIRES_BOUND_EVIDENCE", evidenceHashes: [], offerIds: [], areaIds: [] });
            continue;
        }
        const a = atom(activeRequest, fact, world, profile, source?.hash ?? null, visit, preferenceIds.has(fact.id), semantics, offerAvailability);
        allAtoms.push(a);
        reports.push(a.report);
        const deferred = LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "PRICE" || LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL";
        if (!neutral(fact) && fact.modality !== "PREFERRED" && !preferenceIds.has(fact.id) && !deferred && a.report.state === "MET") {
            // Retain exactly the same traversal prefix, but stop constructing
            // discarded Cartesian combinations as soon as overflow is proven.
            const joined: State[] = [];
            let overflow = false;
            outer: for (const state of states) for (const witness of a.witnesses) {
                const next = join(state, witness);
                if (!next) continue;
                if (joined.length === MAX_STATES) { overflow = true; break outer; }
                joined.push(next);
            }
            if (overflow) limited = true;
            states = joined;
        }
    }
    if (!states.length)
        reports.push({ factId: "__scope__", family: "binding", modality: "REQUIRED", state: "UNKNOWN", reason: "REQUIRED_FACTS_HAVE_NO_COMMON_SCOPED_WITNESS", evidenceHashes: [], offerIds: [], areaIds: [] });
    // Avoid arbitrary pricing from one of many physical alternatives. Each state
    // is evaluated separately and complete fits win over unknown cheaper claims.
    const scored = states.map(state => {
        const next = reports.map(r => {
            const fact = selected.find(f => f.id === r.factId);
            if (!fact)
                return r;
            if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "PRICE")
                return { ...jointPrice(fact, selected, request, profile, state, visit), modality: r.modality };
            if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL") {
                const temporalVisit = temporalVisits.get(fact.id)!;
                if (temporalVisit.undatedDayPhase)
                    return { ...r, state: "CONTEXT" as const, reason: "UNDATED_DAYPART_NO_OPENING_CLAIM", evidenceHashes: [], offerIds: state.offerIds, areaIds: state.areaIds };
                const availability = state.offerIds.map(id => offerAvailability(profile!.offers.find(o => o.id === id)!, world, temporalVisit));
                // A venue-only request uses venue hours. It must not invent an
                // offer schedule merely because a scoped profile exists.
                if (!state.offerIds.length && !allAtoms.some(atom => selected.some(f => f.id === atom.report.factId && offerDuty(f)) && atom.report.offerIds.length > 0)) availability.push(librarianVenueAvailability(world, temporalVisit));
                const stateValue: MatchTruth = !temporalVisit.complete || !availability.length ? "UNKNOWN" : availability.some(a => a.state === "FAILED") ? "FAILED" : availability.some(a => a.state === "UNKNOWN") ? "UNKNOWN" : "MET";
                if (stateValue === "UNKNOWN" && temporalVisit.complete)
                    return { ...r, state: "CONTEXT" as const, reason: "VISIT_TIME_UNCONFIRMED", evidenceHashes: sorted(availability.flatMap(a => a.hashes)), offerIds: state.offerIds, areaIds: state.areaIds };
                return { ...r, state: stateValue, reason: stateValue === "MET" ? "JOINT_VISIT_TIME_CONFIRMED" : "VISIT_TIME_OR_AVAILABILITY_NOT_PROVEN", evidenceHashes: sorted(availability.flatMap(a => a.hashes)), offerIds: state.offerIds, areaIds: state.areaIds };
            }
            const sourceAtom = allAtoms.find(a => a.report.factId === r.factId);
            if (sourceAtom && r.state === "MET") {
                const witnesses = sourceAtom.witnesses.filter(w => w.offerIds.every(id => state.offerIds.includes(id)) && w.areaIds.every(id => state.areaIds.includes(id)) && Object.entries(w.assignments).every(([key, value]) => state.assignments[key] === undefined || state.assignments[key] === value));
                return { ...r, evidenceHashes: sorted(witnesses.flatMap(w => w.evidenceHashes)), offerIds: sorted(witnesses.flatMap(w => w.offerIds)), areaIds: sorted(witnesses.flatMap(w => w.areaIds)) };
            }
            return r;
        });
        if (!profile && next.some(r => r.reason === "LEGACY_TYPED_PRESENCE_CONFIRMED" && ["experience.activity", "offer.kind"].includes(r.family)))
            next.push({ factId: "legacy:offer-scope", family: "binding", modality: "REQUIRED", state: "UNKNOWN", reason: "LEGACY_OFFER_DETAILS_UNRESOLVED", evidenceHashes: [], offerIds: [], areaIds: [] });
        if (!profile && next.some(r => ["LEGACY_TYPED_DISCOVERY_SUPPORT", "LEGACY_TYPED_PRESENCE_CONFIRMED"].includes(r.reason)) && visit.requested) {
            const gate = librarianVenueAvailability(world, visit);
            next.push({ factId: "legacy:venue-time", family: "eligibility", modality: "REQUIRED", state: gate.state, reason: gate.reason, evidenceHashes: gate.hashes, offerIds: [], areaIds: [] });
        }
        const offerParticipants = Object.fromEntries(state.offerIds.map(id => [id, sorted(selected.filter(f =>
            offerDuty(f) && f.modality === "REQUIRED"
            && next.some(r => r.factId === f.id && r.offerIds.includes(id))).flatMap(f => f.subjectIds)
            .filter(personId => request.entities.some(e => e.id === personId && e.kind === "PERSON")))]));
        for (const gate of librarianGlobalEligibility({ request, facts: selected, world, visit, profile, offerIds: state.offerIds, offerParticipants, areaIds: state.areaIds, now }))
            next.push({ factId: `eligibility:${gate.reason}`, family: "eligibility", modality: "REQUIRED", state: gate.state, reason: gate.reason, evidenceHashes: gate.hashes, offerIds: gate.offerIds ?? state.offerIds, areaIds: state.areaIds });
        const active = request.bindings.filter(b => b.factIds.every(id => scenario.ids.includes(id)));
        for (const b of active)
            if (b.kind !== "SAME_PLACE")
                next.push({ factId: `binding:${contentHash(b).slice(0, 12)}`, family: "binding", modality: "REQUIRED", state: "UNKNOWN", reason: b.kind === "SEQUENCE" ? "MULTI_VISIT_SEQUENCE_NOT_SUPPORTED" : "SIMULTANEOUS_CAPACITY_NOT_PROVEN", evidenceHashes: [], offerIds: state.offerIds, areaIds: state.areaIds });
        const hard = next.filter(r => !["CONTEXT", "NOT_REQUIRED", "PREFERRED"].includes(r.state) && r.modality !== "PREFERRED");
        const failures = hard.filter(r => r.state === "FAILED"), unknown = hard.filter(r => r.state === "UNKNOWN");
        const preferenceMatches = next.filter(r => r.modality === "PREFERRED" && r.state === "MET" && (!allAtoms.find(a => a.report.factId === r.factId)?.witnesses.length || allAtoms.find(a => a.report.factId === r.factId)!.witnesses.some(w => join(state, w) !== null))).map(r => r.factId);
        return { state, next, failures, unknown, preferences: preferenceMatches, tieBreaker: contentHash(state) };
    }).sort((a, b) => a.failures.length - b.failures.length || a.unknown.length - b.unknown.length || b.preferences.length - a.preferences.length || a.tieBreaker.localeCompare(b.tieBreaker));
    const best = scored[0], facts = (best?.next ?? reports).map(r => limited && r.state === "FAILED" && !["LOCATION", "eligibility"].includes(r.family) ? { ...r, state: "UNKNOWN" as const, reason: "WITNESS_SEARCH_LIMIT" } : r);
    const failed = facts.filter(r => r.modality !== "PREFERRED" && r.state === "FAILED").map(r => r.factId), unknown = facts.filter(r => r.modality !== "PREFERRED" && r.state === "UNKNOWN").map(r => r.factId);
    const unresolved = request.diagnostics.filter(d => d.code !== "UNUSED_ENTITY" && (d.code === "CROSS_BRANCH_BINDING" ? d.relatedIds.every(id => scenario.ids.includes(id)) : d.relatedIds.some(id => scenario.ids.includes(id))));
    const core = selected.some(f => !neutral(f) && !["PRICE", "TEMPORAL", "LOCATION"].includes(LIBRARIAN_FAMILY_STRATEGIES[f.key]));
    const status = failed.length ? "INELIGIBLE" : unknown.length || limited || unresolved.length || !core || best?.state.uncertain ? "PARTIAL" : "CONFIRMED";
    return { spotId: world.spot.spotId, name: world.spot.identity.name, status, facts, selectedFactIds: selected.map(f => f.id), inactiveFactIds: sorted([...request.facts, ...request.extensions].filter(f => !selected.some(s => s.id === f.id) && !scenario.ids.includes(f.id)).map(f => f.id)), matchedPreferences: sorted(best?.preferences ?? []), unknownFactIds: sorted(unknown), failedFactIds: sorted(failed), offerIds: best?.state.offerIds ?? [], areaIds: best?.state.areaIds ?? [], limitations: sorted([...(limited ? ["WITNESS_SEARCH_LIMIT"] : []), ...(!core ? ["NO_EXPERIENCE_REQUEST"] : []), ...unresolved.map(d => d.code)]), snapshotHash: world.snapshotHash, alternativeOrder: scenario.order, conditionalPlans: [] };
}
const compareCandidates = (a: Pick<LibrarianCandidate, "status" | "matchedPreferences" | "unknownFactIds" | "spotId">, b: Pick<LibrarianCandidate, "status" | "matchedPreferences" | "unknownFactIds" | "spotId">) => ({ CONFIRMED: 0, PARTIAL: 1, INELIGIBLE: 2 }[a.status] - { CONFIRMED: 0, PARTIAL: 1, INELIGIBLE: 2 }[b.status] || a.unknownFactIds.length - b.unknownFactIds.length || b.matchedPreferences.length - a.matchedPreferences.length || a.spotId.localeCompare(b.spotId));
/** No input prose or spot descriptions are interpreted. Receives the frozen
 * Luna contract and manifest-bound catalog, preserving every active family. */
function runLibrarianCatalogSearch(input: {
    readonly request: LibrarianRequest;
    readonly catalog: readonly unknown[];
    readonly authority: {
        readonly city: string;
        readonly now: string;
    };
    readonly conditionEvidence?: readonly LibrarianConditionEvidence[];
    readonly limit?: number;
}, semantics: LibrarianSemanticIndex | null): { readonly result: Readonly<LibrarianSearchResult>; readonly worlds: readonly ProductWorldView[] } {
    const request = prepareLibrarianRequest({ contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, output: input.request.raw, sourceText: input.request.source.sourceText, reference: input.request.source.reference });
    if (request.requestHash !== input.request.requestHash)
        failure("request_hash_mismatch");
    if (!Number.isFinite(Date.parse(input.authority.now)) || !input.authority.city.trim())
        failure("authority_invalid");
    if (input.catalog.length > 1000)
        failure("catalog_limit");
    const limit = input.limit ?? 6;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
        failure("result_limit");
    const worlds = input.catalog.map(binding => parseProductWorldResolverBinding(binding, input.authority.city));
    if (new Set(worlds.map(w => w.spot.spotId)).size !== worlds.length)
        failure("duplicate_spot");
    const conditionIds = sorted(request.weatherConditions.map(c => c.id)), unknownConditions = new Set<string>();
    const candidates: readonly LibrarianCandidate[] = worlds.map(world => {
        const dateFacts = request.facts.filter(f => f.value.kind === "DATE" && f.value.operator === "EQ" && f.modality !== "EXCLUDED");
        const date = dateFacts.length === 1 && dateFacts[0]!.value.kind === "DATE" ? dateFacts[0]!.value.date : null;
        const truths = new Map<string, boolean>();
        const unknown: string[] = [];
        for (const id of conditionIds) {
            const evidence = input.conditionEvidence?.filter(e => e.requestHash === request.requestHash && e.conditionId === id && e.spotId === world.spot.spotId && e.localDate === date && /^[a-f0-9]{64}$/.test(e.sourceHash) && Number.isFinite(Date.parse(e.validUntil)) && Date.parse(e.validUntil) > Date.parse(input.authority.now)) ?? [];
            const values = new Set(evidence.map(e => e.state));
            if (values.size === 1 && !values.has("UNKNOWN"))
                truths.set(id, evidence[0]!.state === "TRUE");
            else {
                unknown.push(id);
                unknownConditions.add(id);
            }
        }
        if (unknown.length > 6) {
            const body = { spotId: world.spot.spotId, name: world.spot.identity.name, status: "PARTIAL" as const, facts: [], selectedFactIds: [], inactiveFactIds: request.facts.map(f => f.id), matchedPreferences: [], unknownFactIds: request.facts.filter(f => !neutral(f)).map(f => f.id), failedFactIds: [], offerIds: [], areaIds: [], limitations: ["WEATHER_BRANCH_LIMIT"], snapshotHash: world.snapshotHash, alternativeOrder: [], conditionalPlans: [] };
            return { ...body, candidateHash: contentHash(body) };
        }
        const outcomes: Omit<LibrarianCandidate, "candidateHash">[] = [];
        const conditionsByOutcome: {
            conditionId: string;
            truth: boolean;
        }[][] = [];
        for (let mask = 0; mask < 2 ** unknown.length; mask++) {
            const assignment = new Map(truths);
            unknown.forEach((id, i) => assignment.set(id, !!(mask & (1 << i))));
            let choices: readonly Scenario[];
            try {
                choices = scenarios(request.logic, assignment);
            }
            catch {
                choices = [];
            }
            const scored = choices.map(s => assessScenario(request, world, s, new Set(s.preferredIds), input.authority.now, semantics)).sort((a, b) => compareCandidates(a, b) || a.alternativeOrder.join(".").localeCompare(b.alternativeOrder.join(".")));
            if (!scored.length)
                failure("scenario_limit");
            outcomes.push(scored[0]!);
            conditionsByOutcome.push([...assignment].map(([conditionId, truth]) => ({ conditionId, truth })));
        }
        const best = [...outcomes].sort(compareCandidates)[0]!;
        const status: LibrarianCandidate["status"] = outcomes.every(o => o.status === "CONFIRMED") ? "CONFIRMED" : outcomes.every(o => o.status === "INELIGIBLE") ? "INELIGIBLE" : "PARTIAL";
        const common = (rows: readonly (readonly string[])[]) => sorted(rows[0] ?? []).filter(id => rows.every(row => row.includes(id)));
        const multiple = outcomes.length > 1, selectedIds = multiple ? common(outcomes.map(o => o.selectedFactIds)) : best.selectedFactIds;
        const body = { ...best, status, selectedFactIds: selectedIds, inactiveFactIds: multiple ? common(outcomes.map(o => o.inactiveFactIds)) : best.inactiveFactIds,
            facts: multiple ? best.facts.filter(f => selectedIds.includes(f.factId)) : best.facts,
            offerIds: multiple ? common(outcomes.map(o => o.offerIds)) : best.offerIds, areaIds: multiple ? common(outcomes.map(o => o.areaIds)) : best.areaIds,
            unknownFactIds: sorted([...outcomes.flatMap(o => o.unknownFactIds), ...(unknown.length && status !== "CONFIRMED" ? unknown.map(id => `condition:${id}`) : [])]),
            failedFactIds: multiple ? common(outcomes.map(o => o.failedFactIds)) : best.failedFactIds,
            matchedPreferences: multiple ? common(outcomes.map(o => o.matchedPreferences)) : best.matchedPreferences,
            conditionalPlans: multiple ? outcomes.map((o, i) => ({ conditions: conditionsByOutcome[i]!, status: o.status, facts: o.facts, offerIds: o.offerIds, areaIds: o.areaIds })) : [],
            limitations: sorted([...outcomes.flatMap(o => o.limitations), ...(unknown.length && status !== "CONFIRMED" ? ["WEATHER_CONDITION_UNKNOWN"] : [])]) };
        return { ...body, candidateHash: contentHash(body) };
    });
    const catalogHash = contentHash(worlds.map(w => ({ spotId: w.spot.spotId, snapshotHash: w.snapshotHash })).sort((a, b) => a.spotId.localeCompare(b.spotId)));
    const hasScenarioVisitEvidence = (facts: readonly LibrarianFactAssessment[]) => {
        // Every mandatory venue identity must be proved. A matching drink,
        // mood or unrelated activity cannot substitute for a requested type.
        const venue = facts.filter(assessment => {
            const fact = request.facts.find(fact => fact.id === assessment.factId);
            return fact && requestedLibrarianPlaceType(fact) !== null && !["PREFERRED", "CONTEXT", "NOT_REQUIRED"].includes(assessment.modality);
        });
        if (venue.some(fact => fact.state !== "MET")) return false;
        const activity = facts.filter(f => ["experience.activity", "offer.kind"].includes(f.family) && f.modality !== "PREFERRED" && f.modality !== "EXCLUDED" && !["CONTEXT", "NOT_REQUIRED"].includes(f.state));
        const positive = (f: LibrarianFactAssessment) => f.state === "MET" || f.state === "UNKNOWN" && (f.reason === "LEGACY_TYPED_DISCOVERY_SUPPORT" || f.reason === "CONDITIONS_OR_AVAILABILITY_UNKNOWN" && f.offerIds.length > 0);
        return activity.length ? activity.some(positive) : facts.some(f => positive(f) && !["LOCATION", "TEMPORAL", "PRICE", "CONTEXT"].includes(LIBRARIAN_FAMILY_STRATEGIES[f.family as keyof typeof LIBRARIAN_FAMILY_STRATEGIES] ?? "CONTEXT"));
    };
    const hasVisitEvidence = (c: LibrarianCandidate) => c.conditionalPlans.length
        ? c.conditionalPlans.some(plan => plan.status !== "INELIGIBLE" && hasScenarioVisitEvidence(plan.facts))
        : hasScenarioVisitEvidence(c.facts);
    const unresolved = candidates.filter(c => c.status !== "INELIGIBLE" && !hasVisitEvidence(c)).sort(compareCandidates);
    const ranked = candidates.filter(c => c.status !== "INELIGIBLE" && hasVisitEvidence(c)).sort(compareCandidates).slice(0, limit), excluded = candidates.filter(c => c.status === "INELIGIBLE").sort(compareCandidates);
    const body = { unresolved, contractVersion: LIBRARIAN_MATCHING_VERSION, requestHash: request.requestHash, languageHash: semantics ? contentHash({ builtIn: LIBRARIAN_LANGUAGE.hash, worldLanguage: LIBRARIAN_WORLD_LANGUAGE_VERSION, placeTypes: LIBRARIAN_PLACE_TYPE_LANGUAGE, meaningRegistry: semantics.registry.registryHash }) : contentHash({ builtIn: LIBRARIAN_LANGUAGE.hash, worldLanguage: LIBRARIAN_WORLD_LANGUAGE_VERSION, placeTypes: LIBRARIAN_PLACE_TYPE_LANGUAGE }), catalogHash, evaluatedAt: input.authority.now, ranked, excluded, unresolvedFamilyKeys: sorted(candidates.flatMap(c => [...c.facts, ...c.conditionalPlans.flatMap(p => p.facts)].filter(f => f.state === "UNKNOWN").map(f => f.family))), conditionEvidenceHash: contentHash(input.conditionEvidence ?? []), conditionUnknownIds: sorted([...unknownConditions]) };
    return { result: deepFreeze({ ...body, resultHash: contentHash(body) }), worlds };
}
export type LibrarianSearchInput = Parameters<typeof runLibrarianCatalogSearch>[0];
export const searchLibrarianCatalog = (input: LibrarianSearchInput) => runLibrarianCatalogSearch(input, null).result;
/** Same validated search, retaining its request-local snapshots for Product. */
export const searchLibrarianCatalogWithWorlds = (input: LibrarianSearchInput) => runLibrarianCatalogSearch(input, null);
/** Compile reviewed semantic data once at trusted server startup; requests
 * cannot replace approval hashes or inject their own meaning associations. */
export function createLibrarianCatalogMatcher(configuration: {
    readonly meaningRegistry: unknown;
    readonly acceptedRegistryHashes: readonly string[];
}) {
    const semantics = new LibrarianSemanticIndex(parseAcceptedLibrarianMeaningRegistry(configuration.meaningRegistry, configuration.acceptedRegistryHashes));
    return (input: LibrarianSearchInput) => runLibrarianCatalogSearch(input, semantics).result;
}
