import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockfileInstallProblems } from "./validate-lockfile-install.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "backyrd-lockfile-install-"));
  const record = {
    version: "1.2.3",
    resolved: "https://registry.npmjs.org/required/-/required-1.2.3.tgz",
    integrity: "sha512-fixture",
  };
  const committed = {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { required: "1.2.3" } },
      "node_modules/required": record,
    },
  };
  const installed = {
    lockfileVersion: 3,
    packages: { "node_modules/required": record },
  };
  await mkdir(join(root, "node_modules/required"), { recursive: true });
  await writeFile(join(root, "package-lock.json"), JSON.stringify(committed));
  await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify(installed));
  await writeFile(join(root, "node_modules/required/package.json"), JSON.stringify({ name: "required", version: "1.2.3" }));
  return { root, installed };
}

test("lockfile-installed dependencies accept exact committed identities", async () => {
  const x = await fixture();
  assert.deepEqual(lockfileInstallProblems(x.root), []);
});

test("lockfile-installed dependencies fail closed when a direct dependency is missing", async () => {
  const x = await fixture();
  x.installed.packages = {};
  await writeFile(join(x.root, "node_modules/.package-lock.json"), JSON.stringify(x.installed));
  assert.deepEqual(lockfileInstallProblems(x.root), ["direct lockfile dependency is missing: required"]);
});

test("lockfile-installed dependencies fail closed on manipulated installed identity", async () => {
  const x = await fixture();
  x.installed.packages["node_modules/required"].version = "9.9.9";
  await writeFile(join(x.root, "node_modules/.package-lock.json"), JSON.stringify(x.installed));
  assert.deepEqual(lockfileInstallProblems(x.root), [
    "installed package version differs from committed lockfile: node_modules/required",
    "installed package version differs from lockfile: node_modules/required",
  ]);
});
