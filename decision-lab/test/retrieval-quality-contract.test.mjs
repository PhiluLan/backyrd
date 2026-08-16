import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { evaluateRetrievalPromotion, oracleCapacity, retrievalContractHashes, retrievalScenarioMetrics, summarizeRetrievalScenarios } from "../src/retrieval-quality-contract.mjs";

const contract = JSON.parse(await readFile(new URL("../config/retrieval-quality-contract-v1.json", import.meta.url), "utf8"));
const ids = (prefix, count, utility) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`${prefix}${index}`, utility]));
const scenario = ({ relevant = 40, candidates = [], irrelevant = 60, latencyMs = 200, resultCount = 10 } = {}) => {
  const truth = { ...ids("r", relevant, 0.8), ...ids("x", irrelevant, 0.2) };
  return { metrics: retrievalScenarioMetrics({ candidateIds: candidates, eligibleUtilityById: truth, relevanceThreshold: 0.6, k: 20 }), latencyMs, resultCount, hardViolation: false };
};

test("Oracle capacity is deterministic and independent of Engine output", () => {
  const truth = { ...ids("r", 40, 0.7), ...ids("x", 10, 0.2) };
  assert.deepEqual(oracleCapacity({ eligibleUtilityById: truth, relevanceThreshold: 0.6, k: 20 }), {
    eligibleCount: 50, relevantCount: 40, relevantIds: Object.keys(truth).slice(0, 40), maximumHitsAtK: 20, maximumRecallAtK: 0.5, evaluable: true,
  });
});

test("capacity-normalized retrieval handles zero, sparse, exact and dense relevance", () => {
  const zero = retrievalScenarioMetrics({ candidateIds: [], eligibleUtilityById: ids("x", 10, 0.2), relevanceThreshold: 0.6, k: 20 });
  assert.equal(zero.topKCapacityCapture, null);
  assert.equal(zero.evaluability, "NOT_EVALUATED_NO_RELEVANT_SPOTS");
  const sparse = retrievalScenarioMetrics({ candidateIds: ["r0", "r1", "r2", "r3"], eligibleUtilityById: ids("r", 5, 0.8), relevanceThreshold: 0.6, k: 20 });
  assert.equal(sparse.topKCapacityCapture, 0.8);
  assert.equal(sparse.topKRecall, 0.8);
  const exact = retrievalScenarioMetrics({ candidateIds: Object.keys(ids("r", 20, 0.8)), eligibleUtilityById: ids("r", 20, 0.8), relevanceThreshold: 0.6, k: 20 });
  assert.equal(exact.topKCapacityCapture, 1);
  const dense = retrievalScenarioMetrics({ candidateIds: Object.keys(ids("r", 16, 0.8)), eligibleUtilityById: ids("r", 40, 0.8), relevanceThreshold: 0.6, k: 20 });
  assert.equal(dense.topKRecall, 0.4);
  assert.equal(dense.topKCapacityCapture, 0.8);
});

test("adversarial quality profiles remain distinguishable and brute force cannot pass efficiency", () => {
  const profiles = {
    perfect: scenario({ candidates: [...Object.keys(ids("r", 40, 0.8)), ...Object.keys(ids("x", 20, 0.2))] }),
    very_good: scenario({ candidates: [...Object.keys(ids("r", 32, 0.8)), ...Object.keys(ids("x", 8, 0.2))] }),
    mediocre: scenario({ candidates: [...Object.keys(ids("r", 10, 0.8)), ...Object.keys(ids("x", 30, 0.2))] }),
    bad: scenario({ candidates: Object.keys(ids("x", 20, 0.2)) }),
    brute_force: scenario({ relevant: 60, irrelevant: 240, candidates: [...Object.keys(ids("r", 60, 0.8)), ...Object.keys(ids("x", 240, 0.2))] }),
    small_high_quality: scenario({ relevant: 10, irrelevant: 90, candidates: Object.keys(ids("r", 8, 0.8)) }),
    full_pool_good_top_k_bad: scenario({ candidates: [...Object.keys(ids("x", 20, 0.2)), ...Object.keys(ids("r", 40, 0.8))] }),
    top_k_good_coverage_bad: scenario({ relevant: 60, candidates: Object.keys(ids("r", 16, 0.8)) }),
    sparse: scenario({ relevant: 5, candidates: Object.keys(ids("r", 4, 0.8)) }),
    dense: scenario({ relevant: 60, candidates: [...Object.keys(ids("r", 16, 0.8)), ...Object.keys(ids("x", 4, 0.2)), ...Object.keys(ids("r", 45, 0.8)).slice(16), ...Object.keys(ids("x", 25, 0.2)).slice(4)] }),
  };
  assert.equal(profiles.perfect.metrics.topKCapacityCapture, 1);
  assert.ok(profiles.very_good.metrics.topKCapacityCapture >= 0.7);
  assert.ok(profiles.mediocre.metrics.topKCapacityCapture < 0.7);
  assert.equal(profiles.bad.metrics.topKCapacityCapture, 0);
  assert.ok(profiles.brute_force.metrics.candidateCount > contract.thresholds.candidatePoolP95Maximum);
  assert.ok(profiles.small_high_quality.metrics.topKCapacityCapture >= 0.7);
  assert.equal(profiles.full_pool_good_top_k_bad.metrics.topKCapacityCapture, 0);
  assert.ok(profiles.full_pool_good_top_k_bad.metrics.fullPoolRecall >= 0.7);
  assert.ok(profiles.top_k_good_coverage_bad.metrics.topKCapacityCapture >= 0.7);
  assert.ok(profiles.top_k_good_coverage_bad.metrics.fullPoolRecall < 0.7);
  assert.equal(profiles.sparse.metrics.topKCapacityCapture, 0.8);
  assert.equal(profiles.dense.metrics.topKCapacityCapture, 0.8);
});

test("multi-metric promotion rejects a brute-force candidate despite perfect recall", () => {
  const makeSummary = (row) => summarizeRetrievalScenarios([row]);
  const goodRow = scenario({ relevant: 20, candidates: Object.keys(ids("r", 16, 0.8)), latencyMs: 200 });
  const bruteRow = scenario({ relevant: 60, irrelevant: 240, candidates: [...Object.keys(ids("r", 60, 0.8)), ...Object.keys(ids("x", 240, 0.2))], latencyMs: 200 });
  const baselineSummary = makeSummary(scenario({ relevant: 20, candidates: Object.keys(ids("r", 12, 0.8)), latencyMs: 200 }));
  const wrap = (overall) => ({ overall, seeds: { a: overall, b: overall, c: overall }, splits: { DEVELOPMENT: overall, REGRESSION: overall, LOCKED_HOLDOUT: overall } });
  const paired = { meanDelta: 0.2, confidenceLowerBound: 0.05 };
  const good = evaluateRetrievalPromotion({ candidate: wrap(makeSummary(goodRow)), baseline: wrap(baselineSummary), thresholds: contract.thresholds, paired, externalCostPerDecisionUsd: 0.001 });
  assert.equal(good.pass, true);
  const brute = evaluateRetrievalPromotion({ candidate: wrap(makeSummary(bruteRow)), baseline: wrap(baselineSummary), thresholds: contract.thresholds, paired, externalCostPerDecisionUsd: 0.001 });
  assert.equal(brute.gates.candidatePoolMean, false);
  assert.equal(brute.pass, false);
});

test("threshold contract is prospective and does not rewrite historical Wave 2.1", () => {
  assert.equal(contract.supersedes.disposition, "SUPERSEDED_FOR_FUTURE_RETRIEVAL_PROMOTION");
  assert.equal(contract.supersedes.historicalVerdictsChanged, false);
  assert.equal(contract.scientificControls.oracleFeedsEngine, false);
  assert.equal(contract.scientificControls.lockedHoldoutThresholdTuning, "PROHIBITED");
  assert.equal(retrievalContractHashes(contract).contractHash, contentHash(contract));
});

test("historical diagnostic is sealed and preserves every historical verdict", async () => {
  const evidence = JSON.parse(await readFile(new URL("../baselines/d4.1-retrieval-quality-contract-v1.json", import.meta.url), "utf8"));
  const { resultHash, ...body } = evidence;
  assert.equal(resultHash, contentHash(body));
  assert.equal(evidence.contractFreezeHash, "6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947");
  assert.deepEqual(evidence.sample, { engines: 4, seeds: 3, scenariosPerSeed: 42, decisions: 504, embeddingMode: "FULL_FIDELITY" });
  assert.equal(evidence.oracleCapacity.meanMaximumRecallAtK, 0.4514809250969429);
  assert.equal(evidence.oracleCapacity.scenariosCapableOfHistoricalPoint65, 31);
  assert.deepEqual(evidence.historicalVerdicts, {
    v13: "UNCHANGED",
    wave1: "UNCHANGED",
    wave2: "FAIL_UNCHANGED",
    wave2_1: "FAIL_UNCHANGED",
    wave2_1Architecture: "NOT_PROMOTED_UNCHANGED",
  });
  assert.equal(evidence.scientificValidity.status, "PASS");
  assert.equal(evidence.scientificValidity.thresholdsFrozenBeforeHistoricalRun, true);
  assert.match(evidence.scientificValidity.thresholdFreezeCommit, /^2ec40c4/);
  assert.equal(evidence.scientificValidity.oracleFeedsEngine, false);
  assert.equal(evidence.scientificValidity.engineMutation, "NONE");
  assert.equal(evidence.scientificValidity.productionAccess, "NONE");
  for (const result of Object.values(evidence.diagnosticPromotion)) assert.equal(result.pass, false);
});
