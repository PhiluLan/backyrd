import { CandidatePoolSnapshotSchema, DecisionRequestSchema, EligibilityResultSchema, SituationalContextSnapshotSchema } from "./contracts.js";
import { RelevantUserProjectionSchema } from "@backyrd/user-intelligence-vnext-core";
import { SyntheticWorldConfigSchema } from "./sandbox.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

const contractRef = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });
const gitSha = schema.string({ pattern: /^[a-f0-9]{40}$/ });

export const PHASE2_CONTRACT_VERSIONS = Object.freeze({
  executionEnvelope: "backyrd-vnext-integration-execution-envelope-v2",
  engineManifest: "backyrd-vnext-evaluation-engine-manifest-v2",
  engineResult: "backyrd-vnext-evaluation-engine-result-v2",
  report: "backyrd-vnext-evaluation-report-v2",
  degradation: "backyrd-vnext-degradation-policy-v1",
  evaluationAuthority: "backyrd-vnext-synthetic-evaluation-authority-v1",
  evaluationTrustAnchor: "backyrd-vnext-synthetic-evaluation-trust-anchor-v1",
} as const);

export const PHASE2_ENGINE_IDS = [
  "baseline-a-open-distance-popularity",
  "baseline-b-mood-intent",
  "legacy-v13-frozen-fixture",
  "vnext-fixture",
] as const;
export type Phase2EngineId = typeof PHASE2_ENGINE_IDS[number];

export const DEGRADATION_CODES = [
  "WORLD_SNAPSHOT_MISSING", "WORLD_REGISTRY_UNKNOWN", "SOURCE_POLICY_NOT_ACCEPTED", "WORLD_READINESS_INSUFFICIENT",
  "OPENING_HOURS_UNKNOWN", "OPENING_HOURS_NOT_AUTHORIZED", "WORLD_CONFLICT", "USER_PROJECTION_MISSING",
  "NO_CONSENT", "COLD_USER", "USER_KILL_SWITCH", "CONTEXT_DIMENSION_MISSING", "LOCATION_AUTHORITY_MISSING",
  "CANDIDATE_POOL_EMPTY", "RANKING_ENGINE_UNKNOWN", "EXPLANATION_EVIDENCE_INCOMPLETE", "LEGACY_COMPARISON_UNAVAILABLE",
  "POLICY_NOT_CONFIGURED",
] as const;
export type DegradationCode = typeof DEGRADATION_CODES[number];

export const DEGRADATION_ACTIONS = ["REJECT_REQUEST", "EXCLUDE_CANDIDATE", "NEUTRAL_PERSONALIZATION", "RESULT_LIMITATION", "FAIL_CLOSED", "SKIP_COMPARATOR"] as const;
export type DegradationAction = typeof DEGRADATION_ACTIONS[number];

export const DegradationEntrySchema = schema.object({
  code: schema.enum(DEGRADATION_CODES),
  action: schema.enum(DEGRADATION_ACTIONS),
  scope: schema.enum(["REQUEST", "CANDIDATE", "USER", "RUN", "ENGINE"] as const),
  subjectRef: schema.optional(identifier),
  reasonCode: identifier,
});
export type DegradationEntry = Infer<typeof DegradationEntrySchema>;

const gitObjectId = schema.string({ pattern: /^[a-f0-9]{40}$/ });

export const EvaluationAuthorityRecordSchema = schema.object({
  contractVersion: version(PHASE2_CONTRACT_VERSIONS.evaluationAuthority),
  authorityId: identifier,
  authorityKind: schema.literal("SYNTHETIC_LOCAL_EVALUATION"),
  scenario: schema.object({
    scenarioId: identifier,
    seed: schema.number({ integer: true, min: 1 }),
    sandboxConfig: SyntheticWorldConfigSchema,
    sandboxConfigHash: sha256,
    worldVersion: contractRef,
    worldHash: sha256,
  }),
  sourceIdentity: schema.object({
    sourceSha: gitObjectId,
    sourceTreeHash: gitObjectId,
    artifactIdentityHash: sha256,
  }),
  worldIdentity: schema.object({
    portVersion: contractRef,
    registryVersion: contractRef,
    registryHash: sha256,
    ruleRegistryVersion: contractRef,
    ruleRegistryHash: sha256,
    sourcePolicyVersion: contractRef,
    sourcePolicyHash: sha256,
  }),
  userProjectionContractVersion: contractRef,
  contextContractVersion: contractRef,
  candidatePoolOrigin: schema.object({ generatorVersion: contractRef, sourceId: identifier, limit: schema.number({ integer: true, min: 0, max: 500 }) }),
  engineRegistryVersion: contractRef,
  engineIds: schema.array(schema.enum(PHASE2_ENGINE_IDS), { min: 4, max: 4 }),
  productionCapable: schema.literal(false),
  authorityHash: sha256,
});
export type EvaluationAuthorityRecord = Infer<typeof EvaluationAuthorityRecordSchema>;

export const EvaluationAuthorityTrustAnchorSchema = schema.object({
  contractVersion: version(PHASE2_CONTRACT_VERSIONS.evaluationTrustAnchor),
  trustAnchorId: identifier,
  acceptedAuthorityId: identifier,
  acceptedAuthorityHash: sha256,
  acceptedSourceSha: gitObjectId,
  acceptedSourceTreeHash: gitObjectId,
  acceptedArtifactIdentityHash: sha256,
  acceptedEngineRegistryVersion: contractRef,
  authorityKind: schema.literal("SYNTHETIC_LOCAL_EVALUATION"),
  productionCapable: schema.literal(false),
});
export type EvaluationAuthorityTrustAnchor = Infer<typeof EvaluationAuthorityTrustAnchorSchema>;

export const UserProjectionExecutionBindingSchema = schema.object({
  projectionContractVersion: contractRef,
  projectionId: identifier,
  projectionHash: sha256,
  manifestId: identifier,
  manifestHash: sha256,
  subjectBindingHash: sha256,
  actorKind: schema.enum(["AUTHENTICATED_USER", "ANONYMOUS"] as const),
  authenticationContextHash: schema.union([sha256, schema.literal(null)]),
  status: schema.enum(["ACTIVE", "NEUTRAL"] as const),
  neutralReason: schema.union([identifier, schema.literal(null)]),
  killSwitchRequested: schema.boolean(),
});
export type UserProjectionExecutionBinding = Infer<typeof UserProjectionExecutionBindingSchema>;

export const EvaluationEngineManifestSchema = schema.object({
  contractVersion: version(PHASE2_CONTRACT_VERSIONS.engineManifest),
  engineId: schema.enum(PHASE2_ENGINE_IDS),
  engineVersion: identifier,
  rankingPolicyVersion: identifier,
  weightPolicyVersion: identifier,
  candidatePoolContractVersion: contractRef,
  eligibilityContractVersion: contractRef,
  worldPortVersion: contractRef,
  worldRegistryVersion: contractRef,
  worldRegistryHash: sha256,
  worldRuleRegistryVersion: contractRef,
  worldRuleRegistryHash: sha256,
  worldSourcePolicyVersion: contractRef,
  worldSourcePolicyHash: sha256,
  userProjectionVersion: contractRef,
  contextVersion: contractRef,
  confidenceVersion: contractRef,
  evidenceVersion: contractRef,
  explanationVersion: contractRef,
  degradationPolicyVersion: version(PHASE2_CONTRACT_VERSIONS.degradation),
  sourceSha: gitSha,
  sourceTreeHash: gitSha,
  artifactIdentityHash: sha256,
  evaluationAuthorityHash: sha256,
  fixtureOnly: schema.literal(true),
  productWeightsConfigured: schema.literal(false),
  manifestHash: sha256,
});
export type EvaluationEngineManifest = Infer<typeof EvaluationEngineManifestSchema>;

const WorldSnapshotBindingSchema = schema.object({
  spotId: identifier,
  snapshotHash: sha256,
  sourcePolicyVersion: contractRef,
  sourcePolicyHash: sha256,
});

export const CanonicalIntegrationExecutionEnvelopeSchema = schema.object({
  contractVersion: version(PHASE2_CONTRACT_VERSIONS.executionEnvelope),
  evaluationAuthority: EvaluationAuthorityRecordSchema,
  decisionId: identifier,
  serverRequestId: identifier,
  sessionId: identifier,
  idempotencyIdentity: identifier,
  actor: schema.union([
    schema.object({ kind: schema.literal("AUTHENTICATED_USER"), userId: identifier, subjectBindingHash: sha256, authenticationContextHash: sha256 }),
    schema.object({ kind: schema.literal("ANONYMOUS"), subjectBindingHash: sha256 }),
  ]),
  request: DecisionRequestSchema,
  requestHash: sha256,
  serverTime: timestamp,
  authorizedLocationScope: schema.object({ kind: schema.literal("city"), city: schema.string({ min: 1, max: 120 }) }),
  context: SituationalContextSnapshotSchema,
  world: schema.object({
    portVersion: contractRef,
    registryVersion: contractRef,
    registryHash: sha256,
    ruleRegistryVersion: contractRef,
    ruleRegistryHash: sha256,
    sourcePolicyVersion: contractRef,
    sourcePolicyHash: sha256,
    sourcePolicyAcceptedByServer: schema.literal(true),
    snapshots: schema.array(WorldSnapshotBindingSchema, { max: 500 }),
    snapshotSetHash: sha256,
  }),
  userProjection: UserProjectionExecutionBindingSchema,
  userProjectionValue: RelevantUserProjectionSchema,
  candidatePool: CandidatePoolSnapshotSchema,
  engineManifests: schema.array(EvaluationEngineManifestSchema, { min: 4, max: 4 }),
  eligibilityPolicyVersion: contractRef,
  unknownPolicyVersion: contractRef,
  rankingRegistryVersion: contractRef,
  confidenceContractVersion: contractRef,
  evidenceContractVersion: contractRef,
  explanationContractVersion: contractRef,
  degradationPolicyVersion: version(PHASE2_CONTRACT_VERSIONS.degradation),
  commercialInfluence: schema.literal("FORBIDDEN"),
  writesWorldState: schema.literal(false),
  writesUserState: schema.literal(false),
  envelopeHash: sha256,
});
export type CanonicalIntegrationExecutionEnvelope = Infer<typeof CanonicalIntegrationExecutionEnvelopeSchema>;

export const EvaluationEvidenceSchema = schema.object({
  evidenceId: identifier,
  candidateId: identifier,
  sourceDomain: schema.enum(["WORLD", "USER", "CONTEXT", "ELIGIBILITY", "RANKING", "LIMITATION"] as const),
  signal: identifier,
  sourceHash: sha256,
  policyVersion: contractRef,
  influence: schema.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "LIMITATION"] as const),
  trustState: identifier,
  limitations: schema.array(identifier, { max: 20 }),
  evidenceHash: sha256,
});
export type EvaluationEvidence = Infer<typeof EvaluationEvidenceSchema>;

export const EvaluationFitSchema = schema.object({
  candidateId: identifier,
  dimensions: schema.array(schema.object({
    key: identifier,
    fixtureValue: schema.number({ min: -1, max: 1 }),
    sourceDomain: schema.enum(["WORLD", "USER", "CONTEXT", "RANKING"] as const),
    evidenceIds: schema.array(identifier, { min: 1, max: 12 }),
    productSemantics: schema.literal("NOT_CONFIGURED"),
  }), { max: 16 }),
  fixtureScore: schema.number({ min: -10, max: 10 }),
  fitHash: sha256,
});
export type EvaluationFit = Infer<typeof EvaluationFitSchema>;

const ConfidenceComponentSchema = schema.object({
  key: schema.enum(["WORLD_DATA", "USER_SUFFICIENCY", "CONTEXT_COMPLETENESS", "RANKING_SEPARATION", "EVIDENCE_COVERAGE", "CONFLICT_UNCERTAINTY", "OVERALL"] as const),
  state: schema.enum(["AVAILABLE_UNCALIBRATED", "UNKNOWN", "NOT_CONFIGURED"] as const),
  evidenceIds: schema.array(identifier, { max: 100 }),
});

export const EvaluationEngineResultSchema = schema.object({
  contractVersion: version(PHASE2_CONTRACT_VERSIONS.engineResult),
  engineId: schema.enum(PHASE2_ENGINE_IDS),
  manifest: EvaluationEngineManifestSchema,
  candidatePoolHash: sha256,
  eligibleCandidateSetHash: sha256,
  rankings: schema.array(schema.object({ rank: schema.number({ integer: true, min: 1 }), candidateId: identifier, fit: EvaluationFitSchema }), { max: 500 }),
  top1: schema.union([identifier, schema.literal(null)]),
  top3: schema.array(identifier, { max: 3 }),
  confidence: schema.object({ state: schema.literal("UNCALIBRATED"), components: schema.array(ConfidenceComponentSchema, { min: 7, max: 7 }), confidenceHash: sha256 }),
  evidence: schema.array(EvaluationEvidenceSchema, { max: 300 }),
  explanation: schema.array(schema.object({ candidateId: identifier, reasonCode: identifier, evidenceIds: schema.array(identifier, { min: 1, max: 20 }), renderedText: schema.string({ min: 1, max: 300 }) }), { max: 30 }),
  limitations: schema.array(identifier, { max: 50 }),
  degradation: schema.array(DegradationEntrySchema, { max: 500 }),
  resultHash: sha256,
});
export type EvaluationEngineResult = Infer<typeof EvaluationEngineResultSchema>;

const EvaluationMetricSchema = schema.object({
  metricId: schema.enum(["TOP_1_RELEVANCE", "TOP_3_RELEVANCE", "BAD_RECOMMENDATION_RATE", "HARD_CONSTRAINT_VIOLATION_RATE", "CONTEXT_SENSITIVITY", "PERSONALIZATION_LIFT", "DIVERSITY_EXPLORATION", "CONFIDENCE_CALIBRATION", "EXPLANATION_CONSISTENCY", "EXPLANATION_REFERENCE_INTEGRITY_RATE", "RANKING_STABILITY", "DATA_QUALITY_SENSITIVITY"] as const),
  state: schema.enum(["TECHNICAL_DETERMINISTIC", "NOT_CONFIGURED"] as const),
  value: schema.union([schema.number({ min: 0, max: 1 }), schema.literal(null)]),
  oracleVersion: schema.union([identifier, schema.literal(null)]),
  definitionVersion: schema.union([identifier, schema.literal(null)]),
  productQualityClaim: schema.literal(false),
});

export const EvaluationReportSchema = schema.object({
  contractVersion: version(PHASE2_CONTRACT_VERSIONS.report),
  evaluationAuthorityHash: sha256,
  scenarioId: identifier,
  seed: schema.number({ integer: true, min: 1 }),
  sandboxConfigHash: sha256,
  sandboxWorldHash: sha256,
  requestHash: sha256,
  contextHash: sha256,
  worldSnapshotHashes: schema.array(sha256, { max: 500 }),
  userProjectionHash: sha256,
  candidatePoolHash: sha256,
  candidateCountBeforeEligibility: schema.number({ integer: true, min: 0 }),
  candidateCountAfterEligibility: schema.number({ integer: true, min: 0 }),
  eligibilityResults: schema.array(EligibilityResultSchema, { max: 500 }),
  eligibilityExclusions: schema.array(schema.object({ candidateId: identifier, reasonCodes: schema.array(identifier, { min: 1, max: 10 }) }), { max: 500 }),
  engineResults: schema.array(EvaluationEngineResultSchema, { min: 4, max: 4 }),
  metrics: schema.array(EvaluationMetricSchema, { min: 12, max: 12 }),
  runtime: schema.object({ classification: schema.literal("NON_SEMANTIC_DIAGNOSTIC"), measuredMilliseconds: schema.union([schema.number({ min: 0 }), schema.literal(null)]) }),
  reportHash: sha256,
});
export type EvaluationReport = Infer<typeof EvaluationReportSchema>;
