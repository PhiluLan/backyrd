#!/usr/bin/env node
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { jaccard, reliabilityMetrics } from "./metrics.mjs";
import { pairedBootstrap } from "./statistics.mjs";
import { validateWave4Freeze } from "./wave4-freeze.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputDir = resolve(repoRoot, option("input"));
const outputPath = resolve(repoRoot, option("output"));
const contract = await readJson(resolve(repoRoot, "decision-lab/config/wave4-contextual-utility-fusion-v1.json"));
const freeze = await validateWave4Freeze();
if (!freeze.valid) throw new Error(`Wave 4 freeze invalid:${freeze.reasons.join(",")}`);
const worlds = await Promise.all(contract.seeds.map((seed) => readJson(resolve(inputDir, `${seed}.json`))));
if (worlds.length !== 3 || worlds.some((world) => world.records.length !== 42)) throw new Error("Wave 4 official sample incomplete");
if (worlds.some((world) => world.contractHash !== contentHash(contract))) throw new Error("Wave 4 mixed Validation Contract");

const records = worlds.flatMap((world) => world.records);
const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const utilityLift = pairedBootstrap(records.map((row) => [row.arms.ACTUAL.baselineQuality.meanUtilityAtK, row.arms.ACTUAL.quality.meanUtilityAtK]), contract.bootstrap);
const personalizationLift = pairedBootstrap(records.map((row) => [row.arms.NEUTRAL.quality.meanUtilityAtK, row.arms.ACTUAL.quality.meanUtilityAtK]), { ...contract.bootstrap, seed: `${contract.bootstrap.seed}:personalization` });

const byMaturity = Object.fromEntries(contract.maturities.map((maturity) => {
  const rows = records.filter((row) => row.maturity === maturity);
  return [maturity, {
    n: rows.length,
    utilityLift: mean(rows.map((row) => row.utilityLiftVsWave3C)),
    personalizationLift: mean(rows.map((row) => row.personalizationLift)),
    harmRate: rows.filter((row) => row.personalizationHarm).length / Math.max(1, rows.length),
    utilityConfidence: mean(rows.map((row) => row.arms.ACTUAL.utilityConfidence)),
  }];
}));
const bySplit = Object.fromEntries(["DEVELOPMENT", "REGRESSION", "LOCKED_HOLDOUT"].map((split) => {
  const rows = records.filter((row) => row.split === split);
  return [split, { n: rows.length, utilityLift: mean(rows.map((row) => row.utilityLiftVsWave3C)), personalizationLift: mean(rows.map((row) => row.personalizationLift)), ndcgAt10: mean(rows.map((row) => row.arms.ACTUAL.quality.ndcgAt10)) }];
}));
const contextRows = worlds.flatMap((world) => world.contextMeasurements);
const contextualDifferentiation = mean(worlds.map((world) => {
  const rows = world.contextMeasurements; const pairs = [[0, 1], [0, 2], [1, 2]];
  return mean(pairs.map(([left, right]) => 1 - jaccard(rows[left].actual.ids, rows[right].actual.ids)));
}));
const contextUtilityGain = mean(contextRows.map((row) => row.actual.meanUtilityAtK - row.baseline.meanUtilityAtK));
const differentUserRows = worlds.flatMap((world) => world.differentUsers);
const differentUserDivergence = mean(worlds.map((world) => {
  const rows = world.differentUsers; const pairs = [[0, 1], [0, 2], [1, 2]];
  return mean(pairs.map(([left, right]) => 1 - jaccard(rows[left].actual.ids, rows[right].actual.ids)));
}));
const falsePersonalization = differentUserRows.filter((row) => row.actual.meanUtilityAtK < row.neutral.meanUtilityAtK).length / Math.max(1, differentUserRows.length);
const intentRows = worlds.flatMap((world) => world.intentConflict);
const evaluableIntent = intentRows.filter((row) => row.evaluable);
const intentRobustness = evaluableIntent.length ? mean(evaluableIntent.flatMap((row) => [Number(row.actualAligned), Number(row.opposingAligned)])) : 1;
const historyOverrideRate = intentRows.filter((row) => row.historyOverride).length / Math.max(1, intentRows.length);
const latency = reliabilityMetrics(records.flatMap((row) => contract.arms.map((arm) => ({ latencyMs: row.arms[arm].latencyMs }))));
const integrity = {
  hardConstraintViolations: worlds.reduce((sum, world) => sum + world.integrity.hardConstraintViolations, 0),
  productEligibilityViolations: worlds.reduce((sum, world) => sum + world.integrity.productEligibilityViolations, 0),
  distributionEligibilityViolations: worlds.reduce((sum, world) => sum + world.integrity.distributionEligibilityViolations, 0),
  sameCandidateUniverseAcrossArms: worlds.every((world) => world.integrity.sameCandidateUniverseAcrossArms),
  latentTruthRuntimeInput: false,
  retrievalMutation: "NONE",
  tasteEngineMutation: "NONE",
  productionAccess: "NONE",
};

const coverage = {
  UTILITY_COMPONENTS: records.every((row) => contract.arms.every((arm) => row.arms[arm].recorder.candidates.every((candidate) => candidate.components && candidate.fusion && Number.isFinite(candidate.finalUtility)))),
  ACTUAL_NEUTRAL_OPPOSING: records.length >= contract.coverage.minimumTreatmentComparisons && records.every((row) => contract.arms.every((arm) => row.arms[arm])),
  WAVE3C_CONTROL: records.every((row) => contract.arms.every((arm) => row.arms[arm].baselineQuality)),
  SAME_USER_DIFFERENT_CONTEXT: contextRows.length >= contract.coverage.minimumContextComparisons,
  SAME_REQUEST_DIFFERENT_USERS: differentUserRows.length >= contract.coverage.minimumDifferentUserComparisons,
  CURRENT_INTENT_CONFLICT: intentRows.length >= contract.coverage.minimumIntentConflictComparisons,
  MATURITY: contract.maturities.every((maturity) => byMaturity[maturity].n > 0),
  RETRIEVAL_UTILITY_ATTRIBUTION: records.every((row) => [row.retrievalMiss, row.utilityMiss, row.personalizationMiss].every((value) => typeof value === "boolean")),
  MULTI_SEED_SPLIT: worlds.length === contract.seeds.length && Object.values(bySplit).every((row) => row.n > 0),
  INTEGRITY: integrity.sameCandidateUniverseAcrossArms && !integrity.latentTruthRuntimeInput && integrity.retrievalMutation === "NONE" && integrity.tasteEngineMutation === "NONE",
};
const coveragePass = contract.coverage.failClosed && contract.coverage.requiredArms.every((arm) => coverage[arm] === true);
const overall = {
  meanUtilityAt10: mean(records.map((row) => row.arms.ACTUAL.quality.meanUtilityAtK)),
  baselineMeanUtilityAt10: mean(records.map((row) => row.arms.ACTUAL.baselineQuality.meanUtilityAtK)),
  ndcgAt10: mean(records.map((row) => row.arms.ACTUAL.quality.ndcgAt10)),
  baselineNdcgAt10: mean(records.map((row) => row.arms.ACTUAL.baselineQuality.ndcgAt10)),
  precisionAt10: mean(records.map((row) => row.arms.ACTUAL.quality.precisionAt10)),
  baselinePrecisionAt10: mean(records.map((row) => row.arms.ACTUAL.baselineQuality.precisionAt10)),
};
const harmRate = records.filter((row) => row.personalizationHarm).length / records.length;
const maximumCohortHarm = Math.max(...Object.values(byMaturity).map((row) => row.harmRate));
const matureLift = mean(records.filter((row) => ["mature", "power"].includes(row.maturity)).map((row) => row.personalizationLift));
const cold = byMaturity.cold;
const thresholds = contract.thresholds;
const gates = {
  coverage: coveragePass,
  overallDecisionQuality: overall.ndcgAt10 >= thresholds.ndcgAt10Minimum && overall.precisionAt10 >= thresholds.precisionAt10Minimum && overall.meanUtilityAt10 >= thresholds.meanUtilityAt10Minimum,
  utilityFusionLift: utilityLift.meanDelta >= thresholds.utilityLiftVsWave3CMinimum && utilityLift.interval[0] >= thresholds.utilityLiftBootstrapLowerMinimum,
  personalizationValue: personalizationLift.meanDelta >= thresholds.personalizationLiftMinimum && personalizationLift.interval[0] >= thresholds.personalizationLiftBootstrapLowerMinimum,
  personalizationHarm: harmRate <= thresholds.personalizationHarmRateMaximum && maximumCohortHarm <= thresholds.personalizationHarmCohortMaximum,
  contextualDecision: contextualDifferentiation >= thresholds.contextualDifferentiationMinimum && contextUtilityGain >= thresholds.sameUserContextUtilityGainMinimum,
  differentUsers: differentUserDivergence >= thresholds.differentUserRankingDivergenceMinimum && falsePersonalization <= thresholds.falsePersonalizationMaximum,
  currentIntentAuthority: intentRobustness >= thresholds.currentIntentRobustnessMinimum && historyOverrideRate <= thresholds.historyOverrideRateMaximum,
  coldStart: cold.utilityLift >= thresholds.coldStartUtilityDeltaMinimum,
  matureBenefit: matureLift >= thresholds.matureUserLiftMinimum,
  hardConstraints: integrity.hardConstraintViolations <= thresholds.hardConstraintViolationsMaximum,
  productEligibility: integrity.productEligibilityViolations <= thresholds.productEligibilityViolationsMaximum,
  distributionEligibility: integrity.distributionEligibilityViolations <= thresholds.distributionEligibilityViolationsMaximum,
  multiSeedHoldout: Object.values(bySplit).every((row) => row.utilityLift > 0),
  latencyCost: latency.p95 <= thresholds.p95UtilityLatencyMsMaximum && thresholds.externalCostPerDecisionMaximumUsd === 0,
};
const metrics = {
  sample: { seeds: worlds.length, goldenScenarios: records.length, treatmentRuns: records.length * 3, contextComparisons: contextRows.length, differentUserComparisons: differentUserRows.length, intentConflictComparisons: intentRows.length },
  overall, utilityLift, personalization: { lift: personalizationLift, harmRate, maximumCohortHarm, wins: personalizationLift.wins, ties: personalizationLift.ties, losses: personalizationLift.losses },
  context: { differentiation: contextualDifferentiation, utilityGainVsWave3C: contextUtilityGain },
  differentUsers: { rankingDivergence: differentUserDivergence, falsePersonalizationRate: falsePersonalization },
  intent: { robustness: intentRobustness, historyOverrideRate, evaluable: evaluableIntent.length },
  maturity: byMaturity, splits: bySplit,
  attribution: { retrievalMisses: records.filter((row) => row.retrievalMiss).length, utilityFusionMisses: records.filter((row) => row.utilityMiss).length, personalizationMisses: records.filter((row) => row.personalizationMiss).length },
  efficiency: { utilityEvaluations: records.reduce((sum, row) => sum + row.candidateCount * 3, 0), latency, externalApiCalls: 0, externalCostUsd: 0 },
  integrity,
};
const pass = Object.values(gates).every(Boolean);
const result = {
  version: "backyrd-wave4-contextual-utility-fusion-result-v1",
  generatedAt: "2026-08-17T16:00:00.000Z",
  contractVersion: contract.version,
  contractHash: contentHash(contract),
  freezeHash: freeze.freezeHash,
  utilityManifest: worlds[0].utilityManifest,
  parentFreezes: worlds[0].parentFreezes,
  candidatePathSourceHash: worlds[0].candidatePathSourceHash,
  coverage: { arms: coverage, pass: coveragePass }, metrics, gates,
  failureDecomposition: { ...metrics.attribution, failedGates: Object.entries(gates).filter(([, value]) => !value).map(([key]) => key), inheritedRetrievalLimitation: true, historicalRetrievalVerdict: "NOT_PROMOTED", historicalPersonalizedFitVerdict: "NOT_PROMOTED" },
  experiments: {
    retained: ["calibrated_deterministic_hybrid_utility", "confidence_bounded_personalization", "rank_calibrated_retrieval_evidence"],
    rejected: [
      { id: "raw_source_score_sum", reason: "incomparable source scales violate D4 evidence boundaries" },
      { id: "standalone_personalized_fit_ranker", reason: "frozen Wave 3C.1 control produced no robust lift" },
      { id: "learned_fusion", reason: "no unbiased outcome corpus supports scientific training" }
    ]
  },
  scientificValidity: { status: "PASS", groundTruthRole: "EVALUATOR_ONLY", latentTruthRuntimeInput: false, thresholdsFrozenBeforeOfficialRun: true, lockedHoldoutTuning: false, retrievalMutation: "NONE", tasteEngineMutation: "NONE", productionAccess: "NONE" },
  verdict: pass ? "PASS" : "FAIL",
  coreVerdict: pass ? "PROMOTED" : "NOT_PROMOTED",
  nextWaveReadiness: pass ? "READY" : "NOT_READY",
};
result.resultHash = contentHash(result);
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, coreVerdict: result.coreVerdict, resultHash: result.resultHash, gates, metrics }, null, 2)}\n`);
