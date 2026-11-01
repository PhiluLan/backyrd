import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validateActionPins, validateSupplyChainChange } from "./validate-supply-chain-change.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-supply-chain-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  put(root, "package.json", '{"dependencies":{"a":"1.0.0"}}\n');
  put(root, "package-lock.json", '{"lockfileVersion":3}\n');
  put(root, ".github/workflows/ci.yml", "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n");
  return { root, base: commit(root, "base") };
};

test("dependency changes require the matching lockfile", () => {
  const { root, base } = fixture();
  put(root, "package.json", '{"dependencies":{"a":"2.0.0"}}\n');
  const head = commit(root, "dependency without lock");
  const result = validateSupplyChainChange({ root, baseSha: base, headSha: head });
  assert.deepEqual(result.failures, ["package.json:dependency_change_without_package-lock.json"]);
});

test("manifest plus lock selects a reproducible install root", () => {
  const { root, base } = fixture();
  put(root, "package.json", '{"dependencies":{"a":"2.0.0"}}\n');
  put(root, "package-lock.json", '{"lockfileVersion":3,"changed":true}\n');
  const head = commit(root, "dependency with lock");
  assert.deepEqual(validateSupplyChainChange({ root, baseSha: base, headSha: head }), { failures: [], installRoots: ["."] });
});

test("third-party Actions must use a full commit SHA", () => {
  const { root } = fixture();
  put(root, ".github/workflows/ci.yml", "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: ./.github/actions/local\n");
  assert.deepEqual(validateActionPins(root), [".github/workflows/ci.yml:4:action_not_pinned_to_commit"]);
});

test("declared Web workspace uses root lock, separate Admin keeps its own lock", () => {
  const { root } = fixture();
  put(root, "package.json", '{"workspaces":["web","packages/*"]}\n');
  put(root, "web/package.json", '{"dependencies":{"next":"16.3.3"}}\n');
  put(root, "admin-dashboard/package.json", '{"dependencies":{"next":"16.3.3"}}\n');
  put(root, "admin-dashboard/package-lock.json", '{"lockfileVersion":3}\n');
  const base = commit(root, "workspace baseline");
  put(root, "web/package.json", '{"dependencies":{"next":"16.4.3"}}\n');
  put(root, "admin-dashboard/package.json", '{"dependencies":{"next":"16.4.3"}}\n');
  put(root, "package-lock.json", '{"lockfileVersion":3,"patched":true}\n');
  const head = commit(root, "patched root workspace only");
  assert.deepEqual(validateSupplyChainChange({ root, baseSha: base, headSha: head }), {
    failures: ["admin-dashboard/package.json:dependency_change_without_admin-dashboard/package-lock.json"],
    installRoots: [".", "admin-dashboard"],
  });
});

test("adding a workspace cannot bypass root lock coupling", () => {
  const { root, base } = fixture();
  put(root, "package.json", '{"dependencies":{"a":"1.0.0"},"workspaces":["web"]}\n');
  put(root, "web/package.json", '{"dependencies":{"next":"16.4.3"}}\n');
  const head = commit(root, "workspace without root lock");
  assert.deepEqual(validateSupplyChainChange({ root, baseSha: base, headSha: head }).failures, [
    "package.json:dependency_change_without_package-lock.json",
    "web/package.json:dependency_change_without_package-lock.json",
  ]);
});
