import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { classifyChange } from "./classify-change.mjs";

const policy = {
  decisionTrustAnchor: "decision-lab/config/anchor.json",
  surfacePrefixes: { mobile: ["mobile/"], web: ["web/"], admin: ["admin-dashboard/"], shared: ["packages/shared/"] },
  databasePrefixes: ["supabase/migrations/", "supabase/canonical/", "supabase/tests/"],
  authorizationPrefixes: ["supabase/canonical/auth_hooks.sql", "supabase/canonical/storage.sql"],
  decisionSemanticPrefixes: ["supabase/functions/decision-v13/"],
  decisionEvaluationPrefixes: ["decision-lab/"],
  deliveryControlPrefixes: [".github/workflows/", "scripts/ci/", "scripts/deployment/", "docs/operations/"],
  releaseEvidencePrefixes: ["docs/operations/releases/"],
};
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-classify-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  put(root, "decision-lab/config/anchor.json", JSON.stringify({ protectedSemanticSourceSet: { paths: ["mobile/lib/protected-decision.ts"] } }));
  put(root, "README.md", "base\n");
  const base = commit(root, "base");
  return { root, base };
};
const plan = ({ files }) => {
  const { root, base } = fixture();
  for (const [path, value] of Object.entries(files)) put(root, path, value);
  const head = commit(root, "candidate");
  const context = { baseSha: base, headSha: head };
  return classifyChange({ root, context, policy });
};

for (const [label, path, flag] of [
  ["Mobile presentation", "mobile/components/Card.tsx", "mobile"],
  ["Web presentation", "web/components/Card.tsx", "web"],
  ["Admin presentation", "admin-dashboard/components/Card.tsx", "admin"],
  ["shared Product contract", "packages/shared/src/contract.ts", "shared"],
]) test(`${label} selects only its relevant surface gate`, () => {
  const result = plan({ files: { [path]: "export const value = true;\n" } });
  assert.equal(result.flags[flag], true);
  assert.equal(result.flags.decisionSemantics, false);
  assert.equal(result.flags.database, false);
});

test("additive migration is separated from authorization and destructive changes", () => {
  const result = plan({ files: { "supabase/migrations/20260101000000_add_column.sql": "alter table public.example add column note text;\n" } });
  assert.deepEqual(result.classes, ["database-additive"]);
  assert.deepEqual(result.blockedReasons, []);
});

test("RLS migration selects the strict authorization boundary", () => {
  const result = plan({ files: { "supabase/migrations/20260101000000_add_rls.sql": "create policy own_rows on public.example to authenticated using ((select auth.uid()) = user_id);\n" } });
  assert.equal(result.flags.authorizationBoundary, true);
  assert.ok(result.classes.includes("authorization-boundary"));
});

test("destructive migration is a separate blocked class", () => {
  const result = plan({ files: { "supabase/migrations/20260101000000_drop_data.sql": "drop table public.example;\n" } });
  assert.ok(result.classes.includes("destructive-production-operation"));
  assert.ok(result.blockedReasons.includes("destructive_migration_requires_separate_founder_cto_authorization"));
});

test("protected source changes select Decision recertification while evaluator-only changes do not", () => {
  const source = plan({ files: { "mobile/lib/protected-decision.ts": "export const semantic = 2;\n" } });
  assert.equal(source.flags.decisionSemantics, true);
  const evaluator = plan({ files: { "decision-lab/test/new.test.mjs": "// test\n" } });
  assert.equal(evaluator.flags.decisionSemantics, false);
  assert.equal(evaluator.flags.decisionEvaluation, true);
});

test("published migration mutation is identified independently", () => {
  const { root, base } = fixture();
  put(root, "supabase/migrations/20260101000000_existing.sql", "select 1;\n");
  const withMigration = commit(root, "published migration");
  put(root, "supabase/migrations/20260101000000_existing.sql", "select 2;\n");
  const head = commit(root, "mutated migration");
  const result = classifyChange({ root, context: { baseSha: withMigration, headSha: head }, policy });
  assert.equal(result.flags.migrationMutation, true);
  assert.ok(result.blockedReasons.includes("published_migration_mutation"));
  assert.notEqual(base, head);
});
