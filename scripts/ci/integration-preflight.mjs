#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChange } from "./classify-change.mjs";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import { verifySourceAwareIdempotencyMigrationScope } from "./source-aware-idempotency-migration-scope.mjs";
import { verifySourceAwareInactiveFounderLiveScope } from "./source-aware-inactive-founder-live-scope.mjs";

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const load = (root, path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };

export function validateControlPlaneDocuments({ roadmap, matrix, flags, manifest, report }) {
  requireValue(roadmap.contractVersion === "backyrd.accelerated-production-roadmap@1.0", "roadmap_identity_mismatch");
  requireValue(roadmap.executionAuthorized === false, "roadmap_execution_must_be_false");
  requireValue(JSON.stringify(roadmap.milestones.map((item) => item.day ?? item.dayRange)) === JSON.stringify([7, 14, 21, 42, [84, 98]]), "roadmap_milestones_mismatch");

  requireValue(matrix.contractVersion === "backyrd.integration-dependency-ownership-matrix@1.0", "ownership_matrix_identity_mismatch");
  requireValue(matrix.executionAuthorized === false, "ownership_execution_must_be_false");
  requireValue(JSON.stringify(matrix.tracks.map(({ id }) => id)) === JSON.stringify(["WORLD", "USER", "DECISION", "INTEGRATION"]), "ownership_tracks_mismatch");
  for (const track of matrix.tracks) {
    requireValue(track.authority.length > 0 && track.outputs.length > 0 && track.stopConditions.length > 0, `ownership_track_incomplete:${track.id}`);
  }

  requireValue(flags.contractVersion === "backyrd.dark-release-contracts@1.0", "dark_release_identity_mismatch");
  requireValue(flags.executionAuthorized === false && flags.missingConfigurationBehavior === "OFF" && flags.unknownFlagBehavior === "REJECT", "dark_release_not_fail_closed");
  requireValue(flags.flags.length === 4, "dark_release_flag_count_mismatch");
  for (const flag of flags.flags) requireValue(flag.default === false && flag.killSwitchDefault === true && flag.scope.startsWith("server"), `dark_release_flag_not_off:${flag.id}`);

  requireValue(manifest.contractVersion === "backyrd.week1-integration-manifest@1.0", "integration_manifest_identity_mismatch");
  requireValue(manifest.executionAuthorized === false && manifest.productionPlan.executionAuthorized === false, "manifest_execution_must_be_false");
  requireValue(SHA.test(manifest.canonicalBaseSha), "manifest_base_sha_invalid");
  requireValue(manifest.productionPlan.expectedPendingMigrationCount === 9, "manifest_pending_migration_expectation_mismatch");
  requireValue(JSON.stringify(manifest.domainCandidates.map(({ track }) => track)) === JSON.stringify(["WORLD", "USER", "DECISION"]), "manifest_domain_tracks_mismatch");
  for (const candidate of manifest.domainCandidates) {
    const values = [candidate.pr, candidate.baseSha, candidate.headSha, candidate.treeSha, candidate.artifactHash];
    const populated = values.filter((value) => value !== null).length;
    requireValue(populated === 0 || populated === values.length, `domain_candidate_partially_bound:${candidate.track}`);
    if (populated) {
      requireValue(candidate.status === "READY", `domain_candidate_status_invalid:${candidate.track}`);
      requireValue(SHA.test(candidate.baseSha) && SHA.test(candidate.headSha) && SHA.test(candidate.treeSha) && HASH.test(candidate.artifactHash), `domain_candidate_identity_invalid:${candidate.track}`);
    } else requireValue(candidate.status === "AWAITING_DOMAIN_PR", `domain_candidate_empty_status_invalid:${candidate.track}`);
  }
  const boundArtifactHashes = new Set(manifest.domainCandidates.map(({ artifactHash }) => artifactHash).filter(Boolean));
  requireValue(boundArtifactHashes.size <= 1, "domain_candidates_do_not_share_one_artifact");

  requireValue(report.contractVersion === "backyrd.daily-integration-report@1.0" && report.executionAuthorized === false, "daily_report_identity_or_authority_invalid");
  requireValue(["GREEN", "YELLOW", "RED"].includes(report.overall), "daily_report_status_invalid");
  requireValue(JSON.stringify(report.tracks.map(({ id }) => id)) === JSON.stringify(["WORLD", "USER", "DECISION", "INTEGRATION"]), "daily_report_tracks_mismatch");
  for (const track of report.tracks) requireValue(["GREEN", "YELLOW", "RED"].includes(track.status) && Boolean(track.reason), `daily_report_track_invalid:${track.id}`);

  return { boundDomainCandidates: manifest.domainCandidates.filter(({ headSha }) => headSha).length, sharedArtifactHash: [...boundArtifactHashes][0] ?? null };
}

export function loadControlPlaneDocuments(root = ROOT) {
  return {
    roadmap: load(root, "delivery/integration/accelerated-production-roadmap.json"),
    matrix: load(root, "delivery/integration/dependency-ownership-matrix.json"),
    flags: load(root, "delivery/integration/dark-release-contracts.json"),
    manifest: load(root, "delivery/integration/week1-integration-manifest.json"),
    report: load(root, "delivery/integration/daily-integration-report.json"),
  };
}

function verifyCanonicalContracts(root) {
  const checks = [
    ["packages/world-knowledge-core/src/registry.ts", "backyrd.world-knowledge.registry@2.1"],
    ["packages/world-knowledge-core/src/port.ts", "backyrd.world-knowledge.reader-port@1.0"],
    ["packages/world-knowledge-core/src/contextual.ts", "backyrd.world-knowledge.context-handoff@1.0"],
    ["packages/user-intelligence-vnext-core/src/contracts.ts", "backyrd.user-intelligence.projection@1.0"],
    ["docs/user-intelligence-vnext/phase3d/phase3d-release-summary.json", "\"executionAuthorized\": false"],
    ["docs/decision-vnext/PHASE3C_READINESS.md", "not Production readiness"],
  ];
  for (const [path, identity] of checks) requireValue(readFileSync(resolve(root, path), "utf8").includes(identity), `canonical_contract_identity_missing:${path}:${identity}`);
  return checks.map(([path, identity]) => ({ path, identity }));
}

function verifyCandidateGitObjects(root, manifest) {
  for (const candidate of manifest.domainCandidates.filter(({ headSha }) => headSha)) {
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.baseSha, candidate.headSha]) === "", `domain_candidate_not_descendant:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.headSha}^{tree}`]) === candidate.treeSha, `domain_candidate_tree_mismatch:${candidate.track}`);
  }
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    requireValue(item.startsWith("--"), `unexpected_argument:${item}`);
    const key = item.slice(2);
    if (key === "final") args.final = true;
    else { requireValue(argv[index + 1] && !argv[index + 1].startsWith("--"), `argument_value_missing:${key}`); args[key] = argv[index + 1]; index += 1; }
  }
  return args;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const root = resolve(args.root ?? ROOT);
    const documents = loadControlPlaneDocuments(root);
    const documentState = validateControlPlaneDocuments(documents);
    verifyCandidateGitObjects(root, documents.manifest);
    if (args.final) requireValue(documentState.boundDomainCandidates === 3 && documentState.sharedArtifactHash, "final_domain_candidates_not_sealed");

    const headSha = git(root, ["rev-parse", `${args["head-sha"] ?? "HEAD"}^{commit}`]);
    const baseSha = git(root, ["rev-parse", `${args["base-sha"] ?? documents.manifest.canonicalBaseSha}^{commit}`]);
    requireValue(git(root, ["merge-base", "--is-ancestor", baseSha, headSha]) === "", "candidate_not_descendant_from_base");
    const policy = load(root, "delivery/change-policy.json");
    const changePlan = classifyChange({ root, context: { schemaVersion: "backyrd-change-context-v1", eventName: "local", baseSha, headSha, checkoutSha: headSha, checkoutKind: "exact-head", canonicalMainSha: git(root, ["rev-parse", "origin/main^{commit}"]), baseIsCanonicalTip: baseSha === git(root, ["rev-parse", "origin/main^{commit}"]), baseIsCanonicalAncestor: true, staleBase: false }, policy });
    requireValue(changePlan.blockedReasons.length === 0, `change_plan_blocked:${changePlan.blockedReasons.join(",")}`);

    const productionPlan = buildProductionPlan({ repo: root, baseSha: documents.manifest.productionPlan.shippedSourceSha, headSha });
    const inactiveFounderLiveScope = verifySourceAwareInactiveFounderLiveScope({
      root,
      productionPlan,
      headSha,
      treeSha: git(root, ["rev-parse", `${headSha}^{tree}`]),
    });
    const migrationScopes = verifySourceAwareIdempotencyMigrationScope({ root, pendingMigrations: productionPlan.pendingMigrations, baseSha, headSha });
    requireValue(migrationScopes.worldMigrations.length === documents.manifest.productionPlan.expectedPendingMigrationCount, `world_pending_migration_count_mismatch:${migrationScopes.worldMigrations.length}`);

    const canonicalContracts = verifyCanonicalContracts(root);
    const worktrees = git(root, ["worktree", "list", "--porcelain"]).split("\n\n").filter(Boolean).map((entry) => Object.fromEntries(entry.split("\n").map((line) => { const separator = line.indexOf(" "); return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)]; })));
    const outcome = {
      contractVersion: "backyrd.integration-preflight-result@1.0",
      status: documentState.boundDomainCandidates === 3 ? "GREEN" : "YELLOW",
      executionAuthorized: false,
      candidate: { baseSha, headSha, treeSha: git(root, ["rev-parse", `${headSha}^{tree}`]) },
      canonicalMainSha: git(root, ["rev-parse", "origin/main^{commit}"]),
      worktrees,
      domainCandidates: documents.manifest.domainCandidates,
      canonicalContracts,
      darkRelease: { flags: documents.flags.flags.map(({ id, default: defaultValue, killSwitchDefault }) => ({ id, default: defaultValue, killSwitchDefault })), missingConfigurationBehavior: documents.flags.missingConfigurationBehavior },
      productionPlan: { planHash: productionPlan.planHash, pendingMigrationCount: productionPlan.pendingMigrations.length, inheritedWorldMigrationCount: migrationScopes.worldMigrations.length, independentAdditiveMigrations: migrationScopes.independentMigrations.map(({ path, sha256 }) => ({ path, sha256, evidenceId: migrationScopes.evidenceId })), independentRuntimeScopes: inactiveFounderLiveScope.runtimeScopes, edgeEvidenceHash: inactiveFounderLiveScope.evidence?.evidenceHash ?? null, runtimeDeploymentRequired: productionPlan.runtimeDeploymentRequired, deployFunctions: productionPlan.deployFunctions, authDeploy: productionPlan.authConfig?.deploy ?? false, executionAuthorized: false },
      changePlan: { classes: changePlan.classes, requiredGates: changePlan.requiredGates },
      finalMode: Boolean(args.final),
    };
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`integration_preflight_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
