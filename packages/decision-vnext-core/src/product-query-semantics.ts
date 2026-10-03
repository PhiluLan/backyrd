import { ATTRIBUTE_DEFINITIONS, REGISTRY_HASH } from "@backyrd/world-knowledge-core";

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
