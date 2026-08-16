import { contentHash } from "./canonical-json.mjs";

export const RETRIEVAL_QUALITY_CONTRACT_VERSION = "retrieval-quality-contract-v1";
export const ORACLE_CAPACITY_DEFINITION = Object.freeze({
  version: "retrieval-oracle-capacity-v1",
  eligibleUniverse: "groundTruth keys after Product, Distribution and declared hard constraints",
  relevant: "finite utility >= configured relevance threshold",
  maximumHitsAtK: "min(k, eligibleRelevantCount)",
  maximumRecallAtK: "eligibleRelevantCount === 0 ? null : maximumHitsAtK / eligibleRelevantCount",
  engineDependency: "NONE",
  engineInputUse: "PROHIBITED",
});

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
};

const unique = (values) => [...new Set(values)];
const mean = (values) => {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
};
const quantile = (values, p) => {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null;
};

export function oracleCapacity({ eligibleUtilityById, relevanceThreshold, k }) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("k must be a positive integer");
  finite(relevanceThreshold, "relevanceThreshold");
  const entries = Object.entries(eligibleUtilityById ?? {});
  entries.forEach(([, utility]) => finite(utility, "eligible utility"));
  const relevantIds = entries.filter(([, utility]) => utility >= relevanceThreshold).map(([id]) => id);
  const maximumHitsAtK = Math.min(k, relevantIds.length);
  return {
    eligibleCount: entries.length,
    relevantCount: relevantIds.length,
    relevantIds,
    maximumHitsAtK,
    maximumRecallAtK: relevantIds.length ? maximumHitsAtK / relevantIds.length : null,
    evaluable: relevantIds.length > 0,
  };
}

export function retrievalScenarioMetrics({ candidateIds, eligibleUtilityById, relevanceThreshold, k }) {
  const candidates = unique(candidateIds ?? []);
  const oracle = oracleCapacity({ eligibleUtilityById, relevanceThreshold, k });
  const topK = candidates.slice(0, k);
  const relevant = new Set(oracle.relevantIds);
  const hitsAtK = topK.filter((id) => relevant.has(id)).length;
  const fullPoolHits = candidates.filter((id) => relevant.has(id)).length;
  const topKRecall = oracle.relevantCount ? hitsAtK / oracle.relevantCount : null;
  const topKCapacityCapture = oracle.maximumHitsAtK ? hitsAtK / oracle.maximumHitsAtK : null;
  const equivalentCapacityCapture = topKRecall === null ? null : topKRecall / oracle.maximumRecallAtK;
  if (topKCapacityCapture !== null && Math.abs(topKCapacityCapture - equivalentCapacityCapture) > 1e-12) throw new Error("Capacity-normalized definitions diverged");
  const utilities = Object.values(eligibleUtilityById ?? {});
  const bestUtility = utilities.length ? Math.max(...utilities) : null;
  const bestIds = bestUtility === null ? [] : Object.entries(eligibleUtilityById).filter(([, utility]) => utility === bestUtility).map(([id]) => id);
  return {
    oracle,
    candidateCount: candidates.length,
    duplicateCount: (candidateIds ?? []).length - candidates.length,
    hitsAtK,
    topKRecall,
    topKCapacityCapture,
    fullPoolRecall: oracle.relevantCount ? fullPoolHits / oracle.relevantCount : null,
    bestAvailableRetrieved: bestIds.length ? bestIds.some((id) => candidates.includes(id)) : null,
    bestAvailableIds: bestIds,
    evaluability: oracle.evaluable ? "EVALUATED" : "NOT_EVALUATED_NO_RELEVANT_SPOTS",
  };
}

export function summarizeRetrievalScenarios(rows) {
  if (!rows.length) throw new Error("At least one scenario is required");
  const evaluated = rows.filter((row) => row.metrics.topKCapacityCapture !== null);
  const bestEvaluated = rows.filter((row) => row.metrics.bestAvailableRetrieved !== null);
  return {
    scenarios: rows.length,
    evaluableScenarios: evaluated.length,
    notEvaluatedScenarios: rows.length - evaluated.length,
    topKCapacityCapture: mean(evaluated.map((row) => row.metrics.topKCapacityCapture)),
    topKRecall: mean(evaluated.map((row) => row.metrics.topKRecall)),
    fullPoolRecall: mean(evaluated.map((row) => row.metrics.fullPoolRecall)),
    bestAvailableRetrievalRate: mean(bestEvaluated.map((row) => Number(row.metrics.bestAvailableRetrieved))),
    candidatePool: {
      mean: mean(rows.map((row) => row.metrics.candidateCount)),
      p95: quantile(rows.map((row) => row.metrics.candidateCount), 0.95),
      max: quantile(rows.map((row) => row.metrics.candidateCount), 1),
    },
    latencyMs: {
      p95: quantile(rows.map((row) => row.latencyMs), 0.95),
    },
    noResultRate: mean(rows.map((row) => Number(row.resultCount === 0))),
    starvationRate: mean(rows.map((row) => Number(row.resultCount < 10))),
    hardViolations: rows.reduce((sum, row) => sum + Number(row.hardViolation === true), 0),
    duplicateCandidates: rows.reduce((sum, row) => sum + row.metrics.duplicateCount, 0),
  };
}

const minimum = (object, field) => {
  const values = Object.values(object ?? {}).map((value) => value[field]).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
};

export function evaluateRetrievalPromotion({ candidate, baseline, thresholds, paired = null, externalCostPerDecisionUsd }) {
  const required = [candidate, baseline, thresholds];
  if (required.some((value) => !value)) throw new Error("Candidate, baseline and thresholds are required");
  const gates = {
    capacityCaptureOverall: candidate.overall.topKCapacityCapture >= thresholds.topKCapacityCaptureOverallMinimum,
    capacityCaptureEverySeed: minimum(candidate.seeds, "topKCapacityCapture") >= thresholds.topKCapacityCaptureEverySeedMinimum,
    capacityCaptureEverySplit: minimum(candidate.splits, "topKCapacityCapture") >= thresholds.topKCapacityCaptureEverySplitMinimum,
    bestAvailableOverall: candidate.overall.bestAvailableRetrievalRate >= thresholds.bestAvailableRetrievalOverallMinimum,
    bestAvailableEverySplit: minimum(candidate.splits, "bestAvailableRetrievalRate") >= thresholds.bestAvailableRetrievalEverySplitMinimum,
    fullPoolRecallOverall: candidate.overall.fullPoolRecall >= thresholds.fullPoolRecallOverallMinimum,
    fullPoolRecallEverySplit: minimum(candidate.splits, "fullPoolRecall") >= thresholds.fullPoolRecallEverySplitMinimum,
    pairedLift: paired !== null && paired.meanDelta >= thresholds.pairedCapacityCaptureLiftMinimum && paired.confidenceLowerBound > thresholds.pairedConfidenceLowerBoundMinimum,
    everySeedImproves: Object.keys(candidate.seeds).every((seed) => candidate.seeds[seed].topKCapacityCapture > baseline.seeds[seed].topKCapacityCapture),
    lockedHoldoutNonRegression: candidate.splits.LOCKED_HOLDOUT.topKCapacityCapture >= baseline.splits.LOCKED_HOLDOUT.topKCapacityCapture - thresholds.softMetricRegressionBudget,
    fullPoolNonRegression: candidate.overall.fullPoolRecall >= baseline.overall.fullPoolRecall - thresholds.softMetricRegressionBudget,
    bestAvailableNonRegression: candidate.overall.bestAvailableRetrievalRate >= baseline.overall.bestAvailableRetrievalRate - thresholds.softMetricRegressionBudget,
    candidatePoolMean: candidate.overall.candidatePool.mean <= thresholds.candidatePoolMeanMaximum,
    candidatePoolP95: candidate.overall.candidatePool.p95 <= thresholds.candidatePoolP95Maximum,
    latency: candidate.overall.latencyMs.p95 <= thresholds.fullFidelityLabLatencyP95MillisecondsMaximum,
    cost: externalCostPerDecisionUsd <= thresholds.externalCostPerDecisionUsdMaximum,
    noResult: candidate.overall.noResultRate <= thresholds.noResultRateMaximum && candidate.overall.noResultRate <= baseline.overall.noResultRate + thresholds.softMetricRegressionBudget,
    starvation: candidate.overall.starvationRate <= thresholds.candidateStarvationRateMaximum && candidate.overall.starvationRate <= baseline.overall.starvationRate + thresholds.softMetricRegressionBudget,
    hardIntegrity: candidate.overall.hardViolations <= thresholds.hardViolationMaximum,
    duplicateIntegrity: candidate.overall.duplicateCandidates === 0,
    evaluable: candidate.overall.evaluableScenarios > 0,
  };
  return { gates, pass: Object.values(gates).every(Boolean), verdict: Object.values(gates).every(Boolean) ? "PROMOTE" : "REJECT" };
}

export function retrievalContractDefinitions(contract) {
  return {
    contractVersion: contract.version,
    oracleCapacityDefinition: ORACLE_CAPACITY_DEFINITION,
    promotionGateDefinition: {
      promotionK: contract.promotionK,
      diagnosticKs: contract.diagnosticKs,
      thresholds: contract.thresholds,
      aggregation: contract.aggregation,
      robustness: contract.robustness,
    },
  };
}

export function retrievalContractHashes(contract) {
  const definitions = retrievalContractDefinitions(contract);
  return {
    contractHash: contentHash(contract),
    oracleCapacityDefinitionHash: contentHash(definitions.oracleCapacityDefinition),
    promotionGateDefinitionHash: contentHash(definitions.promotionGateDefinition),
  };
}
