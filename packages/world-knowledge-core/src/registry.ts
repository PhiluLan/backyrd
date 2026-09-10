import { canonicalJson, sha256 } from "./canonical.js";

export const REGISTRY_VERSION = "backyrd.world-knowledge.registry@1.0" as const;
export const VALIDITY_POLICY_VERSION = "backyrd.world-knowledge.validity-policy@1.0" as const;

export const PRIMARY_CATEGORIES = [
  "EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "CULTURE_ARTS", "ENTERTAINMENT",
  "ACTIVITIES_PLAY", "SPORT_MOVEMENT", "OUTDOOR_NATURE", "WELLNESS_RELAXATION",
  "SHOPPING_MARKETS", "STAY", "COMMUNITY_SOCIAL", "ATTRACTIONS_LANDMARKS",
  "TEMPORARY_PLACES", "SERVICES_SPECIAL_EXPERIENCES",
] as const;
export type PrimaryCategory = typeof PRIMARY_CATEGORIES[number];

export const FOUNDATION_AREAS = [
  "SPOT_IDENTITY", "LOCATION", "PUBLIC_CONTACT", "DESCRIPTION", "PRIMARY_CATEGORY", "PLACE_TYPES",
  "CUISINES", "FOOD_SPECIALITIES", "OFFERING_GROUPS", "PRICE", "PAYMENT", "TAKEAWAY",
  "SERVICE", "CAPACITY", "GROUP_SIZE", "RESERVATION", "EXTERNAL_CONSUMPTION", "AMENITIES",
  "ACCESSIBILITY", "PET_ACCESS", "REGULAR_HOURS", "SPECIAL_HOURS", "SERVICE_HOURS", "CURRENT_STATE",
] as const;
export type FoundationArea = typeof FOUNDATION_AREAS[number];

export const PLACE_TYPES = ["RESTAURANT", "BRASSERIE", "BISTRO", "CAFE", "BAR", "PUB", "SNACK_BAR", "TAKEAWAY", "FAST_FOOD"] as const;
export const CUISINES = ["ITALIAN", "INDIAN", "SWISS", "FRENCH", "JAPANESE", "MEDITERRANEAN", "ASIAN"] as const;
export const FOOD_SPECIALITIES = ["PIZZA", "BURGER", "SUSHI"] as const;
export const OFFERING_GROUPS = ["BEER", "WINE", "COCKTAILS", "NON_ALCOHOLIC_DRINKS", "COFFEE", "SNACKS", "FULL_MEALS", "BREAKFAST", "BRUNCH", "LUNCH", "DINNER", "TAKEAWAY_MEALS"] as const;
export const PAYMENT_METHODS = ["CASH", "DEBIT_CARD", "CREDIT_CARD", "MOBILE_PAYMENT"] as const;
export const SERVICE_MODELS = ["TABLE_SERVICE", "SELF_SERVICE", "HYBRID"] as const;
export const SERVICE_FORMATS = ["CASUAL_DINING", "FINE_DINING", "FAST_CASUAL", "COUNTER_SERVICE"] as const;
export const STAY_POLICIES = ["ALLOWED", "WITH_ACTIVE_CONSUMPTION", "TIME_LIMITED", "NOT_ALLOWED"] as const;
export const AMENITY_FEATURES = ["WIFI", "POWER_OUTLETS", "TOILET", "HIGH_CHAIR", "STROLLER_SPACE", "TERRACE", "GARDEN", "OUTDOOR_SEATING", "WATER_BOWL", "WORK_TABLES"] as const;
export const PET_ACCESS_STATES = ["ALLOWED", "NOT_ALLOWED", "UNKNOWN"] as const;
export const RESERVATION_MODES = ["NOT_REQUIRED", "RECOMMENDED", "REQUIRED", "CONDITIONAL"] as const;
export const CONSUMPTION_POLICIES = ["ALLOWED", "NOT_ALLOWED", "CONDITIONAL"] as const;
export const CURRENT_STATE_KINDS = ["OPEN", "CLOSED", "TEMPORARILY_CLOSED", "LIMITED", "FULL", "KITCHEN_CLOSED", "AREA_CLOSED"] as const;

export type AttributeKind = "FACT" | "OPERATIONAL_RULE" | "CURRENT_STATE" | "EXPLANATION_ONLY";
export type ValueType = "TEXT" | "URL" | "PHONE" | "COUNTRY_CODE" | "IANA_TIMEZONE" | "DECIMAL" | "BOOLEAN" | "ENUM" | "ENUM_SET" | "MONEY_RANGE" | "INTEGER" | "INTEGER_RANGE" | "RESERVATION_RULE" | "CONSUMPTION_RULE" | "PET_ACCESS_RULE" | "WEEKLY_SCHEDULE" | "SPECIAL_HOURS" | "CURRENT_STATE";
export type ExpiryBehavior = "STATIC" | "STALE_AFTER_VALID_UNTIL" | "EXPIRES_AT_VALID_UNTIL";

export interface AttributeDefinition {
  readonly key: string;
  readonly version: 1;
  readonly area: FoundationArea;
  readonly labels: { readonly de: string; readonly en: string };
  readonly kind: AttributeKind;
  readonly valueType: ValueType;
  readonly allowedValues?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly applicability: readonly PrimaryCategory[] | "ALL";
  readonly expiryBehavior: ExpiryBehavior;
  readonly engineAuthorization: "AUTHORIZED" | "EXPLANATION_ONLY";
}

const all = "ALL" as const;
const definition = (value: AttributeDefinition): AttributeDefinition => Object.freeze(value);

export const ATTRIBUTE_DEFINITIONS: readonly AttributeDefinition[] = Object.freeze([
  definition({ key: "identity.name", version: 1, area: "SPOT_IDENTITY", labels: { de: "Name", en: "Name" }, kind: "FACT", valueType: "TEXT", min: 1, max: 160, applicability: all, expiryBehavior: "STATIC", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.address_line1", version: 1, area: "LOCATION", labels: { de: "Adresse", en: "Address" }, kind: "FACT", valueType: "TEXT", min: 1, max: 240, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.locality", version: 1, area: "LOCATION", labels: { de: "Ort", en: "Locality" }, kind: "FACT", valueType: "TEXT", min: 1, max: 120, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.neighborhood", version: 1, area: "LOCATION", labels: { de: "Quartier", en: "Neighborhood" }, kind: "FACT", valueType: "TEXT", min: 1, max: 120, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.country_code", version: 1, area: "LOCATION", labels: { de: "Land", en: "Country" }, kind: "FACT", valueType: "COUNTRY_CODE", applicability: all, expiryBehavior: "STATIC", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.latitude", version: 1, area: "LOCATION", labels: { de: "Breitengrad", en: "Latitude" }, kind: "FACT", valueType: "DECIMAL", min: -90, max: 90, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.longitude", version: 1, area: "LOCATION", labels: { de: "Längengrad", en: "Longitude" }, kind: "FACT", valueType: "DECIMAL", min: -180, max: 180, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "location.timezone", version: 1, area: "LOCATION", labels: { de: "Zeitzone", en: "Time zone" }, kind: "FACT", valueType: "IANA_TIMEZONE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  ...(["website", "instagram", "facebook", "linkedin", "tiktok"] as const).map((field) => definition({ key: `contact.${field}`, version: 1, area: "PUBLIC_CONTACT", labels: { de: ({ website: "Webseite", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok" } as const)[field], en: ({ website: "Website", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok" } as const)[field] }, kind: "FACT", valueType: "URL", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" })),
  definition({ key: "contact.phone", version: 1, area: "PUBLIC_CONTACT", labels: { de: "Telefonnummer", en: "Phone number" }, kind: "FACT", valueType: "PHONE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "description.highlight", version: 1, area: "DESCRIPTION", labels: { de: "Besonderheit", en: "Special feature" }, kind: "EXPLANATION_ONLY", valueType: "TEXT", min: 1, max: 800, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "EXPLANATION_ONLY" }),
  definition({ key: "classification.primary_category", version: 1, area: "PRIMARY_CATEGORY", labels: { de: "Hauptkategorie", en: "Primary category" }, kind: "FACT", valueType: "ENUM", allowedValues: PRIMARY_CATEGORIES, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "classification.place_types", version: 1, area: "PLACE_TYPES", labels: { de: "Art des Ortes", en: "Place types" }, kind: "FACT", valueType: "ENUM_SET", allowedValues: PLACE_TYPES, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "offering.cuisines", version: 1, area: "CUISINES", labels: { de: "Küchenrichtungen", en: "Cuisines" }, kind: "FACT", valueType: "ENUM_SET", allowedValues: CUISINES, applicability: ["EAT", "STAY", "TEMPORARY_PLACES"], expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "offering.food_specialities", version: 1, area: "FOOD_SPECIALITIES", labels: { de: "Food Specialities", en: "Food specialities" }, kind: "FACT", valueType: "ENUM_SET", allowedValues: FOOD_SPECIALITIES, applicability: ["EAT", "COFFEE_DAYTIME", "NIGHTLIFE", "STAY", "TEMPORARY_PLACES"], expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "offering.groups", version: 1, area: "OFFERING_GROUPS", labels: { de: "Angebotsgruppen", en: "Offering groups" }, kind: "FACT", valueType: "ENUM_SET", allowedValues: OFFERING_GROUPS, applicability: ["EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "STAY", "TEMPORARY_PLACES"], expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.price_range", version: 1, area: "PRICE", labels: { de: "Preisbereich pro Person", en: "Price range per person" }, kind: "FACT", valueType: "MONEY_RANGE", min: 0, max: 100000, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.payment_methods", version: 1, area: "PAYMENT", labels: { de: "Bezahlarten", en: "Payment methods" }, kind: "FACT", valueType: "ENUM_SET", allowedValues: PAYMENT_METHODS, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.takeaway", version: 1, area: "TAKEAWAY", labels: { de: "Take-away verfügbar", en: "Takeaway available" }, kind: "FACT", valueType: "BOOLEAN", applicability: ["EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "STAY", "TEMPORARY_PLACES"], expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.service_model", version: 1, area: "SERVICE", labels: { de: "Service-Modell", en: "Service model" }, kind: "FACT", valueType: "ENUM", allowedValues: SERVICE_MODELS, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.service_format", version: 1, area: "SERVICE", labels: { de: "Service-Format", en: "Service format" }, kind: "FACT", valueType: "ENUM", allowedValues: SERVICE_FORMATS, applicability: ["EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "STAY", "TEMPORARY_PLACES"], expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.laptop_policy", version: 1, area: "SERVICE", labels: { de: "Laptop-Nutzung erlaubt", en: "Laptop use allowed" }, kind: "OPERATIONAL_RULE", valueType: "BOOLEAN", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "operation.stay_policy", version: 1, area: "SERVICE", labels: { de: "Aufenthaltsregel", en: "Stay policy" }, kind: "OPERATIONAL_RULE", valueType: "ENUM", allowedValues: STAY_POLICIES, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  ...(["total", "indoor", "outdoor"] as const).map((scope) => definition({ key: `capacity.seats_${scope}`, version: 1, area: "CAPACITY", labels: { de: ({ total: "Sitzplätze gesamt", indoor: "Sitzplätze innen", outdoor: "Sitzplätze außen" } as const)[scope], en: ({ total: "Total seats", indoor: "Indoor seats", outdoor: "Outdoor seats" } as const)[scope] }, kind: "FACT", valueType: "INTEGER", min: 0, max: 100000, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" })),
  definition({ key: "capacity.group_size_supported", version: 1, area: "GROUP_SIZE", labels: { de: "Unterstützte Gruppengröße", en: "Supported group size" }, kind: "FACT", valueType: "INTEGER_RANGE", min: 1, max: 100000, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "rule.reservation", version: 1, area: "RESERVATION", labels: { de: "Reservationsregel", en: "Reservation rule" }, kind: "OPERATIONAL_RULE", valueType: "RESERVATION_RULE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "rule.external_food", version: 1, area: "EXTERNAL_CONSUMPTION", labels: { de: "Eigene Speisen", en: "External food" }, kind: "OPERATIONAL_RULE", valueType: "CONSUMPTION_RULE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "rule.external_drink", version: 1, area: "EXTERNAL_CONSUMPTION", labels: { de: "Eigene Getränke", en: "External drinks" }, kind: "OPERATIONAL_RULE", valueType: "CONSUMPTION_RULE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "amenity.features", version: 1, area: "AMENITIES", labels: { de: "Ausstattung", en: "Amenities" }, kind: "FACT", valueType: "ENUM_SET", allowedValues: AMENITY_FEATURES, applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  ...(["step_free_entrance", "wheelchair_paths", "accessible_seating", "accessible_toilet", "accessible_outdoor"] as const).map((feature) => definition({ key: `accessibility.${feature}`, version: 1, area: "ACCESSIBILITY", labels: { de: ({ step_free_entrance: "Stufenloser Eingang", wheelchair_paths: "Rollstuhlgängige Wege", accessible_seating: "Zugängliche Sitzplätze", accessible_toilet: "Rollstuhl-WC", accessible_outdoor: "Zugänglicher Außenbereich" } as const)[feature], en: ({ step_free_entrance: "Step-free entrance", wheelchair_paths: "Wheelchair paths", accessible_seating: "Accessible seating", accessible_toilet: "Accessible toilet", accessible_outdoor: "Accessible outdoor area" } as const)[feature] }, kind: "FACT", valueType: "BOOLEAN", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" })),
  definition({ key: "rule.pet_access", version: 1, area: "PET_ACCESS", labels: { de: "Tierzugangsregel", en: "Pet access rule" }, kind: "OPERATIONAL_RULE", valueType: "PET_ACCESS_RULE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "hours.regular", version: 1, area: "REGULAR_HOURS", labels: { de: "Reguläre Öffnungszeiten", en: "Regular opening hours" }, kind: "OPERATIONAL_RULE", valueType: "WEEKLY_SCHEDULE", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "hours.special", version: 1, area: "SPECIAL_HOURS", labels: { de: "Sonderöffnungszeiten", en: "Special opening hours" }, kind: "OPERATIONAL_RULE", valueType: "SPECIAL_HOURS", applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "hours.kitchen", version: 1, area: "SERVICE_HOURS", labels: { de: "Küchenzeiten", en: "Kitchen service hours" }, kind: "OPERATIONAL_RULE", valueType: "WEEKLY_SCHEDULE", applicability: ["EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "STAY", "TEMPORARY_PLACES"], expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "state.current", version: 1, area: "CURRENT_STATE", labels: { de: "Aktueller Betriebszustand", en: "Current operational state" }, kind: "CURRENT_STATE", valueType: "CURRENT_STATE", allowedValues: CURRENT_STATE_KINDS, applicability: all, expiryBehavior: "EXPIRES_AT_VALID_UNTIL", engineAuthorization: "AUTHORIZED" }),
  definition({ key: "research.subjective_fits", version: 1, area: "DESCRIPTION", labels: { de: "Subjektive Fits (Research)", en: "Subjective fits (research)" }, kind: "EXPLANATION_ONLY", valueType: "ENUM_SET", allowedValues: ["AFTERWORK", "ROMANTIC", "SPONTANEOUS", "BIRTHDAY", "COZY"], applicability: all, expiryBehavior: "STALE_AFTER_VALID_UNTIL", engineAuthorization: "EXPLANATION_ONLY" }),
]);

export const VALIDITY_POLICIES = Object.freeze([
  { version: VALIDITY_POLICY_VERSION, kind: "FACT", behavior: "EXPLICIT_VALIDITY_ONLY", automaticTtlDays: null },
  { version: VALIDITY_POLICY_VERSION, kind: "OPERATIONAL_RULE", behavior: "EXPLICIT_VALIDITY_ONLY", automaticTtlDays: null },
  { version: VALIDITY_POLICY_VERSION, kind: "CURRENT_STATE", behavior: "VALID_UNTIL_REQUIRED", automaticTtlDays: null },
  { version: VALIDITY_POLICY_VERSION, kind: "EXPLANATION_ONLY", behavior: "EXPLICIT_VALIDITY_ONLY", automaticTtlDays: null },
] as const);

function assertRegistry(): void {
  const keys = new Set<string>();
  for (const item of ATTRIBUTE_DEFINITIONS) {
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(item.key)) throw new Error(`invalid_attribute_key:${item.key}`);
    if (keys.has(item.key)) throw new Error(`duplicate_attribute_key:${item.key}`);
    if (!item.labels.de || !item.labels.en) throw new Error(`missing_registry_label:${item.key}`);
    if (item.valueType.startsWith("ENUM") && !item.allowedValues?.length) throw new Error(`missing_allowed_values:${item.key}`);
    keys.add(item.key);
  }
}
assertRegistry();

export const REGISTRY_HASH = sha256({ version: REGISTRY_VERSION, definitions: ATTRIBUTE_DEFINITIONS, validityPolicyVersion: VALIDITY_POLICY_VERSION, validityPolicies: VALIDITY_POLICIES });
export const REGISTRY_CANONICAL_JSON = canonicalJson({ version: REGISTRY_VERSION, definitions: ATTRIBUTE_DEFINITIONS, validityPolicyVersion: VALIDITY_POLICY_VERSION, validityPolicies: VALIDITY_POLICIES });

export function getAttributeDefinition(key: string): AttributeDefinition {
  const definitionValue = ATTRIBUTE_DEFINITIONS.find((item) => item.key === key);
  if (!definitionValue) throw new Error(`unknown_attribute_key:${key}`);
  return definitionValue;
}
