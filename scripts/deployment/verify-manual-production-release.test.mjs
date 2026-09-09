import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildProductionPlan } from "./supabase-production-plan.mjs";
import { verifyManualProductionRelease } from "./verify-manual-production-release.mjs";

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const write = (repo, path, contents) => {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), contents);
};

const fixture = () => {
  const repo = mkdtempSync(join(tmpdir(), "backyrd-manual-release-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "ci@backyrd.invalid"]);
  git(repo, ["config", "user.name", "Backyrd CI"]);
  write(repo, "supabase/config.toml", `[functions.test]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/test/index.ts"\n`);
  write(repo, "supabase/functions/test/index.ts", `console.log("test");\n`);
  write(repo, "delivery/production-state.json", "{}\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  write(repo, "delivery/production-state.json", `${JSON.stringify({ schemaVersion: "backyrd-production-state-v1", supabase: { shippedSourceSha: base } }, null, 2)}\n`);
  write(repo, "supabase/migrations/20260908000000_release.sql", "select 1;\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "runtime change"]);
  const head = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", head]);
  return { repo, base, head };
};

test("canonical Main candidate is bound to the last shipped baseline and only plans in verification", () => {
  const f = fixture();
  const authority = verifyManualProductionRelease({
    repo: f.repo,
    eventName: "workflow_dispatch",
    requestedSha: f.head,
    confirmation: "DEPLOY_SUPABASE_PRODUCTION",
  });
  const plan = buildProductionPlan({ repo: f.repo, baseSha: authority.baseSha, headSha: authority.canonicalMainSha });
  assert.equal(authority.baseSha, f.base);
  assert.equal(authority.checkoutSha, f.head);
  assert.equal(authority.canonicalMainTipSha, f.head);
  assert.equal(plan.canonicalMainSha, f.head);
  assert.equal(plan.runtimeDeploymentRequired, true);
  assert.equal(plan.migrations.length, 1);
});

test("push cannot authorize a Production release", () => {
  const f = fixture();
  assert.throws(() => verifyManualProductionRelease({
    repo: f.repo,
    eventName: "push",
    requestedSha: f.head,
    confirmation: "DEPLOY_SUPABASE_PRODUCTION",
  }), /manual_release_event_required/);
});

test("invalid or noncanonical SHA fails closed", () => {
  const f = fixture();
  for (const requestedSha of ["invalid"]) {
    assert.throws(() => verifyManualProductionRelease({
      repo: f.repo,
      eventName: "workflow_dispatch",
      requestedSha,
      confirmation: "DEPLOY_SUPABASE_PRODUCTION",
    }), /manual_release_sha_invalid/);
  }
  write(f.repo, "foreign.txt", "foreign\n"); git(f.repo, ["add", "."]); git(f.repo, ["commit", "-qm", "foreign"]);
  const foreign = git(f.repo, ["rev-parse", "HEAD"]);
  git(f.repo, ["update-ref", "refs/remotes/origin/main", f.head]);
  assert.throws(() => verifyManualProductionRelease({ repo: f.repo, eventName: "workflow_dispatch", requestedSha: foreign, confirmation: "DEPLOY_SUPABASE_PRODUCTION" }), /candidate_not_in_canonical_main_lineage/);
});

test("an immutable earlier canonical candidate remains releasable after unrelated Main evidence", () => {
  const f = fixture();
  write(f.repo, "docs/evidence.md", "later\n"); git(f.repo, ["add", "."]); git(f.repo, ["commit", "-qm", "later evidence"]);
  const laterMain = git(f.repo, ["rev-parse", "HEAD"]); git(f.repo, ["update-ref", "refs/remotes/origin/main", laterMain]);
  git(f.repo, ["checkout", "-q", f.head]);
  const authority = verifyManualProductionRelease({ repo: f.repo, eventName: "workflow_dispatch", requestedSha: f.head, confirmation: "DEPLOY_SUPABASE_PRODUCTION" });
  assert.equal(authority.canonicalMainSha, f.head);
  assert.equal(authority.canonicalMainTipSha, laterMain);
  assert.equal(authority.baseSha, f.base);
});

test("wrong confirmation fails closed", () => {
  const f = fixture();
  assert.throws(() => verifyManualProductionRelease({
    repo: f.repo,
    eventName: "workflow_dispatch",
    requestedSha: f.head,
    confirmation: "yes",
  }), /manual_release_confirmation_invalid/);
});

test("canonical SHA checked out from a different commit fails closed", () => {
  const f = fixture();
  git(f.repo, ["checkout", "-q", f.base]);
  assert.throws(() => verifyManualProductionRelease({
    repo: f.repo,
    eventName: "workflow_dispatch",
    requestedSha: f.head,
    confirmation: "DEPLOY_SUPABASE_PRODUCTION",
  }), /manual_release_checkout_mismatch/);
});
