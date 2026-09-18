import { createHash } from "node:crypto";
import { buildFounderLiveEdgeImplementationEvidence } from "./founder-live-edge-implementation-evidence.mjs";

const HASH = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const EXPECTED_FUNCTION = "decision-founder-live";
const EXPECTED_EVIDENCE_KEYS = Object.freeze([
  "artifactHash",
  "contractVersion",
  "corsPolicy",
  "defaultState",
  "deployFunctions",
  "deploymentAuthorized",
  "edgeBoundaryVersion",
  "evidenceHash",
  "executionAuthorized",
  "functionsDeployed",
  "idempotencyPort",
  "killSwitch",
  "migrationsExecuted",
  "productionPlanHash",
  "productionQueries",
  "rateLimitPort",
  "runtimeActivations",
  "runtimeAuthority",
  "sourceSetHash",
  "sourceSha",
  "sourceTreeSha",
  "userPort",
  "verifyJwt",
  "worldPort",
]);

const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };

export function validateSourceAwareInactiveFounderLiveScope({ productionPlan, evidence = null, headSha, treeSha }) {
  requireValue(productionPlan && Array.isArray(productionPlan.deployFunctions), "founder_live_production_plan_missing");
  requireValue(productionPlan.authConfig?.deploy === false, "founder_live_auth_deploy_forbidden");
  requireValue(productionPlan.executionAuthorized !== true, "founder_live_execution_authority_forbidden");
  requireValue(productionPlan.runtimeActivation !== true, "founder_live_runtime_activation_forbidden");

  if (productionPlan.deployFunctions.length === 0) {
    requireValue(evidence === null, "founder_live_evidence_without_function_scope");
    return [];
  }

  requireValue(JSON.stringify(productionPlan.deployFunctions) === JSON.stringify([EXPECTED_FUNCTION]), "founder_live_function_scope_invalid");
  requireValue(evidence !== null && typeof evidence === "object" && !Array.isArray(evidence), "founder_live_edge_evidence_missing");
  requireValue(JSON.stringify(Object.keys(evidence).sort()) === JSON.stringify([...EXPECTED_EVIDENCE_KEYS].sort()), "founder_live_edge_evidence_shape_invalid");
  requireValue(SHA.test(headSha) && SHA.test(treeSha), "founder_live_source_identity_invalid");
  requireValue(evidence.contractVersion === "backyrd.founder-live-edge-implementation-evidence@1.0", "founder_live_edge_evidence_version_invalid");
  requireValue(evidence.sourceSha === headSha && evidence.sourceTreeSha === treeSha, "founder_live_edge_source_binding_mismatch");
  requireValue(evidence.productionPlanHash === productionPlan.planHash, "founder_live_edge_plan_binding_mismatch");
  requireValue(JSON.stringify(evidence.deployFunctions) === JSON.stringify([EXPECTED_FUNCTION]), "founder_live_edge_function_binding_mismatch");
  requireValue(HASH.test(evidence.sourceSetHash) && HASH.test(evidence.artifactHash), "founder_live_edge_artifact_identity_invalid");
  requireValue(evidence.edgeBoundaryVersion === "backyrd.decision-vnext.founder-live-edge-boundary@1.0", "founder_live_edge_boundary_version_invalid");
  requireValue(evidence.verifyJwt === true && evidence.corsPolicy === "EXACT_SERVER_CONFIGURED_ORIGIN_ALLOWLIST", "founder_live_edge_request_boundary_invalid");
  requireValue(evidence.runtimeAuthority === "NOT_AUTHORIZED", "founder_live_runtime_authority_open");
  requireValue(evidence.defaultState === "OFF" && evidence.killSwitch === "ENGAGED_BY_ABSENT_RUNTIME_AUTHORITY", "founder_live_default_or_kill_switch_open");
  requireValue(evidence.worldPort === "CANONICAL_WORLD_READER_ONLY" && evidence.userPort === "CANONICAL_RELEVANT_USER_PROJECTION_ONLY", "founder_live_canonical_port_binding_invalid");
  requireValue(evidence.idempotencyPort === "DURABLE_RPC_ONLY" && evidence.rateLimitPort === "GATE_7_DURABLE_RPC_ONLY", "founder_live_durable_boundary_invalid");
  requireValue(evidence.deploymentAuthorized === false && evidence.executionAuthorized === false, "founder_live_authority_open");
  for (const field of ["productionQueries", "migrationsExecuted", "functionsDeployed", "runtimeActivations"]) {
    requireValue(evidence[field] === 0, `founder_live_nonzero_production_action:${field}`);
  }
  const evidenceBody = { ...evidence };
  delete evidenceBody.evidenceHash;
  requireValue(evidence.evidenceHash === sha256(evidenceBody), "founder_live_edge_evidence_hash_mismatch");

  return [{
    functionName: EXPECTED_FUNCTION,
    relationship: "SEPARATELY_VALIDATED_INACTIVE_DECISION_SOURCE",
    evidenceHash: evidence.evidenceHash,
    sourceSetHash: evidence.sourceSetHash,
    artifactHash: evidence.artifactHash,
    defaultState: "OFF",
    killSwitch: "ENGAGED",
    runtimeAuthority: "NOT_AUTHORIZED",
    deploymentAuthorized: false,
    executionAuthorized: false,
  }];
}

export function verifySourceAwareInactiveFounderLiveScope({ root, productionPlan, headSha, treeSha }) {
  const evidence = productionPlan.deployFunctions.length === 0
    ? null
    : buildFounderLiveEdgeImplementationEvidence({ root, source: headSha });
  return {
    evidence,
    runtimeScopes: validateSourceAwareInactiveFounderLiveScope({ productionPlan, evidence, headSha, treeSha }),
  };
}
