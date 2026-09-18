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
const BASE = "f30eb153e35a979fb6b01e5bfd2bf7e42cb08dc6";
const BASE_TREE = "97e2a09a776a989effbd2aa8a3a5591fa98de4e4";
const CANONICAL_COMPLETION_SHA = "a76910f6da5b407dae6d4022528e644613caf5d8";
const CANONICAL_COMPLETION_TREE = "730a405788ffc70e2c8ee32caadcf3b5a39bbb30";
const CANONICAL_COMPLETION_PARENTS = [BASE, "1db9b95e56a369ff5791a01884012718ee907c76"];
const SHA = /^[0-9a-f]{40}$/; const HASH = /^[0-9a-f]{64}$/;
const SEAL_PATHS = new Set(["delivery/integration/founder-live-status.json", "delivery/integration/founder-live-post-deploy-evidence.json", "delivery/integration/founder-live-production-plan.json", "delivery/integration/founder-live-rehearsal-evidence.json", "delivery/integration/founder-live-shared-artifact.json"]);
const EDGE_RUNTIME_PATHS = new Set([
  "supabase/config.toml",
  "supabase/functions/decision-founder-live/index.ts",
  "supabase/functions/decision-founder-live/runtime-boundary.mjs",
  "supabase/functions/decision-founder-live/runtime-boundary.test.mjs",
]);
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const load = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
export const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

export function validateFounderLiveDocuments({ roadmap, matrix, manifest, status }) {
  requireValue(roadmap.canonicalBaseSha === BASE && roadmap.completedThroughDay === 21, "founder_live_roadmap_base_or_completion_invalid");
  requireValue(JSON.stringify(roadmap.currentPhase.dayRange) === "[21,26]" && ["YELLOW_AWAITING_WORLD_USER_DECISION_CANDIDATES", "GREEN_THREE_OF_THREE_CANDIDATES_BOUND_DRAFT_ONLY"].includes(roadmap.currentPhase.status), "founder_live_roadmap_phase_invalid");
  requireValue(roadmap.milestones.find(({ day }) => day === 21)?.status === "COMPLETED", "founder_live_day21_not_completed");
  requireValue(roadmap.milestones.find(({ day }) => day === 42)?.name === "Begrenzter Nutzerpilot" && JSON.stringify(roadmap.milestones.at(-1).dayRange) === "[84,98]", "founder_live_later_roadmap_drift");
  requireValue(matrix.decisionProductBoundary?.owner === "DECISION" && matrix.decisionProductBoundary?.compatibility === "ADDITIVE", "founder_live_decision_boundary_invalid");
  requireValue(matrix.clientSurfaces?.map(({ id }) => id).join(",") === "MOBILE,ADMIN", "founder_live_client_surfaces_invalid");
  requireValue(manifest.contractVersion === "backyrd.founder-live-integration-manifest@1.0" && manifest.canonicalBaseSha === BASE && manifest.canonicalBaseTreeSha === BASE_TREE, "founder_live_manifest_identity_invalid");
  requireValue(manifest.executionAuthorized === false && manifest.productionActivationAuthorized === false, "founder_live_authority_open");
  requireValue(manifest.identityModes.join(",") === "PR_CANDIDATE,POST_MERGE_MAIN", "founder_live_identity_modes_invalid");
  requireValue(manifest.domainCandidates.map(({ track }) => track).join(",") === "WORLD,USER,DECISION", "founder_live_domain_order_invalid");
  const bound = manifest.domainCandidates.filter(({ canonicalMergeSha }) => canonicalMergeSha);
  for (const candidate of manifest.domainCandidates) {
    const values = [candidate.pr, candidate.approvedBaseSha, candidate.approvedHeadSha, candidate.approvedTreeSha, candidate.approvedPatchId, candidate.canonicalHeadSha, candidate.canonicalMergeSha, candidate.canonicalTreeSha, candidate.mergeParents, candidate.contractHash, candidate.artifactHash];
    const populated = values.filter((value) => value !== null).length;
    requireValue(populated === 0 || populated === values.length, `founder_live_partial_candidate:${candidate.track}`);
    if (populated) {
      requireValue(Number.isInteger(candidate.pr) && candidate.pr > 0 && SHA.test(candidate.approvedBaseSha) && SHA.test(candidate.approvedHeadSha) && SHA.test(candidate.approvedTreeSha) && SHA.test(candidate.approvedPatchId) && SHA.test(candidate.canonicalHeadSha) && SHA.test(candidate.canonicalMergeSha) && SHA.test(candidate.canonicalTreeSha) && candidate.mergeParents?.length === 2 && candidate.mergeParents.every((value) => SHA.test(value)) && HASH.test(candidate.contractHash) && HASH.test(candidate.artifactHash), `founder_live_candidate_identity_invalid:${candidate.track}`);
      requireValue(candidate.status === "CANONICAL_MERGE_VERIFIED", `founder_live_candidate_status_invalid:${candidate.track}`);
    }
    else requireValue(candidate.status === "AWAITING_DOMAIN_PR", `founder_live_candidate_status_invalid:${candidate.track}`);
  }
  requireValue((bound.length === 3) === manifest.releaseBinding.allCandidatesBound, "founder_live_binding_count_mismatch");
  requireValue(bound.length === 3 || manifest.status === "YELLOW_CANDIDATES_PENDING", "founder_live_missing_candidates_not_yellow");
  requireValue(bound.length !== 3 || (manifest.status === "GREEN_CANDIDATES_BOUND" && manifest.releaseBinding.status === "GREEN_CANDIDATES_BOUND"), "founder_live_bound_candidates_not_green");
  requireValue(HASH.test(manifest.releaseBinding.releaseHash) && HASH.test(manifest.releaseBinding.bindingHash), "founder_live_release_hash_invalid");
  const expectedReleaseHash = sha256({ canonicalBaseSha: manifest.canonicalBaseSha, apiContracts: manifest.apiContracts, domainCandidates: manifest.domainCandidates });
  const expectedBindingHash = sha256({ releaseHash: expectedReleaseHash, status: manifest.releaseBinding.status, allCandidatesBound: manifest.releaseBinding.allCandidatesBound, vNextFunction: manifest.releaseBinding.vNextFunction, fallbackFunction: manifest.releaseBinding.fallbackFunction, executionAuthorized: false });
  requireValue(manifest.releaseBinding.releaseHash === expectedReleaseHash && manifest.releaseBinding.bindingHash === expectedBindingHash, "founder_live_release_binding_hash_mismatch");
  requireValue(manifest.releaseBinding.executionAuthorized === false && manifest.releaseBinding.vNextFunction === null, "founder_live_pending_vnext_must_be_closed");
  requireValue(manifest.clients.mobile === "EXISTING_NON_PUBLIC_APP" && manifest.clients.admin === "EXISTING_WORLD_AUTHORING_DASHBOARD" && manifest.clients.newDemoSurface === false && manifest.clients.clientToggleAllowed === false, "founder_live_client_scope_invalid");
  requireValue(status.overall === (bound.length === 3 ? "GREEN" : "YELLOW") && status.draftRequired === true && ["NO_GO", "IMPLEMENTATION_READY_DEPLOYMENT_NOT_AUTHORIZED"].includes(status.productionStatus) && status.executionAuthorized === false, "founder_live_status_invalid");
  if (bound.length === 3) requireValue(!status.blockers.some((value) => value.endsWith("_CANDIDATE_MISSING")), "founder_live_stale_domain_blocker");
  else requireValue(status.blockers.includes("WORLD_CANDIDATE_MISSING") && status.blockers.includes("USER_CANDIDATE_MISSING") && status.blockers.includes("DECISION_CANDIDATE_MISSING"), "founder_live_domain_blockers_missing");
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

export function verifyFounderSealScope({ commitCount, paths }) {
  requireValue(commitCount === 1, "founder_live_seal_commit_count_invalid");
  requireValue(paths.length === SEAL_PATHS.size && paths.every((path) => SEAL_PATHS.has(path)), "founder_live_seal_scope_invalid");
  return true;
}

export function verifyFounderDescendantMigrationChanges({ descendant, entries }) {
  const migrations = entries.filter(({ path }) => path.startsWith("supabase/migrations/"));
  if (!descendant) requireValue(migrations.length === 0, "founder_live_unexpected_database_change");
  for (const entry of migrations) {
    requireValue(entry.status === "A" && /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.path), `founder_live_descendant_migration_not_additive:${entry.status}:${entry.path}`);
  }
  return migrations.map(({ path }) => path);
}

export function verifyFounderCanonicalDescendantIdentity(input) {
  const {
    mode, eventName, completionSha, completionTree, completionParents,
    baseSha, baseTree, headSha, headTree, checkoutSha, checkoutTree,
    mainSha, mainTree, parents, candidateHead, candidateTree,
    completionIsAncestorOfBase, baseIsAncestorOfHead, sealedBlobBindings,
  } = input;
  requireValue(["CANONICAL_DESCENDANT_PR", "CANONICAL_DESCENDANT_MAIN"].includes(mode), "founder_live_descendant_mode_invalid");
  requireValue(eventName === (mode === "CANONICAL_DESCENDANT_PR" ? "pull_request" : "push"), "founder_live_descendant_event_mode_mismatch");
  requireValue(completionSha === CANONICAL_COMPLETION_SHA && completionTree === CANONICAL_COMPLETION_TREE, "founder_live_descendant_completion_identity_mismatch");
  requireValue(JSON.stringify(completionParents) === JSON.stringify(CANONICAL_COMPLETION_PARENTS), "founder_live_descendant_completion_parents_mismatch");
  for (const [key, value] of Object.entries({ baseSha, baseTree, headSha, headTree, checkoutSha, checkoutTree, mainSha, mainTree, candidateHead, candidateTree })) requireValue(SHA.test(value), `founder_live_descendant_sha_invalid:${key}`);
  requireValue(completionIsAncestorOfBase && baseIsAncestorOfHead, "founder_live_descendant_lineage_invalid");
  requireValue(Array.isArray(sealedBlobBindings) && sealedBlobBindings.length === SEAL_PATHS.size, "founder_live_descendant_sealed_binding_set_invalid");
  const seen = new Set();
  for (const binding of sealedBlobBindings) {
    requireValue(binding && SEAL_PATHS.has(binding.path) && !seen.has(binding.path), `founder_live_descendant_sealed_binding_invalid:${binding?.path ?? "missing"}`);
    seen.add(binding.path);
    const hashes = [binding.completionBlobSha, binding.baseBlobSha, binding.headBlobSha, binding.checkoutBlobSha, binding.mainBlobSha];
    requireValue(hashes.every((value) => SHA.test(value)), `founder_live_descendant_sealed_blob_invalid:${binding.path}`);
    requireValue(new Set(hashes).size === 1, `founder_live_descendant_sealed_blob_drift:${binding.path}`);
  }
  if (mode === "CANONICAL_DESCENDANT_PR") {
    requireValue(baseSha === mainSha && baseTree === mainTree, "founder_live_descendant_pr_base_main_mismatch");
    requireValue(checkoutSha !== headSha && parents.length === 2 && parents[0] === baseSha && parents[1] === headSha, "founder_live_descendant_pr_merge_identity_mismatch");
    requireValue(checkoutTree === headTree && candidateHead === headSha && candidateTree === headTree, "founder_live_descendant_pr_tree_mismatch");
  } else {
    requireValue(headSha === checkoutSha && checkoutSha === mainSha && headTree === checkoutTree && checkoutTree === mainTree, "founder_live_descendant_main_identity_mismatch");
    requireValue(parents.length === 2 && parents[0] === baseSha && parents[1] === candidateHead && candidateTree === headTree, "founder_live_descendant_main_merge_identity_mismatch");
  }
  return true;
}

function resolveFounderCanonicalDescendantIdentity({ root, mode, eventName, baseRef, headRef, checkoutRef, mainRef }) {
  const value = (ref, suffix = "^{commit}") => git(root, ["rev-parse", `${ref}${suffix}`]);
  const blob = (ref, path) => git(root, ["rev-parse", `${ref}:${path}`]);
  const baseSha = value(baseRef); const headSha = value(headRef); const checkoutSha = value(checkoutRef); const mainSha = value(mainRef);
  const parents = git(root, ["show", "-s", "--format=%P", checkoutSha]).split(" ").filter(Boolean);
  const candidateHead = mode === "CANONICAL_DESCENDANT_MAIN" ? parents[1] : headSha;
  return verifyFounderCanonicalDescendantIdentity({
    mode, eventName,
    completionSha: CANONICAL_COMPLETION_SHA,
    completionTree: value(CANONICAL_COMPLETION_SHA, "^{tree}"),
    completionParents: git(root, ["show", "-s", "--format=%P", CANONICAL_COMPLETION_SHA]).split(" ").filter(Boolean),
    baseSha, baseTree: value(baseSha, "^{tree}"), headSha, headTree: value(headSha, "^{tree}"),
    checkoutSha, checkoutTree: value(checkoutSha, "^{tree}"), mainSha, mainTree: value(mainSha, "^{tree}"),
    parents, candidateHead, candidateTree: value(candidateHead, "^{tree}"),
    completionIsAncestorOfBase: git(root, ["merge-base", "--is-ancestor", CANONICAL_COMPLETION_SHA, baseSha]) === "",
    baseIsAncestorOfHead: git(root, ["merge-base", "--is-ancestor", baseSha, headSha]) === "",
    sealedBlobBindings: [...SEAL_PATHS].sort().map((path) => ({
      path,
      completionBlobSha: blob(CANONICAL_COMPLETION_SHA, path), baseBlobSha: blob(baseSha, path),
      headBlobSha: blob(headSha, path), checkoutBlobSha: blob(checkoutSha, path), mainBlobSha: blob(mainSha, path),
    })),
  });
}

export function runFounderLivePreflight({ root = ROOT, base = BASE, head = "HEAD", checkout = "HEAD", mode = "PR_CANDIDATE", eventName, canonicalMain = "origin/main" } = {}) {
  const descendant = mode === "CANONICAL_DESCENDANT_PR" || mode === "CANONICAL_DESCENDANT_MAIN";
  requireValue(git(root, ["rev-parse", `${base}^{commit}`]) === (descendant ? base : BASE), "founder_live_requested_base_invalid");
  requireValue(git(root, ["rev-parse", `${BASE}^{tree}`]) === BASE_TREE, "founder_live_base_tree_invalid");
  requireValue(git(root, ["merge-base", "--is-ancestor", BASE, head]) === "", "founder_live_candidate_not_descendant");
  const documents = { roadmap: load(root, "delivery/integration/accelerated-production-roadmap.json"), matrix: load(root, "delivery/integration/dependency-ownership-matrix.json"), manifest: load(root, "delivery/integration/founder-live-manifest.json"), status: load(root, "delivery/integration/founder-live-status.json") };
  const state = validateFounderLiveDocuments(documents); const binding = verifyFounderLiveBinding(root);
  for (const candidate of documents.manifest.domainCandidates.filter(({ canonicalMergeSha }) => canonicalMergeSha)) {
    for (const key of ["approvedHeadSha", "canonicalHeadSha", "canonicalMergeSha"]) requireValue(git(root, ["rev-parse", `${candidate[key]}^{commit}`]) === candidate[key], `founder_live_candidate_commit_missing:${candidate.track}:${key}`);
    requireValue(git(root, ["rev-parse", `${candidate.approvedHeadSha}^{tree}`]) === candidate.approvedTreeSha, `founder_live_approved_tree_mismatch:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.canonicalMergeSha}^{tree}`]) === candidate.canonicalTreeSha, `founder_live_canonical_tree_mismatch:${candidate.track}`);
    requireValue(git(root, ["show", "-s", "--format=%P", candidate.canonicalMergeSha]).split(" ").join(",") === candidate.mergeParents.join(","), `founder_live_canonical_parents_mismatch:${candidate.track}`);
    requireValue(candidate.mergeParents[1] === candidate.canonicalHeadSha, `founder_live_canonical_head_not_second_parent:${candidate.track}`);
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.approvedHeadSha, candidate.canonicalHeadSha]) === "", `founder_live_approved_head_not_in_canonical_head:${candidate.track}`);
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.canonicalMergeSha, head]) === "", `founder_live_canonical_merge_not_in_candidate:${candidate.track}`);
    const patchId = execFileSync("git", ["patch-id", "--stable"], { cwd: root, encoding: "utf8", input: execFileSync("git", ["diff", `${candidate.approvedBaseSha}..${candidate.approvedHeadSha}`], { cwd: root, maxBuffer: 50 * 1024 * 1024 }), maxBuffer: 50 * 1024 * 1024 }).trim().split(" ")[0];
    requireValue(patchId === candidate.approvedPatchId, `founder_live_candidate_patch_mismatch:${candidate.track}`);
  }
  const changeBase = descendant ? base : BASE;
  const changeEntries = git(root, ["diff", "--name-status", "--no-renames", `${changeBase}..${head}`]).split("\n").filter(Boolean).map((line) => {
    const [status, path] = line.split("\t"); return { status, path };
  });
  const changed = changeEntries.map(({ path }) => path);
  const newMigrations = verifyFounderDescendantMigrationChanges({ descendant, entries: changeEntries });
  const runtimeChanges = changed.filter((path) => path.startsWith("supabase/functions/") || path === "supabase/config.toml" || path === "supabase/production/auth-config.json");
  requireValue(runtimeChanges.every((path) => EDGE_RUNTIME_PATHS.has(path)), "founder_live_unexpected_runtime_change");
  const plan = buildProductionPlan({ repo: root, baseSha: load(root, "delivery/production-state.json").supabase.shippedSourceSha, headSha: git(root, ["rev-parse", `${head}^{commit}`]) });
  const expectedDeployFunctions = runtimeChanges.length > 0 ? ["decision-founder-live"] : [];
  requireValue(JSON.stringify(plan.deployFunctions) === JSON.stringify(expectedDeployFunctions) && plan.authConfig?.deploy === false, "founder_live_production_plan_runtime_scope_invalid");
  let seal = null;
  if (documents.status.codeAndTests === "GREEN") {
    const artifact = load(root, "delivery/integration/founder-live-shared-artifact.json");
    const evidence = load(root, "delivery/integration/founder-live-rehearsal-evidence.json");
    const sealedPlan = load(root, "delivery/integration/founder-live-production-plan.json");
    const postDeploy = load(root, "delivery/integration/founder-live-post-deploy-evidence.json");
    const functionalPlan = buildProductionPlan({ repo: root, baseSha: load(root, "delivery/production-state.json").supabase.shippedSourceSha, headSha: evidence.functionalHeadSha });
    requireValue(Number(process.versions.node.split(".")[0]) === 20, "founder_live_seal_node20_required");
    const rebuilt = buildFounderLiveArtifact({ root, source: evidence.functionalHeadSha });
    for (const key of ["contractVersion", "nodeMajor", "sourceSha", "sourceTreeSha", "sourceSetHash", "fileCount", "artifactHash", "executionAuthorized"]) requireValue(artifact[key] === rebuilt[key], `founder_live_artifact_mismatch:${key}`);
    requireValue(JSON.stringify(artifact.tracks) === JSON.stringify(rebuilt.tracks) && JSON.stringify(artifact.trackVerifications) === JSON.stringify(rebuilt.trackVerifications), "founder_live_artifact_tracks_mismatch");
    requireValue(evidence.baseSha === BASE && evidence.baseTreeSha === BASE_TREE && evidence.functionalTreeSha === rebuilt.sourceTreeSha && evidence.combinedTreeSha === rebuilt.sourceTreeSha && evidence.conflictCount === 2, "founder_live_rehearsal_identity_invalid");
    requireValue(evidence.preservedIntegrationPatchId === "a4c0d9a014fadd8e57399ee688ed042eece51e6b" && evidence.canonicalDomainDeltaPaths?.join(",") === "docs/user-intelligence-vnext/founder-live/release-summary.json,packages/user-intelligence-vnext-core/src/founder-live-projection.ts", "founder_live_integration_patch_audit_invalid");
    requireValue(evidence.conflictResolutions?.length === 2 && evidence.conflictResolutions.every(({ resolution }) => resolution === "STRICTER_USER_VARIANT"), "founder_live_conflict_resolution_invalid");
    requireValue(git(root, ["rev-parse", `${evidence.functionalHeadSha}^{tree}`]) === evidence.combinedTreeSha, "founder_live_rehearsal_tree_mismatch");
    requireValue(evidence.e2eEvidenceHash === "aaa16b4ac6a7afc5691fc54e94339035afec85400d6d9589217a4824b0845d4d" && evidence.byteIdenticalRuns === 2, "founder_live_replay_evidence_invalid");
    requireValue(sealedPlan.sourceSha === evidence.functionalHeadSha && sealedPlan.planHash === functionalPlan.planHash && JSON.stringify(sealedPlan.pendingMigrations) === JSON.stringify(functionalPlan.pendingMigrations.map(({ path }) => path)), "founder_live_production_plan_drift");
    requireValue(sealedPlan.newMigrations === 0 && JSON.stringify(sealedPlan.deployFunctions) === JSON.stringify(expectedDeployFunctions) && sealedPlan.authDeploy === false && sealedPlan.runtimeActivation === false && sealedPlan.executionAuthorized === false, "founder_live_production_scope_open");
    requireValue(postDeploy.status === "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" && postDeploy.productionQueries === 0 && postDeploy.migrationsExecuted === 0 && postDeploy.deploymentsExecuted === 0 && postDeploy.otaActions === 0 && postDeploy.executionAuthorized === false, "founder_live_post_deploy_claim_invalid");
    requireValue(documents.status.ctoReviewReady === true && ["NO_GO", "IMPLEMENTATION_READY_DEPLOYMENT_NOT_AUTHORIZED"].includes(documents.status.productionStatus), "founder_live_cto_status_invalid");
    const headSha = git(root, ["rev-parse", `${head}^{commit}`]); const checkoutSha = git(root, ["rev-parse", `${checkout}^{commit}`]); const mainSha = git(root, ["rev-parse", `${canonicalMain}^{commit}`]);
    const parents = git(root, ["show", "-s", "--format=%P", checkoutSha]).split(" ").filter(Boolean);
    const candidateHead = mode === "POST_MERGE_MAIN" ? parents[1] : headSha;
    const candidateTree = git(root, ["rev-parse", `${candidateHead}^{tree}`]); const checkoutTree = git(root, ["rev-parse", `${checkoutSha}^{tree}`]);
    if (descendant) {
      resolveFounderCanonicalDescendantIdentity({ root, mode, eventName, baseRef: base, headRef: head, checkoutRef: checkout, mainRef: canonicalMain });
    } else {
      verifyFounderSealScope({ commitCount: Number(git(root, ["rev-list", "--count", `${evidence.functionalHeadSha}..${candidateHead}`])), paths: git(root, ["diff", "--name-only", `${evidence.functionalHeadSha}..${candidateHead}`]).split("\n").filter(Boolean) });
      verifyFounderIdentityMode({ mode, baseSha: BASE, headSha: mode === "POST_MERGE_MAIN" ? checkoutSha : headSha, checkoutSha, mainSha, headTree: mode === "POST_MERGE_MAIN" ? checkoutTree : candidateTree, checkoutTree, candidateHead, candidateTree, parents });
    }
    seal = { artifactHash: artifact.artifactHash, sourceSetHash: artifact.sourceSetHash, functionalHeadSha: evidence.functionalHeadSha, combinedTreeSha: evidence.combinedTreeSha, e2eEvidenceHash: evidence.e2eEvidenceHash };
  }
  return { contractVersion: "backyrd.founder-live-preflight@1.0", gateStatus: "GREEN", releaseStatus: state.status, boundCandidates: state.boundCandidates, executionAuthorized: false, baseSha: git(root, ["rev-parse", `${base}^{commit}`]), headSha: git(root, ["rev-parse", `${head}^{commit}`]), treeSha: git(root, ["rev-parse", `${head}^{tree}`]), binding, seal, productionPlan: { planHash: plan.planHash, pendingMigrations: plan.pendingMigrations.map(({ path }) => path), newMigrations: newMigrations.length, deployFunctions: plan.deployFunctions, authDeploy: false, runtimeActivation: false, executionAuthorized: false }, changedFiles: changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runFounderLivePreflight({ root: resolve(process.argv[2] ?? ROOT), base: process.env.FOUNDER_LIVE_BASE_SHA ?? BASE, head: process.argv[3] ?? "HEAD", checkout: process.env.FOUNDER_LIVE_CHECKOUT_SHA ?? "HEAD", mode: process.env.FOUNDER_LIVE_MODE ?? "PR_CANDIDATE", eventName: process.env.FOUNDER_LIVE_EVENT_NAME, canonicalMain: process.env.FOUNDER_LIVE_CANONICAL_MAIN ?? "origin/main" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_live_preflight_blocked:${error.message}\n`); process.exitCode = 1; }
}
