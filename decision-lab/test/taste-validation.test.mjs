import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { buildUserTasteMap, validateTasteEngineScientificBoundary } from "../src/taste-engine.mjs";
import { validateTasteValidationFreeze } from "../src/taste-validation-freeze.mjs";
import {
  ARCHETYPES, buildScopedHistory, evaluateScopedTaste, evaluateTasteMap, runNoiseDiagnostic,
  evaluateDiagnosticCoverage, evaluatePromotion, runSafetyDiagnostics, simulateLifecycle, spearman
} from "../src/taste-validation.mjs";

const AS_OF = "2026-01-01T12:00:00.000Z";
const contract = JSON.parse(await readFile(new URL("../config/taste-validation-contract-v1.1.json", import.meta.url), "utf8"));

test("the prospective validation contract is frozen independently of engine outcomes", async () => {
  const result = await validateTasteValidationFreeze();
  assert.equal(result.valid, true, result.reasons.join(","));
  assert.equal(result.actual.contractVersion, "backyrd-taste-validation-contract-v1.1");
  assert.equal(contract.scientificControls.thresholdMutationAfterResults, "PROHIBITED");
  assert.equal(contract.scientificControls.latentTruthFeedsEngine, false);
  assert.equal(contract.promotion.compositeCompensation, false);
});

test("same seed creates reproducible observed history without latent labels in engine input", () => {
  const archetype = ARCHETYPES[0];
  const first = simulateLifecycle({ archetype, seed: 3101, count: 50 });
  const second = simulateLifecycle({ archetype, seed: 3101, count: 50 });
  assert.equal(contentHash(first), contentHash(second));
  assert.equal(validateTasteEngineScientificBoundary(first), true);
  assert.equal(JSON.stringify(first).includes(archetype.id), true);
  assert.equal(JSON.stringify(first).includes("truth"), false);
});

test("evaluator sees latent taste only after the engine produced its map", () => {
  const archetype = ARCHETYPES[1];
  const observed = simulateLifecycle({ archetype, seed: 3102, count: 100 });
  const map = buildUserTasteMap(observed, { asOf: AS_OF });
  assert.equal(JSON.stringify(map).includes("trueAffinity"), false);
  const evaluated = evaluateTasteMap(map, archetype.truth);
  assert.ok(evaluated.rows.every((row) => "trueAffinity" in row));
  assert.ok(Number.isFinite(spearman(evaluated.rows)));
});

test("new user, exposure, not-there, one-off, idempotency, consent and intent controls are executable", () => {
  const empty = buildUserTasteMap([], { asOf: AS_OF });
  assert.equal(empty.rows.length, 0);
  const safety = runSafetyDiagnostics({ asOf: AS_OF });
  assert.equal(safety.exposureRows, 0);
  assert.equal(safety.idempotentReplay, true);
  assert.equal(safety.consentRejected, true);
  assert.equal(safety.currentIntentAuthority, true);
  assert.ok(safety.oneOffAffinity < 0.35);
});

test("place-type and contextual validation use one observed history and distinct projections", () => {
  const observed = buildScopedHistory({ seed: 3101 });
  assert.equal(validateTasteEngineScientificBoundary(observed), true);
  const result = evaluateScopedTaste(buildUserTasteMap(observed, { asOf: AS_OF }));
  assert.ok(Number.isFinite(result.contextualDirectionAccuracy));
  assert.ok(Number.isFinite(result.placeTypeDirectionAccuracy));
  assert.notEqual(result.contexts.family.projection.projectionHash, result.contexts.friends.projection.projectionHash);
});

test("noise and gaming diagnostics expose rather than hide false learning", () => {
  const first = runNoiseDiagnostic({ seed: 3101 });
  const second = runNoiseDiagnostic({ seed: 3101 });
  assert.deepEqual(first, second);
  assert.ok(first.learnedRows > 0);
  assert.ok(first.maxAffinity <= 1);
});

test("all declared lifecycle cohorts and three seeds are prospectively covered", () => {
  assert.deepEqual(contract.seeds, [3101, 3102, 3103]);
  assert.deepEqual(contract.learningCheckpoints, [0, 5, 10, 25, 50, 100, 200]);
  assert.equal(ARCHETYPES.length, 10);
  assert.ok(Object.keys(contract.cohorts).includes("LONG_TERM_USER"));
  assert.ok(Object.keys(contract.cohorts).includes("ONBOARDING_ONLY"));
});

test("every previously omitted prospective gate independently blocks promotion", () => {
  const passing = {
    overall: { directionAccuracy: 1, affinityAccuracy: 1, rankCorrelation: 1, topPreferenceRecall: 1, falsePreferenceRate: 0, falseNegativePreferenceRate: 0, negativeDirectionAccuracy: 1 },
    mature: { directionAccuracy: 1, rankCorrelation: 1, topPreferenceRecall: 1 },
    confidence: { ece: 0, highConfidenceAccuracy: 1 },
    scoped: { contextualDirectionAccuracy: 1, placeTypeDirectionAccuracy: 1, contextualAdaptation: 1, globalRetention: 1 },
    drift: { directionAccuracy: 1, adaptationEvents: 1 }, noise: { falsePreferenceRate: 0 },
    safety: { currentIntentAuthority: true, oneOffAffinity: 0, consentRejected: true, idempotentReplay: true, exposureRows: 0 },
    onboarding: { corrected: true, correctionEvents: 1 }, coverage: { pass: true }
  };
  assert.equal(evaluatePromotion(passing, contract).pass, true);
  for (const [field, mutate] of [
    ["falseNegativeLearning", (value) => { value.overall.falseNegativePreferenceRate = 1; }],
    ["contextualAdaptation", (value) => { value.scoped.contextualAdaptation = 0; }],
    ["globalRetention", (value) => { value.scoped.globalRetention = 0; }]
  ]) {
    const metrics = structuredClone(passing); mutate(metrics);
    const result = evaluatePromotion(metrics, contract);
    assert.equal(result.gates[field], false, field);
    assert.equal(result.pass, false, field);
  }
});

test("mandatory diagnostic coverage fails closed for every missing or non-executable arm", () => {
  const complete = Object.fromEntries(contract.coverageRequirements.mandatoryArms.map((id) => [id, { executable: true, measurements: 1 }]));
  assert.equal(evaluateDiagnosticCoverage(complete, contract).pass, true);
  for (const id of contract.coverageRequirements.mandatoryArms) {
    const missing = structuredClone(complete); delete missing[id];
    const absent = evaluateDiagnosticCoverage(missing, contract);
    assert.equal(absent.pass, false, id);
    assert.ok(absent.missing.includes(id), id);
    const disabled = structuredClone(complete); disabled[id].executable = false;
    assert.equal(evaluateDiagnosticCoverage(disabled, contract).pass, false, id);
    const empty = structuredClone(complete); empty[id].measurements = 0;
    assert.equal(evaluateDiagnosticCoverage(empty, contract).pass, false, id);
  }
});
