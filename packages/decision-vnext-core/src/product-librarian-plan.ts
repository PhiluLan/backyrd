import { contentHash, deepFreeze } from "./canonical.js";
import { LIBRARIAN_FAMILY_STRATEGIES, librarianFactPropertySourceKeys, librarianExternalConsumptionKind, librarianFacilityConcept, librarianConcept } from "./product-librarian-language.js";
import { LIBRARIAN_KNOWLEDGE_POLICY, QUALITATIVE_PRICE_POLICY, qualitativePricePolicyFor } from "./product-librarian-knowledge.js";
import type { LibrarianSemanticIndex } from "./product-librarian-semantics.js";
import type { LibrarianFact, LibrarianRequest } from "./product-luna-librarian.js";
import { AREA_CATALOG } from "@backyrd/world-knowledge-core";

export type LibrarianDiagnosis = "MISSING_DATA" | "UNSUPPORTED_REQUIREMENT" | "REQUEST_NEEDS_CLARIFICATION" | "UNINTERPRETED_VALUE" | "CONFLICTING_DATA" | "CONDITIONS_UNRESOLVED" | "EVIDENCE_INSUFFICIENT" | "SOURCE_NOT_AUTHORIZED";
export const LIBRARIAN_PROOF_POLICY = "backyrd.librarian-proof-policy@1" as const;
export type LibrarianProofDimension = "EXPERIENCE" | "REQUIREMENT" | "AVAILABILITY" | "ACCESS" | "CONTEXT";
export function librarianFacilityVisitAreaKinds(fact: LibrarianFact): readonly string[] {
    const concept = librarianFacilityConcept(fact);
    return concept ? AREA_CATALOG.filter(area => librarianConcept(area.label) === concept || librarianConcept(area.kind) === concept).map(area => area.kind) : [];
}

/** A facility can be the destination or support another requested experience.
 * This depends on the active typed activity scopes, never venue names or the
 * original sentence. A generic inferred family outing is not a second visit.
 */
export function librarianFacilityIsVisit(request: LibrarianRequest, fact: LibrarianFact, active: readonly LibrarianFact[]): boolean {
    if (!librarianFacilityVisitAreaKinds(fact).length) return false;
    const scopes = (f: LibrarianFact) => f.subjectIds.filter(id => request.entities.some(e => e.id === id && ["ACTIVITY", "OFFER", "AREA"].includes(e.kind)));
    const own = scopes(fact);
    return !active.some(other => {
        if (other.id === fact.id || other.modality !== "REQUIRED" || !["experience.activity", "offer.kind", "food.meal"].includes(other.key)
            || librarianFacilityConcept(other) || other.value.kind !== "TEXT" || librarianConcept(other.value.text) === "children_activity") return false;
        const theirs = scopes(other);
        return !own.length || !theirs.length || own.some(id => theirs.includes(id));
    });
}

export function librarianProofDimension(request: LibrarianRequest, fact: LibrarianFact, active: readonly LibrarianFact[]): LibrarianProofDimension {
    if (["CONTEXT", "NOT_REQUIRED"].includes(fact.modality)) return "CONTEXT";
    if (LIBRARIAN_FAMILY_STRATEGIES[fact.key] === "TEMPORAL") return "AVAILABILITY";
    if (["experience.activity", "offer.kind", "food.meal"].includes(fact.key) || librarianFacilityIsVisit(request, fact, active)
        || fact.value.kind === "TEXT" && ["offer.feature", "atmosphere.music"].includes(fact.key)
            && ["live_jazz", "live_music", "music_event", "jazz"].includes(librarianConcept(fact.value.text) ?? "")
        || fact.value.kind === "TEXT" && ["condition.children", "food.option", "food.drink"].includes(fact.key)
            && ["children_activity", "meal", "snacks", "drinks"].includes(librarianConcept(fact.value.text) ?? "")) return "EXPERIENCE";
    return "REQUIREMENT";
}

type ProofAssessment = { readonly factId: string; readonly family: string; readonly modality: string; readonly state: string; readonly reason: string; readonly evidenceHashes: readonly string[]; readonly offerIds: readonly string[]; readonly areaIds: readonly string[] };
/** One admission ledger. Fit, schedule and restrictions are independent axes;
 * uncertainty on one axis must neither erase evidence on another nor become a
 * successful visit claim. All required/excluded duties remain blocking.
 */
export function librarianDecisionProof(request: LibrarianRequest, assessments: readonly ProofAssessment[], activeIds: readonly string[]) {
    const active = request.facts.filter(f => activeIds.includes(f.id));
    const entries = assessments.map(row => {
        const fact = active.find(f => f.id === row.factId);
        const fromUser = fact !== undefined || request.extensions.some(extension => extension.id === row.factId);
        const dimension: LibrarianProofDimension = fact ? librarianProofDimension(request, fact, active)
            : row.family === "eligibility" ? row.factId.startsWith("availability:") || row.factId === "legacy:venue-time" ? "AVAILABILITY" : "ACCESS" : "REQUIREMENT";
        const blocking = ["REQUIRED", "EXCLUDED"].includes(row.modality);
        return { factId: row.factId, dimension, origin: fromUser ? "USER_PLAN" as const : "VISIT_CHECK" as const, branchProofHash: null as string | null,
            basis: fact?.basis ?? null, subjectIds: fact?.subjectIds ?? [], offerIds: row.offerIds, areaIds: row.areaIds,
            modality: row.modality, blocking, state: row.state, reason: row.reason, evidenceHashes: row.evidenceHashes };
    });
    const verdict = (duties: readonly typeof entries[number][]) => {
        return !duties.length ? "NOT_REQUESTED" as const : duties.some(e => e.state === "FAILED") ? "CONTRADICTED" as const
            : duties.every(e => e.state === "MET") ? "SUPPORTED" as const : "UNRESOLVED" as const;
    };
    const axis = (dimension: LibrarianProofDimension) => verdict(entries.filter(e => e.dimension === dimension && e.blocking));
    // A property-only discovery request (e.g. Italian cuisine) remains valid.
    // Fit uses all requested semantic criteria, but never schedule, price or
    // generated entry checks as a substitute for the requested experience.
    const semanticFit = verdict(entries.filter(e => e.blocking && active.some(f => f.id === e.factId
        && !["TEMPORAL", "PRICE", "LOCATION", "CONTEXT"].includes(LIBRARIAN_FAMILY_STRATEGIES[f.key]))));
    const body = { policyVersion: LIBRARIAN_PROOF_POLICY, entries, semanticFit, experience: axis("EXPERIENCE"), requirements: axis("REQUIREMENT"), availability: axis("AVAILABILITY"), access: axis("ACCESS"),
        failedFactIds: entries.filter(e => e.blocking && e.state === "FAILED").map(e => e.factId),
        unknownFactIds: entries.filter(e => e.blocking && !["MET", "FAILED"].includes(e.state)).map(e => e.factId),
        informationFactIds: entries.filter(e => !e.blocking && e.state === "UNKNOWN").map(e => e.factId) };
    return deepFreeze({ ...body, proofHash: contentHash(body) });
}

/** Unknown external conditions mean alternative possible worlds, not an AND
 * of mutually exclusive visits. A contradiction in only one possible branch
 * is uncertainty until that branch is selected, never a universal rejection.
 */
export function combineLibrarianDecisionProof(proofs: readonly ReturnType<typeof librarianDecisionProof>[], unknownConditions: readonly string[]): ReturnType<typeof librarianDecisionProof> {
    if (!proofs.length) throw new Error("librarian_decision_proof_branches_missing");
    const axis = (key: "semanticFit" | "experience" | "requirements" | "availability" | "access") => {
        const states = new Set(proofs.map(proof => proof[key]));
        return states.size === 1 ? proofs[0]![key] : "UNRESOLVED" as const;
    };
    const conditions = unknownConditions.map(id => ({factId:`condition:${id}`, dimension:"REQUIREMENT" as const, origin:"VISIT_CHECK" as const, branchProofHash:null,
        basis:null,subjectIds:[],offerIds:[],areaIds:[],modality:"REQUIRED",blocking:true,state:"UNKNOWN",reason:"EXTERNAL_CONDITION_UNRESOLVED",evidenceHashes:[]}));
    const body = {policyVersion:LIBRARIAN_PROOF_POLICY,entries:[...proofs.flatMap(proof => proof.entries.map(entry => ({...entry,branchProofHash:proof.proofHash}))),...conditions],
        semanticFit:axis("semanticFit"),experience:axis("experience"),requirements:unknownConditions.length ? "UNRESOLVED" as const : axis("requirements"),availability:axis("availability"),access:axis("access"),
        failedFactIds:proofs[0]!.failedFactIds.filter(id => proofs.every(proof => proof.failedFactIds.includes(id))),
        unknownFactIds:[...new Set([...proofs.flatMap(proof => proof.unknownFactIds),...conditions.map(row=>row.factId)])].sort(),
        informationFactIds:[...new Set(proofs.flatMap(proof => proof.informationFactIds))].sort()};
    return deepFreeze({...body,proofHash:contentHash(body)});
}
export function librarianDiagnosis(reason: string): LibrarianDiagnosis | undefined {
    if (reason === "REQUEST_EVALUATOR_NOT_IMPLEMENTED" || reason === "REQUEST_PARAMETER_NOT_VERIFIABLE_AS_REQUIREMENT" || reason.endsWith("MEANING_UNSUPPORTED")) return "UNSUPPORTED_REQUIREMENT";
    if (reason === "QUALITATIVE_PRICE_POLICY_UNDEFINED") return "REQUEST_NEEDS_CLARIFICATION";
    if (reason.includes("NOT_AUTHORIZED")) return "SOURCE_NOT_AUTHORIZED";
    if (reason.includes("CONFLICT")) return "CONFLICTING_DATA";
    if (reason.includes("NOT_UNDERSTOOD")) return "UNINTERPRETED_VALUE";
    if (reason.includes("NOT_RECORDED") || reason.endsWith("MISSING") || reason === "PROPERTY_VALUE_NOT_KNOWN") return "MISSING_DATA";
    if (reason.includes("CONDITIONS") || reason.includes("TIME_UNCONFIRMED") || reason.includes("WEEKDAY_UNKNOWN")) return "CONDITIONS_UNRESOLVED";
    if (reason.includes("NOT_PROVEN") || reason.includes("UNPROVEN") || reason.includes("UNBOUND")) return "EVIDENCE_INSUFFICIENT";
    return undefined;
}

const worldSources: Readonly<Record<string, readonly string[]>> = {
    "food.cuisine": ["offering.cuisines"],
    "food.dish": ["offering.food_specialities"],
    "food.diet": ["offering.cuisines", "offering.food_specialities"],
    "atmosphere.character": ["context.atmosphere"],
    "experience.activity": ["classification.place_types", "offering.groups", "offering.onsite", "experience.profile"],
    "offer.kind": ["classification.place_types", "experience.profile"],
    "participation.accessibility": ["accessibility.step_free_entrance", "accessibility.accessible_indoor", "accessibility.accessible_outdoor", "accessibility.accessible_seating", "accessibility.accessible_toilet", "accessibility.wheelchair_paths"],
};

/** Compile semantics once, before looking at any venue. Support is a software
 * property; missing evidence is a venue property. Never conflate the two. */
export function compileLibrarianPlan(request: LibrarianRequest, semantics: LibrarianSemanticIndex | null = null) {
    const requirements = [...request.facts, ...request.extensions].map(fact => {
        const semanticKeys = "key" in fact ? semantics?.sourceKeys(fact) ?? [] : [];
        const family = "key" in fact ? fact.key : null;
        const nativeOperator = family ? LIBRARIAN_FAMILY_STRATEGIES[family] : "UNSUPPORTED";
        const operator = nativeOperator === "UNSUPPORTED" && semanticKeys.length ? "SCOPED_PROPERTY" : nativeOperator;
        const consumption = "key" in fact ? librarianExternalConsumptionKind(fact) : null;
        const sources = consumption ? [consumption === "FOOD" ? "rule.external_food" : "rule.external_drink", "participation.permission"]
            : operator === "BOOKING" ? ["rule.reservation", "participation.booking", "participation.entry_mode"]
            : operator === "QUALITATIVE_PRICE" ? ["operation.price_level"]
            : operator === "PRICE" ? ["experience.profile.offers.prices"]
            : operator === "TEMPORAL" ? ["hours.regular", "hours.special", "hours.kitchen", "hours.kitchen_special", "state.current", "experience.profile.offers.schedule"]
            : "key" in fact ? [...librarianFactPropertySourceKeys(fact, semanticKeys), ...(worldSources[fact.key] ?? [])] : [];
        const inputOnly = fact.modality === "CONTEXT" || fact.modality === "NOT_REQUIRED";
        const support = inputOnly ? "INPUT" as const : operator === "UNSUPPORTED" ? "UNSUPPORTED" as const
            : operator === "QUALITATIVE_PRICE" && qualitativePricePolicyFor(fact) === "CLARIFY" ? "NEEDS_POLICY" as const : "SUPPORTED" as const;
        return { factId: fact.id, family: family ?? "extension", modality: fact.modality, subjects: fact.subjectIds, operator, support,
            proofRule: inputOnly ? "CONTEXT_APPLIES_TO_DOCUMENTED_RULES" : fact.modality === "PREFERRED" ? "OPTIONAL_MATCH"
                : fact.modality === "EXCLUDED" ? "EXCLUSION_MUST_BE_PROVEN" : "POSITIVE_EVIDENCE_REQUIRED",
            sourceKeys: [...new Set(sources)].sort() };
    });
    const weather = request.weatherConditions.map(condition => ({ ...condition, role: condition.role ?? "CONDITIONAL",
        authority: condition.role === "CONTEXT" ? "USER_VISIT_CONTEXT" : "EXTERNAL_EVIDENCE_REQUIRED" }));
    const body = { contractVersion: "backyrd.librarian-evaluation-plan@2" as const, requestHash: request.requestHash, proofPolicy: LIBRARIAN_PROOF_POLICY,
        contextPolicy: { participantAttributes: "APPLY_DOCUMENTED_RESTRICTIONS", missingRestriction: "INFORM_WITHOUT_ASSERTING_ACCESS", missingParticipantAge: "SHOW_DOCUMENTED_LIMIT_WITHOUT_ASSERTING_AGE_COMPLIANCE", missingRequestedProperty: "UNRESOLVED", missingRequestedHours: "UNRESOLVED" },
        policyVersion: LIBRARIAN_KNOWLEDGE_POLICY, meaningRegistryHash: semantics?.registry.registryHash ?? null, qualitativePricePolicy: QUALITATIVE_PRICE_POLICY, qualitativePricePreferencePolicy: "PRICE_LEVEL", requirements, weather };
    return deepFreeze({ ...body, planHash: contentHash(body) });
}

export const requiredRequestIssue = (fact: Pick<LibrarianFact, "modality">, support: string) =>
    ["REQUIRED", "EXCLUDED"].includes(fact.modality) && ["UNSUPPORTED", "NEEDS_POLICY"].includes(support);
