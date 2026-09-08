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
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  write(repo, "supabase/migrations/20260908000000_release.sql", "select 1;\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "runtime change"]);
  const head = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", head]);
  return { repo, base, head };
};

test("exact current canonical main manual release is bound and only plans in verification", () => {
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

test("wrong or noncanonical SHA fails closed", () => {
  const f = fixture();
  for (const requestedSha of ["invalid", f.base]) {
    assert.throws(() => verifyManualProductionRelease({
      repo: f.repo,
      eventName: "workflow_dispatch",
      requestedSha,
      confirmation: "DEPLOY_SUPABASE_PRODUCTION",
    }), /manual_release_sha_invalid|manual_release_not_current_canonical_main/);
  }
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
