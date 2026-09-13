import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { postgresJsonbText } from "./postgres-jsonb-canonical.mjs";
const sql = readFileSync(new URL("./production-legacy-export-readonly-v1.sql", import.meta.url), "utf8").toLowerCase();
test("production query pack is explicitly read-only and bounded", () => {
  assert.match(sql, /begin transaction read only/); assert.match(sql, /statement_timeout/); assert.match(sql, /lock_timeout/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|upsert|alter|create|drop|truncate|call)\b/);
});
test("production query excludes authority, commercial and user data", () => {
  for (const forbidden of ["auth.users", "owner_tier", "subscription", "billing", "user_intelligence", "admin_notes"]) assert.equal(sql.includes(`from ${forbidden}`), false);
  assert.match(sql, /public\.spots/); assert.match(sql, /public\.spot_hours/); assert.match(sql, /public\.categories/);
});
test("production query matches the audited legacy schema", () => {
  assert.match(sql, /'category',c\.name/);
  assert.doesNotMatch(sql, /c\.slug|s\.description/);
});
test("MCP stdin transport normalizes the database timestamp and protects its artifact", () => {
  const directory = mkdtempSync(join(tmpdir(), "wk-legacy-export-"));
  const output = join(directory, "export.json");
  try {
    execFileSync(process.execPath, [new URL("./export-production-legacy-spots.mjs", import.meta.url).pathname, output], {
      cwd: new URL("../..", import.meta.url),
      env: { ...process.env, WK_LEGACY_EXPORT_STDIN: "1" },
      input: `${JSON.stringify({ queryVersion: "backyrd.world-knowledge.production-legacy-export-query@4a.1", sourceSnapshotAt: "2026-09-11T22:26:18.101636+00:00", statusCounts: { approved: 1 }, records: [{ spotId: "transport-test", lifecycle: "ACTIVE_PUBLISHED", fields: { name: "Test" } }], excludedDataClasses: [] })}\n`,
    });
    const artifact = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(artifact.sourceSnapshotAt, "2026-09-11T22:26:18.101Z");
    assert.equal(statSync(output).mode & 0o777, 0o600);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("client import hashing uses PostgreSQL jsonb key order", () => {
  assert.equal(postgresJsonbText({ aa: 1, b: 3, a: 2 }), '{"a": 2, "b": 3, "aa": 1}');
});
