import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateDatabaseRelease } from "./validate-database-release.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), value); };

function repository() {
  const root = mkdtempSync(join(tmpdir(), "backyrd-db-release-test-"));
  git(root, ["init", "-q"]); git(root, ["config", "user.email", "ci@example.invalid"]); git(root, ["config", "user.name", "CI"]);
  const acl = hash("acl-v1"); const schema = hash("schema-v1");
  put(root, "delivery/database-baseline.json", `${JSON.stringify({ schemaVersion: "backyrd-database-evidence-v1", kind: "baseline", id: "baseline-v1", fingerprints: { publicAclSha256: acl, applicationSchemaSha256: schema } })}\n`);
  put(root, "supabase/migrations/20260101000000_initial.sql", "create table example(id uuid);\n");
  git(root, ["add", "."]); git(root, ["commit", "-qm", "baseline"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]), acl, schema };
}

test("unchanged schema resolves the prior independently verified evidence", () => {
  const fixture = repository();
  const result = validateDatabaseRelease({ root: fixture.root, baseSha: fixture.base, headSha: fixture.base, actualPublicAcl: fixture.acl, actualApplicationSchema: fixture.schema });
  assert.equal(result.evidenceId, "baseline-v1");
});

test("a forward migration accepts one exact generated, chained record", () => {
  const fixture = repository();
  const migrationPath = "supabase/migrations/20260102000000_add_note.sql";
  const testPath = "supabase/tests/add_note.sql";
  const migration = "alter table example add column note text;\n";
  const acceptance = "select true;\n";
  const candidateSchema = hash("schema-v2");
  put(fixture.root, migrationPath, migration); put(fixture.root, testPath, acceptance);
  const record = { schemaVersion: "backyrd-database-evidence-v1", kind: "release", id: "20260102-add-note", previousEvidence: "baseline-v1", previousFingerprints: { publicAclSha256: fixture.acl, applicationSchemaSha256: fixture.schema }, migrations: [{ path: migrationPath, sha256: hash(migration) }], tests: [{ path: testPath, sha256: hash(acceptance) }], fingerprints: { publicAclSha256: fixture.acl, applicationSchemaSha256: candidateSchema } };
  put(fixture.root, "delivery/database-releases/20260102-add-note.json", `${JSON.stringify(record)}\n`);
  git(fixture.root, ["add", "."]); git(fixture.root, ["commit", "-qm", "candidate"]);
  const result = validateDatabaseRelease({ root: fixture.root, baseSha: fixture.base, headSha: "HEAD", actualPublicAcl: fixture.acl, actualApplicationSchema: candidateSchema });
  assert.deepEqual(result.newMigrations, [migrationPath]);
});

test("an ACL change cannot be blessed without positive and negative tests", () => {
  const fixture = repository();
  const migrationPath = "supabase/migrations/20260102000000_grant_note.sql";
  const testPath = "supabase/tests/grant_note.sql";
  const migration = "grant select on example to authenticated;\n";
  const acceptance = "select true;\n";
  const candidateAcl = hash("acl-v2");
  put(fixture.root, migrationPath, migration); put(fixture.root, testPath, acceptance);
  put(fixture.root, "delivery/database-releases/20260102-grant-note.json", `${JSON.stringify({ schemaVersion: "backyrd-database-evidence-v1", kind: "release", id: "20260102-grant-note", previousEvidence: "baseline-v1", previousFingerprints: { publicAclSha256: fixture.acl, applicationSchemaSha256: fixture.schema }, migrations: [{ path: migrationPath, sha256: hash(migration) }], tests: [{ path: testPath, sha256: hash(acceptance) }], fingerprints: { publicAclSha256: candidateAcl, applicationSchemaSha256: fixture.schema } })}\n`);
  git(fixture.root, ["add", "."]); git(fixture.root, ["commit", "-qm", "candidate"]);
  assert.throws(() => validateDatabaseRelease({ root: fixture.root, baseSha: fixture.base, headSha: "HEAD", actualPublicAcl: candidateAcl, actualApplicationSchema: fixture.schema }), /acl_change_requires_positive_and_negative/);
});

test("database jobs consume the one resolved base and head for PR and push events", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/risk-gate.yml", import.meta.url), "utf8");
  assert.match(workflow, /base-sha: \$\{\{ steps\.plan\.outputs\.base-sha \}\}/);
  assert.match(workflow, /head-sha: \$\{\{ steps\.plan\.outputs\.head-sha \}\}/);
  assert.match(workflow, /BASE_SHA: \$\{\{ needs\.classify\.outputs\.base-sha \}\}/);
  assert.match(workflow, /HEAD_SHA: \$\{\{ needs\.classify\.outputs\.head-sha \}\}/);
});
