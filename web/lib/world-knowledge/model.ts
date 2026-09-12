import generatedCatalog from "./catalog.generated.json" with { type: "json" };

export const PROTOTYPE_VERSION = "philipps-casa-prototype-3.0.0";
export const STORAGE_KEY = "backyrd:world-knowledge-prototype:philipps-casa:v1";
export const REGISTRY_VERSION = "world-knowledge-registry-preview-v3";

export type Role = "ADMIN" | "OWNER_BASIC" | "OWNER_PRO";
export type GroupKey = "CLASSIFICATION" | "INTENTS" | "CAPABILITIES" | "SITUATION_FIT" | "CHARACTERISTICS" | "AMENITIES_CONSTRAINTS" | "TEMPORAL_STATE" | "EVIDENCE_CONFIDENCE";
export type ClaimStatus = "KNOWN_TRUE" | "KNOWN_FALSE" | "KNOWN_VALUE" | "UNKNOWN" | "NOT_APPLICABLE" | "DISPUTED";
export type ResolvedStatus = ClaimStatus | "EXPIRED";
export type ValueType = "BOOLEAN" | "INTEGER" | "DECIMAL" | "NUMBER_RANGE" | "SINGLE_SELECT" | "MULTI_SELECT" | "SHORT_TEXT" | "LONG_TEXT" | "URL" | "PHONE" | "MONEY" | "PRICE_LEVEL" | "TIME" | "WEEKLY_SCHEDULE" | "EXCEPTION_SCHEDULE" | "CONDITIONAL_RULE" | "CURRENT_STATE" | "STRUCTURED_COMPOSITE" | "NUMBER" | "RANGE" | "DATE" | "SCHEDULE" | "TEXT" | "STRUCTURED";
export type OwnerAccess = "BASIC" | "PRO" | "ADMIN";
export type TrustState = "UNBACKED" | "SOURCED" | "CONFIRMED" | "CONFLICTING" | "STALE";

export interface CatalogDefinition {
  id: string;
  label: string;
  group: GroupKey;
  family: string;
  semanticClass: string;
  valueType: ValueType;
  unit: string | null;
  options?: string[];
  applicableCategories: string[];
  importance: "IMPORTANT" | "STANDARD";
  ownerAccess: OwnerAccess;
  reviewState: "DRAFT" | "REVIEW_NEEDED";
  occurrences: number;
  source: string;
  description?: string;
  labels: { de: string; en: string };
  domain: "CLASSIFICATION" | "CUISINE" | "OFFERING" | "CAPABILITY" | "OPERATION" | "AMENITY" | "CONSTRAINT" | "ACCESSIBILITY" | "SUBJECTIVE_FIT" | "TEMPORAL" | "EVIDENCE";
  cardinality: "ONE" | "MANY";
  validation?: { min?: number; max?: number; requiredFields?: string[] };
  allowedClaimSources: Evidence["sourceType"][];
  expiryBehavior: "STATIC" | "REVERIFY" | "EXPIRES";
  engineRelevance: "ENGINE" | "OPERATIONS" | "EXPLANATION" | "NONE";
  derivationRefs: string[];
  lifecycleStatus: "DRAFT" | "REVIEW_NEEDED" | "CANONICAL_CANDIDATE";
}

export interface Evidence {
  sourceType: "OWNER_CLAIM" | "ADMIN_OBSERVATION" | "OFFICIAL_WEBSITE" | "PUBLIC_SOURCE" | "USER_REPORT" | "AI_INFERENCE";
  sourceName: string;
  observedAt: string;
  validFrom: string;
  validUntil: string;
  verificationState: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  reference: string;
  stance: "SUPPORTS" | "CONTRADICTS";
  privateReference: boolean;
}

export interface Claim {
  id: string;
  definitionId: string;
  status: ClaimStatus;
  value: unknown;
  actor: Role;
  createdAt: string;
  evidence: Evidence;
  operation?: "ASSERT" | "RETRACT";
  supersedesClaimId?: string;
}

export interface OpeningDay { day: string; enabled: boolean; open: string; close: string }
export interface PrototypeState {
  schemaVersion: 2;
  prototypeVersion: string;
  catalogVersion: string;
  spot: {
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone: string;
    neighborhood: string;
    website: string;
    phone: string;
    instagram: string;
    facebook: string;
    linkedin: string;
    tiktok: string;
    specialFeature: string;
    priceLevel: string;
    takeaway: "YES" | "NO" | "UNKNOWN";
    primaryCategory: string;
    secondaryCategories: string[];
  };
  claims: Claim[];
  intentCapabilityLinks: Array<{ id: string; intentId: string; capabilityId: string }>;
  schedule: OpeningDay[];
  scheduleConfirmed: boolean;
  exceptions: Array<{ id: string; date: string; state: string; note: string; open?: string; close?: string }>;
  currentState: { service: string; availability: string; area: string; temporaryClosureUntil: string };
  currentObservations: Array<{ id: string; type: "CLOSED_TODAY" | "TEMPORARILY_CLOSED" | "KITCHEN_CLOSED" | "TERRACE_CLOSED" | "FULL" | "LIMITED"; area: string; observedAt: string; validFrom: string; validUntil: string; sourceName: string }>;
  guidedProgress: { visitedSteps: string[]; skippedSteps: string[] };
  migration: { fromVersion: number | null; reviewDefinitionIds: string[]; notice: string };
  savedAt: string | null;
}

const allCategories = generatedCatalog.categories.map((category) => category.key);
type LegacyDefinition = Omit<CatalogDefinition, "labels" | "domain" | "cardinality" | "validation" | "allowedClaimSources" | "expiryBehavior" | "engineRelevance" | "derivationRefs" | "lifecycleStatus">;
const domainFor = (definition: Pick<LegacyDefinition, "semanticClass" | "group" | "family">): CatalogDefinition["domain"] => {
  if (/Accessibility/i.test(definition.family)) return "ACCESSIBILITY";
  if (definition.semanticClass === "CUISINE") return "CUISINE";
  if (definition.semanticClass === "OFFERING") return "OFFERING";
  if (definition.semanticClass === "CAPABILITY") return "CAPABILITY";
  if (definition.semanticClass === "AMENITY") return "AMENITY";
  if (definition.semanticClass === "CONSTRAINT") return "CONSTRAINT";
  if (definition.semanticClass === "DIRECT_FIT") return "SUBJECTIVE_FIT";
  if (definition.group === "TEMPORAL_STATE") return "TEMPORAL";
  if (definition.group === "CHARACTERISTICS") return "OPERATION";
  if (definition.group === "EVIDENCE_CONFIDENCE") return "EVIDENCE";
  return "CLASSIFICATION";
};
const enrichDefinition = (definition: LegacyDefinition): CatalogDefinition => ({
  ...definition,
  labels: { de: definition.label, en: definition.label },
  domain: domainFor(definition),
  cardinality: definition.valueType === "MULTI_SELECT" ? "MANY" : "ONE",
  validation: ["INTEGER", "DECIMAL", "NUMBER", "RANGE", "NUMBER_RANGE"].includes(definition.valueType) ? { min: 0 } : undefined,
  allowedClaimSources: ["OWNER_CLAIM", "ADMIN_OBSERVATION", "OFFICIAL_WEBSITE", "PUBLIC_SOURCE", "USER_REPORT", "AI_INFERENCE"],
  expiryBehavior: definition.group === "TEMPORAL_STATE" ? "EXPIRES" : "REVERIFY",
  engineRelevance: definition.semanticClass === "DECISION_INTENT" ? "NONE" : definition.semanticClass === "DIRECT_FIT" ? "EXPLANATION" : definition.group === "EVIDENCE_CONFIDENCE" ? "NONE" : "ENGINE",
  derivationRefs: [],
  lifecycleStatus: definition.reviewState === "REVIEW_NEEDED" ? "REVIEW_NEEDED" : "DRAFT",
});

const manualDefinitions: CatalogDefinition[] = [
  ["character-space-size", "Flächengröße", "Space & Size", "DECIMAL", "m²", "PRO", "Physische Größe der nutzbaren Fläche."],
  ["character-seating-capacity", "Sitzplatzkapazität gesamt", "Capacity", "INTEGER", "Plätze", "BASIC", "Reguläre Gesamtzahl verfügbarer Sitzplätze."],
  ["character-group-range", "Geeignete Gruppengröße", "Capacity", "NUMBER_RANGE", "Personen", "BASIC", "Praktisch unterstützte Gruppengröße."],
  ["character-room-type", "Raumtypen", "Room Structure", "MULTI_SELECT", null, "PRO", "Innenraum, Separee, Saal oder offene Fläche."],
  ["character-service-model", "Service-Modell", "Operations", "SINGLE_SELECT", null, "BASIC", "Bedienung, Self-Service oder Hybrid."],
  ["character-noise", "Geräuschniveau nach Tageszeit", "Environment", "STRUCTURED_COMPOSITE", null, "PRO", "Beobachtbare Geräuschkulisse morgens, nachmittags und abends."],
  ["character-stay-duration", "Typische Aufenthaltsdauer", "Visit Logistics", "NUMBER_RANGE", "Minuten", "PRO", "Übliche Dauer eines Besuchs."],
  ["character-booking-lead", "Empfohlener Buchungsvorlauf", "Visit Logistics", "INTEGER", "Stunden", "PRO", "Praktischer Vorlauf, keine Verfügbarkeitsgarantie."],
  ["character-price-range", "Preisbereich pro Person", "Visit Logistics", "NUMBER_RANGE", "CHF", "BASIC", "Typischer Betrag pro Person."],
  ["character-arrival-time", "Empfohlene Ankunftszeit", "Time Structure", "TIME", null, "PRO", "Sinnvolle Ankunftszeit für den typischen Besuch."],
  ["character-accessibility", "Barrierefrei zugänglich", "Accessibility", "BOOLEAN", null, "BASIC", "Stufenloser Zugang zu den wesentlichen Gästebereichen."],
  ["character-access-notes", "Bekannte Einschränkungen beim Zugang", "Accessibility", "LONG_TEXT", null, "PRO", "Konkrete Hinweise zu Eingang, Lift oder Engstellen."],
  ["character-layout", "Strukturierter Raumplan", "Room Structure", "STRUCTURED_COMPOSITE", null, "ADMIN", "Strukturierte Bereichsdaten für den technischen Expertenmodus."],
].map(([id, label, family, valueType, unit, ownerAccess, description]) => ({
  id: String(id), label: String(label), group: "CHARACTERISTICS", family: String(family), semanticClass: "PHYSICAL_OPERATIONAL_CHARACTERISTIC",
  valueType: valueType as ValueType, unit: unit ? String(unit) : null, applicableCategories: allCategories, importance: ["character-seating-capacity", "character-accessibility"].includes(String(id)) ? "IMPORTANT" : "STANDARD",
  ownerAccess: ownerAccess as OwnerAccess, reviewState: "DRAFT", occurrences: 1, source: "Ohne Titel.pages", description: String(description),
  options: id === "character-room-type" ? ["Innenbereich", "Außenbereich", "Terrasse", "Garten", "Separater Raum", "Privater Veranstaltungsraum", "Stehbereich", "Sitzbereich"] : id === "character-service-model" ? ["Bedienung am Tisch", "Self-Service", "Hybrid", "Terminbasiert"] : undefined,
} as LegacyDefinition)).map(enrichDefinition);

const typedV3Definitions: CatalogDefinition[] = [
  ["character-seating-indoor", "Sitzplätze innen", "Capacity", "INTEGER", "Plätze", "BASIC", "Reguläre Sitzplatzkapazität im Innenbereich."],
  ["character-seating-outdoor", "Sitzplätze außen", "Capacity", "INTEGER", "Plätze", "BASIC", "Reguläre Sitzplatzkapazität im Außenbereich."],
  ["constraint-age-rule", "Altersregel", "Rules", "CONDITIONAL_RULE", null, "PRO", "Mindestalter mit Zeitraum, Wochentagen und betroffenem Bereich."],
  ["operation-kitchen-hours", "Küchenzeiten", "Service Hours", "WEEKLY_SCHEDULE", null, "BASIC", "Servicezeiten der Küche getrennt von den Öffnungszeiten."],
  ["constraint-reservation-rule", "Reservationsregel", "Rules", "CONDITIONAL_RULE", null, "BASIC", "Konkrete Regel für notwendige oder empfohlene Reservationen."],
  ["character-laptop-policy", "Laptop-Nutzung erlaubt", "Work Infrastructure", "BOOLEAN", null, "BASIC", "Laptops dürfen während des normalen Betriebs genutzt werden."],
  ["character-table-work-fit", "Tischsituation zum Arbeiten", "Work Infrastructure", "SINGLE_SELECT", null, "PRO", "Beobachtbare Eignung der Tische für Laptop-Arbeit."],
  ["character-stay-policy", "Längerer Aufenthalt erlaubt", "Work Infrastructure", "SINGLE_SELECT", null, "PRO", "Ob längeres Sitzen ohne laufende Bestellung üblich oder eingeschränkt ist."],
  ["character-accessible-paths", "Rollstuhlgängige Wege", "Accessibility", "BOOLEAN", null, "BASIC", "Die wesentlichen Wege im Gästebereich sind rollstuhlgängig."],
  ["character-accessible-outdoor", "Zugänglicher Außenbereich", "Accessibility", "BOOLEAN", null, "PRO", "Der Außenbereich ist stufenlos und rollstuhlgängig erreichbar."],
].map(([id, label, family, valueType, unit, ownerAccess, description]) => enrichDefinition({
  id: String(id), label: String(label), group: String(id).startsWith("constraint-") ? "AMENITIES_CONSTRAINTS" : "CHARACTERISTICS", family: String(family), semanticClass: String(id).startsWith("constraint-") ? "CONSTRAINT" : "PHYSICAL_OPERATIONAL_CHARACTERISTIC",
  valueType: valueType as ValueType, unit: unit ? String(unit) : null, applicableCategories: allCategories, importance: ["character-seating-indoor", "constraint-reservation-rule"].includes(String(id)) ? "IMPORTANT" : "STANDARD", ownerAccess: ownerAccess as OwnerAccess,
  reviewState: "DRAFT", occurrences: 1, source: "Prototype V3 typed authoring", description: String(description),
  options: id === "character-table-work-fit" ? ["Nicht geeignet", "Teilweise geeignet", "Gut geeignet"] : id === "character-stay-policy" ? ["Erlaubt", "Nur bei laufender Konsumation", "Zeitlich begrenzt", "Nicht erwünscht"] : undefined,
}));

const guidedPlaceDefinitions: CatalogDefinition[] = [
  ["subcategory-pub", "Pub", ["EAT", "DRINKS", "NIGHTLIFE"]],
  ["subcategory-snack-bar", "Imbiss", ["EAT"]],
  ["subcategory-take-away", "Take Away", ["EAT", "COFFEE_DAYTIME"]],
  ["subcategory-fast-food", "Fast-Food", ["EAT"]],
].map(([id, label, applicableCategories]) => ({
  id: String(id), label: String(label), group: "CLASSIFICATION", family: "Subcategories", semanticClass: "SUBCATEGORY",
  valueType: "BOOLEAN", unit: null, applicableCategories: applicableCategories as string[], importance: "STANDARD", ownerAccess: "BASIC",
  reviewState: "REVIEW_NEEDED", occurrences: 1, source: "Founder UX feedback · 2026-09-09",
  description: "Im UX-Test ergänzt; kanonische Benennung und Abgrenzung vor Production-Übernahme prüfen.",
} as LegacyDefinition)).map(enrichDefinition);

const generatedDefinitions = (generatedCatalog.definitions as LegacyDefinition[]).map(enrichDefinition);
export const catalog = {
  catalogVersion: REGISTRY_VERSION,
  categories: generatedCatalog.categories.map((category, index) => ({ ...category, sourceLabel: index === 14 ? "15. Events & Temporary Places" : category.sourceLabel })),
  definitions: [...generatedDefinitions, ...manualDefinitions, ...guidedPlaceDefinitions, ...typedV3Definitions],
  source: generatedCatalog.source,
};

export const normalizationMap = [
  { canonicalKey: "capability-dinner-service", aliases: ["Dinner", "Abendessen"], labels: { de: "Abendessen angeboten", en: "Dinner service" }, domain: "CAPABILITY", disposition: "MERGE", output: "FACT" },
  { canonicalKey: "capability-group-dining", aliases: ["Group dining", "Sharing / gemeinsames Essen"], labels: { de: "Gemeinsames Essen möglich", en: "Group dining" }, domain: "CAPABILITY", disposition: "MERGE", output: "FACT" },
  { canonicalKey: "capability-social-gathering", aliases: ["Group gathering", "Freunde treffen"], labels: { de: "Treffen in Gruppen möglich", en: "Social gathering" }, domain: "CAPABILITY", disposition: "REVIEW_NEEDED", output: "FACT" },
  { canonicalKey: "intent-business-meeting", aliases: ["Business", "Business Meeting"], labels: { de: "Geschäftliches Treffen", en: "Business meeting" }, domain: "INTENT_REGISTRY", disposition: "REPLACE_SPOT_INTENT", output: "INTENT_CLASS" },
  { canonicalKey: "intent-celebration", aliases: ["Geburtstag", "Geburtstag / Celebration", "Feier / Celebration"], labels: { de: "Feier", en: "Celebration" }, domain: "INTENT_REGISTRY", disposition: "REVIEW_NEEDED", output: "INTENT_CLASS" },
  { canonicalKey: "amenity-outdoor-area", aliases: ["Outdoor seating", "Terrasse", "Garten", "Außenbereich"], labels: { de: "Außenbereich", en: "Outdoor area" }, domain: "AMENITY", disposition: "KEEP_TYPED_VARIANTS", output: "FACT" },
  { canonicalKey: "accessibility-components", aliases: ["Barrierefrei zugänglich", "stufenloser Zugang", "barrierefreie Sitzplätze"], labels: { de: "Konkrete Zugänglichkeitsmerkmale", en: "Accessibility components" }, domain: "ACCESSIBILITY", disposition: "REPLACE_GENERALIZATION", output: "FACT_SET" },
  { canonicalKey: "amenity-dog-access", aliases: ["Hunde erlaubt innen", "Hunde erlaubt außen", "Assistenzhunde erlaubt", "mit Hund"], labels: { de: "Zugang mit Hund", en: "Dog access" }, domain: "AMENITY", disposition: "KEEP_SCOPED_FACTS_DERIVE_FIT", output: "FACT_SET" },
  { canonicalKey: "operation-group-size-range", aliases: ["maximale Gruppengröße", "Geeignete Gruppengröße", "kleine Gruppe 3–5", "mittlere Gruppe 6–10", "große Gruppe 10+"], labels: { de: "Geeignete Gruppengröße", en: "Supported group size" }, domain: "OPERATION", disposition: "REPLACE_WITH_RANGE", output: "TYPED_FACT" },
  { canonicalKey: "operation-stay-duration-range", aliases: ["kurzer Stopp", "1–2 h", "längerer Aufenthalt"], labels: { de: "Typische Aufenthaltsdauer", en: "Typical stay duration" }, domain: "OPERATION", disposition: "REPLACE_WITH_RANGE", output: "TYPED_FACT" },
] as const;

const stableHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};
const duplicateLabels = [...new Set(catalog.definitions.map((item) => item.label.toLocaleLowerCase("de")))].map((label) => ({ label, keys: catalog.definitions.filter((item) => item.label.toLocaleLowerCase("de") === label).map((item) => item.id) })).filter((item) => item.keys.length > 1);
export const registryIdentity = {
  version: REGISTRY_VERSION,
  hash: stableHash(JSON.stringify(catalog.definitions.map((item) => ({ key: item.id, labels: item.labels, domain: item.domain, valueType: item.valueType, unit: item.unit, options: item.options ?? [], categories: [...item.applicableCategories].sort(), lifecycleStatus: item.lifecycleStatus })).sort((a, b) => a.key.localeCompare(b.key)))),
  definitionCount: catalog.definitions.length,
  originCount: generatedDefinitions.length,
  previousPrototypeCount: generatedDefinitions.length + manualDefinitions.length + guidedPlaceDefinitions.length,
  v3TypedAdditionCount: typedV3Definitions.length,
  countExplanation: "727 war der fachliche Entwurfsstand. Die deterministische V2-Registry bestand aus 714 extrahierten Definitionen, 13 typisierten Ergänzungen und 4 Founder-Ortstypen = 731. V3 ergänzt ausschließlich explizite typed composites.",
  duplicates: duplicateLabels,
  aliases: normalizationMap,
  invalidDefinitions: catalog.definitions.filter((item) => !item.id || !item.labels.de || !item.labels.en || !item.valueType).map((item) => item.id),
  withoutValueType: catalog.definitions.filter((item) => !item.valueType).map((item) => item.id),
  incompleteOptions: catalog.definitions.filter((item) => ["SINGLE_SELECT", "MULTI_SELECT"].includes(item.valueType) && !(item.options?.length)).map((item) => item.id),
  reviewNeededCount: catalog.definitions.filter((item) => item.lifecycleStatus === "REVIEW_NEEDED").length,
};

export const groups: Array<{ key: GroupKey; label: string; help: string }> = [
  { key: "CLASSIFICATION", label: "Classification", help: "Subcategories, Cuisines und Offerings – was der Spot ist und anbietet." },
  { key: "INTENTS", label: "Decision Intents", help: "Was ein Nutzer gerade erreichen möchte. Kein Spot-Fact und keine Capability." },
  { key: "CAPABILITIES", label: "Capabilities", help: "Was der Spot nachweisbar ermöglichen kann; Capabilities können Intents unterstützen." },
  { key: "SITUATION_FIT", label: "Situation Fit", help: "Direkt gepflegte Fits; abgeleitete Fits werden separat aus Raw Facts berechnet." },
  { key: "CHARACTERISTICS", label: "Characteristics", help: "Physische und operative Eigenschaften mit passenden Datentypen." },
  { key: "AMENITIES_CONSTRAINTS", label: "Amenities & Constraints", help: "Ausstattung sowie harte oder praktische Einschränkungen." },
  { key: "TEMPORAL_STATE", label: "Temporal & Current State", help: "Zeitabhängige Eigenschaften; Schedule und Live-Zustände stehen oben in diesem Bereich." },
  { key: "EVIDENCE_CONFIDENCE", label: "Evidence & Confidence", help: "Entwurfsdimensionen des Quellen- und Verifikationsmodells; Evidence wird pro Claim erfasst." },
];

export const emptyState = (): PrototypeState => ({
  schemaVersion: 2,
  prototypeVersion: PROTOTYPE_VERSION,
  catalogVersion: catalog.catalogVersion,
  spot: {
    name: "Philipps Casa", address: "Casaweg 7", city: "Zürich", neighborhood: "", country: "CH", latitude: 47.3769, longitude: 8.5417,
    timezone: "Europe/Zurich", website: "", phone: "", instagram: "", facebook: "", linkedin: "", tiktok: "", specialFeature: "",
    priceLevel: "", takeaway: "UNKNOWN", primaryCategory: "EAT", secondaryCategories: [],
  },
  claims: [],
  intentCapabilityLinks: [],
  schedule: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].map((day, index) => ({ day, enabled: index < 6, open: index === 5 ? "10:00" : "08:00", close: index === 5 ? "23:00" : "22:00" })),
  scheduleConfirmed: false,
  exceptions: [],
  currentState: { service: "NORMAL", availability: "UNKNOWN", area: "ALL_OPEN", temporaryClosureUntil: "" },
  currentObservations: [],
  guidedProgress: { visitedSteps: ["basics"], skippedSteps: [] },
  migration: { fromVersion: null, reviewDefinitionIds: [], notice: "Neue V3-Erfassung" },
  savedAt: null,
});

const statusHasValue = (status: ResolvedStatus) => status === "KNOWN_TRUE" || status === "KNOWN_FALSE" || status === "KNOWN_VALUE";
const stableValue = (value: unknown) => JSON.stringify(value ?? null);
const isExpired = (claim: Claim, now: Date) => Boolean(claim.evidence.validUntil) && new Date(`${claim.evidence.validUntil}T23:59:59`).getTime() < now.getTime();

export interface ResolvedItem {
  definition: CatalogDefinition;
  status: ResolvedStatus;
  value: unknown;
  confidence: number;
  claims: Claim[];
  reason: string;
}

export function trustStateFor(item: ResolvedItem): TrustState {
  if (item.status === "DISPUTED") return "CONFLICTING";
  if (item.status === "EXPIRED") return "STALE";
  if (item.claims.some((claim) => claim.evidence.verificationState === "VERIFIED")) return "CONFIRMED";
  if (item.claims.some((claim) => claim.evidence.sourceName.trim())) return "SOURCED";
  return "UNBACKED";
}

export function confidenceFor(claim: Claim, now = new Date()): number {
  const source = { ADMIN_OBSERVATION: 72, OFFICIAL_WEBSITE: 65, OWNER_CLAIM: 55, PUBLIC_SOURCE: 48, USER_REPORT: 35, AI_INFERENCE: 18 }[claim.evidence.sourceType];
  const verification = { VERIFIED: 18, PENDING: 3, UNVERIFIED: 0, REJECTED: -45 }[claim.evidence.verificationState];
  const ageDays = claim.evidence.observedAt ? Math.max(0, (now.getTime() - new Date(claim.evidence.observedAt).getTime()) / 86_400_000) : 365;
  const freshness = ageDays <= 30 ? 8 : ageDays <= 180 ? 3 : ageDays <= 365 ? 0 : -10;
  const aiCeiling = claim.evidence.sourceType === "AI_INFERENCE" ? 35 : 100;
  return Math.max(0, Math.min(aiCeiling, source + verification + freshness));
}

export function resolveKnowledge(state: PrototypeState, now = new Date()): ResolvedItem[] {
  const byDefinition = new Map<string, Claim[]>();
  const superseded = new Set(state.claims.filter((claim) => claim.operation === "RETRACT").map((claim) => claim.supersedesClaimId).filter(Boolean));
  for (const claim of state.claims) {
    if (claim.operation === "RETRACT" || superseded.has(claim.id)) continue;
    byDefinition.set(claim.definitionId, [...(byDefinition.get(claim.definitionId) ?? []), claim]);
  }
  const result: ResolvedItem[] = [];
  for (const [definitionId, claims] of byDefinition) {
    const definition = catalog.definitions.find((item) => item.id === definitionId);
    if (!definition) continue;
    const nonRejected = claims.filter((claim) => claim.evidence.verificationState !== "REJECTED");
    const active = nonRejected.filter((claim) => !isExpired(claim, now));
    if (!active.length) {
      const latest = nonRejected.at(-1) ?? claims.at(-1);
      if (latest) result.push({ definition, status: "EXPIRED", value: latest.value, confidence: 0, claims, reason: "Alle nicht verworfenen Angaben sind abgelaufen." });
      continue;
    }
    const values = new Set(active.filter((claim) => statusHasValue(claim.status)).map((claim) => `${claim.status}:${stableValue(claim.value)}`));
    const explicitDispute = active.some((claim) => claim.status === "DISPUTED" || claim.evidence.stance === "CONTRADICTS");
    if (explicitDispute || values.size > 1) {
      result.push({ definition, status: "DISPUTED", value: active.map((claim) => ({ status: claim.status, value: claim.value })), confidence: 0, claims, reason: "Aktive Claims widersprechen einander; kein aktueller Fact wird ausgegeben." });
      continue;
    }
    const winner = [...active].sort((a, b) => confidenceFor(b, now) - confidenceFor(a, now) || b.createdAt.localeCompare(a.createdAt))[0];
    result.push({ definition, status: winner.status, value: winner.value, confidence: confidenceFor(winner, now), claims, reason: `Aufgelöst aus ${active.length} aktivem Claim(s); höchstes simuliertes Evidence-Gewicht.` });
  }
  return result.sort((a, b) => a.definition.label.localeCompare(b.definition.label));
}

export interface DerivedFit { ruleId: string; key: string; kind: "CAPABILITY" | "FIT" | "INFORMATION"; label: string; sourceFacts: string[]; exclusions: string[]; explanation: string; trust: TrustState; validUntil: string | null }
export function deriveFits(resolved: ResolvedItem[]): DerivedFit[] {
  const find = (label: string) => resolved.find((item) => item.definition.label.toLocaleLowerCase("de") === label.toLocaleLowerCase("de") && ["KNOWN_TRUE", "KNOWN_VALUE"].includes(item.status));
  const add = (ruleId: string, key: string, kind: DerivedFit["kind"], label: string, facts: ResolvedItem[], explanation: string, exclusions: string[] = []) => ({ ruleId, key, kind, label, sourceFacts: facts.map((item) => item.definition.id), exclusions, explanation, trust: facts.every((item) => trustStateFor(item) === "CONFIRMED") ? "CONFIRMED" as const : facts.every((item) => trustStateFor(item) !== "UNBACKED") ? "SOURCED" as const : "UNBACKED" as const, validUntil: facts.flatMap((item) => item.claims.map((claim) => claim.evidence.validUntil).filter(Boolean)).sort()[0] ?? null });
  const fits: DerivedFit[] = [];
  const covered = find("überdachte Außenplätze"); if (covered) fits.push(add("wk.rule.weather_protected.v1", "weather_protected_outdoor", "CAPABILITY", "Wetterschutz im Außenbereich vorhanden", [covered], "Ein belegter Wetterschutz beschreibt Infrastruktur, nicht automatisch vollständige Regentauglichkeit."));
  const wlan = find("WLAN"); const outlets = find("Steckdosen"); if (wlan && outlets) fits.push(add("wk.rule.work_infrastructure.v1", "work_infrastructure", "CAPABILITY", "Arbeitsinfrastruktur vorhanden", [wlan, outlets], "WLAN und Steckdosen sind belegt. Eine allgemeine Arbeitseignung wird ohne Laptop-Policy, Tischsituation und Aufenthaltsregel nicht behauptet.", ["character-laptop-policy", "character-table-work-fit", "character-stay-policy"]));
  const outdoor = find("Terrasse") ?? find("Garten") ?? find("Outdoor seating"); if (outdoor) fits.push(add("wk.rule.outdoor_area.v1", "outdoor_area_available", "CAPABILITY", "Außenbereich vorhanden", [outdoor], "Ein Außenbereich ist belegt; seine aktuelle Öffnung und Wettertauglichkeit bleiben separate zeitabhängige Informationen."));
  const groupRange = resolved.find((item) => item.definition.id === "character-group-range" && item.status === "KNOWN_VALUE"); if (groupRange) fits.push(add("wk.rule.group_infrastructure.v1", "group_size_supported", "CAPABILITY", "Konkreter Gruppengrößenbereich bekannt", [groupRange], "Der erfasste Zahlenbereich kann gegen eine Gruppengröße geprüft werden; er behauptet keine unbegrenzte Gruppeneignung."));
  const stepFree = find("stufenloser Zugang"); const accessibleSeats = find("barrierefreie Sitzplätze"); const accessiblePaths = resolved.find((item) => item.definition.id === "character-accessible-paths" && item.status === "KNOWN_TRUE"); if (stepFree || accessibleSeats || accessiblePaths) fits.push(add("wk.rule.accessibility_components.v1", "accessibility_information_available", "INFORMATION", "Konkrete Angaben zur Zugänglichkeit vorhanden", [stepFree, accessibleSeats, accessiblePaths].filter(Boolean) as ResolvedItem[], "Einzelne Zugänglichkeitsmerkmale sind belegt. Daraus wird bewusst keine vollständige Barrierefreiheit abgeleitet."));
  const highchair = find("Hochstuhl"); const stroller = find("Kinderwagen geeignet"); if (highchair && stroller) fits.push(add("wk.rule.family_infrastructure.v1", "family_infrastructure", "CAPABILITY", "Infrastruktur für Besuche mit kleinen Kindern vorhanden", [highchair, stroller], "Hochstuhl und Kinderwagentauglichkeit sind belegt; Atmosphäre oder generelle Familienfreundlichkeit werden nicht automatisch behauptet."));
  return fits;
}

export type SemanticIssueType = "HARD_CONTRADICTION" | "EXPLAINABLE_TENSION" | "MISSING_REQUIRED_DETAIL" | "TEMPORAL_DEVIATION" | "INSUFFICIENT_EVIDENCE";
export interface SemanticIssue { ruleId: string; type: SemanticIssueType; title: string; keys: string[]; explanation: string; resolution: string }
export function semanticIssues(state: PrototypeState, now = new Date()): SemanticIssue[] {
  const resolved = resolveKnowledge(state, now); const byLabel = (label: string) => resolved.find((item) => item.definition.label.toLocaleLowerCase("de") === label.toLocaleLowerCase("de")); const byId = (id: string) => resolved.find((item) => item.definition.id === id); const truthy = (label: string) => byLabel(label)?.status === "KNOWN_TRUE"; const issues: SemanticIssue[] = [];
  const push = (ruleId: string, type: SemanticIssueType, title: string, labels: string[], explanation: string, resolution: string) => issues.push({ ruleId, type, title, keys: labels.map((label) => byLabel(label)?.definition.id ?? label), explanation, resolution });
  if (truthy("Reservation erforderlich") && (truthy("spontan gut machbar") || truthy("spontan vorbeigehen"))) push("wk.conflict.reservation_spontaneous.v1", "EXPLAINABLE_TENSION", "Reservation und spontaner Besuch", ["Reservation erforderlich", "spontan gut machbar", "spontan vorbeigehen"], "Eine erforderliche Reservation passt nicht ohne weitere Bedingung zu einem spontanen Besuch.", "Reservationsregel nach Gruppengröße, Wochentag oder Uhrzeit präzisieren.");
  const reservation = byId("constraint-reservation-rule"); if (reservation?.status === "KNOWN_VALUE" && (reservation.value as { mode?: string })?.mode === "ALWAYS" && (truthy("spontan gut machbar") || truthy("spontan vorbeigehen"))) push("wk.conflict.typed_reservation_spontaneous.v1", "EXPLAINABLE_TENSION", "Reservationsregel und spontaner Besuch", ["spontan gut machbar", "spontan vorbeigehen"], "Die strukturierte Regel verlangt immer eine Reservation, gleichzeitig wurde spontaner Besuch direkt behauptet.", "Prüfen, ob die Regel nur für Zeiten, Gruppen oder Bereiche gilt.");
  if (truthy("maximale Gruppengröße")) push("wk.conflict.legacy_group_limit.v1", "MISSING_REQUIRED_DETAIL", "Maximale Gruppengröße ohne Wert", ["maximale Gruppengröße"], "Der alte Ja/Nein-Wert enthält keine Personenzahl und ist nicht engine-fähig.", "Konkreten Bereich unter ‚Geeignete Gruppengröße‘ erfassen.");
  if (truthy("Alkohol nur ab bestimmtem Alter")) push("wk.conflict.legacy_age_rule.v1", "MISSING_REQUIRED_DETAIL", "Altersbeschränkung ohne Regel", ["Alkohol nur ab bestimmtem Alter"], "Mindestalter, Zeitfenster und betroffener Bereich fehlen.", "Eine strukturierte Altersregel erfassen.");
  if (truthy("Küche schließt früher als Venue")) push("wk.conflict.legacy_kitchen_close.v1", "MISSING_REQUIRED_DETAIL", "Küchenschluss ohne Uhrzeit", ["Küche schließt früher als Venue"], "Der alte Ja/Nein-Wert enthält keine Servicezeit.", "Küchenzeiten je Wochentag erfassen.");
  if (truthy("kurzer Stopp") && truthy("längerer Aufenthalt")) push("wk.conflict.stay_duration.v1", "EXPLAINABLE_TENSION", "Kurzer und langer Aufenthalt", ["kurzer Stopp", "längerer Aufenthalt"], "Beide Aussagen können für verschiedene Situationen gelten, sind ohne Dauerbereich aber zu breit.", "Typische Aufenthaltsdauer als Zahlenbereich oder nach Angebot erfassen.");
  const groupRange = byId("character-group-range"); if (groupRange?.status === "KNOWN_VALUE" && Number((groupRange.value as { max?: number })?.max) < 10 && truthy("große Gruppe 10+")) push("wk.conflict.group_range_large_fit.v1", "HARD_CONTRADICTION", "Gruppenbereich und große Gruppe", ["große Gruppe 10+"], "Der konkrete Gruppenbereich endet unter zehn Personen, gleichzeitig wurde Eignung für Gruppen ab zehn behauptet.", "Zahlenbereich oder breite Gruppenbehauptung korrigieren.");
  if (truthy("Outdoor-only") && truthy("ganzjährig wetterunabhängig")) push("wk.conflict.outdoor_weather.v1", "EXPLAINABLE_TENSION", "Nur draußen und wetterunabhängig", ["Outdoor-only", "ganzjährig wetterunabhängig"], "Ein reiner Außenort ist nur mit konkretem Wetterschutz ganzjährig wetterunabhängig.", "Überdachung, Heizung und Windschutz konkret erfassen.");
  const ageRule = byId("constraint-age-rule"); if (ageRule?.status === "KNOWN_VALUE" && Number((ageRule.value as { minimumAge?: number })?.minimumAge) >= 18 && (ageRule.value as { timing?: string })?.timing === "ALL_DAY" && (truthy("mit Kindern") || truthy("Family outing"))) push("wk.conflict.age_family.v1", "HARD_CONTRADICTION", "Ganztägige Altersgrenze und Familienbesuch", ["mit Kindern", "Family outing"], "Eine ganztägige Mindestalterregel ab 18 widerspricht einem Besuch mit Kindern.", "Betroffenen Bereich oder Zeitfenster der Altersregel präzisieren.");
  if (state.spot.takeaway === "NO" && (truthy("Takeaway") || truthy("Take Away"))) push("wk.conflict.takeaway.v1", "HARD_CONTRADICTION", "Take-away widersprüchlich", ["Takeaway", "Take Away"], "Take-away ist ausdrücklich verneint, gleichzeitig aber als Service oder Ortstyp aktiviert.", "Ortstyp und verfügbaren Service getrennt prüfen.");
  const activeObservations = state.currentObservations.filter((item) => !item.validUntil || new Date(item.validUntil).getTime() >= now.getTime());
  if (activeObservations.some((item) => item.type === "TERRACE_CLOSED") && (truthy("Outdoor seating") || truthy("Terrasse"))) push("wk.conflict.terrace_current.v1", "TEMPORAL_DEVIATION", "Außenbereich aktuell geschlossen", ["Terrasse", "Outdoor seating"], "Der Außenbereich existiert dauerhaft, ist laut aktueller Beobachtung aber vorübergehend geschlossen.", "Die temporäre Abweichung bis zum Ablaufzeitpunkt berücksichtigen.");
  if (activeObservations.some((item) => item.type === "KITCHEN_CLOSED") && truthy("Full meal")) push("wk.conflict.kitchen_current.v1", "TEMPORAL_DEVIATION", "Küche aktuell geschlossen", ["Full meal"], "Vollständige Mahlzeiten gehören zum dauerhaften Angebot, sind aktuell aber nicht verfügbar.", "Capability beibehalten, aktuelle Eligibility bis zum Ablauf sperren.");
  if ((state.currentState.service === "CLOSED" || activeObservations.some((item) => ["CLOSED_TODAY", "TEMPORARILY_CLOSED"].includes(item.type))) && state.currentState.availability !== "UNAVAILABLE") push("wk.conflict.closed_available.v1", "HARD_CONTRADICTION", "Geschlossen und verfügbar", [], "Der Spot ist geschlossen, aber der aktuelle Verfügbarkeitsstatus widerspricht dem.", "Aktuelle Verfügbarkeit auf nicht verfügbar setzen oder Schließung korrigieren.");
  return issues;
}

export function relevantDefinitions(state: PrototypeState) {
  const selected = new Set([state.spot.primaryCategory, ...state.spot.secondaryCategories]);
  return catalog.definitions.filter((definition) => definition.applicableCategories.some((key) => selected.has(key)));
}

const legacyIncompleteLabels = new Set(["Alkohol nur ab bestimmtem Alter", "maximale Gruppengröße", "Küche schließt früher als Venue"]);
export function isCompleteValue(item: ResolvedItem) {
  if (!["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE"].includes(item.status)) return false;
  if (item.status === "KNOWN_TRUE" && legacyIncompleteLabels.has(item.definition.label)) return false;
  const value = item.value;
  if (["NUMBER_RANGE", "RANGE"].includes(item.definition.valueType)) return Boolean(value && typeof value === "object" && Number.isFinite((value as { min?: number }).min) && Number.isFinite((value as { max?: number }).max));
  if (item.definition.valueType === "CONDITIONAL_RULE") {
    if (!value || typeof value !== "object") return false;
    if (item.definition.id === "constraint-age-rule") { const rule = value as { minimumAge?: number; timing?: string; fromTime?: string }; return Number.isFinite(rule.minimumAge) && Boolean(rule.timing) && (rule.timing !== "FROM_TIME" || Boolean(rule.fromTime)); }
    if (item.definition.id === "constraint-reservation-rule") return Boolean((value as { mode?: string }).mode);
  }
  if (item.definition.valueType === "WEEKLY_SCHEDULE") return Array.isArray(value) && value.some((day) => day && typeof day === "object" && (day as { enabled?: boolean }).enabled && (day as { close?: string }).close);
  if (item.definition.valueType === "STRUCTURED_COMPOSITE") return Boolean(value && typeof value === "object" && Object.values(value as Record<string, unknown>).some((entry) => entry !== "" && entry !== null && entry !== undefined));
  if (Array.isArray(value)) return value.length > 0;
  return item.status !== "KNOWN_VALUE" || (value !== null && value !== undefined && value !== "");
}

export function qualityFor(state: PrototypeState, now = new Date()) {
  const resolved = resolveKnowledge(state, now);
  const relevant = relevantDefinitions(state).filter((definition) => definition.group !== "EVIDENCE_CONFIDENCE");
  const resolvedMap = new Map(resolved.map((item) => [item.definition.id, item])); const known = resolved.filter(isCompleteValue); const addressed = resolved.filter((item) => item.status !== "EXPIRED");
  const profileChecks = [state.spot.name, state.spot.address, state.spot.city, state.spot.primaryCategory]; const profileComplete = profileChecks.filter(Boolean).length; const trustCounts = { UNBACKED: 0, SOURCED: 0, CONFIRMED: 0, CONFLICTING: 0, STALE: 0 } satisfies Record<TrustState, number>;
  resolved.forEach((item) => { trustCounts[trustStateFor(item)] += 1; });
  const selected = new Set([state.spot.primaryCategory, ...state.spot.secondaryCategories]);
  return {
    profile: { completed: profileComplete, total: profileChecks.length, state: profileComplete === profileChecks.length ? "COMPLETE" : "NEEDS_ATTENTION" },
    answeredQuestions: addressed.length,
    knownFacts: known.filter((item) => !["DECISION_INTENT", "DIRECT_FIT"].includes(item.definition.semanticClass)).length,
    evidence: { withSource: known.filter((item) => item.claims.some((claim) => claim.evidence.sourceName.trim())).length, confirmed: trustCounts.CONFIRMED, unbacked: trustCounts.UNBACKED },
    freshness: { current: resolved.filter((item) => item.status !== "EXPIRED").length, expired: trustCounts.STALE, temporaryActive: (state.currentObservations ?? []).filter((item) => !item.validUntil || new Date(item.validUntil).getTime() >= now.getTime()).length },
    engineReadiness: {
      discovery: state.spot.name && state.spot.address && state.spot.primaryCategory ? "READY" : "NEEDS_CORE_PROFILE",
      openingHours: state.scheduleConfirmed ? "READY" : "UNCONFIRMED_DEFAULT",
      constraints: semanticIssues(state, now).some((item) => item.type === "MISSING_REQUIRED_DETAIL") ? "NEEDS_STRUCTURED_DETAILS" : "READY",
      intentMatching: deriveFits(resolved).length ? "PARTIAL" : "NEEDS_CAPABILITIES",
    },
    technicalCatalogCoverage: relevant.length ? Math.round((addressed.length / relevant.length) * 100) : 0,
    relevantCount: relevant.length,
    filledCount: addressed.length,
    importantMissing: relevant.filter((definition) => definition.importance === "IMPORTANT" && !resolvedMap.has(definition.id) && !["TEMPORAL_STATE", "EVIDENCE_CONFIDENCE"].includes(definition.group)).slice(0, 12),
    conflicts: resolved.filter((item) => item.status === "DISPUTED"),
    semanticIssues: semanticIssues(state, now),
    expired: resolved.filter((item) => item.status === "EXPIRED"),
    withoutSource: state.claims.filter((claim) => !claim.evidence.sourceName.trim()),
    foreign: resolved.filter((item) => !item.definition.applicableCategories.some((key) => selected.has(key))),
  };
}

const allowedResolved = (item: ResolvedItem) => !["DISPUTED", "EXPIRED"].includes(item.status) && item.definition.group !== "EVIDENCE_CONFIDENCE";
export function engineSnapshot(state: PrototypeState, now = new Date()) {
  const resolved = resolveKnowledge(state, now); const eligible = resolved.filter((item) => allowedResolved(item) && isCompleteValue(item)); const entry = (item: ResolvedItem) => ({ key: item.definition.id, status: item.status, value: item.value, trust: trustStateFor(item) }); const byClass = (semanticClass: string) => eligible.filter((item) => item.definition.semanticClass === semanticClass).map(entry); const byDomain = (domain: CatalogDefinition["domain"]) => eligible.filter((item) => item.definition.domain === domain).map(entry); const derivedKnowledge = deriveFits(resolved); const issues = semanticIssues(state, now); const current = (state.currentObservations ?? []).filter((item) => !item.validUntil || new Date(item.validUntil).getTime() >= now.getTime()).map((item) => ({ type: item.type, area: item.area, observedAt: item.observedAt, validFrom: item.validFrom, validUntil: item.validUntil, sourceState: item.sourceName ? "SOURCED" : "UNBACKED" }));
  const operationIds = new Set(["character-space-size", "character-seating-capacity", "character-seating-indoor", "character-seating-outdoor", "character-group-range", "character-room-type", "character-service-model", "character-noise", "character-stay-duration", "character-booking-lead", "character-price-range", "character-arrival-time", "character-laptop-policy", "character-table-work-fit", "character-stay-policy"]);
  return {
    contract: { name: "WorldKnowledgePort", version: "preview.v2" },
    registry: { version: registryIdentity.version, hash: registryIdentity.hash, definitionCount: registryIdentity.definitionCount },
    resolvedAsOfDate: now.toISOString().slice(0, 10),
    spotIdentity: {
      name: state.spot.name,
      location: { address: state.spot.address, neighborhood: state.spot.neighborhood, city: state.spot.city, country: state.spot.country, latitude: state.spot.latitude, longitude: state.spot.longitude, timezone: state.spot.timezone },
      publicContact: { website: state.spot.website, phone: state.spot.phone, instagram: state.spot.instagram, facebook: state.spot.facebook, linkedin: state.spot.linkedin, tiktok: state.spot.tiktok },
      description: { specialFeature: state.spot.specialFeature || null },
    },
    classification: { primaryCategoryKey: state.spot.primaryCategory, subcategoryKeys: eligible.filter((item) => item.definition.semanticClass === "SUBCATEGORY" && item.status === "KNOWN_TRUE").map((item) => item.definition.id) },
    cuisine: byClass("CUISINE"),
    offering: byClass("OFFERING"),
    capabilities: byClass("CAPABILITY"),
    operationalModel: { priceLevel: state.spot.priceLevel || null, takeawayAvailable: state.spot.takeaway, facts: eligible.filter((item) => operationIds.has(item.definition.id)).map(entry) },
    regularHours: { state: state.scheduleConfirmed ? "CONFIRMED" : "UNCONFIRMED_SYNTHETIC_DEFAULT", timezone: state.spot.timezone, schedule: state.scheduleConfirmed ? state.schedule : [] },
    serviceHours: { kitchen: eligible.filter((item) => item.definition.id === "operation-kitchen-hours").map(entry) },
    specialHours: state.scheduleConfirmed ? state.exceptions : [],
    currentState: current,
    amenities: byDomain("AMENITY"),
    hardConstraints: byDomain("CONSTRAINT"),
    accessibility: byDomain("ACCESSIBILITY"),
    directSubjectiveClaims: byDomain("SUBJECTIVE_FIT"),
    derivedKnowledge,
    evidenceSummary: { trustStates: eligible.reduce<Record<TrustState, number>>((counts, item) => ({ ...counts, [trustStateFor(item)]: counts[trustStateFor(item)] + 1 }), { UNBACKED: 0, SOURCED: 0, CONFIRMED: 0, CONFLICTING: 0, STALE: 0 }), note: "Qualitative provenance summary; no calibrated truth percentage." },
    freshness: { resolvedAsOf: now.toISOString(), activeTemporaryObservations: current.length },
    conflicts: issues,
    unknowns: resolved.filter((item) => item.status === "UNKNOWN").map((item) => ({ key: item.definition.id, status: "EXPLICITLY_UNKNOWN" })),
    excluded: { directUserIntents: true, secondaryCategories: state.spot.secondaryCategories.length, incompleteLegacyClaims: resolved.filter((item) => allowedResolved(item) && !isCompleteValue(item)).map((item) => item.definition.id) },
  };
}

export function analysisReport(state: PrototypeState, now = new Date()) {
  const resolved = resolveKnowledge(state, now);
  const quality = qualityFor(state, now);
  const snapshot = engineSnapshot(state, now);
  const list = (status: ResolvedStatus) => resolved.filter((item) => item.status === status).map((item) => item.definition.label);
  const byClass = (semanticClass: string) => resolved.filter((item) => item.definition.semanticClass === semanticClass && allowedResolved(item)).map((item) => item.definition.label);
  return {
    generatedAt: `${now.toISOString().slice(0, 10)}T00:00:00.000Z`,
    categories: { primary: state.spot.primaryCategory, secondary: state.spot.secondaryCategories },
    legacySpotIntentsExcluded: byClass("DECISION_INTENT"),
    evidencedCapabilities: byClass("CAPABILITY"),
    knownRawFacts: resolved.filter((item) => allowedResolved(item) && !["DIRECT_FIT", "DECISION_INTENT"].includes(item.definition.semanticClass)).map((item) => ({ label: item.definition.label, status: item.status, value: item.value })),
    knownFalse: list("KNOWN_FALSE"), unknown: list("UNKNOWN"), notApplicable: list("NOT_APPLICABLE"), disputed: list("DISPUTED"), expired: list("EXPIRED"),
    directFits: byClass("DIRECT_FIT"), derivedFits: deriveFits(resolved), semanticIssues: semanticIssues(state, now),
    hardConstraintCandidates: resolved.filter((item) => item.definition.semanticClass === "CONSTRAINT" || /access|age|entry|reservation|wheelchair|barriere/i.test(`${item.definition.family} ${item.definition.label}`)).map((item) => item.definition.label),
    softFitCandidates: resolved.filter((item) => ["AMENITY", "DIRECT_FIT", "CAPABILITY"].includes(item.definition.semanticClass)).map((item) => item.definition.label),
    explanationOnly: resolved.filter((item) => item.confidence < 50 || item.definition.semanticClass === "DIRECT_FIT").map((item) => item.definition.label),
    excludedFromEngine: ["Owner identity", "Owner tier", "Subscription", "Payment", "Admin notes", "private source references", "private user evidence", "raw AI output", "disputed and expired claims"],
    quality: { profile: quality.profile, answeredQuestions: quality.answeredQuestions, knownFacts: quality.knownFacts, evidence: quality.evidence, freshness: quality.freshness, engineReadiness: quality.engineReadiness, technicalCatalogCoverage: quality.technicalCatalogCoverage, importantMissing: quality.importantMissing.map((item) => item.label) },
    engineSnapshot: snapshot,
  };
}

export function exportPackage(state: PrototypeState, now = new Date()) {
  return { prototypeVersion: PROTOTYPE_VERSION, registryIdentity, normalizationMap, exportedAt: now.toISOString(), prototypeState: state, spotState: state.spot, claims: state.claims, evidence: state.claims.map((claim) => ({ claimId: claim.id, ...claim.evidence })), resolvedSnapshot: resolveKnowledge(state, now), analysisReport: analysisReport(state, now), engineSnapshotPreview: engineSnapshot(state, now), migration: state.migration, prototypeNotice: "UX- und Contract-Labor; kein kanonisches Production-Schema." };
}

export function validateImport(value: unknown): PrototypeState {
  if (!value || typeof value !== "object") throw new Error("Die Datei enthält kein gültiges Analysepaket.");
  const candidate = value as Record<string, unknown>;
  const state = (candidate.prototypeState ?? (candidate.spotState && candidate.claims ? { ...emptyState(), spot: candidate.spotState, claims: candidate.claims } : candidate)) as Partial<PrototypeState>;
  const importedSchema = Number((state as { schemaVersion?: number }).schemaVersion ?? 1);
  if (![1, 2].includes(importedSchema) && !candidate.spotState) throw new Error("Unbekannte Prototype-Schemaversion.");
  if (!state.spot || state.spot.name !== "Philipps Casa" || !Array.isArray(state.claims)) throw new Error("Nur ein gültiger Export für Philipps Casa kann importiert werden.");
  const defaults = emptyState();
  const reviewDefinitionIds = state.claims.filter((claim) => claim.operation !== "RETRACT" && ["alkohol-nur-ab-bestimmtem-alter-1cd64677", "maximale-gruppengro-e-5ffaa094", "kuche-schlie-t-fruher-als-venue-586a95ff"].includes(claim.definitionId) && claim.status === "KNOWN_TRUE").map((claim) => claim.definitionId);
  return {
    ...defaults,
    ...state,
    spot: { ...defaults.spot, ...state.spot, secondaryCategories: state.spot.secondaryCategories ?? [] },
    currentState: { ...defaults.currentState, ...state.currentState },
    currentObservations: state.currentObservations ?? defaults.currentObservations,
    scheduleConfirmed: state.scheduleConfirmed ?? false,
    guidedProgress: state.guidedProgress ?? defaults.guidedProgress,
    migration: importedSchema < 2 ? { fromVersion: importedSchema, reviewDefinitionIds: [...new Set(reviewDefinitionIds)], notice: reviewDefinitionIds.length ? `${reviewDefinitionIds.length} alte Ja/Nein-Angaben benötigen konkrete Detailwerte und werden nicht an die Engine gegeben.` : "V2-Daten vollständig erhalten und auf V3-Struktur angehoben." } : state.migration ?? defaults.migration,
    schemaVersion: 2,
    prototypeVersion: PROTOTYPE_VERSION,
    catalogVersion: catalog.catalogVersion,
  } as PrototypeState;
}
