import { contentHash } from "./canonical-json.mjs";
import { observedCandidates } from "./wave2.1-retrieval-next-gen.mjs";
import { specializedRecallSources } from "./wave2.3-retrieval-rebuild.mjs";

export const RETRIEVAL_EVIDENCE_VERSION = "retrieval-evidence-v2";
export const RETRIEVAL_SHORTLISTING_VERSION = "retrieval-shortlisting-v2";

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const unique = (values) => [...new Set(values.filter(Boolean))];

const SOURCE_FAMILY = Object.freeze({
  personalized_v12: "personalized_retrieval",
  semantic_v13: "semantic",
  structured_category_v1: "structured",
  category_entity_v1: "structured",
  price_attribute_v1: "structured",
  lexical_v1: "lexical",
  lexical_entity_v2: "lexical",
  vibe_review_v1: "vibe",
  availability_v1: "availability",
  observed_quality_v1: "observed_quality",
  distribution_fallback: "fallback",
});

const SOURCE_RELIABILITY = Object.freeze({
  personalized_v12: 0.82,
  semantic_v13: 0.42,
  structured_category_v1: 0.64,
  category_entity_v1: 0.72,
  price_attribute_v1: 0.58,
  lexical_v1: 0.48,
  lexical_entity_v2: 0.68,
  vibe_review_v1: 0.74,
  availability_v1: 0.72,
  observed_quality_v1: 0.76,
  distribution_fallback: 0.08,
});

function tieSafeCalibration(evidenceRows) {
  const groups = new Map();
  for (const row of evidenceRows) {
    const key = `${row.source}:${row.projection}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const calibrated = [];
  for (const rows of groups.values()) {
    const distinctScores = unique(rows.map((row) => Number(row.source_score)).filter(Number.isFinite)).sort((a, b) => a - b);
    const scoreIndex = new Map(distinctScores.map((score, index) => [score, index]));
    for (const row of rows) {
      const score = Number(row.source_score);
      const calibratedScore = Number.isFinite(score) && distinctScores.length > 1
        ? scoreIndex.get(score) / (distinctScores.length - 1)
        : 0.5;
      calibrated.push({
        ...row,
        source_family: SOURCE_FAMILY[row.source] ?? "other",
        source_reliability: SOURCE_RELIABILITY[row.source] ?? 0.3,
        calibrated_score_v2: calibratedScore,
        score_distinct_values: distinctScores.length,
        score_is_tied: distinctScores.length <= 1 || rows.filter((candidate) => Number(candidate.source_score) === score).length > 1,
      });
    }
  }
  return calibrated;
}

function evidenceValue(evidence) {
  const exact = evidence.evidence?.includes("exact_name") ? 1 : 0;
  const directed = evidence.evidence?.some((item) => /^(category|mood|price_fit|term):/.test(item)) ? 1 : 0;
  const base = evidence.calibrated_score_v2;
  const confidence = exact ? 1 : directed ? Math.max(0.72, base) : base;
  return clamp(confidence * evidence.source_reliability);
}

function evidenceModel(row) {
  const familyValues = new Map();
  const sourceValues = new Map();
  for (const evidence of row.evidence) {
    const value = evidenceValue(evidence);
    sourceValues.set(evidence.source, Math.max(sourceValues.get(evidence.source) ?? 0, value));
    familyValues.set(evidence.source_family, Math.max(familyValues.get(evidence.source_family) ?? 0, value));
  }
  const openEvidence = row.evidence.find((evidence) => evidence.source === "availability_v1")?.evidence?.[0];
  const availability = openEvidence === "open:true" ? 1 : openEvidence === "open:unknown" ? 0.4 : 0;
  const quality = familyValues.get("observed_quality") ?? 0;
  const independentFamilies = ["personalized_retrieval", "semantic", "structured", "lexical", "vibe"]
    .filter((family) => (familyValues.get(family) ?? 0) > 0);
  const corroboration = clamp(Math.max(0, independentFamilies.length - 1) / 3);
  const directed = Math.max(familyValues.get("structured") ?? 0, familyValues.get("lexical") ?? 0, familyValues.get("vibe") ?? 0);
  return {
    availability,
    observed_quality: quality,
    personalized_retrieval: familyValues.get("personalized_retrieval") ?? 0,
    structured: familyValues.get("structured") ?? 0,
    lexical: familyValues.get("lexical") ?? 0,
    vibe: familyValues.get("vibe") ?? 0,
    semantic: familyValues.get("semantic") ?? 0,
    directed,
    corroboration,
    independent_family_count: independentFamilies.length,
    source_count: sourceValues.size,
    tied_source_count: row.evidence.filter((evidence) => evidence.score_is_tied).length,
  };
}

const MODEL = Object.freeze({
  availability: 0.23,
  observed_quality: 0.29,
  personalized_retrieval: 0.13,
  structured: 0.09,
  lexical: 0.05,
  vibe: 0.09,
  semantic: 0.035,
  corroboration: 0.085,
});

function modelScore(model, { corroboration = true } = {}) {
  return Object.entries(MODEL).reduce((score, [key, weight]) => score + weight * (key === "corroboration" && !corroboration ? 0 : model[key]), 0);
}

function unionEvidence({ projectionRuns, specializedSources, allowedCandidateIds }) {
  const evidenceRows = projectionRuns.flatMap((run) => observedCandidates(run.observed, run.projection.id));
  evidenceRows.push(...specializedSources.flat());
  const bySpot = new Map();
  for (const evidence of tieSafeCalibration(evidenceRows)) {
    if (!allowedCandidateIds.has(evidence.spot_id)) continue;
    const row = bySpot.get(evidence.spot_id) ?? { spot_id: evidence.spot_id, evidence: [] };
    row.evidence.push(evidence);
    bySpot.set(evidence.spot_id, row);
  }
  return [...bySpot.values()];
}

function shortlist(rows, { budget, shortlistK, corroboration, priorRanks }) {
  const scored = rows.map((row) => {
    const model = evidenceModel(row);
    return {
      ...row,
      evidence_model: model,
      retrieval_score: Number(modelScore(model, { corroboration }).toFixed(9)),
      pre_shortlist_rank: priorRanks.get(row.spot_id) ?? null,
    };
  }).sort((a, b) => b.retrieval_score - a.retrieval_score
    || b.evidence_model.directed - a.evidence_model.directed
    || b.evidence_model.independent_family_count - a.evidence_model.independent_family_count
    || a.spot_id.localeCompare(b.spot_id));
  return scored.slice(0, budget).map((row, index) => ({
    ...row,
    union_rank: index + 1,
    post_shortlist_rank: index + 1,
    shortlist: index < shortlistK,
    top20_decision: index < shortlistK ? "INCLUDED" : "EXCLUDED_SCORE_BELOW_CUTOFF",
  }));
}

export function retrievalShortlistingExperiments({ projectionRuns, catalogResult, request, structuredIntent, observedSpotSignals, wave23Candidates = [], budget = 80, shortlistK = 20 }) {
  const specializedSources = specializedRecallSources({ catalogResult, request, structuredIntent, observedSpotSignals });
  const allowedCandidateIds = new Set(wave23Candidates.map((candidate) => candidate.spot_id));
  const rows = unionEvidence({ projectionRuns, specializedSources, allowedCandidateIds });
  if (rows.length !== allowedCandidateIds.size) throw new Error("Wave 2.4 evidence must cover the complete Wave 2.3 candidate union");
  const priorRanks = new Map(wave23Candidates.map((candidate, index) => [candidate.spot_id, candidate.union_rank ?? index + 1]));
  return {
    H0_WAVE2_3: wave23Candidates,
    H1_TIE_SAFE_CALIBRATION: shortlist(rows, { budget, shortlistK, corroboration: false, priorRanks }),
    H2_FAMILY_CORROBORATION: shortlist(rows, { budget, shortlistK, corroboration: true, priorRanks }),
  };
}

export function orderingMissReason(candidate) {
  if (!candidate) return "COVERAGE_MISS";
  const model = candidate.evidence_model ?? evidenceModel({ evidence: candidate.evidence ?? [] });
  if (model.independent_family_count === 0) return "EVIDENCE_MISSING_IN_SHORTLIST";
  if (model.tied_source_count >= Math.max(1, model.source_count - 1)) return "SOURCE_SCORE_TIE_CALIBRATION";
  if (model.independent_family_count >= 3) return "MULTI_SOURCE_EVIDENCE_UNDERESTIMATED";
  if (model.structured >= 0.45) return "STRUCTURED_EVIDENCE_UNDERESTIMATED";
  if (model.semantic >= 0.3 && model.directed < 0.3) return "SEMANTIC_EVIDENCE_ONLY";
  return "SOURCE_ORDERING_OTHER";
}

export function retrievalShortlistingManifest() {
  const body = {
    evidenceVersion: RETRIEVAL_EVIDENCE_VERSION,
    shortlistVersion: RETRIEVAL_SHORTLISTING_VERSION,
    promotionK: 20,
    candidateBudget: 80,
    sourceFamilies: SOURCE_FAMILY,
    sourceReliability: SOURCE_RELIABILITY,
    modelWeights: MODEL,
    rejectedMechanisms: ["family_corroboration_bonus", "fixed_source_quotas", "semantic_score_as_utility", "latent_or_evaluator_features", "locked_holdout_calibration"],
    latentTruthUse: "EVALUATION_ONLY",
    runtimeInputs: ["wave2.3_candidate_evidence", "structured_intent", "eligible_spot_intelligence", "reviews", "product_actions"],
    prohibitedInputs: ["latent_user_truth", "latent_spot_truth", "ground_truth_utility", "evaluator_labels", "locked_holdout_labels"],
  };
  return { ...body, hash: contentHash(body) };
}
