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
});

test("Recovery deployment remains canonical-main-only and requires an explicit audited base", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/supabase-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:[\s\S]*recovery_base_sha:[\s\S]*required: true/);
  assert.match(workflow, /inputs\.recovery_base_sha \|\| github\.event\.before/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /--assert-canonical-main/);
});
