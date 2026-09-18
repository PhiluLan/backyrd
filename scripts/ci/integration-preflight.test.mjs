import test from "node:test";
import assert from "node:assert/strict";
import { loadControlPlaneDocuments, validateControlPlaneDocuments } from "./integration-preflight.mjs";
import { IDEMPOTENCY_MIGRATION_PATH, partitionSourceAwareMigrationScopes, WORLD_MIGRATION_PATHS } from "./source-aware-idempotency-migration-scope.mjs";
import { createHash } from "node:crypto";
import { validateSourceAwareInactiveFounderLiveScope } from "./source-aware-inactive-founder-live-scope.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceIdentity = { headSha: "1".repeat(40), treeSha: "2".repeat(40) };
const inactivePlan = { deployFunctions: ["decision-founder-live"], authConfig: { deploy: false }, runtimeActivation: false, executionAuthorized: false, planHash: "3".repeat(64) };
const edgeEvidence = () => {
  const body = {
    contractVersion: "backyrd.founder-live-edge-implementation-evidence@1.0",
    sourceSha: sourceIdentity.headSha,
    sourceTreeSha: sourceIdentity.treeSha,
    sourceSetHash: "4".repeat(64),
    artifactHash: "5".repeat(64),
    productionPlanHash: inactivePlan.planHash,
    deployFunctions: ["decision-founder-live"],
    edgeBoundaryVersion: "backyrd.decision-vnext.founder-live-edge-boundary@1.0",
    verifyJwt: true,
    corsPolicy: "EXACT_SERVER_CONFIGURED_ORIGIN_ALLOWLIST",
    runtimeAuthority: "NOT_AUTHORIZED",
    defaultState: "OFF",
    killSwitch: "ENGAGED_BY_ABSENT_RUNTIME_AUTHORITY",
    worldPort: "CANONICAL_WORLD_READER_ONLY",
    userPort: "CANONICAL_RELEVANT_USER_PROJECTION_ONLY",
    idempotencyPort: "DURABLE_RPC_ONLY",
    rateLimitPort: "GATE_7_DURABLE_RPC_ONLY",
    deploymentAuthorized: false,
    executionAuthorized: false,
    productionQueries: 0,
    migrationsExecuted: 0,
    functionsDeployed: 0,
    runtimeActivations: 0,
  };
  return { ...body, evidenceHash: hash(body) };
};

test("source-aware preflight admits only the evidence-bound inactive Founder-live function", () => {
  assert.deepEqual(validateSourceAwareInactiveFounderLiveScope({ productionPlan: inactivePlan, evidence: edgeEvidence(), ...sourceIdentity }), [{
    functionName: "decision-founder-live",
    relationship: "SEPARATELY_VALIDATED_INACTIVE_DECISION_SOURCE",
    evidenceHash: edgeEvidence().evidenceHash,
    sourceSetHash: "4".repeat(64),
    artifactHash: "5".repeat(64),
    defaultState: "OFF",
    killSwitch: "ENGAGED",
    runtimeAuthority: "NOT_AUTHORIZED",
    deploymentAuthorized: false,
    executionAuthorized: false,
  }]);
  assert.deepEqual(validateSourceAwareInactiveFounderLiveScope({ productionPlan: { ...inactivePlan, deployFunctions: [] }, evidence: null, ...sourceIdentity }), []);
});

test("source-aware preflight fails closed on function, evidence, Auth, activation and authority drift", () => {
  const failures = [
    { productionPlan: { ...inactivePlan, deployFunctions: ["decision-copy"] }, evidence: edgeEvidence() },
    { productionPlan: { ...inactivePlan, deployFunctions: ["decision-founder-live", "decision-copy"] }, evidence: edgeEvidence() },
    { productionPlan: inactivePlan, evidence: null },
    { productionPlan: { ...inactivePlan, authConfig: { deploy: true } }, evidence: edgeEvidence() },
    { productionPlan: { ...inactivePlan, runtimeActivation: true }, evidence: edgeEvidence() },
    { productionPlan: { ...inactivePlan, executionAuthorized: true }, evidence: edgeEvidence() },
  ];
  for (const input of failures) assert.throws(() => validateSourceAwareInactiveFounderLiveScope({ ...input, ...sourceIdentity }), /founder_live_/);
});

test("source-aware preflight rejects missing or rehashed false Edge evidence", () => {
  for (const mutate of [
    (value) => { value.sourceSha = "9".repeat(40); },
    (value) => { value.productionPlanHash = "9".repeat(64); },
    (value) => { value.defaultState = "ON"; },
    (value) => { value.killSwitch = "DISENGAGED"; },
    (value) => { value.runtimeAuthority = "AUTHORIZED"; },
    (value) => { value.deploymentAuthorized = true; },
    (value) => { value.executionAuthorized = true; },
    (value) => { value.functionsDeployed = 1; },
    (value) => { value.extra = "unbound"; },
  ]) {
    const forged = edgeEvidence();
    mutate(forged);
    delete forged.evidenceHash;
    forged.evidenceHash = hash(forged);
    assert.throws(() => validateSourceAwareInactiveFounderLiveScope({ productionPlan: inactivePlan, evidence: forged, ...sourceIdentity }), /founder_live_/);
  }
});

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
