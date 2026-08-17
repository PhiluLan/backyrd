import { contentHash } from "./canonical-json.mjs";
import { buildUserTasteMap, projectCurrentTaste, validateTasteEngineScientificBoundary } from "./taste-engine.mjs";
import { validateTreatment } from "./personalization-treatment.mjs";

export const PERSONALIZED_FIT_VERSION = "backyrd-personalized-fit-v1.2";

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const unique = (values) => [...new Set(values.filter(Boolean))];
const normalize = (value) => String(value ?? "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

const MOOD_CONCEPT = Object.freeze({
  cozy: "vibe.cozy", quiet: "vibe.quiet", lively: "vibe.lively", romantic: "vibe.romantic",
  urban: "vibe.urban", inspiring: "vibe.inspiring", elegant: "vibe.elegant", playful: "vibe.playful",
  relaxed: "vibe.relaxed", social: "vibe.social", authentic: "vibe.authentic",
});

const ACTION_EVENT = Object.freeze({
  decision_impression: "decision_shown", open: "spot_opened", like: "liked", dislike: "disliked",
  save: "saved", was_here: "verified_visit",
});

const MATURITY_STRENGTH = Object.freeze({
  cold: 0,
  onboarding: 0.2,
  sparse: 0.35,
  developing: 0.6,
  mature: 0.82,
  power: 0.9,
});

const PERSONALIZATION_BUDGET = Object.freeze({
  max: 0.20,
});

function priceConcept(level) {
  const value = Number(level);
  if (!Number.isFinite(value)) return null;
  return value <= 2 ? "price.budget" : value >= 4 ? "price.premium" : "price.balanced_price";
}

function ensureConcept(value) {
  return value ? `vibe.${value}` : null;
}

export function spotTasteConcepts(spot) {
  if (!spot?.observed) throw new Error("observed_spot_intelligence_required");
  const text = normalize(`${spot.observed.name ?? ""} ${spot.observed.description ?? ""}`);
  const base = [
    `place_type.${spot.category ?? "other"}`,
    priceConcept(spot.observed.priceLevel),
    ...((spot.observed.moods ?? []).map((mood) => MOOD_CONCEPT[normalize(mood)]).filter(Boolean)),
  ];
  const inferred = [];
  if (/famil|kind|kids?/.test(text)) inferred.push("social_style.family_friendly");
  if (/design|stilvoll|elegant|chic/.test(text)) inferred.push("character.design_led");
  if (/authent|lokal|local/.test(text)) inferred.push("character.authentic_character");
  if (/ruhig|quiet|gesprach|conversation/.test(text)) inferred.push("social_style.conversation_friendly");
  if (/drinks/.test(text)) inferred.push("vibe.social");
  if (/outdoor|terrasse|garten/.test(text)) inferred.push("environment.outdoor");
  if (/indoor/.test(text)) inferred.push("environment.indoor");
  const aliases = ["cozy", "gemuetlich", "gemütlich", "gemütlichkeit", "chillig"].find((term) => text.includes(term)) ? [ensureConcept("cozy")] : [];
  return unique([...base, ...inferred, ...aliases]);
}

function contextKeys(context) {
  const audience = ["solo", "date", "friends", "family", "work"].includes(context?.audience)
    ? `audience.${context.audience}`
    : null;
  const time = ["morning", "afternoon", "evening"].includes(context?.timeBucket)
    ? `time.${context.timeBucket}`
    : null;
  const calendar = Number(context?.weekday) === 0 || Number(context?.weekday) === 6 ? "time.weekend" : "time.weekday";
  return unique([audience, time, calendar]);
}

export function currentContextConcepts(context) {
  const byAudience = {
    solo: ["social_style.solo_friendly", "vibe.quiet", "energy.calm"],
    date: ["social_style.romantic_friendly", "social_style.conversation_friendly", "vibe.romantic"],
    friends: ["social_style.group_friendly", "vibe.social", "vibe.lively"],
    family: ["social_style.family_friendly", "vibe.relaxed", "energy.calm", "price.budget"],
    work: ["occasion.work_friendly", "social_style.conversation_friendly"],
  };
  const byTime = {
    morning: ["occasion.morning_friendly", "energy.calm"],
    afternoon: ["occasion.afternoon_friendly", "vibe.relaxed"],
    evening: ["occasion.evening_friendly", "vibe.cozy"],
    night: ["energy.energetic", "vibe.lively"],
  };
  const explicitMoods = Object.entries(context?.moods ?? {})
    .filter(([, strength]) => Number(strength) >= 0.75)
    .map(([mood]) => MOOD_CONCEPT[normalize(mood)])
    .filter(Boolean);
  return unique([...(byAudience[context?.audience] ?? []), ...(byTime[context?.timeBucket] ?? []), ...explicitMoods]);
}

export function explicitIntentConcepts(request) {
  const query = normalize(`${request?.query ?? ""} ${request?.rawFreeText ?? ""}`);
  const results = [];
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
    "price.premium": ["premium", "hochwertig", "teuer"],
    "discovery.hidden_gem": ["secret", "geheim", "abseits"],
  };
  for (const [concept, terms] of Object.entries(aliases)) if (terms.some((term) => query.includes(term))) results.push({ concept, direction: 1, source: "query" });
  for (const category of request?.preferredPlaceTypes ?? []) results.push({ concept: `place_type.${category}`, direction: 1, source: "query" });
  return [...new Map(results.map((row) => [row.concept, row])).values()];
}

function parseToneFromRawRequest(request) {
  const query = normalize(`${request?.query ?? ""} ${request?.rawFreeText ?? ""}`);
  if (/nur\s+cozy|nur\s+ruhig/.test(query)) return ["vibe.quiet", "vibe.cozy"];
  if (/hauptsächlich|lieber/.test(query)) return [];
  return [];
}

function fitFromRows(concepts, rows, missingScore = 0.5) {
  if (!rows.length) return { score: missingScore, raw: 0, matched: [] };
  const matching = rows.filter((row) => concepts.includes(row.concept));
  if (!matching.length) return { score: 0, raw: -1, matched: [] };
  const weights = matching.map((row) => Math.max(0.05, row.confidence));
  const normalizer = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const raw = matching.reduce((sum, row, index) => sum + weights[index] * row.affinity, 0) / normalizer;
  const score = clamp(0.5 + (raw / 2));
  return { score, raw, matched: matching.map((row) => ({ concept: row.concept, affinity: row.affinity, confidence: row.confidence, authority: row.authority, evidence: row.evidence })) };
}

function getRowContributionsByScope(row, placeType) {
  const contributions = { CONTEXT: 0, PLACE_TYPE: 0, GLOBAL: 0 };
  const traces = [];
  for (const evidence of row.evidence ?? []) {
    if (evidence.scope.kind === "CONTEXT") {
      contributions.CONTEXT = Math.max(contributions.CONTEXT, Math.abs(evidence.affinity * evidence.confidence));
      traces.push({ kind: "CONTEXT", scope: evidence.scope.key, confidence: evidence.confidence, affinity: evidence.affinity });
    }
    if (evidence.scope.kind === "PLACE_TYPE") {
      if (evidence.scope.key === placeType) contributions.PLACE_TYPE = Math.max(contributions.PLACE_TYPE, Math.abs(evidence.affinity * evidence.confidence));
      traces.push({ kind: "PLACE_TYPE", scope: evidence.scope.key, confidence: evidence.confidence, affinity: evidence.affinity });
    }
    if (evidence.scope.kind === "GLOBAL") {
      contributions.GLOBAL = Math.max(contributions.GLOBAL, Math.abs(evidence.affinity * evidence.confidence));
      traces.push({ kind: "GLOBAL", scope: "global", confidence: evidence.confidence, affinity: evidence.affinity });
    }
  }
  return { contributions, traces };
}

function scopeSummary(evidence, kind) {
  const rows = evidence.filter((item) => item.scope?.kind === kind);
  if (!rows.length) return null;
  const denominator = rows.reduce((sum, row) => sum + row.confidence, 0) || 1;
  return {
    affinity: rows.reduce((sum, row) => sum + row.affinity * row.confidence, 0) / denominator,
    confidence: clamp(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length),
  };
}

function hierarchicalTasteSignal(row) {
  const contextual = scopeSummary(row.evidence ?? [], "CONTEXT");
  const placeType = scopeSummary(row.evidence ?? [], "PLACE_TYPE");
  const global = scopeSummary(row.evidence ?? [], "GLOBAL");
  const fallback = placeType ?? global ?? { affinity: row.historyAffinity, confidence: row.confidence };
  if (!contextual) return fallback;
  const contextualAuthority = contextual.confidence ** 2;
  return {
    affinity: contextualAuthority * contextual.affinity + (1 - contextualAuthority) * fallback.affinity,
    confidence: clamp(contextualAuthority * contextual.confidence + (1 - contextualAuthority) * fallback.confidence),
  };
}

function resolveHistoryProjectionRows(projection, placeType) {
  const byConcept = new Map();
  for (const row of projection.rows) {
    if (row.authority !== "HISTORY") continue;
    const { contributions, traces } = getRowContributionsByScope(row, placeType);
    byConcept.set(row.concept, { row, contributions, traces });
  }
  return byConcept;
}

function treatmentEvents(world, bundle, arm) {
  const validation = validateTreatment(bundle);
  if (!validation.pass) throw new Error("invalid_personalization_treatment");
  const plan = bundle.enginePlans[arm];
  const sourceUserId = bundle.evaluationOnly.sameLatentTruthReference;
  const actualRows = world.interactions
    .filter((row) => row.userId === sourceUserId && Object.hasOwn(ACTION_EVENT, row.type))
    .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
  const events = [];
  for (const row of plan.history) {
    const eventType = ACTION_EVENT[row.observedEventType];
    const spot = world.spots.find((candidate) => candidate.id === row.spotId);
    if (!eventType || !spot) continue;
    const actual = arm === "ACTUAL" ? actualRows[row.sequence] : null;
    const context = actual ? world.contexts.find((candidate) => candidate.id === actual.contextId) : null;
    events.push({
      id: `${plan.user.id}:${arm}:${row.sequence}`,
      userId: plan.user.id,
      eventType,
      concepts: eventType === "decision_shown" ? [] : spotTasteConcepts(spot),
      consent: "granted",
      occurredAt: new Date(Date.UTC(2026, 7, 10 + Number(row.occurredDay ?? 0), 12)).toISOString(),
      placeType: spot.category,
      contexts: contextKeys(context),
      spotId: spot.id,
      sessionId: actual ? `${plan.user.id}:${actual.contextId}:${actual.day}` : `${plan.user.id}:${arm}:${Math.floor(row.sequence / 2)}`,
    });
  }
  for (const [index, spotId] of (plan.onboarding?.args?.spotIds ?? []).entries()) {
    const spot = world.spots.find((candidate) => candidate.id === spotId);
    if (!spot) continue;
    events.push({
      id: `${plan.user.id}:onboarding:${index}`,
      userId: plan.user.id,
      eventType: "onboarding_preference",
      concepts: spotTasteConcepts(spot),
      consent: "granted",
      occurredAt: "2025-12-01T12:00:00.000Z",
      placeType: spot.category,
      contexts: [],
      spotId: spot.id,
      sessionId: `${plan.user.id}:onboarding`,
    });
  }
  if (!validateTasteEngineScientificBoundary(events)) throw new Error("treatment_events_cross_scientific_boundary");
  return events;
}

export function materializeTreatmentTaste(world, bundle, arm, { asOf = "2026-08-10T12:00:00.000Z" } = {}) {
  return buildUserTasteMap(treatmentEvents(world, bundle, arm), { asOf });
}

export function personalizedContextRelevance(concepts, intentRows, contextRows, placeTypeRows) {
  const relevant = new Set();
  for (const row of [...intentRows, ...contextRows, ...placeTypeRows]) {
    if (concepts.includes(row.concept)) relevant.add(row.concept);
  }
  return [...relevant];
}

function genericFit(concepts, expected) {
  if (!expected.length) return 0.5;
  return expected.filter((concept) => concepts.includes(concept)).length / expected.length;
}

export function rankWithPersonalizedFit({ candidateIds, spots, tasteMap, request, context, maturity, limit = 10 }) {
  if (!Array.isArray(candidateIds) || new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("deduplicated_candidate_pool_required");
  }
  const candidatesById = new Map(spots.map((spot) => [spot.id, spot]));
  const candidates = candidateIds.map((id, index) => {
    const spot = candidatesById.get(id);
    if (!spot) throw new Error(`candidate_not_resolved:${id}`);
    if (spot.observed.status !== "approved") throw new Error(`product_ineligible_candidate:${id}`);
    if (["quarantined", "excluded"].includes(spot.observed.distribution)) throw new Error(`distribution_ineligible_candidate:${id}`);
    return { spot, baseRank: index + 1, concepts: spotTasteConcepts(spot) };
  });

  const intent = explicitIntentConcepts(request);
  const contexts = contextKeys(context);
  const contextConcepts = unique([...(currentContextConcepts(context)), ...parseToneFromRawRequest(request)]);

  const candidatePlaceTypes = unique(candidates.map(({ spot }) => spot.category));
  const projections = new Map();
  for (const placeType of candidatePlaceTypes) {
    projections.set(placeType, projectCurrentTaste(tasteMap, { placeType, contexts, explicitIntent: intent }));
  }

  const mapHistoryRows = tasteMap.rows;
  const globalRows = mapHistoryRows.filter((row) => row.scope.kind === "GLOBAL");
  const mapConfidence = globalRows.length
    ? globalRows.reduce((sum, row) => sum + row.confidence, 0) / globalRows.length
    : 0;

  const maturityFactor = MATURITY_STRENGTH[maturity] ?? 0.3;
  const personalizationBudget = PERSONALIZATION_BUDGET.max * maturityFactor * mapConfidence;
  const baseWeight = 0.35 - personalizationBudget;
  const intentWeight = 0.40;
  const contextFitWeight = 0.25;

  const ranked = candidates.map(({ spot, baseRank, concepts }) => {
    const projection = projections.get(spot.category);
    const intentRows = projection.rows.filter((row) => row.authority === "EXPLICIT_CURRENT_INTENT");
    const historyRowsByConcept = resolveHistoryProjectionRows(projection, spot.category);

    const relevantConcepts = unique([
      ...intent.map(({ concept }) => concept),
      ...contextConcepts,
      `place_type.${spot.category}`,
    ]).filter((concept) => historyRowsByConcept.has(concept) && concepts.includes(concept));

    const intentFit = fitFromRows(concepts, intentRows, 0.5);
    const contextFit = genericFit(concepts, contextConcepts);

    let historySignal = 0;
    let relevanceTotal = 0;
    const matched = [];
    const intentConcepts = new Set(intent.map((row) => row.concept));
    for (const concept of relevantConcepts) {
      const entry = historyRowsByConcept.get(concept);
      if (!entry) continue;
      const relevance = intentConcepts.has(concept) ? 1 : contextConcepts.includes(concept) ? 0.9 : 0.65;
      const hierarchical = hierarchicalTasteSignal(entry.row);
      const authoritySafeAffinity = intentConcepts.has(concept) ? Math.max(0, hierarchical.affinity) : hierarchical.affinity;
      historySignal += authoritySafeAffinity * hierarchical.confidence * relevance;
      relevanceTotal += hierarchical.confidence * relevance;
      matched.push({ concept, affinity: hierarchical.affinity, confidence: hierarchical.confidence, authority: "HISTORY", evidence: entry.row.evidence, scopeContribution: entry.contributions });
    }
    const signedHistory = relevanceTotal > 0 ? clamp(historySignal / relevanceTotal, -1, 1) : 0;
    const historyMatch = 0.5 + signedHistory / 2;
    const historyConfidence = matched.length
      ? matched.reduce((sum, item) => sum + item.confidence, 0) / matched.length
      : 0;

    // Keep strong fit for explicit intent, but avoid overpowering base eligibility.
    const baseRelevance = candidates.length <= 1 ? 1 : 1 - (baseRank - 1) / (candidates.length - 1);
    const score =
      baseWeight * baseRelevance
      + intentWeight * intentFit.score
      + contextFitWeight * contextFit
      + personalizationBudget * historyMatch;

    return {
      spotId: spot.id,
      score: Number(score.toFixed(9)),
      baseRank,
      concepts,
      evidence: {
        baseRelevance,
        intentFit,
        contextFit,
        personalizedFit: {
          score: historyMatch,
          matched,
          mapConfidence,
          confidence: historyConfidence,
          relevantDimensionCount: relevantConcepts.length,
          matchedDimensionCount: matched.length,
          scopeDominance: matched.some((row) => row.evidence.some((item) => item.scope?.kind === "CONTEXT"))
            ? "CURRENT_CONTEXT"
            : matched.some((row) => row.evidence.some((item) => item.scope?.kind === "PLACE_TYPE"))
              ? "PLACE_TYPE"
              : "GLOBAL",
        },
        personalWeight: personalizationBudget,
        mapConfidence,
        maturity,
        contexts,
        contextConcepts,
        projectionHash: projection.projectionHash,
        historyRowsByScopeCount: {
          context: projection.rows.filter((row) => row.evidence.some((item) => item.scope?.kind === "CONTEXT")).length,
          placeType: projection.rows.filter((row) => row.evidence.some((item) => item.scope?.kind === "PLACE_TYPE")).length,
          global: projection.rows.filter((row) => row.evidence.some((item) => item.scope?.kind === "GLOBAL")).length,
        },
      },
    };
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.baseRank - right.baseRank || left.spotId.localeCompare(right.spotId);
  });

  const results = ranked.map((row, index) => ({ ...row, personalizedRank: index + 1, included: index < limit }));
  const authorityOrder = [
    "PRODUCT_ELIGIBILITY",
    "DISTRIBUTION_ELIGIBILITY",
    "USER_HARD_CONSTRAINTS",
    "EXPLICIT_CURRENT_INTENT",
    "CURRENT_CONTEXT",
    "CONFIDENCE_WEIGHTED_TASTE",
  ];
  const recorder = {
    version: "decision-flight-recorder-wave3c-v1",
    fitVersion: PERSONALIZED_FIT_VERSION,
    candidateCount: candidateIds.length,
    inputCandidateIds: candidateIds,
    outputCandidateIds: results.slice(0, limit).map((row) => row.spotId),
    authorityOrder,
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
