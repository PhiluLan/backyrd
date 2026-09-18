#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const BASE = "a76910f6da5b407dae6d4022528e644613caf5d8";
const BASE_TREE = "730a405788ffc70e2c8ee32caadcf3b5a39bbb30";
const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const load = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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
    else requireValue(SHA.test(candidate.headSha) && SHA.test(candidate.treeSha) && SHA.test(candidate.patchId) && candidate.status === "APPROVED_HEAD_BOUND", `founder_activation_candidate_invalid:${candidate.track}`);
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
  } else {
    requireValue(status.overall === "YELLOW" && status.ctoReviewReady === false && status.mergeable === false, "founder_activation_pending_status_invalid");
  }
  requireValue(status.draftRequired === true && status.productionStatus === "NO_GO" && status.executionAuthorized === false, "founder_activation_status_authority_open");
  return { boundCandidates: bound.length, sealed };
}

export function runFounderActivationPreflight({ root = ROOT, head = "HEAD" } = {}) {
  requireValue(git(root, ["rev-parse", `${BASE}^{commit}`]) === BASE, "founder_activation_base_missing");
  requireValue(git(root, ["rev-parse", `${BASE}^{tree}`]) === BASE_TREE, "founder_activation_base_tree_mismatch");
  requireValue(git(root, ["merge-base", "--is-ancestor", BASE, head]) === "", "founder_activation_candidate_not_descendant");
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
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.headSha, head]) === "", `founder_activation_candidate_not_integrated:${candidate.track}`);
  }
  const changed = git(root, ["diff", "--name-only", `${BASE}..${head}`]).split("\n").filter(Boolean);
  requireValue(!changed.some((path) => path.startsWith("supabase/migrations/") || path === "supabase/production/auth-config.json"), "founder_activation_database_or_auth_change_forbidden");
  return {
    contractVersion: "backyrd.founder-activation-preflight@1.0",
    status: state.sealed ? "GREEN" : "YELLOW",
    baseSha: BASE,
    headSha: git(root, ["rev-parse", `${head}^{commit}`]),
    treeSha: git(root, ["rev-parse", `${head}^{tree}`]),
    boundCandidates: state.boundCandidates,
    manifestHash: hash(documents.manifest),
    executionAuthorized: false,
    productionStatus: "NO_GO",
    changedFiles: changed
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runFounderActivationPreflight({ root: resolve(process.argv[2] ?? ROOT), head: process.argv[3] ?? "HEAD" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_activation_preflight_blocked:${error.message}\n`); process.exitCode = 1; }
}
