#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isExactProductAdditiveSet, isExactPreappliedPriorityReceipt } from "../ci/product-additive-migration-scope.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const HASH = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const required = (condition, code) => { if (!condition) throw new Error(code); };
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Pure comparison of a certified candidate with a separately collected, read-only remote receipt. */
export function verifyProductReleasePreflight({ manifest, plan, ledger, baselineMigrationVersions, remote, now = new Date() }) {
  required(manifest?.contractVersion === "backyrd.product-release-manifest@3.0", "release_manifest_v3_required");
  const { manifestHash, ...manifestBody } = manifest;
  required(HASH.test(manifestHash) && sha256(JSON.stringify(manifestBody)) === manifestHash, "release_manifest_integrity_invalid");
  required(manifest.identity?.mode === "PR_CANDIDATE" || manifest.identity?.mode === "POST_MERGE_MAIN", "release_identity_mode_invalid");
  required(manifest.buildOnceDeploySameArtifact === true && manifest.nodeMajor === 20, "release_artifact_contract_invalid");
  required(manifest.sourceSha === plan?.canonicalMainSha && SHA.test(manifest.sourceSha), "release_candidate_plan_identity_invalid");
  required(manifest.productionPlan?.planHash === plan.planHash && plan.projectRef === ledger?.projectRef, "release_plan_binding_invalid");
  required(plan.baseSha === ledger.supabase?.shippedSourceSha && SHA.test(plan.baseSha), "release_shipped_source_mismatch");
  required(plan.authConfig?.deploy !== true && manifest.productionPlan.executionAuthorized === false, "release_auth_or_execution_scope_invalid");
  required(equal(plan.pendingMigrations, manifest.productionPlan.pendingMigrations), "release_migration_set_mismatch");
  required(equal(plan.deployFunctions, manifest.productionPlan.deployFunctions), "release_function_set_mismatch");
  const currentRiskSet = (plan.productPreappliedImport?.migrations ?? [
    ...(plan.additivePreappliedPriority ? [plan.additivePreappliedPriority] : []),
    ...plan.pendingMigrations,
  ])
    .map(({ path, sha256: migrationSha256 }) => ({ path, sha256: migrationSha256 }));
  required(equal(plan.additivePreappliedPriority ?? null, manifest.productionPlan.additivePreappliedPriority ?? null)
    && (!plan.additivePreappliedPriority
      || (isExactPreappliedPriorityReceipt(plan.additivePreappliedPriority)
        && equal(plan.additivePreappliedPriority, manifest.productionPlan.additiveMigrationScope?.preappliedPriorityReceipt)
        && plan.pendingMigrations.length === 1)), "release_preapplied_priority_invalid");
  const acceptedMigrations = currentRiskSet.length === 13
    ? currentRiskSet : manifest.productionPlan.recoveryRiskMigrationSet;
  required(Array.isArray(acceptedMigrations) && (currentRiskSet.length === 13
    ? equal(currentRiskSet, (manifest.productionPlan.productPreappliedImport?.migrations ?? manifest.productionPlan.pendingMigrations)
      .map(({ path, sha256: migrationSha256 }) => ({ path, sha256: migrationSha256 })))
    : !plan.productPreappliedImport && !manifest.productionPlan.productPreappliedImport), "release_accepted_migration_set_mismatch");
  required(acceptedMigrations.length === 13, "release_candidate_migration_count_invalid");
  if (currentRiskSet.length !== 13 && plan.pendingMigrations.length > 0) {
    const scope = manifest.productionPlan.additiveMigrationScope;
    required(scope?.contractVersion === "backyrd.product-v1-additive-migration-scope@1.0"
      && scope.projectRef === plan.projectRef && scope.executionAuthorized === false
      && scope.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
      && scope.guaranteedDatabaseRollback === false
      && isExactProductAdditiveSet(currentRiskSet)
      && equal(scope.migrations, currentRiskSet), "release_additive_migration_scope_invalid");
  }
  if (plan.productPreappliedImport) {
    required(plan.pendingMigrations.length === 2
      && /\/20260919120432_world_product_admin_authoring_independent_v1\.sql$/.test(plan.pendingMigrations[0]?.path)
      && /\/20260919122454_world_product_approved_catalog_bootstrap_v1\.sql$/.test(plan.pendingMigrations[1]?.path), "release_pending_world_admin_scope_invalid");
  }
  const inherited = acceptedMigrations.slice(0, 11);
  required(inherited.filter((item) => /world_knowledge|world_founder/.test(item.path)).length === 9
    && inherited.some((item) => /founder_live_durable_idempotency_v1\.sql$/.test(item.path))
    && inherited.some((item) => /decision_vnext_product_runtime_v1\.sql$/.test(item.path)), "release_inherited_migration_scope_invalid");
  required(/\/20260919073307_decision_product_activation_lease_v1\.sql$/.test(acceptedMigrations[11].path), "release_activation_migration_missing");
  required(/\/20260919090423_world_product_admin_spot_search_v1\.sql$/.test(acceptedMigrations[12].path), "release_admin_spot_search_migration_missing");
  required([...acceptedMigrations, ...plan.pendingMigrations].every((item) => /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(item.path) && HASH.test(item.sha256)), "release_migration_identity_invalid");
  const risk = manifest.productionPlan.recoveryRiskAcceptance;
  required(risk?.contractVersion === "backyrd.product-v1-founder-recovery-risk-acceptance@1.0"
    && risk.decision === "ACCEPT_UNTESTED_DATABASE_RECOVERY_RISK"
    && risk.canonicalStartingMainSha === "a58d829a6c5f231e48f3582bcd69adf9245c0589"
    && risk.projectRef === plan.projectRef && risk.pendingMigrationCount === 13
    && risk.pendingMigrationSetSha256 === sha256(JSON.stringify(acceptedMigrations))
    && risk.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
    && risk.guaranteedDatabaseRollback === false && risk.productionDataCopyAuthorized === false,
  "release_recovery_risk_acceptance_invalid");
  if (!remote) return {
    status: "NO_GO_REMOTE_NOT_QUERIED", sourceAware: true, productionQueried: false,
    candidateSha: manifest.sourceSha, manifestHash, planHash: plan.planHash,
    inheritedMigrationCount: 11, candidateMigrationCount: plan.pendingMigrations.length,
  };
  required(remote.contractVersion === "backyrd.product-release-remote-observation@2.0", "remote_receipt_contract_invalid");
  required(remote.projectRef === plan.projectRef && remote.candidateSha === manifest.sourceSha
    && remote.manifestHash === manifestHash && remote.planHash === plan.planHash
    && remote.recoveryRiskAcceptanceSha256 === sha256(JSON.stringify(risk)), "remote_receipt_binding_invalid");
  required(remote.observationSource === "PROTECTED_MANUAL_READ_ONLY_PREFLIGHT"
    && Number.isSafeInteger(remote.runId) && remote.runId > 0, "remote_receipt_provenance_missing");
  required(Array.isArray(baselineMigrationVersions) && baselineMigrationVersions.length === ledger.supabase.migrationCount
    && baselineMigrationVersions.at(-1) === ledger.supabase.migrationTip.replace(/_.*/, ""), "remote_shipped_migration_baseline_invalid");
  const expectedAppliedVersions = plan.productPreappliedImport
    ? [...baselineMigrationVersions, ...acceptedMigrations.map((item) => item.path.match(/\/([0-9]{14})_/)?.[1])]
    : [...baselineMigrationVersions, ...(plan.additivePreappliedPriority
      ? [plan.additivePreappliedPriority.path.match(/\/([0-9]{14})_/)?.[1]] : [])];
  required(equal(remote.appliedMigrationVersions, expectedAppliedVersions), "remote_migration_ledger_drift");
  if (plan.additivePreappliedPriority) required(equal(remote.preappliedPriorityStatementSha256,
    plan.additivePreappliedPriority.statementSha256), "remote_preapplied_priority_statement_drift");
  required(remote.deployedSupabaseSourceSha === ledger.supabase.shippedSourceSha, "remote_source_drift");
  for (const item of plan.functions.filter((entry) => entry.deploy)) {
    required(HASH.test(item.previousSourceSetHash) && remote.deployedFunctionSourceSets?.[item.slug] === item.previousSourceSetHash,
      `remote_function_drift:${item.slug}`);
  }
  required(remote.installedMobile?.sourceSha === ledger.mobile.shippedSourceSha
    && remote.installedMobile?.runtimeVersion === ledger.mobile.runtimeVersion
    && remote.installedMobile?.otaGroupId === ledger.mobile.otaGroupId, "remote_mobile_drift");
  const point = remote.recoveryPoint;
  const pointAt = Date.parse(point?.capturedAt ?? "");
  const observedAt = Date.parse(remote.observedAt ?? "");
  required(Number.isFinite(observedAt) && observedAt <= now.getTime() && now.getTime() - observedAt <= 60 * 60 * 1000, "remote_observation_stale");
  required(typeof point?.backupId === "string" && point.backupId.length > 0
    && Number.isFinite(pointAt) && pointAt <= observedAt && observedAt - pointAt <= 24 * 60 * 60 * 1000
    && point.restoreDrillPassed === false && point.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
    && point.guaranteedDatabaseRollback === false
    && point.priorFunctionSourceSetHash === remote.deployedFunctionSourceSets?.["decision-v13"]
    && point.priorOtaGroupId === remote.installedMobile.otaGroupId
    && point.emergencyOffReady === true, "remote_recovery_point_unusable");
  return {
    status: "SOURCE_AWARE_MATCH_PENDING_RELEASE_GO", sourceAware: true, productionQueried: true,
    candidateSha: manifest.sourceSha, manifestHash, planHash: plan.planHash,
    inheritedMigrationCount: 11, candidateMigrationCount: plan.pendingMigrations.length,
    remoteRunId: remote.runId,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((result, item, index, all) => {
      if (item.startsWith("--")) result.push([item.slice(2), all[index + 1]]); return result;
    }, []));
    const repo = resolve(args.repo ?? new URL("../..", import.meta.url).pathname);
    const manifest = JSON.parse(readFileSync(resolve(args.manifest), "utf8"));
    const plan = JSON.parse(readFileSync(resolve(args.plan), "utf8"));
    const ledger = JSON.parse(execFileSync("git", ["show", `${manifest.sourceSha}:delivery/production-state.json`], { cwd: repo, encoding: "utf8" }));
    const baselineMigrationVersions = execFileSync("git", ["ls-tree", "-r", "--name-only", ledger.supabase.shippedSourceSha, "--", "supabase/migrations"], { cwd: repo, encoding: "utf8" })
      .trim().split("\n").filter(Boolean).map((path) => path.match(/^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/)?.[1]).filter(Boolean);
    const remote = args.remote ? JSON.parse(readFileSync(resolve(args.remote), "utf8")) : null;
    const result = verifyProductReleasePreflight({ manifest, plan, ledger, baselineMigrationVersions, remote });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === "NO_GO_REMOTE_NOT_QUERIED") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`product_release_preflight_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
