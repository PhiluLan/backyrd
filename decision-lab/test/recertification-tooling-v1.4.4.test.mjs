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

async function lineageCheckoutFixture() {
  const root = await mkdtemp(join(tmpdir(), "backyrd-lineage-checkout-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  await put(root, "scripts/ci/validate-production-lineage.sh", "#!/usr/bin/env bash\nprintf 'base-lineage\\n'\n", true);
  const base = commit(root, "canonical base");

  git(root, ["switch", "-c", "candidate"]);
  await put(root, "scripts/ci/validate-production-lineage.sh", "#!/usr/bin/env bash\nprintf 'candidate-lineage\\n'\n", true);
  await put(root, "scripts/ci/resolve-production-lineage-target.mjs", `#!/usr/bin/env node
const value = (name) => process.argv[process.argv.indexOf(name) + 1];
process.stdout.write(JSON.stringify({ mode: "candidate", targetSha: value("--head-sha") }) + "\\n");
`, true);
  await cp(join(source, "scripts/ci/validate-production-lineage-at-ref.sh"), join(root, "scripts/ci/validate-production-lineage-at-ref.sh"));
  await chmod(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), 0o755);
  const head = commit(root, "candidate head");

  git(root, ["switch", "--detach", base]);
  git(root, ["merge", "--no-ff", "--no-edit", head]);
  const syntheticMerge = git(root, ["rev-parse", "HEAD"]);
  return { root, base, head, syntheticMerge };
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

test("V1.4.4 validates the event-bound PR head from an exact synthetic merge checkout", async () => {
  const { root, base, head, syntheticMerge } = await lineageCheckoutFixture();
  assert.notEqual(syntheticMerge, head);
  const output = execFileSync(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PRODUCTION_LINEAGE_TARGET_SHA: base,
      PRODUCTION_LINEAGE_PR_HEAD_SHA: head,
    },
  });
  assert.match(output, /candidate-lineage/);
  assert.match(output, new RegExp(`exact reviewed target ${head}`));
});

test("V1.4.4 rejects an event head that differs from the synthetic merge parent", async () => {
  const { root, base, head, syntheticMerge } = await lineageCheckoutFixture();
  git(root, ["branch", "foreign", head]);
  git(root, ["switch", "foreign"]);
  await put(root, "foreign.txt", "foreign\n");
  const foreign = commit(root, "foreign head");
  git(root, ["switch", "--detach", syntheticMerge]);

  assert.throws(() => execFileSync(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PRODUCTION_LINEAGE_TARGET_SHA: base,
      PRODUCTION_LINEAGE_PR_HEAD_SHA: foreign,
    },
  }), /reviewed checkout is not the exact PR head or its exact base\/head synthetic merge/);
});

test("V1.4.4 keeps base/head binding exact and post-merge validation bound to checked-out main", async () => {
  const { root, base, head } = await lineageCheckoutFixture();
  git(root, ["switch", "--detach", head]);

  assert.throws(() => execFileSync(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PRODUCTION_LINEAGE_TARGET_SHA: "0".repeat(40),
      PRODUCTION_LINEAGE_PR_HEAD_SHA: head,
    },
  }), /target commit is unavailable/);

  const output = execFileSync(join(root, "scripts/ci/validate-production-lineage-at-ref.sh"), {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PRODUCTION_LINEAGE_TARGET_SHA: head },
  });
  assert.match(output, /candidate-lineage/);
});
