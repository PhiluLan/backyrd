import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePriorGates, successfulPriorGates, validateResumeLineage } from "./resolve-prior-gates.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-gate-resume-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  const commit = (value) => { writeFileSync(join(root, "value"), value); git(root, ["add", "value"]); git(root, ["commit", "--quiet", "-m", value]); return git(root, ["rev-parse", "HEAD"]); };
  return { root, base: commit("base"), prior: commit("prior"), head: commit("head") };
};

test("only successful GitHub Actions checks with canonical gate names are reusable", () => {
  const url = "https://github.com/example/repo/actions/runs/42/job/7";
  assert.deepEqual(successfulPriorGates([
    { name: "Decision vNext focused gate", status: "completed", conclusion: "success", app: { slug: "github-actions" }, details_url: url },
    { name: "Database clean boot and authorization", status: "completed", conclusion: "failure", app: { slug: "github-actions" }, details_url: url },
    { name: "Admin focused gate", status: "completed", conclusion: "success", app: { slug: "untrusted-app" }, details_url: url },
    { name: "Unknown gate", status: "completed", conclusion: "success", app: { slug: "github-actions" }, details_url: url },
  ]), ["decision"]);
});

test("resume lineage requires base -> prior -> head", () => {
  const x = fixture();
  assert.equal(validateResumeLineage({ root: x.root, baseSha: x.base, previousHeadSha: x.prior, headSha: x.head }).previousHeadSha, x.prior);
  assert.throws(() => validateResumeLineage({ root: x.root, baseSha: x.prior, previousHeadSha: x.base, headSha: x.head }), /lineage_invalid/);
  assert.throws(() => validateResumeLineage({ root: x.root, baseSha: x.base, previousHeadSha: x.head, headSha: x.head }), /distinct_prior_head/);
});

test("non-synchronize events cannot reuse prior gates", async () => {
  const result = await resolvePriorGates({ root: ".", eventName: "pull_request", eventAction: "opened", repository: "a/b" });
  assert.deepEqual(result, { eligible: false, reason: "not_incremental_pull_request", successfulGates: [] });
});

test("missing API evidence or rewritten lineage falls back to a full run", async () => {
  const x = fixture();
  const unavailable = await resolvePriorGates({ root: x.root, eventName: "pull_request", eventAction: "synchronize", baseSha: x.base, previousHeadSha: x.prior, headSha: x.head, repository: "example/repo", token: "token", fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(unavailable.eligible, false);
  assert.match(unavailable.reason, /full_rerun_required/);
  const rewritten = await resolvePriorGates({ root: x.root, eventName: "pull_request", eventAction: "synchronize", baseSha: x.prior, previousHeadSha: x.base, headSha: x.head, repository: "example/repo", token: "token" });
  assert.equal(rewritten.eligible, false);
});

test("verified synchronize event returns only authenticated successful gates", async () => {
  const x = fixture();
  const result = await resolvePriorGates({
    root: x.root, eventName: "pull_request", eventAction: "synchronize", baseSha: x.base, previousHeadSha: x.prior, headSha: x.head,
    repository: "example/repo", token: "test-token",
    fetchImpl: async () => ({ ok: true, json: async () => ({ check_runs: [{ name: "World Knowledge focused gate", status: "completed", conclusion: "success", app: { slug: "github-actions" }, details_url: "https://github.com/example/repo/actions/runs/1/job/2" }] }) }),
  });
  assert.deepEqual(result.successfulGates, ["world"]);
  assert.equal(result.eligible, true);
});
