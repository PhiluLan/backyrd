import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { validateWave4Freeze } from "../src/wave4-freeze.mjs";

const artifact = JSON.parse(await readFile(new URL("../baselines/wave4-contextual-utility-fusion-v1.json", import.meta.url), "utf8"));

test("Wave 4 result is sealed and bound to the pre-result Contract", async () => {
  const freeze = await validateWave4Freeze();
  assert.equal(freeze.valid, true, freeze.reasons.join(","));
  const { resultHash, ...body } = artifact;
  assert.equal(contentHash(body), resultHash);
  assert.equal(artifact.contractHash, freeze.frozen.contractHash);
  assert.equal(artifact.freezeHash, freeze.freezeHash);
});

test("Wave 4 mandatory coverage and authority boundaries are fail-closed", () => {
  assert.equal(artifact.coverage.pass, true);
  assert.ok(Object.values(artifact.coverage.arms).every(Boolean));
  assert.deepEqual(artifact.metrics.integrity, {
    hardConstraintViolations: 0,
    productEligibilityViolations: 0,
    distributionEligibilityViolations: 0,
    sameCandidateUniverseAcrossArms: true,
    latentTruthRuntimeInput: false,
    retrievalMutation: "NONE",
    tasteEngineMutation: "NONE",
    productionAccess: "NONE",
  });
});

test("failed Wave 4 experiment remains negative evidence and cannot promote", () => {
  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.coreVerdict, "NOT_PROMOTED");
  assert.equal(artifact.nextWaveReadiness, "NOT_READY");
  assert.equal(artifact.gates.overallDecisionQuality, false);
  assert.equal(artifact.gates.utilityFusionLift, false);
  assert.equal(artifact.gates.personalizationValue, false);
  assert.equal(artifact.gates.currentIntentAuthority, true);
  assert.equal(artifact.gates.hardConstraints, true);
  assert.equal(artifact.scientificValidity.status, "PASS");
});
