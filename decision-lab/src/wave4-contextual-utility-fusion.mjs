import { contentHash } from "./canonical-json.mjs";
import {
  currentContextConcepts,
  explicitIntentConcepts,
  rankWithPersonalizedFit,
  spotTasteConcepts,
} from "./wave3c-personalized-fit.mjs";

export const UTILITY_CONTRACT_VERSION = "backyrd-contextual-utility-contract-v1";
export const FUSION_VERSION = "backyrd-deterministic-hybrid-fusion-v1";

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mean = (values, fallback = 0) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;

function observedSpotConfidence(spot) {
  const observed = spot.observed ?? {};
  const fields = [spot.category, observed.name, observed.description, observed.priceLevel, observed.city];
  const fieldCoverage = fields.filter((value) => value !== null && value !== undefined && value !== "").length / fields.length;
  const moodCoverage = Array.isArray(observed.moods) && observed.moods.length ? 1 : 0;
  return clamp(0.75 * fieldCoverage + 0.25 * moodCoverage);
}

function overlapFit(candidateConcepts, expectedConcepts) {
  if (!expectedConcepts.length) return { score: 0.5, matched: [], expected: [] };
  const matched = expectedConcepts.filter((concept) => candidateConcepts.includes(concept));
  return { score: matched.length / expectedConcepts.length, matched, expected: expectedConcepts };
}

function calibratedRetrievalEvidence(baseRank, poolSize) {
  if (poolSize <= 1) return 1;
  // Rank is comparable across retrieval sources after the canonical union; raw source
  // scores are deliberately excluded because their scales have different meanings.
  return clamp(1 - Math.log1p(baseRank - 1) / Math.log1p(poolSize - 1));
}

function fusionWeights({ hasExplicitIntent, hasContextEvidence }) {
  if (hasExplicitIntent) return { request: 0.48, context: hasContextEvidence ? 0.24 : 0.12, retrieval: hasContextEvidence ? 0.18 : 0.30, spot: 0.10 };
  return { request: 0, context: hasContextEvidence ? 0.42 : 0, retrieval: hasContextEvidence ? 0.43 : 0.78, spot: hasContextEvidence ? 0.15 : 0.22 };
}

export function utilityContractManifest() {
  const body = {
    version: UTILITY_CONTRACT_VERSION,
    fusionVersion: FUSION_VERSION,
    authorityOrder: ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "USER_HARD_CONSTRAINTS", "EXPLICIT_CURRENT_INTENT", "CONTEXTUAL_UTILITY"],
    dimensions: {
      requestFit: { range: [0, 1], missing: "NEUTRAL_0.5", meaning: "Observed Spot evidence matching explicit current Intent", confidence: "EXPLICIT_INTENT_COVERAGE" },
      contextFit: { range: [0, 1], missing: "NEUTRAL_0.5", meaning: "Observed Spot evidence matching current audience/time/mood", confidence: "OBSERVED_CONTEXT_EVIDENCE" },
      personalizedFit: { range: [0, 1], missing: "NEUTRAL_0.5", meaning: "Wave-3C.1 decomposed confidence-aware Taste evidence", confidence: "MATCHED_TASTE_CONFIDENCE" },
      candidateEvidence: { range: [0, 1], missing: "FAIL_CLOSED", meaning: "Calibrated canonical retrieval-union rank; no raw cross-source score addition", confidence: "CANONICAL_UNION_POSITION" },
      spotEvidence: { range: [0, 1], missing: "UNKNOWN_NOT_NEGATIVE", meaning: "Observed Spot Intelligence sufficiency", confidence: "FIELD_COVERAGE" },
    },
    interactions: {
      authority: "Personalization cannot redefine explicit Intent or eligibility",
      personalizationBudget: { maximumAbsoluteUtilityDelta: 0.08, confidenceAndRelevanceBounded: true },
      doubleCounting: "Request, Context, Retrieval and Taste evidence retain separate component identities",
    },
    runtimeInputs: ["eligible_candidate_ids", "structured_intent", "current_context", "observed_spot_intelligence", "retrieval_union_rank", "wave3c1_personalized_fit_evidence"],
    prohibitedInputs: ["latent_truth", "evaluation_utility", "golden_scenario_labels", "locked_holdout_outcomes", "future_outcomes"],
    retrievalMutation: "NONE",
    tasteEngineMutation: "NONE",
    unknownPolicy: "NEUTRAL",
  };
  return { ...body, manifestHash: contentHash(body) };
}

export function rankWithContextualUtility({ candidateIds, spots, tasteMap, request, context, maturity, limit = 10 }) {
  const personalized = rankWithPersonalizedFit({ candidateIds, spots, tasteMap, request, context, maturity, limit: candidateIds.length });
  const spotById = new Map(spots.map((spot) => [spot.id, spot]));
  const explicit = explicitIntentConcepts(request).map((row) => row.concept);
  const contextConcepts = currentContextConcepts(context);
  const weights = fusionWeights({ hasExplicitIntent: explicit.length > 0, hasContextEvidence: contextConcepts.length > 0 });

  const candidates = personalized.allCandidates.map((personalizedCandidate) => {
    const spot = spotById.get(personalizedCandidate.spotId);
    if (!spot) throw new Error(`candidate_not_resolved:${personalizedCandidate.spotId}`);
    const concepts = spotTasteConcepts(spot);
    const requestFit = overlapFit(concepts, explicit);
    const contextFit = overlapFit(concepts, contextConcepts);
    const retrievalEvidence = calibratedRetrievalEvidence(personalizedCandidate.baseRank, candidateIds.length);
    const spotConfidence = observedSpotConfidence(spot);
    const personal = personalizedCandidate.evidence.personalizedFit;
    const relevance = mean([
      ...personal.matched.map((row) => explicit.includes(row.concept) ? 1 : contextConcepts.includes(row.concept) ? 0.8 : 0.45),
    ], 0);
    const personalConfidence = clamp(personal.confidence * personal.mapConfidence * relevance);
    const personalDelta = clamp((personal.score - 0.5) * 2 * personalConfidence * 0.08, -0.08, 0.08);
    const baseUtility =
      weights.request * requestFit.score
      + weights.context * contextFit.score
      + weights.retrieval * retrievalEvidence
      + weights.spot * spotConfidence;
    const finalUtility = clamp(baseUtility + personalDelta);
    const evidenceSufficiency = clamp(mean([
      spotConfidence,
      explicit.length ? requestFit.matched.length / explicit.length : 1,
      contextConcepts.length ? contextFit.matched.length / contextConcepts.length : 1,
      personal.matched.length ? personalConfidence : 0.5,
    ]));
    return {
      spotId: spot.id,
      baseRank: personalizedCandidate.baseRank,
      preUtilityRank: personalizedCandidate.personalizedRank,
      finalUtility: Number(finalUtility.toFixed(9)),
      utilityConfidence: Number(evidenceSufficiency.toFixed(9)),
      concepts,
      components: {
        requestFit,
        contextFit,
        personalizedFit: { score: personal.score, confidence: personalConfidence, rawConfidence: personal.confidence, mapConfidence: personal.mapConfidence, relevantEvidence: personal.matched },
        retrievalEvidence: { score: retrievalEvidence, unionRank: personalizedCandidate.baseRank, rawSourceScoresConsumed: false },
        spotEvidence: { score: spotConfidence, unknownIsNegative: false },
      },
      fusion: { version: FUSION_VERSION, weights, baseUtility, personalizationDelta: personalDelta },
    };
  }).sort((left, right) => right.finalUtility - left.finalUtility || left.baseRank - right.baseRank || left.spotId.localeCompare(right.spotId));

  const ranked = candidates.map((row, index) => ({ ...row, finalRank: index + 1, included: index < limit }));
  const recorder = {
    version: "decision-flight-recorder-wave4-v1",
    utilityContractVersion: UTILITY_CONTRACT_VERSION,
    fusionVersion: FUSION_VERSION,
    candidateCount: candidateIds.length,
    inputCandidateIds: candidateIds,
    outputCandidateIds: ranked.slice(0, limit).map((row) => row.spotId),
    eligibility: "UPSTREAM_AUTHORITATIVE",
    retrievalMutation: "NONE",
    candidates: ranked,
  };
  return { results: ranked.slice(0, limit), allCandidates: ranked, recorder: { ...recorder, recorderHash: contentHash(recorder) } };
}
