import { contentHash, deepFreeze } from "./canonical.js";
import { LIBRARIAN_FAMILY_STRATEGIES, librarianFactPropertySourceKeys } from "./product-librarian-language.js";
import { LIBRARIAN_KNOWLEDGE_POLICY, QUALITATIVE_PRICE_POLICY } from "./product-librarian-knowledge.js";
import type { LibrarianSemanticIndex } from "./product-librarian-semantics.js";
import type { LibrarianFact, LibrarianRequest } from "./product-luna-librarian.js";

export type LibrarianDiagnosis = "MISSING_DATA" | "UNSUPPORTED_REQUIREMENT" | "REQUEST_NEEDS_CLARIFICATION" | "UNINTERPRETED_VALUE" | "CONFLICTING_DATA" | "CONDITIONS_UNRESOLVED" | "EVIDENCE_INSUFFICIENT" | "SOURCE_NOT_AUTHORIZED";
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
        const sources = operator === "BOOKING" ? ["rule.reservation", "participation.booking", "participation.entry_mode"]
            : operator === "QUALITATIVE_PRICE" ? ["operation.price_level"]
            : operator === "PRICE" ? ["experience.profile.offers.prices"]
            : operator === "TEMPORAL" ? ["hours.regular", "hours.special", "hours.kitchen", "hours.kitchen_special", "state.current", "experience.profile.offers.schedule"]
            : "key" in fact ? [...librarianFactPropertySourceKeys(fact, semanticKeys), ...(worldSources[fact.key] ?? [])] : [];
        const inputOnly = fact.modality === "CONTEXT" || fact.modality === "NOT_REQUIRED";
        const support = inputOnly ? "INPUT" as const : operator === "UNSUPPORTED" ? "UNSUPPORTED" as const
            : operator === "QUALITATIVE_PRICE" && QUALITATIVE_PRICE_POLICY === "CLARIFY" ? "NEEDS_POLICY" as const : "SUPPORTED" as const;
        return { factId: fact.id, family: family ?? "extension", modality: fact.modality, subjects: fact.subjectIds, operator, support,
            sourceKeys: [...new Set(sources)].sort() };
    });
    const body = { contractVersion: "backyrd.librarian-evaluation-plan@1" as const, requestHash: request.requestHash, policyVersion: LIBRARIAN_KNOWLEDGE_POLICY, meaningRegistryHash: semantics?.registry.registryHash ?? null, qualitativePricePolicy: QUALITATIVE_PRICE_POLICY, requirements };
    return deepFreeze({ ...body, planHash: contentHash(body) });
}

export const requiredRequestIssue = (fact: Pick<LibrarianFact, "modality">, support: string) =>
    ["REQUIRED", "EXCLUDED"].includes(fact.modality) && ["UNSUPPORTED", "NEEDS_POLICY"].includes(support);
