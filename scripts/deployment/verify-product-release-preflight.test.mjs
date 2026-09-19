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
  const ledger = {
    projectRef: "test-project", supabase: { shippedSourceSha: shipped, migrationCount: 2, migrationTip: "20260909073004_close_review_capture_trust_v2" },
    mobile: { shippedSourceSha: shipped, runtimeVersion: "1.1.0", otaGroupId: "prior-ota" },
  };
  const body = {
    contractVersion: "backyrd.product-release-manifest@3.0", sourceSha: sha,
    identity: { mode: "PR_CANDIDATE" }, nodeMajor: 20, buildOnceDeploySameArtifact: true,
    productionPlan: { planHash: plan.planHash, pendingMigrations: pendingMigrations.map((migration) => ({ ...migration })), deployFunctions: plan.deployFunctions, executionAuthorized: false },
  };
  const manifest = { ...body, manifestHash: hash(JSON.stringify(body)) };
  const now = new Date("2026-09-19T12:00:00.000Z");
  const baselineMigrationVersions = ["20260908000000", "20260909073004"];
  const remote = {
    contractVersion: "backyrd.product-release-remote-observation@1.0", projectRef: "test-project",
    candidateSha: sha, manifestHash: manifest.manifestHash, planHash: plan.planHash,
    observationSource: "PROTECTED_MANUAL_READ_ONLY_PREFLIGHT", runId: 111,
    observedAt: "2026-09-19T11:55:00.000Z", appliedMigrationVersions: [...baselineMigrationVersions],
    deployedSupabaseSourceSha: shipped, deployedFunctionSourceSets: { "decision-v13": hash("prior-function") },
    installedMobile: { sourceSha: shipped, runtimeVersion: "1.1.0", otaGroupId: "prior-ota" },
    recoveryPoint: { backupId: "backup-test-1", capturedAt: "2026-09-19T10:00:00.000Z", restoreDrillPassed: true,
      restoreOperator: "release-operator", priorFunctionSourceSetHash: hash("prior-function"), priorOtaGroupId: "prior-ota", emergencyOffReady: true },
  };
  return { manifest, plan, ledger, baselineMigrationVersions, remote, now };
};

test("candidate planning remains NO-GO when Production has not been queried", () => {
  const input = fixture();
  assert.equal(verifyProductReleasePreflight({ ...input, remote: null }).status, "NO_GO_REMOTE_NOT_QUERIED");
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
    [(value) => { value.remote.recoveryPoint.restoreDrillPassed = false; }, /remote_recovery_point_unusable/],
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
