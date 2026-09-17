import { FounderLabRequestSchema } from "./phase3c-lab-contracts.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const INTERNAL_DARK_SHADOW_VERSIONS = Object.freeze({
  control: "backyrd.decision-vnext.internal-dark-control@week3-1",
  allowlist: "backyrd.decision-vnext.internal-dark-allowlist@week3-1",
  envelope: "backyrd.decision-vnext.internal-dark-envelope@week3-1",
  artifactTrust: "backyrd.decision-vnext.internal-dark-artifact-trust@week3-1",
  disabled: "backyrd.decision-vnext.internal-dark-disabled@week3-1",
  metrics: "backyrd.decision-vnext.internal-dark-metrics@week3-1",
  report: "backyrd.decision-vnext.internal-dark-report@week3-1",
  aborted: "backyrd.decision-vnext.internal-dark-aborted@week3-1",
  release: "backyrd.decision-vnext.internal-dark-release@week3-1",
  postDeployEvidence: "backyrd.decision-vnext.internal-dark-post-deploy-evidence@week3-1",
} as const);

const contractRef = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });
const gitObjectId = schema.string({ pattern: /^[a-f0-9]{40}$/ });
const zeroCounters = {
  worldReads: schema.number({ integer: true, min: 0 }), userReads: schema.number({ integer: true, min: 0 }),
  evaluations: schema.number({ integer: true, min: 0 }), persistenceWrites: schema.literal(0),
  networkCalls: schema.literal(0), productOutputs: schema.literal(0), mutations: schema.literal(0),
} as const;

export const InternalDarkControlSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.control), flag: schema.literal("DECISION_VNEXT_INTERNAL_DARK_SHADOW"),
  enabled: schema.literal(false), sampleRateBasisPoints: schema.literal(0), killSwitch: schema.literal("ENGAGED"),
  executionAuthorized: schema.literal(false), persistenceAuthorized: schema.literal(false), networkAuthorized: schema.literal(false),
  productOutputAuthorized: schema.literal(false), rankingAuthorized: schema.literal(false), eligibilityAuthorized: schema.literal(false),
  confidenceAuthorized: schema.literal(false), learningAuthorized: schema.literal(false), mutationAuthorized: schema.literal(false), controlHash: sha256,
});
export type InternalDarkControl = Infer<typeof InternalDarkControlSchema>;

export const InternalDarkAllowlistSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.allowlist), allowlistId: identifier,
  subjectBindings: schema.array(sha256, { min: 1, max: 4 }),
  purposes: schema.array(schema.literal("INTERNAL_DECISION_DARK_EVALUATION"), { min: 1, max: 1 }),
  environments: schema.array(schema.enum(["LOCAL_SYNTHETIC", "PROD_LIKE_TEST"] as const), { min: 2, max: 2 }),
  syntheticOnly: schema.literal(true), productionAuthorized: schema.literal(false), validFrom: timestamp, validUntil: timestamp,
  allowlistHash: sha256,
});
export type InternalDarkAllowlist = Infer<typeof InternalDarkAllowlistSchema>;

export const InternalDarkEnvelopeSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.envelope), envelopeId: identifier,
  purpose: schema.literal("INTERNAL_DECISION_DARK_EVALUATION"), environment: schema.enum(["LOCAL_SYNTHETIC", "PROD_LIKE_TEST"] as const),
  request: FounderLabRequestSchema, requestHash: sha256, decisionId: identifier, sessionId: identifier,
  actor: schema.object({ pseudonymousSubjectId: identifier, subjectBindingHash: sha256, authenticationContextHash: sha256, internalTester: schema.literal(true), boundBy: schema.literal("SERVER") }),
  authority: schema.object({ allowlistHash: sha256, serverTime: timestamp, authorizedCity: identifier, locationBindingHash: sha256 }),
  world: schema.object({ readerContractVersion: contractRef, readerReleaseHash: sha256, registryVersion: contractRef, registryHash: sha256, sourcePolicyVersion: contractRef, sourcePolicyHash: sha256, cohortHash: sha256 }),
  user: schema.object({ projectionPortVersion: contractRef, projectionContractVersion: contractRef, projectionReleaseHash: sha256 }),
  context: schema.object({ contractVersion: contractRef, phase3CReleaseHash: sha256, phase3CPolicyHash: sha256 }),
  candidates: schema.object({ candidateIds: schema.array(identifier, { min: 1, max: 40 }), candidateSetHash: sha256 }),
  referenceReportHash: sha256,
  source: schema.object({ sourceSha: gitObjectId, sourceTreeHash: gitObjectId, artifactHash: sha256 }),
  validFrom: timestamp, validUntil: timestamp, evaluationOnly: schema.literal(true), productionAuthorized: schema.literal(false), envelopeHash: sha256,
});
export type InternalDarkEnvelope = Infer<typeof InternalDarkEnvelopeSchema>;

export const InternalDarkArtifactTrustSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.artifactTrust), trustId: identifier,
  acceptedEnvelopeId: identifier, acceptedEnvelopeHash: sha256, acceptedSourceSha: gitObjectId,
  acceptedSourceTreeHash: gitObjectId, acceptedArtifactHash: sha256, acceptedAllowlistHash: sha256,
  scope: schema.literal("INTERNAL_SYNTHETIC_EVALUATION_ONLY"), productionAuthorized: schema.literal(false), trustHash: sha256,
});
export type InternalDarkArtifactTrust = Infer<typeof InternalDarkArtifactTrustSchema>;

export const InternalDarkDisabledReceiptSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.disabled), status: schema.literal("DISABLED"),
  reason: schema.enum(["DEFAULT_OFF", "KILL_SWITCH_ENGAGED", "ACTIVATION_NOT_AUTHORIZED"] as const),
  controlHash: sha256,
  counters: schema.object({ worldReads: schema.literal(0), userReads: schema.literal(0), evaluations: schema.literal(0), persistenceWrites: schema.literal(0), networkCalls: schema.literal(0), productOutputs: schema.literal(0), mutations: schema.literal(0) }),
  receiptHash: sha256,
});
export type InternalDarkDisabledReceipt = Infer<typeof InternalDarkDisabledReceiptSchema>;

export const InternalDarkMetricsSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.metrics), interpretationParity: schema.enum(["IDENTICAL", "DIFFERENT"] as const),
  hardConstraintDeviationCount: schema.number({ integer: true, min: 0 }), candidateTierDeviationCount: schema.number({ integer: true, min: 0 }),
  falseConfirmationCount: schema.number({ integer: true, min: 0 }), falseExclusionCount: schema.number({ integer: true, min: 0 }),
  unknownCandidateCount: schema.number({ integer: true, min: 0 }), unknownShareBasisPoints: schema.number({ integer: true, min: 0, max: 10_000 }),
  fallbackCandidateCount: schema.number({ integer: true, min: 0 }), fallbackShareBasisPoints: schema.number({ integer: true, min: 0, max: 10_000 }),
  replayParity: schema.literal("BYTE_IDENTICAL"), latencyIncludedInSemanticIdentity: schema.literal(false),
  classification: schema.literal("TECHNICAL_PARITY_ONLY"), productQualityClaim: schema.literal(false), metricsHash: sha256,
});
export type InternalDarkMetrics = Infer<typeof InternalDarkMetricsSchema>;

const candidateSummary = schema.object({ candidateId: identifier, tier: schema.enum(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"] as const), coreIntentState: schema.enum(["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "INCOMPATIBLE", "DISPUTED", "NOT_APPLICABLE"] as const), unknownHardConstraintCount: schema.number({ integer: true, min: 0 }), failedHardConstraintCount: schema.number({ integer: true, min: 0 }), rejectionClass: schema.enum(["NONE", "SITUATIONAL_REJECT"] as const), summaryHash: sha256 });

export const InternalDarkReportSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.report), envelopeHash: sha256, allowlistHash: sha256,
  referenceReportHash: sha256, evaluationResultHash: sha256, interpretationHash: sha256, candidateSetHash: sha256,
  candidateSummaries: schema.array(candidateSummary, { min: 1, max: 40 }), metrics: InternalDarkMetricsSchema,
  counters: schema.object(zeroCounters),
  boundaries: schema.object({ evaluationOnly: schema.literal(true), resultDiscarded: schema.literal(true), persisted: schema.literal(false), clientResponseProduced: schema.literal(false), productRankingAuthorized: schema.literal(false), productEligibilityAuthorized: schema.literal(false), confidenceAuthorized: schema.literal(false), learningAuthorized: schema.literal(false), worldMutation: schema.literal(false), userMutation: schema.literal(false), productionDataUsed: schema.literal(false) }),
  reportHash: sha256,
});
export type InternalDarkReport = Infer<typeof InternalDarkReportSchema>;

export const InternalDarkAbortedReceiptSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.aborted), status: schema.literal("ABORTED_EMERGENCY_OFF"),
  envelopeHash: sha256, reason: schema.literal("KILL_SWITCH_ENGAGED_DURING_REQUEST"), counters: schema.object(zeroCounters),
  resultDiscarded: schema.literal(true), stateLeakDetected: schema.literal(false), receiptHash: sha256,
});
export type InternalDarkAbortedReceipt = Infer<typeof InternalDarkAbortedReceiptSchema>;

export const InternalDarkReleaseSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.release), releaseId: identifier, controlHash: sha256,
  allowlistHash: sha256, worldReaderReleaseHash: sha256, userProjectionReleaseHash: sha256,
  phase3CReleaseHash: sha256, phase3CPolicyHash: sha256, testOnAvailable: schema.literal(true),
  productionAuthorized: schema.literal(false), productOutputAuthorized: schema.literal(false), releaseHash: sha256,
});
export type InternalDarkRelease = Infer<typeof InternalDarkReleaseSchema>;

export const InternalDarkPostDeployEvidenceSchema = schema.object({
  contractVersion: version(INTERNAL_DARK_SHADOW_VERSIONS.postDeployEvidence), evidenceId: identifier,
  status: schema.literal("NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"), releaseHash: sha256, controlHash: sha256,
  envelopeHash: sha256, reportHash: sha256, sourceSha: gitObjectId, sourceTreeHash: gitObjectId, artifactHash: sha256,
  productionPlanHash: sha256, executionAuthorized: schema.literal(false), deploymentExecuted: schema.literal(false),
  migrationExecuted: schema.literal(false), shadowTrafficActivated: schema.literal(false), evidenceHash: sha256,
});
export type InternalDarkPostDeployEvidence = Infer<typeof InternalDarkPostDeployEvidenceSchema>;
