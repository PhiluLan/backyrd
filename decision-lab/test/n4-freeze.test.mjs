import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { validateN4Freeze } from "../src/n4-freeze.mjs";

test("N4 identity validates before and after the official result without weakening either mode", async () => {
  const baseline = new URL("../baselines/n4-spot-intelligence-v1.json", import.meta.url);
  const preflight = !existsSync(baseline);
  const result = await validateN4Freeze({ preflight });
  assert.equal(result.valid, true, result.reasons.join(","));
  assert.equal(result.mode, preflight ? "PRE_OFFICIAL_RUN" : "SEALED_RESULT");
});
