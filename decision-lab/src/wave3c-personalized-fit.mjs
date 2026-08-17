import { contentHash } from "./canonical-json.mjs";
import { buildUserTasteMap, projectCurrentTaste, validateTasteEngineScientificBoundary } from "./taste-engine.mjs";
import { validateTreatment } from "./personalization-treatment.mjs";

export const PERSONALIZED_FIT_VERSION = "backyrd-personalized-fit-v1";

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const unique = (values) => [...new Set(values.filter(Boolean))];
const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const moodConcept = Object.freeze({
  cozy: "vibe.cozy", quiet: "vibe.quiet", lively: "vibe.lively", romantic: "vibe.romantic",
  urban: "vibe.urban", inspiring: "vibe.inspiring", chic: "vibe.elegant", elegant: "vibe.elegant",
  playful: "vibe.playful", relaxed: "vibe.relaxed", social: "vibe.social", authentic: "vibe.authentic",
});
const actionEvent = Object.freeze({
  decision_impression: "decision_shown", open: "spot_opened", like: "liked", dislike: "disliked",
  save: "saved", was_here: "verified_visit",
});
const maturityStrength = Object.freeze({ cold: 0, onboarding: 0.2, sparse: 0.35, developing: 0.6, mature: 0.85, power: 1 });

function priceConcept(level) {
  const value = Number(level);
  if (!Number.isFinite(value)) return null;
  return value <= 2 ? "price.budget" : value >= 4 ? "price.premium" : "price.balanced_price";
}

export function spotTasteConcepts(spot) {
  if (!spot?.observed) throw new Error("observed_spot_intelligence_required");
  const text = normalize(`${spot.observed.name ?? ""} ${spot.observed.description ?? ""}`);
  const concepts = [
    `place_type.${spot.category ?? "other"}`,
    priceConcept(spot.observed.priceLevel),
    ...(spot.observed.moods ?? []).map((mood) => moodConcept[normalize(mood)]),
  ];
  if (/famil|kind|kids/.test(text)) concepts.push("social_style.family_friendly");
  if (/design|stilvoll|elegant|chic/.test(text)) concepts.push("character.design_led");
  if (/authent|lokal|local/.test(text)) concepts.push("character.authentic_character");
  if (/ruhig|quiet|gesprach|conversation/.test(text)) concepts.push("social_style.conversation_friendly");
  return unique(concepts);
}

function contextKeys(context) {
  const audience = ["solo", "date", "friends", "family", "work"].includes(context?.audience) ? `audience.${context.audience}` : null;
  const time = ["morning", "afternoon", "evening"].includes(context?.timeBucket) ? `time.${context.timeBucket}` : null;
  const calendar = Number(context?.weekday) === 0 || Number(context?.weekday) === 6 ? "time.weekend" : "time.weekday";
  return unique([audience, time, calendar]);
}

export function currentContextConcepts(context) {
  const byAudience = {
    solo: ["social_style.solo_friendly", "vibe.quiet"],
    date: ["social_style.romantic_friendly", "social_style.conversation_friendly", "vibe.romantic"],
    friends: ["social_style.group_friendly", "vibe.social", "vibe.lively"],
    family: ["social_style.family_friendly", "vibe.relaxed", "energy.calm"],
    work: ["occasion.work_friendly", "social_style.conversation_friendly"],
  };
  const byTime = {
    morning: ["occasion.morning_friendly", "energy.calm"],
    afternoon: ["occasion.afternoon_friendly", "vibe.relaxed"],
    evening: ["occasion.evening_friendly"],
    night: ["energy.energetic", "vibe.lively"],
  };
  return unique([...(byAudience[context?.audience] ?? []), ...(byTime[context?.timeBucket] ?? [])]);
}

export function explicitIntentConcepts(request) {
  const query = normalize(`${request?.query ?? ""} ${request?.rawFreeText ?? ""}`);
  const concepts = [];
  const aliases = {
    "vibe.cozy": ["cozy", "cosy", "gemutlich", "gemuetlich"],
    "vibe.quiet": ["quiet", "ruhig", "leise"],
    "vibe.lively": ["lively", "lebhaft", "laut"],
    "vibe.social": ["social", "gesellig"],
    "vibe.romantic": ["romantic", "romantisch", "date"],
    "vibe.inspiring": ["inspiring", "inspirierend", "ungewohnlich", "besonders"],
    "vibe.elegant": ["elegant", "schick", "chic", "stilvoll"],
    "vibe.relaxed": ["relaxed", "entspannt", "unkompliziert"],
    "price.budget": ["nicht teuer", "budget", "gunstig", "preiswert"],
  };
  for (const [concept, terms] of Object.entries(aliases)) if (terms.some((term) => query.includes(term))) concepts.push({ concept, direction: 1 });
  for (const category of request?.preferredPlaceTypes ?? []) concepts.push({ concept: `place_type.${category}`, direction: 1 });
  return [...new Map(concepts.map((row) => [row.concept, row])).values()];
}

function treatmentEvents(world, bundle, arm) {
  const validation = validateTreatment(bundle);
  if (!validation.pass) throw new Error("invalid_personalization_treatment");
  const plan = bundle.enginePlans[arm];
  const sourceUserId = bundle.evaluationOnly.sameLatentTruthReference;
  const actualRows = world.interactions
    .filter((row) => row.userId === sourceUserId && Object.hasOwn(actionEvent, row.type))
    .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
  const events = [];
  for (const row of plan.history) {
    const eventType = actionEvent[row.observedEventType];
    const spot = world.spots.find((candidate) => candidate.id === row.spotId);
    if (!eventType || !spot) continue;
    const actual = arm === "ACTUAL" ? actualRows[row.sequence] : null;
    const context = actual ? world.contexts.find((candidate) => candidate.id === actual.contextId) : null;
    events.push({
      id: `${plan.user.id}:${arm}:${row.sequence}`, userId: plan.user.id, eventType,
      concepts: eventType === "decision_shown" ? [] : spotTasteConcepts(spot), consent: "granted",
      occurredAt: new Date(Date.UTC(2026, 7, 10 + Number(row.occurredDay ?? 0), 12)).toISOString(),
      placeType: spot.category, contexts: contextKeys(context), spotId: spot.id,
      sessionId: actual ? `${plan.user.id}:${actual.contextId}:${actual.day}` : `${plan.user.id}:${arm}:${Math.floor(row.sequence / 2)}`,
    });
  }
  for (const [index, spotId] of (plan.onboarding?.args?.spotIds ?? []).entries()) {
    const spot = world.spots.find((candidate) => candidate.id === spotId);
    if (!spot) continue;
    events.push({ id: `${plan.user.id}:onboarding:${index}`, userId: plan.user.id, eventType: "onboarding_preference", concepts: spotTasteConcepts(spot), consent: "granted", occurredAt: "2025-12-01T12:00:00.000Z", placeType: spot.category, contexts: [], spotId: spot.id, sessionId: `${plan.user.id}:onboarding` });
  }
  if (!validateTasteEngineScientificBoundary(events)) throw new Error("treatment_events_cross_scientific_boundary");
  return events;
}

export function materializeTreatmentTaste(world, bundle, arm, { asOf = "2026-08-10T12:00:00.000Z" } = {}) {
  return buildUserTasteMap(treatmentEvents(world, bundle, arm), { asOf });
}

function fitFromRows(concepts, rows, missingScore = 0.5) {
  const matching = rows.filter((row) => concepts.includes(row.concept));
  if (!matching.length) return { score: missingScore, matched: [], raw: 0 };
  const denominator = matching.reduce((sum, row) => sum + Math.max(0.05, row.confidence), 0);
  const raw = matching.reduce((sum, row) => sum + row.affinity * Math.max(0.05, row.confidence), 0) / denominator;
  return { score: clamp(0.5 + raw / 2), raw, matched: matching.map((row) => ({ concept: row.concept, affinity: row.affinity, confidence: row.confidence, authority: row.authority, evidence: row.evidence })) };
}

function genericFit(concepts, expected) {
  if (!expected.length) return 0.5;
  return expected.filter((concept) => concepts.includes(concept)).length / expected.length;
}

export function rankWithPersonalizedFit({ candidateIds, spots, tasteMap, request, context, maturity, limit = 10 }) {
  if (!Array.isArray(candidateIds) || new Set(candidateIds).size !== candidateIds.length) throw new Error("deduplicated_candidate_pool_required");
  const spotById = new Map(spots.map((spot) => [spot.id, spot]));
  const candidates = candidateIds.map((id, index) => {
    const spot = spotById.get(id);
    if (!spot) throw new Error(`candidate_not_resolved:${id}`);
    if (spot.observed.status !== "approved") throw new Error(`product_ineligible_candidate:${id}`);
    if (["quarantined", "excluded"].includes(spot.observed.distribution)) throw new Error(`distribution_ineligible_candidate:${id}`);
    return { spot, baseRank: index + 1, concepts: spotTasteConcepts(spot) };
  });
  const intent = explicitIntentConcepts(request);
  const contexts = contextKeys(context);
  const contextConcepts = currentContextConcepts(context);
  const projections = new Map();
  const historyRows = tasteMap.rows.filter((row) => row.scope.kind === "GLOBAL");
  const mapConfidence = historyRows.length ? historyRows.reduce((sum, row) => sum + row.confidence, 0) / historyRows.length : 0;
  const personalWeight = 0.22 * (maturityStrength[maturity] ?? 0.5) * mapConfidence;
  const baseWeight = 0.35 - personalWeight;
  for (const placeType of unique(candidates.map(({ spot }) => spot.category))) projections.set(placeType, projectCurrentTaste(tasteMap, { placeType, contexts, explicitIntent: intent }));
  const ranked = candidates.map(({ spot, baseRank, concepts }) => {
    const projection = projections.get(spot.category);
    const intentRows = projection.rows.filter((row) => row.authority === "EXPLICIT_CURRENT_INTENT");
    const history = fitFromRows(concepts, projection.rows.filter((row) => row.authority === "HISTORY"));
    const intentFit = fitFromRows(concepts, intentRows, intentRows.length ? 0 : 0.5);
    const contextFit = genericFit(concepts, contextConcepts);
    const baseRelevance = candidateIds.length <= 1 ? 1 : 1 - (baseRank - 1) / (candidateIds.length - 1);
    const score = baseWeight * baseRelevance + 0.40 * intentFit.score + 0.25 * contextFit + personalWeight * history.score;
    return {
      spotId: spot.id, score: Number(score.toFixed(9)), baseRank, concepts,
      evidence: { baseRelevance, intentFit, contextFit, personalizedFit: history, mapConfidence, personalWeight, maturity, contexts, contextConcepts, projectionHash: projection.projectionHash },
    };
  }).sort((left, right) => right.score - left.score || left.baseRank - right.baseRank || left.spotId.localeCompare(right.spotId));
  const results = ranked.map((row, index) => ({ ...row, personalizedRank: index + 1, included: index < limit }));
  const recorder = {
    version: "decision-flight-recorder-wave3c-v1", fitVersion: PERSONALIZED_FIT_VERSION,
    candidateCount: candidateIds.length, inputCandidateIds: candidateIds, outputCandidateIds: results.slice(0, limit).map((row) => row.spotId),
    authorityOrder: ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "USER_HARD_CONSTRAINTS", "EXPLICIT_CURRENT_INTENT", "CURRENT_CONTEXT", "CONFIDENCE_WEIGHTED_TASTE"],
    candidates: results,
  };
  return { results: results.slice(0, limit), allCandidates: results, recorder: { ...recorder, recorderHash: contentHash(recorder) } };
}

export function personalizedFitManifest() {
  const body = {
    version: PERSONALIZED_FIT_VERSION,
    runtimeInputs: ["structured_intent", "current_context", "user_taste_map", "place_type_taste", "contextual_taste", "taste_confidence", "eligible_candidate_spot_intelligence"],
    prohibitedInputs: ["latent_truth", "evaluation_utility", "golden_scenario_labels", "future_outcomes"],
    eligibilityAuthority: "OUTSIDE_AND_IMMUTABLE",
    retrievalMutation: "NONE",
    unknownPolicy: "NEUTRAL",
    finalUtilityModel: "NOT_IMPLEMENTED",
  };
  return { ...body, manifestHash: contentHash(body) };
}
