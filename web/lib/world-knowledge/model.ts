import generatedCatalog from "./catalog.generated.json" with { type: "json" };

export const PROTOTYPE_VERSION = "philipps-casa-prototype-2.1.0";
export const STORAGE_KEY = "backyrd:world-knowledge-prototype:philipps-casa:v1";

export type Role = "ADMIN" | "OWNER_BASIC" | "OWNER_PRO";
export type GroupKey = "CLASSIFICATION" | "INTENTS" | "CAPABILITIES" | "SITUATION_FIT" | "CHARACTERISTICS" | "AMENITIES_CONSTRAINTS" | "TEMPORAL_STATE" | "EVIDENCE_CONFIDENCE";
export type ClaimStatus = "KNOWN_TRUE" | "KNOWN_FALSE" | "KNOWN_VALUE" | "UNKNOWN" | "NOT_APPLICABLE" | "DISPUTED";
export type ResolvedStatus = ClaimStatus | "EXPIRED";
export type ValueType = "BOOLEAN" | "SINGLE_SELECT" | "MULTI_SELECT" | "NUMBER" | "RANGE" | "TIME" | "DATE" | "SCHEDULE" | "TEXT" | "STRUCTURED";
export type OwnerAccess = "BASIC" | "PRO" | "ADMIN";

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
  schemaVersion: 1;
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
  exceptions: Array<{ id: string; date: string; state: string; note: string; open?: string; close?: string }>;
  currentState: { service: string; availability: string; area: string; temporaryClosureUntil: string };
  guidedProgress: { visitedSteps: string[]; skippedSteps: string[] };
  savedAt: string | null;
}

const allCategories = generatedCatalog.categories.map((category) => category.key);
const manualDefinitions: CatalogDefinition[] = [
  ["character-space-size", "Flächengröße", "Space & Size", "NUMBER", "m²", "PRO", "Physische Größe der nutzbaren Fläche."],
  ["character-seating-capacity", "Sitzplatzkapazität", "Capacity", "NUMBER", "Plätze", "BASIC", "Reguläre Anzahl verfügbarer Sitzplätze."],
  ["character-group-range", "Geeignete Gruppengröße", "Capacity", "RANGE", "Personen", "BASIC", "Praktisch unterstützte Gruppengröße."],
  ["character-room-type", "Raumtypen", "Room Structure", "MULTI_SELECT", null, "PRO", "Innenraum, Separee, Saal oder offene Fläche."],
  ["character-service-model", "Service-Modell", "Operations", "SINGLE_SELECT", null, "BASIC", "Bedienung, Self-Service oder Hybrid."],
  ["character-noise", "Typisches Geräuschniveau", "Environment", "SINGLE_SELECT", null, "PRO", "Beobachtbare, zeitabhängige Geräuschkulisse."],
  ["character-stay-duration", "Typische Aufenthaltsdauer", "Visit Logistics", "RANGE", "Minuten", "PRO", "Übliche Dauer eines Besuchs."],
  ["character-booking-lead", "Empfohlener Buchungsvorlauf", "Visit Logistics", "NUMBER", "Stunden", "PRO", "Praktischer Vorlauf, keine Verfügbarkeitsgarantie."],
  ["character-price-range", "Preisbereich pro Person", "Visit Logistics", "RANGE", "CHF", "BASIC", "Typischer Betrag pro Person."],
  ["character-arrival-time", "Empfohlene Ankunftszeit", "Time Structure", "TIME", null, "PRO", "Sinnvolle Ankunftszeit für den typischen Besuch."],
  ["character-accessibility", "Barrierefrei zugänglich", "Accessibility", "BOOLEAN", null, "BASIC", "Stufenloser Zugang zu den wesentlichen Gästebereichen."],
  ["character-access-notes", "Zugangsdetails", "Accessibility", "TEXT", null, "PRO", "Konkrete Hinweise zu Eingang, Lift oder Engstellen."],
  ["character-layout", "Strukturierter Raumplan", "Room Structure", "STRUCTURED", null, "ADMIN", "Freie JSON-Struktur für prototypische Bereichsdaten."],
].map(([id, label, family, valueType, unit, ownerAccess, description]) => ({
  id: String(id), label: String(label), group: "CHARACTERISTICS", family: String(family), semanticClass: "PHYSICAL_OPERATIONAL_CHARACTERISTIC",
  valueType: valueType as ValueType, unit: unit ? String(unit) : null, applicableCategories: allCategories, importance: ["character-seating-capacity", "character-accessibility"].includes(String(id)) ? "IMPORTANT" : "STANDARD",
  ownerAccess: ownerAccess as OwnerAccess, reviewState: "DRAFT", occurrences: 1, source: "Ohne Titel.pages", description: String(description),
  options: id === "character-room-type" ? ["Innenraum", "Außenbereich", "Separee", "Saal", "Offene Fläche"] : id === "character-service-model" ? ["Bedienung", "Self-Service", "Hybrid", "Terminbasiert"] : id === "character-noise" ? ["Sehr ruhig", "Ruhig", "Moderat", "Lebhaft", "Laut"] : undefined,
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
}));

const generatedDefinitions = generatedCatalog.definitions as CatalogDefinition[];
export const catalog = {
  catalogVersion: generatedCatalog.catalogVersion,
  categories: generatedCatalog.categories.map((category, index) => ({ ...category, sourceLabel: index === 14 ? "15. Events & Temporary Places" : category.sourceLabel })),
  definitions: [...generatedDefinitions, ...manualDefinitions, ...guidedPlaceDefinitions],
  source: generatedCatalog.source,
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
  schemaVersion: 1,
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
  exceptions: [],
  currentState: { service: "NORMAL", availability: "UNKNOWN", area: "ALL_OPEN", temporaryClosureUntil: "" },
  guidedProgress: { visitedSteps: ["basics"], skippedSteps: [] },
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

export interface DerivedFit { id: string; label: string; inputs: string[]; explanation: string }
export function deriveFits(resolved: ResolvedItem[]): DerivedFit[] {
  const isTrue = (label: string) => resolved.some((item) => item.definition.label.toLocaleLowerCase("de") === label.toLocaleLowerCase("de") && item.status === "KNOWN_TRUE");
  const fits: DerivedFit[] = [];
  if (isTrue("überdachte Außenplätze")) fits.push({ id: "derived-rain-ready", label: "Regentauglich", inputs: ["überdachte Außenplätze = true"], explanation: "Ein belegter Wetterschutz im Außenbereich unterstützt diesen Fit; die Ableitung bleibt widerrufbar." });
  if (isTrue("WLAN") && isTrue("Steckdosen")) fits.push({ id: "derived-work-friendly", label: "Geeignet zum Arbeiten", inputs: ["WLAN = true", "Steckdosen = true"], explanation: "Beide infrastrukturellen Voraussetzungen sind belegt. Ruhe und Aufenthaltsdauer bleiben separate Signale." });
  if (isTrue("Terrasse")) fits.push({ id: "derived-outdoor-option", label: "Outdoor-Option", inputs: ["Terrasse = true"], explanation: "Eine Terrasse belegt eine Außenoption, nicht deren aktuelle Öffnung oder Wettertauglichkeit." });
  return fits;
}

export function relevantDefinitions(state: PrototypeState) {
  const selected = new Set([state.spot.primaryCategory, ...state.spot.secondaryCategories]);
  return catalog.definitions.filter((definition) => definition.applicableCategories.some((key) => selected.has(key)));
}

export function qualityFor(state: PrototypeState, now = new Date()) {
  const resolved = resolveKnowledge(state, now);
  const relevant = relevantDefinitions(state).filter((definition) => definition.group !== "EVIDENCE_CONFIDENCE");
  const resolvedMap = new Map(resolved.map((item) => [item.definition.id, item]));
  const applicable = relevant.filter((definition) => resolvedMap.get(definition.id)?.status !== "NOT_APPLICABLE");
  const filled = applicable.filter((definition) => resolvedMap.has(definition.id));
  const confidenceItems = resolved.filter((item) => statusHasValue(item.status));
  const selected = new Set([state.spot.primaryCategory, ...state.spot.secondaryCategories]);
  return {
    completeness: applicable.length ? Math.round((filled.length / applicable.length) * 100) : 0,
    confidence: confidenceItems.length ? Math.round(confidenceItems.reduce((sum, item) => sum + item.confidence, 0) / confidenceItems.length) : 0,
    relevantCount: relevant.length,
    filledCount: filled.length,
    importantMissing: relevant.filter((definition) => definition.importance === "IMPORTANT" && !resolvedMap.has(definition.id)),
    conflicts: resolved.filter((item) => item.status === "DISPUTED"),
    expired: resolved.filter((item) => item.status === "EXPIRED"),
    withoutSource: state.claims.filter((claim) => !claim.evidence.sourceName.trim()),
    foreign: resolved.filter((item) => !item.definition.applicableCategories.some((key) => selected.has(key))),
  };
}

const allowedResolved = (item: ResolvedItem) => !["DISPUTED", "EXPIRED"].includes(item.status) && item.definition.group !== "EVIDENCE_CONFIDENCE";
export function engineSnapshot(state: PrototypeState, now = new Date()) {
  const resolved = resolveKnowledge(state, now);
  const derivedFits = deriveFits(resolved);
  return {
    contract: "WorldKnowledgePort.preview.v1",
    catalogVersion: state.catalogVersion,
    resolvedAsOfDate: now.toISOString().slice(0, 10),
    spot: {
      name: state.spot.name,
      location: { address: state.spot.address, neighborhood: state.spot.neighborhood, city: state.spot.city, country: state.spot.country, latitude: state.spot.latitude, longitude: state.spot.longitude, timezone: state.spot.timezone },
      publicContact: { website: state.spot.website, phone: state.spot.phone, instagram: state.spot.instagram, facebook: state.spot.facebook, linkedin: state.spot.linkedin, tiktok: state.spot.tiktok },
      profile: { specialFeature: state.spot.specialFeature, priceLevel: state.spot.priceLevel, takeaway: state.spot.takeaway },
    },
    classification: { primaryCategory: state.spot.primaryCategory, secondaryCategories: state.spot.secondaryCategories, subcategories: resolved.filter((item) => item.definition.semanticClass === "SUBCATEGORY" && item.status === "KNOWN_TRUE").map((item) => item.definition.label) },
    facts: resolved.filter((item) => allowedResolved(item) && !["DIRECT_FIT", "DECISION_INTENT"].includes(item.definition.semanticClass)).map((item) => ({ key: item.definition.id, label: item.definition.label, status: item.status, value: item.value, confidence: item.confidence })),
    intentCapabilityLinks: state.intentCapabilityLinks.map((link) => ({ intentKey: link.intentId, capabilityKey: link.capabilityId })),
    directFits: resolved.filter((item) => item.definition.semanticClass === "DIRECT_FIT" && allowedResolved(item)).map((item) => ({ key: item.definition.id, label: item.definition.label, status: item.status, confidence: item.confidence })),
    derivedFits,
    temporal: { schedule: state.schedule, exceptions: state.exceptions, currentState: state.currentState },
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
    likelySupportedIntents: byClass("DECISION_INTENT"),
    evidencedCapabilities: byClass("CAPABILITY"),
    knownRawFacts: resolved.filter((item) => allowedResolved(item) && !["DIRECT_FIT", "DECISION_INTENT"].includes(item.definition.semanticClass)).map((item) => ({ label: item.definition.label, status: item.status, value: item.value })),
    knownFalse: list("KNOWN_FALSE"), unknown: list("UNKNOWN"), notApplicable: list("NOT_APPLICABLE"), disputed: list("DISPUTED"), expired: list("EXPIRED"),
    directFits: byClass("DIRECT_FIT"), derivedFits: deriveFits(resolved),
    hardConstraintCandidates: resolved.filter((item) => item.definition.semanticClass === "CONSTRAINT" || /access|age|entry|reservation|wheelchair|barriere/i.test(`${item.definition.family} ${item.definition.label}`)).map((item) => item.definition.label),
    softFitCandidates: resolved.filter((item) => ["AMENITY", "DIRECT_FIT", "CAPABILITY"].includes(item.definition.semanticClass)).map((item) => item.definition.label),
    explanationOnly: resolved.filter((item) => item.confidence < 50 || item.definition.semanticClass === "DIRECT_FIT").map((item) => item.definition.label),
    excludedFromEngine: ["Owner identity", "Owner tier", "Subscription", "Payment", "Admin notes", "private source references", "private user evidence", "raw AI output", "disputed and expired claims"],
    categoryRelevantEmptyCount: Math.max(0, quality.relevantCount - quality.filledCount),
    quality: { completeness: quality.completeness, confidence: quality.confidence, importantMissing: quality.importantMissing.map((item) => item.label) },
    engineSnapshot: snapshot,
  };
}

export function exportPackage(state: PrototypeState, now = new Date()) {
  return { prototypeVersion: PROTOTYPE_VERSION, catalogVersion: catalog.catalogVersion, exportedAt: now.toISOString(), prototypeState: state, spotState: state.spot, claims: state.claims, evidence: state.claims.map((claim) => ({ claimId: claim.id, ...claim.evidence })), resolvedSnapshot: resolveKnowledge(state, now), analysisReport: analysisReport(state, now), engineSnapshotPreview: engineSnapshot(state, now), prototypeNotice: "UX- und Contract-Labor; kein kanonisches Production-Schema." };
}

export function validateImport(value: unknown): PrototypeState {
  if (!value || typeof value !== "object") throw new Error("Die Datei enthält kein gültiges Analysepaket.");
  const candidate = value as Record<string, unknown>;
  const state = (candidate.prototypeState ?? (candidate.spotState && candidate.claims ? { ...emptyState(), spot: candidate.spotState, claims: candidate.claims } : candidate)) as Partial<PrototypeState>;
  if (state.schemaVersion !== 1 && !candidate.spotState) throw new Error("Unbekannte Prototype-Schemaversion.");
  if (!state.spot || state.spot.name !== "Philipps Casa" || !Array.isArray(state.claims)) throw new Error("Nur ein gültiger Export für Philipps Casa kann importiert werden.");
  const defaults = emptyState();
  return {
    ...defaults,
    ...state,
    spot: { ...defaults.spot, ...state.spot, secondaryCategories: state.spot.secondaryCategories ?? [] },
    currentState: { ...defaults.currentState, ...state.currentState },
    guidedProgress: state.guidedProgress ?? defaults.guidedProgress,
    schemaVersion: 1,
    prototypeVersion: PROTOTYPE_VERSION,
    catalogVersion: catalog.catalogVersion,
  } as PrototypeState;
}
