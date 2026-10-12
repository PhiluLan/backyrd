import { accessibilityRequestScope, hasPositiveQuietRequest } from "./product-request-context.js";
import { bindProductUnderstanding, calendarExclusionSatisfied, canonicalRequestedCity, requestedProductCity, projectProductUnderstanding, type ProductUnderstanding, type ProductRequirement } from "./product-request-understanding.js";
import {
  ACCEPTED_SOURCE_POLICY, PLACE_TYPES, PRIMARY_CATEGORIES, PRIMARY_VISIT_PURPOSES, REGISTRY_HASH, REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, parseWorldKnowledgeSnapshot,
  type WorldKnowledgeReaderPort,
} from "@backyrd/world-knowledge-core";
import type { RelevantUserProjection } from "@backyrd/user-intelligence-vnext-core";
import { PRODUCT_REQUEST_CONTEXT_VERSION, hasPreciseRequestedTime, requestBudget, requestGroup } from "./product-request-context.js";
import { compareProductCandidateAssessments } from "./product-decision.js";
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
import { projectRequirementFacets, encodeWorldQueryConstraint, PRODUCT_INDOOR_CONSTRAINT, calibrateChfMealCeiling, encodeWorldPreference, decodeWorldPreference, decodeWorldQueryConstraint, inferredIndoorSuitability, type WorldQueryConstraint } from "./product-query-semantics.js";

export const PRODUCT_V1_EVALUATOR_VERSION = "decision-vnext-product-evaluator@2.15" as const;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("de-CH");
const includes = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));
const cityIn = (text: string) => includes(text, ["zürich", "zurich"]) ? "Zurich" : text.includes("basel") ? "Basel" : null;
const weekdays = ["sonntag|sunday", "montag|monday", "dienstag|tuesday", "mittwoch|wednesday", "donnerstag|thursday", "freitag|friday", "samstag|saturday"] as const;
const requestedWeekday = (text: string): number => weekdays.findIndex((day) => new RegExp(`\\b(?:${day})\\b`, "u").test(text));

function requestedLocalDate(text: string, serverTime: string): string {
  // Remove directly negated/replaced calendar references before resolving a
  // positive day. This is intentionally local; it is not general negation NLP.
  text = text.replace(/(?<!\p{L})(?:nicht|not|statt|instead of|rather than)\s+(?:(?:am|on)\s+)?(?:day after tomorrow|übermorgen|morgen|tomorrow|heute|today|sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?!\p{L})/gu, " ");
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(serverTime));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const current = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  if (/(?<!\p{L})(?:übermorgen|day after tomorrow)(?!\p{L})/u.test(text)) current.setUTCDate(current.getUTCDate() + 2);
  else if (/\b(?:morgen|tomorrow)\b/u.test(text) && !/\bam morgen\b/u.test(text)) current.setUTCDate(current.getUTCDate() + 1);
  const requestedDay = requestedWeekday(text);
  if (requestedDay >= 0) current.setUTCDate(current.getUTCDate() + (requestedDay - current.getUTCDay() + 7) % 7);
  return current.toISOString().slice(0, 10);
}

/** A server-derived catalog hint, never eligibility or ranking authority. */
export function productRetrievalIntent(request: DecisionProductRequest): ProductV1Intent | null {
  const intent = Object.hasOwn(request.explicit, "primaryIntent") ? request.explicit.primaryIntent : inferProductV1Intent(request.naturalLanguage);
  return PRODUCT_V1_INTENT_MAPPINGS.find((mapping) => mapping.intentId === intent)?.intentId ?? null;
}

export function resolveDecisionProductContext(requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }, understanding?: ProductUnderstanding | null): DecisionProductContext {
  const request = DecisionProductRequestSchema.parse(requestValue);
  // Meaning-backed requests must never be interpreted again by raw-text fallbacks.
  const contextText = understanding?.interpretationSource === "MEANING_PLAN" ? "" : request.naturalLanguage;
  const text = normalize(contextText); const explicit = request.explicit;
  const understood = projectProductUnderstanding(understanding, request, requestedLocalDate("", authority.serverTime), authority.authorizedCity);
  const parsedBudget = requestBudget(contextText); const parsedGroup = requestGroup(contextText);
  const textCity = understanding?.requirements.some(r => r.dimension === "LOCATION") ? null : cityIn(text); const requestedCity = requestedProductCity(understanding, request) ?? textCity; if ((explicit.targetCity || understanding?.interpretationSource === "MEANING_PLAN") && requestedCity && canonicalRequestedCity(requestedCity).toLowerCase() !== canonicalRequestedCity(authority.authorizedCity).toLowerCase()) throw new Error("product_context_location_authority_mismatch");
  const primaryIntent = Object.hasOwn(explicit, "primaryIntent") ? explicit.primaryIntent ?? null : inferProductV1Intent(contextText);
  // Age is a contextual ranking signal, not a demand that every family spot
  // publish an explicit "no minimum age" rule. Known access restrictions are
  // still enforced against a stated age when assessing each candidate.
  const hard = new Set((explicit.hardConstraints ?? []).filter((constraint) => constraint !== "AGE_OR_LEGAL")); const soft = new Set(explicit.softPreferences ?? []);
  // A broad accessibility request must not recommend a venue with a verified
  // inaccessible entrance or route. A request specifically about steps only
  // requires the entrance; "barrierefrei" requires the basic visit path too.
  const accessText = accessibilityRequestScope(contextText).text
    .replace(/\b(?:not|no)\s+(?:be\s+)?(?:step[- ]free|wheelchair accessible)\b/gu, "");
  if (includes(accessText, ["barrierefrei", "hindernisfrei", "rollstuhlgängig", "rollstuhlgaengig", "wheelchair accessible"])) hard.add("ACCESSIBILITY_BASIC");
  else if (includes(accessText, ["rollstuhl", "stufenfrei", "stufenlos", "ohne stufen", "step-free", "step free", "without entrance steps"])) hard.add("ACCESSIBILITY_STEP_FREE");
  if (understood.openNow || !understood.timeMentioned && includes(text, ["geöffnet", "offen", "jetzt"])) hard.add("OPEN_NOW");
  if (!understood.timeMentioned && (requestedWeekday(text) >= 0 || includes(text, ["heute", "morgen", "übermorgen", "today", "tomorrow"])) || explicit.dateTime?.localDate) hard.add("OPEN_ON_REQUESTED_DAY");
  if (understood.budget || !understood.budgetMentioned && parsedBudget.requested || explicit.budget?.state === "KNOWN" && explicit.budget.amount !== null) hard.add("BUDGET_MAXIMUM");
  if (understood.dateTime?.localDate) hard.add("OPEN_ON_REQUESTED_DAY");
  for (const r of understood.requirements) if (!r.condition && !r.group && r.operator === "REQUIRE" && r.importance !== "PREFERRED" && r.value?.kind === "NEED" && r.value.code === "STEP_FREE_ENTRANCE") hard.add("ACCESSIBILITY_STEP_FREE");
  if (requestedCity) hard.add("TARGET_LOCATION");
  const quietRequirements = understood.requirements.filter(row => row.value?.kind === "FACET" && row.value.key === "context.atmosphere" && row.value.value === "QUIET");
  const positiveQuiet = quietRequirements.length ? quietRequirements.some(row => !row.condition && row.operator === "REQUIRE") && !quietRequirements.some(row => !row.condition && row.operator === "EXCLUDE") : hasPositiveQuietRequest(text);
  if (positiveQuiet) soft.add("ATMOSPHERE_QUIET");
  if (includes(text, ["günstig", "preiswert"])) soft.add("PRICE_LEVEL_LOW");
  const semanticValue = (key: string): string | null => [
    ...[...hard].map(decodeWorldQueryConstraint).filter((facet) => facet?.role === "REQUIRED"),
    ...[...soft].map(decodeWorldPreference),
  ].find((facet) => facet?.key === key)?.value ?? null;
  const semanticSituation = semanticValue("context.visit_situations");
  const contextUnresolved = new Set<string>([...(explicit.unresolvedTerms ?? []), ...understood.unresolvedTerms]);
  if (hasPreciseRequestedTime(contextText)) contextUnresolved.add("PRECISE_TIME_UNVERIFIED");
  if (explicit.budget ? explicit.budget.state === "KNOWN" && !explicit.budget.perPerson
    : !understood.budgetMentioned && parsedBudget.requested && !parsedBudget.representable) contextUnresolved.add("BUDGET_SEMANTICS_UNVERIFIED");
  const typedPhase = understood.requirements.some(r => [r.value, ...r.alternatives].some(v => v?.kind === "TIME" && (v.dayPhase !== null || v.event !== undefined)));
  const explicitDaypart = [...hard].map(decodeWorldQueryConstraint).find(facet => facet?.role === "REQUIRED" && facet.key === "context.typical_dayparts")?.value;
  // Typical venue hours inferred as a ranking facet are not a requested visit time.
  const literalPhase = (["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"] as const).find(phase => phase === explicitDaypart) ?? (typedPhase ? null : (includes(text, ["abend", "evening", "dinner"]) ? "EVENING" : /(?<!\p{L})(?:nachts?|tonight|night(?:time)?)(?!\p{L})/u.test(text) ? "NIGHT" : includes(text, ["nachmittag", "afternoon"]) ? "AFTERNOON" : includes(text, ["mittag", "midday", "lunch"]) ? "MIDDAY" : includes(text, ["frühstück", "am morgen", "morgens", "morning"]) ? "MORNING" : null));
  const calendarMentioned = requestedWeekday(text) >= 0 || /(?<!\p{L})(?:heute|morgen|übermorgen|today|tomorrow|jetzt|now)(?!\p{L})/u.test(text);
  const fallbackDate = calendarMentioned && !understood.timeMentioned ? requestedLocalDate(text, authority.serverTime) : null;
  const dateContext = explicit.dateTime ?? (understood.dateTime ? { ...understood.dateTime, dayPhase: understood.dateTime.dayPhase ?? literalPhase } : { state: fallbackDate ? "KNOWN" as const : "UNKNOWN" as const, localDate: fallbackDate, dayPhase: literalPhase, timeZone: "Europe/Zurich" });
  if ((explicit.targetCity || understanding?.interpretationSource === "MEANING_PLAN") && requestedCity && canonicalRequestedCity(requestedCity).toLowerCase() !== canonicalRequestedCity(authority.authorizedCity).toLowerCase()) contextUnresolved.add("LOCATION_REQUEST_UNVERIFIED");
  const requestedBudget = explicit.budget ?? understood.budget ?? { state: parsedBudget.amount !== null ? "KNOWN" as const : "UNKNOWN" as const, amount: parsedBudget.amount, currency: parsedBudget.requested ? "CHF" as const : null, perPerson: parsedBudget.perPerson, calibrationLabel: null };
  const secondaryIntent = explicit.secondaryIntent ?? (includes(text, ["date", "in ruhe reden"]) ? "QUIET_CONVERSATION" : null);
  const budgetRows = understood.requirements.filter(row => row.dimension === "BUDGET");
  const soleBudget = budgetRows.length === 1 ? budgetRows[0] : undefined;
  const simpleTypedBudget = soleBudget?.value?.kind === "BUDGET" && soleBudget.operator === "REQUIRE"
    && soleBudget.importance !== "PREFERRED" && !soleBudget.group && !soleBudget.condition && !soleBudget.value.includes?.length;
  const canCalibrate = primaryIntent === "EAT" && secondaryIntent === null && requestedBudget.state === "KNOWN"
    && requestedBudget.currency === "CHF" && requestedBudget.perPerson === true && requestedBudget.amount !== null
    && ![...contextUnresolved].some(code => code.startsWith("BUDGET_"))
    && (!budgetRows.length || simpleTypedBudget)
    && !understood.requirements.some(row => ["EXPERIENCE", "OFFERING"].includes(row.dimension) && (row.group || row.condition));
  const calibration = canCalibrate ? calibrateChfMealCeiling(Math.round(requestedBudget.amount! * 100),
    simpleTypedBudget && soleBudget.value?.kind === "BUDGET" ? soleBudget.value.comparison : "LTE") : null;
  const priceHints = calibration?.levels.map(level => encodeWorldPreference("operation.price_level", level)) ?? [];
  // Derived hints must not crowd out explicit preferences or overflow the public contract.
  if (new Set([...soft, ...priceHints]).size <= 30) for (const hint of priceHints) soft.add(hint);
  const body = {
    contractVersion: PRODUCT_DECISION_VERSIONS.context, resolverVersion: PRODUCT_REQUEST_CONTEXT_VERSION, inputHash: contentHash({ request, authority, ...(understanding ? { understandingHash: understanding.understandingHash } : {}) }),
    primaryIntent, secondaryIntent,
    intentCompatibility: primaryIntent ? "COMPATIBLE" as const : "UNKNOWN" as const, occasion: explicit.occasion ?? (text.includes("date") ? "DATE" : null),
    moods: explicit.moods ?? (positiveQuiet ? ["CALM"] : []), targetCity: requestedCity ?? authority.authorizedCity, ...(understanding?.visitAlternatives ? { visitAlternatives: understanding.visitAlternatives.map(branch => ({ id: branch.id, intent: branch.intent, preferred: branch.preferred, requirementsHash: contentHash(branch.requirements) })) } : {}), requirements: understood.requirements,
    dateTime: dateContext,
    group: { ...(explicit.group ?? { ...parsedGroup, adultPresent: parsedGroup.adultPresent || (parsedGroup.minimumAge !== null && parsedGroup.minimumAge >= 18) || null, companionType: parsedGroup.companionType ?? semanticSituation, ...understood.group }),
      ...(understanding?.knownAgesPartial && explicit.group?.minimumAge == null ? { minimumAge: null } : {}) },
    budget: { ...requestedBudget, calibrationLabel: calibration ? `${calibration.policy}:${calibration.level}` : requestedBudget.calibrationLabel },
    stayDuration: explicit.stayDuration ?? understood.stayDuration ?? null, hardConstraints: [...hard].sort(), softPreferences: [...soft].sort(), unresolvedTerms: [...new Set([...contextUnresolved, ...(!primaryIntent && !understanding?.visitAlternatives?.length ? ["CORE_INTENT"] : [])])].sort(),
    locationAuthority: { explicitTargetWins: true as const, authorizedCity: authority.authorizedCity, deviceCityUsed: false, state: contextUnresolved.has("LOCATION_REQUEST_UNVERIFIED") ? "UNKNOWN" as const : "KNOWN" as const },
    limitations: [...(primaryIntent || understanding?.visitAlternatives?.length ? [] : ["CORE_INTENT_REQUIRES_CLARIFICATION"]), ...(understanding?.knownAgesPartial ? ["PARTICIPANT_AGE_CONTEXT_PARTIAL"] : [])], rawTextPersisted: false as const,
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
  if (c.occasion && c.occasion !== context.occasion || c.area || c.eventMode && c.eventMode !== "NORMAL_OPERATION") return false;
  // A scoped World statement may count only if the request positively proves
  // its scope. In particular, "my four-year-old daughter" plus adult present
  // proves mixed ages; it does not prove legal guardianship or an area/event.
  if (c.ageContext && (c.ageContext !== "MIXED_AGES" || context.group.minimumAge === null || context.group.minimumAge >= 18 || !context.group.adultPresent)) return false;
  if (c.accompaniment && !(c.accompaniment === "ADULT" && context.group.adultPresent
    || c.accompaniment === "GROUP" && context.group.size !== null && context.group.size >= 2
    || c.accompaniment === "ALONE" && context.group.size === 1)) return false;
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
  if (category === "ACTIVITIES_PLAY" || [...placeTypes].some((value) => ["ARCADE", "ESCAPE_ROOM", "BOWLING_ALLEY", "MINI_GOLF", "WORKSHOP_STUDIO", "AMUSEMENT_PARK"].includes(value))) { concepts.add("place_type.activity"); concepts.add("place_type.experience"); }
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
  if (!state || snapshot.conflicts.some((row) => row.attributeKeys.includes("state.current")) || !state.validUntil) return false;
  const value = state.value as { readonly kind?: string };
  if (!["CLOSED", "TEMPORARILY_CLOSED", "AREA_CLOSED"].includes(value.kind ?? "")) return false;
  const start = Date.parse(`${context.dateTime.localDate ?? requestedLocalDate("", evaluationAt)}T00:00:00Z`);
  const from = state.validFrom ? Date.parse(state.validFrom) : Number.NEGATIVE_INFINITY;
  const until = Date.parse(state.validUntil);
  // Without an exact requested hour, only a claim covering the full local day
  // may suppress a future recommendation. A 24h UTC margin is conservative
  // across Swiss daylight-saving changes, never an invented opening time.
  if (context.dateTime.localDate && context.dateTime.localDate !== requestedLocalDate("", evaluationAt) || context.dateTime.dayPhase) return from <= start - 86_400_000 && until >= start + 172_800_000;
  const now = Date.parse(evaluationAt);
  return from <= now && now < until;
}

export function evaluateProductV1IntentClassification(input: { readonly intent: string | null; readonly purpose: string | null; readonly category: string | null; readonly placeTypes: readonly string[]; readonly disputed: boolean; readonly evidenceSourceHash: string }) {
  if (!input.intent) return { intentId: null, state: "NOT_APPLICABLE" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  const mapping = PRODUCT_V1_INTENT_MAPPINGS.find((row) => row.intentId === input.intent); if (!mapping) return { intentId: input.intent, state: "NOT_CONFIGURED" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  const { purpose, category, placeTypes } = input;
  if (purpose !== null && !(PRIMARY_VISIT_PURPOSES as readonly string[]).includes(purpose)
    || category !== null && !(PRIMARY_CATEGORIES as readonly string[]).includes(category)
    || placeTypes.some((value) => !(PLACE_TYPES as readonly string[]).includes(value))) {
    return { intentId: input.intent, state: "NOT_CONFIGURED" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  }
  const purposeIncompatible = purpose !== null && (mapping.incompatiblePrimaryPurposes as readonly string[]).includes(purpose);
  const purposeConfirmed = purpose !== null && (mapping.acceptedPrimaryPurposes as readonly string[]).includes(purpose);
  const categoryIncompatible = category !== null && (mapping.incompatiblePrimaryCategories as readonly string[]).includes(category);
  const categoryConfirmed = (mapping.acceptedPrimaryCategories as readonly string[]).includes(category ?? "");
  const placeConfirmed = placeTypes.some((value) => (mapping.acceptedPlaceTypes as readonly string[]).includes(value));
  const placeIncompatible = placeTypes.some((value) => (mapping.incompatiblePlaceTypes as readonly string[]).includes(value));
  // A mixed venue can be confirmed by its actual place type only when its
  // verified primary purpose also supports the intent (e.g. a pub classified
  // under EAT). A hotel remains incompatible even if it has an onsite café.
  const mixedVenueConfirmed = categoryIncompatible && purposeConfirmed && placeConfirmed;
  const state = input.disputed ? "DISPUTED" as const
    : purposeIncompatible || categoryIncompatible && !mixedVenueConfirmed ? "INCOMPATIBLE" as const
    : categoryConfirmed || placeConfirmed ? "CONFIRMED" as const
    : placeIncompatible ? "INCOMPATIBLE" as const : "UNKNOWN" as const;
  return { intentId: input.intent, state, mappingIds: [`product-intent-${input.intent.toLowerCase()}`], worldFactKeys: ["purpose.primary_visit", "classification.primary_category", "classification.place_types"], evidenceSourceHash: contentHash({ evidenceSourceHash: input.evidenceSourceHash, purpose, category, placeTypes, policyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash }) };
}

function intentCoverage(snapshot: ProductWorldView, intent: string | null, requirements: readonly ProductRequirement[] = []) {
  const purposeEntry = entry(snapshot, "purpose.primary_visit"); const purpose = typeof purposeEntry?.value === "string" ? purposeEntry.value : null;
  const category = snapshot.spot.classification.primaryCategory; const placeTypes = snapshot.spot.classification.placeTypes ?? [];
  const coverage = evaluateProductV1IntentClassification({ intent, purpose, category, placeTypes, disputed: snapshot.conflicts.some((row) => row.attributeKeys.some((key) => ["purpose.primary_visit", "classification.primary_category", "classification.place_types"].includes(key))), evidenceSourceHash: snapshot.snapshotHash });
  // A broad activity summary must not veto an explicitly requested dance visit
  // solely because a canonical club is classified as nightlife. This does not
  // establish a dance offering: the concrete need remains unverified below.
  const dance = requirements.find(row => row.dimension === "EXPERIENCE" && row.interpretationState === "UNDERSTOOD"
    && row.operator === "REQUIRE" && row.importance !== "PREFERRED" && row.group === null && !row.condition
    && row.value?.kind === "NEED" && row.value.code === "DANCING");
  if (intent === "ACTIVITY_EXPERIENCE" && coverage.state === "INCOMPATIBLE" && dance
    && category === "NIGHTLIFE" && (purpose === "ENTERTAINMENT" || purpose === "EAT_DRINK")
    && placeTypes.some(value => value === "NIGHTCLUB" || value === "MUSIC_CLUB")) {
    return { ...coverage, state: "UNKNOWN" as const,
      mappingIds: [...coverage.mappingIds, "product-intent-activity-dancing-unverified"],
      evidenceSourceHash: contentHash({ classification: coverage.evidenceSourceHash, requirement: dance, policyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash }) };
  }
  return coverage;
}

function primaryPurposeCoverage(snapshot: ProductWorldView, intent: string | null) {
  const purposeEntry = entry(snapshot, "purpose.primary_visit");
  const purpose = typeof purposeEntry?.value === "string" ? purposeEntry.value : null;
  if (!intent) return contextual("NOT_APPLICABLE", { snapshotHash: snapshot.snapshotHash, purpose, intent });
  const mapping = PRODUCT_V1_INTENT_MAPPINGS.find((row) => row.intentId === intent);
  if (!mapping) return contextual("NOT_CONFIGURED", { snapshotHash: snapshot.snapshotHash, purpose, intent });
  if (snapshot.conflicts.some((row) => row.attributeKeys.includes("purpose.primary_visit"))) return contextual("DISPUTED", purposeEntry ?? snapshot.snapshotHash, [`product-purpose-${intent.toLowerCase()}`]);
  if (purpose === null) return contextual(unknown(snapshot, "purpose.primary_visit") ? "UNKNOWN" : "NOT_CONFIGURED", purposeEntry ?? snapshot.snapshotHash, [`product-purpose-${intent.toLowerCase()}`]);
  if ((mapping.acceptedPrimaryPurposes as readonly string[]).includes(purpose)) return contextual("CONFIRMED", purposeEntry, [`product-purpose-${intent.toLowerCase()}`]);
  if ((mapping.incompatiblePrimaryPurposes as readonly string[]).includes(purpose)) return contextual("INCOMPATIBLE", purposeEntry, [`product-purpose-${intent.toLowerCase()}`]);
  return contextual("UNKNOWN", purposeEntry, [`product-purpose-${intent.toLowerCase()}`]);
}

function matchesWorldPreference(snapshot: ProductWorldView, context: DecisionProductContext, key: string, value: string): boolean {
  const row = entry(snapshot, key);
  if (!row || snapshot.conflicts.some((conflict) => conflict.attributeKeys.includes(key))) return false;
  const actual = row.value;
  if (key === "context.visit_situations") return matchedRows(actual, context).some((item) => item.situation === value);
  if (key === "context.atmosphere") return matchedRows(actual, context).some((item) => item.atmosphere === value);
  if (key === "context.typical_dayparts") return matchedRows(actual, context).some((item) => item.daypart === value);
  return actual === value || Array.isArray(actual) && actual.includes(value);
}

function hasConfirmedWorldAttribute(snapshot: ProductWorldView, key: string): boolean {
  const row = entry(snapshot, key);
  return row?.resolution === "KNOWN_VALUE" && !snapshot.conflicts.some((conflict) => conflict.attributeKeys.includes(key));
}

type WorldQueryPlan = {
  readonly requiredGroups: readonly (readonly [string, readonly WorldQueryConstraint[]])[];
  readonly excluded: readonly WorldQueryConstraint[];
};
function worldQueryPlan(context: DecisionProductContext): WorldQueryPlan {
  const requiredGroups = new Map<string, WorldQueryConstraint[]>();
  const excluded: WorldQueryConstraint[] = [];
  for (const value of context.hardConstraints) {
    const constraint = decodeWorldQueryConstraint(value);
    if (!constraint) continue;
    if (constraint.role === "EXCLUDED") excluded.push(constraint);
    else {
      const group = requiredGroups.get(constraint.group) ?? [];
      group.push(constraint);
      requiredGroups.set(constraint.group, group);
    }
  }
  return { requiredGroups: [...requiredGroups], excluded };
}

const germanWeekday = (localDate: string): string => new Intl.DateTimeFormat("de-CH", { weekday: "long", timeZone: "Europe/Zurich" }).format(new Date(`${localDate}T12:00:00.000Z`));
const openingIntervals = (rows: readonly { readonly start: string; readonly end: string }[]): string => rows.map((row) => `${row.start}–${row.end}`).join(", ");
const daypartWindows: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  MORNING: [[360, 660]], MIDDAY: [[660, 840]], AFTERNOON: [[840, 1080]],
  EVENING: [[1080, 1380]], NIGHT: [[0, 360], [1380, 1440]],
};
function intervalsMeetDaypart(intervals: readonly { readonly start: string; readonly end: string }[], phase: string | null): boolean {
  if (!phase || !daypartWindows[phase]) return true;
  return intervals.some(({ start, end }) => {
    const startMinute = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
    const endMinute = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
    const normalizedEnd = endMinute <= startMinute ? endMinute + 1440 : endMinute;
    return daypartWindows[phase]!.some(([from, to]) => startMinute < to && normalizedEnd > from);
  });
}

function assess(snapshot: ProductWorldView, context: DecisionProductContext, queryPlan: WorldQueryPlan, projection: RelevantUserProjection, rejected: readonly string[], evaluationAt: string, requirements: readonly ProductRequirement[] = []): DecisionProductCandidateAssessment {
  const core = intentCoverage(snapshot, context.primaryIntent, requirements); const secondary = intentCoverage(snapshot, context.secondaryIntent, requirements); const purposeCoverage = primaryPurposeCoverage(snapshot, context.primaryIntent);
  const confirmed: string[] = []; const unknownHard: string[] = []; const failed: string[] = [];
  if (context.hardConstraints.includes("TARGET_LOCATION")) (snapshot.spot.location.locality !== null && context.targetCity !== null && canonicalRequestedCity(snapshot.spot.location.locality).toLowerCase() === canonicalRequestedCity(context.targetCity).toLowerCase() ? confirmed : failed).push("TARGET_LOCATION");
  if (context.hardConstraints.includes("ACCESSIBILITY_STEP_FREE")) { const row = entry(snapshot, "accessibility.step_free_entrance"); row?.resolution === "KNOWN_TRUE" ? confirmed.push("ACCESSIBILITY_STEP_FREE") : row?.resolution === "KNOWN_FALSE" ? failed.push("ACCESSIBILITY_STEP_FREE") : unknownHard.push("ACCESSIBILITY_STEP_FREE"); }
  if (context.hardConstraints.includes("ACCESSIBILITY_BASIC")) {
    const states = ["accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating"]
      .map((key) => entry(snapshot, key)?.resolution);
    (states.includes("KNOWN_FALSE") ? failed : states.every((state) => state === "KNOWN_TRUE") ? confirmed : unknownHard).push("ACCESSIBILITY_BASIC");
  }
  if (context.hardConstraints.includes("BUDGET_MAXIMUM")) {
    const value = entry(snapshot, "operation.price_range")?.value;
    const range = value && typeof value === "object" && !Array.isArray(value) && "max" in value && "currency" in value ? value : null;
    const maximum = range && typeof range.max === "number" && Number.isFinite(range.max) ? range.max : null;
    const comparable = context.budget.state === "KNOWN" && context.budget.perPerson && context.budget.currency === "CHF"
      && range?.currency === context.budget.currency && !context.unresolvedTerms.includes("BUDGET_SEMANTICS_UNVERIFIED");
    maximum === null || context.budget.amount === null || !comparable ? unknownHard.push("BUDGET_MAXIMUM")
      : (() => {
        const strict = requirements.some(r => r.importance !== "PREFERRED" && !r.condition && !r.group && r.operator === "REQUIRE" && r.value?.kind === "BUDGET" && r.value.comparison === "LT");
        const fits = strict ? Math.round(maximum * 100) < Math.round(context.budget.amount! * 100) : Math.round(maximum * 100) <= Math.round(context.budget.amount! * 100);
        (fits ? confirmed : failed).push("BUDGET_MAXIMUM");
      })();
  }
  if (context.unresolvedTerms.includes("LOCATION_REQUEST_UNVERIFIED")) unknownHard.push("TARGET_LOCATION");
  const indoorSuitability = inferredIndoorSuitability(snapshot.spot.classification.placeTypes ?? []);
  for (const [index, requirement] of requirements.entries()) {
    if (!requirement.condition && requirement.group === null && requirement.importance !== "PREFERRED" && requirement.operator === "REQUIRE" && requirement.value?.kind === "SETTING" && requirement.value.environment === "INDOOR") {
      (indoorSuitability === "INDOOR" ? confirmed : indoorSuitability === "OUTDOOR" ? failed : unknownHard).push(`UNDERSTANDING_SETTING_${index + 1}`);
    }
    if (requirement.importance === "HARD" && (requirement.interpretationState !== "UNDERSTOOD"
      || requirement.condition !== undefined || ["MOBILITY", "OTHER", "WAITING", "DURATION"].includes(requirement.dimension)
      || requirement.value?.kind === "NEED" && !(requirement.value.code === "STEP_FREE_ENTRANCE" && requirement.operator === "REQUIRE" && !requirement.group)
      || requirement.dimension === "SETTING" && !(requirement.group === null && requirement.operator === "REQUIRE" && requirement.value?.kind === "SETTING" && requirement.value.environment === "INDOOR") || requirement.value?.kind !== "FACET" && (requirement.group !== null || requirement.operator === "EXCLUDE" && !calendarExclusionSatisfied(requirement, context.dateTime.localDate, requestedLocalDate("", evaluationAt)))
      || requirement.dimension === "BUDGET" && context.unresolvedTerms.includes("BUDGET_CONTEXT_CONFLICT")
      || requirement.dimension === "TIME" && context.unresolvedTerms.some(code => ["TIME_REQUEST_UNRESOLVED", "TIME_CONTEXT_CONFLICT", "PRECISE_TIME_UNVERIFIED"].includes(code))
      || ["AGE", "COMPANY"].includes(requirement.dimension) && context.unresolvedTerms.includes("GROUP_CONTEXT_CONFLICT"))) unknownHard.push(`UNDERSTANDING_UNRESOLVED_${index + 1}`);
  }
  if (context.hardConstraints.includes(PRODUCT_INDOOR_CONSTRAINT)) {
    (indoorSuitability === "INDOOR" ? confirmed : indoorSuitability === "OUTDOOR" ? failed : unknownHard).push(PRODUCT_INDOOR_CONSTRAINT);
  }
  const ageEntry = entry(snapshot, "rule.age_access_conditions");
  const ageValue = ageEntry?.value;
  const ageRules = ageValue && typeof ageValue === "object" && !Array.isArray(ageValue) && "rules" in ageValue && Array.isArray(ageValue.rules) ? ageValue.rules : [];
  // A rule scoped to a time, day, area or event cannot be applied to the
  // entire venue without knowing that the user's visit matches its scope.
  const universalAgeRules = ageRules.length > 0 && ageRules.every((rule) => rule && typeof rule === "object" && rule.appliesFromTime === null && (!Array.isArray(rule.days) || rule.days.length === 0) && rule.area === null && rule.event === null);
  const age = context.group.minimumAge;
  const partialAge = context.limitations.includes("PARTICIPANT_AGE_CONTEXT_PARTIAL");
  const knownMinimum = requirements.flatMap(row => row.value?.kind === "AGE" ? [row.value.minimumAge] : []);
  const knownTooYoung = partialAge && knownMinimum.length > 0 && universalAgeRules && !ageRules.some(rule => rule && typeof rule === "object"
    && (rule.mode === "NO_MINIMUM" || typeof rule.minimumAge === "number" && (Math.min(...knownMinimum) >= rule.minimumAge || rule.mode === "UNACCOMPANIED_MINIMUM" && context.group.adultPresent)));
  if (knownTooYoung) failed.push("AGE_OR_LEGAL");
  else if (partialAge && universalAgeRules && !ageRules.some(rule => rule && typeof rule === "object" && rule.mode === "NO_MINIMUM")) unknownHard.push("AGE_OR_LEGAL");
  const noMinimum = universalAgeRules && ageRules.some(rule => rule && typeof rule === "object" && rule.mode === "NO_MINIMUM");
  const knownAgeSuitability = noMinimum || age !== null && universalAgeRules;
  const ageAllowed = knownAgeSuitability && ageRules.some((rule) => rule && typeof rule === "object" && ((rule.mode === "NO_MINIMUM") || (typeof rule.minimumAge === "number" && (age !== null && age >= rule.minimumAge || (rule.mode === "UNACCOMPANIED_MINIMUM" && context.group.adultPresent)))));
  if (knownAgeSuitability && !ageAllowed) failed.push("AGE_OR_LEGAL");
  for (const [index, requirement] of requirements.entries()) {
    if (requirement.importance !== "HARD") continue;
    const value = requirement.value;
    const ageUnverified = value?.kind === "AGE" && !knownAgeSuitability;
    const companyUnverified = value?.kind === "COMPANY" && (value.size !== null || value.companionType !== null
      && !matchesWorldPreference(snapshot, context, "context.visit_situations", value.companionType));
    if (ageUnverified || companyUnverified) unknownHard.push(`UNDERSTANDING_CONTEXT_${index + 1}`);
  }
  const requestedDay = context.hardConstraints.includes("OPEN_ON_REQUESTED_DAY") && context.dateTime.localDate ? evaluateOpeningDay(snapshot, context.dateTime.localDate, productOpeningPolicy) : null;
  const confirmedRequestedClosure = context.hardConstraints.includes("OPEN_ON_REQUESTED_DAY") && confirmedClosureForRequestedDate(snapshot, context, evaluationAt);
  const openingStatus: DecisionProductCandidateAssessment["actualAvailability"]["status"] = context.hardConstraints.includes("OPEN_NOW")
    ? evaluateOpeningState(snapshot, evaluationAt, productOpeningPolicy).status
    : confirmedRequestedClosure ? "closed" : requestedDay?.status === "open" && !intervalsMeetDaypart(requestedDay.intervals, context.dateTime.dayPhase)
      ? "closed" : requestedDay?.status ?? (confirmedClosureForRequestedDate(snapshot, context, evaluationAt) ? "closed" : "not_requested");
  if (openingStatus === "closed") failed.push("ACTUAL_AVAILABILITY");
  if (context.hardConstraints.includes("OPEN_NOW")) { openingStatus === "open" ? confirmed.push("OPEN_NOW") : openingStatus === "closed" ? failed.push("OPEN_NOW") : unknownHard.push("OPEN_NOW"); }
  if (context.hardConstraints.includes("OPEN_ON_REQUESTED_DAY")) { openingStatus === "open" ? confirmed.push("OPEN_ON_REQUESTED_DAY") : openingStatus === "closed" ? failed.push("OPEN_ON_REQUESTED_DAY") : unknownHard.push("OPEN_ON_REQUESTED_DAY"); }
  const semanticReasons: ReturnType<typeof reason>[] = [];
  for (const [group, alternatives] of queryPlan.requiredGroups) {
    const code = `QUERY_REQUIRED_${group}`;
    const matches = alternatives.some(({ key, value }) => matchesWorldPreference(snapshot, context, key, value));
    const unknownEvidence = alternatives.some(({ key }) => !hasConfirmedWorldAttribute(snapshot, key));
    (matches ? confirmed : unknownEvidence ? unknownHard : failed).push(code);
  }
  for (const [index, constraint] of queryPlan.excluded.entries()) {
    const code = `QUERY_EXCLUDED_${index + 1}`;
    const excluded = matchesWorldPreference(snapshot, context, constraint.key, constraint.value);
    const known = hasConfirmedWorldAttribute(snapshot, constraint.key);
    (excluded ? failed : known ? confirmed : unknownHard).push(code);
  }
  if (queryPlan.requiredGroups.length || queryPlan.excluded.length) {
    const fullyConfirmed = ![...failed, ...unknownHard].some((code) => code.startsWith("QUERY_"));
    semanticReasons.push(reason("query-relevance", fullyConfirmed ? "WORLD" : "LIMITATION", snapshot.snapshotHash,
      fullyConfirmed ? "Die geprüften Kernmerkmale passen. Weitere Teile deines Wunsches sind damit nicht automatisch bestätigt." : "Ein für deinen Wunsch wichtiges Merkmal ist nicht bestätigt.", fullyConfirmed));
  }
  // Requirements survive facet normalization. Essential mood/offering needs
  // cannot become a fully confirmed fit merely because their ranking facet is
  // optional. A group is OR only for the same requirement policy and dimension.
  const requirementGroups = new Map<string, ProductRequirement[]>();
  let essentialUnverified = false;
  for (const [index, requirement] of requirements.entries()) {
    if (requirement.condition || requirement.operator === "ALLOW" || requirement.value?.kind !== "FACET" || requirement.importance === "PREFERRED") continue;
    if (requirement.operator === "REQUIRE" && requirement.group !== null && requirements.some(other => other.group === requirement.group && other.dimension === requirement.dimension && other.importance === requirement.importance && other.operator === requirement.operator && other.value?.kind !== "FACET")) {
      // The non-facet branch is not verifiable here. Never evaluate the known
      // branch alone as a mandatory AND condition or as a proven complete OR.
      essentialUnverified = true;
      if (requirement.importance === "HARD") unknownHard.push(`UNDERSTANDING_ALTERNATIVE_${index + 1}`);
      continue;
    }
    const key = `${requirement.dimension}:${requirement.importance}:${requirement.operator}:${requirement.group ?? index}`;
    requirementGroups.set(key, [...(requirementGroups.get(key) ?? []), requirement]);
  }
  for (const [index, alternatives] of [...requirementGroups.values()].entries()) {
    const first = alternatives[0]!;
    const matches = alternatives.map(r => r.value?.kind === "FACET" && matchesWorldPreference(snapshot, context, r.value.key, r.value.value));
    const satisfied = first.operator === "REQUIRE" ? matches.some(Boolean) : alternatives.every((r, i) => r.value?.kind === "FACET"
      && r.value.key.startsWith("classification.") && hasConfirmedWorldAttribute(snapshot, r.value.key) && !matches[i]);
    if (!satisfied) {
      essentialUnverified = true;
      if (first.importance === "HARD" || first.operator === "EXCLUDE" && matches.some(Boolean)) {
        // An optional offering at a venue does not force the visitor to consume
        // it. Excluding lunch/beer must not reject a café merely for serving it.
        // Keep the requested exclusion unverified; place/atmosphere vetoes stand.
        const incompatible = first.operator === "EXCLUDE" ? first.dimension !== "OFFERING" && matches.some(Boolean) : alternatives.every(r => r.value?.kind === "FACET" && r.value.key.startsWith("classification.") && hasConfirmedWorldAttribute(snapshot, r.value.key));
        (incompatible ? failed : unknownHard).push(`UNDERSTANDING_REQUIREMENT_${index + 1}`);
      }
    }
  }
  if (essentialUnverified) semanticReasons.push(reason("request-requirement-unverified", "LIMITATION", context.interpretationHash, "Eine ausdrücklich gewünschte Eigenschaft ist für diesen Ort nicht bestätigt.", false));
  const contextualReject = rejected.includes(snapshot.spot.spotId); const incompatible = ["INCOMPATIBLE", "DISPUTED"].includes(core.state); const notConfigured = core.state === "NOT_CONFIGURED";
  // An activity category does not prove suitability for the requested company.
  // Keep an unverified companion match visible as a fallback, but never label
  // it fully confirmed or let it outrank an otherwise equal verified match.
  const companionSituationUnconfirmed = context.group.companionType !== null
    && !matchesWorldPreference(snapshot, context, "context.visit_situations", context.group.companionType);
  const dateSituationUnconfirmed = context.occasion === "DATE"
    && !matchesWorldPreference(snapshot, context, "context.visit_situations", "DATE_PAIR");
  const situationUnconfirmed = companionSituationUnconfirmed || dateSituationUnconfirmed;
  const priceLevel = entry(snapshot, "operation.price_level")?.value;
  const lowPriceConfirmed = hasConfirmedWorldAttribute(snapshot, "operation.price_level") && ["VERY_LOW", "LOW"].includes(String(priceLevel));
  const lowPriceUnconfirmed = context.softPreferences.includes("PRICE_LEVEL_LOW") && !lowPriceConfirmed;
  const tierValue = contextualReject || failed.length || incompatible ? "INELIGIBLE" : notConfigured ? "NOT_CONFIGURED" : core.state === "CONFIRMED" && !unknownHard.length && !situationUnconfirmed && !lowPriceUnconfirmed && !essentialUnverified && !context.unresolvedTerms.some(code => code !== "VISIT_ALTERNATIVE_UNMAPPED") ? "ELIGIBLE_CONFIRMED" : "UNCONFIRMED_FALLBACK";
  const purposeEntry = entry(snapshot, "purpose.primary_visit"); const onsiteEntry = entry(snapshot, "offering.onsite"); const onsite = Array.isArray(onsiteEntry?.value) ? onsiteEntry.value as readonly { kind: string; relationship: "PART_OF_SPOT" | "EMBEDDED_FACILITY" }[] : [];
  const atmosphereEntry = entry(snapshot, "context.atmosphere"); const visitEntry = entry(snapshot, "context.visit_situations"); const daypartEntry = entry(snapshot, "context.typical_dayparts");
  const matchingAtmosphere = matchedRows(atmosphereEntry?.value, context).filter((row) => context.softPreferences.includes("ATMOSPHERE_QUIET") && ["QUIET", "COZY", "RELAXED"].includes(row.atmosphere ?? ""));
  const matchingVisit = matchedRows(visitEntry?.value, context).filter((row) => context.group.companionType !== null && row.situation === context.group.companionType || context.occasion === "DATE" && row.situation === "DATE_PAIR");
  const matchingDaypart = matchedRows(daypartEntry?.value, context).filter((row) => context.dateTime.dayPhase !== null && row.daypart === context.dateTime.dayPhase);
  const matchingPrice = context.softPreferences.includes("PRICE_LEVEL_LOW") && lowPriceConfirmed;
  const matchedWorldPreferences = context.softPreferences.filter((preference) => {
    const facet = decodeWorldPreference(preference);
    return facet !== null && matchesWorldPreference(snapshot, context, facet.key, facet.value);
  });
  const matchedSoft = [...(matchingAtmosphere.length ? ["ATMOSPHERE_QUIET"] : []), ...(matchingVisit.length ? ["VISIT_SITUATION"] : []), ...(matchingDaypart.length ? ["TYPICAL_DAYPART"] : []), ...(matchingPrice ? ["PRICE_LEVEL_LOW"] : []), ...(ageAllowed ? ["AGE_COMPATIBLE"] : []), ...matchedWorldPreferences];
  const tasteMatches = userTasteMatches(snapshot, context, projection);
  const worldReasons = [
    reason(`core-intent-${core.state.toLowerCase()}`, "WORLD", core.evidenceSourceHash, core.state === "CONFIRMED" ? "Die bestätigte Kernklassifikation passt zur Absicht." : core.state === "INCOMPATIBLE" ? "Die bestätigte Kernklassifikation passt nicht zur Absicht; Zusatzangebote ersetzen sie nicht." : "Die Kernabsicht ist durch World Knowledge nicht bestätigt.", core.state === "CONFIRMED"),
    reason(`primary-purpose-${purposeCoverage.state.toLowerCase()}`, "WORLD", purposeCoverage.evidenceSourceHash, purposeCoverage.state === "CONFIRMED" ? "Der bestätigte Hauptzweck unterstützt die Absicht zusätzlich." : purposeCoverage.state === "INCOMPATIBLE" ? "Der bestätigte Hauptzweck unterstützt diese Absicht nicht." : "Der Hauptzweck ist für diese Absicht nicht bestätigt.", purposeCoverage.state === "CONFIRMED"),
    ...semanticReasons,
  ];
  if (openingStatus === "closed") worldReasons.push(reason("currently-closed", "WORLD", contentHash({ snapshotHash: snapshot.snapshotHash, openingStatus }), requestedDay?.status === "open" && context.dateTime.dayPhase && !intervalsMeetDaypart(requestedDay.intervals, context.dateTime.dayPhase) ? "Der Ort ist zur gewünschten Tageszeit laut bestätigten Öffnungszeiten nicht geöffnet." : "Der Ort ist laut gültigem World Knowledge geschlossen.", true));
  if (context.hardConstraints.includes(PRODUCT_INDOOR_CONSTRAINT)) {
    worldReasons.push(reason(`indoor-${indoorSuitability.toLowerCase()}`, indoorSuitability === "UNKNOWN" ? "LIMITATION" : "WORLD", contentHash({ snapshotHash: snapshot.snapshotHash, placeTypes: snapshot.spot.classification.placeTypes, indoorSuitability }), indoorSuitability === "INDOOR" ? "Diese bestätigte Ortsart ist grundsätzlich drinnen; die aktuelle Öffnung wird separat geprüft." : indoorSuitability === "OUTDOOR" ? "Diese bestätigte Ortsart ist überwiegend draußen und passt nicht zum Regenwunsch." : "Ob dieser Ort für einen Besuch bei Regen drinnen geeignet ist, ist nicht zuverlässig geklärt.", indoorSuitability !== "UNKNOWN"));
  }
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
  else if (situationUnconfirmed) worldReasons.push(reason("visit-unconfirmed", "LIMITATION", contentHash({ snapshotHash: snapshot.snapshotHash, companionType: context.group.companionType, occasion: context.occasion }), "Ob dieser Ort für deine Begleitung und Situation geeignet ist, ist nicht bestätigt.", false));
  if (matchingDaypart.length) worldReasons.push(reason("daypart-fit", "CONTEXT", contentHash(daypartEntry), "Die bestätigte Tageszeit passt.", true));
  if (matchingPrice) worldReasons.push(reason("price-level-fit", "CONTEXT", contentHash({ priceLevel, snapshotHash: snapshot.snapshotHash }), "Das bestätigte Preislevel ist niedrig; konkrete Preise können abweichen.", true));
  else if (lowPriceUnconfirmed) worldReasons.push(reason("price-level-unconfirmed", "LIMITATION", contentHash({ priceLevel: priceLevel ?? null, snapshotHash: snapshot.snapshotHash }), "Ein niedriges Preisniveau ist für diesen Ort nicht bestätigt.", false));
  if (context.unresolvedTerms.includes("MUSIC_AT_VISIT_UNVERIFIED")) worldReasons.push(reason("music-at-visit-unverified", "LIMITATION", context.interpretationHash, "Ob zum gewünschten Besuch Musik läuft, ist für diesen Ort nicht bestätigt.", false));
  if (context.unresolvedTerms.includes("PRECISE_TIME_UNVERIFIED")) worldReasons.push(reason("precise-time-unverified", "LIMITATION", context.interpretationHash, "Die konkrete gewünschte Uhrzeit wurde für diesen Ort nicht geprüft.", false));
  if (context.unresolvedTerms.includes("BUDGET_SEMANTICS_UNVERIFIED")) worldReasons.push(reason("budget-semantics-unverified", "LIMITATION", context.interpretationHash, "Die Budgetgrenze oder ihr Bezug pro Person konnte noch nicht eindeutig geprüft werden.", false));
  if (context.unresolvedTerms.includes("VISIT_ALTERNATIVE_UNMAPPED")) worldReasons.push(reason("visit-alternative-unmapped", "LIMITATION", context.interpretationHash, "Eine weitere Alternative konnte noch nicht mit Spot-Wissen abgeglichen werden; die hier geprüfte Möglichkeit bleibt davon getrennt.", false));
  if (context.unresolvedTerms.includes("OTHER_CORE_NEED_UNMAPPED")) worldReasons.push(reason("core-need-unmapped", "LIMITATION", context.interpretationHash, "Ein weiterer Teil deines Wunsches konnte noch nicht mit Spot-Wissen abgeglichen werden.", false));
  for (const preference of matchedWorldPreferences) {
    const facet = decodeWorldPreference(preference)!;
    const matchedEntry = entry(snapshot, facet.key);
    worldReasons.push(reason(`world-preference-${facet.key.replaceAll(".", "-")}-${facet.value.toLowerCase().replaceAll("_", "-")}`, "WORLD", contentHash(matchedEntry), "Eine bestätigte Eigenschaft dieses Ortes passt zu deinem Wunsch.", true));
  }
  if (ageAllowed) worldReasons.push(reason("age-access-fit", "CONTEXT", contentHash(ageEntry), "Die bestätigte Altersregel ist mit dem angegebenen Alter vereinbar.", true));
  if (knownAgeSuitability && !ageAllowed) worldReasons.push(reason("age-access-restriction", "WORLD", contentHash(ageEntry), "Die bestätigte Zutrittsregel lässt den Besuch mit dem angegebenen Alter nicht zu.", true));
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
    conflicts: snapshot.conflicts.map((row) => row.code).sort(), reasons: worldReasons, limitations: [...(essentialUnverified ? ["ESSENTIAL_REQUIREMENT_UNVERIFIED"] : []), ...(unknownHard.length ? ["HARD_CONSTRAINT_EVIDENCE_UNKNOWN"] : []), ...(situationUnconfirmed ? ["VISIT_SITUATION_EVIDENCE_UNKNOWN"] : []), ...(lowPriceUnconfirmed ? ["PRICE_LEVEL_EVIDENCE_NOT_LOW"] : []), ...(context.hardConstraints.includes("BUDGET_MAXIMUM") && unknownHard.includes("BUDGET_MAXIMUM") && priceLevel ? ["PRICE_LEVEL_NOT_A_CHF_AMOUNT"] : []), ...(core.state === "UNKNOWN" ? ["CORE_INTENT_EVIDENCE_UNKNOWN"] : []), ...context.unresolvedTerms],
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

/** Evaluate each complete alternative with the existing eligibility rules.
 * Choosing one branch is OR; requirements inside it remain AND. */
function assessVisitAlternatives(snapshot: ProductWorldView, request: DecisionProductRequest, context: DecisionProductContext,
  authority: { readonly authorizedCity: string; readonly serverTime: string }, projection: RelevantUserProjection, understanding: ProductUnderstanding): DecisionProductCandidateAssessment {
  const assessments = understanding.visitAlternatives!.map(branch => {
    const requirements = [...understanding.requirements, ...branch.requirements].map(row => row.importance === "ESSENTIAL" && !["AGE", "COMPANY"].includes(row.dimension) ? { ...row, importance: "HARD" as const } : row);
    const filters = new Set(request.explicit.hardConstraints ?? []);
    // Group IDs are allocated over the combined requirements, avoiding collisions
    // between shared filters and local facets on different keys.
    const occupied = new Set([...filters].flatMap(filter => { const row = decodeWorldQueryConstraint(filter); return row ? [row.group] : []; }));
    const groups = new Map<string, string>();
    for (const facet of projectRequirementFacets(requirements)) if (facet.role !== "PREFERRED") {
      const original = facet.group ?? "X";
      if (!groups.has(original)) {
        let next = 1; while (occupied.has(`V${next}`)) next++;
        groups.set(original, `V${next}`); occupied.add(`V${next}`);
      }
      filters.add(encodeWorldQueryConstraint(facet.role, groups.get(original)!, facet.key, facet.value));
    }
    if (filters.size > 30) throw new Error("product_visit_alternative_capacity_unavailable");
    const branchRequest = DecisionProductRequestSchema.parse({ ...request, explicit: { ...request.explicit,
      primaryIntent: branch.intent, hardConstraints: [...filters],
      unresolvedTerms: [...new Set([...(request.explicit.unresolvedTerms ?? []), ...(branch.unresolved ? ["OTHER_CORE_NEED_UNMAPPED" as const] : [])])],
    } });
    const branchUnderstanding = bindProductUnderstanding(branchRequest, requirements, "MEANING_PLAN", understanding.knownAgesPartial);
    const branchContext = resolveDecisionProductContext(branchRequest, authority, branchUnderstanding);
    let assessment = assess(snapshot, branchContext, worldQueryPlan(branchContext), projection, request.rejectedCandidateIds, authority.serverTime, requirements);
    // A branch cannot override a deliberately selected primary intent.
    if (context.primaryIntent !== null && context.primaryIntent !== branch.intent) {
      const explicitCore = intentCoverage(snapshot, context.primaryIntent, requirements);
      if (explicitCore.state !== "CONFIRMED") {
        const { assessmentHash: _hash, ...body } = assessment;
        const incompatible = ["INCOMPATIBLE", "DISPUTED"].includes(explicitCore.state);
        assessment = DecisionProductCandidateAssessmentSchema.parse(withContentHash({ ...body,
          tier: incompatible ? "INELIGIBLE" : "UNCONFIRMED_FALLBACK",
          failedHardConstraints: [...body.failedHardConstraints, ...(incompatible ? ["EXPLICIT_PRIMARY_INTENT"] : [])],
          unknownHardConstraints: [...body.unknownHardConstraints, ...(!incompatible ? ["EXPLICIT_PRIMARY_INTENT"] : [])],
        }, "assessmentHash"));
      }
    }
    const { assessmentHash: _hash, ...body } = assessment;
    const branchConfirmed = assessment.coreIntentCoverage.state === "CONFIRMED" && assessment.tier !== "INELIGIBLE";
    const preferredConfirmed = branch.preferred && branchConfirmed && assessment.tier === "ELIGIBLE_CONFIRMED" && !assessment.unknownHardConstraints.length;
    return DecisionProductCandidateAssessmentSchema.parse(withContentHash({ ...body, reasons: [...body.reasons,
      reason("single-visit-alternative-confirmed", "CONTEXT", contentHash(branch), `Dieser Ort wurde für die Alternative ${branch.intent} mit deren eigenen Bedingungen geprüft.`, branchConfirmed),
      ...(branch.preferred ? [reason("preferred-visit-alternative", "CONTEXT", contentHash(branch), "Dieser Ort erfüllt die ausdrücklich bevorzugte Alternative.", preferredConfirmed)] : []),
    ] }, "assessmentHash"));
  });
  // One spot, one result. Never combine partial evidence from separate branches.
  return assessments.sort((left, right) => compareProductCandidateAssessments(left, right, projection))[0]!;
}

/** Shared deterministic Product assessment for the typed TS reader and the manifest-validated SQL resolver. */
export function evaluateProductWorldViews(requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }, projection: RelevantUserProjection, snapshotsValue: readonly ProductWorldView[], candidateSetHash: string, understanding?: ProductUnderstanding | null): { evaluation: DecisionProductEvaluation; presentations: readonly DecisionProductPresentation[] } {
    const request = DecisionProductRequestSchema.parse(requestValue); const context = resolveDecisionProductContext(request, authority, understanding);
    const queryPlan = worldQueryPlan(context);
    const snapshots = [...snapshotsValue];
    const ids = snapshots.map((item) => item.spot.spotId).sort();
    if (!ids.length || ids.length > 1000 || new Set(ids).size !== ids.length || contentHash(ids) !== candidateSetHash) throw new Error("product_world_candidate_set_invalid");
    const bindings = snapshots.map((row) => ({ spotId: row.spot.spotId, snapshotHash: row.snapshotHash })).sort((a, b) => a.spotId.localeCompare(b.spotId));
    const cohort = DecisionProductWorldCohortSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.cohort, cohortId: `product-world-${candidateSetHash.slice(0, 24)}`, source: "CANONICAL_WORLD_KNOWLEDGE_READER", generatedAt: authority.serverTime, authorizedCity: authority.authorizedCity, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, spotBindings: bindings, candidateSetHash, limitations: snapshots.length === 1 ? ["SINGLE_CANDIDATE"] : [], commercialSignalsPresent: false, fixtureSourceUsed: false }, "cohortHash"));
    const candidates = snapshots.map((row) => understanding?.visitAlternatives?.length ? assessVisitAlternatives(row, request, context, authority, projection, understanding) : assess(row, context, queryPlan, projection, request.rejectedCandidateIds, authority.serverTime, understanding?.requirements)).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const evaluation = DecisionProductEvaluationSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.evaluation, evaluationId: `product-evaluation-${contentHash({ requestId: request.requestId, cohortHash: cohort.cohortHash }).slice(0, 24)}`, createdAt: authority.serverTime, requestHash: contentHash(request), interpretation: context, worldCohort: cohort, userProjectionHash: projection.projectionHash, candidates, limitations: [...new Set([...cohort.limitations, ...context.unresolvedTerms, ...(candidates.every(candidate => candidate.limitations.includes("ESSENTIAL_REQUIREMENT_UNVERIFIED")) ? ["ESSENTIAL_REQUIREMENT_UNVERIFIED"] : [])])].sort(), evaluatorVersion: PRODUCT_V1_EVALUATOR_VERSION, evaluationPolicyHash: DECISION_PRODUCT_EVALUATION_POLICY.policyHash, evaluationReleaseHash: DECISION_PRODUCT_EVALUATION_RELEASE.releaseHash, intentPolicyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash, sourceKind: "CANONICAL_PRODUCT_PORTS", productSemanticsApproved: true, productRankingAuthorized: true, fixtureSourceUsed: false }, "evaluationHash"));
    const presentations = snapshots.map((row) => DecisionProductPresentationSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.presentation, spotId: row.spot.spotId, name: row.spot.identity.name ?? "Unbenannter Ort", locality: row.spot.location.locality, categoryLabel: row.spot.classification.primaryCategory, imageUrl: null, sourceHash: row.snapshotHash }, "presentationHash")));
    return deepFreeze({ evaluation, presentations });
}
