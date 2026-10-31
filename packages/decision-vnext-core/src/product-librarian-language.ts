import { contentHash, deepFreeze } from "./canonical.js";
import { LUNA_LIBRARIAN_FACT_KEYS } from "./product-luna-librarian-assets.js";
import type { LunaFactKey } from "./product-luna-librarian.js";
export const LIBRARIAN_MATCHING_VERSION = "backyrd.decision-vnext.librarian-matching@21" as const;
import { EXPERIENCE_LANGUAGE_CONCEPTS, EXPERIENCE_LANGUAGE_DATA, EXPERIENCE_QUESTIONS } from "@backyrd/world-knowledge-core";
export { librarianTerm, librarianConcept, sameLibrarianText, OFFER_CONCEPTS, AREA_CONCEPTS, BOOLEAN_CONCEPTS } from "@backyrd/world-knowledge-core";
/** Additional compatible evidence fields, never replacements for the original
 * field. Value meaning, scope, conditions and authority are checked separately. */
export const LIBRARIAN_PROPERTY_SOURCE_ALIASES: Readonly<Partial<Record<LunaFactKey, readonly string[]>>> = deepFreeze({
    "atmosphere.conversation": ["atmosphere.character"],
    "participation.entry_mode": ["participation.booking"],
    "experience.activity": ["food.drink"],
    "food.drink": ["experience.activity"],
    "experience.character": ["atmosphere.character"],
    "offer.facility": ["offer.feature"],
    "offer.kind": ["stay.room_type"],
    "offer.area": ["location.setting"],
    "participation.accessibility": ["amenity.step_free", "amenity.stroller"],
    "offer.feature": ["atmosphere.music", "experience.activity", ...Object.keys(EXPERIENCE_LANGUAGE_DATA.booleanConcepts)],
    "atmosphere.music": ["experience.activity"],
    "condition.children": ["experience.activity"],
});
export const librarianPropertySourceKeys = (family: LunaFactKey, acceptedSemanticKeys: readonly string[] = []): readonly string[] =>
    [...new Set([family, ...(LIBRARIAN_PROPERTY_SOURCE_ALIASES[family] ?? []), ...acceptedSemanticKeys])].sort();
const inputOnly = new Set<string>(["people.identity", "people.relationship", "people.role", "people.age", "people.age_bounds", "people.count", "people.pet", "people.mobility_aid", "people.experience", "people.capability", "people.participation", "budget.scope", "budget.coverage", "budget.cost_treatment", "budget.flexibility", "time.original", "time.reference", "time.relation", "time.timezone", "location.return", "location.transport_after_visit", "ranking.requested_evidence"]);
const temporal = new Set<string>(["time.date", "time.date_start", "time.date_end", "time.clock", "time.clock_start", "time.clock_end", "time.clock_bounds", "time.day_phase", "time.weekday"]);
export type LibrarianFamilyStrategy = "CONTEXT" | "TEMPORAL" | "PRICE" | "LOCATION" | "STRUCTURED" | "SCOPED_PROPERTY" | "BOOKING" | "QUALITATIVE_PRICE" | "UNSUPPORTED";
const propertyKeys = new Set(EXPERIENCE_QUESTIONS.map(question => question.key));
const structuredKeys = new Set(["experience.activity", "offer.kind", "food.meal", "offer.area", "offer.facility", "offer.feature", "participation.accessibility", "time.duration", "route.length", "offer.capacity", "people.count"]);
function familyStrategy(key: LunaFactKey): LibrarianFamilyStrategy {
    if (inputOnly.has(key)) return "CONTEXT";
    if (temporal.has(key)) return "TEMPORAL";
    if (["budget.maximum", "budget.target", "budget.amount"].includes(key)) return "PRICE";
    if (["location.destination", "location.country"].includes(key)) return "LOCATION";
    if (["participation.booking", "participation.entry_mode"].includes(key)) return "BOOKING";
    if (key === "budget.qualitative") return "QUALITATIVE_PRICE";
    if (structuredKeys.has(key)) return "STRUCTURED";
    // A valid request field is not automatically an implemented capability.
    // Only fields with actual canonical evidence sources use property matching.
    return librarianPropertySourceKeys(key).some(source => propertyKeys.has(source)) ? "SCOPED_PROPERTY" : "UNSUPPORTED";
}
/** Every frozen family is explicitly carried into evaluation. Missing spot
 * support produces UNKNOWN, never a replacement family or silent omission. */
export const LIBRARIAN_FAMILY_STRATEGIES: Readonly<Record<LunaFactKey, LibrarianFamilyStrategy>> = Object.freeze(Object.fromEntries(Object.values(LUNA_LIBRARIAN_FACT_KEYS).flat().map(key => [key, familyStrategy(key)])) as Record<LunaFactKey, LibrarianFamilyStrategy>);

/** Only an explicit preference may affect ordering without blocking admission.
 * Field families never override the modality supplied by the meaning plan. */
export const librarianRankingPreference = (modality: string): boolean => modality === "PREFERRED";

/** Shared admission invariant, checked again when building Product assessments.
 * Context and NOT_REQUIRED are not duties; unsupported duties stay UNKNOWN. */
export function librarianMandatoryEvidenceSatisfied(facts: readonly {
    readonly modality: string; readonly state: string;
}[]): boolean {
    return facts.filter(f => f.modality === "REQUIRED" || f.modality === "EXCLUDED")
        .every(f => f.state === "MET");
}

export const LIBRARIAN_LANGUAGE = deepFreeze({ version: LIBRARIAN_MATCHING_VERSION, concepts: EXPERIENCE_LANGUAGE_CONCEPTS,
    hash: contentHash({version: LIBRARIAN_MATCHING_VERSION, experienceLanguage: EXPERIENCE_LANGUAGE_DATA, propertySourceAliases: LIBRARIAN_PROPERTY_SOURCE_ALIASES, strategies: LIBRARIAN_FAMILY_STRATEGIES}) });

// Ranking and evaluation use one version authority. New evaluator versions must
// never silently fall back to the unrelated legacy situation-only filter.
export const PRODUCT_LIBRARIAN_EVALUATOR_VERSION = "decision-vnext-librarian-evaluator@11" as const;
export const PRODUCT_EVENT_LIBRARIAN_EVALUATOR_VERSION = "decision-vnext-librarian-evaluator@12" as const;
export const LIBRARIAN_EVALUATOR_VERSIONS: readonly string[] = Object.freeze([
    ...[1, 3, 4, 5, 6, 7, 8, 9, 10].map(version => `decision-vnext-librarian-evaluator@${version}`),
    PRODUCT_LIBRARIAN_EVALUATOR_VERSION, PRODUCT_EVENT_LIBRARIAN_EVALUATOR_VERSION,
]);
