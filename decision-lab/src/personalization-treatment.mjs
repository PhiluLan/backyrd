import { contentHash } from "./canonical-json.mjs";
import { CATEGORIES, MOODS } from "./model.mjs";
import { deterministicUuid } from "./random.mjs";

export const TREATMENT_ARMS = Object.freeze(["ACTUAL", "NEUTRAL", "OPPOSING"]);
export const PERSONALIZATION_COMPONENTS = Object.freeze([
  { component: "taste_concepts", source: "user_taste_events_v2 -> user_taste_concepts_v2", included: true, materialization: "backyrd_log_taste_event_v3" },
  { component: "taste_confidence", source: "user_taste_concepts_v2", included: true, materialization: "backyrd_log_taste_event_v3" },
  { component: "v12_user_feature_weights", source: "backyrd_ml_events_v1 -> backyrd_user_feature_weights_v1", included: true, materialization: "backyrd_ml_log_event_v1" },
  { component: "place_type_profile", source: "backyrd_ml_events_v1 -> user_place_type_preferences_v1", included: true, materialization: "canonical ML-event trigger" },
  { component: "contextual_taste", source: "backyrd_ml_events_v1 -> backyrd_user_context_feature_preferences_v1", included: true, materialization: "canonical ML-event trigger" },
  { component: "recent_decision_memory", source: "backyrd_ml_events_v1 within 48 hours", included: true, materialization: "same canonical ML event stream", decomposition: "report separately and cross-check in Remix/Memory arm" },
  { component: "onboarding_preferences", source: "complete_decision_onboarding_v1", included: true, materialization: "canonical onboarding RPC" },
  { component: "historical_decision_events", source: "decision_sessions/actions/impressions", included: true, materialization: "canonical Decision logging calls where the source action has a Decision contract" },
  { component: "ml_events", source: "backyrd_ml_events_v1", included: true, materialization: "backyrd_ml_log_event_v1" },
  { component: "product_actions", source: "Mobile action contract", included: true, materialization: "the same ML, legacy Taste and Decision-action calls used by Mobile" },
  { component: "derived_user_state", source: "canonical functions and triggers", included: true, materialization: "never written directly by the treatment generator" },
  { component: "profile_city_locale_auth", source: "authenticated account/profile", included: false, materialization: "copied identically to all arms", reason: "non-personal treatment control" }
]);

const informative = new Set(["open", "like", "dislike", "save", "was_here"]);
const legacyType = Object.freeze({ open: "tapped", like: "exact_mood", dislike: "not_there", save: "saved", was_here: "was_here" });
const mlType = Object.freeze({ decision_impression: "decision_impression", open: "decision_open", like: "decision_like", dislike: "decision_dislike", save: "favorite_add", was_here: "spot_detail_view" });
const historyCount = Object.freeze({ cold: 0, onboarding: 3, sparse: 4, developing: 8, mature: 16, power: 24 });
const forbiddenEngineKeys = /(^|_)(latent|ground_truth|true_preference|utility|oracle)($|_)/i;

function assertWorldUser(world, userId) {
  const user = world.users.find((item) => item.id === userId);
  if (!user) throw new Error(`Treatment user missing: ${userId}`);
  return user;
}

function armUser(source, worldId, arm) {
  return {
    id: deterministicUuid(`${worldId}:${source.id}:personalization-treatment`, arm),
    authenticated: true,
    city: source.observed.city,
    locale: source.observed.locale,
    actualMaturityCohort: source.maturity,
    treatmentArm: arm
  };
}

function recipe(event, index, source = "observed_world_history") {
  const occurredDay = event.day ?? -(90 + index);
  const calls = [{ rpc: "backyrd_ml_log_event_v1", args: { eventType: mlType[event.type], spotId: event.spotId, rank: event.rank ?? null, city: "Synthetic Basel", occurredDay, context: { source: "decision_lab_personalization_treatment", sourceKind: source, sequence: index } } }];
  if (legacyType[event.type]) calls.push({ rpc: "backyrd_log_taste_event_v3", args: { spotId: event.spotId, eventType: legacyType[event.type] } });
  return { sequence: index, observedEventType: event.type, spotId: event.spotId, occurredDay, calls };
}

function actualHistory(world, source) {
  const rows = world.interactions.filter((event) => event.userId === source.id && (event.type === "decision_impression" || informative.has(event.type))).sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  return rows.map((event, index) => recipe(event, index));
}

function opposingDirections(source) {
  const categories = [...CATEGORIES].sort((a, b) => source.latent.category[a] - source.latent.category[b] || a.localeCompare(b));
  const moods = [...MOODS].sort((a, b) => source.latent.mood[a] - source.latent.mood[b] || a.localeCompare(b));
  return { lowCategories: categories.slice(0, 2), highCategories: categories.slice(-2), lowMoods: moods.slice(0, 2), highMoods: moods.slice(-2) };
}

function scoreObservableOpposition(spot, directions) {
  const lowCategory = directions.lowCategories.includes(spot.category) ? 4 : 0;
  const highCategory = directions.highCategories.includes(spot.category) ? -4 : 0;
  const lowMood = spot.observed.moods.filter((mood) => directions.lowMoods.includes(mood)).length;
  const highMood = spot.observed.moods.filter((mood) => directions.highMoods.includes(mood)).length;
  return lowCategory + lowMood - highCategory - highMood;
}

function opposingHistory(world, source) {
  const count = historyCount[source.maturity] ?? 8;
  if (count === 0) return { events: [], directions: opposingDirections(source) };
  const directions = opposingDirections(source);
  const eligible = world.spots.filter((spot) => spot.observed.status === "approved" && !["quarantined", "excluded"].includes(spot.observed.distribution));
  const positive = [...eligible].sort((a, b) => scoreObservableOpposition(b, directions) - scoreObservableOpposition(a, directions) || a.id.localeCompare(b.id));
  const negative = [...eligible].sort((a, b) => scoreObservableOpposition(a, directions) - scoreObservableOpposition(b, directions) || a.id.localeCompare(b.id));
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const isPositive = index % 4 !== 3;
    const spot = (isPositive ? positive : negative)[index % eligible.length];
    events.push(recipe({ type: isPositive ? "like" : "dislike", spotId: spot.id, rank: index + 1, day: -(120 - index * 4) }, index, "controlled_opposing_history"));
  }
  return { events, directions };
}

function onboardingPlan(world, source, arm, directions = null) {
  if (source.maturity === "cold" || arm === "NEUTRAL") return null;
  const observedSelectionIds = Array.isArray(source.observed.onboardingSpotIds) ? source.observed.onboardingSpotIds : [];
  if (observedSelectionIds.length < 3) return null;
  const eligible = world.spots.filter((spot) => spot.observed.status === "approved" && !["quarantined", "excluded"].includes(spot.observed.distribution));
  const selected = arm === "OPPOSING"
    ? [...eligible].sort((a, b) => scoreObservableOpposition(b, directions) - scoreObservableOpposition(a, directions) || a.id.localeCompare(b.id)).slice(0, 3)
    : observedSelectionIds.map((id) => eligible.find((spot) => spot.id === id)).filter(Boolean).slice(0, 8);
  if (selected.length < 3) return null;
  return { rpc: "complete_decision_onboarding_v1", args: { city: source.observed.city, spotIds: selected.map((spot) => spot.id) } };
}

function enginePlan(user, history, onboarding) {
  return { user, authenticationMode: "authenticated", onboarding, history, historicalClockPolicy: "PRESERVE_OCCURRED_DAY_IN_ISOLATED_EVENT_MATERIALIZATION", derivedStatePolicy: "CANONICAL_FUNCTIONS_AND_TRIGGERS_ONLY", directDerivedWrites: false };
}

export function assertEnginePlanIsLatentFree(plan) {
  const visit = (value, path = []) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, [...path, index]));
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenEngineKeys.test(key)) throw new Error(`Latent field in engine plan: ${[...path, key].join(".")}`);
      visit(child, [...path, key]);
    }
  };
  visit(plan);
  return plan;
}

export function buildPersonalizationTreatment(world, { userId, scenarioId = "treatment-contract-fixture", currentRequest = {}, currentContext = {} }) {
  const source = assertWorldUser(world, userId);
  const actualUser = armUser(source, world.manifest.worldId, "ACTUAL");
  const neutralUser = armUser(source, world.manifest.worldId, "NEUTRAL");
  const opposingUser = armUser(source, world.manifest.worldId, "OPPOSING");
  const actualEvents = actualHistory(world, source);
  const opposing = opposingHistory(world, source);
  const enginePlans = {
    ACTUAL: enginePlan(actualUser, actualEvents, onboardingPlan(world, source, "ACTUAL")),
    NEUTRAL: enginePlan(neutralUser, [], null),
    OPPOSING: enginePlan(opposingUser, opposing.events, onboardingPlan(world, source, "OPPOSING", opposing.directions))
  };
  assertEnginePlanIsLatentFree(enginePlans);
  const controls = {
    sourceUserId: source.id,
    worldId: world.manifest.worldId,
    worldHash: world.manifest.worldHash,
    worldSeed: world.manifest.seed,
    scenarioId,
    currentRequest,
    currentContext,
    spotUniverseHash: contentHash(world.spots.map((spot) => spot.id).sort()),
    engineSourceHash: world.manifest.engineSourceHash,
    groundTruthUserId: source.id,
    semanticRetrieval: "UNCHANGED",
    productEligibility: "UNCHANGED",
    distribution: "UNCHANGED"
  };
  const evaluationOnly = {
    sameLatentTruthReference: source.id,
    latentTruthHash: contentHash(source.latent),
    opposingDirection: opposing.directions,
    actualMaturityCohort: source.maturity,
    groundTruthRule: "Always evaluate all arms with the source user's unchanged latent truth"
  };
  const result = { contractVersion: "personalization-treatment-v1", generatorVersion: "personalization-treatment-generator-v1", controls, enginePlans, evaluationOnly };
  result.treatmentHash = contentHash(result);
  return result;
}

export function validateTreatment(bundle) {
  const plans = bundle.enginePlans;
  const ids = TREATMENT_ARMS.map((arm) => plans[arm]?.user.id);
  const sameControls = Boolean(bundle.controls.currentRequest && bundle.controls.currentContext && bundle.controls.worldHash && bundle.controls.spotUniverseHash);
  const actualCalls = plans.ACTUAL.history.flatMap((row) => row.calls);
  const opposingCalls = plans.OPPOSING.history.flatMap((row) => row.calls);
  const checks = {
    identityControl: ids.every(Boolean) && new Set(ids).size === 3 && Boolean(bundle.evaluationOnly.sameLatentTruthReference && bundle.evaluationOnly.latentTruthHash),
    contextControl: sameControls && Boolean(bundle.controls.currentRequest && bundle.controls.currentContext),
    worldControl: Boolean(bundle.controls.worldHash && bundle.controls.worldSeed && bundle.controls.spotUniverseHash),
    engineControl: Boolean(bundle.controls.engineSourceHash) && bundle.controls.semanticRetrieval === "UNCHANGED",
    neutrality: plans.NEUTRAL.history.length === 0 && plans.NEUTRAL.onboarding === null,
    opposingDirection: plans.OPPOSING.history.length === 0 || (bundle.evaluationOnly.opposingDirection.lowCategories.length > 0 && opposingCalls.some((call) => call.rpc === "backyrd_ml_log_event_v1")),
    internalConsistency: [...actualCalls, ...opposingCalls].every((call) => ["backyrd_ml_log_event_v1", "backyrd_log_taste_event_v3", "backyrd_log_decision_action_v1"].includes(call.rpc)) && TREATMENT_ARMS.every((arm) => arm === "NEUTRAL" || plans[arm].derivedStatePolicy === "CANONICAL_FUNCTIONS_AND_TRIGGERS_ONLY") && TREATMENT_ARMS.every((arm) => plans[arm].directDerivedWrites === false),
    noLatentLeakage: (() => { try { assertEnginePlanIsLatentFree(plans); return true; } catch { return false; } })(),
    reproducibilityIdentity: contentHash(Object.fromEntries(Object.entries(bundle).filter(([key]) => key !== "treatmentHash"))) === bundle.treatmentHash,
    candidateAttribution: TREATMENT_ARMS.every((arm) => Array.isArray(plans[arm].history)) && bundle.controls.productEligibility === "UNCHANGED" && bundle.controls.distribution === "UNCHANGED",
    anonymousPathProhibited: TREATMENT_ARMS.every((arm) => plans[arm].authenticationMode === "authenticated"),
    noWeightManipulation: !/weightOverride|rankingWeight|scoreOverride/i.test(JSON.stringify(plans))
  };
  return { pass: Object.values(checks).every(Boolean), checks, validationHash: contentHash({ contractVersion: bundle.contractVersion, checks }) };
}
