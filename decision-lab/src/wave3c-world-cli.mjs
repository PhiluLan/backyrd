#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { runD3AWorld, requestForGoldenScenario } from "./d3-a-runner.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios } from "./golden-scenarios.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { listQuality, jaccard } from "./metrics.mjs";
import { buildPersonalizationTreatment, TREATMENT_ARMS } from "./personalization-treatment.mjs";
import { validatePersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { validateTasteEngineFreeze } from "./taste-engine-freeze.mjs";
import { validateTasteValidationFreeze } from "./taste-validation-freeze.mjs";
import { latentUtility } from "./utility.mjs";
import { materializeTreatmentTaste, personalizedFitManifest, rankWithPersonalizedFit } from "./wave3c-personalized-fit.mjs";
import { validateWave3CFreeze } from "./wave3c-freeze.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const configPath = resolve(repoRoot, option("config"));
const outputPath = resolve(repoRoot, option("output"));
if (!configPath || !outputPath) throw new Error("--config and --output are required");

const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const utilityMap = (world, user, context) => Object.fromEntries(world.spots.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
const armQuality = (ranked, truth, k) => ({ ids: ranked.results.map((row) => row.spotId), ...listQuality(ranked.results.map((row) => row.spotId), truth, 0.6, k) });
const averageRankMovement = (left, right) => {
  const ranks = new Map(right.map((id, index) => [id, index + 1]));
  return mean(left.map((id, index) => Math.abs(index + 1 - (ranks.get(id) ?? right.length + 1))));
};

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`Wave 3C D2 preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const [config, constitution, coverageContract, validationContract, d22Freeze, engineFreeze, tasteValidationFreeze, wave3cFreeze] = await Promise.all([
  readJson(configPath),
  readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/wave3c-personalized-decision-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json")),
  validateTasteEngineFreeze(),
  validateTasteValidationFreeze(),
  validateWave3CFreeze(),
]);
const d22Validation = await validatePersonalizationTreatmentFreeze(d22Freeze);
if (!d22Validation.valid || !engineFreeze.valid || !tasteValidationFreeze.valid) throw new Error("Wave 3C parent freeze validation failed");
if (!wave3cFreeze.valid) throw new Error(`Wave 3C freeze validation failed:${wave3cFreeze.reasons.join(",")}`);
if (contentHash(engineFreeze.frozen) !== validationContract.tasteEngineFreezeHash) throw new Error("Wave 3C Taste Engine identity mismatch");
if (d22Freeze.freezeManifestHash !== validationContract.personalizationTreatmentFreezeHash) throw new Error("Wave 3C D2.2 identity mismatch");
if (tasteValidationFreeze.freezeHash !== validationContract.tasteTreatmentFreezeHash) throw new Error("Wave 3C Taste treatment identity mismatch");

const sourceUrl = new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url);
const expectedSourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const candidateRun = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: { sourceUrl, expectedSourceHash, baselineId: "backyrd-wave3c-wave1-candidate-path-v1", wave1: true, goldenOnly: true },
});
const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata);
const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion);
const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
const records = [];

for (const candidateRecord of candidateRun.records) {
  const scenario = scenarioById.get(candidateRecord.scenarioId);
  const user = world.users.find((row) => row.id === scenario.userId);
  const context = world.contexts.find((row) => row.id === scenario.context.contextId);
  const request = requestForGoldenScenario(scenario);
  const truth = utilityMap(world, user, context);
  const candidateIds = candidateRecord.retrievalContractEvidence.candidateIds.filter((id) => Object.hasOwn(candidateRecord.retrievalContractEvidence.eligibleUtilityById, id));
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: scenario.id, currentRequest: request, currentContext: scenario.context });
  const arms = {};
  for (const arm of TREATMENT_ARMS) {
    const tasteMap = materializeTreatmentTaste(world, treatment, arm);
    const ranked = rankWithPersonalizedFit({ candidateIds, spots: world.spots, tasteMap, request, context, maturity: user.maturity, limit: validationContract.topK });
    arms[arm] = { tasteMapHash: tasteMap.mapHash, mapConfidence: ranked.allCandidates[0]?.evidence.mapConfidence ?? 0, recorder: ranked.recorder, quality: armQuality(ranked, truth, validationContract.topK) };
  }
  const actualUtility = arms.ACTUAL.quality.meanUtilityAtK;
  const neutralUtility = arms.NEUTRAL.quality.meanUtilityAtK;
  records.push({
    seed: config.seed, scenarioId: scenario.id, split: scenario.split, family: scenario.family, maturity: user.maturity, persona: user.persona,
    candidateCount: candidateIds.length, treatmentHash: treatment.treatmentHash, candidateIdsHash: contentHash(candidateIds), arms,
    personalizationLift: actualUtility - neutralUtility, personalizationHarm: actualUtility < neutralUtility,
    opposingImpactVsActual: arms.OPPOSING.quality.meanUtilityAtK - actualUtility,
    opposingHarmVsNeutral: arms.OPPOSING.quality.meanUtilityAtK < neutralUtility,
    overlapActualNeutral: jaccard(arms.ACTUAL.quality.ids, arms.NEUTRAL.quality.ids),
    rankMovementActualNeutral: averageRankMovement(arms.ACTUAL.quality.ids, arms.NEUTRAL.quality.ids),
    retrievalMiss: Math.max(...Object.values(candidateRecord.retrievalContractEvidence.eligibleUtilityById)) > Math.max(0, ...candidateIds.map((id) => truth[id] ?? 0)),
    personalizationMiss: actualUtility < neutralUtility,
    hardConstraintPass: candidateRecord.hardConstraintResult.pass,
  });
}

const referenceRecord = records.find((row) => row.maturity === "mature") ?? records[0];
const referenceScenario = scenarioById.get(referenceRecord.scenarioId);
const referenceUser = world.users.find((row) => row.id === referenceScenario.userId);
const referenceCandidates = candidateRun.records.find((row) => row.scenarioId === referenceRecord.scenarioId).retrievalContractEvidence.candidateIds
  .filter((id) => Object.hasOwn(candidateRun.records.find((row) => row.scenarioId === referenceRecord.scenarioId).retrievalContractEvidence.eligibleUtilityById, id));
const controlledContext = (id, audience, timeBucket, weekday) => ({ ...world.contexts.find((row) => row.audience === audience && row.timeBucket === timeBucket) ?? world.contexts[0], id, audience, timeBucket, weekday });
const contextCases = [
  controlledContext("family-sunday-afternoon", "family", "afternoon", 0),
  controlledContext("friends-friday-evening", "friends", "evening", 5),
  controlledContext("date-evening", "date", "evening", 4),
];
const contextMeasurements = contextCases.map((context) => {
  const request = { city: "Synthetic Basel", query: "gemütlich etwas trinken", rawFreeText: "gemütlich etwas trinken", preferredPlaceTypes: [] };
  const treatment = buildPersonalizationTreatment(world, { userId: referenceUser.id, scenarioId: `wave3c-context-${context.id}`, currentRequest: request, currentContext: context });
  const actualMap = materializeTreatmentTaste(world, treatment, "ACTUAL");
  const neutralMap = materializeTreatmentTaste(world, treatment, "NEUTRAL");
  const actual = rankWithPersonalizedFit({ candidateIds: referenceCandidates, spots: world.spots, tasteMap: actualMap, request, context, maturity: referenceUser.maturity, limit: validationContract.topK });
  const neutral = rankWithPersonalizedFit({ candidateIds: referenceCandidates, spots: world.spots, tasteMap: neutralMap, request, context, maturity: referenceUser.maturity, limit: validationContract.topK });
  const truth = utilityMap(world, referenceUser, context);
  return { id: context.id, actual: armQuality(actual, truth, validationContract.topK), neutral: armQuality(neutral, truth, validationContract.topK), projectionHashes: uniqueHashes(actual.allCandidates.map((row) => row.evidence.projectionHash)) };
});

const selectedUsers = ["quiet_regular", "social_explorer", "date_planner"].map((persona) => world.users.find((row) => row.persona === persona && ["developing", "mature", "power"].includes(row.maturity))).filter(Boolean);
while (selectedUsers.length < 3) selectedUsers.push(world.users.find((row) => !selectedUsers.includes(row) && ["developing", "mature", "power"].includes(row.maturity)));
const sharedRequest = { city: "Synthetic Basel", query: "gemütlich etwas trinken am Freitagabend", rawFreeText: "gemütlich etwas trinken am Freitagabend", preferredPlaceTypes: [] };
const sharedContext = controlledContext("shared-friends-friday-evening", "friends", "evening", 5);
const differentUsers = selectedUsers.slice(0, 3).map((user) => {
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: `wave3c-user-${user.id}`, currentRequest: sharedRequest, currentContext: sharedContext });
  const actual = rankWithPersonalizedFit({ candidateIds: referenceCandidates, spots: world.spots, tasteMap: materializeTreatmentTaste(world, treatment, "ACTUAL"), request: sharedRequest, context: sharedContext, maturity: user.maturity, limit: validationContract.topK });
  const neutral = rankWithPersonalizedFit({ candidateIds: referenceCandidates, spots: world.spots, tasteMap: materializeTreatmentTaste(world, treatment, "NEUTRAL"), request: sharedRequest, context: sharedContext, maturity: user.maturity, limit: validationContract.topK });
  const truth = utilityMap(world, user, sharedContext);
  return { userId: user.id, persona: user.persona, maturity: user.maturity, actual: armQuality(actual, truth, validationContract.topK), neutral: armQuality(neutral, truth, validationContract.topK) };
});

const intentConflict = records.filter((row) => ["mature", "power", "developing"].includes(row.maturity)).slice(0, 6).map((record) => {
  const scenario = scenarioById.get(record.scenarioId); const user = world.users.find((row) => row.id === scenario.userId); const context = world.contexts.find((row) => row.id === scenario.context.contextId);
  const request = { city: "Synthetic Basel", query: "heute laut lebhaft social Drinks mit Freunden", rawFreeText: "heute laut lebhaft social Drinks mit Freunden", preferredPlaceTypes: [] };
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: `${scenario.id}-intent-conflict`, currentRequest: request, currentContext: { ...context, audience: "friends", timeBucket: "evening" } });
  const candidateIds = candidateRun.records.find((row) => row.scenarioId === record.scenarioId).retrievalContractEvidence.candidateIds.filter((id) => Object.hasOwn(candidateRun.records.find((row) => row.scenarioId === record.scenarioId).retrievalContractEvidence.eligibleUtilityById, id));
  const arms = Object.fromEntries(TREATMENT_ARMS.map((arm) => [arm, rankWithPersonalizedFit({ candidateIds, spots: world.spots, tasteMap: materializeTreatmentTaste(world, treatment, arm), request, context: { ...context, audience: "friends", timeBucket: "evening" }, maturity: user.maturity, limit: validationContract.topK })]));
  const requested = new Set(["vibe.lively", "vibe.social"]); const available = candidateIds.some((id) => world.spots.find((spot) => spot.id === id) && [...requested].some((concept) => arms.NEUTRAL.allCandidates.find((row) => row.spotId === id)?.concepts.includes(concept)));
  const armAligned = (arm) => arm.results.slice(0, 3).some((row) => row.concepts.some((concept) => requested.has(concept)));
  const authorityPass = TREATMENT_ARMS.every((arm) => arms[arm].allCandidates.every((row) => row.evidence.intentFit.matched.every((evidence) => evidence.authority === "EXPLICIT_CURRENT_INTENT")));
  return { scenarioId: scenario.id, evaluable: available, actualAligned: !available || armAligned(arms.ACTUAL), opposingAligned: !available || armAligned(arms.OPPOSING), authorityPass, historyOverride: !authorityPass };
});

const result = {
  version: "wave3c-personalized-decision-world-v1", seed: config.seed, contractHash: contentHash(validationContract), candidatePathSourceHash: expectedSourceHash,
  parentFreezes: { tasteEngine: contentHash(engineFreeze.frozen), tasteTreatment: tasteValidationFreeze.freezeHash, personalizationTreatment: d22Freeze.freezeManifestHash },
  manifest: personalizedFitManifest(), records, contextMeasurements, differentUsers, intentConflict,
  integrity: {
    hardConstraintViolations: records.filter((row) => !row.hardConstraintPass).length,
    productEligibilityViolations: records.flatMap((row) => row.arms.ACTUAL.recorder.candidates).filter((row) => world.spots.find((spot) => spot.id === row.spotId)?.observed.status !== "approved").length,
    distributionEligibilityViolations: records.flatMap((row) => row.arms.ACTUAL.recorder.candidates).filter((row) => ["quarantined", "excluded"].includes(world.spots.find((spot) => spot.id === row.spotId)?.observed.distribution)).length,
    sameCandidateUniverseAcrossArms: records.every((row) => TREATMENT_ARMS.every((arm) => row.arms[arm].recorder.candidateCount === row.candidateCount)),
    latentTruthRuntimeInput: false, retrievalMutation: "NONE", productionAccess: "NONE",
  },
};
result.resultHash = contentHash(result);
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ status: "PASS", seed: config.seed, records: records.length, resultHash: result.resultHash, integrity: result.integrity }, null, 2)}\n`);

function uniqueHashes(values) { return [...new Set(values)]; }
