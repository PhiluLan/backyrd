import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateProductionState } from "./validate-production-state.mjs";

const git = (repo, args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const write = (repo, path, value) => { mkdirSync(join(repo, path, ".."), { recursive: true }); writeFileSync(join(repo, path), value); };
const fixture = () => {
  const repo = mkdtempSync(join(tmpdir(), "backyrd-production-state-"));
  git(repo, ["init", "-q"]); git(repo, ["config", "user.name", "CI"]); git(repo, ["config", "user.email", "ci@invalid"]);
  write(repo, "mobile/source.ts", "export const value = 1;\n");
  write(repo, "supabase/migrations/20260101000000_base.sql", "select 1;\n");
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "shipped"]);
  const shipped = git(repo, ["rev-parse", "HEAD"]); const tree = git(repo, ["rev-parse", "HEAD:mobile"]);
  const state = {
    schemaVersion: "backyrd-production-state-v1", projectRef: "hjgcrrzfjchzqoegcywn",
    supabase: { shippedSourceSha: shipped, migrationTip: "20260101000000_base", migrationCount: 1, deploymentRunId: 1, technicalStatus: "SHIPPED" },
    mobile: { shippedSourceSha: shipped, productSourceSha: shipped, tree, technicalStatus: "SHIPPED_PRODUCT_UNVERIFIED", productionVerified: false },
    reviewMediaIncident: { id: "incident", status: "OPEN_PAUSED", productionVerified: false, historicalPartialTestStatesPreserved: true, productFixInScope: false },
  };
  write(repo, "delivery/production-state.json", `${JSON.stringify(state, null, 2)}\n`);
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "state"]);
  return { repo, shipped, head: git(repo, ["rev-parse", "HEAD"]), state };
};

test("validates shipped facts while allowing later unrelated candidate commits", () => {
  const f = fixture();
  write(f.repo, "docs/evidence.md", "later evidence\n"); git(f.repo, ["add", "."]); git(f.repo, ["commit", "-qm", "evidence"]);
  const result = validateProductionState({ repo: f.repo });
  assert.equal(result.shippedSupabaseSourceSha, f.shipped);
  assert.equal(result.productionVerified, false);
});

test("rejects rewritten shipped migration bytes", () => {
  const f = fixture();
  write(f.repo, "supabase/migrations/20260101000000_base.sql", "select 2;\n"); git(f.repo, ["add", "."]); git(f.repo, ["commit", "-qm", "rewrite"]);
  assert.throws(() => validateProductionState({ repo: f.repo }), /shipped_migration_bytes_changed/);
});

test("cannot turn the paused Review Media incident into self-declared success", () => {
  const f = fixture();
  f.state.mobile.productionVerified = true;
  f.state.reviewMediaIncident.productionVerified = true;
  write(f.repo, "delivery/production-state.json", `${JSON.stringify(f.state, null, 2)}\n`); git(f.repo, ["add", "."]); git(f.repo, ["commit", "-qm", "false success"]);
  assert.throws(() => validateProductionState({ repo: f.repo }), /review_media_product_failure_must_remain_unverified/);
});
