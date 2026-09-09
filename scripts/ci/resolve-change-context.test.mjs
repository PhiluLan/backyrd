import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveChangeContext } from "./resolve-change-context.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-context-"));
  git(root, ["init", "--quiet", "-b", "main"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  put(root, "README.md", "base\n");
  const base = commit(root, "base");
  git(root, ["switch", "--quiet", "-c", "candidate"]);
  put(root, "README.md", "candidate\n");
  const head = commit(root, "candidate");
  return { root, base, head };
};

test("exact PR head and exact synthetic merge resolve to the same candidate identity", () => {
  const { root, base, head } = fixture();
  let result = resolveChangeContext({ root, eventName: "pull_request", baseSha: base, headSha: head, checkoutSha: head, canonicalMainRef: base });
  assert.equal(result.checkoutKind, "exact-head");
  git(root, ["switch", "--quiet", "--detach", base]);
  git(root, ["merge", "--quiet", "--no-ff", "--no-edit", head]);
  const merge = git(root, ["rev-parse", "HEAD"]);
  result = resolveChangeContext({ root, eventName: "pull_request", baseSha: base, headSha: head, checkoutSha: merge, canonicalMainRef: base });
  assert.equal(result.checkoutKind, "synthetic-pr-merge");
  assert.equal(result.headSha, head);
});

test("foreign synthetic head and non-canonical push fail closed", () => {
  const { root, base, head } = fixture();
  git(root, ["switch", "--quiet", "--detach", base]);
  put(root, "foreign.txt", "foreign\n");
  const foreign = commit(root, "foreign");
  git(root, ["switch", "--quiet", "--detach", base]);
  git(root, ["merge", "--quiet", "--no-ff", "--no-edit", head]);
  const merge = git(root, ["rev-parse", "HEAD"]);
  assert.throws(() => resolveChangeContext({ root, eventName: "pull_request", baseSha: base, headSha: foreign, checkoutSha: merge, canonicalMainRef: base }), /checkout_is_not_exact_head/);
  assert.throws(() => resolveChangeContext({ root, eventName: "push", baseSha: base, headSha: head, checkoutSha: head, canonicalMainRef: base }), /push_head_is_not_canonical_main/);
});

test("parallel PRs remain independently identifiable and stale base is explicit", () => {
  const { root, base, head } = fixture();
  git(root, ["branch", "main", head, "--force"]);
  git(root, ["switch", "--quiet", "--detach", base]);
  put(root, "second.txt", "second\n");
  const secondHead = commit(root, "second candidate");
  const first = resolveChangeContext({ root, eventName: "pull_request", baseSha: base, headSha: head, checkoutSha: head, canonicalMainRef: "refs/heads/main" });
  const second = resolveChangeContext({ root, eventName: "pull_request", baseSha: base, headSha: secondHead, checkoutSha: secondHead, canonicalMainRef: "refs/heads/main" });
  assert.equal(first.staleBase, true);
  assert.equal(second.staleBase, true);
  assert.notEqual(first.headSha, second.headSha);
});
