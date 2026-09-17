import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const TRACKS = ["WORLD", "USER", "DECISION"];
const PURPOSE = "INTERNAL_PRODUCT_LIKE_REHEARSAL";
const ENVIRONMENTS = ["LOCAL_TEST", "PROD_LIKE_TEST"];
const ZERO = Object.freeze({ worldReads: 0, userProjections: 0, decisionEvaluations: 0, writes: 0, networkCalls: 0, productOutputs: 0 });
const CONFIG_KEYS = new Set(["environment", "globalKillSwitch", "WORLD_KILL_SWITCH", "USER_KILL_SWITCH", "DECISION_KILL_SWITCH", "internalTestOn"]);

const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const exactKeys = (value, keys, reason) => requireValue(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(","), reason);
const fieldValue = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);

export function loadWeek3Documents(root) {
  const load = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return {
    manifest: load("delivery/integration/week3-internal-prodlike-manifest.json"),
    matrix: load("delivery/integration/week3-dependency-ownership-compatibility-matrix.json"),
    controls: load("delivery/integration/week3-internal-controls.json"),
    status: load("delivery/integration/week3-status.json"),
    fixture: load("delivery/integration/fixtures/week3-internal-prodlike-synthetic.json"),
    evidence: load("delivery/integration/week3-rehearsal-evidence.json"),
    decisionEvidence: load("delivery/integration/week3-decision-evidence.json"),
    postDeployEvidence: load("delivery/integration/week3-post-deploy-evidence.json"),
    sharedArtifact: load("delivery/integration/week3-shared-artifact.json"),
  };
}

export function validateWeek3Documents({ manifest, matrix, controls, status, fixture, evidence, decisionEvidence, postDeployEvidence, sharedArtifact }) {
  requireValue(manifest.contractVersion === "backyrd.week3-internal-prodlike-manifest@1.0", "week3_manifest_contract_invalid");
  requireValue(manifest.canonicalBaseSha === "b98b3870f60e9495c10f3c23f006fb9b3213d63e" && manifest.canonicalBaseTreeSha === "e59939dc43c51139dcaf0928b9725e8b98b0a1cc", "week3_canonical_base_invalid");
  requireValue(manifest.executionAuthorized === false && manifest.productionActivationAuthorized === false, "week3_authority_open");
  requireValue(manifest.domainCandidates.map(({ track }) => track).join(",") === TRACKS.join(","), "week3_track_order_invalid");
  for (const candidate of manifest.domainCandidates) {
    requireValue(Number.isInteger(candidate.pr) && SHA.test(candidate.baseSha) && SHA.test(candidate.headSha) && SHA.test(candidate.treeSha), `week3_candidate_identity_invalid:${candidate.track}`);
    requireValue(candidate.baseSha === manifest.canonicalBaseSha && HASH.test(candidate.domainArtifactHash) && HASH.test(candidate.planHash), `week3_candidate_binding_invalid:${candidate.track}`);
    requireValue(candidate.bindings.length > 0, `week3_candidate_bindings_missing:${candidate.track}`);
  }
  requireValue(manifest.mergeSequence.join(",") === "WORLD,USER,DECISION,INTEGRATION_FINAL_REVALIDATION", "week3_merge_sequence_invalid");
  requireValue(manifest.productionPlan.expectedPendingMigrationCount === 9 && manifest.productionPlan.pendingMigrationClass === "WORLD_INHERITED", "week3_migration_expectation_invalid");
  requireValue(manifest.productionPlan.expectedDeployFunctions.length === 0 && manifest.productionPlan.authDeploy === false && manifest.productionPlan.executionAuthorized === false, "week3_production_scope_open");

  requireValue(matrix.contractVersion === "backyrd.week3-dependency-ownership-compatibility-matrix@1.0" && matrix.executionAuthorized === false, "week3_matrix_invalid");
  requireValue(matrix.tracks.map(({ id }) => id).join(",") === "WORLD,USER,DECISION,INTEGRATION", "week3_matrix_tracks_invalid");
  requireValue(matrix.supabaseCompatibility.postgresMajor === 17, "week3_postgres_major_invalid");
  requireValue(matrix.supabaseCompatibility.dataApi === "EXPLICIT_GRANTS_PLUS_RLS", "week3_grant_rls_invalid");
  requireValue(matrix.supabaseCompatibility.forbiddenSchemaMutations.join(",") === "auth,realtime,storage", "week3_protected_schemas_invalid");
  requireValue(matrix.supabaseCompatibility.logsAllDependencyAllowed === false && matrix.supabaseCompatibility.extensionVersionPinningAllowed === false, "week3_breaking_change_boundary_invalid");
  requireValue(matrix.supabaseCompatibility.securityDefiner === "PRIVATE_SCHEMA_EMPTY_SEARCH_PATH_EXPLICIT_EXECUTE_ONLY", "week3_security_definer_boundary_invalid");

  requireValue(controls.contractVersion === "backyrd.week3-internal-controls@1.0" && controls.executionAuthorized === false, "week3_controls_invalid");
  requireValue(controls.realAllowlistMemberCount === 0 && controls.authorityStatus === "NOT_CONFIGURED", "week3_real_allowlist_fabricated");
  requireValue(controls.defaultFlags.every(({ enabled }) => enabled === false), "week3_flag_default_open");
  requireValue(Object.values(controls.killSwitches).every((value) => ["ENGAGED", "FORCED_OFF"].includes(value)), "week3_kill_switch_default_open");
  requireValue(controls.missingConfigurationBehavior === "OFF" && controls.unknownConfigurationBehavior === "OFF_AND_DENY", "week3_configuration_not_fail_closed");

  requireValue(status.contractVersion === "backyrd.week3-integration-status@1.0" && status.overall === "YELLOW" && status.executionAuthorized === false, "week3_status_invalid");
  requireValue(status.yellowUntil.includes("INTEGRATION_PR_NOT_CANONICALLY_MERGED") && status.yellowUntil.includes("PRODUCTION_EXECUTION_NOT_AUTHORIZED"), "week3_status_blockers_missing");
  requireValue(fixture.contractVersion === "backyrd.week3-internal-prodlike-fixture@1.0" && fixture.syntheticOnly === true && fixture.productionData === false, "week3_fixture_boundary_invalid");
  requireValue(evidence.contractVersion === "backyrd.week3-rehearsal-evidence@1.0" && evidence.executionAuthorized === false && evidence.productionActionPerformed === false, "week3_rehearsal_evidence_invalid");
  requireValue(decisionEvidence.contractVersion === "backyrd.week3-decision-evidence@1.0" && decisionEvidence.executionAuthorized === false, "week3_decision_evidence_invalid");
  requireValue(postDeployEvidence.contractVersion === "backyrd.week3-post-deploy-evidence@1.0" && postDeployEvidence.status === "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY", "week3_post_deploy_status_invalid");
  requireValue(postDeployEvidence.executionAuthorized === false && postDeployEvidence.deploymentExecuted === false && postDeployEvidence.migrationExecuted === false && postDeployEvidence.activationExecuted === false, "week3_post_deploy_claim_invalid");
  requireValue(sharedArtifact.contractVersion === "backyrd.week3-shared-artifact-attestation@1.0", "week3_shared_artifact_contract_invalid");
  requireValue(sharedArtifact.artifactContract === "backyrd-decision-ci-build-artifact-v1" && HASH.test(sharedArtifact.artifactHash) && HASH.test(sharedArtifact.sourceSetHash), "week3_shared_artifact_invalid");
  requireValue(sharedArtifact.nodeMajor === 20 && Number.isInteger(sharedArtifact.fileCount) && sharedArtifact.fileCount > 0 && SHA.test(sharedArtifact.combinedCommitSha) && SHA.test(sharedArtifact.combinedTreeSha), "week3_shared_artifact_identity_invalid");
  requireValue(sharedArtifact.artifactHash === evidence.artifactHash && sharedArtifact.combinedCommitSha === evidence.combinedCommitSha && sharedArtifact.combinedTreeSha === evidence.combinedTreeSha, "week3_shared_artifact_evidence_mismatch");
  return { boundDomainCandidates: manifest.domainCandidates.length, rehearsalReady: evidence.status === "READY" && evidence.conflictCount === 0, releaseTrainStatus: status.overall };
}

export function verifyCandidateBindings(root, manifest) {
  for (const candidate of manifest.domainCandidates) {
    for (const binding of candidate.bindings) {
      const content = readFileSync(resolve(root, binding.materializedPath ?? binding.path), "utf8");
      if (binding.type === "TEXT_CONTAINS") requireValue(content.includes(binding.expected), `week3_binding_mismatch:${candidate.track}:${binding.name}`);
      else if (binding.type === "JSON_FIELD_EQUALS") requireValue(fieldValue(JSON.parse(content), binding.field) === binding.expected, `week3_binding_mismatch:${candidate.track}:${binding.name}`);
      else throw new Error(`week3_binding_type_unknown:${candidate.track}:${binding.name}`);
    }
  }
}

export function createInternalAllowlistEnvelope(input) {
  const body = {
    contractVersion: "backyrd.week3-internal-allowlist-envelope@1.0",
    subjectPseudonym: input.subjectPseudonym,
    purpose: input.purpose,
    environment: input.environment,
    releaseHash: input.releaseHash,
    requestId: input.requestId,
    requestHash: input.requestHash,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  };
  return Object.freeze({ ...body, envelopeHash: sha256(body) });
}

export function validateInternalAllowlistEnvelope(value, authority, now) {
  const keys = ["contractVersion", "subjectPseudonym", "purpose", "environment", "releaseHash", "requestId", "requestHash", "validFrom", "validUntil", "envelopeHash"];
  exactKeys(value, keys, "week3_allowlist_unknown_or_missing_field");
  requireValue(value.contractVersion === "backyrd.week3-internal-allowlist-envelope@1.0", "week3_allowlist_contract_unknown");
  requireValue(/^synthetic-internal:[a-z0-9-]{8,64}$/.test(value.subjectPseudonym), "week3_allowlist_subject_invalid");
  requireValue(value.purpose === PURPOSE && ENVIRONMENTS.includes(value.environment), "week3_allowlist_scope_mismatch");
  requireValue(HASH.test(value.releaseHash) && HASH.test(value.requestHash), "week3_allowlist_hash_invalid");
  requireValue(sha256(Object.fromEntries(keys.filter((key) => key !== "envelopeHash").map((key) => [key, value[key]]))) === value.envelopeHash, "week3_allowlist_envelope_tampered");
  requireValue(authority?.status === "SYNTHETIC_TEST_AUTHORITY", "week3_allowlist_not_configured");
  requireValue(authority.releaseHash === value.releaseHash, "week3_allowlist_release_mismatch");
  requireValue(authority.subjectPseudonym === value.subjectPseudonym && authority.purpose === value.purpose && authority.environment === value.environment, "week3_allowlist_authority_mismatch");
  const current = Date.parse(now); requireValue(Number.isFinite(current) && current >= Date.parse(value.validFrom) && current <= Date.parse(value.validUntil), "week3_allowlist_expired_or_not_current");
  return true;
}

export function resolveWeek3Controls(configuration = {}) {
  const unknownKeys = Object.keys(configuration).filter((key) => !CONFIG_KEYS.has(key)).sort();
  const enabled = unknownKeys.length === 0
    && configuration.environment === "PROD_LIKE_TEST"
    && configuration.internalTestOn === true
    && configuration.globalKillSwitch === "DISENGAGED"
    && configuration.WORLD_KILL_SWITCH === "DISENGAGED"
    && configuration.USER_KILL_SWITCH === "DISENGAGED"
    && configuration.DECISION_KILL_SWITCH === "DISENGAGED";
  return Object.freeze({ enabled, reason: enabled ? "SYNTHETIC_INTERNAL_TEST_READY" : unknownKeys.length ? "UNKNOWN_CONFIGURATION_DENIED" : "OFF_OR_KILL_SWITCH_ENGAGED", unknownKeys, executionAuthorized: false });
}

export function rehearseInternalProductLike({ fixture, configuration = {}, envelope, authority, emergencyAfterWorldRead = false }) {
  const state = resolveWeek3Controls(configuration);
  if (!state.enabled) return { state, phases: { off: { ...ZERO }, testOn: { ...ZERO }, emergencyOff: { ...ZERO } }, productOutput: null, persisted: false, recoveryMilliseconds: 0 };
  validateInternalAllowlistEnvelope(envelope, authority, fixture.now);
  const testOn = { ...ZERO, worldReads: 1, userProjections: 1, decisionEvaluations: 1 };
  if (emergencyAfterWorldRead) {
    const start = performance.now();
    const emergencyOff = { ...ZERO };
    return { state, phases: { off: { ...ZERO }, testOn: { ...testOn, userProjections: 0, decisionEvaluations: 0 }, emergencyOff }, aborted: true, productOutput: null, persisted: false, recoveryMilliseconds: Math.max(0, performance.now() - start) };
  }
  return { state, phases: { off: { ...ZERO }, testOn, emergencyOff: { ...ZERO } }, aborted: false, productOutput: null, persisted: false, recoveryMilliseconds: 0 };
}

export const WEEK3_CONSTANTS = Object.freeze({ purpose: PURPOSE, environments: ENVIRONMENTS, zeroCounters: ZERO, tracks: TRACKS });
