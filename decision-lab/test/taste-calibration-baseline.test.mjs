import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { validateTasteEngineFreeze } from "../src/taste-engine-freeze.mjs";
import { validateTasteValidationFreeze } from "../src/taste-validation-freeze.mjs";

const artifact = JSON.parse(await readFile(new URL("../baselines/wave3b1-taste-calibration-v1.json", import.meta.url), "utf8"));

test("the Wave 3B.1 result is sealed against the unchanged validation contract", async () => {
  const sealed = structuredClone(artifact); delete sealed.resultHash;
  assert.equal(contentHash(sealed), artifact.resultHash);
  const [engine, validation] = await Promise.all([validateTasteEngineFreeze(), validateTasteValidationFreeze()]);
  assert.equal(engine.valid, true, engine.reasons.join(","));
  assert.equal(validation.valid, true, validation.reasons.join(","));
  assert.equal(artifact.parentTasteEngineFreezeHash, contentHash(engine.frozen));
  assert.equal(artifact.validationFreezeHash, validation.freezeHash);
  assert.equal(validation.actual.contractHash, "52cccacc7942975d1662a8bf88f1472cf259753da172d61d6682079a95de202d");
  assert.equal(validation.actual.validationRuntimeSourceHash, "254602f1e024d94ae8267618b45ecfdb576333f4941553460e34f68ba9f506a9");
  assert.equal(validation.actual.officialRunnerSourceHash, "4d3d7a890b15f5ef6d505da31a05eee870094998bcefb1f6cc993e916be8aec4");
});

test("all unchanged Wave 3B gates pass without scientific-boundary regression", () => {
  assert.equal(artifact.metrics.coverage.pass, true);
  assert.equal(artifact.metrics.coverage.executable, 14);
  assert.equal(artifact.promotion.pass, true);
  assert.ok(Object.values(artifact.promotion.gates).every(Boolean));
  assert.deepEqual(artifact.scientificValidity, {
    status: "PASS", engineMutation: "NONE", latentTruthFeedsEngine: false, thresholdsFrozenBeforeRun: true,
    productionAccess: "NONE", finalRankingIntegration: "NONE", groundTruthRole: "EVALUATOR_ONLY"
  });
  assert.equal(artifact.wave3cReadiness, "READY");
});
