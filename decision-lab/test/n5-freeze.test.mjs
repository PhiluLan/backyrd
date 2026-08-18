import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { validateN5Freeze } from "../src/n5-freeze.mjs";

test("N5 identity validates before and after the official result without weakening either mode", async () => {
  const baseline = new URL("../baselines/n5-relevant-user-projection-v1.json", import.meta.url);
  const preflight = !existsSync(baseline);
  const result = await validateN5Freeze({ preflight });
  assert.equal(result.valid, true, result.reasons.join(","));
  assert.equal(result.mode, preflight ? "PRE_OFFICIAL_RUN" : "SEALED_RESULT");
});
