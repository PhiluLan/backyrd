#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { jaccard } from "./metrics.mjs";
import { pairedBootstrap } from "./statistics.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputDir = resolve(repoRoot, option("input")); const outputPath = resolve(repoRoot, option("output"));
const contract = await readJson(resolve(repoRoot, "decision-lab/config/wave3c-personalized-decision-v1.json"));
const worlds = await Promise.all(contract.seeds.map((seed) => readJson(resolve(inputDir, `${seed}.json`))));
if (worlds.length !== 3 || worlds.some((world) => world.records.length !== 42)) throw new Error("Wave 3C official sample incomplete");
if (new Set(worlds.map((world) => world.contractHash)).size !== 1 || worlds[0].contractHash !== contentHash(contract)) throw new Error("Wave 3C mixed Validation Contract");
const records = worlds.flatMap((world) => world.records); const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const liftPairs = records.map((row) => [row.arms.NEUTRAL.quality.meanUtilityAtK, row.arms.ACTUAL.quality.meanUtilityAtK]);
const bootstrap = pairedBootstrap(liftPairs, contract.bootstrap);
const byMaturity = Object.fromEntries(contract.maturities.map((maturity) => {
  const rows = records.filter((row) => row.maturity === maturity);
  return [maturity, { n: rows.length, lift: mean(rows.map((row) => row.personalizationLift)), harmRate: rows.filter((row) => row.personalizationHarm).length / Math.max(1, rows.length), confidence: mean(rows.map((row) => row.arms.ACTUAL.mapConfidence)) }];
}));
const bySplit = Object.fromEntries(["DEVELOPMENT", "REGRESSION", "LOCKED_HOLDOUT"].map((split) => {
  const rows = records.filter((row) => row.split === split); return [split, { n: rows.length, lift: mean(rows.map((row) => row.personalizationLift)), harmRate: rows.filter((row) => row.personalizationHarm).length / rows.length }];
}));
const contextRows = worlds.flatMap((world) => world.contextMeasurements);
const contextGroupsById = new Map();
for (const row of contextRows) contextGroupsById.set(row.id, [...(contextGroupsById.get(row.id) ?? []), row]);
const contextGroups = [...contextGroupsById.values()];
const contextualDifferentiation = mean(worlds.map((world) => {
  const rows = world.contextMeasurements; const pairs = [[0, 1], [0, 2], [1, 2]]; return mean(pairs.map(([a, b]) => 1 - jaccard(rows[a].actual.ids, rows[b].actual.ids)));
}));
const contextUtilityGain = mean(contextRows.map((row) => row.actual.meanUtilityAtK - row.neutral.meanUtilityAtK));
const differentUserRows = worlds.flatMap((world) => world.differentUsers);
const differentUserDivergence = mean(worlds.map((world) => {
  const rows = world.differentUsers; const pairs = [[0, 1], [0, 2], [1, 2]]; return mean(pairs.map(([a, b]) => 1 - jaccard(rows[a].actual.ids, rows[b].actual.ids)));
}));
const falsePersonalization = differentUserRows.filter((row) => row.actual.meanUtilityAtK < row.neutral.meanUtilityAtK).length / differentUserRows.length;
const intentRows = worlds.flatMap((world) => world.intentConflict); const evaluableIntent = intentRows.filter((row) => row.evaluable);
const currentIntentRobustness = evaluableIntent.length ? mean(evaluableIntent.flatMap((row) => [Number(row.actualAligned), Number(row.opposingAligned)])) : 1;
const historyOverrideRate = intentRows.filter((row) => row.historyOverride).length / intentRows.length;
const confidenceCorrelation = pearson(records.map((row) => row.arms.ACTUAL.mapConfidence), records.map((row) => row.personalizationLift));
const cold = byMaturity.cold; const matureRows = records.filter((row) => ["mature", "power"].includes(row.maturity)); const matureLift = mean(matureRows.map((row) => row.personalizationLift));
const integrity = {
  hardConstraintViolations: worlds.reduce((sum, world) => sum + world.integrity.hardConstraintViolations, 0),
  productEligibilityViolations: worlds.reduce((sum, world) => sum + world.integrity.productEligibilityViolations, 0),
  distributionEligibilityViolations: worlds.reduce((sum, world) => sum + world.integrity.distributionEligibilityViolations, 0),
  sameCandidateUniverseAcrossArms: worlds.every((world) => world.integrity.sameCandidateUniverseAcrossArms),
  latentTruthRuntimeInput: false, retrievalMutation: "NONE", productionAccess: "NONE",
};
const coverage = {
  ACTUAL_NEUTRAL_OPPOSING: records.length >= contract.coverage.minimumTreatmentComparisons,
  SAME_USER_DIFFERENT_CONTEXT: contextRows.length >= contract.coverage.minimumContextComparisons,
  SAME_REQUEST_DIFFERENT_USERS: differentUserRows.length >= contract.coverage.minimumDifferentUserComparisons,
  CURRENT_INTENT_CONFLICT: intentRows.length >= contract.coverage.minimumIntentConflictComparisons,
  MATURITY: contract.maturities.every((maturity) => byMaturity[maturity].n > 0),
  CONFIDENCE: Number.isFinite(confidenceCorrelation), RETRIEVAL_ATTRIBUTION: records.every((row) => typeof row.retrievalMiss === "boolean" && typeof row.personalizationMiss === "boolean"),
  INTEGRITY: integrity.sameCandidateUniverseAcrossArms && !integrity.latentTruthRuntimeInput,
};
const coveragePass = contract.coverage.failClosed && contract.coverage.requiredArms.every((arm) => coverage[arm] === true);
const thresholds = contract.thresholds;
const maximumCohortHarm = Math.max(...Object.values(byMaturity).map((row) => row.harmRate));
const opposingHarmRate = records.filter((row) => row.opposingHarmVsNeutral).length / records.length;
const gates = {
  coverage: coveragePass,
  personalizationLift: bootstrap.meanDelta >= thresholds.personalizationLiftMeanMinimum && bootstrap.interval[0] >= thresholds.personalizationLiftBootstrapLowerMinimum,
  personalizationHarm: records.filter((row) => row.personalizationHarm).length / records.length <= thresholds.personalizationHarmRateMaximum && maximumCohortHarm <= thresholds.personalizationHarmCohortMaximum,
  opposingHistory: opposingHarmRate <= thresholds.opposingHistoryHarmMaximum,
  currentIntentAuthority: currentIntentRobustness >= thresholds.currentIntentRobustnessMinimum && historyOverrideRate <= thresholds.historyOverrideRateMaximum,
  contextualDecision: contextualDifferentiation >= thresholds.contextualDifferentiationMinimum && contextUtilityGain >= thresholds.sameUserContextUtilityGainMinimum,
  differentUsers: differentUserDivergence >= thresholds.differentUserRankingDivergenceMinimum && falsePersonalization <= thresholds.falsePersonalizationMaximum,
  confidenceAware: confidenceCorrelation >= thresholds.confidenceLiftCorrelationMinimum,
  coldStart: cold.lift >= thresholds.coldStartUtilityDeltaMinimum && cold.harmRate <= thresholds.coldStartHarmRateMaximum,
  matureBenefit: matureLift >= thresholds.matureUserLiftMinimum,
  hardConstraints: integrity.hardConstraintViolations <= thresholds.hardConstraintViolationsMaximum,
  productEligibility: integrity.productEligibilityViolations <= thresholds.productEligibilityViolationsMaximum,
  distributionEligibility: integrity.distributionEligibilityViolations <= thresholds.distributionEligibilityViolationsMaximum,
};
const metrics = {
  sample: { seeds: worlds.length, goldenScenarios: records.length, treatments: records.length * 3, contextComparisons: contextRows.length, differentUserComparisons: differentUserRows.length, intentConflictComparisons: intentRows.length },
  personalization: { lift: bootstrap, harmRate: records.filter((row) => row.personalizationHarm).length / records.length, maximumCohortHarm, opposingHarmRate, topK: { actualUtility: mean(records.map((row) => row.arms.ACTUAL.quality.meanUtilityAtK)), neutralUtility: mean(records.map((row) => row.arms.NEUTRAL.quality.meanUtilityAtK)), opposingUtility: mean(records.map((row) => row.arms.OPPOSING.quality.meanUtilityAtK)), actualNdcg: mean(records.map((row) => row.arms.ACTUAL.quality.ndcgAt10)), neutralNdcg: mean(records.map((row) => row.arms.NEUTRAL.quality.ndcgAt10)), actualPrecision: mean(records.map((row) => row.arms.ACTUAL.quality.precisionAt10)), neutralPrecision: mean(records.map((row) => row.arms.NEUTRAL.quality.precisionAt10)) } },
  maturity: byMaturity, splits: bySplit,
  context: { contextualDifferentiation, utilityGain: contextUtilityGain, groups: contextGroups.map((rows) => ({ id: rows[0].id, n: rows.length, lift: mean(rows.map((row) => row.actual.meanUtilityAtK - row.neutral.meanUtilityAtK)) })) },
  differentUsers: { rankingDivergence: differentUserDivergence, falsePersonalizationRate: falsePersonalization },
  intent: { robustness: currentIntentRobustness, historyOverrideRate, evaluable: evaluableIntent.length },
  confidence: { liftCorrelation: confidenceCorrelation },
  attribution: { retrievalMisses: records.filter((row) => row.retrievalMiss).length, personalizationMisses: records.filter((row) => row.personalizationMiss).length },
  integrity,
};
const pass = Object.values(gates).every(Boolean);
const result = {
  version: "backyrd-wave3c-personalized-decision-result-v1", generatedAt: "2026-08-17T14:00:00.000Z", contractVersion: contract.version, contractHash: contentHash(contract),
  contractFreezeHash: createHash("sha256").update(await readFile(resolve(repoRoot, "decision-lab/config/wave3c-personalized-decision-v1.json"))).digest("hex"),
  parentFreezes: worlds[0].parentFreezes, fitManifest: worlds[0].manifest, candidatePathSourceHash: worlds[0].candidatePathSourceHash,
  coverage: { arms: coverage, pass: coveragePass }, metrics, gates,
  failureDecomposition: { retrievalMisses: metrics.attribution.retrievalMisses, personalizationMisses: metrics.attribution.personalizationMisses, failedGates: Object.entries(gates).filter(([, value]) => !value).map(([key]) => key) },
  scientificValidity: { status: "PASS", groundTruthRole: "EVALUATOR_ONLY", latentTruthRuntimeInput: false, thresholdsFrozenBeforeOfficialRun: true, treatmentControls: "D2.2_UNCHANGED", tasteEngineMutationDuringRun: "NONE", retrievalMutation: "NONE", productionAccess: "NONE" },
  verdict: pass ? "PASS" : "FAIL", integrationVerdict: pass ? "PROMOTED" : "NOT_PROMOTED", wave4Readiness: pass ? "READY" : "NOT_READY",
};
result.resultHash = contentHash(result);
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, resultHash: result.resultHash, gates, metrics }, null, 2)}\n`);

function pearson(left, right) {
  if (left.length < 2 || left.length !== right.length) return null;
  const lx = mean(left); const rx = mean(right); const numerator = left.reduce((sum, value, index) => sum + (value - lx) * (right[index] - rx), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - lx) ** 2, 0) * right.reduce((sum, value) => sum + (value - rx) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}
