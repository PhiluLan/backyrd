import { contentHash } from "./canonical.js";
import type { ProductRequirement } from "./product-request-understanding.js";
import { ATTRIBUTE_DEFINITIONS, REGISTRY_HASH, type PriceLevel } from "@backyrd/world-knowledge-core";

// The prompt and validator are projections of the canonical World registry,
// never an independently maintained list of spot facts.
const REQUESTABLE_KEYS = new Set([
  "classification.primary_category", "classification.place_types", "purpose.primary_visit",
  "offering.cuisines", "offering.food_specialities", "offering.groups",
  "context.visit_situations", "context.atmosphere", "context.typical_dayparts",
  "operation.price_level", "operation.service_format", "amenity.features",
]);

export const PRODUCT_QUERY_CATALOG = Object.freeze(ATTRIBUTE_DEFINITIONS
  .filter((field) => REQUESTABLE_KEYS.has(field.key) && field.engineAuthorization === "AUTHORIZED" && field.allowedValues?.length)
  .map((field) => Object.freeze({ key: field.key, label: field.labels.de, values: field.allowedValues! })));

export const PRODUCT_QUERY_CATALOG_HASH = REGISTRY_HASH;
const choices = new Map(PRODUCT_QUERY_CATALOG.map((field) => [field.key, new Set(field.values)]));
const preferencePattern = /^WK:([a-z][a-z0-9_.]+):([A-Z][A-Z0-9_]*)$/;
const constraintPattern = /^WK_(REQUIRED|EXCLUDED):([A-Z][A-Z0-9]{0,7}):([a-z][a-z0-9_.]+):([A-Z][A-Z0-9_]*)$/;

export function validWorldPreference(key: string, value: string): boolean {
  return choices.get(key)?.has(value) ?? false;
}

export function encodeWorldPreference(key: string, value: string): string {
  if (!validWorldPreference(key, value)) throw new Error("product_query_preference_invalid");
  return `WK:${key}:${value}`;
}

export function decodeWorldPreference(value: string): { readonly key: string; readonly value: string } | null {
  const match = preferencePattern.exec(value);
  return match?.[1] && match[2] && validWorldPreference(match[1], match[2]) ? { key: match[1], value: match[2] } : null;
}

export type WorldQueryConstraint = { readonly role: "REQUIRED" | "EXCLUDED"; readonly group: string; readonly key: string; readonly value: string };

export function encodeWorldQueryConstraint(role: WorldQueryConstraint["role"], group: string, key: string, value: string): string {
  if (!/^[A-Z][A-Z0-9]{0,7}$/.test(group) || !validWorldPreference(key, value)) throw new Error("product_query_constraint_invalid");
  return `WK_${role}:${group}:${key}:${value}`;
}

export function decodeWorldQueryConstraint(value: string): WorldQueryConstraint | null {
  const match = constraintPattern.exec(value);
  return match?.[1] && match[2] && match[3] && match[4] && validWorldPreference(match[3], match[4])
    ? { role: match[1] as WorldQueryConstraint["role"], group: match[2], key: match[3], value: match[4] }
    : null;
}

export const PRODUCT_INDOOR_CONSTRAINT = "INDOOR_REQUIRED" as const;

// A place-type implication, not a claim that a particular venue is open,
// accessible or fully weatherproof. Ambiguous/mixed types stay UNKNOWN.
const INDOOR_TYPES = new Set([
  "MUSEUM", "GALLERY", "THEATRE", "CINEMA", "LIBRARY", "ARCADE", "ESCAPE_ROOM",
  "BOWLING_ALLEY", "CLIMBING_GYM", "GYM", "SPORTS_CENTRE", "ICE_RINK",
  "RESTAURANT", "BRASSERIE", "BISTRO", "CAFE", "BAR", "PUB", "BAKERY",
  "NIGHTCLUB", "MUSIC_CLUB", "HOTEL", "AQUARIUM", "SHOPPING_CENTRE",
]);
const OUTDOOR_TYPES = new Set([
  "PARK", "TRAIL", "NATURE_RESERVE", "VIEWPOINT", "WATERFRONT",
  "BOTANICAL_GARDEN", "ZOO", "MINI_GOLF", "FESTIVAL_SITE",
]);

export function inferredIndoorSuitability(placeTypes: readonly string[]): "INDOOR" | "OUTDOOR" | "UNKNOWN" {
  if (!placeTypes.length) return "UNKNOWN";
  const indoor = placeTypes.some((type) => INDOOR_TYPES.has(type));
  const outdoor = placeTypes.some((type) => OUTDOOR_TYPES.has(type));
  if (indoor && !outdoor) return "INDOOR";
  if (outdoor && !indoor) return "OUTDOOR";
  return "UNKNOWN";
}


/** Founder-approved CHF meal-per-person calibration. Only the ordinal hint
 * floors whole francs; the original monetary constraint remains cent-exact.
 * Existing World labels are not a verified monetary price for any venue. */
export const PRODUCT_CHF_MEAL_PRICE_POLICY = "chf-meal-per-person-v1" as const;
export const PRODUCT_CHF_MEAL_PRICE_BANDS: readonly { readonly level: PriceLevel; readonly ordinal: number; readonly maximumWholeFrancs: number | null }[] = Object.freeze([
  Object.freeze({ level: "VERY_LOW", ordinal: 1, maximumWholeFrancs: 10 }),
  Object.freeze({ level: "LOW", ordinal: 2, maximumWholeFrancs: 19 }),
  Object.freeze({ level: "MEDIUM", ordinal: 3, maximumWholeFrancs: 30 }),
  Object.freeze({ level: "HIGH", ordinal: 4, maximumWholeFrancs: 60 }),
  Object.freeze({ level: "PREMIUM", ordinal: 5, maximumWholeFrancs: null }),
]);

export function calibrateChfMealCeiling(amountMinor: number, comparison: "LT" | "LTE") {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > 10_000_000) return null;
  // Strict ceilings exclude the boundary cent before ordinal classification.
  const wholeFrancs = Math.floor((amountMinor - (comparison === "LT" ? 1 : 0)) / 100);
  if (wholeFrancs < 1) return null; // Free/sub-franc budgets have no approved band.
  const band = PRODUCT_CHF_MEAL_PRICE_BANDS.find(row => row.maximumWholeFrancs === null || wholeFrancs <= row.maximumWholeFrancs)!;
  return Object.freeze({ policy: PRODUCT_CHF_MEAL_PRICE_POLICY, level: band.level, ordinal: band.ordinal,
    levels: Object.freeze(PRODUCT_CHF_MEAL_PRICE_BANDS.filter(row => row.ordinal <= band.ordinal).map(row => row.level)) });
}

export type ProductRequirementFacet = { readonly key: string; readonly value: string; readonly role: "REQUIRED" | "PREFERRED" | "EXCLUDED"; readonly group: string | null };
export function projectRequirementFacets(requirements: readonly ProductRequirement[]): readonly ProductRequirementFacet[] {
  const facets = new Map<string, ProductRequirementFacet>();
  const add = (facet: ProductRequirementFacet) => facets.set(contentHash(facet), facet);
  for (const [index, requirement] of requirements.entries()) {
    if (requirement.condition || requirement.operator === "ALLOW" || requirement.interpretationState !== "UNDERSTOOD") continue;
    const value = requirement.value;
    if (value?.kind === "FACET") {
      const branches = requirement.group ? requirements.filter(other => other.group === requirement.group) : [requirement];
      const completeGroup = branches.every(other => !other.condition && other.interpretationState === "UNDERSTOOD"
        && other.operator === requirement.operator && other.importance === requirement.importance && other.dimension === requirement.dimension
        && other.value?.kind === "FACET" && other.value.key.split(".")[0] === value.key.split(".")[0]);
      const role = requirement.operator === "EXCLUDE" ? "EXCLUDED"
        : requirement.importance === "PREFERRED" || !completeGroup || value.key === "context.typical_dayparts" || value.key === "context.visit_situations" || requirement.origin === "INFERRED" || value.key === "operation.price_level" ? "PREFERRED" : "REQUIRED";
      if (role === "EXCLUDED" && !value.key.startsWith("classification.")) continue;
      // Keep group in the identity: the same value can satisfy several ORs.
      add({ key: value.key, value: value.value, role, group: role === "REQUIRED" ? requirement.group ?? `G${index + 1}` : null });
    } else if (requirement.operator === "REQUIRE" && !requirement.group) {
      if (value?.kind === "COMPANY" && value.companionType && validWorldPreference("context.visit_situations", value.companionType))
        add({ key: "context.visit_situations", value: value.companionType, role: "PREFERRED", group: null });
      if (value?.kind === "TIME" && value.dayPhase)
        add({ key: "context.typical_dayparts", value: value.dayPhase, role: "PREFERRED", group: null });
    }
  }
  return [...facets.values()];
}
