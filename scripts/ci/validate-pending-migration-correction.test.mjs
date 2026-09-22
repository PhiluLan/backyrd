import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validatePendingMigrationCorrection } from "./validate-pending-migration-correction.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "backyrd-migration-correction-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  const migrationPath = "supabase/migrations/20260922183824_growth.sql";
  const testPath = "supabase/tests/growth.sql";
  const previous = "select 'unsafe';\n"; const corrected = "select 'safe';\n"; const testSource = "-- backyrd:authorization-positive\n-- backyrd:authorization-negative\nselect true;\n";
  put(root, migrationPath, previous); put(root, testPath, "select true;\n");
  put(root, "delivery/production-state.json", `${JSON.stringify({ supabase: { migrationTip: "20260922165937_prior" } })}\n`);
  put(root, "delivery/database-releases/prior.json", `${JSON.stringify({ migrations: [{ path: migrationPath, sha256: hash(previous) }] })}\n`);
  const base = commit(root, "failed canonical main");
  put(root, migrationPath, corrected); put(root, testPath, testSource);
  const id = "20260922183824-growth";
  put(root, `delivery/database-corrections/${id}.json`, `${JSON.stringify({
    schemaVersion: "backyrd-database-migration-correction-v1", id, projectRef: "hjgcrrzfjchzqoegcywn",
    failedCanonicalMainSha: base, failedDeploymentRunId: 35771311354, failureStage: "TRANSACTION_ROLLED_BACK",
    productionEffect: "NONE_MIGRATION_NOT_RECORDED", rootCauseCode: "HISTORICAL_DECISION_ID_NOT_UUID",
    migration: { path: migrationPath, previousSha256: hash(previous), correctedSha256: hash(corrected) },
    test: { path: testPath, sha256: hash(testSource) },
  }, null, 2)}\n`);
  const head = commit(root, "reviewed correction");
  return { root, base, head, migrationPath };
}

test("an exact rolled-back pending migration correction is auditable", () => {
  const value = fixture();
  const result = validatePendingMigrationCorrection({ root: value.root, baseSha: value.base, headSha: value.head });
  assert.equal(result.id, "20260922183824-growth");
  assert.equal(result.migration.path, value.migrationPath);
});

test("changed corrected bytes fail closed", () => {
  const value = fixture();
  put(value.root, value.migrationPath, "select 'different';\n");
  const tampered = commit(value.root, "tamper");
  assert.throws(() => validatePendingMigrationCorrection({ root: value.root, baseSha: value.base, headSha: tampered }), /scope_invalid|bytes_invalid/);
});
