import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDecisionBuildArtifact, verifyDecisionBuildArtifact } from "./decision-build-artifact.mjs";
import { PHASE2_TEST_SHARDS, REQUIRED_DECISION_SHARDS } from "./decision-test-plan.mjs";
import { validateDecisionTestPlan } from "./validate-decision-test-plan.mjs";
import { verifyDecisionShards } from "./verify-decision-shards.mjs";

const testSource = Object.values(PHASE2_TEST_SHARDS).flat().map((title) => `test(${JSON.stringify(title)}, async () => {});`).join("\n");

test("every Phase-2 integration test is routed exactly once and deletion is fail-closed", () => {
  assert.equal(validateDecisionTestPlan({ source: testSource }).outcome, "PASS");
  assert.throws(() => validateDecisionTestPlan({ source: testSource.split("\n").slice(1).join("\n") }), /decision_test_deleted_or_renamed/);
  const additional = `${testSource}\ntest("new unrouted invariant", async () => {});`;
  assert.throws(() => validateDecisionTestPlan({ source: additional }), /decision_test_not_routed/);
});

test("required shard aggregation rejects missing, skipped, failed, and additional results", () => {
  const success = Object.fromEntries(REQUIRED_DECISION_SHARDS.map((name) => [name, "success"]));
  assert.equal(verifyDecisionShards({ results: success }).outcome, "PASS");
  const missing = { ...success }; delete missing[REQUIRED_DECISION_SHARDS[0]];
  assert.throws(() => verifyDecisionShards({ results: missing }), /decision_shard_missing/);
  assert.throws(() => verifyDecisionShards({ results: { ...success, [REQUIRED_DECISION_SHARDS[0]]: "skipped" } }), /skipped/);
  assert.throws(() => verifyDecisionShards({ results: { ...success, [REQUIRED_DECISION_SHARDS[0]]: "failure" } }), /failure/);
  assert.throws(() => verifyDecisionShards({ results: { ...success, attacker: "success" } }), /decision_shard_unexpected/);
});

function put(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}

function artifactFixture() {
  const root = mkdtempSync(join(tmpdir(), "backyrd-decision-artifact-"));
  put(root, "package-lock.json", "locked\n");
  for (const path of [
    "packages/world-knowledge-core/src/index.ts", "packages/user-intelligence-vnext-core/src/index.ts", "packages/decision-vnext-core/src/index.ts",
    "packages/decision-vnext-core/test/sample.test.mjs", "packages/decision-vnext-core/sandbox/config.json", "decision-lab/src/index.mjs",
    "decision-lab/test/sample.test.mjs", "decision-lab/config/config.json", "scripts/ci/decision-test-plan.mjs",
    ".github/workflows/risk-gate.yml", "delivery/change-policy.json", "package.json", "scripts/ci/decision-build-artifact.mjs", "scripts/ci/decision-fast-lane.test.mjs",
    "scripts/ci/run-decision-ci.mjs", "scripts/ci/validate-decision-test-plan.mjs", "scripts/ci/verify-decision-shards.mjs",
    "packages/world-knowledge-core/dist/index.js", "packages/user-intelligence-vnext-core/dist/index.js", "packages/decision-vnext-core/dist/index.js",
  ]) put(root, path, `${path}\n`);
  return root;
}

test("build artifact is source-, lockfile-, runtime-, test-plan-, and byte-bound", () => {
  const root = artifactFixture();
  const manifest = createDecisionBuildArtifact(root);
  assert.throws(() => verifyDecisionBuildArtifact(root, { ...manifest, artifactHash: "0".repeat(64) }), /decision_artifact_integrity_mismatch/);
  assert.equal(verifyDecisionBuildArtifact(root, manifest).artifactHash, manifest.artifactHash);
  put(root, "packages/decision-vnext-core/dist/index.js", "tampered build\n");
  assert.throws(() => verifyDecisionBuildArtifact(root, manifest), /decision_artifact_integrity_mismatch/);
});

test("old fixture or build artifact cannot cross a changed source tree", () => {
  const root = artifactFixture();
  const manifest = createDecisionBuildArtifact(root);
  put(root, "packages/decision-vnext-core/src/index.ts", "new source tree\n");
  assert.throws(() => verifyDecisionBuildArtifact(root, manifest), /decision_artifact_integrity_mismatch/);
});

test("CI runner has no Production execution or commercial input channel", () => {
  const runner = readFileSync(new URL("./run-decision-ci.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /supabase-production|production-plan|payment|subscription|sponsor|ownerTier/i);
});

test("GitHub transfers the non-hidden immutable manifest to every Decision shard", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/risk-gate.yml", import.meta.url), "utf8");
  assert.match(workflow, /--create decision-ci-artifact\.json/);
  assert.equal((workflow.match(/--verify decision-ci-artifact\.json/g) ?? []).length, 3);
  assert.doesNotMatch(workflow, /\.decision-ci-artifact\.json/);
});

test("Decision Lab retains full Git history required by lineage and freeze tests", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/risk-gate.yml", import.meta.url), "utf8");
  const decisionLab = workflow.split("\n  decision-lab:\n")[1]?.split("\n  decision:\n")[0] ?? "";
  assert.match(decisionLab, /actions\/checkout@[a-f0-9]+[^]*fetch-depth: 0/);
});

test("PR topology shares setup for functional coverage and splits only the sandbox critical path", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/risk-gate.yml", import.meta.url), "utf8");
  const runner = readFileSync(new URL("./run-decision-ci.mjs", import.meta.url), "utf8");
  assert.match(workflow, /--group functional/);
  assert.match(runner, /group === "functional"[^]*runGroup\("phase2-all"\)/);
  assert.match(workflow, /group: \[sandbox-worlds, sandbox-profiles\]/);
  assert.doesNotMatch(workflow, /matrix:\n\s+shard: \[phase2-/);
  assert.doesNotMatch(workflow, /--group phase2-all/);
});
