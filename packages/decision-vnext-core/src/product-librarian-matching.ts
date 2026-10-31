import { librarianDiscoveryLocalities, localityKey } from "./product-librarian-geography.js";
import { eventVisitAvailability, eventFactMatch } from "./product-event-candidates.js";
import { compileLibrarianPlan, librarianDiagnosis, type LibrarianDiagnosis } from "./product-librarian-plan.js";
import { bookingEvidence, qualitativePriceEvidence, LIBRARIAN_KNOWLEDGE_POLICY, type DomainEvidence } from "./product-librarian-knowledge.js";
import { librarianRankingPreference, librarianMandatoryEvidenceSatisfied, librarianFactPropertySourceKeys, librarianFacilityConcept } from "./product-librarian-language.js";
import { assessLibrarianAccessibility, assessLegacyLibrarianFact, assessLibrarianPlaceType, requestedLibrarianPlaceType, LIBRARIAN_PLACE_TYPE_LANGUAGE, LIBRARIAN_WORLD_LANGUAGE_VERSION } from "./product-librarian-world-language.js";
import { LibrarianSemanticIndex, parseAcceptedLibrarianMeaningRegistry } from "./product-librarian-semantics.js";
import { librarianGlobalEligibility } from "./product-librarian-eligibility.js";
import { experienceBookingMode, spotTypeSupports, experienceActivitySupports, declaredExperienceConcepts, parseExperienceProfile, type ExperienceProfile, type ExperienceProperty, type ExperienceOffer, type ExperiencePrice } from "@backyrd/world-knowledge-core";
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
    readonly diagnosis?: LibrarianDiagnosis;
    readonly domainEvidence?: readonly DomainEvidence[];
    readonly propertyRead?: {
        readonly sourceKeys: readonly string[];
        readonly observedKeys: readonly string[];
        readonly knownValueChecks: number;
        readonly unknownValueChecks: number;
        readonly outsideConditionChecks: number;
    };
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
    readonly evaluationPlan: ReturnType<typeof compileLibrarianPlan>;
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
/** Catalogued offer duties may arrive in a domain family. Preserve the
 * emitted family; only establish which typed offer can witness it. Specific
 * drinks (wine, beer, etc.) still need their own property evidence. */
function offerDuty(fact: LibrarianFact): boolean {
    if (["experience.activity", "offer.kind"].includes(fact.key)) return true;
    if (fact.value.kind !== "TEXT") return false;
    const concept = librarianConcept(fact.value.text);
    return ["food.meal", "food.option"].includes(fact.key) && ["meal", "lunch", "dinner", "breakfast", "snacks", "aperitif"].includes(concept ?? "")
        || fact.key === "food.drink" && concept === "drinks"
        || librarianFacilityConcept(fact) === "playground";
}
const contextual = (fact: LibrarianFact) => fact.modality === "CONTEXT";
const neutral = (fact: LibrarianFact) => contextual(fact) || fact.modality === "NOT_REQUIRED";
function assignments(request: LibrarianRequest, fact: LibrarianFact, offerId: string | null, areaId: string | null): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    const concept = fact.value.kind === "TEXT" ? librarianConcept(fact.value.text) : null;
    if (fact.key === "offer.facility" && concept !== "playground")
        return result;
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
        if (fact.key === "condition.children" && desired === "children_activity" && property.key === "condition.children")
            return "UNKNOWN"; // Generic Kinderangebote can mean a child's menu or price.
        if (sameLibrarianText(property.value, fact.value.text)) return "MET";
        if (fact.key === "food.drink" && property.key === "experience.activity")
            return desired === "coffee" && librarianConcept(property.value) === "coffee" ? "MET" : "UNKNOWN";
        if (["food.drink", "food.dish", "food.cuisine", "food.diet"].includes(fact.key) && property.key === fact.key
            && desired && declaredExperienceConcepts(property.value, "ITEM_LIST").includes(desired)) return "MET";
        if (["offer.feature", "atmosphere.music", "condition.children"].includes(fact.key)
            && ["experience.activity", "atmosphere.music"].includes(property.key)) {
            const actual = librarianConcept(property.value);
            if (actual && desired && experienceActivitySupports(actual, desired)) return "MET";
        }
        if (fact.key === "experience.activity" && property.key === "experience.activity") {
            const actual = librarianConcept(property.value);
            if (actual && desired && experienceActivitySupports(actual, desired)) return "MET";
        }
        const actual = librarianConcept(property.value);
        if (["food.meal", "food.option"].includes(fact.key) && property.key === "food.meal_extent"
            && desired && ["meal", "snacks"].includes(desired) && actual === desired) return "MET";
        if (["offer.area", "location.setting"].includes(fact.key) && property.key === "location.setting") {
            if (desired === "outdoor" && actual === "terrace") return "MET";
        }
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
    let propertyRead: LibrarianFactAssessment["propertyRead"];
    const report = (state: LibrarianFactAssessment["state"], reason: string, witnesses: readonly Witness[] = []): Atom => ({ report: { factId: fact.id, family: fact.key, modality: preferenceOnly ? "PREFERRED" : fact.modality, state, reason, evidenceHashes: sorted(witnesses.flatMap(w => w.evidenceHashes)), offerIds: sorted(witnesses.flatMap(w => w.offerIds)), areaIds: sorted(witnesses.flatMap(w => w.areaIds)), ...(propertyRead ? {propertyRead} : {}) }, witnesses });
    if (fact.modality === "NOT_REQUIRED")
        return report("NOT_REQUIRED", "NO_MATCHING_DUTY");
    if (contextual(fact))
        return report("CONTEXT", "RETAINED_AS_REQUEST_CONTEXT");
    if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "UNSUPPORTED" && !semantics?.sourceKeys(fact).length)
        return report("UNKNOWN", "REQUEST_EVALUATOR_NOT_IMPLEMENTED");
    if (fact.key === "people.count" && fact.value.kind === "COUNT")
        return report("UNKNOWN", "DEFERRED_TO_SCOPED_GROUP_CAPACITY");
    if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "CONTEXT")
        return report("UNKNOWN", "REQUEST_PARAMETER_NOT_VERIFIABLE_AS_REQUIREMENT");
    if (world.eventOccurrence && eventFactMatch(world.eventOccurrence,fact))
        return report(fact.modality === "EXCLUDED" ? "FAILED" : "MET", "EXPLICIT_EVENT_FEATURE", [{evidenceHashes:[world.snapshotHash],offerIds:profile?.offers.map(o=>o.id)??[],areaIds:[],assignments:assignments(request,fact,profile?.offers[0]?.id??null,null),conditionUnresolved:false,chargeable:true}]);
    if (fact.key === "location.destination" || fact.key === "location.country") {
        const key = fact.key === "location.destination" ? "location.locality" : "location.country_code", row = world.facts.find(r => r.key === key);
        if (!row || typeof row.value !== "string" || fact.value.kind !== "TEXT")
            return report("UNKNOWN", "LOCATION_EVIDENCE_MISSING");
        const locationTerm = (text: string) => librarianTerm(text).normalize("NFKD").replace(/\p{M}/gu, "");
        const equal = locationTerm(row.value) === locationTerm(fact.value.text), state = equal ? "MET" : "FAILED";
        return report(fact.modality === "EXCLUDED" ? (equal ? "FAILED" : "MET") : state, "VERIFIED_LOCATION", [{ evidenceHashes: [row.entryHash], offerIds: [], areaIds: [], assignments: {}, conditionUnresolved: false, chargeable: false }]);
    }
    const accessibility = assessLibrarianAccessibility(fact, world);
    if (accessibility) return report(accessibility.state, accessibility.reason, accessibility.hashes.length ? [{ evidenceHashes: accessibility.hashes, offerIds: [], areaIds: [], assignments: {}, conditionUnresolved: accessibility.state === "UNKNOWN", chargeable: false }] : []);
    if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL" || LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "PRICE")
        return report("UNKNOWN", "DEFERRED_TO_JOINT_VISIT_EVALUATION");
    if (fact.key === "budget.qualitative" || ["participation.booking", "participation.entry_mode"].includes(fact.key) && fact.value.kind === "TEXT" && ["NOT_REQUIRED", "REQUIRED"].includes(experienceBookingMode(fact.value.text) ?? ""))
        return report("UNKNOWN", "DEFERRED_TO_SCOPED_DOMAIN_EVALUATION");
    // Overlapping words such as Café can denote an actual embedded offer.
    // Its real scoped witness takes precedence over whole-venue classification.
    const concept = fact.value.kind === "TEXT" ? librarianConcept(fact.value.text) : null;
    const scopedKind = profile && concept && offerDuty(fact)
        && profile.offers.some(offer => concept === "zoo" && offer.kind === "VISIT" || (OFFER_CONCEPTS[offer.kind] ?? []).includes(concept));
    const placeType = !scopedKind && !librarianFacilityConcept(fact) ? assessLibrarianPlaceType(preferenceOnly ? { ...fact, modality: "PREFERRED" } : fact, world) : null;
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
    const add = (truth: MatchTruth, offer: ExperienceOffer | null, areaId: string | null, evidence: unknown, conditional = false, sourceHashes: readonly string[] = []) => {
        // A nonmatching/unknown value is not evidence of semantic support.
        if (truth === "UNKNOWN") return;
        if (truth === "MET" && spatialActivities.length) {
            const supportsArea = (a: Atom) => a.witnesses.some(w => w.offerIds.some(id =>
                profile.offers.some(o => o.id === id && areaId !== null && o.areaIds.includes(areaId)))
                && (!w.areaIds.length || areaId !== null && w.areaIds.includes(areaId)));
            if (!offer || !spatialActivities.some(a => a.witnesses.some(w => w.offerIds.includes(offer.id)))
                || spatialActivities.some(a => a.report.state !== "MET" || !supportsArea(a))) return;
        }
        // A whole-venue amenity does not locate that facility outdoors/indoors.
        if (librarianFacilityConcept(fact) === "playground" && areaId === null
            && request.facts.some(f => f.modality === "REQUIRED" && ["offer.area", "location.setting"].includes(f.key))) conditional = true;
        const availability = offer ? offerAvailability(offer, world, visit) : { state: "MET" as const, hashes: [], reason: "AREA_FACT" };
        const witness: Witness = { evidenceHashes: sorted([profileHash, contentHash(evidence), ...sourceHashes, ...availability.hashes]), offerIds: offer ? [offer.id] : [], areaIds: areaId ? [areaId] : [], assignments: assignments(request, fact, offer?.id ?? null, areaId), conditionUnresolved: conditional, chargeable: offerDuty(fact) || fact.key.startsWith("food.") };
        if (fact.modality === "EXCLUDED" && availability.state !== "MET")
            uncertain.push(witness);
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
    if (desired && ["experience.activity", "offer.feature", "atmosphere.music", "condition.children"].includes(fact.key)) {
        for (const offer of profile.offers) {
            const declared = declaredExperienceConcepts(offer.name, "OFFER_NAME");
            const genericChildMeal = fact.key === "condition.children" && desired === "children_activity"
                && (OFFER_CONCEPTS[offer.kind] ?? []).some(activity => ["meal", "drinks", "snacks"].includes(activity));
            if (!genericChildMeal && declared.some(actual => experienceActivitySupports(actual, desired)))
                for (const areaId of offer.areaIds.length ? offer.areaIds : [null]) add("MET", offer, areaId, {declaredOfferName: offer.name});
            if (["condition.children", "experience.activity", "offer.kind"].includes(fact.key) && desired === "children_activity") {
                // A documented family exhibition is a child-compatible outing,
                // even though it is not labelled as a dedicated children's course.
                const activities = OFFER_CONCEPTS[offer.kind] ?? [];
                const leisure = activities.some(a => ["exhibition", "museum", "zoo", "movement_play", "children_course"].includes(a));
                const allAges = offer.properties.filter(p => p.key === "participation.age_suitability" && p.state === "KNOWN"
                    && typeof p.value === "string" && ["alle altersgruppen", "all ages", "tous ages"].includes(librarianTerm(p.value)));
                for (const areaId of offer.areaIds.length ? offer.areaIds : [null]) {
                    const properties = [...profile.properties, ...offer.properties, ...(profile.areas.find(a => a.id === areaId)?.properties ?? [])];
                    const family = properties.filter(p => p.key === "atmosphere.character" && p.state === "KNOWN" && typeof p.value === "string"
                        && ["familienfreundlich", "family friendly", "family_friendly"].includes(librarianTerm(p.value)));
                    const evidence = [...allAges, ...family];
                    if (leisure && allAges.length && family.length) {
                        const states = evidence.map(p => librarianConditions(p.conditions, visit));
                        if (!states.includes("FAILED")) add("MET", offer, areaId, {policy:"FAMILY_LEISURE_ALL_AGES", properties:evidence}, states.includes("UNKNOWN"));
                    }
                }
            }
            if (fact.key === "condition.children" && desired === "children_activity"
                && (OFFER_CONCEPTS[offer.kind] ?? []).some(actual => experienceActivitySupports(actual, desired)))
                for (const areaId of offer.areaIds.length ? offer.areaIds : [null]) add("MET", offer, areaId, {kind: offer.kind});
        }
    }
    if (librarianFacilityConcept(fact) === "playground") {
        for (const area of profile.areas.filter(a => a.kind === "PLAYGROUND")) {
            const offers = profile.offers.filter(o => o.areaIds.includes(area.id));
            for (const offer of offers.length ? offers : [null]) {
                // Legacy game rooms can also carry PLAYGROUND. Their actual
                // darts/billiards offering does not establish a children's playground.
                if (offer && !(OFFER_CONCEPTS[offer.kind] ?? []).some(c => ["movement_play", "children_course"].includes(c))) continue;
                add("MET", offer, area.id, {catalogAreaKind: area.kind, requestedFacility: desired});
            }
        }
    }
    if (["offer.area", "location.setting"].includes(fact.key) && desired && ["indoor", "outdoor", "terrace"].includes(desired)) {
        for (const area of profile.areas)
            if ((AREA_CONCEPTS[area.kind] ?? []).includes(desired)
                && !area.properties.some(p => p.key === "location.setting" && (p.state !== "KNOWN"
                    || typeof p.value === "string" && ["indoor", "outdoor", "terrace"].includes(librarianConcept(p.value) ?? "")))) {
                const offers = profile.offers.filter(o => o.areaIds.includes(area.id));
                for (const offer of offers)
                    add("MET", offer, area.id, area, offer.kind === "VISIT" && offer.areaIds.length > 1);
            }
    }
    const keys = librarianFactPropertySourceKeys(fact, semantics?.sourceKeys(fact));
    const observedKeys = new Set<string>();
    let knownValueChecks = 0, unknownValueChecks = 0, outsideConditionChecks = 0;
    let typedWorldLimitation: string | null = null;
    const inspect = (properties: readonly ExperienceProperty[], offer: ExperienceOffer | null, areaId: string | null, areaScoped = false) => {
        for (const property of properties.filter(p => keys.includes(p.key))) {
            observedKeys.add(property.key);
            const condition = librarianConditions(property.conditions, visit);
            if (condition === "FAILED") {
                outsideConditionChecks++;
                continue;
            }
            if (property.state === "KNOWN") knownValueChecks++; else unknownValueChecks++;
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
        if (fact.key.startsWith("atmosphere."))
            inspect(area.properties, null, area.id, true);
        else if (offers.length)
            for (const offer of offers)
                inspect(area.properties, offer, area.id, true);
        else
            inspect(area.properties, null, area.id, true);
    }
    // Typed World knowledge and authored experience properties share the same
    // witness path. Explicit scoped knowledge takes precedence, including an
    // explicit unknown. A venue-level food list cannot identify which of several
    // different meals contains a particular dish or diet.
    if (["food.cuisine", "food.dish", "food.diet", "atmosphere.character"].includes(fact.key)) {
        const legacy = assessLegacyLibrarianFact(preferenceOnly ? {...fact, modality: "PREFERRED"} : fact, world, visit);
        if (legacy.reason === "LEGACY_TYPED_DISCOVERY_SUPPORT") typedWorldLimitation = "WORLD_SOURCE_NOT_AUTHORIZED_FOR_REQUIREMENT";
        const owns = (properties: readonly ExperienceProperty[]) => properties.some(p => keys.includes(p.key));
        if (legacy.state === "MET" && !owns(profile.properties)) {
            if (fact.key.startsWith("food.")) {
                const meals = profile.offers.filter(o => (OFFER_CONCEPTS[o.kind] ?? []).some(c => ["meal", "lunch", "dinner", "breakfast", "snacks"].includes(c)));
                if (meals.length === 1 && !owns(meals[0]!.properties))
                    for (const areaId of meals[0]!.areaIds.length ? meals[0]!.areaIds : [null])
                        if (!owns(profile.areas.find(a => a.id === areaId)?.properties ?? []))
                            add("MET", meals[0]!, areaId, {typedWorldInheritance: fact.key}, false, legacy.hashes);
            } else if (!profile.areas.length && !profile.offers.some(o => owns(o.properties))) {
                add("MET", null, null, {typedWorldInheritance: fact.key}, false, legacy.hashes);
            } else for (const area of profile.areas) {
                const linked = profile.offers.filter(o => o.areaIds.includes(area.id));
                if (!owns(area.properties) && !linked.some(o => owns(o.properties)))
                    add("MET", null, area.id, {typedWorldInheritance: fact.key}, false, legacy.hashes);
            }
        }
    }
    propertyRead = {sourceKeys: keys, observedKeys: sorted([...observedKeys]), knownValueChecks, unknownValueChecks, outsideConditionChecks};
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
    const unresolvedReason = !observedKeys.size && typedWorldLimitation ? typedWorldLimitation : !observedKeys.size ? "PROPERTY_FAMILY_NOT_RECORDED"
        : !knownValueChecks && outsideConditionChecks && !unknownValueChecks ? "PROPERTY_OUTSIDE_REQUESTED_CONDITIONS"
        : !knownValueChecks ? "PROPERTY_VALUE_NOT_KNOWN" : "PROPERTY_VALUE_NOT_PROVEN";
    return report("UNKNOWN", uncertain.length ? "CONDITIONS_OR_AVAILABILITY_UNKNOWN" : unresolvedReason, unique(uncertain));
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
/** A party size is a minimum required offer capacity, not an exact capacity
 * and not proof of a bookable slot. Prices and unrelated rooms are no proof. */
function jointCapacity(fact: LibrarianFact, profile: ExperienceProfile | null, state: State, visit: VisitWindow): LibrarianFactAssessment {
    const result = (status: MatchTruth, reason: string, hashes: readonly string[] = []): LibrarianFactAssessment => ({ factId: fact.id, family: fact.key, modality: fact.modality, state: status, reason, evidenceHashes: hashes, offerIds: state.offerIds, areaIds: state.areaIds });
    if (fact.value.kind !== "COUNT" || fact.value.operator !== "EQ" || fact.modality === "EXCLUDED" || !profile || !state.offerIds.length)
        return result("UNKNOWN", "GROUP_CAPACITY_SCOPE_UNRESOLVED");
    const needed = fact.value.amount;
    const capacities = state.offerIds.map(id => profile.offers.find(o => o.id === id)!.properties.filter(p => p.key === "offer.capacity" && p.state === "KNOWN" && typeof p.value === "number" && librarianConditions(p.conditions, visit) === "MET"));
    const hashes = capacities.flatMap(ps => ps.map(p => contentHash(p)));
    if (capacities.some(ps => ps.length !== 1)) return result("UNKNOWN", "SCOPED_GROUP_CAPACITY_UNKNOWN_OR_CONFLICTING", hashes);
    return capacities.every(ps => (ps[0]!.value as number) >= needed)
        ? result("MET", "SCOPED_GROUP_CAPACITY_CONFIRMED_NOT_A_BOOKING", hashes)
        : result("FAILED", "SCOPED_GROUP_CAPACITY_TOO_SMALL", hashes);
}
function jointPrice(fact: LibrarianFact, facts: readonly LibrarianFact[], request: LibrarianRequest, profile: ExperienceProfile | null, state: State, visit: VisitWindow, eventEntry = false): LibrarianFactAssessment {
    const money = fact.value;
    const base = { factId: fact.id, family: fact.key, modality: fact.modality, evidenceHashes: [] as readonly string[], offerIds: state.offerIds, areaIds: state.areaIds };
    const result = (s: MatchTruth, reason: string, hashes: readonly string[] = []): LibrarianFactAssessment => ({ ...base, state: s, reason, evidenceHashes: hashes });
    if (!profile || money.kind !== "MONEY" || !state.offerIds.length)
        return result("UNKNOWN", "PRICE_SCOPE_UNBOUND");
    const physicalSubjects = fact.subjectIds.filter(id => ["ACTIVITY", "OFFER"].includes(request.entities.find(e => e.id === id)?.kind ?? ""));
    const scopedOfferIds = physicalSubjects.length ? sorted(Object.entries(state.assignments).filter(([key]) => physicalSubjects.some(id => key.startsWith(`owner:${id}:offer:`))).map(([, id]) => id)).filter(id => state.chargeOfferIds.includes(id)) : state.chargeOfferIds;
    if (!scopedOfferIds.length)
        return result("UNKNOWN", "PRICE_SCOPE_UNBOUND");
    // Zero is invariant across currency and headcount. Only a bound, explicit
    // free event tariff proves this; a missing price or an unrelated free offer
    // cannot satisfy a free activity request. Component-specific budgets retain
    // their existing coverage check below.
    if (eventEntry && money.amount === 0 && ["EQ", "LTE"].includes(money.operator)
        && !facts.some(f => ["budget.coverage", "budget.cost_treatment"].includes(f.key))) {
        const freePrices = scopedOfferIds.map(id => profile.offers.find(o => o.id === id)?.prices.filter(p =>
            p.min === 0 && p.max === 0 && p.basis === "PER_PERSON" && p.minimumAge === null && p.maximumAge === null
            && p.mandatoryFeesIncluded === true && librarianConcept(p.includes) === "entry"
            && librarianConditions(p.conditions, visit) === "MET"));
        if (freePrices.every(prices => prices?.length === 1))
            return result(fact.modality === "EXCLUDED" ? "FAILED" : "MET", "SCOPED_FREE_EVENT_CONFIRMED", freePrices.flatMap(prices => prices!.map(p => contentHash(p))));
        const paid = scopedOfferIds.flatMap(id => {
            const prices = profile.offers.find(o => o.id === id)?.prices.filter(p => p.basis === "PER_PERSON"
                && p.minimumAge === null && p.maximumAge === null && librarianConcept(p.includes) === "entry"
                && librarianConditions(p.conditions, visit) === "MET") ?? [];
            return prices.length && prices.every(p => p.min > 0) ? prices : [];
        });
        if (paid.length)
            return result(fact.modality === "EXCLUDED" ? "MET" : "FAILED", "SCOPED_EVENT_ENTRY_NOT_FREE", paid.map(p => contentHash(p)));
    }
    // A documented zero full tariff needs neither currency conversion nor
    // group-size division. Partial items, fees and age-limited tariffs do not
    // establish that the requested activity as a whole is free.
    if (!eventEntry && money.amount === 0 && ["EQ", "LTE"].includes(money.operator)
        && !facts.some(f => ["budget.coverage", "budget.cost_treatment"].includes(f.key))) {
        const tariffs = scopedOfferIds.map(id => {
            const offer = profile.offers.find(o => o.id === id)!;
            const concepts = OFFER_CONCEPTS[offer.kind] ?? [];
            const relevant = offer.prices.filter(p =>
                concepts.includes(librarianConcept(p.includes) ?? "") || librarianConcept(p.includes) === "entry" && !["CAFE", "LUNCH", "DINNER", "BREAKFAST", "DRINKS", "FULL_MEAL", "APERITIF"].includes(offer.kind));
            if (relevant.some(p => librarianConditions(p.conditions, visit) !== "FAILED" && (p.minimumAge !== null || p.maximumAge !== null || p.mandatoryFeesIncluded !== true || librarianConditions(p.conditions, visit) === "UNKNOWN"))) return [];
            return relevant.filter(p => ["PER_PERSON", "PER_GROUP"].includes(p.basis) && librarianConditions(p.conditions, visit) === "MET");
        });
        if (tariffs.every(ps => ps.length > 0 && ps.every(p => p.min === 0 && p.max === 0)))
            return result(fact.modality === "EXCLUDED" ? "FAILED" : "MET", "SCOPED_FREE_ACTIVITY_CONFIRMED", tariffs.flatMap(ps => ps.map(p => contentHash(p))));
    }
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
        const purpose = eventEntry ? "entry" : ["meal", "lunch", "dinner", "breakfast"].some(c => concepts.includes(c)) ? "meal" : concepts.includes("coffee") ? "coffee" : concepts.includes("drinks") ? "drinks" : ["VISIT", "PERMANENT_EXHIBITION", "SPECIAL_EXHIBITION"].includes(offer.kind) ? "entry" : null;
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
            if (c.price.max === null)
                return result(compare(min, money.amount, money.operator) === false && ["LTE", "LT"].includes(money.operator) ? "FAILED" : "UNKNOWN", "PRICE_MAXIMUM_UNKNOWN", hashes);
            max += groupPerPerson ? roundShare(c.price.max * c.factor) : c.price.max * c.factor;
            hashes.push(contentHash(c.price));
        }
    }
    const pass = compare(max, money.amount, money.operator), minimumPass = compare(min, money.amount, money.operator);
    let truth: MatchTruth;
    if (money.operator === "EQ")
        truth = money.amount >= min && money.amount <= max ? "MET" : "FAILED";
    else if (money.operator === "NEQ")
        truth = money.amount < min || max < money.amount ? "MET" : min === max && min === money.amount ? "FAILED" : "UNKNOWN";
    else if (["GTE", "GT"].includes(money.operator))
        truth = pass === null ? "UNKNOWN" : pass ? "MET" : "FAILED";
    else
        truth = minimumPass === null ? "UNKNOWN" : minimumPass ? "MET" : "FAILED";
    return result(fact.modality === "EXCLUDED" ? (truth === "MET" ? "FAILED" : truth === "FAILED" ? "MET" : "UNKNOWN") : truth, truth === "MET" ? "SCOPED_PRICE_RANGE_BUDGET_CONFIRMED" : "BUDGET_NOT_PROVEN_OR_EXCEEDED", hashes);
}
function assessScenario(request: LibrarianRequest, world: ProductWorldView, scenario: Scenario, preferenceIds: ReadonlySet<string>, now: string, semantics: LibrarianSemanticIndex | null): Omit<LibrarianCandidate, "candidateHash"> {
    const referenced = new Set(collectFacts(request.logic));
    const branchEntities = new Set(request.facts.filter(f => scenario.ids.includes(f.id)).flatMap(f => f.subjectIds));
    const selected = request.facts.filter(f => scenario.ids.includes(f.id) || f.modality === "CONTEXT" && !referenced.has(f.id) && (!f.subjectIds.some(id => ["ACTIVITY", "OFFER", "AREA"].includes(request.entities.find(e => e.id === id)?.kind ?? "")) || f.subjectIds.some(id => branchEntities.has(id))));
    const activeRequest = { ...request, facts: selected.map(f => preferenceIds.has(f.id) ? { ...f, modality: "PREFERRED" as const } : f) };
    const visit = createLibrarianVisitWindow(selected.filter(f => f.modality !== "PREFERRED" && !preferenceIds.has(f.id)), world.spot.location.timezone, now);
    const source = profileFor(world, visit, now), profile = source?.profile ?? null;
    // Availability is pure for this immutable world and visit window. Reuse
    // its proof across witnesses/states instead of rebuilding calendar data.
    const availabilityByVisit = new WeakMap<VisitWindow, Map<string, ReturnType<typeof librarianOfferAvailability>>>();
    const offerAvailability: typeof librarianOfferAvailability = (offer, snapshot, window) => {
        let cache = availabilityByVisit.get(window);
        if (!cache) { cache = new Map(); availabilityByVisit.set(window, cache); }
        let value = cache.get(offer.id);
        if (!value) { value = snapshot.eventOccurrence ? eventVisitAvailability(snapshot.eventOccurrence, window) : librarianOfferAvailability(offer, snapshot, window); cache.set(offer.id, value); }
        return value;
    };
    const temporalVisits = new Map(selected.filter(f => LIBRARIAN_FAMILY_STRATEGIES[f.key] === "TEMPORAL").map(f => [f.id,
        f.modality === "PREFERRED" || preferenceIds.has(f.id)
            ? createLibrarianVisitWindow([...selected.filter(s => s.modality !== "PREFERRED" && !preferenceIds.has(s.id)), { ...f, modality: "REQUIRED" }], world.spot.location.timezone, now)
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
        const deferred = LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "PRICE" || LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL" || fact.key === "people.count";
        if (!neutral(fact) && fact.modality !== "PREFERRED" && !preferenceIds.has(fact.id) && !deferred && !librarianRankingPreference(fact.modality) && a.report.state === "MET") {
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
            if (fact.key === "people.count" && !["CONTEXT", "NOT_REQUIRED"].includes(r.modality))
                return { ...jointCapacity(fact, profile, state, visit), modality: r.modality };
            if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "PRICE")
                return { ...jointPrice(fact, selected, request, profile, state, visit, world.eventOccurrence !== undefined), modality: r.modality };
            if (r.reason === "DEFERRED_TO_SCOPED_DOMAIN_EVALUATION") {
                // Evaluate the rule against the selected consumption/activity,
                // never an unrelated coffee, workshop or tour at the same venue.
                const physicalSubjects = fact.subjectIds.filter(id => request.entities.some(entity => entity.id === id && ["ACTIVITY", "OFFER", "AREA"].includes(entity.kind)));
                const owned = physicalSubjects.length ? state.chargeOfferIds.filter(id => physicalSubjects.some(subject => state.assignments[`owner:${subject}:offer:${id}`] === id)) : state.chargeOfferIds;
                const relevantIds = owned.length ? owned : state.chargeOfferIds.length ? [] : state.offerIds;
                const selectedProfile = profile ? { ...profile, offers: profile.offers.filter(offer => relevantIds.includes(offer.id)) } : null;
                const domain = fact.key === "budget.qualitative" ? qualitativePriceEvidence(fact, world, selectedProfile) : bookingEvidence(fact, selected, world, selectedProfile, visit);
                const rows = (profile && !relevantIds.length ? [] : domain ?? []).filter(row => (!row.offerId || relevantIds.includes(row.offerId)) && (!row.areaId || !state.areaIds.length || state.areaIds.includes(row.areaId)));
                const truths = rows.map(row => fact.modality === "EXCLUDED" ? row.state === "MET" ? "FAILED" : row.state === "FAILED" ? "MET" : "UNKNOWN" : row.state);
                const truth: MatchTruth = truths.some(value => value === "FAILED") ? "FAILED" : !truths.length || truths.includes("UNKNOWN") ? "UNKNOWN" : "MET";
                const decisive = rows.find(row => row.state === "FAILED") ?? rows.find(row => row.state === "UNKNOWN") ?? rows[0];
                return { ...r, state: truth, reason: decisive?.reason ?? "DOMAIN_OFFER_SCOPE_UNBOUND", evidenceHashes: sorted(rows.flatMap(row => row.sourceHashes).concat(rows.map(row => contentHash({ policy: LIBRARIAN_KNOWLEDGE_POLICY, row })))), offerIds: relevantIds, areaIds: state.areaIds, domainEvidence: rows };
            }
            if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL") {
                const temporalVisit = temporalVisits.get(fact.id)!;
                if (temporalVisit.undatedDayPhase)
                    return { ...r, state: "UNKNOWN" as const, reason: "UNDATED_DAYPART_NO_OPENING_CLAIM", evidenceHashes: [], offerIds: state.offerIds, areaIds: state.areaIds };
                const availability = state.offerIds.map(id => offerAvailability(profile!.offers.find(o => o.id === id)!, world, temporalVisit));
                // A venue-only request uses venue hours. It must not invent an
                // offer schedule merely because a scoped profile exists.
                if (!state.offerIds.length && !allAtoms.some(atom => selected.some(f => f.id === atom.report.factId && offerDuty(f)) && atom.report.offerIds.length > 0)) availability.push(world.eventOccurrence ? eventVisitAvailability(world.eventOccurrence, temporalVisit) : librarianVenueAvailability(world, temporalVisit));
                const stateValue: MatchTruth = !temporalVisit.complete || !availability.length ? "UNKNOWN" : availability.some(a => a.state === "FAILED") ? "FAILED" : availability.some(a => a.state === "UNKNOWN") ? "UNKNOWN" : "MET";
                if (stateValue === "UNKNOWN" && temporalVisit.complete)
                    return { ...r, state: "UNKNOWN" as const, reason: "VISIT_TIME_UNCONFIRMED", evidenceHashes: sorted(availability.flatMap(a => a.hashes)), offerIds: state.offerIds, areaIds: state.areaIds };
                return { ...r, state: stateValue, reason: stateValue === "MET" ? "JOINT_VISIT_TIME_CONFIRMED" : "VISIT_TIME_OR_AVAILABILITY_NOT_PROVEN", evidenceHashes: sorted(availability.flatMap(a => a.hashes)), offerIds: state.offerIds, areaIds: state.areaIds };
            }
            const sourceAtom = allAtoms.find(a => a.report.factId === r.factId);
            if (sourceAtom && r.state === "MET") {
                if (librarianRankingPreference(fact.modality)) {
                    const compatible = sourceAtom.witnesses.filter(w => join(state, w) !== null);
                    if (!compatible.length && sourceAtom.witnesses.length)
                        return { ...r, state: "UNKNOWN" as const, reason: "RANKING_DETAIL_NOT_PROVEN_FOR_SELECTED_OFFER", evidenceHashes: [], offerIds: [], areaIds: [] };
                    return { ...r, evidenceHashes: sorted(compatible.flatMap(w => w.evidenceHashes)), offerIds: sorted(compatible.flatMap(w => w.offerIds)), areaIds: sorted(compatible.flatMap(w => w.areaIds)) };
                }
                const witnesses = sourceAtom.witnesses.filter(w => w.offerIds.every(id => state.offerIds.includes(id)) && w.areaIds.every(id => state.areaIds.includes(id)) && Object.entries(w.assignments).every(([key, value]) => state.assignments[key] === undefined || state.assignments[key] === value)
                    && (!(fact.key.startsWith("atmosphere.") || fact.key === "experience.character") || !state.chargeOfferIds.length || w.offerIds.every(id => state.chargeOfferIds.includes(id))));
                if (sourceAtom.witnesses.length && !witnesses.length)
                    return {...r, state: "UNKNOWN" as const, reason: "REQUIRED_DETAIL_NOT_PROVEN_FOR_SELECTED_OFFER", evidenceHashes: [], offerIds: [], areaIds: []};
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
        if (visit.requested && profile) for (const id of state.offerIds) {
            const availability = offerAvailability(profile.offers.find(o => o.id === id)!, world, visit);
            if (availability.state !== "MET") next.push({ factId: `availability:${id}`, family: "eligibility", modality: "REQUIRED", state: availability.state, reason: availability.reason, evidenceHashes: availability.hashes, offerIds: [id], areaIds: state.areaIds });
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
        const hard = next.filter(r => r.modality === "REQUIRED" || r.modality === "EXCLUDED");
        const failures = hard.filter(r => r.state === "FAILED"), unknown = hard.filter(r => r.state === "UNKNOWN");
        const preferenceMatches = next.filter(r => r.modality === "PREFERRED" && r.state === "MET" && (!allAtoms.find(a => a.report.factId === r.factId)?.witnesses.length || allAtoms.find(a => a.report.factId === r.factId)!.witnesses.some(w => join(state, w) !== null))).map(r => r.factId);
        return { state, next, failures, unknown, preferences: preferenceMatches, tieBreaker: contentHash(state) };
    }).sort((a, b) => a.failures.length - b.failures.length || a.unknown.length - b.unknown.length || b.preferences.length - a.preferences.length || a.tieBreaker.localeCompare(b.tieBreaker));
    const best = scored[0], facts = (best?.next ?? reports).map(r => limited && r.state === "FAILED" && !["LOCATION", "eligibility"].includes(r.family) ? { ...r, state: "UNKNOWN" as const, reason: "WITNESS_SEARCH_LIMIT" } : r).map(r => {
        const diagnosis = r.state === "UNKNOWN" ? librarianDiagnosis(r.reason) : undefined;
        return diagnosis ? { ...r, diagnosis } : r;
    });
    const failed = facts.filter(r => (r.modality === "REQUIRED" || r.modality === "EXCLUDED") && r.state === "FAILED").map(r => r.factId), unknown = facts.filter(r => (r.modality === "REQUIRED" || r.modality === "EXCLUDED") && r.state !== "MET" && r.state !== "FAILED").map(r => r.factId);
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
        readonly authorizedLocalities?: readonly string[];
    };
    readonly eventViews?: readonly ProductWorldView[];
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
    if (!Number.isInteger(limit) || limit < 1 || limit > 1500)
        failure("result_limit");
    const policyLocalities = librarianDiscoveryLocalities(input.authority.city);
    const localities = input.authority.authorizedLocalities ?? policyLocalities;
    if (!localities.length || localities.some(city => !policyLocalities.some(allowed => localityKey(city) === localityKey(allowed))))
        failure("authority_region_invalid");
    const evaluationPlan = compileLibrarianPlan(request, semantics);
    const worlds = [...input.catalog.map(binding => parseProductWorldResolverBinding(binding, input.authority.city, input.authority.authorizedLocalities ?? librarianDiscoveryLocalities(input.authority.city))), ...(input.eventViews ?? [])];
    if ((input.eventViews?.length ?? 0) > 500 || worlds.length > 1500) failure("catalog_limit");
    if (new Set(worlds.map(w => w.spot.spotId)).size !== worlds.length)
        failure("duplicate_spot");
    const conditionIds = sorted(request.weatherConditions.map(c => c.id)), unknownConditions = new Set<string>();
    const candidates: readonly LibrarianCandidate[] = worlds.map(world => {
        if (world.eventOccurrence && (!["PUBLISHED","SCHEDULED"].includes(world.eventOccurrence.eventStatus) || world.eventOccurrence.occurrenceStatus !== "SCHEDULED" || world.eventOccurrence.ticketStatus === "SOLD_OUT")) {
            const body = {spotId:world.spot.spotId,name:world.spot.identity.name,status:"INELIGIBLE" as const,facts:[],selectedFactIds:[],inactiveFactIds:[],matchedPreferences:[],unknownFactIds:[],failedFactIds:["EVENT_NOT_SCHEDULED"],offerIds:[],areaIds:[],limitations:["EVENT_NOT_SCHEDULED"],snapshotHash:world.snapshotHash,alternativeOrder:[],conditionalPlans:[]};
            return {...body,candidateHash:contentHash(body)};
        }
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
        if (!librarianMandatoryEvidenceSatisfied(facts)) return false;
        // Geography, time and price alone do not establish an experience.
        return facts.some(f => f.state === "MET" && f.modality === "REQUIRED"
            && !["LOCATION", "TEMPORAL", "PRICE", "CONTEXT"].includes(
                LIBRARIAN_FAMILY_STRATEGIES[f.family as keyof typeof LIBRARIAN_FAMILY_STRATEGIES] ?? "CONTEXT"));
    };
    const hasVisitEvidence = (c: LibrarianCandidate) => c.status === "CONFIRMED"
        && c.unknownFactIds.length === 0 && c.failedFactIds.length === 0
        && (c.conditionalPlans.length
            ? c.conditionalPlans.every(plan => plan.status === "CONFIRMED" && hasScenarioVisitEvidence(plan.facts))
            : hasScenarioVisitEvidence(c.facts));
    const unresolved = candidates.filter(c => c.status !== "INELIGIBLE" && !hasVisitEvidence(c)).sort(compareCandidates);
    const ranked = candidates.filter(hasVisitEvidence).sort(compareCandidates).slice(0, limit);
    const excluded = candidates.filter(c => c.status === "INELIGIBLE").sort(compareCandidates);
    const body = { unresolved, evaluationPlan, contractVersion: LIBRARIAN_MATCHING_VERSION, requestHash: request.requestHash, languageHash: semantics ? contentHash({ builtIn: LIBRARIAN_LANGUAGE.hash, worldLanguage: LIBRARIAN_WORLD_LANGUAGE_VERSION, placeTypes: LIBRARIAN_PLACE_TYPE_LANGUAGE, meaningRegistry: semantics.registry.registryHash }) : contentHash({ builtIn: LIBRARIAN_LANGUAGE.hash, worldLanguage: LIBRARIAN_WORLD_LANGUAGE_VERSION, placeTypes: LIBRARIAN_PLACE_TYPE_LANGUAGE }), catalogHash, evaluatedAt: input.authority.now, ranked, excluded, unresolvedFamilyKeys: sorted(candidates.flatMap(c => [...c.facts, ...c.conditionalPlans.flatMap(p => p.facts)].filter(f => f.state === "UNKNOWN").map(f => f.family))), conditionEvidenceHash: contentHash(input.conditionEvidence ?? []), conditionUnknownIds: sorted([...unknownConditions]) };
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
