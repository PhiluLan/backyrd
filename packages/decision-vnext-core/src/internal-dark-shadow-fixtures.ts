/** Local/CI-only Week-3 orchestration. Deliberately absent from the public package index. */
import { type DecisionVNextUserProjectionPort } from "@backyrd/user-intelligence-vnext-core";
import { type FounderWorldCohortManifest, type WorldDarkReader } from "@backyrd/world-knowledge-core";
import { canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { type DarkRequestAuthority, type DarkRequestReport, type DarkRequestSourceTrust } from "./dark-request-contracts.js";
import { provisionLocalDarkRequestAuthority, runLocalDarkRequestRehearsal } from "./dark-request-fixtures.js";
import { validateDarkRequestReport } from "./dark-request.js";
import {
  INTERNAL_DARK_SHADOW_VERSIONS, InternalDarkAbortedReceiptSchema, InternalDarkArtifactTrustSchema,
  InternalDarkEnvelopeSchema, InternalDarkMetricsSchema, InternalDarkReportSchema,
  type InternalDarkAbortedReceipt, type InternalDarkArtifactTrust, type InternalDarkEnvelope, type InternalDarkReport,
} from "./internal-dark-shadow-contracts.js";
import {
  INTERNAL_DARK_ALLOWLIST, INTERNAL_DARK_RELEASE, INTERNAL_DARK_SUBJECT_BINDING_HASH,
  INTERNAL_WORLD_READER_RELEASE_HASH, replayInternalDarkReport, validateInternalDarkEnvelope,
  validateInternalDarkReport,
} from "./internal-dark-shadow.js";
import { PHASE3C_LAB_VERSIONS, FounderLabRequestSchema, type FounderLabRequest } from "./phase3c-lab-contracts.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE } from "./phase3c-lab.js";

const LOCAL_CAPABILITY = Symbol("backyrd.internal-dark-shadow.local-test-on");
type LocalCapability = { readonly [LOCAL_CAPABILITY]: true };
const capability = (): LocalCapability => Object.freeze({ [LOCAL_CAPABILITY]: true as const });
const ABORT_ERROR = "internal_dark_emergency_off";

export interface LocalInternalDarkController {
  readonly state: "OFF" | "TEST_ON" | "EMERGENCY_OFF";
  enableTestOn(token: LocalCapability): void;
  emergencyOff(): void;
  begin(token: LocalCapability): Readonly<{ generation: number }>;
  assertActive(ticket: Readonly<{ generation: number }>): void;
}

export function createLocalInternalDarkController(): LocalInternalDarkController {
  let state: "OFF" | "TEST_ON" | "EMERGENCY_OFF" = "OFF"; let generation = 0;
  return {
    get state() { return state; },
    enableTestOn(token) { if (token[LOCAL_CAPABILITY] !== true || state !== "OFF") throw new Error("internal_dark_test_on_not_authorized"); state = "TEST_ON"; generation += 1; },
    emergencyOff() { state = "EMERGENCY_OFF"; generation += 1; },
    begin(token) { if (token[LOCAL_CAPABILITY] !== true || state !== "TEST_ON") throw new Error("internal_dark_test_on_not_authorized"); return Object.freeze({ generation }); },
    assertActive(ticket) { if (state !== "TEST_ON" || ticket.generation !== generation) throw new Error(ABORT_ERROR); },
  };
}

export const enableLocalInternalDarkTestOn = (controller: LocalInternalDarkController): void => controller.enableTestOn(capability());

type ReferenceBinding = Readonly<{ report: DarkRequestReport; authority: DarkRequestAuthority; sourceTrust: DarkRequestSourceTrust }>;

export function provisionLocalInternalDarkEnvelope(input: {
  readonly request: FounderLabRequest; readonly city: string; readonly environment: "LOCAL_SYNTHETIC" | "PROD_LIKE_TEST";
  readonly manifest: FounderWorldCohortManifest; readonly worldDarkReader: WorldDarkReader; readonly reference: ReferenceBinding;
  readonly sourceSha: string; readonly sourceTreeHash: string; readonly serverTime?: string;
}): { readonly envelope: InternalDarkEnvelope; readonly artifactTrust: InternalDarkArtifactTrust } {
  const request = FounderLabRequestSchema.parse(input.request); const reference = validateDarkRequestReport(input.reference.report, input.reference.authority, input.reference.sourceTrust);
  if (!input.worldDarkReader.state.enabled || input.worldDarkReader.state.environment !== (input.environment === "LOCAL_SYNTHETIC" ? "LOCAL_TEST" : "PROD_LIKE_TEST")) throw new Error("internal_dark_world_reader_environment_mismatch");
  const candidateIds = input.manifest.spots.map((item) => item.spotId).sort(); const requestHash = contentHash(request);
  const source = { sourceSha: input.sourceSha, sourceTreeHash: input.sourceTreeHash, artifactHash: contentHash({ sourceSha: input.sourceSha, sourceTreeHash: input.sourceTreeHash, releaseHash: INTERNAL_DARK_RELEASE.releaseHash, requestHash, candidateSetHash: contentHash(candidateIds) }) };
  const serverTime = input.serverTime ?? "2026-09-17T12:00:00.000Z";
  const envelope = deepFreeze(InternalDarkEnvelopeSchema.parse(withContentHash({
    contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.envelope, envelopeId: `week3-envelope-${request.requestId}`,
    purpose: "INTERNAL_DECISION_DARK_EVALUATION" as const, environment: input.environment, request, requestHash,
    decisionId: `week3-decision-${request.requestId}`, sessionId: `week3-session-${request.requestId}`,
    actor: { pseudonymousSubjectId: "internal-test-subject-01", subjectBindingHash: INTERNAL_DARK_SUBJECT_BINDING_HASH, authenticationContextHash: contentHash("week3-internal-auth-context"), internalTester: true as const, boundBy: "SERVER" as const },
    authority: { allowlistHash: INTERNAL_DARK_ALLOWLIST.allowlistHash, serverTime, authorizedCity: input.city, locationBindingHash: contentHash({ city: input.city, source: "SERVER_AUTHORIZED_INTERNAL_TEST" }) },
    world: { readerContractVersion: input.worldDarkReader.state.contractVersion, readerReleaseHash: INTERNAL_WORLD_READER_RELEASE_HASH, registryVersion: input.worldDarkReader.state.registryVersion, registryHash: input.worldDarkReader.state.registryHash, sourcePolicyVersion: input.worldDarkReader.state.sourcePolicyVersion, sourcePolicyHash: input.worldDarkReader.state.sourcePolicyHash, cohortHash: input.manifest.cohortHash },
    user: { projectionPortVersion: "backyrd.user-intelligence.decision-projection-port@1.0", projectionContractVersion: input.reference.authority.user.projectionContractVersion, projectionReleaseHash: INTERNAL_DARK_RELEASE.userProjectionReleaseHash },
    context: { contractVersion: PHASE3C_LAB_VERSIONS.interpretation, phase3CReleaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash, phase3CPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash },
    candidates: { candidateIds, candidateSetHash: contentHash(candidateIds) }, referenceReportHash: reference.reportHash, source,
    validFrom: "2026-09-17T00:00:00.000Z", validUntil: "2027-09-17T00:00:00.000Z", evaluationOnly: true as const, productionAuthorized: false as const,
  }, "envelopeHash")));
  const artifactTrust = deepFreeze(InternalDarkArtifactTrustSchema.parse(withContentHash({
    contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.artifactTrust, trustId: `week3-artifact-trust-${request.requestId}`,
    acceptedEnvelopeId: envelope.envelopeId, acceptedEnvelopeHash: envelope.envelopeHash, acceptedSourceSha: source.sourceSha,
    acceptedSourceTreeHash: source.sourceTreeHash, acceptedArtifactHash: source.artifactHash, acceptedAllowlistHash: INTERNAL_DARK_ALLOWLIST.allowlistHash,
    scope: "INTERNAL_SYNTHETIC_EVALUATION_ONLY" as const, productionAuthorized: false as const,
  }, "trustHash")));
  return { envelope, artifactTrust };
}

function hardConstraintFingerprint(candidate: DarkRequestReport["evaluationResult"]["candidates"][number]): string {
  return contentHash({ confirmed: [...candidate.confirmedHardConstraints].sort(), unknown: [...candidate.unknownHardConstraints].sort(), failed: [...candidate.failedHardConstraints].sort() });
}

function metrics(reference: DarkRequestReport, actual: DarkRequestReport) {
  const expected = new Map(reference.evaluationResult.candidates.map((item) => [item.candidateId, item]));
  let hardConstraintDeviationCount = 0; let candidateTierDeviationCount = 0; let falseConfirmationCount = 0; let falseExclusionCount = 0;
  for (const candidate of actual.evaluationResult.candidates) {
    const baseline = expected.get(candidate.candidateId); if (!baseline) { candidateTierDeviationCount += 1; continue; }
    if (hardConstraintFingerprint(candidate) !== hardConstraintFingerprint(baseline)) hardConstraintDeviationCount += 1;
    if (candidate.tier !== baseline.tier) candidateTierDeviationCount += 1;
    if (candidate.tier === "ELIGIBLE_CONFIRMED" && baseline.tier !== "ELIGIBLE_CONFIRMED") falseConfirmationCount += 1;
    if (candidate.tier === "INELIGIBLE" && baseline.tier !== "INELIGIBLE") falseExclusionCount += 1;
  }
  const count = actual.evaluationResult.candidates.length;
  const unknownCandidateCount = actual.evaluationResult.candidates.filter((item) => item.coreIntentCoverage.state === "UNKNOWN" || item.unknownHardConstraints.length > 0).length;
  const fallbackCandidateCount = actual.evaluationResult.candidates.filter((item) => item.tier === "UNCONFIRMED_FALLBACK").length;
  return InternalDarkMetricsSchema.parse(withContentHash({
    contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.metrics,
    interpretationParity: reference.evaluationResult.interpretation.interpretationHash === actual.evaluationResult.interpretation.interpretationHash ? "IDENTICAL" as const : "DIFFERENT" as const,
    hardConstraintDeviationCount, candidateTierDeviationCount, falseConfirmationCount, falseExclusionCount,
    unknownCandidateCount, unknownShareBasisPoints: count === 0 ? 0 : Math.round(unknownCandidateCount * 10_000 / count),
    fallbackCandidateCount, fallbackShareBasisPoints: count === 0 ? 0 : Math.round(fallbackCandidateCount * 10_000 / count),
    replayParity: "BYTE_IDENTICAL" as const, latencyIncludedInSemanticIdentity: false as const,
    classification: "TECHNICAL_PARITY_ONLY" as const, productQualityClaim: false as const,
  }, "metricsHash"));
}

export async function runLocalInternalDarkShadow(input: {
  readonly envelope: unknown; readonly artifactTrust: unknown; readonly reference: ReferenceBinding;
  readonly manifest: FounderWorldCohortManifest; readonly worldDarkReader: WorldDarkReader;
  readonly userProjectionPort: DecisionVNextUserProjectionPort; readonly controller: LocalInternalDarkController;
  readonly onWorldRead?: (count: number) => void;
}): Promise<InternalDarkReport | InternalDarkAbortedReceipt> {
  const envelope = validateInternalDarkEnvelope(input.envelope, input.artifactTrust); const ticket = input.controller.begin(capability());
  const reference = validateDarkRequestReport(input.reference.report, input.reference.authority, input.reference.sourceTrust);
  if (reference.reportHash !== envelope.referenceReportHash || input.manifest.cohortHash !== envelope.world.cohortHash) throw new Error("internal_dark_reference_binding_mismatch");
  let worldReads = 0; let userReads = 0;
  const guardedWorld = { contractVersion: input.worldDarkReader.reader.contractVersion, async readSnapshot(request: Parameters<typeof input.worldDarkReader.reader.readSnapshot>[0]) { input.controller.assertActive(ticket); const snapshot = await input.worldDarkReader.reader.readSnapshot(request); input.controller.assertActive(ticket); worldReads += 1; input.onWorldRead?.(worldReads); input.controller.assertActive(ticket); return snapshot; } };
  const guardedUser: DecisionVNextUserProjectionPort = { contractVersion: input.userProjectionPort.contractVersion, async project(request) { input.controller.assertActive(ticket); const projection = await input.userProjectionPort.project(request); userReads += 1; input.controller.assertActive(ticket); return projection; } };
  try {
    const week2 = provisionLocalDarkRequestAuthority({ request: envelope.request, city: envelope.authority.authorizedCity, manifest: input.manifest, sourceSha: envelope.source.sourceSha, sourceTreeHash: envelope.source.sourceTreeHash, serverTime: envelope.authority.serverTime });
    const actual = await runLocalDarkRequestRehearsal({ request: envelope.request, ...week2, worldReader: guardedWorld, manifest: input.manifest, userProjectionPort: guardedUser });
    input.controller.assertActive(ticket);
    const candidateSummaries = actual.evaluationResult.candidates.map((candidate) => withContentHash({ candidateId: candidate.candidateId, tier: candidate.tier, coreIntentState: candidate.coreIntentCoverage.state, unknownHardConstraintCount: candidate.unknownHardConstraints.length, failedHardConstraintCount: candidate.failedHardConstraints.length, rejectionClass: candidate.rejectionClass }, "summaryHash")).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const report = InternalDarkReportSchema.parse(withContentHash({
      contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.report, envelopeHash: envelope.envelopeHash,
      allowlistHash: INTERNAL_DARK_ALLOWLIST.allowlistHash, referenceReportHash: reference.reportHash,
      evaluationResultHash: actual.evaluationResult.resultHash, interpretationHash: actual.evaluationResult.interpretation.interpretationHash,
      candidateSetHash: envelope.candidates.candidateSetHash, candidateSummaries, metrics: metrics(reference, actual),
      counters: { worldReads, userReads, evaluations: 1, persistenceWrites: 0 as const, networkCalls: 0 as const, productOutputs: 0 as const, mutations: 0 as const },
      boundaries: { evaluationOnly: true as const, resultDiscarded: true as const, persisted: false as const, clientResponseProduced: false as const, productRankingAuthorized: false as const, productEligibilityAuthorized: false as const, confidenceAuthorized: false as const, learningAuthorized: false as const, worldMutation: false as const, userMutation: false as const, productionDataUsed: false as const },
    }, "reportHash"));
    return deepFreeze(validateInternalDarkReport(report, envelope, input.artifactTrust));
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ABORT_ERROR) throw error;
    return deepFreeze(InternalDarkAbortedReceiptSchema.parse(withContentHash({
      contractVersion: INTERNAL_DARK_SHADOW_VERSIONS.aborted, status: "ABORTED_EMERGENCY_OFF" as const,
      envelopeHash: envelope.envelopeHash, reason: "KILL_SWITCH_ENGAGED_DURING_REQUEST" as const,
      counters: { worldReads, userReads, evaluations: 0, persistenceWrites: 0 as const, networkCalls: 0 as const, productOutputs: 0 as const, mutations: 0 as const },
      resultDiscarded: true as const, stateLeakDetected: false as const,
    }, "receiptHash")));
  }
}

export async function replayLocalInternalDarkShadow(input: Parameters<typeof runLocalInternalDarkShadow>[0], supplied: unknown): Promise<InternalDarkReport> {
  const rebuilt = await runLocalInternalDarkShadow(input); if ("status" in rebuilt) throw new Error("internal_dark_replay_aborted");
  return replayInternalDarkReport(supplied, rebuilt, input.envelope, input.artifactTrust);
}
