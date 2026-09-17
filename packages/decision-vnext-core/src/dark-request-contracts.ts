import { FounderLabRequestSchema, FounderLabResultSchema } from "./phase3c-lab-contracts.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const DARK_REQUEST_VERSIONS = Object.freeze({
  control: "backyrd.decision-vnext.dark-request-control@week2-1",
  authority: "backyrd.decision-vnext.dark-request-authority@week2-1",
  sourceTrust: "backyrd.decision-vnext.dark-request-source-trust@week2-1",
  disabledReceipt: "backyrd.decision-vnext.dark-request-disabled-receipt@week2-1",
  report: "backyrd.decision-vnext.dark-request-report@week2-1",
  metrics: "backyrd.decision-vnext.dark-request-parity-metrics@week2-1",
  oracleCatalog: "backyrd.decision-vnext.dark-request-oracles@week2-1",
  thresholdTemplate: "backyrd.decision-vnext.dark-request-threshold-template@week2-1",
} as const);

const contractRef = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });
const gitObjectId = schema.string({ pattern: /^[a-f0-9]{40}$/ });

export const DarkRequestControlSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.control),
  environmentVariable: schema.literal("DECISION_VNEXT_SHADOW_TRAFFIC"),
  enabled: schema.literal(false), sampleRateBasisPoints: schema.literal(0), killSwitch: schema.literal("ENGAGED"),
  executionAuthorized: schema.literal(false), persistenceAuthorized: schema.literal(false), networkAuthorized: schema.literal(false),
  productOutputAuthorized: schema.literal(false), rankingAuthorized: schema.literal(false), eligibilityAuthorized: schema.literal(false),
  confidenceAuthorized: schema.literal(false), userLearningAuthorized: schema.literal(false), controlHash: sha256,
});
export type DarkRequestControl = Infer<typeof DarkRequestControlSchema>;

export const DarkRequestAuthoritySchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.authority), authorityId: identifier,
  executionMode: schema.literal("LOCAL_SYNTHETIC_REHEARSAL"), requestHash: sha256,
  decisionId: identifier, sessionId: identifier,
  actor: schema.object({ userId: identifier, subjectBindingHash: sha256, authenticationContextHash: sha256, boundBy: schema.literal("SERVER") }),
  serverTime: timestamp, authorizedLocation: schema.object({ city: identifier, source: schema.literal("SYNTHETIC_SERVER_AUTHORITY"), bindingHash: sha256 }),
  sourceIdentity: schema.object({ sourceSha: gitObjectId, sourceTreeHash: gitObjectId, artifactIdentityHash: sha256 }),
  world: schema.object({ portVersion: contractRef, registryVersion: contractRef, registryHash: sha256, sourcePolicyVersion: contractRef, sourcePolicyHash: sha256, cohortHash: sha256 }),
  user: schema.object({ portVersion: contractRef, projectionContractVersion: contractRef, projectionPolicyVersion: identifier }),
  contextVersion: contractRef, phase3CReleaseHash: sha256, phase3CPolicyHash: sha256,
  validFrom: timestamp, validUntil: timestamp, productionCapable: schema.literal(false), authorityHash: sha256,
});
export type DarkRequestAuthority = Infer<typeof DarkRequestAuthoritySchema>;

export const DarkRequestSourceTrustSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.sourceTrust), trustId: identifier,
  acceptedAuthorityId: identifier, acceptedAuthorityHash: sha256,
  acceptedSourceSha: gitObjectId, acceptedSourceTreeHash: gitObjectId, acceptedArtifactIdentityHash: sha256,
  scope: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionCapable: schema.literal(false), trustHash: sha256,
});
export type DarkRequestSourceTrust = Infer<typeof DarkRequestSourceTrustSchema>;

export const DarkRequestDisabledReceiptSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.disabledReceipt), status: schema.literal("DISABLED"), reason: schema.enum(["DEFAULT_OFF", "KILL_SWITCH_ENGAGED", "ACTIVATION_NOT_AUTHORIZED"] as const),
  controlHash: sha256, counters: schema.object({ worldReads: schema.literal(0), userReads: schema.literal(0), evaluations: schema.literal(0), persistenceWrites: schema.literal(0), networkCalls: schema.literal(0), productOutputs: schema.literal(0) }), receiptHash: sha256,
});
export type DarkRequestDisabledReceipt = Infer<typeof DarkRequestDisabledReceiptSchema>;

export const DarkRequestParityMetricsSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.metrics), interpretationParity: schema.enum(["IDENTICAL", "DIFFERENT"] as const),
  candidateSetParity: schema.enum(["IDENTICAL", "DIFFERENT"] as const), hardConstraintDeviationCount: schema.number({ integer: true, min: 0 }),
  candidateTierDeviationCount: schema.number({ integer: true, min: 0 }), falseConfirmationCount: schema.number({ integer: true, min: 0 }),
  falseExclusionCount: schema.number({ integer: true, min: 0 }), unknownCandidateCount: schema.number({ integer: true, min: 0 }),
  fallbackCandidateCount: schema.number({ integer: true, min: 0 }), replayParity: schema.literal("BYTE_IDENTICAL"),
  classification: schema.literal("TECHNICAL_INTEGRITY_ONLY"), productQualityClaim: schema.literal(false), metricsHash: sha256,
});
export type DarkRequestParityMetrics = Infer<typeof DarkRequestParityMetricsSchema>;

export const DarkRequestReportSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.report), authorityHash: sha256, requestHash: sha256, contextHash: sha256,
  sourceCohortHash: sha256, worldCohortHash: sha256, worldSnapshotHashes: schema.array(sha256, { min: 1, max: 40 }), userProjectionHash: sha256,
  candidateSetHash: sha256, evaluationResult: FounderLabResultSchema, metrics: DarkRequestParityMetricsSchema,
  counters: schema.object({ worldReads: schema.number({ integer: true, min: 1 }), userReads: schema.literal(1), evaluations: schema.literal(1), persistenceWrites: schema.literal(0), networkCalls: schema.literal(0), productOutputs: schema.literal(0) }),
  boundaries: schema.object({ evaluationOnly: schema.literal(true), clientResponseProduced: schema.literal(false), productRankingAuthorized: schema.literal(false), productEligibilityAuthorized: schema.literal(false), confidenceAuthorized: schema.literal(false), writesWorldState: schema.literal(false), writesUserState: schema.literal(false), productionDataUsed: schema.literal(false) }),
  reportHash: sha256,
});
export type DarkRequestReport = Infer<typeof DarkRequestReportSchema>;

export const DarkRequestInputSchema = FounderLabRequestSchema;

export const DarkRequestThresholdTemplateSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.thresholdTemplate), decisionState: schema.literal("DECISION_REQUIRED"),
  interpretationParityTarget: schema.literal("NOT_CONFIGURED"), hardConstraintDeviationTarget: schema.literal("NOT_CONFIGURED"),
  candidateTierDeviationTarget: schema.literal("NOT_CONFIGURED"), falseConfirmationTarget: schema.literal("NOT_CONFIGURED"),
  falseExclusionTarget: schema.literal("NOT_CONFIGURED"), productQualityOracle: schema.literal("NOT_CONFIGURED"),
  productionAuthorized: schema.literal(false), templateHash: sha256,
});
export type DarkRequestThresholdTemplate = Infer<typeof DarkRequestThresholdTemplateSchema>;

export const DarkRequestOracleSchema = schema.object({
  oracleId: identifier, scenarioId: identifier,
  expectedEffect: schema.enum(["LOCATION_EXCLUSION", "CORE_INTENT_GATE", "UNKNOWN_FALLBACK", "DISPUTED_LIMITATION", "NOT_CONFIGURED_LIMITATION", "AVAILABILITY_EXCLUSION", "CONTEXT_ONLY_CHANGE", "ALTERNATIVE_NEUTRAL", "REJECT_CONTEXTUAL", "REPLAY_IDENTICAL", "SINGLE_CANDIDATE_VALID"] as const),
  rankingExpectation: schema.literal("NOT_CONFIGURED"), productQualityClaim: schema.literal(false), productionAuthorized: schema.literal(false), oracleHash: sha256,
});
export const DarkRequestOracleCatalogSchema = schema.object({
  contractVersion: version(DARK_REQUEST_VERSIONS.oracleCatalog), catalogId: identifier,
  scenarioIds: schema.array(identifier, { min: 15, max: 15 }), oracles: schema.array(DarkRequestOracleSchema, { min: 15, max: 15 }),
  closedScenarioSet: schema.literal(true), productionAuthorized: schema.literal(false), catalogHash: sha256,
});
export type DarkRequestOracleCatalog = Infer<typeof DarkRequestOracleCatalogSchema>;
