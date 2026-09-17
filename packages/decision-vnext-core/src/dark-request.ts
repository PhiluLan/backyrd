import { CONTRACT_VERSIONS as USER_VERSIONS } from "@backyrd/user-intelligence-vnext-core";
import { REGISTRY_HASH, REGISTRY_VERSION } from "@backyrd/world-knowledge-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { DARK_REQUEST_VERSIONS, DarkRequestAuthoritySchema, DarkRequestControlSchema, DarkRequestDisabledReceiptSchema, DarkRequestReportSchema, DarkRequestSourceTrustSchema, DarkRequestThresholdTemplateSchema, type DarkRequestAuthority, type DarkRequestDisabledReceipt, type DarkRequestReport } from "./dark-request-contracts.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE } from "./phase3c-lab.js";

export const DARK_REQUEST_CONTROL = deepFreeze(DarkRequestControlSchema.parse(withContentHash({
  contractVersion: DARK_REQUEST_VERSIONS.control, environmentVariable: "DECISION_VNEXT_SHADOW_TRAFFIC" as const,
  enabled: false as const, sampleRateBasisPoints: 0 as const, killSwitch: "ENGAGED" as const,
  executionAuthorized: false as const, persistenceAuthorized: false as const, networkAuthorized: false as const,
  productOutputAuthorized: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const,
  confidenceAuthorized: false as const, userLearningAuthorized: false as const,
}, "controlHash")));

export const DARK_REQUEST_THRESHOLD_TEMPLATE = deepFreeze(DarkRequestThresholdTemplateSchema.parse(withContentHash({
  contractVersion: DARK_REQUEST_VERSIONS.thresholdTemplate, decisionState: "DECISION_REQUIRED" as const,
  interpretationParityTarget: "NOT_CONFIGURED" as const, hardConstraintDeviationTarget: "NOT_CONFIGURED" as const,
  candidateTierDeviationTarget: "NOT_CONFIGURED" as const, falseConfirmationTarget: "NOT_CONFIGURED" as const,
  falseExclusionTarget: "NOT_CONFIGURED" as const, productQualityOracle: "NOT_CONFIGURED" as const,
  productionAuthorized: false as const,
}, "templateHash")));

const disabledReceipt = (reason: "DEFAULT_OFF"|"KILL_SWITCH_ENGAGED"|"ACTIVATION_NOT_AUTHORIZED"): DarkRequestDisabledReceipt => deepFreeze(DarkRequestDisabledReceiptSchema.parse(withContentHash({
  contractVersion: DARK_REQUEST_VERSIONS.disabledReceipt, status: "DISABLED" as const, reason, controlHash: DARK_REQUEST_CONTROL.controlHash,
  counters: { worldReads: 0 as const, userReads: 0 as const, evaluations: 0 as const, persistenceWrites: 0 as const, networkCalls: 0 as const, productOutputs: 0 as const },
}, "receiptHash")));

/** Public runtime entry point. Week 2 cannot be activated by caller data or environment configuration. */
export async function handleDarkDecisionRequest(_request: unknown, input: { readonly environmentValue?: string; readonly worldReader?: unknown; readonly userProjectionPort?: unknown } = {}): Promise<DarkRequestDisabledReceipt> {
  if (DARK_REQUEST_CONTROL.killSwitch === "ENGAGED") return disabledReceipt(input.environmentValue === "true" ? "ACTIVATION_NOT_AUTHORIZED" : "KILL_SWITCH_ENGAGED");
  return disabledReceipt("DEFAULT_OFF");
}

export function validateDarkRequestAuthority(value: unknown, trustValue: unknown): DarkRequestAuthority {
  const authority = DarkRequestAuthoritySchema.parse(value); const trust = DarkRequestSourceTrustSchema.parse(trustValue); assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash"); assertContentHash(trust as unknown as Record<string, unknown>, "trustHash");
  if (authority.world.portVersion !== "backyrd.world-knowledge.reader-port@1.0" || authority.world.registryVersion !== REGISTRY_VERSION || authority.world.registryHash !== REGISTRY_HASH) throw new Error("dark_request_world_binding_mismatch");
  if (authority.user.portVersion !== "backyrd.user-intelligence.decision-projection-port@1.0" || authority.user.projectionContractVersion !== USER_VERSIONS.projection) throw new Error("dark_request_user_binding_mismatch");
  if (authority.phase3CReleaseHash !== PHASE3C_FOUNDER_LAB_RELEASE.releaseHash || authority.phase3CPolicyHash !== PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash) throw new Error("dark_request_release_binding_mismatch");
  if (Date.parse(authority.validFrom) > Date.parse(authority.serverTime) || Date.parse(authority.validUntil) < Date.parse(authority.serverTime)) throw new Error("dark_request_authority_not_current");
  if (trust.acceptedAuthorityId !== authority.authorityId || trust.acceptedAuthorityHash !== authority.authorityHash || trust.acceptedSourceSha !== authority.sourceIdentity.sourceSha || trust.acceptedSourceTreeHash !== authority.sourceIdentity.sourceTreeHash || trust.acceptedArtifactIdentityHash !== authority.sourceIdentity.artifactIdentityHash) throw new Error("dark_request_source_identity_not_trusted");
  return authority;
}

export function validateDarkRequestReport(value: unknown, authorityValue: unknown, trustValue: unknown): DarkRequestReport {
  const authority = validateDarkRequestAuthority(authorityValue, trustValue); const report = DarkRequestReportSchema.parse(value);
  assertContentHash(report as unknown as Record<string, unknown>, "reportHash"); assertContentHash(report.metrics as unknown as Record<string, unknown>, "metricsHash");
  if (report.authorityHash !== authority.authorityHash || report.requestHash !== authority.requestHash || report.sourceCohortHash !== authority.world.cohortHash) throw new Error("dark_request_report_authority_mismatch");
  if (report.contextHash !== report.evaluationResult.interpretation.interpretationHash || report.userProjectionHash !== report.evaluationResult.userProjectionHash || report.candidateSetHash !== contentHash(report.evaluationResult.candidates.map((item) => item.candidateId))) throw new Error("dark_request_report_recursive_binding_mismatch");
  if (report.evaluationResult.productionAuthorized || report.evaluationResult.productRankingAuthorized || report.evaluationResult.writesUserIntelligence) throw new Error("dark_request_product_boundary_violation");
  return report;
}

export function replayDarkRequestReport(value: unknown, rebuilt: unknown, authority: unknown, trust: unknown): DarkRequestReport {
  const supplied = validateDarkRequestReport(value, authority, trust); const expected = validateDarkRequestReport(rebuilt, authority, trust);
  if (canonicalJson(supplied) !== canonicalJson(expected)) throw new Error("dark_request_replay_mismatch");
  return expected;
}
