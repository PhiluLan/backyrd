import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const committed = JSON.parse(readFileSync(new URL("../../docs/world-knowledge/slice-3a/policy-calibration.aggregate.json", import.meta.url), "utf8"));

test("policy calibration artifact is deterministic, draft-only and synthetic", () => {
  const generated = JSON.parse(execFileSync(process.execPath, ["scripts/world-knowledge/build-policy-calibration-artifact.mjs"], { cwd: root, encoding: "utf8" }));
  assert.deepEqual(generated, committed);
  assert.equal(generated.status, "DRAFT_CANDIDATE");
  assert.equal(generated.productionDataUsed, false);
  assert.equal(generated.results.length, 8);
  assert.ok(generated.results.every((result) => result.policyVersion.startsWith("draft:world-knowledge-slice-3a:")));
  assert.match(generated.artifactHash, /^[a-f0-9]{64}$/);
});
