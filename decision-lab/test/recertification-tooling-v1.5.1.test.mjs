import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  planMobileStorageAtomicValidation,
  resolveCanonicalFixtureBase,
} from "../../scripts/ci/mobile-storage-atomic-validation-order.mjs";

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

const PATHS = {
  manifest: "docs/operations/mobile-storage-atomic/review-media-atomic-v1.json",
  migration: "supabase/migrations/20990101000001_create_atomic_review_media_v1.sql",
  schema: "supabase/canonical/mobile-storage-atomic/review-media-atomic-v1/application-schema.sha256",
  acl: "supabase/canonical/mobile-storage-atomic/review-media-atomic-v1/public-acl.sha256",
  schemaReconstruction: "scripts/ci/mobile-storage-atomic/review-media-atomic-v1/application-schema-reconstruction.sql",
  aclReconstruction: "scripts/ci/mobile-storage-atomic/review-media-atomic-v1/public-acl-reconstruction.sql",
};

async function fixture({ manifest = true, mutateBase = async () => {}, mutateCandidate = async () => {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), "backyrd-v151-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  await put(root, "supabase/migrations/20260101000000_history.sql", "select 1;\n");
  await put(root, "supabase/canonical/application-schema-events-v1.sha256", `${"1".repeat(64)}\n`);
  await put(root, "supabase/canonical/public-acl-events-v1.sha256", `${"2".repeat(64)}\n`);
  await put(root, "scripts/ci/events-v1-later-application-schema-reconstruction.sql", "select true;\n");
  await put(root, "scripts/ci/events-v1-later-public-acl-reconstruction.sql", "select true;\n");
  await put(root, "supabase/canonical/storage.sql", "create policy legacy_policy on storage.objects;\n");
  await mutateBase({ root });
  const base = commit(root, "canonical base");
  git(root, ["update-ref", "refs/remotes/origin/main", base]);

  await put(root, PATHS.migration, "create table public.review_media_upload_reservations_v1(id uuid primary key);\n");
  await put(root, PATHS.schema, `${"a".repeat(64)}\n`);
  await put(root, PATHS.acl, `${"b".repeat(64)}\n`);
  await put(root, PATHS.schemaReconstruction, "drop table public.review_media_upload_reservations_v1;\n");
  await put(root, PATHS.aclReconstruction, "select true;\n");
  await put(root, "supabase/canonical/storage.sql", "create policy review_photos_upload_own_review on storage.objects;\n");
  if (manifest) {
    await put(root, PATHS.manifest, `${JSON.stringify({
      migration: PATHS.migration,
      storagePolicy: "supabase/canonical/storage.sql",
      fingerprints: { candidate: { applicationSchema: PATHS.schema, publicAcl: PATHS.acl } },
      reconstruction: { applicationSchema: PATHS.schemaReconstruction, publicAcl: PATHS.aclReconstruction },
    })}\n`);
  }
  await mutateCandidate({ root, base });
  const head = commit(root, "mobile storage candidate");
  return { root, base, head };
}

test("V1.5.1 orders canonical Base gates before candidate migration, Storage mirror, and V1.5 contract", async () => {
  const x = await fixture();
  const plan = planMobileStorageAtomicValidation({ root: x.root, baseSha: x.base, headSha: x.head });
  assert.equal(plan.mode, "mobile-storage-atomic");
  assert.equal(plan.migration, PATHS.migration);
  const validator = await readFile(join(source, "scripts/ci/validate-supabase-local.sh"), "utf8");
  const baseCheckout = validator.indexOf("Recertification isolated canonical base checkout bound");
  const candidateDependencies = validator.indexOf("verified dependencies installed inside the exact checkout");
  const historicalProof = validator.indexOf("Gate 7 current application schema candidate fingerprint passed");
  const candidateApply = validator.indexOf("V1.5.1 exact manifest-bound migration and canonical Storage policy applied");
  const existingContract = validator.lastIndexOf("validate-mobile-storage-atomic.mjs");
  assert.ok(baseCheckout >= 0 && baseCheckout < candidateDependencies);
  assert.ok(candidateDependencies < historicalProof);
  assert.ok(historicalProof < candidateApply && candidateApply < existingContract);
});

test("V1.5.4 validates an active Admin/data parent before an exact mobile-storage candidate", async () => {
  const validator = await readFile(join(source, "scripts/ci/validate-supabase-local.sh"), "utf8");
  const activeParent = validator.indexOf("Active V1.4 Admin/data evidence will be validated before");
  const adminApply = validator.indexOf("V1.4.2 exact manifest-bound candidate migrations applied");
  const adminContract = validator.indexOf('node "$candidate_root/scripts/ci/validate-admin-data-additive.mjs"');
  const mobileApply = validator.indexOf("V1.5.1 exact manifest-bound migration and canonical Storage policy applied");
  const mobileContract = validator.indexOf('node "$candidate_root/scripts/ci/validate-mobile-storage-atomic.mjs"');
  assert.ok(activeParent >= 0 && activeParent < adminApply);
  assert.ok(adminApply < adminContract && adminContract < mobileApply && mobileApply < mobileContract);
  assert.match(validator, /mobile_comparison_base="\$comparison_base"/);
  assert.match(validator, /--base-sha "\$mobile_comparison_base"/);
});

test("V1.5.4 keeps overlapping candidate scopes fail-closed", async () => {
  const validator = await readFile(join(source, "scripts/ci/validate-supabase-local.sh"), "utf8");
  assert.match(validator, /Active Admin\/data evidence cannot overlap another Admin\/data candidate/);
  assert.match(validator, /A candidate cannot combine admin-data-additive and mobile-storage-atomic scopes/);
  assert.match(validator, /test "\$active_admin_mode" != admin-data-additive-active/);
});

test("V1.5.1 rejects a stale or noncanonical Base", async () => {
  const x = await fixture();
  git(x.root, ["checkout", "--quiet", "--detach", x.base]);
  await put(x.root, "side.txt", "side\n");
  const sideBase = commit(x.root, "side base");
  await put(x.root, "mobile/app/review/new.tsx", "candidate\n");
  const sideHead = commit(x.root, "side head");
  assert.throws(() => planMobileStorageAtomicValidation({ root: x.root, baseSha: sideBase, headSha: sideHead }), /exact canonical-main tip/);
});

test("V1.5.1 fixture base rejects a caller-supplied candidate commit", async () => {
  const x = await fixture();
  assert.throws(() => resolveCanonicalFixtureBase({
    root: x.root,
    explicitBaseSha: x.head,
  }), /not the exact canonical-main tip/);
});

test("V1.5.2 keeps canonical main pushes out of PR candidate mode", async () => {
  const validator = await readFile(join(source, "scripts/ci/validate-supabase-local.sh"), "utf8");
  const v15Fixture = await readFile(join(source, "decision-lab/test/recertification-tooling-v1.5.test.mjs"), "utf8");
  assert.match(validator, /test -z "\$\{PR_BASE_SHA:-\}" && test -z "\$\{PR_HEAD_SHA:-\}"/);
  assert.match(validator, /comparison_base=""/);
  assert.match(validator, /PR candidate validation requires an exact base\/head pair/);
  assert.match(v15Fixture, /const canonicalBase = v47\.baseMainSha/);
  assert.match(v15Fixture, /"update-ref", "refs\/remotes\/origin\/main", canonicalBase/);
  assert.match(v15Fixture, /resolveCanonicalFixtureBase\(\{ root, explicitBaseSha: canonicalBase \}\)/);
  assert.doesNotMatch(v15Fixture, /process\.env\.(?:PR_BASE_SHA|CI_BASE_SHA)/);
});

for (const [name, path, value] of [
  ["historical migration", "supabase/migrations/20260101000000_history.sql", "select 2;\n"],
  ["historical fingerprint", "supabase/canonical/application-schema-events-v1.sha256", `${"3".repeat(64)}\n`],
  ["historical reconstruction", "scripts/ci/events-v1-later-public-acl-reconstruction.sql", "select false;\n"],
]) test(`V1.5.1 rejects manipulated ${name}`, async () => {
  const x = await fixture({ mutateCandidate: ({ root }) => put(root, path, value) });
  assert.throws(() => planMobileStorageAtomicValidation({ root: x.root, baseSha: x.base, headSha: x.head }), /immutable/);
});

test("V1.5.1 rejects a mobile-storage candidate without its manifest", async () => {
  const x = await fixture({ manifest: false });
  assert.throws(() => planMobileStorageAtomicValidation({ root: x.root, baseSha: x.base, headSha: x.head }), /exactly one.*manifest/);
});

test("V1.5.1 rejects a manually malformed candidate fingerprint", async () => {
  const x = await fixture({ mutateCandidate: ({ root }) => put(root, PATHS.schema, "manual-hash\n") });
  assert.throws(() => planMobileStorageAtomicValidation({ root: x.root, baseSha: x.base, headSha: x.head }), /candidate fingerprint is invalid/);
});

test("V1.5.1 rejects retroactively modified reconstruction evidence", async () => {
  const x = await fixture({
    mutateBase: ({ root }) => put(root, PATHS.schemaReconstruction, "historical reconstruction\n"),
    mutateCandidate: ({ root }) => put(root, PATHS.schemaReconstruction, "rewritten reconstruction\n"),
  });
  assert.throws(() => planMobileStorageAtomicValidation({ root: x.root, baseSha: x.base, headSha: x.head }), /not newly versioned and exact/);
});
