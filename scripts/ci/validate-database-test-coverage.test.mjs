import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateDatabaseTestCoverage } from "./validate-database-test-coverage.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const write = (root, path, value) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), value); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-db-coverage-")); git(root, ["init", "-q"]); git(root, ["config", "user.name", "CI"]); git(root, ["config", "user.email", "ci@invalid"]);
  write(root, "supabase/migrations/20260101000000_base.sql", "select 1;\n"); git(root, ["add", "."]); git(root, ["commit", "-qm", "base"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]) };
};
const commit = (f) => { git(f.root, ["add", "."]); git(f.root, ["commit", "-qm", "candidate"]); return git(f.root, ["rev-parse", "HEAD"]); };

test("additive migration selects its changed SQL test", () => {
  const f = fixture(); write(f.root, "supabase/migrations/20260102000000_add.sql", "create table public.example(id uuid);\n"); write(f.root, "supabase/tests/example.sql", "begin; select 1; rollback;\n");
  const plan = validateDatabaseTestCoverage({ root: f.root, baseSha: f.base, headSha: commit(f) });
  assert.deepEqual(plan.changedTests, ["supabase/tests/example.sql"]); assert.equal(plan.authorizationBoundary, false);
});

test("authorization change requires explicit positive and negative evidence", () => {
  const f = fixture(); write(f.root, "supabase/migrations/20260102000000_rls.sql", "alter table public.example enable row level security; create policy own on public.example using (auth.uid()=id);\n"); write(f.root, "supabase/tests/example.sql", "-- backyrd:authorization-positive\n-- backyrd:authorization-negative\nbegin; rollback;\n");
  assert.equal(validateDatabaseTestCoverage({ root: f.root, baseSha: f.base, headSha: commit(f) }).authorizationBoundary, true);
});

test("additive ALTER TABLE and a later DROP TRIGGER remain non-destructive", () => {
  const f = fixture();
  write(f.root, "supabase/migrations/20260102000000_rls.sql", "alter table public.example enable row level security;\ndrop trigger if exists example_guard on public.example;\n");
  write(f.root, "supabase/tests/example.sql", "-- backyrd:authorization-positive\n-- backyrd:authorization-negative\nbegin; select 1; rollback;\n");
  const plan = validateDatabaseTestCoverage({ root: f.root, baseSha: f.base, headSha: commit(f) });
  assert.equal(plan.authorizationBoundary, true);
  assert.deepEqual(plan.newMigrations, ["supabase/migrations/20260102000000_rls.sql"]);
});

test("missing tests, missing negative proof, destructive SQL and historical mutation fail closed", () => {
  for (const scenario of ["missing", "negative", "destructive", "mutation"]) {
    const f = fixture();
    if (scenario === "mutation") write(f.root, "supabase/migrations/20260101000000_base.sql", "select 2;\n");
    else write(f.root, "supabase/migrations/20260102000000_change.sql", scenario === "destructive" ? "drop table public.example;\n" : scenario === "negative" ? "grant select on public.example to authenticated;\n" : "create table public.example(id uuid);\n");
    if (scenario === "negative") write(f.root, "supabase/tests/example.sql", "-- backyrd:authorization-positive\nbegin; rollback;\n");
    const head = commit(f);
    assert.throws(() => validateDatabaseTestCoverage({ root: f.root, baseSha: f.base, headSha: head }), /requires_changed_sql|negative_marker_missing|destructive_database|published_migration_mutation/);
  }
});
