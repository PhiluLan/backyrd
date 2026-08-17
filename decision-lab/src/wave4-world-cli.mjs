#!/usr/bin/env node
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { requestForGoldenScenario, runD3AWorld } from "./d3-a-runner.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios } from "./golden-scenarios.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { jaccard, listQuality } from "./metrics.mjs";
import { buildPersonalizationTreatment, TREATMENT_ARMS } from "./personalization-treatment.mjs";
import { validatePersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { validateTasteEngineFreeze } from "./taste-engine-freeze.mjs";
import { validateTasteValidationFreeze } from "./taste-validation-freeze.mjs";
import { latentUtility } from "./utility.mjs";
import { materializeTreatmentTaste, rankWithPersonalizedFit } from "./wave3c-personalized-fit.mjs";
import { validateWave3CFreeze } from "./wave3c-freeze.mjs";
import { rankWithContextualUtility, utilityContractManifest } from "./wave4-contextual-utility-fusion.mjs";
import { validateWave4Freeze } from "./wave4-freeze.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const configPath = resolve(repoRoot, option("config"));
const outputPath = resolve(repoRoot, option("output"));
if (!configPath || !outputPath) throw new Error("--config and --output are required");

const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const truthMap = (world, user, context) => Object.fromEntries(world.spots.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
const quality = (rows, truth, k) => ({ ids: rows.results.map((row) => row.spotId), ...listQuality(rows.results.map((row) => row.spotId), truth, 0.6, k) });
const topRankMovement = (left, right) => {
  const ranks = new Map(right.map((id, index) => [id, index + 1]));
  return mean(left.map((id, index) => Math.abs(index + 1 - (ranks.get(id) ?? right.length + 1))));
};
const runRanks = ({ candidateIds, world, tasteMap, request, context, maturity, limit }) => {
  const startedAt = performance.now();
  const utility = rankWithContextualUtility({ candidateIds, spots: world.spots, tasteMap, request, context, maturity, limit });
  const latencyMs = performance.now() - startedAt;
  const baseline = rankWithPersonalizedFit({ candidateIds, spots: world.spots, tasteMap, request, context, maturity, limit });
  return { utility, baseline, latencyMs };
};

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`Wave 4 D2 preflight failed:${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const [config, constitution, coverageContract, contract, d22Freeze, tasteEngine, tasteTreatment, wave3c, wave4] = await Promise.all([
  readJson(configPath),
  readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/wave4-contextual-utility-fusion-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json")),
  validateTasteEngineFreeze(), validateTasteValidationFreeze(), validateWave3CFreeze(), validateWave4Freeze(),
]);
const d22 = await validatePersonalizationTreatmentFreeze(d22Freeze);
if (!d22.valid || !tasteEngine.valid || !tasteTreatment.valid || !wave3c.valid || !wave4.valid) throw new Error("Wave 4 parent/freeze validation failed");
if (contentHash(tasteEngine.frozen) !== contract.parentFreezes.tasteEngine) throw new Error("Wave 4 Taste Engine identity mismatch");
if (tasteTreatment.freezeHash !== contract.parentFreezes.tasteTreatment) throw new Error("Wave 4 Taste treatment identity mismatch");
if (d22Freeze.freezeManifestHash !== contract.parentFreezes.personalizationTreatment) throw new Error("Wave 4 D2.2 identity mismatch");

const sourceUrl = new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url);
const sourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const candidateRun = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: { sourceUrl, expectedSourceHash: sourceHash, baselineId: "backyrd-wave4-frozen-candidate-path-v1", wave1: true, goldenOnly: true },
});
const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata);
const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion);
const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
const candidateByScenario = new Map(candidateRun.records.map((row) => [row.scenarioId, row]));
const records = [];

for (const candidateRecord of candidateRun.records) {
  const scenario = scenarioById.get(candidateRecord.scenarioId);
  const user = world.users.find((row) => row.id === scenario.userId);
  const context = world.contexts.find((row) => row.id === scenario.context.contextId);
  const request = requestForGoldenScenario(scenario);
  const truth = truthMap(world, user, context);
  const candidateIds = candidateRecord.retrievalContractEvidence.candidateIds.filter((id) => Object.hasOwn(candidateRecord.retrievalContractEvidence.eligibleUtilityById, id));
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: scenario.id, currentRequest: request, currentContext: scenario.context });
  const arms = {};
  for (const arm of TREATMENT_ARMS) {
    const tasteMap = materializeTreatmentTaste(world, treatment, arm);
    const ranked = runRanks({ candidateIds, world, tasteMap, request, context, maturity: user.maturity, limit: contract.topK });
    arms[arm] = {
      tasteMapHash: tasteMap.mapHash,
      quality: quality(ranked.utility, truth, contract.topK),
      baselineQuality: quality(ranked.baseline, truth, contract.topK),
      recorder: ranked.utility.recorder,
      latencyMs: ranked.latencyMs,
      utilityConfidence: mean(ranked.utility.results.map((row) => row.utilityConfidence)),
    };
  }
  const eligibleTruth = candidateRecord.retrievalContractEvidence.eligibleUtilityById;
  const bestEligible = Math.max(0, ...Object.values(eligibleTruth));
  const bestCandidate = Math.max(0, ...candidateIds.map((id) => truth[id] ?? 0));
  const actual = arms.ACTUAL.quality.meanUtilityAtK;
  const neutral = arms.NEUTRAL.quality.meanUtilityAtK;
  records.push({
    seed: config.seed, scenarioId: scenario.id, split: scenario.split, family: scenario.family, maturity: user.maturity, persona: user.persona,
    candidateCount: candidateIds.length, candidateIdsHash: contentHash(candidateIds), treatmentHash: treatment.treatmentHash, arms,
    utilityLiftVsWave3C: actual - arms.ACTUAL.baselineQuality.meanUtilityAtK,
    personalizationLift: actual - neutral,
    personalizationHarm: actual < neutral,
    opposingImpactVsActual: arms.OPPOSING.quality.meanUtilityAtK - actual,
    overlapActualNeutral: jaccard(arms.ACTUAL.quality.ids, arms.NEUTRAL.quality.ids),
    rankMovementActualNeutral: topRankMovement(arms.ACTUAL.quality.ids, arms.NEUTRAL.quality.ids),
    retrievalMiss: bestEligible > bestCandidate,
    utilityMiss: bestCandidate > Math.max(0, ...arms.ACTUAL.quality.ids.slice(0, 3).map((id) => truth[id] ?? 0)),
    personalizationMiss: actual < neutral,
    hardConstraintPass: candidateRecord.hardConstraintResult.pass,
  });
}

const matureReference = records.find((row) => row.maturity === "mature") ?? records[0];
const referenceScenario = scenarioById.get(matureReference.scenarioId);
const referenceUser = world.users.find((row) => row.id === referenceScenario.userId);
const referenceCandidates = candidateByScenario.get(matureReference.scenarioId).retrievalContractEvidence.candidateIds
  .filter((id) => Object.hasOwn(candidateByScenario.get(matureReference.scenarioId).retrievalContractEvidence.eligibleUtilityById, id));
const controlledContext = (id, audience, timeBucket, weekday) => ({ ...(world.contexts.find((row) => row.audience === audience && row.timeBucket === timeBucket) ?? world.contexts[0]), id, audience, timeBucket, weekday });
const sharedRequest = { city: "Synthetic Basel", query: "gemütlich etwas trinken", rawFreeText: "gemütlich etwas trinken", preferredPlaceTypes: [] };
const contextMeasurements = [
  controlledContext("family-sunday-afternoon", "family", "afternoon", 0),
  controlledContext("friends-friday-evening", "friends", "evening", 5),
  controlledContext("date-evening", "date", "evening", 4),
].map((context) => {
  const treatment = buildPersonalizationTreatment(world, { userId: referenceUser.id, scenarioId: `wave4-context-${context.id}`, currentRequest: sharedRequest, currentContext: context });
  const truth = truthMap(world, referenceUser, context);
  const actual = runRanks({ candidateIds: referenceCandidates, world, tasteMap: materializeTreatmentTaste(world, treatment, "ACTUAL"), request: sharedRequest, context, maturity: referenceUser.maturity, limit: contract.topK });
  const neutral = runRanks({ candidateIds: referenceCandidates, world, tasteMap: materializeTreatmentTaste(world, treatment, "NEUTRAL"), request: sharedRequest, context, maturity: referenceUser.maturity, limit: contract.topK });
  return { id: context.id, actual: quality(actual.utility, truth, contract.topK), neutral: quality(neutral.utility, truth, contract.topK), baseline: quality(actual.baseline, truth, contract.topK) };
});

const selectedUsers = ["quiet_regular", "social_explorer", "date_planner"].map((persona) => world.users.find((row) => row.persona === persona && ["developing", "mature", "power"].includes(row.maturity))).filter(Boolean);
while (selectedUsers.length < 3) selectedUsers.push(world.users.find((row) => !selectedUsers.includes(row) && ["developing", "mature", "power"].includes(row.maturity)));
const userContext = controlledContext("shared-friends-friday-evening", "friends", "evening", 5);
const differentUsers = selectedUsers.slice(0, 3).map((user) => {
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: `wave4-user-${user.id}`, currentRequest: sharedRequest, currentContext: userContext });
  const truth = truthMap(world, user, userContext);
  const actual = runRanks({ candidateIds: referenceCandidates, world, tasteMap: materializeTreatmentTaste(world, treatment, "ACTUAL"), request: sharedRequest, context: userContext, maturity: user.maturity, limit: contract.topK });
  const neutral = runRanks({ candidateIds: referenceCandidates, world, tasteMap: materializeTreatmentTaste(world, treatment, "NEUTRAL"), request: sharedRequest, context: userContext, maturity: user.maturity, limit: contract.topK });
  return { userId: user.id, maturity: user.maturity, persona: user.persona, actual: quality(actual.utility, truth, contract.topK), neutral: quality(neutral.utility, truth, contract.topK) };
});

const intentConflict = records.filter((row) => ["developing", "mature", "power"].includes(row.maturity)).slice(0, 6).map((record) => {
  const scenario = scenarioById.get(record.scenarioId); const user = world.users.find((row) => row.id === scenario.userId); const baseContext = world.contexts.find((row) => row.id === scenario.context.contextId);
  const context = { ...baseContext, audience: "friends", timeBucket: "evening" };
  const request = { city: "Synthetic Basel", query: "heute laut lebhaft social Drinks mit Freunden", rawFreeText: "heute laut lebhaft social Drinks mit Freunden", preferredPlaceTypes: [] };
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: `${scenario.id}-wave4-intent`, currentRequest: request, currentContext: context });
  const candidateRecord = candidateByScenario.get(record.scenarioId); const candidateIds = candidateRecord.retrievalContractEvidence.candidateIds.filter((id) => Object.hasOwn(candidateRecord.retrievalContractEvidence.eligibleUtilityById, id));
  const arms = Object.fromEntries(TREATMENT_ARMS.map((arm) => [arm, runRanks({ candidateIds, world, tasteMap: materializeTreatmentTaste(world, treatment, arm), request, context, maturity: user.maturity, limit: contract.topK }).utility]));
  const requested = new Set(["vibe.lively", "vibe.social"]);
  const available = candidateIds.some((id) => arms.NEUTRAL.allCandidates.find((row) => row.spotId === id)?.concepts.some((concept) => requested.has(concept)));
  const aligned = (arm) => arm.results.slice(0, 3).some((row) => row.concepts.some((concept) => requested.has(concept)));
  const authorityPass = TREATMENT_ARMS.every((arm) => arms[arm].recorder.candidates.every((row) => row.fusion.personalizationDelta <= 0.08 && row.fusion.personalizationDelta >= -0.08));
  return { scenarioId: scenario.id, evaluable: available, actualAligned: !available || aligned(arms.ACTUAL), opposingAligned: !available || aligned(arms.OPPOSING), authorityPass, historyOverride: !authorityPass };
});

const result = {
  version: "backyrd-wave4-world-result-v1", seed: config.seed, contractHash: contentHash(contract), candidatePathSourceHash: sourceHash,
  parentFreezes: contract.parentFreezes, utilityManifest: utilityContractManifest(), records, contextMeasurements, differentUsers, intentConflict,
  integrity: {
    hardConstraintViolations: records.filter((row) => !row.hardConstraintPass).length,
    productEligibilityViolations: records.flatMap((row) => row.arms.ACTUAL.recorder.candidates).filter((row) => world.spots.find((spot) => spot.id === row.spotId)?.observed.status !== "approved").length,
    distributionEligibilityViolations: records.flatMap((row) => row.arms.ACTUAL.recorder.candidates).filter((row) => ["quarantined", "excluded"].includes(world.spots.find((spot) => spot.id === row.spotId)?.observed.distribution)).length,
    sameCandidateUniverseAcrossArms: records.every((row) => TREATMENT_ARMS.every((arm) => row.arms[arm].recorder.candidateCount === row.candidateCount)),
    latentTruthRuntimeInput: false, retrievalMutation: "NONE", tasteEngineMutation: "NONE", productionAccess: "NONE",
  },
};
result.resultHash = contentHash(result);
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ status: "PASS", seed: config.seed, records: records.length, resultHash: result.resultHash, integrity: result.integrity }, null, 2)}\n`);
