import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  candidateFingerprintFailures,
  planAdminDataAdditiveValidation,
  reconstructionFailures,
} from "../../scripts/ci/admin-data-additive-validation-order.mjs";

const source = new URL("../..", import.meta.url).pathname;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = async (root, path, value) => {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value);
};
const commit = (root, message) => {
  git(root, ["add", "."]);
  git(root, ["commit", "--allow-empty", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
};

async function fixture({ manifest = true, mutate = async () => {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), "backyrd-v142-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  await put(root, "supabase/migrations/20260101000000_history.sql", "select 1;\n");
  await put(root, "supabase/canonical/application-schema-events-v1.sha256", `${"1".repeat(64)}\n`);
  await put(root, "supabase/canonical/public-acl-events-v1.sha256", `${"2".repeat(64)}\n`);
  const base = commit(root, "canonical base");
  git(root, ["update-ref", "refs/remotes/origin/main", base]);
  const migration = "supabase/migrations/20270101000000_restaurant_v1.sql";
  await put(root, migration, "create table public.restaurant_v1(id uuid primary key);\n");
  await put(root, "supabase/tests/restaurant_v1_positive.sql", "select true;\n");
  await put(root, "supabase/canonical/admin-data-additive/restaurant-v1/application-schema.sha256", `${"a".repeat(64)}\n`);
  await put(root, "supabase/canonical/admin-data-additive/restaurant-v1/public-acl.sha256", `${"b".repeat(64)}\n`);
  if (manifest) {
    await put(root, "docs/operations/admin-data-additive/RESTAURANT_V1.json", `${JSON.stringify({
      migrations: [migration],
      fingerprints: { candidate: {
        applicationSchema: "supabase/canonical/admin-data-additive/restaurant-v1/application-schema.sha256",
        publicAcl: "supabase/canonical/admin-data-additive/restaurant-v1/public-acl.sha256",
      } },
    })}\n`);
  }
  await mutate({ root, base });
  const head = commit(root, "candidate");
  return { root, base, head };
}

test("V1.4.2 orders isolated canonical base proof before candidate apply and existing V1.4 contract", async () => {
  const x = await fixture();
  const plan = planAdminDataAdditiveValidation({ root: x.root, baseSha: x.base, headSha: x.head });
  assert.equal(plan.mode, "admin-data-additive");
  assert.deepEqual(plan.migrations, ["supabase/migrations/20270101000000_restaurant_v1.sql"]);
  const validator = await readFile(join(source, "scripts/ci/validate-supabase-local.sh"), "utf8");
  const baseCheckout = validator.indexOf("Recertification isolated canonical base checkout bound");
  const candidateCheckout = validator.indexOf("Recertification isolated candidate checkout bound to exact PR head");
  const dependencyProof = validator.indexOf("validate-lockfile-install.mjs");
  const historicalProof = validator.indexOf("Gate 7 current application schema candidate fingerprint passed");
  const candidateApply = validator.indexOf("V1.4.2 exact manifest-bound candidate migrations applied");
  const existingContract = validator.indexOf("validate-admin-data-additive.mjs");
  assert.ok(baseCheckout >= 0 && baseCheckout < historicalProof);
  assert.ok(candidateCheckout >= 0 && candidateCheckout < historicalProof);
  assert.ok(dependencyProof >= 0 && dependencyProof < historicalProof);
  assert.ok(historicalProof < candidateApply && candidateApply < existingContract);
});

test("V1.4.3 Database CI installs candidate dependencies only inside the exact checkout", async () => {
  const workflow = await readFile(join(source, ".github/workflows/database.yml"), "utf8");
  const validator = await readFile(join(source, "scripts/ci/validate-supabase-local.sh"), "utf8");
  const nodeSetup = workflow.indexOf("Set up Node.js for lockfile installation");
  const database = workflow.indexOf("Validate isolated canonical database");
  assert.ok(nodeSetup >= 0 && nodeSetup < database);
  assert.doesNotMatch(workflow, /cache: npm/);
  assert.match(validator, /cmp "\$base_checkout\/package-lock\.json" "\$candidate_checkout\/package-lock\.json"/);
  assert.match(validator, /cd "\$candidate_checkout" && npm ci/);
  assert.match(validator, /npm ls --all --json/);
});

test("V1.4.2 rejects a noncanonical PR base", async () => {
  const x = await fixture();
  git(x.root, ["checkout", "--quiet", "--detach", x.base]);
  const sideBase = commit(x.root, "noncanonical side base");
  await put(x.root, "supabase/tests/side.sql", "select true;\n");
  const sideHead = commit(x.root, "side candidate");
  assert.throws(() => planAdminDataAdditiveValidation({ root: x.root, baseSha: sideBase, headSha: sideHead }), /canonical-main first-parent/);
});

for (const [name, mutate] of [
  ["historical migration", async ({ root }) => put(root, "supabase/migrations/20260101000000_history.sql", "select 2;\n")],
  ["historical Gate-7 baseline", async ({ root }) => put(root, "supabase/canonical/application-schema-events-v1.sha256", `${"3".repeat(64)}\n`)],
]) test(`V1.4.2 rejects manipulated ${name}`, async () => {
  const x = await fixture({ mutate });
  assert.throws(() => planAdminDataAdditiveValidation({ root: x.root, baseSha: x.base, headSha: x.head }), /immutable/);
});

test("V1.4.2 rejects an admin-data migration without a manifest", async () => {
  const x = await fixture({ manifest: false });
  assert.throws(() => planAdminDataAdditiveValidation({ root: x.root, baseSha: x.base, headSha: x.head }), /exactly one.*manifest/);
});

test("V1.4.2 rejects wrong candidate fingerprints", () => {
  assert.deepEqual(candidateFingerprintFailures({
    currentSchema: "actual-schema",
    currentAcl: "actual-acl",
    expectedSchema: "wrong-schema",
    expectedAcl: "wrong-acl",
  }), ["candidate application schema fingerprint mismatch", "candidate Public ACL fingerprint mismatch"]);
});

test("V1.4.2 rejects failed historical reconstruction", () => {
  assert.deepEqual(reconstructionFailures({
    reconstructedSchema: "drifted-schema",
    reconstructedAcl: "drifted-acl",
    expectedSchema: "base-schema",
    expectedAcl: "base-acl",
  }), ["historical application schema reconstruction mismatch", "historical Public ACL reconstruction mismatch"]);
});
