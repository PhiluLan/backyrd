import test from "node:test";
import assert from "node:assert/strict";
import { validateN3Freeze } from "../src/n3-freeze.mjs";

test("the sealed N3 engine, validation contract and official result retain their frozen identities", async () => {
  const result = await validateN3Freeze();
  assert.equal(result.valid, true, result.reasons.join(","));
  assert.equal(result.mode, "SEALED_RESULT");
});
