#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFounderActivationArtifact } from "./founder-activation-artifact.mjs";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import { verifySourceAwareInactiveFounderLiveScope } from "./source-aware-inactive-founder-live-scope.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const BASE = "34c0cbec903e53087e28e46d1886648bc6ce72bc";
const BASE_TREE = "87b44dfef7154c35c5f386e161e0fec622ad12b4";
const CANONICAL_COMPLETION_SHA = "96f648cebbfdfd854aec688613ddbedb447c25bb";
const CANONICAL_COMPLETION_TREE = "4321f018f04056f14aea6c7d59c4cb21a88a9a44";
const SEALED_PATHS = new Set([
  "delivery/integration/founder-activation-dependency-ownership-matrix.json",
  "delivery/integration/founder-activation-manifest.json",
  "delivery/integration/founder-activation-post-deploy-evidence.json",
  "delivery/integration/founder-activation-production-plan.json",
  "delivery/integration/founder-activation-rehearsal-evidence.json",
  "delivery/integration/founder-activation-shared-artifact.json",
  "delivery/integration/founder-activation-status.json"
]);
const INACTIVE_EDGE_CONFIG_BLOCK = `[functions.decision-founder-live]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/decision-founder-live/index.ts"\n\n`;
const INACTIVE_EDGE_CHANGES = new Map([
  ["supabase/config.toml", "M"],
  ["supabase/functions/decision-founder-live/index.ts", "A"],
  ["supabase/functions/decision-founder-live/runtime-boundary.mjs", "A"],
  ["supabase/functions/decision-founder-live/runtime-boundary.test.mjs", "A"],
]);
const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const load = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

export function validateFounderActivationDocuments({ manifest, matrix, plan, status }) {
  requireValue(manifest.contractVersion === "backyrd.founder-activation-integration@1.0", "founder_activation_manifest_version_invalid");
  requireValue(manifest.canonicalBaseSha === BASE && manifest.canonicalBaseTreeSha === BASE_TREE, "founder_activation_base_invalid");
  requireValue(manifest.executionAuthorized === false && manifest.productionActivationAuthorized === false && manifest.productionQueriesAuthorized === false, "founder_activation_authority_open");
  requireValue(manifest.identityModes.join(",") === "PR_CANDIDATE,POST_MERGE_MAIN", "founder_activation_identity_modes_invalid");
  requireValue(manifest.mergeOrder.join(",") === "USER_UUID_AUTHORITY,DECISION_SERVER_AUTHORITY,INTEGRATION_EVIDENCE_SEAL", "founder_activation_merge_order_invalid");
  requireValue(manifest.inheritedCanonicalRelease.mergeSha === BASE && manifest.inheritedCanonicalRelease.treeSha === BASE_TREE && manifest.inheritedCanonicalRelease.worldAdminAuthoringIndependent === true && manifest.inheritedCanonicalRelease.domainSemanticsMutable === false, "founder_activation_inherited_release_invalid");
  requireValue(manifest.domainCandidates.map(({ track }) => track).join(",") === "USER_UUID_AUTHORITY,DECISION_SERVER_AUTHORITY", "founder_activation_domain_order_invalid");
  for (const candidate of manifest.domainCandidates) {
    const populated = [candidate.headSha, candidate.treeSha, candidate.patchId].filter(Boolean).length;
    requireValue(populated === 0 || populated === 3, `founder_activation_partial_candidate:${candidate.track}`);
    if (populated === 0) requireValue(candidate.status === "AWAITING_APPROVED_HEAD", `founder_activation_pending_candidate_status_invalid:${candidate.track}`);
    else requireValue(SHA.test(candidate.headSha) && SHA.test(candidate.treeSha) && SHA.test(candidate.patchId) && SHA.test(candidate.finalPrHeadSha) && SHA.test(candidate.canonicalMergeSha) && SHA.test(candidate.canonicalMergeTreeSha) && candidate.canonicalMergeParents?.length === 2 && candidate.canonicalMergeParents.every((value) => SHA.test(value)) && candidate.status === "APPROVED_HEAD_BOUND", `founder_activation_candidate_invalid:${candidate.track}`);
  }
  const authority = manifest.authority;
  requireValue(authority.source === "AUTHENTICATED_SERVER_SESSION_SUBJECT" && authority.clientClaimsAccepted === false && authority.emailAuthorizationAccepted === false && authority.userMetadataAuthorizationAccepted === false, "founder_activation_client_authority_open");
  requireValue(authority.serverUuidAllowlist === true && authority.configuration === "PRIVATE_SECRET_PROVIDER" && authority.expectedMemberCount === 2 && authority.failClosedOnMissingConfiguration === true && authority.failClosedOnMalformedConfiguration === true && authority.failClosedOnWrongEnvironment === true && authority.identifiersPersistedInRepository === 0, "founder_activation_allowlist_boundary_invalid");
  requireValue(Object.values(manifest.runtimeControls).join(",") === "OFF,ENGAGED,OFF,OFF,OFF,OFF", "founder_activation_runtime_controls_open");
  requireValue(manifest.testAuthority.provider === "IN_MEMORY_TEST_ONLY" && manifest.testAuthority.productionCapable === false && manifest.testAuthority.realProductionIdentityUsed === false && manifest.testAuthority.networkAccess === false && manifest.testAuthority.screenshotsRetained === false, "founder_activation_test_authority_invalid");
  requireValue(matrix.executionAuthorized === false && matrix.mergeOrder.map(({ track }) => track).join(",") === manifest.mergeOrder.join(","), "founder_activation_matrix_invalid");
  requireValue(matrix.inherited.WORLD_ADMIN.authoringIndependent === true && matrix.inherited.WORLD_ADMIN.semanticChangesAllowed === false && matrix.inherited.FOUNDER_LIVE_MOBILE_ADMIN.semanticChangesAllowed === false, "founder_activation_inherited_ownership_invalid");
  requireValue(plan.canonicalBaseSha === BASE && plan.sourceAware === true && plan.productionActivation.separateManualAuthorityRequired === true && plan.productionActivation.authorized === false && plan.productionActivation.executionAuthorized === false, "founder_activation_plan_authority_invalid");
  requireValue(plan.changes.newMigrations === 0 && plan.changes.deployFunctions.length === 0 && plan.changes.authConfigDeploy === false && plan.changes.secretMutation === false && plan.changes.runtimeActivation === false && plan.changes.mobileRelease === false && plan.changes.ota === false && plan.productionActionsPerformed === 0 && plan.executionAuthorized === false, "founder_activation_plan_scope_open");
  requireValue(Object.values(plan.controls).join(",") === "OFF,ENGAGED,OFF,OFF,OFF,OFF", "founder_activation_plan_controls_open");
  const bound = manifest.domainCandidates.filter(({ status: value }) => value === "APPROVED_HEAD_BOUND");
  const sealed = manifest.release.sealed === true;
  if (sealed) {
    requireValue(bound.length === 2 && HASH.test(manifest.release.sharedArtifactHash) && HASH.test(manifest.release.sourceSetHash) && HASH.test(manifest.release.evidenceHash), "founder_activation_seal_invalid");
    requireValue(SHA.test(plan.candidateSourceSha) && HASH.test(plan.planHash), "founder_activation_sealed_plan_invalid");
    requireValue(status.overall === "GREEN" && status.ctoReviewReady === true && status.mergeable === true && status.domainCandidatesBound === 2 && status.piiSecretScan === "PASS" && status.mobileE2E === "PASS" && status.fourTrackRehearsal === "PASS" && status.sharedArtifact === "PASS" && status.blockers.length === 0, "founder_activation_green_status_invalid");
    requireValue(plan.planHash === hash(without(plan, "planHash")), "founder_activation_plan_hash_mismatch");
  } else {
    requireValue(status.overall === "YELLOW" && status.ctoReviewReady === false && status.mergeable === false, "founder_activation_pending_status_invalid");
  }
  requireValue(status.draftRequired === true && status.productionStatus === "NO_GO" && status.executionAuthorized === false, "founder_activation_status_authority_open");
  return { boundCandidates: bound.length, sealed };
}

export function verifyFounderActivationCanonicalDescendant({ completionSha, completionTree, completionIsAncestorOfBase, baseIsAncestorOfHead, sealedBlobBindings }) {
  requireValue(completionSha === CANONICAL_COMPLETION_SHA && completionTree === CANONICAL_COMPLETION_TREE, "founder_activation_completion_identity_mismatch");
  requireValue(completionIsAncestorOfBase && baseIsAncestorOfHead, "founder_activation_descendant_lineage_invalid");
  requireValue(Array.isArray(sealedBlobBindings) && sealedBlobBindings.length === SEALED_PATHS.size, "founder_activation_sealed_binding_set_invalid");
  const seen = new Set();
  for (const binding of sealedBlobBindings) {
    requireValue(binding && SEALED_PATHS.has(binding.path) && !seen.has(binding.path), `founder_activation_sealed_binding_invalid:${binding?.path ?? "missing"}`);
    seen.add(binding.path);
    requireValue([binding.completionBlobSha, binding.baseBlobSha, binding.headBlobSha].every((value) => SHA.test(value)), `founder_activation_sealed_blob_invalid:${binding.path}`);
    requireValue(binding.completionBlobSha === binding.baseBlobSha && binding.baseBlobSha === binding.headBlobSha, `founder_activation_sealed_blob_drift:${binding.path}`);
  }
  return true;
}

export function verifyFounderActivationDescendantMigrationChanges({ descendant, entries }) {
  const migrations = entries.filter(({ path }) => path.startsWith("supabase/migrations/"));
  if (!descendant) requireValue(migrations.length === 0, "founder_activation_database_change_forbidden");
  for (const entry of migrations) {
    requireValue(entry.status === "A" && /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.path), `founder_activation_descendant_migration_not_additive:${entry.status}:${entry.path}`);
  }
  return migrations.map(({ path }) => path);
}

export function verifyFounderActivationInactiveEdgeChanges({ entries, baseConfig, headConfig }) {
  const runtimeEntries = entries.filter(({ path }) => path.startsWith("supabase/functions/") || path === "supabase/config.toml" || path === "supabase/production/auth-config.json");
  if (runtimeEntries.length === 0) return [];
  requireValue(runtimeEntries.length === INACTIVE_EDGE_CHANGES.size, "founder_activation_runtime_change_set_invalid");
  const seen = new Set();
  for (const entry of runtimeEntries) {
    requireValue(INACTIVE_EDGE_CHANGES.get(entry.path) === entry.status && !seen.has(entry.path), `founder_activation_runtime_change_invalid:${entry.status}:${entry.path}`);
    seen.add(entry.path);
  }
  requireValue(typeof baseConfig === "string" && typeof headConfig === "string", "founder_activation_edge_config_missing");
  const occurrences = headConfig.split(INACTIVE_EDGE_CONFIG_BLOCK).length - 1;
  requireValue(occurrences === 1 && headConfig.replace(INACTIVE_EDGE_CONFIG_BLOCK, "") === baseConfig, "founder_activation_edge_config_scope_invalid");
  return runtimeEntries.map(({ path }) => path);
}

export function runFounderActivationPreflight({ root = ROOT, head = "HEAD", base = BASE } = {}) {
  requireValue(git(root, ["rev-parse", `${BASE}^{commit}`]) === BASE, "founder_activation_base_missing");
  requireValue(git(root, ["rev-parse", `${BASE}^{tree}`]) === BASE_TREE, "founder_activation_base_tree_mismatch");
  requireValue(git(root, ["merge-base", "--is-ancestor", BASE, head]) === "", "founder_activation_candidate_not_descendant");
  const canonicalDescendant = base !== BASE;
  if (canonicalDescendant) {
    requireValue(git(root, ["rev-parse", `${base}^{commit}`]) === base, "founder_activation_requested_base_invalid");
    const blob = (ref, path) => git(root, ["rev-parse", `${ref}:${path}`]);
    verifyFounderActivationCanonicalDescendant({
      completionSha: git(root, ["rev-parse", `${CANONICAL_COMPLETION_SHA}^{commit}`]),
      completionTree: git(root, ["rev-parse", `${CANONICAL_COMPLETION_SHA}^{tree}`]),
      completionIsAncestorOfBase: git(root, ["merge-base", "--is-ancestor", CANONICAL_COMPLETION_SHA, base]) === "",
      baseIsAncestorOfHead: git(root, ["merge-base", "--is-ancestor", base, head]) === "",
      sealedBlobBindings: [...SEALED_PATHS].sort().map((path) => ({ path, completionBlobSha: blob(CANONICAL_COMPLETION_SHA, path), baseBlobSha: blob(base, path), headBlobSha: blob(head, path) }))
    });
  }
  const documents = {
    manifest: load(root, "delivery/integration/founder-activation-manifest.json"),
    matrix: load(root, "delivery/integration/founder-activation-dependency-ownership-matrix.json"),
    plan: load(root, "delivery/integration/founder-activation-production-plan.json"),
    status: load(root, "delivery/integration/founder-activation-status.json")
  };
  const state = validateFounderActivationDocuments(documents);
  for (const candidate of documents.manifest.domainCandidates.filter(({ headSha }) => headSha)) {
    requireValue(git(root, ["rev-parse", `${candidate.headSha}^{commit}`]) === candidate.headSha, `founder_activation_candidate_missing:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.headSha}^{tree}`]) === candidate.treeSha, `founder_activation_candidate_tree_mismatch:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.finalPrHeadSha}^{commit}`]) === candidate.finalPrHeadSha, `founder_activation_final_pr_head_missing:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.canonicalMergeSha}^{tree}`]) === candidate.canonicalMergeTreeSha, `founder_activation_canonical_merge_tree_mismatch:${candidate.track}`);
    requireValue(git(root, ["show", "-s", "--format=%P", candidate.canonicalMergeSha]) === candidate.canonicalMergeParents.join(" "), `founder_activation_canonical_merge_parents_mismatch:${candidate.track}`);
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.canonicalMergeSha, head]) === "", `founder_activation_canonical_merge_not_integrated:${candidate.track}`);
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.headSha, head]) === "", `founder_activation_candidate_not_integrated:${candidate.track}`);
  }
  const changeEntries = git(root, ["diff", "--name-status", "--no-renames", `${base}..${head}`]).split("\n").filter(Boolean).map((line) => {
    const [status, path] = line.split("\t"); return { status, path };
  });
  const changed = changeEntries.map(({ path }) => path);
  const newMigrations = verifyFounderActivationDescendantMigrationChanges({ descendant: canonicalDescendant, entries: changeEntries });
  const runtimeEntries = changeEntries.filter(({ path }) => path.startsWith("supabase/functions/") || path === "supabase/config.toml" || path === "supabase/production/auth-config.json");
  if (canonicalDescendant && runtimeEntries.length > 0) {
    const productionState = load(root, "delivery/production-state.json");
    const productionPlan = buildProductionPlan({ repo: root, baseSha: productionState.supabase.shippedSourceSha, headSha: git(root, ["rev-parse", `${head}^{commit}`]) });
    verifySourceAwareInactiveFounderLiveScope({ root, productionPlan, headSha: git(root, ["rev-parse", `${head}^{commit}`]), treeSha: git(root, ["rev-parse", `${head}^{tree}`]) });
  } else {
    verifyFounderActivationInactiveEdgeChanges({
      entries: changeEntries,
      baseConfig: git(root, ["show", `${base}:supabase/config.toml`]),
      headConfig: git(root, ["show", `${head}:supabase/config.toml`]),
    });
  }
  let seal = null;
  if (state.sealed) {
    requireValue(Number(process.versions.node.split(".")[0]) === 20, "founder_activation_seal_node20_required");
    const artifact = load(root, "delivery/integration/founder-activation-shared-artifact.json");
    const evidence = load(root, "delivery/integration/founder-activation-rehearsal-evidence.json");
    const postDeploy = load(root, "delivery/integration/founder-activation-post-deploy-evidence.json");
    const rebuilt = buildFounderActivationArtifact({ root, source: evidence.functionalHeadSha });
    for (const key of ["contractVersion", "nodeMajor", "sourceSha", "sourceTreeSha", "sourceSetHash", "fileCount", "artifactHash", "executionAuthorized"]) requireValue(artifact[key] === rebuilt[key], `founder_activation_artifact_mismatch:${key}`);
    requireValue(JSON.stringify(artifact.files) === JSON.stringify(rebuilt.files) && JSON.stringify(artifact.trackVerifications) === JSON.stringify(rebuilt.trackVerifications), "founder_activation_artifact_source_set_mismatch");
    requireValue(documents.manifest.release.sharedArtifactHash === artifact.artifactHash && documents.manifest.release.sourceSetHash === artifact.sourceSetHash, "founder_activation_manifest_artifact_mismatch");
    requireValue(evidence.evidenceHash === hash(without(evidence, "evidenceHash")) && documents.manifest.release.evidenceHash === evidence.evidenceHash, "founder_activation_evidence_hash_mismatch");
    requireValue(evidence.functionalHeadSha === artifact.sourceSha && evidence.functionalTreeSha === artifact.sourceTreeSha && evidence.nodeMajor === 20 && evidence.status === "PASS", "founder_activation_evidence_identity_mismatch");
    requireValue(evidence.domainCandidates.USER_UUID_AUTHORITY === documents.manifest.domainCandidates[0].headSha && evidence.domainCandidates.DECISION_SERVER_AUTHORITY === documents.manifest.domainCandidates[1].headSha, "founder_activation_evidence_domain_mismatch");
    requireValue(evidence.allowlistMembers === 2 && evidence.concreteIdentityValues === 0 && evidence.durableWrites === 0 && evidence.externalNetworkCalls === 0 && evidence.readsAfterEmergencyOff === 0 && evidence.projectionsAfterEmergencyOff === 0 && evidence.productOutputsAfterEmergencyOff === 0 && evidence.productionActions === 0 && evidence.executionAuthorized === false, "founder_activation_evidence_boundary_open");
    requireValue(postDeploy.status === "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" && postDeploy.productionQueries === 0 && postDeploy.migrationsExecuted === 0 && postDeploy.deploymentsExecuted === 0 && postDeploy.otaActions === 0 && postDeploy.executionAuthorized === false, "founder_activation_post_deploy_claim_invalid");
    requireValue(postDeploy.canonicalMainBeforeIntegration === BASE && postDeploy.candidateFunctionalHeadSha === evidence.functionalHeadSha && postDeploy.candidateTreeSha === evidence.functionalTreeSha && postDeploy.sharedArtifactHash === artifact.artifactHash && postDeploy.sourceSetHash === artifact.sourceSetHash && postDeploy.productionPlanHash === documents.plan.planHash && postDeploy.productionStatus === "NO_GO", "founder_activation_post_deploy_identity_mismatch");
    seal = { artifactHash: artifact.artifactHash, sourceSetHash: artifact.sourceSetHash, evidenceHash: evidence.evidenceHash, functionalHeadSha: evidence.functionalHeadSha };
  }
  return {
    contractVersion: "backyrd.founder-activation-preflight@1.0",
    status: state.sealed ? "GREEN" : "YELLOW",
    baseSha: base,
    headSha: git(root, ["rev-parse", `${head}^{commit}`]),
    treeSha: git(root, ["rev-parse", `${head}^{tree}`]),
    boundCandidates: state.boundCandidates,
    manifestHash: hash(documents.manifest),
    executionAuthorized: false,
    productionStatus: "NO_GO",
    newMigrations,
    seal,
    changedFiles: changed
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runFounderActivationPreflight({ root: resolve(process.argv[2] ?? ROOT), head: process.argv[3] ?? "HEAD", base: process.env.FOUNDER_LIVE_BASE_SHA ?? BASE }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_activation_preflight_blocked:${error.message}\n`); process.exitCode = 1; }
}
