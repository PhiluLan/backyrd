import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { findNode20, linkIsolatedDependencies } from "./week2-decision-provenance.mjs";

const ARTIFACT_PATH = "delivery/integration/week2-shared-decision-artifact.json";
const TRACKS = ["WORLD", "USER", "DECISION", "INTEGRATION"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const normalizedOverlaps = (value) => value
  .map(({ left, right, files }) => ({ left, right, files: [...files].sort() }))
  .sort((a, b) => `${a.left}:${a.right}`.localeCompare(`${b.left}:${b.right}`));

export function verifyFourTrackAuthority({ manifest, evidence, reconstruction, sealedArtifact, execution }) {
  requireValue(evidence.sharedArtifactManifestPath === ARTIFACT_PATH, "week2_shared_artifact_path_mismatch");
  requireValue(sha256(`${JSON.stringify(sealedArtifact, null, 2)}\n`) === evidence.sharedArtifactManifestHash, "week2_shared_artifact_manifest_hash_mismatch");
  requireValue(sealedArtifact.artifactHash === evidence.sharedArtifactHash, "week2_shared_artifact_hash_mismatch");

  const expectedHeads = [
    ...manifest.domainCandidates.map(({ track, headSha }) => ({ track, headSha })),
    { track: "INTEGRATION", headSha: evidence.integrationHeadSha },
  ];
  requireValue(sameJson(reconstruction.orderedHeads, expectedHeads), "week2_rehearsal_ordered_heads_mismatch");
  requireValue(sameJson(evidence.orderedHeads, expectedHeads), "week2_evidence_ordered_heads_mismatch");
  requireValue(reconstruction.baseSha === evidence.baseSha, "week2_rehearsal_base_mismatch");
  requireValue(reconstruction.integrationHeadSha === evidence.integrationHeadSha, "week2_rehearsal_integration_head_mismatch");
  requireValue(sameJson(reconstruction.steps, evidence.steps), "week2_rehearsal_steps_mismatch");
  requireValue(reconstruction.combinedCommitSha === evidence.combinedCommitSha, "week2_rehearsal_combined_commit_mismatch");
  requireValue(reconstruction.combinedTreeSha === evidence.combinedTreeSha, "week2_rehearsal_combined_tree_mismatch");
  requireValue(reconstruction.conflictCount === 0 && evidence.conflictCount === 0, "week2_rehearsal_conflict_count_mismatch");
  requireValue(sameJson(normalizedOverlaps(reconstruction.overlaps), normalizedOverlaps(evidence.overlaps)), "week2_rehearsal_overlaps_mismatch");

  requireValue(execution.combinedCommitSha === evidence.combinedCommitSha, "week2_artifact_combined_commit_mismatch");
  requireValue(execution.combinedTreeSha === evidence.combinedTreeSha, "week2_artifact_combined_tree_mismatch");
  requireValue(sameJson(execution.artifact, sealedArtifact), "week2_shared_artifact_manifest_mismatch");
  requireValue(execution.artifact.artifactHash === evidence.sharedArtifactHash, "week2_shared_artifact_execution_hash_mismatch");
  requireValue(sameJson(execution.verifiedTracks, TRACKS), "week2_shared_artifact_track_verification_mismatch");
  return {
    combinedCommitSha: reconstruction.combinedCommitSha,
    combinedTreeSha: reconstruction.combinedTreeSha,
    artifactHash: execution.artifact.artifactHash,
    artifactManifestHash: evidence.sharedArtifactManifestHash,
    verifiedTracks: TRACKS,
  };
}

export function executeCombinedArtifact({ root, reconstruction }) {
  const node = findNode20();
  requireValue(Number(process.versions.node.split(".")[0]) === 20, "week2_combined_artifact_preflight_node20_required");
  const npm = join(dirname(node), "npm");
  requireValue(existsSync(npm), "week2_combined_artifact_npm_missing");
  requireValue(existsSync(resolve(root, "node_modules")), "week2_combined_artifact_dependencies_missing");
  const parent = mkdtempSync(join(tmpdir(), "backyrd-week2-four-track-authority-"));
  const checkout = join(parent, "checkout");
  const artifactPath = join(parent, "artifact.json");
  let added = false;
  try {
    git(root, ["worktree", "add", "--detach", checkout, reconstruction.combinedCommitSha]);
    added = true;
    const combinedCommitSha = git(checkout, ["rev-parse", "HEAD^{commit}"]);
    const combinedTreeSha = git(checkout, ["rev-parse", "HEAD^{tree}"]);
    requireValue(combinedCommitSha === reconstruction.combinedCommitSha, "week2_combined_checkout_commit_mismatch");
    requireValue(combinedTreeSha === reconstruction.combinedTreeSha, "week2_combined_checkout_tree_mismatch");
    requireValue(git(checkout, ["status", "--porcelain"]) === "", "week2_combined_checkout_dirty");
    linkIsolatedDependencies(root, checkout);
    const isolatedHome = join(parent, "home");
    mkdirSync(isolatedHome);
    const env = {
      PATH: `${dirname(node)}:/usr/local/bin:/usr/bin:/bin`,
      HOME: isolatedHome,
      CI: "true",
      npm_config_offline: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
      NO_PROXY: "*",
      no_proxy: "*",
    };
    execFileSync(npm, ["run", "decision-vnext:build"], { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    for (const path of [
      "packages/world-knowledge-core/dist",
      "packages/user-intelligence-vnext-core/dist",
      "packages/decision-vnext-core/dist",
    ]) requireValue(existsSync(join(checkout, path)), `week2_combined_artifact_dist_missing:${path}`);
    execFileSync(node, ["scripts/ci/decision-build-artifact.mjs", "--create", artifactPath], { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync(node, ["scripts/ci/decision-build-artifact.mjs", "--verify", artifactPath], { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    return { combinedCommitSha, combinedTreeSha, artifact, verifiedTracks: [...TRACKS] };
  } finally {
    if (added) {
      try { git(root, ["worktree", "remove", "--force", checkout]); } catch { /* preserve primary failure */ }
    }
    rmSync(parent, { recursive: true, force: true });
  }
}

export const FOUR_TRACK_AUTHORITY_CONSTANTS = Object.freeze({ artifactPath: ARTIFACT_PATH, tracks: TRACKS });
