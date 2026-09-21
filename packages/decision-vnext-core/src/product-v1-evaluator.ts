import {
  ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, parseWorldKnowledgeSnapshot,
  type WorldKnowledgeReaderPort,
} from "@backyrd/world-knowledge-core";
import type { RelevantUserProjection } from "@backyrd/user-intelligence-vnext-core";
import { contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { evaluateOpeningDay, evaluateOpeningState, type OpeningSourcePolicy } from "./opening-state.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import {
  DecisionProductCandidateAssessmentSchema, DecisionProductContextSchema, DecisionProductEvaluationSchema,
  DecisionProductPresentationSchema, DecisionProductRequestSchema,
  DecisionProductWorldCohortSchema, PRODUCT_DECISION_VERSIONS,
  type DecisionProductCandidateAssessment, type DecisionProductContext, type DecisionProductEvaluation,
  type DecisionProductPresentation, type DecisionProductRequest,
} from "./product-v1-contracts.js";
import { DECISION_PRODUCT_EVALUATION_POLICY, DECISION_PRODUCT_EVALUATION_RELEASE, DECISION_PRODUCT_INTENT_POLICY, PRODUCT_V1_INTENT_MAPPINGS, type ProductV1Intent } from "./product-v1-authority.js";
import { inferProductV1Intent } from "./product-intent-lexicon.js";

export const PRODUCT_V1_EVALUATOR_VERSION = "decision-vnext-product-evaluator@1.6" as const;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("de-CH");
const includes = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));
const cityIn = (text: string) => includes(text, ["zürich", "zurich"]) ? "Zurich" : text.includes("basel") ? "Basel" : null;
const weekdays = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"] as const;
const requestedWeekday = (text: string): number => weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`, "u").test(text));

function requestedLocalDate(text: string, serverTime: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(serverTime));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const current = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  const requestedDay = requestedWeekday(text);
  if (requestedDay >= 0) current.setUTCDate(current.getUTCDate() + (requestedDay - current.getUTCDay() + 7) % 7);
  return current.toISOString().slice(0, 10);
}

/** A server-derived catalog hint, never eligibility or ranking authority. */
export function productRetrievalIntent(request: DecisionProductRequest): ProductV1Intent | null {
  const intent = request.explicit.primaryIntent ?? inferProductV1Intent(request.naturalLanguage);
  return PRODUCT_V1_INTENT_MAPPINGS.find((mapping) => mapping.intentId === intent)?.intentId ?? null;
}

export function resolveDecisionProductContext(requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }): DecisionProductContext {
  const request = DecisionProductRequestSchema.parse(requestValue); const text = normalize(request.naturalLanguage); const explicit = request.explicit;
  const textCity = cityIn(text); const requestedCity = explicit.targetCity ?? textCity; if (requestedCity && requestedCity !== authority.authorizedCity) throw new Error("product_context_location_authority_mismatch");
  const primaryIntent = explicit.primaryIntent ?? inferProductV1Intent(request.naturalLanguage);
  const hard = new Set(explicit.hardConstraints ?? []); const soft = new Set(explicit.softPreferences ?? []);
  if (includes(text, ["rollstuhl", "stufenfrei"])) hard.add("ACCESSIBILITY_STEP_FREE");
  if (includes(text, ["geöffnet", "offen", "jetzt"])) hard.add("OPEN_NOW");
  if (requestedWeekday(text) >= 0 || explicit.dateTime?.localDate) hard.add("OPEN_ON_REQUESTED_DAY");
  if (/\b(?:\d{1,2})[- ]?(?:jährig|jaehrig)/.test(text) || includes(text, ["tochter", "sohn", "kind"])) hard.add("AGE_OR_LEGAL");
  if (/\b(?:höchstens|maximal|bis)\s+\d{1,4}\s*(?:chf|franken)/.test(text)) hard.add("BUDGET_MAXIMUM");
  if (requestedCity) hard.add("TARGET_LOCATION");
  if (includes(text, ["ruhig", "gemütlich"])) soft.add("ATMOSPHERE_QUIET");
  if (includes(text, ["günstig", "preiswert"])) soft.add("PRICE_LEVEL_LOW");
  const body = {
    contractVersion: PRODUCT_DECISION_VERSIONS.context, resolverVersion: "decision-vnext-product-context-resolver-v1", inputHash: contentHash({ request, authority }),
    primaryIntent, secondaryIntent: explicit.secondaryIntent ?? (includes(text, ["date", "in ruhe reden"]) ? "QUIET_CONVERSATION" : null),
    intentCompatibility: primaryIntent ? "COMPATIBLE" as const : "UNKNOWN" as const, occasion: explicit.occasion ?? (text.includes("date") ? "DATE" : null),
    moods: explicit.moods ?? (includes(text, ["ruhig", "gemütlich"]) ? ["CALM"] : []), targetCity: authority.authorizedCity,
    dateTime: explicit.dateTime ?? { state: "KNOWN" as const, localDate: requestedLocalDate(text, authority.serverTime), dayPhase: includes(text, ["morgen", "frühstück"]) ? "MORNING" : includes(text, ["mittag"]) ? "MIDDAY" : includes(text, ["nachmittag"]) ? "AFTERNOON" : includes(text, ["abend"]) ? "EVENING" : includes(text, ["nacht"]) ? "NIGHT" : null, timeZone: "Europe/Zurich" },
    group: explicit.group ?? { size: includes(text, ["tochter", "sohn", "kind", "familie"]) ? 2 : null, minimumAge: Number(text.match(/\b(\d{1,2})[- ]?(?:jährig|jaehrig)/)?.[1] ?? NaN) || null, adultPresent: includes(text, ["mich und", "mit erwachsenen", "familie"]), companionType: includes(text, ["tochter", "sohn", "kind", "familie"]) ? "FAMILY" : null },
    budget: explicit.budget ?? (() => { const amount = Number(text.match(/(?:höchstens|maximal|bis)\s+(\d{1,4})\s*(?:chf|franken)/)?.[1] ?? NaN); return Number.isFinite(amount) ? { state: "KNOWN" as const, amount, currency: "CHF" as const, perPerson: includes(text, ["pro person", "p.p."]), calibrationLabel: null } : { state: "UNKNOWN" as const, amount: null, currency: null, perPerson: false, calibrationLabel: null }; })(),
    stayDuration: explicit.stayDuration ?? null, hardConstraints: [...hard].sort(), softPreferences: [...soft].sort(), unresolvedTerms: primaryIntent ? [] : ["CORE_INTENT"],
    locationAuthority: { explicitTargetWins: true as const, authorizedCity: authority.authorizedCity, deviceCityUsed: false, state: "KNOWN" as const },
    limitations: primaryIntent ? [] : ["CORE_INTENT_REQUIRES_CLARIFICATION"], rawTextPersisted: false as const,
  };
  return deepFreeze(DecisionProductContextSchema.parse(withContentHash(body, "interpretationHash")));
}

const productOpeningPolicy: OpeningSourcePolicy = Object.freeze({ version: "decision-vnext-product-opening-source-policy-v1", configured: true, authorizedTrustStates: ["VERIFIED"] as const });
const entry = (snapshot: ProductWorldView, key: string): ProductWorldView["facts"][number] | undefined => [...snapshot.facts, ...snapshot.operationalRules, ...snapshot.currentStates].find((row) => row.key === key);
const unknown = (snapshot: ProductWorldView, key: string) => snapshot.explicitUnknowns.some((row) => row.key === key);
const contextual = (state: DecisionProductCandidateAssessment["visitSituation"]["state"], source: unknown, ids: readonly string[] = []) => ({ state, mappingIds: ids, evidenceSourceHash: contentHash(source) });
const reason = (reasonCode: string, domain: "WORLD" | "USER" | "CONTEXT" | "LIMITATION", sourceHash: string, statementDe: string, confirmed: boolean) => ({ reasonCode, domain, sourceHash, statementDe, confirmed });
type ContextRow = { readonly conditions?: { readonly days?: readonly string[]; readonly dayparts?: readonly string[]; readonly occasion?: string | null; readonly area?: string | null; readonly groupSize?: { readonly min?: number; readonly max?: number } | null; readonly ageContext?: string | null; readonly accompaniment?: string | null; readonly eventMode?: string | null }; readonly atmosphere?: string; readonly situation?: string; readonly daypart?: string };
function contextApplies(row: ContextRow, context: DecisionProductContext): boolean {
  const c = row.conditions;
  if (!c) return false;
  const day = context.dateTime.localDate ? ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(`${context.dateTime.localDate}T12:00:00Z`).getUTCDay()] : null;
  if (c.days?.length && (!day || !c.days.includes(day))) return false;
  if (c.dayparts?.length && (!context.dateTime.dayPhase || !c.dayparts.includes(context.dateTime.dayPhase))) return false;
  if (c.occasion && c.occasion !== context.occasion || c.area || c.ageContext || c.accompaniment || c.eventMode && c.eventMode !== "NORMAL_OPERATION") return false;
  if (c.groupSize && (context.group.size === null || c.groupSize.min !== undefined && context.group.size < c.groupSize.min || c.groupSize.max !== undefined && context.group.size > c.groupSize.max)) return false;
  return true;
}
const matchedRows = (value: unknown, context: DecisionProductContext): readonly ContextRow[] => Array.isArray(value) ? (value as ContextRow[]).filter((row) => contextApplies(row, context)) : [];

const USER_CONCEPT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "vibe.cozy": "gemütliche Orte", "vibe.relaxed": "entspannte Orte", "vibe.romantic": "romantische Orte",
  "vibe.lively": "lebendige Orte", "vibe.quiet": "ruhige Orte", "vibe.social": "gesellige Orte",
  "vibe.inspiring": "inspirierende Orte", "vibe.playful": "spielerische Orte", "vibe.elegant": "elegante Orte",
  "vibe.authentic": "authentische Orte", "vibe.urban": "urbane Orte", "energy.calm": "eine ruhige Energie",
  "energy.balanced": "eine ausgeglichene Energie", "energy.energetic": "eine lebhafte Energie",
  "social_style.solo_friendly": "Orte für einen Besuch allein", "social_style.conversation_friendly": "Orte für gute Gespräche",
  "social_style.group_friendly": "Orte für Gruppen", "social_style.family_friendly": "familienfreundliche Orte",
  "social_style.romantic_friendly": "Orte für ein Date", "occasion.work_friendly": "Orte zum Arbeiten",
  "occasion.celebration_friendly": "Orte zum Feiern", "occasion.morning_friendly": "Orte am Morgen",
  "occasion.afternoon_friendly": "Orte am Nachmittag", "occasion.evening_friendly": "Orte am Abend",
  "price.budget": "preiswerte Orte", "price.balanced_price": "Orte mit ausgewogenem Preisniveau", "price.premium": "gehobene Orte",
  "character.design_led": "designorientierte Orte", "character.authentic_character": "Orte mit authentischem Charakter",
  "character.distinctive": "eigenständige Orte", "environment.indoor": "Indoor-Orte", "environment.outdoor": "Outdoor-Orte",
  "place_type.cafe": "Cafés", "place_type.bar": "Bars", "place_type.restaurant": "Restaurants",
  "place_type.nightlife": "Nachtleben", "place_type.culture": "Kulturorte", "place_type.outing": "Ausflugsorte",
  "place_type.activity": "Aktivitäten", "place_type.experience": "besondere Erlebnisse", "place_type.hotel": "Hotels",
});

function candidateTasteConcepts(snapshot: ProductWorldView, context: DecisionProductContext): ReadonlySet<string> {
  const concepts = new Set<string>();
  const category = snapshot.spot.classification.primaryCategory;
  const placeTypes = new Set<string>(snapshot.spot.classification.placeTypes ?? []);
  if (category === "COFFEE_DAYTIME" || placeTypes.has("CAFE")) concepts.add("place_type.cafe");
  if (category === "EAT" || [...placeTypes].some((value) => ["RESTAURANT", "BRASSERIE", "BISTRO"].includes(value))) concepts.add("place_type.restaurant");
  if (category === "DRINKS" || [...placeTypes].some((value) => ["PUB", "WINE_BAR", "BAR", "BREWERY", "TAPROOM", "COCKTAIL_BAR", "LOUNGE"].includes(value))) concepts.add("place_type.bar");
  if (category === "NIGHTLIFE") concepts.add("place_type.nightlife");
  if (category === "CULTURE_ARTS" || placeTypes.has("MUSEUM")) concepts.add("place_type.culture");
  if (category === "ACTIVITIES_PLAY" || placeTypes.has("ACTIVITY_VENUE")) { concepts.add("place_type.activity"); concepts.add("place_type.experience"); }
  if (category === "OUTDOOR_NATURE" || [...placeTypes].some((value) => ["PARK", "NATURE_RESERVE", "ZOO", "AQUARIUM"].includes(value))) { concepts.add("place_type.outing"); concepts.add("environment.outdoor"); }
  if (placeTypes.has("HOTEL")) concepts.add("place_type.hotel");

  const atmosphere = matchedRows(entry(snapshot, "context.atmosphere")?.value, context).map((row) => row.atmosphere);
  const atmosphereMap: Readonly<Record<string, readonly string[]>> = {
    COZY: ["vibe.cozy"], RELAXED: ["vibe.relaxed", "energy.calm"], ROMANTIC: ["vibe.romantic"],
    LIVELY: ["vibe.lively", "energy.energetic"], QUIET: ["vibe.quiet", "energy.calm"], SOCIAL: ["vibe.social"],
    INSPIRING: ["vibe.inspiring"], PLAYFUL: ["vibe.playful"], ELEGANT: ["vibe.elegant"],
    AUTHENTIC: ["vibe.authentic", "character.authentic_character"], URBAN: ["vibe.urban"],
    BALANCED: ["energy.balanced"], DESIGN_LED: ["character.design_led"], DISTINCTIVE: ["character.distinctive"],
  };
  for (const value of atmosphere) for (const concept of atmosphereMap[value ?? ""] ?? []) concepts.add(concept);

  const situations = matchedRows(entry(snapshot, "context.visit_situations")?.value, context).map((row) => row.situation);
  const situationMap: Readonly<Record<string, readonly string[]>> = {
    SOLO: ["social_style.solo_friendly"], CONVERSATION: ["social_style.conversation_friendly"], GROUP: ["social_style.group_friendly"],
    FAMILY: ["social_style.family_friendly"], DATE_PAIR: ["social_style.romantic_friendly"], WORK: ["occasion.work_friendly"], CELEBRATION: ["occasion.celebration_friendly"],
  };
  for (const value of situations) for (const concept of situationMap[value ?? ""] ?? []) concepts.add(concept);

  const dayparts = matchedRows(entry(snapshot, "context.typical_dayparts")?.value, context).map((row) => row.daypart);
  for (const value of dayparts) {
    if (value === "MORNING") concepts.add("occasion.morning_friendly");
    if (value === "AFTERNOON") concepts.add("occasion.afternoon_friendly");
    if (["EVENING", "NIGHT"].includes(value ?? "")) concepts.add("occasion.evening_friendly");
  }
  const price = String(entry(snapshot, "operation.price_level")?.value ?? "");
  if (["VERY_LOW", "LOW"].includes(price)) concepts.add("price.budget");
  if (["MEDIUM", "BALANCED"].includes(price)) concepts.add("price.balanced_price");
  if (["HIGH", "VERY_HIGH", "PREMIUM"].includes(price)) concepts.add("price.premium");
  return concepts;
}

function tasteScopeApplies(scope: RelevantUserProjection["taste"][number]["scope"], snapshot: ProductWorldView, context: DecisionProductContext): boolean {
  if (scope.kind === "GLOBAL") return true;
  const reference = scope.reference;
  if (!reference) return false;
  if (scope.kind === "PLACE_TYPE") return ([snapshot.spot.classification.primaryCategory, ...(snapshot.spot.classification.placeTypes ?? [])] as readonly (string | null)[]).includes(reference);
  return ([context.primaryIntent, context.secondaryIntent, context.occasion, context.dateTime.dayPhase].filter(Boolean) as string[]).includes(reference);
}

function userTasteMatches(snapshot: ProductWorldView, context: DecisionProductContext, projection: RelevantUserProjection) {
  if (projection.status !== "ACTIVE") return [];
  const supported = candidateTasteConcepts(snapshot, context);
  return projection.taste.filter((item) => supported.has(item.concept.conceptId) && tasteScopeApplies(item.scope, snapshot, context))
    .map((item) => ({ conceptId: item.concept.conceptId, direction: item.affinity < 0 ? "NEGATIVE" as const : "POSITIVE" as const, affinity: item.affinity, confidence: item.confidence, evidenceSourceHash: contentHash({ projectionHash: projection.projectionHash, snapshotHash: snapshot.snapshotHash, item }) }))
    .sort((left, right) => Math.abs(right.affinity * right.confidence) - Math.abs(left.affinity * left.confidence) || left.conceptId.localeCompare(right.conceptId)).slice(0, 32);
}
function confirmedClosureForRequestedDate(snapshot: ProductWorldView, context: DecisionProductContext, evaluationAt: string): boolean {
  const state = snapshot.currentStates.find((row) => row.key === "state.current" && row.value && typeof row.value === "object" && !Array.isArray(row.value) && "scope" in row.value && ["SPOT", "VENUE"].includes(String(row.value.scope)));
  if (!state || snapshot.conflicts.some((row) => row.attributeKeys.includes("state.current")) || !state.validUntil || !context.dateTime.localDate) return false;
  const value = state.value as { readonly kind?: string };
  if (!["CLOSED", "TEMPORARILY_CLOSED", "AREA_CLOSED"].includes(value.kind ?? "")) return false;
  const start = Date.parse(`${context.dateTime.localDate}T00:00:00Z`);
  const from = state.validFrom ? Date.parse(state.validFrom) : Number.NEGATIVE_INFINITY;
  const until = Date.parse(state.validUntil);
  // Without an exact requested hour, only a claim covering the full local day
  // may suppress a future recommendation. A 24h UTC margin is conservative
  // across Swiss daylight-saving changes, never an invented opening time.
  if (context.dateTime.localDate !== requestedLocalDate("", evaluationAt) || context.dateTime.dayPhase) return from <= start - 86_400_000 && until >= start + 172_800_000;
  const now = Date.parse(evaluationAt);
  return from <= now && now < until;
}

export function evaluateProductV1IntentClassification(input: { readonly intent: string | null; readonly purpose: string | null; readonly category: string | null; readonly placeTypes: readonly string[]; readonly disputed: boolean; readonly evidenceSourceHash: string }) {
  if (!input.intent) return { intentId: null, state: "NOT_APPLICABLE" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  const mapping = PRODUCT_V1_INTENT_MAPPINGS.find((row) => row.intentId === input.intent); if (!mapping) return { intentId: input.intent, state: "NOT_CONFIGURED" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  const { purpose, category, placeTypes } = input;
  const specificConfirm = mapping.acceptedPrimaryCategories.includes(category ?? "") || placeTypes.some((value) => mapping.acceptedPlaceTypes.includes(value));
  const specificIncompatible = (purpose !== null && mapping.incompatiblePrimaryPurposes.includes(purpose)) || (category !== null && mapping.incompatiblePrimaryCategories.includes(category)) || placeTypes.some((value) => mapping.incompatiblePlaceTypes.includes(value));
  const state = input.disputed ? "DISPUTED" as const : specificConfirm ? "CONFIRMED" as const : specificIncompatible ? "INCOMPATIBLE" as const : "UNKNOWN" as const;
  return { intentId: input.intent, state, mappingIds: [`product-intent-${input.intent.toLowerCase()}`], worldFactKeys: ["purpose.primary_visit", "classification.primary_category", "classification.place_types"], evidenceSourceHash: contentHash({ evidenceSourceHash: input.evidenceSourceHash, purpose, category, placeTypes, policyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash }) };
}

function intentCoverage(snapshot: ProductWorldView, intent: string | null) {
  const purposeEntry = entry(snapshot, "purpose.primary_visit"); const purpose = typeof purposeEntry?.value === "string" ? purposeEntry.value : null;
  const category = snapshot.spot.classification.primaryCategory; const placeTypes = snapshot.spot.classification.placeTypes ?? [];
  return evaluateProductV1IntentClassification({ intent, purpose, category, placeTypes, disputed: snapshot.conflicts.some((row) => row.attributeKeys.some((key) => ["purpose.primary_visit", "classification.primary_category", "classification.place_types"].includes(key))), evidenceSourceHash: snapshot.snapshotHash });
}

function primaryPurposeCoverage(snapshot: ProductWorldView, intent: string | null) {
  const purposeEntry = entry(snapshot, "purpose.primary_visit");
  const purpose = typeof purposeEntry?.value === "string" ? purposeEntry.value : null;
  if (!intent) return contextual("NOT_APPLICABLE", { snapshotHash: snapshot.snapshotHash, purpose, intent });
  const mapping = PRODUCT_V1_INTENT_MAPPINGS.find((row) => row.intentId === intent);
  if (!mapping) return contextual("NOT_CONFIGURED", { snapshotHash: snapshot.snapshotHash, purpose, intent });
  if (snapshot.conflicts.some((row) => row.attributeKeys.includes("purpose.primary_visit"))) return contextual("DISPUTED", purposeEntry ?? snapshot.snapshotHash, [`product-purpose-${intent.toLowerCase()}`]);
  if (purpose === null) return contextual(unknown(snapshot, "purpose.primary_visit") ? "UNKNOWN" : "NOT_CONFIGURED", purposeEntry ?? snapshot.snapshotHash, [`product-purpose-${intent.toLowerCase()}`]);
  if (mapping.acceptedPrimaryPurposes.includes(purpose)) return contextual("CONFIRMED", purposeEntry, [`product-purpose-${intent.toLowerCase()}`]);
  if (mapping.incompatiblePrimaryPurposes.includes(purpose)) return contextual("INCOMPATIBLE", purposeEntry, [`product-purpose-${intent.toLowerCase()}`]);
  return contextual("UNKNOWN", purposeEntry, [`product-purpose-${intent.toLowerCase()}`]);
}

const germanWeekday = (localDate: string): string => new Intl.DateTimeFormat("de-CH", { weekday: "long", timeZone: "Europe/Zurich" }).format(new Date(`${localDate}T12:00:00.000Z`));
const openingIntervals = (rows: readonly { readonly start: string; readonly end: string }[]): string => rows.map((row) => `${row.start}–${row.end}`).join(", ");

function assess(snapshot: ProductWorldView, context: DecisionProductContext, projection: RelevantUserProjection, rejected: readonly string[], evaluationAt: string): DecisionProductCandidateAssessment {
  const core = intentCoverage(snapshot, context.primaryIntent); const secondary = intentCoverage(snapshot, context.secondaryIntent); const purposeCoverage = primaryPurposeCoverage(snapshot, context.primaryIntent);
  const confirmed: string[] = []; const unknownHard: string[] = []; const failed: string[] = [];
  if (context.hardConstraints.includes("TARGET_LOCATION")) (snapshot.spot.location.locality === context.targetCity ? confirmed : failed).push("TARGET_LOCATION");
  if (context.hardConstraints.includes("ACCESSIBILITY_STEP_FREE")) { const row = entry(snapshot, "accessibility.step_free_entrance"); row?.resolution === "KNOWN_TRUE" ? confirmed.push("ACCESSIBILITY_STEP_FREE") : row?.resolution === "KNOWN_FALSE" ? failed.push("ACCESSIBILITY_STEP_FREE") : unknownHard.push("ACCESSIBILITY_STEP_FREE"); }
  if (context.hardConstraints.includes("BUDGET_MAXIMUM")) { const row = entry(snapshot, "operation.price_range"); const value = row?.value; const maximum = value && typeof value === "object" && !Array.isArray(value) && "max" in value ? Number(value.max) : null; maximum === null || context.budget.amount === null ? unknownHard.push("BUDGET_MAXIMUM") : maximum <= context.budget.amount ? confirmed.push("BUDGET_MAXIMUM") : failed.push("BUDGET_MAXIMUM"); }
  if (context.hardConstraints.includes("AGE_OR_LEGAL")) { const row = entry(snapshot, "rule.age_access_conditions"); const value = row?.value; const age = context.group.minimumAge; if (!value || typeof value !== "object" || Array.isArray(value) || !("rules" in value) || age === null) unknownHard.push("AGE_OR_LEGAL"); else { const rules = Array.isArray(value.rules) ? value.rules : []; const allowed = rules.some((rule) => rule && typeof rule === "object" && ((rule.mode === "NO_MINIMUM") || (typeof rule.minimumAge === "number" && (age >= rule.minimumAge || (rule.mode === "UNACCOMPANIED_MINIMUM" && context.group.adultPresent))))); (allowed ? confirmed : failed).push("AGE_OR_LEGAL"); } }
  const requestedDay = context.hardConstraints.includes("OPEN_ON_REQUESTED_DAY") && context.dateTime.localDate ? evaluateOpeningDay(snapshot, context.dateTime.localDate, productOpeningPolicy) : null;
  const confirmedRequestedClosure = context.hardConstraints.includes("OPEN_ON_REQUESTED_DAY") && confirmedClosureForRequestedDate(snapshot, context, evaluationAt);
  const openingStatus: DecisionProductCandidateAssessment["actualAvailability"]["status"] = context.hardConstraints.includes("OPEN_NOW")
    ? evaluateOpeningState(snapshot, evaluationAt, productOpeningPolicy).status
    : confirmedRequestedClosure ? "closed" : requestedDay?.status ?? (confirmedClosureForRequestedDate(snapshot, context, evaluationAt) ? "closed" : "not_requested");
  if (openingStatus === "closed") failed.push("ACTUAL_AVAILABILITY");
  if (context.hardConstraints.includes("OPEN_NOW")) { openingStatus === "open" ? confirmed.push("OPEN_NOW") : openingStatus === "closed" ? failed.push("OPEN_NOW") : unknownHard.push("OPEN_NOW"); }
  if (context.hardConstraints.includes("OPEN_ON_REQUESTED_DAY")) { openingStatus === "open" ? confirmed.push("OPEN_ON_REQUESTED_DAY") : openingStatus === "closed" ? failed.push("OPEN_ON_REQUESTED_DAY") : unknownHard.push("OPEN_ON_REQUESTED_DAY"); }
  const contextualReject = rejected.includes(snapshot.spot.spotId); const incompatible = ["INCOMPATIBLE", "DISPUTED"].includes(core.state); const notConfigured = core.state === "NOT_CONFIGURED";
  const tierValue = contextualReject || failed.length || incompatible ? "INELIGIBLE" : notConfigured ? "NOT_CONFIGURED" : core.state === "CONFIRMED" && !unknownHard.length ? "ELIGIBLE_CONFIRMED" : "UNCONFIRMED_FALLBACK";
  const purposeEntry = entry(snapshot, "purpose.primary_visit"); const onsiteEntry = entry(snapshot, "offering.onsite"); const onsite = Array.isArray(onsiteEntry?.value) ? onsiteEntry.value as readonly { kind: string; relationship: "PART_OF_SPOT" | "EMBEDDED_FACILITY" }[] : [];
  const atmosphereEntry = entry(snapshot, "context.atmosphere"); const visitEntry = entry(snapshot, "context.visit_situations"); const daypartEntry = entry(snapshot, "context.typical_dayparts");
  const matchingAtmosphere = matchedRows(atmosphereEntry?.value, context).filter((row) => context.softPreferences.includes("ATMOSPHERE_QUIET") && ["QUIET", "COZY", "RELAXED"].includes(row.atmosphere ?? ""));
  const matchingVisit = matchedRows(visitEntry?.value, context).filter((row) => context.group.companionType === "FAMILY" && row.situation === "FAMILY" || context.occasion === "DATE" && row.situation === "DATE_PAIR");
  const matchingDaypart = matchedRows(daypartEntry?.value, context).filter((row) => context.dateTime.dayPhase !== null && row.daypart === context.dateTime.dayPhase);
  const priceLevel = entry(snapshot, "operation.price_level")?.value;
  const matchingPrice = context.softPreferences.includes("PRICE_LEVEL_LOW") && ["VERY_LOW", "LOW"].includes(String(priceLevel));
  const matchedSoft = [...(matchingAtmosphere.length ? ["ATMOSPHERE_QUIET"] : []), ...(matchingVisit.length ? ["VISIT_SITUATION"] : []), ...(matchingDaypart.length ? ["TYPICAL_DAYPART"] : []), ...(matchingPrice ? ["PRICE_LEVEL_LOW"] : [])];
  const tasteMatches = userTasteMatches(snapshot, context, projection);
  const worldReasons = [
    reason(`core-intent-${core.state.toLowerCase()}`, "WORLD", core.evidenceSourceHash, core.state === "CONFIRMED" ? "Die bestätigte Kernklassifikation passt zur Absicht." : core.state === "INCOMPATIBLE" ? "Die bestätigte Kernklassifikation passt nicht zur Absicht; Zusatzangebote ersetzen sie nicht." : "Die Kernabsicht ist durch World Knowledge nicht bestätigt.", core.state === "CONFIRMED"),
    reason(`primary-purpose-${purposeCoverage.state.toLowerCase()}`, "WORLD", purposeCoverage.evidenceSourceHash, purposeCoverage.state === "CONFIRMED" ? "Der bestätigte Hauptzweck unterstützt die Absicht zusätzlich." : purposeCoverage.state === "INCOMPATIBLE" ? "Der bestätigte Hauptzweck unterstützt diese Absicht nicht." : "Der Hauptzweck ist für diese Absicht nicht bestätigt.", purposeCoverage.state === "CONFIRMED"),
  ];
  if (openingStatus === "closed") worldReasons.push(reason("currently-closed", "WORLD", contentHash({ snapshotHash: snapshot.snapshotHash, openingStatus }), "Der Ort ist laut gültigem World Knowledge geschlossen.", true));
  if (requestedDay && context.dateTime.localDate) {
    const day = germanWeekday(context.dateTime.localDate);
    const schedule = openingIntervals(requestedDay.intervals);
    worldReasons.push(reason(
      requestedDay.status === "open" ? "requested-day-opening-hours" : requestedDay.status === "closed" ? "requested-day-closed" : "requested-day-opening-unknown",
      requestedDay.status === "open" || requestedDay.status === "closed" ? "WORLD" : "LIMITATION",
      contentHash({ snapshotHash: snapshot.snapshotHash, requestedDay }),
      requestedDay.status === "open" ? `Öffnungszeiten am gefragten ${day}: ${schedule}.` : requestedDay.status === "closed" ? `Am gefragten ${day} ist der Spot laut bestätigten Öffnungszeiten geschlossen.` : `Öffnungszeiten am gefragten ${day} sind nicht bestätigt.`,
      requestedDay.status === "open" || requestedDay.status === "closed",
    ));
  }
  if (contextualReject) worldReasons.push(reason("situational-reject", "CONTEXT", context.interpretationHash, "Dieser Spot wurde nur für diese Anfrage abgewählt.", false));
  if (matchingAtmosphere.length) worldReasons.push(reason("atmosphere-fit", "CONTEXT", contentHash(atmosphereEntry), "Die bestätigte Atmosphäre passt zu deinem Wunsch.", true));
  if (matchingVisit.length) worldReasons.push(reason("visit-fit", "CONTEXT", contentHash(visitEntry), "Die bestätigte Besuchssituation passt.", true));
  if (matchingDaypart.length) worldReasons.push(reason("daypart-fit", "CONTEXT", contentHash(daypartEntry), "Die bestätigte Tageszeit passt.", true));
  if (matchingPrice) worldReasons.push(reason("price-level-fit", "CONTEXT", contentHash({ priceLevel, snapshotHash: snapshot.snapshotHash }), "Das bestätigte Preislevel passt zum Wunsch nach günstig.", true));
  for (const match of tasteMatches.slice(0, 4)) {
    const label = USER_CONCEPT_LABELS[match.conceptId] ?? "dieses Ortsmerkmal";
    worldReasons.push(reason(
      `user-taste-${match.direction.toLowerCase()}-${match.conceptId.replaceAll(".", "-")}`,
      "USER", match.evidenceSourceHash,
      match.direction === "POSITIVE" ? `Dieser Spot passt zu deiner freigegebenen Präferenz für ${label}.` : `Dieser Spot widerspricht deiner freigegebenen Präferenz in Bezug auf ${label}.`,
      true,
    ));
  }
  const body = {
    contractVersion: PRODUCT_DECISION_VERSIONS.assessment, candidateId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash, tier: tierValue, coreIntentCoverage: core, secondaryIntentCoverage: secondary,
    worldClassification: { primaryVisitPurpose: typeof purposeEntry?.value === "string" ? purposeEntry.value : null, primaryCategory: snapshot.spot.classification.primaryCategory, placeTypes: snapshot.spot.classification.placeTypes ?? [], evidenceSourceHash: contentHash({ snapshotHash: snapshot.snapshotHash, structural: snapshot.spot.classification }) },
    primaryVisitPurpose: purposeCoverage,
    specificCoreClassification: contextual(core.state, core.evidenceSourceHash, core.mappingIds),
    onsiteOfferings: { state: onsiteEntry ? "CONFIRMED" as const : unknown(snapshot, "offering.onsite") ? "UNKNOWN" as const : "NOT_CONFIGURED" as const, mappingIds: [], availableKinds: onsite.map((row) => row.kind), matchedKinds: [], relationships: [...new Set(onsite.map((row) => row.relationship))].sort(), confirmsCoreIntent: false as const, evidenceSourceHash: contentHash(onsiteEntry ?? { snapshotHash: snapshot.snapshotHash, key: "offering.onsite" }) },
    visitSituation: contextual(matchingVisit.length ? "CONFIRMED" : visitEntry || unknown(snapshot, "context.visit_situations") ? "UNKNOWN" : "NOT_CONFIGURED", visitEntry ?? snapshot.snapshotHash),
    atmosphere: contextual(matchingAtmosphere.length ? "CONFIRMED" : atmosphereEntry || unknown(snapshot, "context.atmosphere") ? "UNKNOWN" : "NOT_CONFIGURED", atmosphereEntry ?? snapshot.snapshotHash),
    typicalDaypart: contextual(matchingDaypart.length ? "CONFIRMED" : daypartEntry || unknown(snapshot, "context.typical_dayparts") ? "UNKNOWN" : "NOT_CONFIGURED", daypartEntry ?? snapshot.snapshotHash),
    actualAvailability: { status: openingStatus, evidenceSourceHash: contentHash({ snapshotHash: snapshot.snapshotHash, status: openingStatus }) },
    confirmedHardConstraints: confirmed.sort(), unknownHardConstraints: unknownHard.sort(), failedHardConstraints: failed.sort(), matchedSoftPreferences: matchedSoft.sort(), userTasteMatches: tasteMatches,
    conflicts: snapshot.conflicts.map((row) => row.code).sort(), reasons: worldReasons, limitations: [...(unknownHard.length ? ["HARD_CONSTRAINT_EVIDENCE_UNKNOWN"] : []), ...(context.hardConstraints.includes("BUDGET_MAXIMUM") && unknownHard.includes("BUDGET_MAXIMUM") && priceLevel ? ["PRICE_LEVEL_NOT_A_CHF_AMOUNT"] : []), ...(core.state === "UNKNOWN" ? ["CORE_INTENT_EVIDENCE_UNKNOWN"] : [])],
    rejectionClass: contextualReject ? "SITUATIONAL_REJECT" as const : "NONE" as const, userIntelligenceInvolved: tasteMatches.length > 0, userIntelligenceAffectsEligibility: false as const,
    neutralTieBreakerHash: contentHash({ spotId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash }),
  };
  return deepFreeze(DecisionProductCandidateAssessmentSchema.parse(withContentHash(body, "assessmentHash")));
}

export interface DecisionProductWorldSelection { readonly candidateIds: readonly string[]; readonly candidateSetHash: string }
export function createDecisionProductEvaluator(input: { readonly world: WorldKnowledgeReaderPort; readonly selectCandidates: (authorizedCity: string, signal: AbortSignal) => Promise<DecisionProductWorldSelection> }) {
  return async (requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }, projection: RelevantUserProjection, signal: AbortSignal): Promise<{ evaluation: DecisionProductEvaluation; presentations: readonly DecisionProductPresentation[] }> => {
    const request = DecisionProductRequestSchema.parse(requestValue); const context = resolveDecisionProductContext(request, authority); const selected = await input.selectCandidates(authority.authorizedCity, signal);
    const ids = [...new Set(selected.candidateIds)].sort(); if (!ids.length || contentHash(ids) !== selected.candidateSetHash) throw new Error("product_world_candidate_set_invalid");
    const snapshots = await Promise.all(ids.map(async (spotId) => { const raw = await input.world.readSnapshot({ spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH }); const snapshot = parseWorldKnowledgeSnapshot(raw, [ACCEPTED_SOURCE_POLICY]); if (snapshot.spot.spotId !== spotId) throw new Error("product_world_spot_binding_invalid"); return snapshot; }));
    return evaluateProductWorldViews(request, authority, projection, snapshots, selected.candidateSetHash);
  };
}

/** Shared deterministic Product assessment for the typed TS reader and the manifest-validated SQL resolver. */
export function evaluateProductWorldViews(requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }, projection: RelevantUserProjection, snapshotsValue: readonly ProductWorldView[], candidateSetHash: string): { evaluation: DecisionProductEvaluation; presentations: readonly DecisionProductPresentation[] } {
    const request = DecisionProductRequestSchema.parse(requestValue); const context = resolveDecisionProductContext(request, authority);
    const snapshots = [...snapshotsValue];
    const ids = snapshots.map((item) => item.spot.spotId).sort();
    if (!ids.length || ids.length > 1000 || new Set(ids).size !== ids.length || contentHash(ids) !== candidateSetHash) throw new Error("product_world_candidate_set_invalid");
    const bindings = snapshots.map((row) => ({ spotId: row.spot.spotId, snapshotHash: row.snapshotHash })).sort((a, b) => a.spotId.localeCompare(b.spotId));
    const cohort = DecisionProductWorldCohortSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.cohort, cohortId: `product-world-${candidateSetHash.slice(0, 24)}`, source: "CANONICAL_WORLD_KNOWLEDGE_READER", generatedAt: authority.serverTime, authorizedCity: authority.authorizedCity, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, spotBindings: bindings, candidateSetHash, limitations: snapshots.length === 1 ? ["SINGLE_CANDIDATE"] : [], commercialSignalsPresent: false, fixtureSourceUsed: false }, "cohortHash"));
    const candidates = snapshots.map((row) => assess(row, context, projection, request.rejectedCandidateIds, authority.serverTime)).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const evaluation = DecisionProductEvaluationSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.evaluation, evaluationId: `product-evaluation-${contentHash({ requestId: request.requestId, cohortHash: cohort.cohortHash }).slice(0, 24)}`, createdAt: authority.serverTime, requestHash: contentHash(request), interpretation: context, worldCohort: cohort, userProjectionHash: projection.projectionHash, candidates, limitations: cohort.limitations, evaluatorVersion: PRODUCT_V1_EVALUATOR_VERSION, evaluationPolicyHash: DECISION_PRODUCT_EVALUATION_POLICY.policyHash, evaluationReleaseHash: DECISION_PRODUCT_EVALUATION_RELEASE.releaseHash, intentPolicyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash, sourceKind: "CANONICAL_PRODUCT_PORTS", productSemanticsApproved: true, productRankingAuthorized: true, fixtureSourceUsed: false }, "evaluationHash"));
    const presentations = snapshots.map((row) => DecisionProductPresentationSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.presentation, spotId: row.spot.spotId, name: row.spot.identity.name ?? "Unbenannter Ort", locality: row.spot.location.locality, categoryLabel: row.spot.classification.primaryCategory, imageUrl: null, sourceHash: row.snapshotHash }, "presentationHash")));
    return deepFreeze({ evaluation, presentations });
}
