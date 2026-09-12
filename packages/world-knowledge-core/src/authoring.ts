import { canonicalSort, hashBody } from "./canonical.js";
import { parseAttributeValue, WORLD_KNOWLEDGE_PORT_VERSION, type ClaimValue, type KnowledgeState } from "./contracts.js";
import { ACCEPTED_ENTITLEMENT_POLICY } from "./slice3b.js";
import { ATTRIBUTE_DEFINITIONS, PRICE_LEVEL_LABELS, PRIMARY_CATEGORIES, PRIMARY_CATEGORY_LABELS, REGISTRY_HASH, REGISTRY_VERSION, type ValueType } from "./registry.js";
import { parseWorldKnowledgeSnapshot, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot } from "./port.js";
import { ACCEPTED_SOURCE_POLICY } from "./slice3b.js";
import { AMENITY_AUTHORING_OPTIONS, CATEGORY_AUTHORING_MATRIX, CUISINE_AUTHORING_OPTIONS, FOOD_SPECIALITY_AUTHORING_OPTIONS, OFFERING_AUTHORING_OPTIONS, PLACE_TYPE_AUTHORING_OPTIONS, assessPlaceTypeCompatibility, getCategoryPlaceTypes, type AuthoringTaxonomyState } from "./authoring-taxonomy.js";

export const FOUNDER_EVALUATION_SCOPE = "FOUNDER_EVALUATION_ONLY" as const;
export const AUTHORING_CATALOG_VERSION = "backyrd.world-knowledge.authoring-catalog@4a.2" as const;
export const FOUNDER_EXPORT_VERSION = "backyrd.world-knowledge.founder-export@1.0" as const;
export const FOUNDER_COHORT_VERSION = "backyrd.world-knowledge.founder-cohort@1.0" as const;
export const FOUNDER_READER_VERSION = "backyrd.world-knowledge.reader-port@1.0" as const;

export type AuthoringRole = "OWNER_BASIC" | "OWNER_PRO" | "ADMIN";
export type AuthoringControl = "TEXT" | "TEXTAREA" | "EMAIL" | "URL" | "PHONE" | "NUMBER" | "SINGLE_SELECT" | "MULTI_SELECT" | "YES_NO" | "INTEGER_RANGE" | "WEEKLY_SCHEDULE" | "KITCHEN_HOURS" | "SPECIAL_HOURS" | "RESERVATION_RULE" | "CONSUMPTION_RULE" | "PET_ACCESS_RULE" | "AGE_ACCESS_RULE" | "AGE_ACCESS_RULE_V2" | "CURRENT_STATE";
export type AuthoringRequirementClass = "REQUIRED" | "CONDITIONALLY_REQUIRED" | "OPTIONAL" | "NOT_RELEVANT";

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
  readonly attributeVersion: 1;
  readonly valueType: ValueType;
  readonly label: string;
  readonly help: string;
  readonly group: string;
  readonly control: AuthoringControl;
  readonly allowedValues: readonly { readonly value: string; readonly label: string; readonly group?: string; readonly state?: AuthoringTaxonomyState }[];
  readonly roles: readonly AuthoringRole[];
  readonly optional: true;
  readonly requirementClass: AuthoringRequirementClass;
  readonly requirementReason: string;
  readonly explanationOnly: boolean;
}

export const AUTHORING_STEPS: readonly AuthoringStep[] = Object.freeze([
  { id: "basics", order: 1, title: "Grundinformationen", explanation: "Erfasse die öffentlichen Angaben, mit denen Menschen den Spot finden und kontaktieren können.", primaryAction: "Grundinformationen übernehmen", attributeKeys: ["identity.name", "location.address_line1", "location.locality", "location.neighborhood", "location.country_code", "location.latitude", "location.longitude", "location.timezone", "contact.public_email", "contact.phone", "contact.website", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok", "description.highlight"] },
  { id: "classification", order: 2, title: "Einordnung", explanation: "Wähle genau eine Hauptkategorie und nur die Ortstypen, die wirklich zutreffen.", primaryAction: "Einordnung übernehmen", attributeKeys: ["classification.primary_category", "classification.place_types"] },
  { id: "offering", order: 3, title: "Küche und Angebot", explanation: "Küchenrichtungen, Spezialitäten und konkrete Angebotsgruppen bleiben fachlich getrennt.", primaryAction: "Angebot übernehmen", attributeKeys: ["offering.cuisines", "offering.food_specialities", "offering.groups", "operation.service_model", "operation.service_format", "operation.takeaway"] },
  { id: "price", order: 4, title: "Preise und Bezahlung", explanation: "Das Preislevel ist kategoriebezogen; es wird nicht in einen erfundenen Preis pro Person umgerechnet.", primaryAction: "Preisangaben übernehmen", attributeKeys: ["operation.price_level", "operation.payment_methods"] },
  { id: "hours", order: 5, title: "Öffnungszeiten", explanation: "Reguläre Zeiten, Sondertage, Küchenzeiten und kurzfristige Zustände werden getrennt erfasst.", primaryAction: "Zeiten übernehmen", attributeKeys: ["hours.regular", "hours.special", "hours.kitchen", "hours.kitchen_special", "state.current"] },
  { id: "objective", order: 6, title: "Objektive Eigenschaften und Nutzungsmöglichkeiten", explanation: "Erfasse konkrete Kapazitäten und Regeln statt pauschaler Aussagen.", primaryAction: "Nutzungsangaben übernehmen", attributeKeys: ["capacity.seats_indoor", "capacity.seats_outdoor", "capacity.seats_total", "capacity.group_size_supported", "rule.reservation", "operation.laptop_policy", "operation.stay_policy"] },
  { id: "amenities", order: 7, title: "Ausstattung und Einschränkungen", explanation: "Ausstattung, Zugang und Regeln werden einzeln und überprüfbar beschrieben.", primaryAction: "Ausstattung übernehmen", attributeKeys: ["amenity.features", "accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet", "accessibility.elevator", "accessibility.accessible_indoor", "accessibility.accessible_outdoor", "rule.pet_access", "rule.age_access_conditions", "rule.external_food", "rule.external_drink"] },
  { id: "review", order: 8, title: "Prüfen und Datenvorschau", explanation: "Prüfe bekannte, offene und nicht freigegebene Angaben, vorsichtige Ableitungen und den bereinigten Test-Snapshot.", primaryAction: "Datenvorschau aktualisieren", attributeKeys: [] },
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
  "classification.primary_category": "Genau eine Hauptkategorie. Danach zeigt Backyrd nur fachlich passende Arten des Ortes.",
  "classification.place_types": "Die Auswahl hängt von der Hauptkategorie ab. Bestehende unpassende Werte bleiben als Konflikt sichtbar, bis du sie bewusst korrigierst.",
  "offering.cuisines": "Pizza und Burger sind Spezialitäten, keine Küchenrichtungen.",
  "offering.food_specialities": "Konkrete Speisen, für die der Spot bekannt ist.",
  "offering.groups": "Konkrete Angebotsgruppen, keine Nutzerabsichten.",
  "capacity.group_size_supported": "Gib die kleinste und größte sinnvoll unterstützte Gruppengröße an.",
  "hours.special": "Ein Sondertag überschreibt nur das angegebene Datum.",
  "hours.kitchen": "Küchenzeiten ändern die Öffnung des Ortes nicht.",
  "hours.kitchen_special": "Ein besonderer Küchentag verändert weder die regulären Küchenzeiten noch die Öffnung des Ortes.",
  "rule.age_access_conditions": "Erfasse allgemeine Altersgrenzen und Ausnahmen mit Begleitung getrennt. Personenbezogene Identitäten werden nicht gespeichert.",
  "state.current": "Kurzfristiger Zustand mit Beobachtungszeit und zwingendem Ende.",
  "description.highlight": "Öffentlicher Beschreibungstext. Problematische neue Inhalte werden zur Prüfung zurückgehalten.",
});

const groupFor = (key: string): string => key.startsWith("contact.") ? "Öffentliche Kontakte" : key.startsWith("location.") ? "Standort" : key.startsWith("offering.") ? "Angebot" : key.startsWith("capacity.") ? "Kapazität" : key.startsWith("accessibility.") ? "Zugänglichkeit" : key.startsWith("hours.") ? "Zeiten" : key.startsWith("rule.") ? "Regeln" : key.startsWith("amenity.") ? "Ausstattung" : "Allgemein";
const controlFor = (valueType: string): AuthoringControl => ({ TEXT: "TEXT", EMAIL: "EMAIL", URL: "URL", PHONE: "PHONE", COUNTRY_CODE: "TEXT", IANA_TIMEZONE: "TEXT", DECIMAL: "NUMBER", INTEGER: "NUMBER", BOOLEAN: "YES_NO", ENUM: "SINGLE_SELECT", ENUM_SET: "MULTI_SELECT", INTEGER_RANGE: "INTEGER_RANGE", WEEKLY_SCHEDULE: "WEEKLY_SCHEDULE", SPECIAL_HOURS: "SPECIAL_HOURS", RESERVATION_RULE: "RESERVATION_RULE", CONSUMPTION_RULE: "CONSUMPTION_RULE", PET_ACCESS_RULE: "PET_ACCESS_RULE", AGE_ACCESS_RULE: "AGE_ACCESS_RULE", AGE_ACCESS_RULE_V2: "AGE_ACCESS_RULE_V2", CURRENT_STATE: "CURRENT_STATE" } as Partial<Record<string, AuthoringControl>>)[valueType] ?? "TEXT";

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
    attributeVersion: definition.version,
    valueType: definition.valueType,
    label: definition.labels.de,
    help: help[attributeKey] ?? "Optional. Nicht beantwortet bedeutet weder Nein noch unbekannt.",
    group: groupFor(attributeKey),
    control: attributeKey === "description.highlight" ? "TEXTAREA" : attributeKey === "hours.kitchen" ? "KITCHEN_HOURS" : controlFor(definition.valueType),
    allowedValues: (attributeKey === "classification.place_types" ? PLACE_TYPE_AUTHORING_OPTIONS
      : attributeKey === "offering.cuisines" ? CUISINE_AUTHORING_OPTIONS
      : attributeKey === "offering.food_specialities" ? FOOD_SPECIALITY_AUTHORING_OPTIONS
      : attributeKey === "offering.groups" ? OFFERING_AUTHORING_OPTIONS
      : attributeKey === "amenity.features" ? AMENITY_AUTHORING_OPTIONS
      : (definition.allowedValues ?? []).map((value) => ({ value, label: germanValues[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("de-CH"), state: "CANONICAL" as const }))),
    roles,
    optional: true as const,
    requirementClass: attributeKey === "identity.name" || attributeKey === "classification.primary_category" ? "REQUIRED" as const : attributeKey === "classification.place_types" ? "CONDITIONALLY_REQUIRED" as const : "OPTIONAL" as const,
    requirementReason: attributeKey === "identity.name" ? "Der Spot benötigt eine erkennbare Identität." : attributeKey === "classification.primary_category" ? "Die Evaluation benötigt genau eine Hauptkategorie." : attributeKey === "classification.place_types" ? "Sobald eine Hauptkategorie gewählt ist, braucht die Einordnung mindestens eine passende Art des Ortes." : "Diese Angabe verbessert den Wissensstand, blockiert die lokale Evaluation aber nicht.",
    explanationOnly: definition.engineAuthorization === "EXPLANATION_ONLY",
  };
})));

export type AuthoringSectionState = "NOT_STARTED" | "IN_PROGRESS" | "ERRORS" | "REQUIRED_COMPLETE" | "INTENTIONALLY_INCOMPLETE" | "NOT_RELEVANT" | "FULLY_REVIEWED";

export function getAuthoringFieldsForContext(stepId: string, primaryCategory: unknown): readonly AuthoringField[] {
  const step = AUTHORING_STEPS.find((entry) => entry.id === stepId);
  if (!step) return [];
  const category = typeof primaryCategory === "string" && (PRIMARY_CATEGORIES as readonly string[]).includes(primaryCategory) ? primaryCategory as typeof PRIMARY_CATEGORIES[number] : null;
  if (category && !CATEGORY_AUTHORING_MATRIX[category].relevantSteps.includes(stepId) && !["basics", "classification", "review"].includes(stepId)) return [];
  return AUTHORING_FIELDS.filter((field) => step.attributeKeys.includes(field.attributeKey)).map((field) => {
    if (field.attributeKey !== "classification.place_types") return field;
    return Object.freeze({ ...field, allowedValues: getCategoryPlaceTypes(category) });
  });
}

export function getPlaceTypeConflict(primaryCategory: unknown, placeTypes: unknown): ReturnType<typeof assessPlaceTypeCompatibility> {
  const category = typeof primaryCategory === "string" && (PRIMARY_CATEGORIES as readonly string[]).includes(primaryCategory) ? primaryCategory as typeof PRIMARY_CATEGORIES[number] : null;
  const values = Array.isArray(placeTypes) ? placeTypes.filter((value): value is string => typeof value === "string") : [];
  return assessPlaceTypeCompatibility(category, values);
}

export type AuthoringIssueKind = "INVALID_VALUE" | "MISSING_REQUIRED" | "CONFLICT" | "UNAPPROVED" | "KNOWN_GAP";
export type AuthoringIssueSeverity = "BLOCKING" | "INFORMATION";
export interface AuthoringIssue { readonly id: string; readonly attributeKey: string; readonly stepId: string; readonly label: string; readonly kind: AuthoringIssueKind; readonly severity: AuthoringIssueSeverity; readonly explanation: string; readonly correction: string; readonly currentValue?: unknown }
export type AuthoringReadiness = "NOT_READY" | "READY_WITH_GAPS" | "FULLY_REVIEWED";
export interface AuthoringReadinessReport { readonly readiness: AuthoringReadiness; readonly blocking: readonly AuthoringIssue[]; readonly gaps: readonly AuthoringIssue[]; readonly issues: readonly AuthoringIssue[]; readonly sectionStates: Readonly<Record<string, AuthoringSectionState>> }

export function evaluateAuthoringReadiness(input: {
  readonly answers: Readonly<Record<string, { readonly knowledgeState: string; readonly value: unknown }>>;
  readonly applicability?: Readonly<Record<string, string>>;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly reviewedSteps?: readonly string[];
}): AuthoringReadinessReport {
  const category = input.answers["classification.primary_category"]?.value;
  const issues: AuthoringIssue[] = [];
  for (const field of AUTHORING_FIELDS) {
    const stepId = AUTHORING_STEPS.find((step) => step.attributeKeys.includes(field.attributeKey))?.id ?? "review";
    const relevantFields = getAuthoringFieldsForContext(stepId, category);
    if (!relevantFields.some((item) => item.attributeKey === field.attributeKey)) continue;
    const message = input.fieldErrors?.[field.attributeKey];
    if (message) issues.push({ id: `INVALID_VALUE:${field.attributeKey}`, attributeKey: field.attributeKey, stepId, label: field.label, kind: "INVALID_VALUE", severity: "BLOCKING", explanation: message, correction: "Öffne das Feld und korrigiere den markierten Wert.", currentValue: input.answers[field.attributeKey]?.value });
    const answer = input.answers[field.attributeKey];
    const notApplicable = input.applicability?.[field.attributeKey] === "NOT_APPLICABLE";
    const required = field.requirementClass === "REQUIRED" || (field.requirementClass === "CONDITIONALLY_REQUIRED" && typeof category === "string");
    if (required && (!answer || answer.knowledgeState === "UNKNOWN" || notApplicable)) issues.push({ id: `MISSING_REQUIRED:${field.attributeKey}`, attributeKey: field.attributeKey, stepId, label: field.label, kind: "MISSING_REQUIRED", severity: "BLOCKING", explanation: field.requirementReason, correction: "Gib für dieses Pflichtfeld einen konkreten, verlässlichen Wert ein.", currentValue: answer?.value });
    if (!required && answer?.knowledgeState === "UNKNOWN") issues.push({ id: `KNOWN_GAP:${field.attributeKey}`, attributeKey: field.attributeKey, stepId, label: field.label, kind: "KNOWN_GAP", severity: "INFORMATION", explanation: "Diese Angabe wurde bewusst als unbekannt gespeichert.", correction: "Kein Fehler. Ergänze sie nur, wenn du eine verlässliche Angabe kennst." });
    if (!required && !answer && !notApplicable && input.reviewedSteps?.includes(stepId)) issues.push({ id: `KNOWN_GAP:${field.attributeKey}`, attributeKey: field.attributeKey, stepId, label: field.label, kind: "KNOWN_GAP", severity: "INFORMATION", explanation: "Dieses optionale Feld wurde bewusst offen gelassen.", correction: "Kein Fehler. Ergänze die Angabe später oder markiere sie bewusst als unbekannt beziehungsweise nicht relevant." });
  }
  const placeTypes = input.answers["classification.place_types"]?.value;
  const compatibility = getPlaceTypeConflict(category, placeTypes);
  if (placeTypes && compatibility.state !== "COMPATIBLE") issues.push({ id: `CONFLICT:classification.place_types`, attributeKey: "classification.place_types", stepId: "classification", label: "Art des Ortes", kind: compatibility.state === "NOT_CONFIGURED" ? "UNAPPROVED" : "CONFLICT", severity: "BLOCKING", explanation: compatibility.state === "NOT_CONFIGURED" ? "Für diese Kombination ist noch keine freigegebene Zuordnung vorhanden." : `Nicht passende gespeicherte Werte: ${compatibility.incompatible.join(", ")}.`, correction: "Wähle bewusst einen passenden Ortstyp. Der frühere Claim bleibt historisch erhalten.", currentValue: placeTypes });
  const uniqueIssues = [...new Map(issues.map((issue) => [issue.id, issue])).values()].sort((left, right) => left.id.localeCompare(right.id));
  const sectionStates = Object.fromEntries(AUTHORING_STEPS.map((step) => {
    if (step.id === "review") return [step.id, "IN_PROGRESS"];
    const fields = getAuthoringFieldsForContext(step.id, category);
    if (!fields.length) return [step.id, "NOT_RELEVANT"];
    const stepIssues = uniqueIssues.filter((issue) => issue.stepId === step.id && issue.severity === "BLOCKING");
    if (stepIssues.length) return [step.id, "ERRORS"];
    const answered = fields.filter((field) => input.answers[field.attributeKey] || input.applicability?.[field.attributeKey] === "NOT_APPLICABLE");
    if (input.reviewedSteps?.includes(step.id)) return [step.id, answered.length === fields.length ? "FULLY_REVIEWED" : "INTENTIONALLY_INCOMPLETE"];
    if (!answered.length) return [step.id, "NOT_STARTED"];
    return [step.id, fields.filter((field) => field.requirementClass !== "OPTIONAL").every((field) => input.answers[field.attributeKey] || input.applicability?.[field.attributeKey] === "NOT_APPLICABLE") ? "REQUIRED_COMPLETE" : "IN_PROGRESS"];
  })) as Record<string, AuthoringSectionState>;
  const blocking = uniqueIssues.filter((issue) => issue.severity === "BLOCKING"); const gaps = uniqueIssues.filter((issue) => issue.severity === "INFORMATION");
  const allRelevantReviewed = AUTHORING_STEPS.filter((step) => !["review"].includes(step.id) && sectionStates[step.id] !== "NOT_RELEVANT").every((step) => ["FULLY_REVIEWED", "INTENTIONALLY_INCOMPLETE"].includes(sectionStates[step.id]!));
  return { readiness: blocking.length ? "NOT_READY" : allRelevantReviewed ? "FULLY_REVIEWED" : "READY_WITH_GAPS", blocking, gaps, issues: uniqueIssues, sectionStates };
}

export type AuthoringValidationResult =
  | { readonly ok: true; readonly value: ClaimValue }
  | { readonly ok: false; readonly code: string; readonly message: string };

const correctionFor = (valueType: ValueType): string => ({
  TEXT: "Bitte gib einen nicht leeren Text im erlaubten Umfang ein.",
  EMAIL: "Bitte gib eine vollständige E-Mail-Adresse wie kontakt@spot.ch ein.",
  URL: "Bitte gib eine vollständige Webadresse mit https:// ein.",
  PHONE: "Bitte nutze das internationale Format, zum Beispiel +41781234567.",
  COUNTRY_CODE: "Bitte verwende den zweistelligen Ländercode, zum Beispiel CH.",
  IANA_TIMEZONE: "Bitte wähle eine gültige Zeitzone, zum Beispiel Europe/Zurich.",
  DECIMAL: "Bitte gib eine Zahl innerhalb des angezeigten Wertebereichs ein.",
  INTEGER: "Bitte gib eine ganze Zahl innerhalb des angezeigten Wertebereichs ein.",
  BOOLEAN: "Bitte wähle Ja, Nein oder Noch unbekannt.",
  ENUM: "Bitte wähle einen der angebotenen Werte.",
  ENUM_SET: "Bitte wähle nur Werte aus der angebotenen Liste.",
  MONEY_RANGE: "Bitte gib einen vollständigen gültigen Preisbereich ein.",
  INTEGER_RANGE: "Bitte gib eine kleinste und größte ganze Zahl ein; Von darf Bis nicht überschreiten.",
  RESERVATION_RULE: "Bitte vervollständige die Reservationsregel. Ein Zeitfenster benötigt Von und Bis.",
  CONSUMPTION_RULE: "Bitte wähle eine Regel; Ausnahmen dürfen nicht leer sein.",
  PET_ACCESS_RULE: "Bitte beantworte Innen, Außen und Assistenztiere mit den angebotenen Werten.",
  AGE_ACCESS_RULE: "Bitte gib bei Mindestalter auch ein Alter zwischen 0 und 120 an.",
  AGE_ACCESS_RULE_V2: "Bitte vervollständige jede Altersregel. Eine Grenze benötigt Alter; Begleitausnahmen benötigen eine erlaubte Begleitperson.",
  WEEKLY_SCHEDULE: "Bitte prüfe Wochentage und Zeitintervalle. Beginn und Ende müssen verschieden sein.",
  SPECIAL_HOURS: "Bitte prüfe Datum, Status und Zeitintervalle des Sondertags.",
  CURRENT_STATE: "Bitte wähle Zustand und Bereich und gib ein Gültig-bis-Datum an.",
} satisfies Record<ValueType, string>)[valueType];

/** Runtime boundary shared by every Admin/Owner authoring field before an RPC write. */
export function validateAuthoringSubmission(attributeKey: unknown, knowledgeState: unknown, rawValue: unknown): AuthoringValidationResult {
  const field = AUTHORING_FIELDS.find((item) => item.attributeKey === attributeKey);
  if (!field) return { ok: false, code: "UNKNOWN_ATTRIBUTE", message: "Dieses Feld gehört nicht zur freigegebenen Erfassung." };
  if (!(["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE", "UNKNOWN"] as const).includes(knowledgeState as KnowledgeState)) return { ok: false, code: "INVALID_KNOWLEDGE_STATE", message: `${field.label}: Bitte wähle einen gültigen Wissenszustand.` };
  try {
    if (knowledgeState === "UNKNOWN") {
      if (rawValue !== null) throw new Error("UNKNOWN_REQUIRES_NULL");
      return { ok: true, value: null };
    }
    const value = parseAttributeValue(field.attributeKey, rawValue, `$.${field.attributeKey}`);
    if ((knowledgeState === "KNOWN_TRUE" && value !== true) || (knowledgeState === "KNOWN_FALSE" && value !== false)) throw new Error("BOOLEAN_STATE_MISMATCH");
    if ((knowledgeState === "KNOWN_TRUE" || knowledgeState === "KNOWN_FALSE") && field.valueType !== "BOOLEAN") throw new Error("BOOLEAN_ATTRIBUTE_REQUIRED");
    return { ok: true, value };
  } catch {
    return { ok: false, code: `INVALID_${field.valueType}`, message: `${field.label}: ${correctionFor(field.valueType)}` };
  }
}

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
