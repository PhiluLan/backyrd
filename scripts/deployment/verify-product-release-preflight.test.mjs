import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyProductReleasePreflight } from "./verify-product-release-preflight.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = "a".repeat(40);
const shipped = "b".repeat(40);
const migrations = [
  ...Array.from({ length: 9 }, (_, index) => ({ path: `supabase/migrations/2026091${index}000000_world_knowledge_${index}.sql`, sha256: hash(`world-${index}`) })),
  { path: "supabase/migrations/20260918123000_founder_live_durable_idempotency_v1.sql", sha256: hash("founder") },
  { path: "supabase/migrations/20260918182831_decision_vnext_product_runtime_v1.sql", sha256: hash("runtime") },
  { path: "supabase/migrations/20260919073307_decision_product_activation_lease_v1.sql", sha256: hash("activation") },
  { path: "supabase/migrations/20260919090423_world_product_admin_spot_search_v1.sql", sha256: hash("admin-search") },
];
const fixture = () => {
  const pendingMigrations = migrations.map((migration) => ({ ...migration }));
  const plan = {
    projectRef: "test-project", baseSha: shipped, canonicalMainSha: sha,
    planHash: hash("plan"), pendingMigrations, deployFunctions: ["decision-v13"],
    functions: [{ slug: "decision-v13", deploy: true, previousSourceSetHash: hash("prior-function") }], authConfig: null,
  };
  const recoveryRiskAcceptance = {
    contractVersion: "backyrd.product-v1-founder-recovery-risk-acceptance@1.0",
    decision: "ACCEPT_UNTESTED_DATABASE_RECOVERY_RISK",
    canonicalStartingMainSha: "a58d829a6c5f231e48f3582bcd69adf9245c0589",
    projectRef: plan.projectRef, pendingMigrationCount: 13,
    pendingMigrationSetSha256: hash(JSON.stringify(pendingMigrations)),
    restoreDrillStatus: "NOT_PERFORMED_BY_FOUNDER_DECISION",
    guaranteedDatabaseRollback: false, productionDataCopyAuthorized: false,
  };
  const ledger = {
    projectRef: "test-project", supabase: { shippedSourceSha: shipped, migrationCount: 2, migrationTip: "20260909073004_close_review_capture_trust_v2" },
    mobile: { shippedSourceSha: shipped, runtimeVersion: "1.1.0", otaGroupId: "prior-ota" },
  };
  const body = {
    contractVersion: "backyrd.product-release-manifest@3.0", sourceSha: sha,
    identity: { mode: "PR_CANDIDATE" }, nodeMajor: 20, buildOnceDeploySameArtifact: true,
    productionPlan: { planHash: plan.planHash, pendingMigrations: pendingMigrations.map((migration) => ({ ...migration })), deployFunctions: plan.deployFunctions, executionAuthorized: false, recoveryRiskAcceptance },
  };
  const manifest = { ...body, manifestHash: hash(JSON.stringify(body)) };
  const now = new Date("2026-09-19T12:00:00.000Z");
  const baselineMigrationVersions = ["20260908000000", "20260909073004"];
  const remote = {
    contractVersion: "backyrd.product-release-remote-observation@2.0", projectRef: "test-project",
    candidateSha: sha, manifestHash: manifest.manifestHash, planHash: plan.planHash,
    recoveryRiskAcceptanceSha256: hash(JSON.stringify(recoveryRiskAcceptance)),
    observationSource: "PROTECTED_MANUAL_READ_ONLY_PREFLIGHT", runId: 111,
    observedAt: "2026-09-19T11:55:00.000Z", appliedMigrationVersions: [...baselineMigrationVersions],
    deployedSupabaseSourceSha: shipped, deployedFunctionSourceSets: { "decision-v13": hash("prior-function") },
    installedMobile: { sourceSha: shipped, runtimeVersion: "1.1.0", otaGroupId: "prior-ota" },
    recoveryPoint: { backupId: "backup-test-1", capturedAt: "2026-09-19T10:00:00.000Z", restoreDrillPassed: false,
      restoreDrillStatus: "NOT_PERFORMED_BY_FOUNDER_DECISION", guaranteedDatabaseRollback: false,
      priorFunctionSourceSetHash: hash("prior-function"), priorOtaGroupId: "prior-ota", emergencyOffReady: true },
  };
  return { manifest, plan, ledger, baselineMigrationVersions, remote, now };
};

test("candidate planning remains NO-GO when Production has not been queried", () => {
  const input = fixture();
  assert.equal(verifyProductReleasePreflight({ ...input, remote: null }).status, "NO_GO_REMOTE_NOT_QUERIED");
});

test("later additive Product SQL needs its own exact scope, never the historical 13-migration acceptance", () => {
  const input = fixture();
  const newMigration = {
    path: "supabase/migrations/20260919205256_decision_vnext_verified_world_catalog_priority.sql",
    sha256: "541c15131c53efb23a5d300ef17cbd8ba3312cfc3be320e0537c1491d7547626",
  };
  input.plan.pendingMigrations = [newMigration];
  input.manifest.productionPlan.pendingMigrations = [newMigration];
  input.manifest.productionPlan.recoveryRiskMigrationSet = migrations;
  input.manifest.productionPlan.additiveMigrationScope = {
    contractVersion: "backyrd.product-v1-additive-migration-scope@1.0",
    projectRef: input.plan.projectRef,
    migrations: [newMigration], executionAuthorized: false,
    restoreDrillStatus: "NOT_PERFORMED_BY_FOUNDER_DECISION", guaranteedDatabaseRollback: false,
  };
  const { manifestHash: unused, ...body } = input.manifest;
  input.manifest.manifestHash = hash(JSON.stringify(body));
  input.remote.manifestHash = input.manifest.manifestHash;
  assert.equal(verifyProductReleasePreflight({ ...input, remote: null }).status, "NO_GO_REMOTE_NOT_QUERIED");
  assert.equal(verifyProductReleasePreflight(input).status, "SOURCE_AWARE_MATCH_PENDING_RELEASE_GO");
  input.manifest.productionPlan.additiveMigrationScope.migrations[0] = { ...newMigration, sha256: hash("tampered") };
  assert.throws(() => verifyProductReleasePreflight(input), /release_additive_migration_scope_invalid|release_manifest_integrity_invalid/);
});

test("two-file World Product additive scope is exact, ordered, and never execution authority", () => {
  const input = fixture();
  input.manifest.productionPlan.recoveryRiskMigrationSet = input.plan.pendingMigrations;
  const migrations = [
    { path: "supabase/migrations/20260919205256_decision_vnext_verified_world_catalog_priority.sql", sha256: "541c15131c53efb23a5d300ef17cbd8ba3312cfc3be320e0537c1491d7547626" },
    { path: "supabase/migrations/20260920190048_bridge_product_world_knowledge_v1.sql", sha256: "f13bbb8a91ad6f3b976a6b5b95cd4e72af68750b53be6668cadf810248b6d02d" },
  ];
  input.plan.pendingMigrations = migrations;
  input.manifest.productionPlan.pendingMigrations = migrations;
  input.manifest.productionPlan.additiveMigrationScope = {
    contractVersion: "backyrd.product-v1-additive-migration-scope@1.0", projectRef: input.plan.projectRef,
    migrations, executionAuthorized: false, restoreDrillStatus: "NOT_PERFORMED_BY_FOUNDER_DECISION", guaranteedDatabaseRollback: false,
  };
  const reseal = () => { const { manifestHash: unused, ...body } = input.manifest; input.manifest.manifestHash = hash(JSON.stringify(body)); input.remote.manifestHash = input.manifest.manifestHash; };
  reseal();
  assert.equal(verifyProductReleasePreflight({ ...input, remote: null }).status, "NO_GO_REMOTE_NOT_QUERIED");
  for (const bad of [
    [...migrations, { path: "supabase/migrations/20260920190100_foreign.sql", sha256: hash("foreign") }],
    [migrations[0], { ...migrations[1], sha256: hash("changed") }],
    [...migrations].reverse(),
  ]) {
    input.plan.pendingMigrations = bad;
    input.manifest.productionPlan.pendingMigrations = bad;
    input.manifest.productionPlan.additiveMigrationScope.migrations = bad;
    reseal();
    assert.throws(() => verifyProductReleasePreflight({ ...input, remote: null }), /release_additive_migration_scope_invalid/);
  }
});

test("missing or substituted Admin spot search migration blocks the release plan", () => {
  const missing = fixture();
  missing.plan.pendingMigrations.pop();
  assert.throws(() => verifyProductReleasePreflight(missing), /release_migration_set_mismatch|release_candidate_migration_count_invalid/);
  const substituted = fixture();
  substituted.plan.pendingMigrations[12] = { path: "supabase/migrations/20260919090423_wrong_search.sql", sha256: hash("wrong") };
  substituted.manifest.productionPlan.pendingMigrations[12] = substituted.plan.pendingMigrations[12];
  const { manifestHash: _hash, ...body } = substituted.manifest;
  substituted.manifest.manifestHash = hash(JSON.stringify(body));
  assert.throws(() => verifyProductReleasePreflight(substituted), /release_admin_spot_search_migration_missing/);
});

test("source-aware comparison binds migration, Function, installed app and recovery point", () => {
  const input = fixture();
  assert.equal(verifyProductReleasePreflight(input).status, "SOURCE_AWARE_MATCH_PENDING_RELEASE_GO");
  const attacks = [
    [(value) => { value.remote.appliedMigrationVersions[1] = "20260919000000"; }, /remote_migration_ledger_drift/],
    [(value) => { value.remote.deployedFunctionSourceSets["decision-v13"] = hash("other"); }, /remote_function_drift/],
    [(value) => { value.remote.installedMobile.otaGroupId = "other"; }, /remote_mobile_drift/],
    [(value) => { value.remote.recoveryPoint.restoreDrillPassed = true; }, /remote_recovery_point_unusable/],
    [(value) => { value.remote.recoveryRiskAcceptanceSha256 = hash("other"); }, /remote_receipt_binding_invalid/],
    [(value) => { value.remote.recoveryPoint.guaranteedDatabaseRollback = true; }, /remote_recovery_point_unusable/],
    [(value) => { value.plan.pendingMigrations[0].sha256 = hash("changed"); }, /release_migration_set_mismatch/],
    [(value) => { value.remote.recoveryPoint.capturedAt = "2026-09-17T00:00:00.000Z"; }, /remote_recovery_point_unusable/],
    [(value) => { value.remote.planHash = hash("other"); }, /remote_receipt_binding_invalid/],
    [(value) => { value.remote.observedAt = "2026-09-18T00:00:00.000Z"; }, /remote_observation_stale/],
    [(value) => { value.manifest.productionPlan.executionAuthorized = true; }, /release_manifest_integrity_invalid/],
  ];
  for (const [mutate, reason] of attacks) {
    const candidate = fixture(); mutate(candidate);
    assert.throws(() => verifyProductReleasePreflight(candidate), reason);
  }
});

test("observed 13-migration prefix leaves only the two World Admin migrations pending", () => {
  const input = fixture();
  const observed = input.plan.pendingMigrations.map((entry) => ({ ...entry, productionStatementCount: 1, productionStatementSha256: hash(entry.path) }));
  const pending = [
    { path: "supabase/migrations/20260919120432_world_product_admin_authoring_independent_v1.sql", sha256: hash("authoring") },
    { path: "supabase/migrations/20260919122454_world_product_approved_catalog_bootstrap_v1.sql", sha256: hash("bootstrap") },
  ];
  input.plan.productPreappliedImport = { migrations: observed };
  input.plan.pendingMigrations = pending;
  input.manifest.productionPlan.productPreappliedImport = { migrations: observed.map((entry) => ({ ...entry })) };
  input.manifest.productionPlan.pendingMigrations = pending.map((entry) => ({ ...entry }));
  const { manifestHash: _hash, ...body } = input.manifest;
  input.manifest.manifestHash = hash(JSON.stringify(body));
  input.remote.manifestHash = input.manifest.manifestHash;
  input.remote.appliedMigrationVersions.push(...observed.map(({ path }) => path.match(/\/([0-9]{14})_/)[1]));
  assert.equal(verifyProductReleasePreflight(input).candidateMigrationCount, 2);
  input.remote.appliedMigrationVersions.pop();
  assert.throws(() => verifyProductReleasePreflight(input), /remote_migration_ledger_drift/);
});
