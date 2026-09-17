import { CONTRACT_VERSIONS as USER_VERSIONS, DARK_PROJECTION_RUNTIME_RELEASE } from "@backyrd/user-intelligence-vnext-core";
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION, WORLD_DARK_READER_CONTRACT_VERSION } from "@backyrd/world-knowledge-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import {
  INTERNAL_DARK_SHADOW_VERSIONS, InternalDarkAbortedReceiptSchema, InternalDarkAllowlistSchema,
  InternalDarkArtifactTrustSchema, InternalDarkControlSchema, InternalDarkDisabledReceiptSchema,
  InternalDarkEnvelopeSchema, InternalDarkPostDeployEvidenceSchema, InternalDarkReleaseSchema,
  InternalDarkReportSchema, type InternalDarkAbortedReceipt, type InternalDarkArtifactTrust,
  type InternalDarkDisabledReceipt, type InternalDarkEnvelope, type InternalDarkPostDeployEvidence,
  type InternalDarkReport,
} from "./internal-dark-shadow-contracts.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE } from "./phase3c-lab.js";

export const INTERNAL_DARK_CONTROL = deepFreeze(InternalDarkControlSchema.parse(withContentHash({
  contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.control, flag: "DECISION_VNEXT_INTERNAL_DARK_SHADOW" as const,
  enabled: false as const, sampleRateBasisPoints: 0 as const, killSwitch: "ENGAGED" as const,
  executionAuthorized: false as const, persistenceAuthorized: false as const, networkAuthorized: false as const,
  productOutputAuthorized: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const,
  confidenceAuthorized: false as const, learningAuthorized: false as const, mutationAuthorized: false as const,
}, "controlHash")));

export const INTERNAL_DARK_SUBJECT_BINDING_HASH = contentHash("backyrd-internal-dark-shadow-test-subject-week3-1");

export const INTERNAL_DARK_ALLOWLIST = deepFreeze(InternalDarkAllowlistSchema.parse(withContentHash({
  contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.allowlist, allowlistId: "decision-week3-internal-dark-allowlist-1",
  subjectBindings: [INTERNAL_DARK_SUBJECT_BINDING_HASH], purposes: ["INTERNAL_DECISION_DARK_EVALUATION" as const],
  environments: ["LOCAL_SYNTHETIC" as const, "PROD_LIKE_TEST" as const], syntheticOnly: true as const,
  productionAuthorized: false as const, validFrom: "2026-09-17T00:00:00.000Z", validUntil: "2027-09-17T00:00:00.000Z",
}, "allowlistHash")));

export const INTERNAL_WORLD_READER_RELEASE_HASH = contentHash({
  contractVersion: WORLD_DARK_READER_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH,
  sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash,
  readOnly: true, decisionSemantics: "NONE", userSemantics: "NONE", productionAuthorized: false,
});

export const INTERNAL_DARK_RELEASE = deepFreeze(InternalDarkReleaseSchema.parse(withContentHash({
  contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.release, releaseId: "decision-week3-internal-dark-shadow-1",
  controlHash: INTERNAL_DARK_CONTROL.controlHash, allowlistHash: INTERNAL_DARK_ALLOWLIST.allowlistHash,
  worldReaderReleaseHash: INTERNAL_WORLD_READER_RELEASE_HASH, userProjectionReleaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash,
  phase3CReleaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash, phase3CPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash,
  testOnAvailable: true as const, productionAuthorized: false as const, productOutputAuthorized: false as const,
}, "releaseHash")));

const zeroCounters = { worldReads: 0 as const, userReads: 0 as const, evaluations: 0 as const, persistenceWrites: 0 as const, networkCalls: 0 as const, productOutputs: 0 as const, mutations: 0 as const };

function disabled(reason: "DEFAULT_OFF" | "KILL_SWITCH_ENGAGED" | "ACTIVATION_NOT_AUTHORIZED"): InternalDarkDisabledReceipt {
  return deepFreeze(InternalDarkDisabledReceiptSchema.parse(withContentHash({ contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.disabled, status: "DISABLED" as const, reason, controlHash: INTERNAL_DARK_CONTROL.controlHash, counters: zeroCounters }, "receiptHash")));
}

/** Public runtime entry point. Week 3 has no callable Product or Production activation path. */
export async function handleInternalDarkShadowRequest(_request: unknown, input: { readonly requestedMode?: string; readonly worldReader?: unknown; readonly userProjectionPort?: unknown } = {}): Promise<InternalDarkDisabledReceipt> {
  if (INTERNAL_DARK_CONTROL.killSwitch === "ENGAGED") return disabled(input.requestedMode === "TEST_ON" ? "ACTIVATION_NOT_AUTHORIZED" : "KILL_SWITCH_ENGAGED");
  return disabled("DEFAULT_OFF");
}

export function validateInternalDarkEnvelope(value: unknown, trustValue: unknown): InternalDarkEnvelope {
  const envelope = InternalDarkEnvelopeSchema.parse(value); const trust = InternalDarkArtifactTrustSchema.parse(trustValue);
  assertContentHash(envelope as unknown as Record<string, unknown>, "envelopeHash"); assertContentHash(trust as unknown as Record<string, unknown>, "trustHash");
  if (envelope.authority.allowlistHash !== INTERNAL_DARK_ALLOWLIST.allowlistHash || !INTERNAL_DARK_ALLOWLIST.subjectBindings.includes(envelope.actor.subjectBindingHash) || !INTERNAL_DARK_ALLOWLIST.purposes.includes(envelope.purpose) || !INTERNAL_DARK_ALLOWLIST.environments.includes(envelope.environment)) throw new Error("internal_dark_allowlist_mismatch");
  if (Date.parse(envelope.authority.serverTime) < Date.parse(INTERNAL_DARK_ALLOWLIST.validFrom) || Date.parse(envelope.authority.serverTime) > Date.parse(INTERNAL_DARK_ALLOWLIST.validUntil) || Date.parse(envelope.validFrom) > Date.parse(envelope.authority.serverTime) || Date.parse(envelope.validUntil) < Date.parse(envelope.authority.serverTime)) throw new Error("internal_dark_authority_not_current");
  if (contentHash(envelope.request) !== envelope.requestHash || envelope.request.requestId.length === 0) throw new Error("internal_dark_request_binding_mismatch");
  const candidateIds = [...envelope.candidates.candidateIds].sort();
  if (new Set(candidateIds).size !== candidateIds.length || canonicalJson(candidateIds) !== canonicalJson(envelope.candidates.candidateIds) || contentHash(candidateIds) !== envelope.candidates.candidateSetHash) throw new Error("internal_dark_candidate_set_mismatch");
  if (envelope.world.readerContractVersion !== WORLD_DARK_READER_CONTRACT_VERSION || envelope.world.readerReleaseHash !== INTERNAL_WORLD_READER_RELEASE_HASH || envelope.world.registryVersion !== REGISTRY_VERSION || envelope.world.registryHash !== REGISTRY_HASH || envelope.world.sourcePolicyVersion !== ACCEPTED_SOURCE_POLICY.policyVersion || envelope.world.sourcePolicyHash !== ACCEPTED_SOURCE_POLICY.policyHash) throw new Error("internal_dark_world_release_mismatch");
  if (envelope.user.projectionPortVersion !== "backyrd.user-intelligence.decision-projection-port@1.0" || envelope.user.projectionContractVersion !== USER_VERSIONS.projection || envelope.user.projectionReleaseHash !== DARK_PROJECTION_RUNTIME_RELEASE.releaseHash) throw new Error("internal_dark_user_release_mismatch");
  if (envelope.context.phase3CReleaseHash !== PHASE3C_FOUNDER_LAB_RELEASE.releaseHash || envelope.context.phase3CPolicyHash !== PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash) throw new Error("internal_dark_phase3c_release_mismatch");
  const expectedArtifactHash = contentHash({ sourceSha: envelope.source.sourceSha, sourceTreeHash: envelope.source.sourceTreeHash, releaseHash: INTERNAL_DARK_RELEASE.releaseHash, requestHash: envelope.requestHash, candidateSetHash: envelope.candidates.candidateSetHash });
  if (envelope.source.artifactHash !== expectedArtifactHash) throw new Error("internal_dark_artifact_identity_mismatch");
  if (trust.acceptedEnvelopeId !== envelope.envelopeId || trust.acceptedEnvelopeHash !== envelope.envelopeHash || trust.acceptedSourceSha !== envelope.source.sourceSha || trust.acceptedSourceTreeHash !== envelope.source.sourceTreeHash || trust.acceptedArtifactHash !== envelope.source.artifactHash || trust.acceptedAllowlistHash !== INTERNAL_DARK_ALLOWLIST.allowlistHash) throw new Error("internal_dark_artifact_not_trusted");
  return envelope;
}

export function validateInternalDarkReport(value: unknown, envelopeValue: unknown, trustValue: unknown): InternalDarkReport {
  const envelope = validateInternalDarkEnvelope(envelopeValue, trustValue); const report = InternalDarkReportSchema.parse(value);
  assertContentHash(report as unknown as Record<string, unknown>, "reportHash"); assertContentHash(report.metrics as unknown as Record<string, unknown>, "metricsHash");
  if (report.envelopeHash !== envelope.envelopeHash || report.allowlistHash !== INTERNAL_DARK_ALLOWLIST.allowlistHash || report.referenceReportHash !== envelope.referenceReportHash || report.candidateSetHash !== envelope.candidates.candidateSetHash) throw new Error("internal_dark_report_envelope_mismatch");
  const ids = report.candidateSummaries.map((item) => item.candidateId).sort();
  if (new Set(ids).size !== ids.length || canonicalJson(ids) !== canonicalJson(envelope.candidates.candidateIds)) throw new Error("internal_dark_report_candidate_mismatch");
  for (const item of report.candidateSummaries) assertContentHash(item as unknown as Record<string, unknown>, "summaryHash");
  if (report.counters.worldReads !== envelope.candidates.candidateIds.length || report.counters.userReads !== 1 || report.counters.evaluations !== 1) throw new Error("internal_dark_minimized_read_count_mismatch");
  return report;
}

export function replayInternalDarkReport(supplied: unknown, rebuilt: unknown, envelope: unknown, trust: unknown): InternalDarkReport {
  const parsed = validateInternalDarkReport(supplied, envelope, trust); const expected = validateInternalDarkReport(rebuilt, envelope, trust);
  if (canonicalJson(parsed) !== canonicalJson(expected)) throw new Error("internal_dark_replay_mismatch");
  return expected;
}

export function validateInternalDarkAbortedReceipt(value: unknown, envelopeValue: unknown, trustValue: unknown): InternalDarkAbortedReceipt {
  const envelope = validateInternalDarkEnvelope(envelopeValue, trustValue); const receipt = InternalDarkAbortedReceiptSchema.parse(value);
  assertContentHash(receipt as unknown as Record<string, unknown>, "receiptHash");
  if (receipt.envelopeHash !== envelope.envelopeHash || receipt.counters.evaluations !== 0 || receipt.counters.persistenceWrites !== 0 || receipt.counters.networkCalls !== 0 || receipt.counters.productOutputs !== 0 || receipt.counters.mutations !== 0) throw new Error("internal_dark_abort_boundary_violation");
  return receipt;
}

export function createInternalDarkPostDeployEvidence(input: { readonly envelope: unknown; readonly trust: unknown; readonly report: unknown; readonly productionPlanHash: string }): InternalDarkPostDeployEvidence {
  const envelope = validateInternalDarkEnvelope(input.envelope, input.trust); const report = validateInternalDarkReport(input.report, envelope, input.trust);
  return deepFreeze(InternalDarkPostDeployEvidenceSchema.parse(withContentHash({
    contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.postDeployEvidence, evidenceId: `week3-no-deploy-${envelope.envelopeId}`,
    status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" as const, releaseHash: INTERNAL_DARK_RELEASE.releaseHash,
    controlHash: INTERNAL_DARK_CONTROL.controlHash, envelopeHash: envelope.envelopeHash, reportHash: report.reportHash,
    sourceSha: envelope.source.sourceSha, sourceTreeHash: envelope.source.sourceTreeHash, artifactHash: envelope.source.artifactHash,
    productionPlanHash: input.productionPlanHash, executionAuthorized: false as const, deploymentExecuted: false as const,
    migrationExecuted: false as const, shadowTrafficActivated: false as const,
  }, "evidenceHash")));
}
