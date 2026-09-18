import test from "node:test";
import assert from "node:assert/strict";
import { loadControlPlaneDocuments, validateControlPlaneDocuments } from "./integration-preflight.mjs";
import { IDEMPOTENCY_MIGRATION_PATH, partitionSourceAwareMigrationScopes, WORLD_MIGRATION_PATHS } from "./source-aware-idempotency-migration-scope.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("Week-1 control-plane documents are internally consistent and fail closed", () => {
  const result = validateControlPlaneDocuments(loadControlPlaneDocuments());
  assert.equal(result.boundDomainCandidates, 3);
  assert.match(result.sharedArtifactHash, /^[0-9a-f]{64}$/);
});

test("missing flag configuration cannot become enabled", () => {
  const documents = clone(loadControlPlaneDocuments());
  documents.flags.missingConfigurationBehavior = "ON";
  assert.throws(() => validateControlPlaneDocuments(documents), /dark_release_not_fail_closed/);
});

test("domain candidates must be completely hash-bound and share one artifact", () => {
  const documents = clone(loadControlPlaneDocuments());
  documents.manifest.domainCandidates[0].headSha = null;
  assert.throws(() => validateControlPlaneDocuments(documents), /domain_candidate_partially_bound:WORLD/);

  for (const [index, candidate] of documents.manifest.domainCandidates.entries()) Object.assign(candidate, {
    pr: index + 1,
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    artifactHash: String(index).repeat(64),
    status: "READY",
  });
  assert.throws(() => validateControlPlaneDocuments(documents), /domain_candidates_do_not_share_one_artifact/);
});

test("execution authority is false in every release identity", () => {
  const documents = clone(loadControlPlaneDocuments());
  documents.manifest.productionPlan.executionAuthorized = true;
  assert.throws(() => validateControlPlaneDocuments(documents), /manifest_execution_must_be_false/);
});

test("source-aware scope preserves nine World migrations and accepts only the sealed idempotency addition", () => {
  const world = WORLD_MIGRATION_PATHS.map((path) => ({ path, sha256: "a".repeat(64) }));
  assert.deepEqual(partitionSourceAwareMigrationScopes(world), { worldMigrations: world, independentMigrations: [] });
  const idempotency = { path: IDEMPOTENCY_MIGRATION_PATH, sha256: "b".repeat(64) };
  assert.deepEqual(partitionSourceAwareMigrationScopes([...world, idempotency]), { worldMigrations: world, independentMigrations: [idempotency] });
  assert.throws(() => partitionSourceAwareMigrationScopes([...world, { path: "supabase/migrations/20260919000000_unknown.sql", sha256: "c".repeat(64) }]), /independent_scope_unknown/);
  assert.throws(() => partitionSourceAwareMigrationScopes([world[1], world[0], ...world.slice(2)]), /world_migration_identity_or_order_mismatch/);
  assert.throws(() => partitionSourceAwareMigrationScopes([...world, idempotency, idempotency]), /duplicate_pending_migration|pending_migration_count_invalid/);
});
