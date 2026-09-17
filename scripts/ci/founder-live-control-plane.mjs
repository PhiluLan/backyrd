#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import { buildFounderLiveArtifact } from "./founder-live-artifact.mjs";
import { verifyFounderLiveBinding } from "./founder-live-binding.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const BASE = "9c38946462c5698ee1ff6375d996463254dd829e";
const BASE_TREE = "9e74daabc42f86327291b781c43b41502f2579a8";
const SHA = /^[0-9a-f]{40}$/; const HASH = /^[0-9a-f]{64}$/;
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const load = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
export const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

export function validateFounderLiveDocuments({ roadmap, matrix, manifest, status }) {
  requireValue(roadmap.canonicalBaseSha === BASE && roadmap.completedThroughDay === 21, "founder_live_roadmap_base_or_completion_invalid");
  requireValue(JSON.stringify(roadmap.currentPhase.dayRange) === "[21,26]" && roadmap.currentPhase.status.startsWith("YELLOW_"), "founder_live_roadmap_phase_invalid");
  requireValue(roadmap.milestones.find(({ day }) => day === 21)?.status === "COMPLETED", "founder_live_day21_not_completed");
  requireValue(roadmap.milestones.find(({ day }) => day === 42)?.name === "Begrenzter Nutzerpilot" && JSON.stringify(roadmap.milestones.at(-1).dayRange) === "[84,98]", "founder_live_later_roadmap_drift");
  requireValue(matrix.decisionProductBoundary?.owner === "DECISION" && matrix.decisionProductBoundary?.compatibility === "ADDITIVE", "founder_live_decision_boundary_invalid");
  requireValue(matrix.clientSurfaces?.map(({ id }) => id).join(",") === "MOBILE,ADMIN", "founder_live_client_surfaces_invalid");
  requireValue(manifest.contractVersion === "backyrd.founder-live-integration-manifest@1.0" && manifest.canonicalBaseSha === BASE && manifest.canonicalBaseTreeSha === BASE_TREE, "founder_live_manifest_identity_invalid");
  requireValue(manifest.executionAuthorized === false && manifest.productionActivationAuthorized === false, "founder_live_authority_open");
  requireValue(manifest.identityModes.join(",") === "PR_CANDIDATE,POST_MERGE_MAIN", "founder_live_identity_modes_invalid");
  requireValue(manifest.domainCandidates.map(({ track }) => track).join(",") === "WORLD,USER,DECISION", "founder_live_domain_order_invalid");
  const bound = manifest.domainCandidates.filter(({ headSha }) => headSha);
  for (const candidate of manifest.domainCandidates) {
    const values = [candidate.pr, candidate.baseSha, candidate.headSha, candidate.treeSha, candidate.contractHash, candidate.artifactHash];
    const populated = values.filter((value) => value !== null).length;
    requireValue(populated === 0 || populated === values.length, `founder_live_partial_candidate:${candidate.track}`);
    if (populated) requireValue(SHA.test(candidate.baseSha) && SHA.test(candidate.headSha) && SHA.test(candidate.treeSha) && HASH.test(candidate.contractHash) && HASH.test(candidate.artifactHash), `founder_live_candidate_identity_invalid:${candidate.track}`);
    else requireValue(candidate.status === "AWAITING_DOMAIN_PR", `founder_live_candidate_status_invalid:${candidate.track}`);
  }
  requireValue((bound.length === 3) === manifest.releaseBinding.allCandidatesBound, "founder_live_binding_count_mismatch");
  requireValue(bound.length === 3 || manifest.status === "YELLOW_CANDIDATES_PENDING", "founder_live_missing_candidates_not_yellow");
  requireValue(HASH.test(manifest.releaseBinding.releaseHash) && HASH.test(manifest.releaseBinding.bindingHash), "founder_live_release_hash_invalid");
  const expectedReleaseHash = sha256({ canonicalBaseSha: manifest.canonicalBaseSha, apiContracts: manifest.apiContracts, domainCandidates: manifest.domainCandidates });
  const expectedBindingHash = sha256({ releaseHash: expectedReleaseHash, status: manifest.releaseBinding.status, allCandidatesBound: manifest.releaseBinding.allCandidatesBound, vNextFunction: manifest.releaseBinding.vNextFunction, fallbackFunction: manifest.releaseBinding.fallbackFunction, executionAuthorized: false });
  requireValue(manifest.releaseBinding.releaseHash === expectedReleaseHash && manifest.releaseBinding.bindingHash === expectedBindingHash, "founder_live_release_binding_hash_mismatch");
  requireValue(manifest.releaseBinding.executionAuthorized === false && manifest.releaseBinding.vNextFunction === null, "founder_live_pending_vnext_must_be_closed");
  requireValue(manifest.clients.mobile === "EXISTING_NON_PUBLIC_APP" && manifest.clients.admin === "EXISTING_WORLD_AUTHORING_DASHBOARD" && manifest.clients.newDemoSurface === false && manifest.clients.clientToggleAllowed === false, "founder_live_client_scope_invalid");
  requireValue(status.overall === "YELLOW" && status.draftRequired === true && status.productionStatus === "NO_GO" && status.executionAuthorized === false, "founder_live_status_invalid");
  requireValue(status.blockers.includes("WORLD_CANDIDATE_MISSING") && status.blockers.includes("USER_CANDIDATE_MISSING") && status.blockers.includes("DECISION_CANDIDATE_MISSING"), "founder_live_domain_blockers_missing");
  return { boundCandidates: bound.length, status: status.overall };
}

export function verifyFounderIdentityMode(value) {
  requireValue(["PR_CANDIDATE", "POST_MERGE_MAIN"].includes(value.mode), "founder_live_identity_mode_invalid");
  for (const [key, sha] of Object.entries({ baseSha: value.baseSha, headSha: value.headSha, checkoutSha: value.checkoutSha, mainSha: value.mainSha, headTree: value.headTree, checkoutTree: value.checkoutTree, candidateHead: value.candidateHead, candidateTree: value.candidateTree })) requireValue(SHA.test(sha), `founder_live_identity_sha_invalid:${key}`);
  requireValue(value.baseSha === BASE, "founder_live_base_mismatch");
  if (value.mode === "PR_CANDIDATE") {
    requireValue(value.mainSha === BASE && value.headSha === value.candidateHead && value.headTree === value.candidateTree, "founder_live_pr_identity_mismatch");
    const exactHead = value.checkoutSha === value.headSha && value.checkoutTree === value.headTree;
    const synthetic = value.parents?.length === 2 && value.parents[0] === BASE && value.parents[1] === value.headSha && value.checkoutTree === value.headTree;
    requireValue(exactHead || synthetic, "founder_live_pr_checkout_invalid");
  } else {
    requireValue(value.headSha === value.checkoutSha && value.headSha === value.mainSha, "founder_live_post_merge_main_mismatch");
    requireValue(value.headTree === value.checkoutTree && value.headTree === value.candidateTree, "founder_live_post_merge_tree_mismatch");
    requireValue(value.parents?.length === 2 && value.parents[0] === BASE && value.parents[1] === value.candidateHead, "founder_live_post_merge_parents_mismatch");
  }
  return true;
}

export function runFounderLivePreflight({ root = ROOT, base = BASE, head = "HEAD" } = {}) {
  requireValue(git(root, ["rev-parse", `${base}^{commit}`]) === BASE, "founder_live_requested_base_invalid");
  requireValue(git(root, ["rev-parse", `${BASE}^{tree}`]) === BASE_TREE, "founder_live_base_tree_invalid");
  requireValue(git(root, ["merge-base", "--is-ancestor", BASE, head]) === "", "founder_live_candidate_not_descendant");
  const documents = { roadmap: load(root, "delivery/integration/accelerated-production-roadmap.json"), matrix: load(root, "delivery/integration/dependency-ownership-matrix.json"), manifest: load(root, "delivery/integration/founder-live-manifest.json"), status: load(root, "delivery/integration/founder-live-status.json") };
  const state = validateFounderLiveDocuments(documents); const binding = verifyFounderLiveBinding(root);
  const changed = git(root, ["diff", "--name-only", `${BASE}..${head}`]).split("\n").filter(Boolean);
  requireValue(!changed.some((path) => path.startsWith("supabase/migrations/") || path.startsWith("supabase/functions/") || path === "supabase/production/auth-config.json"), "founder_live_unexpected_database_or_runtime_change");
  const plan = buildProductionPlan({ repo: root, baseSha: load(root, "delivery/production-state.json").supabase.shippedSourceSha, headSha: git(root, ["rev-parse", `${head}^{commit}`]) });
  requireValue(plan.deployFunctions.length === 0 && plan.authConfig?.deploy === false, "founder_live_production_plan_runtime_open");
  let seal = null;
  if (documents.status.codeAndTests === "GREEN") {
    const artifact = load(root, "delivery/integration/founder-live-shared-artifact.json");
    const evidence = load(root, "delivery/integration/founder-live-rehearsal-evidence.json");
    const sealedPlan = load(root, "delivery/integration/founder-live-production-plan.json");
    const postDeploy = load(root, "delivery/integration/founder-live-post-deploy-evidence.json");
    requireValue(Number(process.versions.node.split(".")[0]) === 20, "founder_live_seal_node20_required");
    const rebuilt = buildFounderLiveArtifact({ root, source: evidence.functionalHeadSha });
    for (const key of ["contractVersion", "nodeMajor", "sourceSha", "sourceTreeSha", "sourceSetHash", "fileCount", "artifactHash", "executionAuthorized"]) requireValue(artifact[key] === rebuilt[key], `founder_live_artifact_mismatch:${key}`);
    requireValue(JSON.stringify(artifact.tracks) === JSON.stringify(rebuilt.tracks) && JSON.stringify(artifact.trackVerifications) === JSON.stringify(rebuilt.trackVerifications), "founder_live_artifact_tracks_mismatch");
    requireValue(evidence.baseSha === BASE && evidence.functionalTreeSha === rebuilt.sourceTreeSha && evidence.combinedTreeSha === rebuilt.sourceTreeSha && evidence.conflictCount === 0, "founder_live_rehearsal_identity_invalid");
    const reconstructedTree = git(root, ["merge-tree", "--write-tree", BASE, evidence.functionalHeadSha]).split("\n")[0];
    requireValue(reconstructedTree === evidence.combinedTreeSha, "founder_live_rehearsal_tree_mismatch");
    requireValue(evidence.e2eEvidenceHash === "476ea9829b0cc725883c92604f2326f2c3b6292c5392fc6be3c48397907edc8e" && evidence.byteIdenticalRuns === 2, "founder_live_replay_evidence_invalid");
    requireValue(sealedPlan.planHash === plan.planHash && JSON.stringify(sealedPlan.pendingMigrations) === JSON.stringify(plan.pendingMigrations.map(({ path }) => path)), "founder_live_production_plan_drift");
    requireValue(sealedPlan.newMigrations === 0 && sealedPlan.deployFunctions.length === 0 && sealedPlan.authDeploy === false && sealedPlan.runtimeActivation === false && sealedPlan.executionAuthorized === false, "founder_live_production_scope_open");
    requireValue(postDeploy.status === "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" && postDeploy.productionQueries === 0 && postDeploy.migrationsExecuted === 0 && postDeploy.deploymentsExecuted === 0 && postDeploy.otaActions === 0 && postDeploy.executionAuthorized === false, "founder_live_post_deploy_claim_invalid");
    requireValue(documents.status.ctoReviewReady === true && documents.status.productionStatus === "NO_GO", "founder_live_cto_status_invalid");
    seal = { artifactHash: artifact.artifactHash, sourceSetHash: artifact.sourceSetHash, functionalHeadSha: evidence.functionalHeadSha, combinedTreeSha: evidence.combinedTreeSha, e2eEvidenceHash: evidence.e2eEvidenceHash };
  }
  return { contractVersion: "backyrd.founder-live-preflight@1.0", gateStatus: "GREEN", releaseStatus: state.status, boundCandidates: state.boundCandidates, executionAuthorized: false, baseSha: BASE, headSha: git(root, ["rev-parse", `${head}^{commit}`]), treeSha: git(root, ["rev-parse", `${head}^{tree}`]), binding, seal, productionPlan: { planHash: plan.planHash, pendingMigrations: plan.pendingMigrations.map(({ path }) => path), newMigrations: 0, deployFunctions: [], authDeploy: false, runtimeActivation: false, executionAuthorized: false }, changedFiles: changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runFounderLivePreflight({ root: resolve(process.argv[2] ?? ROOT), head: process.argv[3] ?? "HEAD" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_live_preflight_blocked:${error.message}\n`); process.exitCode = 1; }
}
