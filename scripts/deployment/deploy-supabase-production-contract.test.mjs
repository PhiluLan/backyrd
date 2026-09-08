import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Production migration deployment links the bound project and reuses exact scope verification", async () => {
  const script = await readFile(
    new URL("./deploy-supabase-production.sh", import.meta.url),
    "utf8",
  );
  const link = script.indexOf("supabase link --project-ref hjgcrrzfjchzqoegcywn");
  const dryRun = script.indexOf("supabase db push --dry-run");
  const verify = script.indexOf("verify-supabase-migration-dry-run.mjs");
  const apply = script.indexOf("supabase db push --yes");

  assert.ok(link >= 0);
  assert.ok(link < dryRun);
  assert.ok(dryRun < verify);
  assert.ok(verify < apply);
  assert.match(script, /\.pendingMigrations \/\/ \.migrations/);
});

test("Production deployment remains explicit-manual and canonical-main-only", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/supabase-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /canonical_main_sha:/);
  assert.match(workflow, /release_confirmation:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.release_confirmation == 'DEPLOY_SUPABASE_PRODUCTION'/);
  assert.doesNotMatch(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /verify-manual-production-release\.mjs/);
  assert.match(workflow, /AWAITING_EXPLICIT_RELEASE/);
  assert.match(workflow, /release-authority\.json/);
  assert.match(workflow, /--assert-canonical-main/);
});

test("main pushes retain the source-aware plan but cannot execute Production", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/supabase-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /Build auditable deployment plan/);
  assert.match(workflow, /Retain deployment plan and gate audit/);
  assert.equal((workflow.match(/run: bash scripts\/deployment\/deploy-supabase-production\.sh/g) ?? []).length, 1);
});
