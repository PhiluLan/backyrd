import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { contentHash } from "../src/canonical-json.mjs";
import { MOBILE_STORAGE_REQUIRED_ASSERTIONS } from "../src/mobile-storage-atomic.mjs";
import { applyCandidateEvidence } from "../src/recertification-apply.mjs";
import { validatePostMergeActiveChain } from "../src/recertification-consumer.mjs";
import { generateCandidateEvidence } from "../src/recertification-generate.mjs";
import { verifyPreMergeCandidate } from "../src/recertification-verify.mjs";
import { resolveCanonicalFixtureBase } from "../../scripts/ci/mobile-storage-atomic-validation-order.mjs";

const source = new URL("../..", import.meta.url).pathname;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = async (root, path, value) => {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const commit = (root, message) => {
  git(root, ["add", "."]);
  git(root, ["commit", "--allow-empty", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
};
const rehash = (artifact) => {
  delete artifact.artifactHash;
  artifact.artifactHash = contentHash(artifact);
};

const PATHS = {
  manifest: "docs/operations/mobile-storage-atomic/SYNTHETIC_V1.json",
  migration: "supabase/migrations/20990101000001_create_atomic_review_media_v1.sql",
  storage: "supabase/canonical/storage.sql",
  consumers: ["mobile/app/review/new.tsx", "mobile/app/review/quick.tsx", "mobile/app/review/smart.tsx"],
  helper: "mobile/lib/review-media-upload.ts",
  mobileTest: "mobile/scripts/test-review-media-upload.mjs",
  mobilePackage: "mobile/package.json",
  acceptance: "supabase/tests/review_media_atomic_v1.sql",
  schema: "supabase/canonical/mobile-storage-atomic/synthetic-v1/application-schema.sha256",
  acl: "supabase/canonical/mobile-storage-atomic/synthetic-v1/public-acl.sha256",
  schemaReconstruction: "scripts/ci/mobile-storage-atomic/synthetic-v1/application-schema-reconstruction.sql",
  aclReconstruction: "scripts/ci/mobile-storage-atomic/synthetic-v1/public-acl-reconstruction.sql",
  documentation: "docs/operations/REVIEW_MEDIA_ATOMIC_V1.md",
};
const mirror = "with check (public.review_media_upload_is_reserved_v1(bucket_id, name, owner, metadata));";
const V46 = "decision-v13-production-recertification-v46";

const resolveActiveV46FixtureBase = () => {
  const canonicalTip = resolveCanonicalFixtureBase({
    root: source,
    explicitBaseSha: process.env.PR_BASE_SHA,
  });
  for (const commitSha of git(source, ["rev-list", "--first-parent", canonicalTip]).split("\n")) {
    try {
      const freeze = JSON.parse(git(source, ["show", `${commitSha}:decision-lab/config/additive-recertification-v1.freeze.json`]));
      if (freeze.currentVersion === V46) return commitSha;
    } catch {
      // A canonical ancestor without an additive freeze cannot be the V46 fixture base.
    }
  }
  throw new Error("canonical main history has no active V46 parent");
};

async function fixture(mutate = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), "backyrd-recert-v15-"));
  const canonicalBase = resolveActiveV46FixtureBase();
  execFileSync("git", ["clone", "--quiet", "--shared", source, root]);
  git(root, ["checkout", "--quiet", "--detach", canonicalBase]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["update-ref", "refs/remotes/origin/main", canonicalBase]);
  const activeParent = await validatePostMergeActiveChain({ root, canonicalMainSha: canonicalBase });
  assert.equal(activeParent.valid, true, activeParent.reasons.join(","));
  assert.equal(activeParent.activeVersion, V46);
  assert.equal(activeParent.chainLength, 2);
  for (const path of [
    "decision-lab/src/mobile-storage-atomic.mjs",
    "decision-lab/src/recertification-generate.mjs",
    "decision-lab/src/recertification-verify.mjs",
  ]) await put(root, path, await readFile(join(source, path), "utf8"));
  const base = commit(root, "install V1.5 tooling under test");
  git(root, ["update-ref", "refs/remotes/origin/main", base]);

  for (const path of PATHS.consumers) await writeFile(join(root, path), `${await readFile(join(root, path), "utf8")}\n// synthetic atomic media consumer\n`);
  await writeFile(join(root, PATHS.mobilePackage), `${await readFile(join(root, PATHS.mobilePackage), "utf8")}\n`);
  await writeFile(join(root, PATHS.storage), `${await readFile(join(root, PATHS.storage), "utf8")}\n-- ${mirror}\n`);
  await put(root, PATHS.helper, "export const atomicReviewMedia = true;\n");
  const assertions = Object.fromEntries(MOBILE_STORAGE_REQUIRED_ASSERTIONS.map((name) => [name,
    ["upload_failure_no_review_or_smart_evidence", "exact_retry_idempotent"].includes(name) ? PATHS.mobileTest : PATHS.acceptance]));
  const markers = (path) => Object.entries(assertions).filter(([, target]) => target === path).map(([name]) => `-- V15_ASSERT:${name}`).join("\n");
  await put(root, PATHS.mobileTest, `${markers(PATHS.mobileTest)}\n// uploadReservedReviewMedia finalizeReviewWithMedia storage_upload finalization FINALIZED upsert calls\nif (!true) process.exit(1);\n`);
  await put(root, PATHS.acceptance, `begin;\n${markers(PATHS.acceptance)}\n-- review_media_upload_is_reserved_v1 finalize_review_with_media_v1 review_photos backyrd_memory_bridge_outbox_v1 expires_at finalized_at foreign missing consumed count(*)\nset local role authenticated; set local role anon;\ndo $$ begin if false then raise exception 'insufficient_privilege'; end if; end $$;\nrollback;\n`);
  await put(root, PATHS.migration, `
create table public.review_media_upload_reservations_v1(review_id uuid primary key, user_id uuid, spot_id uuid, bucket_id text default 'review-photos', storage_paths text[], content_types text[], expires_at timestamptz, finalized_at timestamptz);
create function public.reserve_review_media_upload_v1(p_review_id uuid,p_spot_id uuid,p_storage_paths text[],p_content_types text[],p_max_sizes_bytes bigint[]) returns void language plpgsql security definer set search_path = public, pg_catalog as $$ begin perform auth.uid(); end $$;
create function public.review_media_upload_is_reserved_v1(p_bucket_id text,p_storage_path text,p_owner uuid,p_metadata jsonb) returns boolean language sql security definer set search_path = public, pg_catalog as $$ select true $$;
create function public.finalize_review_with_media_v1(p_review_id uuid,p_spot_id uuid) returns void language plpgsql security definer set search_path = public, pg_catalog as $$ begin insert into public.review_photos default values; end $$;
create policy review_photos_upload_own_review on storage.objects for insert to authenticated ${mirror}
`);
  await put(root, PATHS.schema, `${"a".repeat(64)}\n`);
  await put(root, PATHS.acl, `${"b".repeat(64)}\n`);
  await put(root, PATHS.schemaReconstruction, "drop table public.review_media_upload_reservations_v1;\n");
  await put(root, PATHS.aclReconstruction, "select true;\n");
  await put(root, PATHS.documentation, "# Synthetic Review Media Atomic V1\n");
  const manifest = {
    schemaVersion: "backyrd-mobile-storage-atomic-evidence-v1",
    id: "synthetic-v1",
    migration: PATHS.migration,
    storagePolicy: PATHS.storage,
    mobile: { consumers: PATHS.consumers, helper: PATHS.helper, tests: [PATHS.mobileTest], packageManifest: PATHS.mobilePackage },
    acceptanceTests: [PATHS.acceptance],
    assertions,
    fingerprints: {
      baseline: { applicationSchema: "supabase/canonical/application-schema-events-v1.sha256", publicAcl: "supabase/canonical/public-acl-events-v1.sha256" },
      candidate: { applicationSchema: PATHS.schema, publicAcl: PATHS.acl },
    },
    reconstruction: { applicationSchema: PATHS.schemaReconstruction, publicAcl: PATHS.aclReconstruction },
    documentation: [PATHS.documentation],
  };
  await mutate({ root, manifest });
  await put(root, PATHS.manifest, manifest);
  const candidate = commit(root, "synthetic mobile-storage-atomic candidate");
  const artifact = await generateCandidateEvidence({ root, baseVersion: "v46", baseMainSha: base, candidateSha: candidate, evidencePaths: [PATHS.manifest], requestedScope: "mobile-storage-atomic", mobileStorageManifestPath: PATHS.manifest });
  return { root, base, candidate, artifact };
}

test("V1.5 fixture base resolves the real canonical Base tree instead of candidate HEAD", async () => {
  const root = await mkdtemp(join(tmpdir(), "backyrd-recert-v15-base-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  await put(root, "canonical.txt", "base\n");
  const base = commit(root, "canonical base");
  git(root, ["update-ref", "refs/remotes/origin/main", base]);
  await put(root, PATHS.migration, "select true;\n");
  const candidate = commit(root, "candidate head");
  assert.equal(git(root, ["rev-parse", "HEAD"]), candidate);
  assert.equal(resolveCanonicalFixtureBase({ root }), base);
  assert.notEqual(resolveCanonicalFixtureBase({ root }), candidate);
});

test("V46 active parent chain permits an exact V47 mobile-storage-atomic candidate", async () => {
  const x = await fixture();
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, true, receipt.reasons.join(","));
  assert.equal(receipt.verifierVersion, "backyrd-recertification-pre-merge-verifier-v1.5");
  assert.equal(x.artifact.scopeInventory[PATHS.storage], "mobile-storage-policy");
});

for (const [name, mutate, expected] of [
  ["incomplete assertion matrix", ({ manifest }) => { delete manifest.assertions.foreign_bucket_denied; }, "MOBILE_STORAGE_ASSERTION_MATRIX_INCOMPLETE"],
  ["missing assertion marker", ({ root }) => put(root, PATHS.acceptance, "set local role authenticated; raise exception 'sqlstate 42501';\n"), "MOBILE_STORAGE_ASSERTION_MARKER_MISSING:positive_atomic_publish"],
  ["incomplete database acceptance contract", ({ root }) => put(root, PATHS.acceptance, `${MOBILE_STORAGE_REQUIRED_ASSERTIONS.filter((name) => !["upload_failure_no_review_or_smart_evidence", "exact_retry_idempotent"].includes(name)).map((name) => `-- V15_ASSERT:${name}`).join("\n")}\nset local role authenticated;\n`), "MOBILE_STORAGE_DATABASE_ACCEPTANCE_CONTRACT_INCOMPLETE"],
  ["incomplete client acceptance contract", ({ root }) => put(root, PATHS.mobileTest, `-- V15_ASSERT:upload_failure_no_review_or_smart_evidence\n-- V15_ASSERT:exact_retry_idempotent\n`), "MOBILE_STORAGE_CLIENT_ACCEPTANCE_CONTRACT_INCOMPLETE"],
  ["historical migration mutation", async ({ root }) => { const path = git(root, ["ls-tree", "-r", "--name-only", "HEAD", "--", "supabase/migrations"]).split("\n")[0]; await writeFile(join(root, path), `${await readFile(join(root, path), "utf8")}\n-- forbidden\n`); }, "HISTORICAL_MIGRATION_MUTATION"],
  ["second migration", ({ root }) => put(root, "supabase/migrations/20990101000002_forbidden.sql", "select true;\n"), "MOBILE_STORAGE_MIGRATION_SET_MISMATCH"],
  ["Production mutation", ({ root }) => put(root, "supabase/production/forbidden.json", "{}\n"), "FORBIDDEN_SCOPE:supabase/production/forbidden.json"],
  ["Edge Function mutation", ({ root }) => put(root, "supabase/functions/forbidden/index.ts", "export {};\n"), "FORBIDDEN_SCOPE:supabase/functions/forbidden/index.ts"],
  ["Decision source mutation", ({ root }) => put(root, "packages/decision-orchestrator-runtime/src/ranking.mjs", "export const drift = true;\n"), "DECISION_SOURCE_DRIFT"],
  ["foreign Mobile feature", ({ root }) => put(root, "mobile/app/profile.tsx", "export {};\n"), "MOBILE_STORAGE_CHANGED_SET_MISMATCH"],
  ["historical fingerprint mutation", async ({ root }) => { const path = "supabase/canonical/application-schema-events-v1.sha256"; await writeFile(join(root, path), `${"0".repeat(64)}\n`); }, "MOBILE_STORAGE_CHANGED_SET_MISMATCH"],
  ["non-mirrored Storage policy", async ({ root }) => { const body = await readFile(join(root, PATHS.storage), "utf8"); await writeFile(join(root, PATHS.storage), body.replace(mirror, "with check (true);")); }, "MOBILE_STORAGE_POLICY_MIRROR_MISMATCH"],
  ["client service-role material", ({ root }) => put(root, PATHS.helper, "export const key = 'service_role';\n"), "MOBILE_STORAGE_CLIENT_PRIVILEGE_MATERIAL"],
]) test(`mobile-storage-atomic rejects ${name}`, async () => {
  const x = await fixture(mutate);
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, false);
  assert.ok(receipt.reasons.includes(expected), receipt.reasons.join(","));
});

for (const [name, mutate, expected] of [
  ["candidate tree", (artifact) => { artifact.candidateProductTree = "0".repeat(40); }, "CANDIDATE_TREE_MISMATCH"],
  ["migration hash", (artifact) => { artifact.mobileStorageAtomic.migrationSha256 = "0".repeat(64); }, "MOBILE_STORAGE_MIGRATION_HASH_MISMATCH"],
  ["Storage policy hash", (artifact) => { artifact.mobileStorageAtomic.storagePolicySha256.candidate = "0".repeat(64); }, "MOBILE_STORAGE_POLICY_HASH_MISMATCH"],
  ["Mobile helper hash", (artifact) => { artifact.mobileStorageAtomic.mobileSha256[PATHS.helper] = "0".repeat(64); }, "MOBILE_STORAGE_MOBILE_HASH_MISMATCH"],
  ["acceptance hash", (artifact) => { artifact.mobileStorageAtomic.testSha256[PATHS.acceptance] = "0".repeat(64); }, "MOBILE_STORAGE_TEST_HASH_MISMATCH"],
  ["reconstruction hash", (artifact) => { artifact.mobileStorageAtomic.reconstructionSha256[PATHS.schemaReconstruction] = "0".repeat(64); }, "MOBILE_STORAGE_RECONSTRUCTION_HASH_MISMATCH"],
  ["candidate fingerprint", (artifact) => { artifact.mobileStorageAtomic.candidateFingerprints.applicationSchema = "0".repeat(64); }, "MOBILE_STORAGE_CANDIDATE_FINGERPRINT_BINDING_MISMATCH"],
]) test(`mobile-storage-atomic rejects tampered ${name}`, async () => {
  const x = await fixture();
  mutate(x.artifact); rehash(x.artifact);
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, false);
  assert.ok(receipt.reasons.includes(expected), receipt.reasons.join(","));
});

test("mobile-storage-atomic rejects a foreign exact PR head", async () => {
  const x = await fixture();
  const foreignHead = commit(x.root, "foreign head");
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: foreignHead });
  assert.equal(receipt.valid, false);
  assert.ok(receipt.reasons.includes("PR_HEAD_BINDING_MISMATCH"), receipt.reasons.join(","));
});

test("mobile-storage-atomic rejects a stale canonical-main base even when it remains a first-parent ancestor", async () => {
  const x = await fixture();
  const tree = git(x.root, ["rev-parse", `${x.base}^{tree}`]);
  const newerMain = git(x.root, ["commit-tree", tree, "-p", x.base, "-m", "new canonical main tip"]);
  git(x.root, ["update-ref", "refs/remotes/origin/main", newerMain]);
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, false);
  assert.ok(receipt.reasons.includes("MOBILE_STORAGE_BASE_NOT_CANONICAL_TIP"), receipt.reasons.join(","));
});

test("an applied mobile-storage-atomic record remains consumable only from its canonical merge", async () => {
  const x = await fixture();
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, true, receipt.reasons.join(","));
  await applyCandidateEvidence({ root: x.root, artifact: x.artifact, receipt, trustedBaseSha: x.base });
  const applied = commit(x.root, "apply mobile-storage-atomic record");
  const tree = git(x.root, ["rev-parse", `${applied}^{tree}`]);
  const canonicalMerge = git(x.root, ["commit-tree", tree, "-p", x.base, "-p", applied, "-m", "merge mobile-storage-atomic candidate"]);
  git(x.root, ["update-ref", "refs/remotes/origin/main", canonicalMerge]);
  const consumed = await validatePostMergeActiveChain({ root: x.root, canonicalMainSha: canonicalMerge, candidateSha: x.candidate });
  assert.equal(consumed.valid, true, consumed.reasons.join(","));
  assert.equal(consumed.activeVersion, "decision-v13-production-recertification-v47");
  assert.equal(consumed.chainLength, 3);
});

test("mobile-storage-atomic generation fails closed without its explicit manifest", async () => {
  const x = await fixture();
  await assert.rejects(() => generateCandidateEvidence({ root: x.root, baseVersion: "v46", baseMainSha: x.base, candidateSha: x.candidate, evidencePaths: [PATHS.acceptance], requestedScope: "mobile-storage-atomic" }));
});
