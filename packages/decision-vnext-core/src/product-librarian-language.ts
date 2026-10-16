import { contentHash, deepFreeze } from "./canonical.js";
import { LUNA_LIBRARIAN_FACT_KEYS } from "./product-luna-librarian-assets.js";
import type { LunaFactKey } from "./product-luna-librarian.js";
export const LIBRARIAN_MATCHING_VERSION = "backyrd.decision-vnext.librarian-matching@13" as const;
import { EXPERIENCE_LANGUAGE_CONCEPTS, EXPERIENCE_LANGUAGE_DATA, } from "@backyrd/world-knowledge-core";
export { librarianTerm, librarianConcept, sameLibrarianText, OFFER_CONCEPTS, AREA_CONCEPTS, BOOLEAN_CONCEPTS } from "@backyrd/world-knowledge-core";
export const LIBRARIAN_LANGUAGE = deepFreeze({ version: LIBRARIAN_MATCHING_VERSION, concepts: EXPERIENCE_LANGUAGE_CONCEPTS, hash: contentHash(EXPERIENCE_LANGUAGE_DATA) });
const inputOnly = new Set<string>(["people.identity", "people.relationship", "people.role", "people.age", "people.age_bounds", "people.count", "people.pet", "people.mobility_aid", "people.experience", "people.capability", "people.participation", "budget.scope", "budget.coverage", "budget.cost_treatment", "budget.flexibility", "time.original", "time.reference", "time.relation", "time.timezone", "location.return", "location.transport_after_visit", "ranking.requested_evidence"]);
const temporal = new Set<string>(["time.date", "time.date_start", "time.date_end", "time.clock", "time.clock_start", "time.clock_end", "time.clock_bounds", "time.day_phase", "time.weekday"]);
export type LibrarianFamilyStrategy = "CONTEXT" | "TEMPORAL" | "PRICE" | "LOCATION" | "STRUCTURED" | "SCOPED_PROPERTY";
/** Every frozen family is explicitly carried into evaluation. Missing spot
 * support produces UNKNOWN, never a replacement family or silent omission. */
export const LIBRARIAN_FAMILY_STRATEGIES: Readonly<Record<LunaFactKey, LibrarianFamilyStrategy>> = Object.freeze(Object.fromEntries(Object.values(LUNA_LIBRARIAN_FACT_KEYS).flat().map(key => [key, inputOnly.has(key) ? "CONTEXT" : temporal.has(key) ? "TEMPORAL" : ["budget.maximum", "budget.target", "budget.amount"].includes(key) ? "PRICE" : ["location.destination", "location.country"].includes(key) ? "LOCATION" : ["experience.activity", "offer.kind", "offer.area", "offer.facility", "offer.feature", "participation.accessibility", "time.duration", "route.length", "offer.capacity"].includes(key) ? "STRUCTURED" : "SCOPED_PROPERTY"])) as Record<LunaFactKey, LibrarianFamilyStrategy>);

/** These wishes affect ordering, never admission. Their evidence still stays
 * scoped to the requested offer and is never relabelled as confirmed. */
export const librarianRankingOnlyFamily = (family: string, modality?: string, venueType = false): boolean =>
    modality === "EXCLUDED" && !venueType
    || family.startsWith("atmosphere.") || family.startsWith("amenity.")
    || ["experience.character", "offer.area", "location.setting", "offer.feature", "offer.facility", "offer.shade", "condition.weather_protection", "time.duration"].includes(family);
