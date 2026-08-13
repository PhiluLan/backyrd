import test from "node:test";
import assert from "node:assert/strict";
import { d31Preflight, D31_EXPECTED } from "../src/d3.1-readiness.mjs";

test("D3.1 preflight preserves both freezes, Scientific Validity and V13 source", async () => {
  const result = await d31Preflight();
  assert.equal(result.status, "PASS", JSON.stringify(result.reasons));
  assert.equal(result.parentFreezeValid, true);
  assert.equal(result.treatmentFreezeValid, true);
  assert.equal(result.scientificValidity, "PASS");
  assert.equal(result.engineMutation, "NONE");
  assert.deepEqual(result.identities, D31_EXPECTED);
  assert.equal(result.productionAccess, "NONE");
});
