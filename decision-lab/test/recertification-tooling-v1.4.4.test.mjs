import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const source = new URL("../..", import.meta.url).pathname;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

async function put(root, path, value, executable = false) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value);
  if (executable) await chmod(target, 0o755);
}

function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

test("V1.4.4 validates shipped lineage at the exact PR base, not the undeployed candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "backyrd-v144-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  await put(root, "scripts/ci/validate-production-lineage.sh", "#!/usr/bin/env bash\nprintf 'base-lineage\\n'\n", true);
  const base = commit(root, "canonical base");

  await put(root, "scripts/ci/validate-production-lineage.sh", "#!/usr/bin/env bash\nprintf 'candidate-lineage\\n'\n", true);
  await cp(join(source, "scripts/ci/validate-production-lineage-at-ref.sh"), join(root, "scripts/ci/validate-production-lineage-at-ref.sh"));
  await chmod(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), 0o755);
  commit(root, "undeployed candidate");

  const output = execFileSync(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PRODUCTION_LINEAGE_TARGET_SHA: base },
  });
  assert.match(output, /base-lineage/);
  assert.doesNotMatch(output, /candidate-lineage/);
  assert.match(output, new RegExp(`exact reviewed base ${base}`));
});

test("V1.4.4 Database CI binds shipped lineage to the trusted PR base", async () => {
  const workflow = await readFile(join(source, ".github/workflows/database.yml"), "utf8");
  assert.match(workflow, /PRODUCTION_LINEAGE_TARGET_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /run: scripts\/ci\/validate-production-lineage-at-ref\.sh/);
});
