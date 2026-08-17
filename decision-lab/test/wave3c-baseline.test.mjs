import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { validateWave3CFreeze } from "../src/wave3c-freeze.mjs";

const artifact = JSON.parse(await readFile(new URL("../baselines/wave3c-personalized-decision-v1.json", import.meta.url), "utf8"));

test("Wave 3C result is sealed and bound to the frozen pre-result Contract", async () => {
  const freeze = await validateWave3CFreeze();
  assert.equal(freeze.valid, true, freeze.reasons.join(","));
  const { resultHash, ...body } = artifact;
  assert.equal(contentHash(body), resultHash);
  assert.equal(artifact.contractHash, freeze.frozen.contractHash);
  assert.equal(artifact.parentFreezes.tasteEngine, "2a4a9e2f7353ad20d10073a00ccfb235778d64d5730f5e7771a4787f92a2116f");
  assert.equal(artifact.parentFreezes.tasteTreatment, "ab2339de028fb5ed04999ea682d6a38d9434e75350993fb4963c518c8af15116");
});

test("mandatory diagnostic coverage and integrity are fail-closed and complete", () => {
  assert.equal(artifact.coverage.pass, true);
  assert.ok(Object.values(artifact.coverage.arms).every(Boolean));
  assert.deepEqual(artifact.metrics.integrity, {
    hardConstraintViolations: 0,
    productEligibilityViolations: 0,
    distributionEligibilityViolations: 0,
    sameCandidateUniverseAcrossArms: true,
    latentTruthRuntimeInput: false,
    retrievalMutation: "NONE",
    productionAccess: "NONE",
  });
});

test("negative personalization result remains honest and cannot be promoted", () => {
  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.integrationVerdict, "NOT_PROMOTED");
  assert.equal(artifact.wave4Readiness, "NOT_READY");
  assert.equal(artifact.gates.personalizationLift, false);
  assert.equal(artifact.gates.contextualDecision, false);
  assert.equal(artifact.gates.differentUsers, false);
  assert.equal(artifact.gates.confidenceAware, false);
  assert.equal(artifact.gates.matureBenefit, false);
  assert.equal(artifact.gates.currentIntentAuthority, true);
  assert.equal(artifact.gates.hardConstraints, true);
  assert.equal(artifact.scientificValidity.status, "PASS");
});
