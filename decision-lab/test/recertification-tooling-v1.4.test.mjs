import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { contentHash } from "../src/canonical-json.mjs";
import { generateCandidateEvidence } from "../src/recertification-generate.mjs";
import { verifyPreMergeCandidate } from "../src/recertification-verify.mjs";

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
  return artifact;
};

const PATHS = {
  manifest: "docs/operations/admin-data-additive/SYNTHETIC_V1.json",
  migration: "supabase/migrations/20990101000000_synthetic_admin_data_v1.sql",
  positive: "supabase/tests/synthetic_admin_data_positive.sql",
  negative: "supabase/tests/synthetic_admin_data_negative.sql",
  schema: "supabase/canonical/admin-data-additive/synthetic-v1/application-schema.sha256",
  acl: "supabase/canonical/admin-data-additive/synthetic-v1/public-acl.sha256",
  schemaReconstruction: "scripts/ci/admin-data-additive/synthetic-v1/application-schema-reconstruction.sql",
  aclReconstruction: "scripts/ci/admin-data-additive/synthetic-v1/public-acl-reconstruction.sql",
};

async function fixture(mutate = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), "backyrd-recert-v14-"));
  execFileSync("git", ["clone", "--quiet", "--shared", source, root]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  for (const path of ["decision-lab/src/admin-data-additive.mjs", "decision-lab/src/recertification-generate.mjs", "decision-lab/src/recertification-verify.mjs"]) await writeFile(join(root, path), await readFile(join(source, path)));
  const base = commit(root, "install V1.4 tooling under test");
  git(root, ["update-ref", "refs/remotes/origin/main", base]);
  await put(root, PATHS.migration, "create table public.synthetic_admin_data_v1(id uuid primary key);\nalter table public.synthetic_admin_data_v1 enable row level security;\n");
  await put(root, PATHS.positive, "begin; create function pg_temp.assert(p boolean) returns void language plpgsql as $$ begin if p is not true then raise exception 'positive failed'; end if; end $$; select pg_temp.assert(true); rollback;\n");
  await put(root, PATHS.negative, "begin; set local role authenticated; do $$ begin if has_table_privilege('authenticated','public.profiles','truncate') then raise exception 'negative denial failed'; end if; end $$; rollback;\n");
  await put(root, PATHS.schema, `${"a".repeat(64)}\n`);
  await put(root, PATHS.acl, `${"b".repeat(64)}\n`);
  await put(root, PATHS.schemaReconstruction, "drop table public.synthetic_admin_data_v1;\n");
  await put(root, PATHS.aclReconstruction, "select true;\n");
  const manifest = {
    schemaVersion: "backyrd-admin-data-additive-evidence-v1",
    id: "synthetic-v1",
    migrations: [PATHS.migration],
    acceptanceTests: { positive: [PATHS.positive], negative: [PATHS.negative] },
    fingerprints: {
      baseline: { applicationSchema: "supabase/canonical/application-schema-events-v1.sha256", publicAcl: "supabase/canonical/public-acl-events-v1.sha256" },
      candidate: { applicationSchema: PATHS.schema, publicAcl: PATHS.acl },
    },
    reconstruction: { applicationSchema: PATHS.schemaReconstruction, publicAcl: PATHS.aclReconstruction },
  };
  await mutate({ root, manifest });
  await put(root, PATHS.manifest, manifest);
  const candidate = commit(root, "synthetic admin-data-additive candidate");
  const artifact = await generateCandidateEvidence({ root, baseVersion: "v46", baseMainSha: base, candidateSha: candidate, evidencePaths: [PATHS.manifest], requestedScope: "admin-data-additive", adminDataManifestPath: PATHS.manifest });
  return { root, base, candidate, artifact };
}

test("V46 active parent chain permits an exact V47 admin-data-additive candidate", async () => {
  const x = await fixture();
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, true, receipt.reasons.join(","));
  assert.equal(receipt.verifierVersion, "backyrd-recertification-pre-merge-verifier-v1.4");
  assert.match(x.artifact.version, /v47$/);
  assert.equal(x.artifact.scopeInventory[PATHS.migration], "admin-data-migration");
});

for (const [name, mutate, expected] of [
  ["missing positive acceptance", ({ manifest }) => { manifest.acceptanceTests.positive = []; }, "ADMIN_DATA_POSITIVE_ACCEPTANCE_INVALID"],
  ["missing negative acceptance", ({ manifest }) => { manifest.acceptanceTests.negative = []; }, "ADMIN_DATA_NEGATIVE_ACCEPTANCE_INVALID"],
  ["non-denial negative acceptance", ({ root }) => put(root, PATHS.negative, "select true;\n"), "ADMIN_DATA_NEGATIVE_DENIAL_ASSERTION_MISSING"],
  ["historical migration mutation", async ({ root }) => { const existing = git(root, ["ls-tree", "-r", "--name-only", "HEAD", "--", "supabase/migrations"]).split("\n").filter(Boolean)[0]; await writeFile(join(root, existing), `${await readFile(join(root, existing), "utf8")}\n-- forbidden mutation\n`); }, "HISTORICAL_MIGRATION_MUTATION"],
  ["Production contract mutation", ({ root }) => put(root, "supabase/production/auth-config.json", "{}\n"), "FORBIDDEN_SCOPE:supabase/production/auth-config.json"],
  ["Edge Function mutation", ({ root }) => put(root, "supabase/functions/unrelated/index.ts", "export {};\n"), "FORBIDDEN_SCOPE:supabase/functions/unrelated/index.ts"],
  ["Decision source mutation", ({ root }) => put(root, "packages/decision-orchestrator-runtime/src/ranking.mjs", "export const drift = true;\n"), "DECISION_SOURCE_DRIFT"],
  ["unbound admin file", ({ root }) => put(root, "supabase/tests/unbound.sql", "select true;\n"), "SCOPE_OUTSIDE_ALLOWLIST:supabase/tests/unbound.sql"],
]) test(`admin-data-additive rejects ${name}`, async () => {
  const x = await fixture(mutate);
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, false);
  assert.ok(receipt.reasons.includes(expected), receipt.reasons.join(","));
});

for (const [name, mutate, expected] of [
  ["candidate schema fingerprint binding", (artifact) => { artifact.adminData.candidateFingerprints.applicationSchema = "0".repeat(64); }, "ADMIN_DATA_CANDIDATE_FINGERPRINT_BINDING_MISMATCH"],
  ["migration hash", (artifact) => { artifact.adminData.migrationSha256[PATHS.migration] = "0".repeat(64); }, "ADMIN_DATA_MIGRATION_HASH_MISMATCH"],
  ["acceptance hash", (artifact) => { artifact.adminData.acceptanceTestSha256[PATHS.negative] = "0".repeat(64); }, "ADMIN_DATA_ACCEPTANCE_HASH_MISMATCH"],
  ["reconstruction hash", (artifact) => { artifact.adminData.reconstructionSha256[PATHS.schemaReconstruction] = "0".repeat(64); }, "ADMIN_DATA_RECONSTRUCTION_HASH_MISMATCH"],
]) test(`admin-data-additive rejects tampered ${name}`, async () => {
  const x = await fixture();
  mutate(x.artifact);
  rehash(x.artifact);
  const receipt = await verifyPreMergeCandidate({ root: x.root, artifact: x.artifact, prBaseSha: x.base, prHeadSha: x.candidate });
  assert.equal(receipt.valid, false);
  assert.ok(receipt.reasons.includes(expected), receipt.reasons.join(","));
});

test("admin-data-additive generation fails closed without its explicit manifest", async () => {
  const x = await fixture();
  await assert.rejects(() => generateCandidateEvidence({ root: x.root, baseVersion: "v46", baseMainSha: x.base, candidateSha: x.candidate, evidencePaths: [PATHS.positive], requestedScope: "admin-data-additive" }));
});
