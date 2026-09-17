import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const TRACKS = ["WORLD", "USER", "DECISION"];
const FLAG_IDS = [
  "WORLD_PRODUCT_READ",
  "USER_LEARNING_RUNTIME",
  "DECISION_VNEXT_SHADOW_TRAFFIC",
  "DECISION_VNEXT_PRODUCT_RANKING",
];
const CONFIG_KEYS = new Set([
  "environment",
  "globalKillSwitch",
  "WORLD_PRODUCT_READ",
  "WORLD_PRODUCT_READ_KILL_SWITCH",
  "USER_LEARNING_RUNTIME",
  "USER_LEARNING_KILL_SWITCH",
  "relevantUserProjectionTestPort",
  "DECISION_VNEXT_SHADOW_TRAFFIC",
  "DECISION_VNEXT_SHADOW_KILL_SWITCH",
  "DECISION_VNEXT_PRODUCT_RANKING",
  "DECISION_VNEXT_PRODUCT_KILL_SWITCH",
]);

const requireValue = (condition, reason) => {
  if (!condition) throw new Error(reason);
};

export function loadWeek2Documents(root) {
  const load = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return {
    manifest: load("delivery/integration/week2-dark-wiring-manifest.json"),
    matrix: load("delivery/integration/week2-dependency-ownership-compatibility-matrix.json"),
    flags: load("delivery/integration/week2-dark-wiring-flags.json"),
    status: load("delivery/integration/week2-daily-status.json"),
    fixture: load("delivery/integration/fixtures/week2-dark-wiring-synthetic.json"),
    evidence: load("delivery/integration/week2-dark-wiring-rehearsal-evidence.json"),
    decisionEvidence: load("delivery/integration/week2-decision-frozen-evidence.json"),
  };
}

export function validateWeek2Documents({ manifest, matrix, flags, status, fixture, evidence, decisionEvidence }) {
  requireValue(manifest.contractVersion === "backyrd.week2-dark-wiring-manifest@1.0", "week2_manifest_identity_mismatch");
  requireValue(manifest.canonicalBaseSha === "f999e2185d9102ea59a2c6e2c0861a4122af359b", "week2_canonical_base_mismatch");
  requireValue(manifest.executionAuthorized === false && manifest.productionActivationAuthorized === false, "week2_manifest_authority_must_be_false");
  requireValue(JSON.stringify(manifest.wiringChain) === JSON.stringify([
    "WORLD_PRODUCT_READ",
    "backyrd.user-intelligence.relevant-user-projection@1.0",
    "DECISION_VNEXT_SHADOW_TRAFFIC",
  ]), "week2_wiring_chain_mismatch");
  requireValue(JSON.stringify(manifest.domainCandidates.map(({ track }) => track)) === JSON.stringify(TRACKS), "week2_domain_track_order_mismatch");

  for (const candidate of manifest.domainCandidates) {
    const identity = [candidate.pr, candidate.baseSha, candidate.headSha, candidate.treeSha, candidate.domainArtifactHash, candidate.planHash];
    const populated = identity.filter((value) => value !== null).length;
    requireValue(populated === 0 || populated === identity.length, `week2_domain_candidate_partially_bound:${candidate.track}`);
    if (populated) {
      requireValue(candidate.status === "READY", `week2_domain_candidate_not_ready:${candidate.track}`);
      requireValue(Number.isInteger(candidate.pr) && candidate.pr > 0, `week2_domain_pr_invalid:${candidate.track}`);
      requireValue(candidate.baseSha === manifest.canonicalBaseSha && SHA.test(candidate.headSha) && SHA.test(candidate.treeSha), `week2_domain_git_identity_invalid:${candidate.track}`);
      requireValue(HASH.test(candidate.domainArtifactHash) && HASH.test(candidate.planHash), `week2_domain_hash_invalid:${candidate.track}`);
      requireValue(Array.isArray(candidate.bindings) && candidate.bindings.length > 0, `week2_domain_bindings_missing:${candidate.track}`);
      const bindingNames = candidate.bindings.map(({ name }) => name);
      requireValue(new Set(bindingNames).size === bindingNames.length && candidate.bindings.every(({ name, type, path, expected }) => name && ["TEXT_CONTAINS", "JSON_FIELD_EQUALS"].includes(type) && path && expected), `week2_domain_binding_shape_invalid:${candidate.track}`);
    } else {
      requireValue(candidate.status === "AWAITING_DOMAIN_PR" && Array.isArray(candidate.bindings) && candidate.bindings.length === 0, `week2_domain_awaiting_state_invalid:${candidate.track}`);
    }
  }
  const user = manifest.domainCandidates.find(({ track }) => track === "USER");
  for (const name of ["USER_HANDOFF_HASH", "USER_NO_WRITE_PROOF_HASH"]) requireValue(user.bindings.some((binding) => binding.name === name), `week2_user_binding_missing:${name}`);
  const decision = manifest.domainCandidates.find(({ track }) => track === "DECISION");
  const requiredDecisionBindings = ["DECISION_REPORT_HASH", "DECISION_RESULT_HASH", "DECISION_CONTROL_HASH", "DECISION_AUTHORITY_HASH", "DECISION_SOURCE_TRUST_HASH"];
  requireValue(decision.evidence?.path === "delivery/integration/week2-decision-frozen-evidence.json" && HASH.test(decision.evidence.fileHash) && decision.evidence.contractVersion === decisionEvidence.contractVersion, "week2_decision_evidence_identity_invalid");
  requireValue(decisionEvidence.sourceSha === decision.headSha && decisionEvidence.sourceTreeHash === decision.treeSha, "week2_decision_evidence_source_invalid");
  for (const name of requiredDecisionBindings) requireValue(decision.evidence.bindings.some((binding) => binding.name === name), `week2_decision_binding_missing:${name}`);
  for (const binding of decision.evidence.bindings) {
    requireValue(binding.name && Array.isArray(binding.fields) && binding.fields.length > 0 && HASH.test(binding.expected), `week2_decision_binding_shape_invalid:${binding.name ?? "unknown"}`);
    for (const field of binding.fields) requireValue(decisionEvidence[field] === binding.expected, `week2_decision_evidence_binding_mismatch:${binding.name}:${field}`);
  }
  requireValue(manifest.productionPlan.expectedPendingMigrationCount === 9 && manifest.productionPlan.pendingMigrationClass === "WORLD_INHERITED", "week2_migration_expectation_mismatch");
  requireValue(manifest.productionPlan.executionAuthorized === false && manifest.productionPlan.authDeploy === false && manifest.productionPlan.expectedDeployFunctions.length === 0, "week2_production_plan_scope_invalid");

  requireValue(matrix.contractVersion === "backyrd.week2-dependency-ownership-compatibility-matrix@1.0" && matrix.executionAuthorized === false, "week2_matrix_identity_or_authority_invalid");
  requireValue(JSON.stringify(matrix.dependencyChain.map(({ owner }) => owner)) === JSON.stringify(TRACKS), "week2_dependency_chain_owner_order_invalid");
  requireValue(JSON.stringify(matrix.dependencyChain.map(({ order }) => order)) === JSON.stringify([1, 2, 3]), "week2_dependency_chain_order_invalid");
  requireValue(matrix.tracks.map(({ id }) => id).join(",") === "WORLD,USER,DECISION,INTEGRATION", "week2_ownership_tracks_invalid");
  for (const track of matrix.tracks) requireValue(track.authority.length > 0 && track.forbidden.length > 0 && track.compatibility.length > 0, `week2_ownership_track_incomplete:${track.id}`);
  requireValue(matrix.supabaseCompatibility.postgresMajor === 17, "week2_postgres_major_mismatch");
  requireValue(matrix.supabaseCompatibility.dataApi === "EXPLICIT_GRANTS_PLUS_RLS", "week2_data_api_contract_invalid");
  requireValue(matrix.supabaseCompatibility.extensionVersionPinningAllowed === false && matrix.supabaseCompatibility.logsAllDependencyAllowed === false, "week2_supabase_deprecation_contract_invalid");

  requireValue(flags.contractVersion === "backyrd.week2-dark-wiring-flags@1.0" && flags.executionAuthorized === false, "week2_flags_identity_or_authority_invalid");
  requireValue(flags.missingConfigurationBehavior === "OFF" && flags.unknownConfigurationBehavior === "OFF_AND_REJECT_ACTIVATION", "week2_flags_not_fail_closed");
  requireValue(flags.globalKillSwitch.default === "ENGAGED", "week2_global_kill_switch_not_engaged");
  requireValue(JSON.stringify(flags.flags.map(({ id }) => id)) === JSON.stringify(FLAG_IDS), "week2_flag_set_mismatch");
  for (const flag of flags.flags) requireValue(flag.default === false && ["ENGAGED", "FORCED_OFF"].includes(flag.killSwitchDefault), `week2_flag_not_off:${flag.id}`);
  requireValue(Object.values(flags.offInvariant).every((value) => value === 0), "week2_off_invariant_nonzero");

  requireValue(status.contractVersion === "backyrd.week2-daily-integration-status@1.0" && status.executionAuthorized === false, "week2_status_identity_or_authority_invalid");
  requireValue(status.overall === "YELLOW", "week2_release_train_status_must_remain_yellow");
  requireValue(status.yellowUntil?.includes("DOMAIN_PRS_NOT_CANONICALLY_MERGED"), "week2_status_domain_merge_blocker_missing");
  requireValue(status.yellowUntil?.includes("PRODUCTION_EXECUTION_NOT_SEPARATELY_AUTHORIZED"), "week2_status_production_authority_blocker_missing");
  requireValue(status.tracks.map(({ id }) => id).join(",") === "WORLD,USER,DECISION,INTEGRATION", "week2_status_tracks_invalid");
  for (const track of status.tracks) requireValue(["GREEN", "YELLOW", "RED"].includes(track.status) && Boolean(track.reason), `week2_status_track_invalid:${track.id}`);

  requireValue(fixture.contractVersion === "backyrd.week2-dark-wiring-fixture@1.0" && fixture.syntheticOnly === true && fixture.productionData === false, "week2_fixture_boundary_invalid");
  requireValue(Object.values(fixture.expectedOffCounters).every((value) => value === 0), "week2_fixture_off_counters_nonzero");
  for (const key of ["writes", "networkCalls", "productOutputs"]) requireValue(fixture.expectedTestOnCounters[key] === 0, `week2_fixture_side_effect_nonzero:${key}`);

  requireValue(evidence.contractVersion === manifest.rehearsal.evidenceContract && evidence.executionAuthorized === false && evidence.productionActionPerformed === false, "week2_rehearsal_evidence_identity_or_authority_invalid");
  requireValue(evidence.baseSha === manifest.canonicalBaseSha && JSON.stringify(evidence.mergeSequence) === JSON.stringify(manifest.mergeSequence), "week2_rehearsal_evidence_lineage_invalid");
  const rehearsalReady = evidence.status === "READY"
    && SHA.test(evidence.integrationHeadSha ?? "")
    && SHA.test(evidence.combinedTreeSha ?? "")
    && HASH.test(evidence.sharedArtifactHash ?? "")
    && evidence.conflictCount === 0;

  return {
    boundDomainCandidates: manifest.domainCandidates.filter(({ headSha }) => headSha).length,
    rehearsalReady,
    releaseTrainStatus: status.overall,
  };
}

export function resolveWeek2DarkWiring(configuration = {}) {
  const unknownKeys = Object.keys(configuration).filter((key) => !CONFIG_KEYS.has(key)).sort();
  const validEnvironment = ["LOCAL_SYNTHETIC_TEST", "PROD_LIKE_SYNTHETIC_TEST"].includes(configuration.environment);
  const booleansValid = [
    "WORLD_PRODUCT_READ",
    "USER_LEARNING_RUNTIME",
    "relevantUserProjectionTestPort",
    "DECISION_VNEXT_SHADOW_TRAFFIC",
    "DECISION_VNEXT_PRODUCT_RANKING",
  ].every((key) => configuration[key] === undefined || typeof configuration[key] === "boolean");
  const killSwitchesValid = (configuration.globalKillSwitch === undefined || ["ENGAGED", "DISENGAGED"].includes(configuration.globalKillSwitch))
    && (configuration.WORLD_PRODUCT_READ_KILL_SWITCH === undefined || ["ENGAGED", "DISENGAGED"].includes(configuration.WORLD_PRODUCT_READ_KILL_SWITCH))
    && (configuration.USER_LEARNING_KILL_SWITCH === undefined || configuration.USER_LEARNING_KILL_SWITCH === "FORCED_OFF")
    && (configuration.DECISION_VNEXT_SHADOW_KILL_SWITCH === undefined || ["ENGAGED", "DISENGAGED"].includes(configuration.DECISION_VNEXT_SHADOW_KILL_SWITCH))
    && (configuration.DECISION_VNEXT_PRODUCT_KILL_SWITCH === undefined || ["ENGAGED", "DISENGAGED"].includes(configuration.DECISION_VNEXT_PRODUCT_KILL_SWITCH));
  const valid = unknownKeys.length === 0 && booleansValid && killSwitchesValid;
  const globalReady = valid && validEnvironment && configuration.globalKillSwitch === "DISENGAGED";
  const worldReady = globalReady
    && configuration.WORLD_PRODUCT_READ === true
    && configuration.WORLD_PRODUCT_READ_KILL_SWITCH === "DISENGAGED";
  const userReady = worldReady
    && configuration.USER_LEARNING_RUNTIME === false
    && configuration.USER_LEARNING_KILL_SWITCH === "FORCED_OFF"
    && configuration.relevantUserProjectionTestPort === true;
  const decisionReady = userReady
    && configuration.DECISION_VNEXT_SHADOW_TRAFFIC === true
    && configuration.DECISION_VNEXT_SHADOW_KILL_SWITCH === "DISENGAGED"
    && configuration.DECISION_VNEXT_PRODUCT_RANKING === false
    && configuration.DECISION_VNEXT_PRODUCT_KILL_SWITCH !== "DISENGAGED";
  return Object.freeze({
    enabled: decisionReady,
    reason: !valid ? "UNKNOWN_OR_INVALID_CONFIGURATION"
      : !validEnvironment ? "ENVIRONMENT_OFF"
        : !globalReady ? "GLOBAL_KILL_SWITCH_ENGAGED"
          : !worldReady ? "WORLD_NOT_READY"
            : !userReady ? "USER_PORT_NOT_READY"
              : !decisionReady ? "DECISION_NOT_READY"
                : "LOCAL_READ_ONLY_CHAIN_READY",
    environment: validEnvironment ? configuration.environment : null,
    unknownKeys,
    worldReady,
    userReady,
    decisionReady,
    executionAuthorized: false,
  });
}

export function runWeek2ContractRehearsal({ fixture, configuration = {} }) {
  const state = resolveWeek2DarkWiring(configuration);
  const offCounters = { ...fixture.expectedOffCounters };
  if (!state.enabled) return { state, counters: offCounters, productOutput: null, persisted: false };
  const counters = {
    queries: 0,
    ingestion: 0,
    evaluations: 1,
    worldReads: 1,
    projectionBuilds: 1,
    shadowEvaluations: 1,
    writes: 0,
    networkCalls: 0,
    productOutputs: 0,
  };
  return { state, counters, productOutput: null, persisted: false };
}
