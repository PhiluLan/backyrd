import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot } from "../src/io.mjs";
import { validateN6AFreeze } from "../src/n6a-freeze.mjs";

test("N6A pre-external-run freeze matches all executable contracts", async () => {
  const result = await validateN6AFreeze(); assert.equal(result.valid, true, result.reasons.join(","));
  assert.equal(result.frozen.frozenBeforeExternalRun, true); assert.equal(result.frozen.officialResultHash, null);
});
test("N6A dry-run evidence is secret-free and made no calls", async () => {
  const result = JSON.parse(await readFile(resolve(repoRoot, "decision-lab/baselines/n6a-ai-decision-buddy-dry-run-v1.json"), "utf8"));
  assert.equal(result.externalAiCalls, 0); assert.equal(result.secretMaterialPresent, false); assert.equal(result.production, "UNCHANGED");
  assert.doesNotMatch(JSON.stringify(result), /sk-[A-Za-z0-9_-]{12,}/);
});
