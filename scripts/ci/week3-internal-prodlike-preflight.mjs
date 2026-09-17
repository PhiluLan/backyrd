#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import { executeCombinedArtifact } from "./week2-four-track-authority.mjs";
import { verifySupabaseCompatibilitySources } from "./week2-dark-wiring-preflight.mjs";
import { createInternalAllowlistEnvelope, loadWeek3Documents, rehearseInternalProductLike, sha256, validateWeek3Documents } from "./week3-internal-prodlike.mjs";
import { executeWeek3DecisionEvidence, verifyWeek3DecisionEvidence } from "./week3-decision-provenance.mjs";
import { rehearseWeek3FourTrack } from "./week3-four-track-rehearsal.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const fieldValue = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);

export function verifyWeek3CandidateIdentities(root, manifest) {
  for (const candidate of manifest.domainCandidates) {
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.baseSha, candidate.headSha]) === "", `week3_candidate_not_descendant:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.headSha}^{tree}`]) === candidate.treeSha, `week3_candidate_tree_mismatch:${candidate.track}`);
    for (const binding of candidate.bindings) {
      const content = git(root, ["show", `${candidate.headSha}:${binding.path}`]);
      if (binding.type === "TEXT_CONTAINS") requireValue(content.includes(binding.expected), `week3_candidate_binding_mismatch:${candidate.track}:${binding.name}`);
      else if (binding.type === "JSON_FIELD_EQUALS") requireValue(fieldValue(JSON.parse(content), binding.field) === binding.expected, `week3_candidate_binding_mismatch:${candidate.track}:${binding.name}`);
      else throw new Error(`week3_candidate_binding_type_unknown:${candidate.track}:${binding.name}`);
    }
  }
}

export function verifySecurityDefinerSources(sources) {
  for (const { path, source } of sources) {
    const definitions = source.split(/(?=\bcreate\s+(?:or\s+replace\s+)?function\b)/i).filter((part) => /\bsecurity\s+definer\b/i.test(part));
    for (const definition of definitions) {
      requireValue(/\bset\s+search_path\s*=\s*(?:''|pg_catalog(?:\s*,\s*[a-z_][a-z0-9_]*)*)/i.test(definition), `week3_security_definer_search_path_unsafe:${path}`);
      requireValue(/\brevoke\s+execute\b/i.test(source), `week3_security_definer_execute_not_revoked:${path}`);
    }
  }
  return { unsafeSecurityDefinerCount: 0 };
}

export function runWeek3Preflight({ root = ROOT, baseSha: requestedBase, headSha: requestedHead, final = false }) {
  requireValue(Number(process.versions.node.split(".")[0]) === 20, "week3_preflight_node20_required");
  const documents = loadWeek3Documents(root); const state = validateWeek3Documents(documents);
  verifyWeek3CandidateIdentities(root, documents.manifest);
  const baseSha = git(root, ["rev-parse", `${requestedBase ?? documents.manifest.canonicalBaseSha}^{commit}`]);
  const headSha = git(root, ["rev-parse", `${requestedHead ?? "HEAD"}^{commit}`]);
  const canonicalMainSha = git(root, ["rev-parse", "origin/main^{commit}"]);
  requireValue(baseSha === documents.manifest.canonicalBaseSha && canonicalMainSha === documents.manifest.canonicalBaseSha, "week3_base_or_main_drift");
  requireValue(git(root, ["merge-base", "--is-ancestor", baseSha, headSha]) === "", "week3_integration_not_descendant");

  requireValue(git(root, ["merge-base", "--is-ancestor", documents.evidence.integrationHeadSha, headSha]) === "", "week3_sealed_head_not_descendant");
  const sealPaths = git(root, ["diff", "--name-only", `${documents.evidence.integrationHeadSha}..${headSha}`]).split("\n").filter(Boolean);
  const allowedSealPaths = new Set(["delivery/integration/week3-decision-evidence.json", "delivery/integration/week3-post-deploy-evidence.json", "delivery/integration/week3-rehearsal-evidence.json", "delivery/integration/week3-shared-artifact.json", "delivery/integration/week3-status.json"]);
  requireValue(sealPaths.every((path) => allowedSealPaths.has(path)), `week3_seal_scope_invalid:${sealPaths.filter((path) => !allowedSealPaths.has(path)).join(",")}`);
  const reconstruction = rehearseWeek3FourTrack({ root, integrationHead: documents.evidence.integrationHeadSha });
  requireValue(reconstruction.conflictCount === 0, "week3_rehearsal_conflict");
  const artifactExecution = executeCombinedArtifact({ root, reconstruction });
  const artifactAttestation = { artifactContract: artifactExecution.artifact.contractVersion, artifactHash: artifactExecution.artifact.artifactHash, sourceSetHash: artifactExecution.artifact.sourceSetHash, fileCount: artifactExecution.artifact.files.length, nodeMajor: 20, combinedCommitSha: reconstruction.combinedCommitSha, combinedTreeSha: reconstruction.combinedTreeSha };
  for (const [field, expected] of Object.entries(artifactAttestation)) requireValue(documents.sharedArtifact[field] === expected, `week3_shared_artifact_mismatch:${field}`);
  requireValue(artifactExecution.verifiedTracks.join(",") === "WORLD,USER,DECISION,INTEGRATION", "week3_artifact_tracks_invalid");
  const sealedArtifactFileHash = sha256(readFileSync(resolve(root, "delivery/integration/week3-shared-artifact.json"), "utf8"));
  requireValue(documents.evidence.artifactHash === artifactExecution.artifact.artifactHash && documents.evidence.artifactManifestHash === sealedArtifactFileHash, "week3_artifact_evidence_mismatch");
  requireValue(documents.evidence.combinedCommitSha === reconstruction.combinedCommitSha && documents.evidence.combinedTreeSha === reconstruction.combinedTreeSha, "week3_rehearsal_identity_mismatch");
  requireValue(JSON.stringify(documents.evidence.orderedHeads) === JSON.stringify(reconstruction.orderedHeads) && JSON.stringify(documents.evidence.steps) === JSON.stringify(reconstruction.steps) && JSON.stringify(documents.evidence.overlaps) === JSON.stringify(reconstruction.overlaps), "week3_rehearsal_detail_mismatch");

  const decisionCandidate = documents.manifest.domainCandidates.find(({ track }) => track === "DECISION");
  const decisionExecution = executeWeek3DecisionEvidence({ root, candidate: decisionCandidate });
  const decisionAuthority = verifyWeek3DecisionEvidence({ candidate: decisionCandidate, sealed: documents.decisionEvidence, execution: decisionExecution });

  const fixture = documents.fixture; const releaseHash = sha256({ manifest: documents.manifest.domainCandidates.map(({ track, headSha, treeSha, domainArtifactHash }) => ({ track, headSha, treeSha, domainArtifactHash })) });
  const requestHash = sha256(fixture.requestBody);
  const envelope = createInternalAllowlistEnvelope({ ...fixture, releaseHash, requestHash });
  const authority = { status: "SYNTHETIC_TEST_AUTHORITY", subjectPseudonym: fixture.subjectPseudonym, purpose: fixture.purpose, environment: fixture.environment, releaseHash };
  const configuration = { environment: "PROD_LIKE_TEST", internalTestOn: true, globalKillSwitch: "DISENGAGED", WORLD_KILL_SWITCH: "DISENGAGED", USER_KILL_SWITCH: "DISENGAGED", DECISION_KILL_SWITCH: "DISENGAGED" };
  const full = rehearseInternalProductLike({ fixture, configuration, envelope, authority });
  const emergency = rehearseInternalProductLike({ fixture, configuration, envelope, authority, emergencyAfterWorldRead: true });
  const repeatedOff = rehearseInternalProductLike({ fixture, configuration: {} });
  for (const value of [full.phases.off, full.phases.emergencyOff, emergency.phases.emergencyOff, repeatedOff.phases.off]) requireValue(Object.values(value).every((count) => count === 0), "week3_off_invariant_failed");
  requireValue(full.phases.testOn.writes === 0 && full.phases.testOn.networkCalls === 0 && full.phases.testOn.productOutputs === 0 && full.productOutput === null && full.persisted === false, "week3_test_on_side_effect_boundary_failed");
  requireValue(emergency.aborted === true && emergency.phases.testOn.worldReads === 1 && emergency.phases.testOn.userProjections === 0 && emergency.phases.testOn.decisionEvaluations === 0, "week3_midflight_abort_failed");
  const report = { contractVersion: "backyrd.week3-internal-prodlike-report@1.0", releaseHash, envelopeHash: envelope.envelopeHash, phases: { off: full.phases.off, testOn: full.phases.testOn, emergencyOff: emergency.phases.emergencyOff }, aborted: emergency.aborted, productOutput: null, persisted: false, executionAuthorized: false };
  const reportHash = sha256(report); requireValue(documents.evidence.reportHash === reportHash && documents.evidence.replayHash === reportHash, "week3_report_replay_mismatch");

  const productionPlan = buildProductionPlan({ repo: root, baseSha: documents.manifest.productionPlan.shippedSourceSha, headSha: reconstruction.combinedCommitSha });
  requireValue(productionPlan.pendingMigrations.length === 9 && productionPlan.pendingMigrations.every(({ path }) => /world_knowledge|world_founder/.test(path)), "week3_pending_migrations_invalid");
  requireValue(productionPlan.deployFunctions.length === 0 && productionPlan.authConfig?.deploy === false, "week3_unexpected_function_or_auth_deploy");
  const migrationSources = productionPlan.pendingMigrations.map(({ path }) => ({ path, source: readFileSync(resolve(root, path), "utf8") }));
  const supabaseCompatibility = verifySupabaseCompatibilitySources(migrationSources); const securityDefiner = verifySecurityDefinerSources(migrationSources);
  const controlHash = sha256(documents.controls); const planHash = productionPlan.planHash;
  const postBody = { ...documents.postDeployEvidence, evidenceHash: undefined };
  requireValue(documents.postDeployEvidence.mainSha === reconstruction.combinedCommitSha && documents.postDeployEvidence.treeSha === reconstruction.combinedTreeSha && documents.postDeployEvidence.artifactHash === artifactExecution.artifact.artifactHash, "week3_post_deploy_source_binding_mismatch");
  requireValue(documents.postDeployEvidence.killSwitchControlHash === controlHash && documents.postDeployEvidence.productionPlanHash === planHash, "week3_post_deploy_control_or_plan_mismatch");
  delete postBody.evidenceHash; requireValue(documents.postDeployEvidence.evidenceHash === sha256(postBody), "week3_post_deploy_evidence_hash_mismatch");
  if (final) requireValue(state.rehearsalReady && state.boundDomainCandidates === 3, "week3_final_not_ready");
  return { contractVersion: "backyrd.week3-preflight-result@1.0", status: "GREEN", executionAuthorized: false, candidate: { baseSha, headSha, treeSha: git(root, ["rev-parse", `${headSha}^{tree}`]) }, canonicalMainSha, reconstruction, artifact: { artifactHash: artifactExecution.artifact.artifactHash, manifestHash: sealedArtifactFileHash, verifiedTracks: artifactExecution.verifiedTracks }, decisionAuthority, allowlist: { realMemberCount: 0, syntheticEnvelopeHash: envelope.envelopeHash, releaseHash }, killSwitchRehearsal: { off: full.phases.off, testOn: full.phases.testOn, emergencyOff: emergency.phases.emergencyOff, repeatedOff: repeatedOff.phases.off, recoveryMilliseconds: emergency.recoveryMilliseconds, qualityThresholdDeclared: false }, reportHash, replayHash: reportHash, supabaseCompatibility: { ...supabaseCompatibility, ...securityDefiner }, productionPlan: { planHash, pendingMigrationCount: 9, deployFunctions: [], authDeploy: false, executionAuthorized: false }, postDeployEvidenceStatus: documents.postDeployEvidence.status, finalMode: final };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) => { if (value.startsWith("--") && value !== "--final") items.push([value.slice(2), all[index + 1]]); return items; }, []));
    process.stdout.write(`${JSON.stringify(runWeek3Preflight({ root: resolve(args.root ?? ROOT), baseSha: args["base-sha"], headSha: args["head-sha"], final: process.argv.includes("--final") }), null, 2)}\n`);
  } catch (error) { process.stderr.write(`week3_internal_prodlike_preflight_blocked:${error.message}\n`); process.exitCode = 1; }
}
