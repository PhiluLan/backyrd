import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldWeek3Foundation, WORLD_WEEK3_CANONICAL_BASE_SHA, WORLD_WEEK3_CANONICAL_TREE_SHA } from "./build-week3-internal-allowlist-foundation.mjs";

test("Week 3 binds the exact canonical base and unchanged nine-migration bundle", () => {
  const report = buildWorldWeek3Foundation();
  assert.equal(report.canonicalMainSha, WORLD_WEEK3_CANONICAL_BASE_SHA);
  assert.equal(report.canonicalTreeSha, WORLD_WEEK3_CANONICAL_TREE_SHA);
  assert.equal(report.migrationCount, 9);
  assert.equal(report.exactMigrationPaths.length, 9);
  assert.equal(new Set(report.exactMigrationHashes).size, 9);
  assert.equal(report.migrationBundleHash, "8a642e025701cb02a769fcdf7fda4390f955bad08478a2690ae512a6c197d066");
});

test("committed allowlist release is empty, NOT_CONFIGURED and cannot authorize Production", () => {
  const report = buildWorldWeek3Foundation();
  assert.deepEqual(report.allowlist.entries, []);
  assert.equal(report.allowlist.authorityStatus, "NOT_CONFIGURED");
  assert.equal(report.allowlist.expirationPolicy, "NOT_CONFIGURED");
  assert.equal(report.allowlist.executionAuthorized, false);
  assert.equal(report.authority.realAllowlistMembers, 0);
  assert.equal(report.authority.productionCredentialsUsed, false);
});

test("post-deploy evidence is explicitly not executed without Production authority", () => {
  const report = buildWorldWeek3Foundation();
  assert.equal(report.postDeployEvidence.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY");
  assert.equal(report.postDeployEvidence.executionAuthorized, false);
  assert.equal(report.postDeployEvidence.allowlistHash, report.allowlist.releaseHash);
  assert.equal(report.postDeployEvidence.releaseArtifactHash, report.releaseArtifactHash);
});

test("Week 3 report is byte-deterministic", () => {
  assert.deepEqual(buildWorldWeek3Foundation(), buildWorldWeek3Foundation());
  assert.equal(JSON.stringify(buildWorldWeek3Foundation()), JSON.stringify(buildWorldWeek3Foundation()));
});
