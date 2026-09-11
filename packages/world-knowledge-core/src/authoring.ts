import { canonicalSort, hashBody } from "./canonical.js";
import { WORLD_KNOWLEDGE_PORT_VERSION } from "./contracts.js";
import { ACCEPTED_ENTITLEMENT_POLICY } from "./slice3b.js";
import { ATTRIBUTE_DEFINITIONS, PRICE_LEVEL_LABELS, PRIMARY_CATEGORY_LABELS, REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { parseWorldKnowledgeSnapshot, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot } from "./port.js";
import { ACCEPTED_SOURCE_POLICY } from "./slice3b.js";

export const FOUNDER_EVALUATION_SCOPE = "FOUNDER_EVALUATION_ONLY" as const;
export const AUTHORING_CATALOG_VERSION = "backyrd.world-knowledge.authoring-catalog@4a.1" as const;
export const FOUNDER_EXPORT_VERSION = "backyrd.world-knowledge.founder-export@1.0" as const;
export const FOUNDER_COHORT_VERSION = "backyrd.world-knowledge.founder-cohort@1.0" as const;
export const FOUNDER_READER_VERSION = "backyrd.world-knowledge.reader-port@1.0" as const;

export type AuthoringRole = "OWNER_BASIC" | "OWNER_PRO" | "ADMIN";
export type AuthoringControl = "TEXT" | "TEXTAREA" | "EMAIL" | "URL" | "PHONE" | "NUMBER" | "SINGLE_SELECT" | "MULTI_SELECT" | "YES_NO" | "INTEGER_RANGE" | "WEEKLY_SCHEDULE" | "SPECIAL_HOURS" | "RESERVATION_RULE" | "CONSUMPTION_RULE" | "PET_ACCESS_RULE" | "AGE_ACCESS_RULE" | "CURRENT_STATE";

export interface AuthoringStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly explanation: string;
  readonly primaryAction: string;
  readonly attributeKeys: readonly string[];
}

export interface AuthoringField {
  readonly attributeKey: string;
  readonly label: string;
  readonly help: string;
  readonly group: string;
  readonly control: AuthoringControl;
  readonly allowedValues: readonly { readonly value: string; readonly label: string }[];
  readonly roles: readonly AuthoringRole[];
  readonly optional: true;
  readonly explanationOnly: boolean;
}

export const AUTHORING_STEPS: readonly AuthoringStep[] = Object.freeze([
  { id: "basics", order: 1, title: "Grundinformationen", explanation: "Erfasse die öffentlichen Angaben, mit denen Menschen den Spot finden und kontaktieren können.", primaryAction: "Grundinformationen übernehmen", attributeKeys: ["identity.name", "location.address_line1", "location.locality", "location.neighborhood", "location.country_code", "location.latitude", "location.longitude", "location.timezone", "contact.public_email", "contact.phone", "contact.website", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok", "description.highlight"] },
  { id: "classification", order: 2, title: "Einordnung", explanation: "Wähle genau eine Hauptkategorie und nur die Ortstypen, die wirklich zutreffen.", primaryAction: "Einordnung übernehmen", attributeKeys: ["classification.primary_category", "classification.place_types"] },
  { id: "offering", order: 3, title: "Küche und Angebot", explanation: "Küchenrichtungen, Spezialitäten und konkrete Angebotsgruppen bleiben fachlich getrennt.", primaryAction: "Angebot übernehmen", attributeKeys: ["offering.cuisines", "offering.food_specialities", "offering.groups", "operation.service_model", "operation.service_format", "operation.takeaway"] },
  { id: "price", order: 4, title: "Preise und Bezahlung", explanation: "Das Preislevel ist kategoriebezogen; es wird nicht in einen erfundenen Preis pro Person umgerechnet.", primaryAction: "Preisangaben übernehmen", attributeKeys: ["operation.price_level", "operation.payment_methods"] },
  { id: "hours", order: 5, title: "Öffnungszeiten", explanation: "Reguläre Zeiten, Sondertage, Küchenzeiten und kurzfristige Zustände werden getrennt erfasst.", primaryAction: "Zeiten übernehmen", attributeKeys: ["hours.regular", "hours.special", "hours.kitchen", "state.current"] },
  { id: "activities", order: 6, title: "Was kann man dort machen?", explanation: "Dieser Foundation Slice leitet nur vorsichtige Möglichkeiten aus konkreten Fakten ab. Subjektive Eignung wird nicht als Wahrheit gespeichert.", primaryAction: "Weiter zu objektiven Angaben", attributeKeys: [] },
  { id: "objective", order: 7, title: "Objektive Eigenschaften und Nutzungsmöglichkeiten", explanation: "Erfasse konkrete Kapazitäten und Regeln statt pauschaler Aussagen.", primaryAction: "Nutzungsangaben übernehmen", attributeKeys: ["capacity.seats_indoor", "capacity.seats_outdoor", "capacity.seats_total", "capacity.group_size_supported", "rule.reservation", "operation.laptop_policy", "operation.stay_policy"] },
  { id: "amenities", order: 8, title: "Ausstattung und Einschränkungen", explanation: "Ausstattung, Zugang und Regeln werden einzeln und überprüfbar beschrieben.", primaryAction: "Ausstattung übernehmen", attributeKeys: ["amenity.features", "accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet", "accessibility.elevator", "accessibility.accessible_indoor", "accessibility.accessible_outdoor", "rule.pet_access", "rule.age_access", "rule.external_food", "rule.external_drink"] },
  { id: "review", order: 9, title: "Prüfen und Datenvorschau", explanation: "Prüfe bekannte, offene und nicht freigegebene Angaben und erzeuge anschließend den bereinigten Test-Snapshot.", primaryAction: "Datenvorschau aktualisieren", attributeKeys: [] },
]);

const germanValues: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(Object.entries(PRIMARY_CATEGORY_LABELS).map(([key, value]) => [key, value.de])),
  ...Object.fromEntries(Object.entries(PRICE_LEVEL_LABELS).map(([key, value]) => [key, value.de])),
  HIGH: "teuer",
  RESTAURANT: "Restaurant", BRASSERIE: "Brasserie", BISTRO: "Bistro", CAFE: "Café", BAR: "Bar", PUB: "Pub", SNACK_BAR: "Imbiss", TAKEAWAY: "Take-away", FAST_FOOD: "Fast Food",
  ITALIAN: "Italienisch", INDIAN: "Indisch", SWISS: "Schweizerisch", FRENCH: "Französisch", JAPANESE: "Japanisch", MEDITERRANEAN: "Mediterran", ASIAN: "Asiatisch",
  PIZZA: "Pizza", BURGER: "Burger", SUSHI: "Sushi", BEER: "Bier", WINE: "Wein", COCKTAILS: "Cocktails", NON_ALCOHOLIC_DRINKS: "Alkoholfreie Getränke", COFFEE: "Kaffee", SNACKS: "Snacks", FULL_MEALS: "Vollständige Mahlzeiten", BREAKFAST: "Frühstück", BRUNCH: "Brunch", LUNCH: "Mittagessen", DINNER: "Abendessen", TAKEAWAY_MEALS: "Speisen zum Mitnehmen",
  CASH: "Bar", DEBIT_CARD: "Debitkarte", CREDIT_CARD: "Kreditkarte", MOBILE_PAYMENT: "Mobile Zahlung", TABLE_SERVICE: "Bedienung am Tisch", SELF_SERVICE: "Selbstbedienung", HYBRID: "Gemischt", CASUAL_DINING: "Locker essen", FINE_DINING: "Gehobenes Restaurant", FAST_CASUAL: "Schnell und hochwertig", COUNTER_SERVICE: "Bedienung an der Theke",
  WIFI: "WLAN", POWER_OUTLETS: "Steckdosen", TOILET: "WC", HIGH_CHAIR: "Kinderhochstuhl", STROLLER_SPACE: "Platz für Kinderwagen", TERRACE: "Terrasse", GARDEN: "Garten", OUTDOOR_SEATING: "Sitzplätze draußen", WATER_BOWL: "Wassernapf", WORK_TABLES: "Geeignete Arbeitstische",
  ALLOWED: "Erlaubt", NOT_ALLOWED: "Nicht erlaubt", UNKNOWN: "Noch unbekannt", CONDITIONAL: "Unter Bedingungen", BYO_FEE: "Gegen Gebühr", NOT_REQUIRED: "Nicht nötig", RECOMMENDED: "Empfohlen", REQUIRED: "Erforderlich", WITH_ACTIVE_CONSUMPTION: "Bei laufender Konsumation", TIME_LIMITED: "Zeitlich begrenzt",
  OPEN: "Geöffnet", CLOSED: "Geschlossen", TEMPORARILY_CLOSED: "Vorübergehend geschlossen", LIMITED: "Eingeschränkt", FULL: "Ausgelastet", KITCHEN_CLOSED: "Küche geschlossen", AREA_CLOSED: "Bereich geschlossen",
});

const help: Readonly<Record<string, string>> = Object.freeze({
  "classification.primary_category": "Genau eine Hauptkategorie. Ortstypen ändern sie nicht automatisch.",
  "classification.place_types": "Mehrfachauswahl. Wähle nur, was tatsächlich zutrifft.",
  "offering.cuisines": "Pizza und Burger sind Spezialitäten, keine Küchenrichtungen.",
  "offering.food_specialities": "Konkrete Speisen, für die der Spot bekannt ist.",
  "offering.groups": "Konkrete Angebotsgruppen, keine Nutzerabsichten.",
  "capacity.group_size_supported": "Gib die kleinste und größte sinnvoll unterstützte Gruppengröße an.",
  "hours.special": "Ein Sondertag überschreibt nur das angegebene Datum.",
  "hours.kitchen": "Küchenzeiten ändern die Öffnung des Ortes nicht.",
  "state.current": "Kurzfristiger Zustand mit Beobachtungszeit und zwingendem Ende.",
  "description.highlight": "Öffentlicher Beschreibungstext. Problematische neue Inhalte werden zur Prüfung zurückgehalten.",
});

const groupFor = (key: string): string => key.startsWith("contact.") ? "Öffentliche Kontakte" : key.startsWith("location.") ? "Standort" : key.startsWith("offering.") ? "Angebot" : key.startsWith("capacity.") ? "Kapazität" : key.startsWith("accessibility.") ? "Zugänglichkeit" : key.startsWith("hours.") ? "Zeiten" : key.startsWith("rule.") ? "Regeln" : key.startsWith("amenity.") ? "Ausstattung" : "Allgemein";
const controlFor = (valueType: string): AuthoringControl => ({ TEXT: "TEXT", EMAIL: "EMAIL", URL: "URL", PHONE: "PHONE", COUNTRY_CODE: "TEXT", IANA_TIMEZONE: "TEXT", DECIMAL: "NUMBER", INTEGER: "NUMBER", BOOLEAN: "YES_NO", ENUM: "SINGLE_SELECT", ENUM_SET: "MULTI_SELECT", INTEGER_RANGE: "INTEGER_RANGE", WEEKLY_SCHEDULE: "WEEKLY_SCHEDULE", SPECIAL_HOURS: "SPECIAL_HOURS", RESERVATION_RULE: "RESERVATION_RULE", CONSUMPTION_RULE: "CONSUMPTION_RULE", PET_ACCESS_RULE: "PET_ACCESS_RULE", AGE_ACCESS_RULE: "AGE_ACCESS_RULE", CURRENT_STATE: "CURRENT_STATE" } as Partial<Record<string, AuthoringControl>>)[valueType] ?? "TEXT";

export const AUTHORING_FIELDS: readonly AuthoringField[] = Object.freeze(AUTHORING_STEPS.flatMap((step) => step.attributeKeys.map((attributeKey) => {
  const definition = ATTRIBUTE_DEFINITIONS.find((item) => item.key === attributeKey);
  if (!definition) throw new Error(`authoring_catalog_unknown_key:${attributeKey}`);
  const roles = ([
    ACCEPTED_ENTITLEMENT_POLICY.basicKeys.includes(attributeKey) ? "OWNER_BASIC" : null,
    ACCEPTED_ENTITLEMENT_POLICY.proKeys.includes(attributeKey) ? "OWNER_PRO" : null,
    ACCEPTED_ENTITLEMENT_POLICY.adminKeys.includes(attributeKey) ? "ADMIN" : null,
  ].filter(Boolean) as AuthoringRole[]);
  return {
    attributeKey,
    label: definition.labels.de,
    help: help[attributeKey] ?? "Optional. Nicht beantwortet bedeutet weder Nein noch unbekannt.",
    group: groupFor(attributeKey),
    control: controlFor(definition.valueType),
    allowedValues: (definition.allowedValues ?? []).map((value) => ({ value, label: germanValues[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("de-CH") })),
    roles,
    optional: true as const,
    explanationOnly: definition.engineAuthorization === "EXPLANATION_ONLY",
  };
})));

export const AUTHORING_CATALOG_HASH = hashBody({ version: AUTHORING_CATALOG_VERSION, steps: AUTHORING_STEPS, fields: AUTHORING_FIELDS }, []);

export interface FounderSpotExport {
  readonly contractVersion: typeof FOUNDER_EXPORT_VERSION;
  readonly scope: typeof FOUNDER_EVALUATION_SCOPE;
  readonly spotId: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly manifestHash: string;
  readonly snapshot: WorldKnowledgeSnapshot;
  readonly exportHash: string;
}

export function createFounderSpotExport(input: { readonly manifestHash: string; readonly snapshot: unknown }): FounderSpotExport {
  if (!/^[0-9a-f]{64}$/.test(input.manifestHash)) throw new Error("invalid_manifest_hash");
  const snapshot = parseWorldKnowledgeSnapshot(input.snapshot, [ACCEPTED_SOURCE_POLICY]);
  const body = { contractVersion: FOUNDER_EXPORT_VERSION, scope: FOUNDER_EVALUATION_SCOPE, spotId: snapshot.spot.spotId, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: snapshot.sourcePolicyVersion, policyHash: snapshot.sourcePolicyHash, manifestHash: input.manifestHash, snapshot };
  return { ...body, exportHash: hashBody(body, []) };
}

export type FounderSnapshotLoader = (input: {
  readonly spotId: string;
  readonly scope: typeof FOUNDER_EVALUATION_SCOPE;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
}) => Promise<unknown>;

/**
 * Read-only boundary for Decision Lab fixtures. The loader is deliberately injected:
 * this package cannot connect to a database or activate a Decision runtime.
 */
export function createFounderWorldKnowledgeReader(loadSnapshot: FounderSnapshotLoader): WorldKnowledgeReaderPort {
  return Object.freeze({
    contractVersion: FOUNDER_READER_VERSION,
    async readSnapshot(input: Parameters<WorldKnowledgeReaderPort["readSnapshot"]>[0]) {
      if (input.contractVersion !== WORLD_KNOWLEDGE_PORT_VERSION || input.registryVersion !== REGISTRY_VERSION || input.registryHash !== REGISTRY_HASH) {
        throw new Error("founder_reader_contract_identity_mismatch");
      }
      const snapshot = parseWorldKnowledgeSnapshot(await loadSnapshot({
        spotId: input.spotId,
        scope: FOUNDER_EVALUATION_SCOPE,
        registryVersion: REGISTRY_VERSION,
        registryHash: REGISTRY_HASH,
      }), [ACCEPTED_SOURCE_POLICY]);
      if (snapshot.spot.spotId !== input.spotId) throw new Error("founder_reader_spot_identity_mismatch");
      return snapshot;
    },
  });
}

export interface FounderWorldCohortManifest {
  readonly contractVersion: typeof FOUNDER_COHORT_VERSION;
  readonly scope: typeof FOUNDER_EVALUATION_SCOPE;
  readonly cohortId: string;
  readonly frozenAt: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly spots: readonly { readonly spotId: string; readonly manifestHash: string; readonly snapshotHash: string }[];
  readonly exclusions: readonly string[];
  readonly cohortHash: string;
}

export function createFounderWorldCohortManifest(input: { readonly cohortId: string; readonly frozenAt: string; readonly exports: readonly FounderSpotExport[] }): FounderWorldCohortManifest {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.cohortId) || !Number.isFinite(Date.parse(input.frozenAt))) throw new Error("invalid_cohort_identity");
  if (input.exports.length < 1 || input.exports.length > 40) throw new Error("founder_cohort_size_must_be_1_to_40");
  const spots = canonicalSort(input.exports.map((item) => ({ spotId: item.spotId, manifestHash: item.manifestHash, snapshotHash: item.snapshot.snapshotHash })), (item) => item.spotId);
  if (new Set(spots.map((item) => item.spotId)).size !== spots.length) throw new Error("duplicate_spot_in_cohort");
  if (input.exports.some((item) => item.registryVersion !== REGISTRY_VERSION || item.policyVersion !== ACCEPTED_SOURCE_POLICY.policyVersion || item.policyHash !== ACCEPTED_SOURCE_POLICY.policyHash)) throw new Error("cohort_policy_identity_mismatch");
  const body = { contractVersion: FOUNDER_COHORT_VERSION, scope: FOUNDER_EVALUATION_SCOPE, cohortId: input.cohortId, frozenAt: new Date(input.frozenAt).toISOString(), registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, policyHash: ACCEPTED_SOURCE_POLICY.policyHash, spots, exclusions: ["ADMIN_NOTES", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "SUBSCRIPTION"] };
  return { ...body, cohortHash: hashBody(body, []) };
}
