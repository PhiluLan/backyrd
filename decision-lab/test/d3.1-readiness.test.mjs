import test from "node:test";
import assert from "node:assert/strict";
import { d31Preflight, D31_EXPECTED } from "../src/d3.1-readiness.mjs";

test("D3.1 research preflight remains paused after the production V13 successor", async () => {
  const result = await d31Preflight();
  assert.equal(result.status, "FAIL");
  assert.equal(result.parentFreezeValid, false);
  assert.equal(result.treatmentFreezeValid, true);
  assert.equal(result.scientificValidity, "PASS");
  assert.equal(result.engineMutation, "DETECTED");
  assert.equal(result.identities.parentFreezeManifestHash, D31_EXPECTED.parentFreezeManifestHash);
  assert.equal(result.identities.personalizationTreatmentFreezeHash, D31_EXPECTED.personalizationTreatmentFreezeHash);
  assert.notEqual(result.identities.engineSourceHash, D31_EXPECTED.engineSourceHash);
  assert.deepEqual(result.reasons, [
    "PARENT:HASH_MISMATCH:engineSourceHash",
    "PARENT:HASH_MISMATCH:freezeManifestHash",
    "PARENT:ENGINE_MUTATION_DETECTED",
    "IDENTITY_MISMATCH:engineSourceHash",
  ]);
  assert.equal(result.productionAccess, "NONE");
});
