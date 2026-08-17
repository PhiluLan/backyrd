import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { validateTasteEngineFreeze } from "../src/taste-engine-freeze.mjs";
import { validateTasteValidationFreeze } from "../src/taste-validation-freeze.mjs";

const artifact = JSON.parse(await readFile(new URL("../baselines/wave3b-taste-validation-v1.1.json", import.meta.url), "utf8"));

test("the official Wave 3B baseline is sealed, complete and bound to valid freezes", async () => {
  const sealed = structuredClone(artifact); delete sealed.resultHash;
  assert.equal(contentHash(sealed), artifact.resultHash);
  assert.equal(artifact.resultHash, "cde2ea2440116aacb644a220797f1ab937b39f02ed6e8bf27438e3a8bb3cdec2");
  assert.deepEqual(artifact.sample, { seeds: 3, archetypes: 10, checkpoints: 7, lifecycleEvaluations: 210, maxInformativeEvents: 200 });
  const [engine, validation] = await Promise.all([validateTasteEngineFreeze(), validateTasteValidationFreeze()]);
  assert.equal(engine.valid, true, engine.reasons.join(","));
  assert.equal(validation.valid, true, validation.reasons.join(","));
  assert.equal(artifact.parentTasteEngineFreezeHash, contentHash(engine.frozen));
  assert.equal(artifact.validationFreezeHash, validation.freezeHash);
});

test("scientific controls hold and every prospective gate is present", () => {
  assert.deepEqual(artifact.scientificValidity, {
    status: "PASS", engineMutation: "NONE", latentTruthFeedsEngine: false, thresholdsFrozenBeforeRun: true,
    productionAccess: "NONE", finalRankingIntegration: "NONE", groundTruthRole: "EVALUATOR_ONLY"
  });
  for (const gate of ["falseNegativeLearning", "contextualAdaptation", "globalRetention"]) assert.equal(typeof artifact.promotion.gates[gate], "boolean", gate);
  assert.equal(Object.keys(artifact.promotion.gates).length, 21);
  assert.equal(artifact.promotion.gates.diagnosticCoverage, true);
  assert.equal(artifact.metrics.coverage.pass, true);
  assert.equal(artifact.metrics.coverage.coverage, 1);
  assert.equal(artifact.metrics.coverage.required, 14);
});

test("the failed quality verdict and Wave 3C block are preserved honestly", () => {
  assert.equal(artifact.promotion.pass, false);
  assert.equal(artifact.promotion.verdict, "FAIL");
  assert.equal(artifact.engineVerdict, "MIXED");
  assert.equal(artifact.wave3cReadiness, "NOT_READY");
  assert.equal(artifact.promotion.gates.falsePreference, false);
  assert.equal(artifact.promotion.gates.confidenceCalibration, false);
  assert.equal(artifact.promotion.gates.contextualAdaptation, false);
  assert.equal(artifact.promotion.gates.driftAdaptation, false);
  assert.equal(artifact.promotion.gates.noiseResistance, false);
  assert.equal(artifact.promotion.gates.falseNegativeLearning, true);
});
