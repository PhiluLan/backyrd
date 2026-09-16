import { FounderLabResultSchema } from "./phase3c-lab-contracts.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const DARK_SHADOW_VERSIONS = Object.freeze({
  control: "backyrd.decision-vnext.dark-shadow-control@week1-1",
  authority: "backyrd.decision-vnext.dark-shadow-authority@week1-1",
  trustAnchor: "backyrd.decision-vnext.dark-shadow-trust-anchor@week1-1",
  envelope: "backyrd.decision-vnext.dark-shadow-envelope@week1-1",
  metrics: "backyrd.decision-vnext.dark-shadow-metrics@week1-1",
  report: "backyrd.decision-vnext.dark-shadow-report@week1-1",
  oracleCatalog: "backyrd.decision-vnext.dark-shadow-oracles@week1-1",
  release: "backyrd.decision-vnext.dark-shadow-release@week1-1",
} as const);

const contractRef = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });
const gitObjectId = schema.string({ pattern: /^[a-f0-9]{40}$/ });
const nullableIdentifier = schema.union([identifier, schema.literal(null)] as const);

export const DarkShadowControlSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.control),
  state: schema.literal("DISABLED"),
  killSwitch: schema.literal("ENGAGED"),
  sampleRateBasisPoints: schema.literal(0),
  executionAuthorized: schema.literal(false),
  productionDataAuthorized: schema.literal(false),
  persistenceAuthorized: schema.literal(false),
  productAuthority: schema.literal(false),
  productRankingAuthorized: schema.literal(false),
  productEligibilityAuthorized: schema.literal(false),
  userLearningAuthorized: schema.literal(false),
  visibleMutationAuthorized: schema.literal(false),
  controlHash: sha256,
});
export type DarkShadowControl = Infer<typeof DarkShadowControlSchema>;

export const DarkShadowAuthoritySchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.authority),
  authorityId: identifier,
  scope: schema.literal("SYNTHETIC_LOCAL_EVALUATION_ONLY"),
  sourceIdentity: schema.object({ sourceSha: gitObjectId, sourceTreeHash: gitObjectId, artifactIdentityHash: sha256 }),
  releaseHash: sha256,
  oracleCatalogHash: sha256,
  engineRegistryHash: sha256,
  phase3CReleaseHash: sha256,
  phase3CPolicyHash: sha256,
  worldPortVersion: contractRef,
  userProjectionVersion: contractRef,
  contextVersion: contractRef,
  validFrom: timestamp,
  validUntil: timestamp,
  productionCapable: schema.literal(false),
  authorityHash: sha256,
});
export type DarkShadowAuthority = Infer<typeof DarkShadowAuthoritySchema>;

export const DarkShadowTrustAnchorSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.trustAnchor),
  trustAnchorId: identifier,
  acceptedAuthorityId: identifier,
  acceptedAuthorityHash: sha256,
  acceptedSourceSha: gitObjectId,
  acceptedSourceTreeHash: gitObjectId,
  acceptedArtifactIdentityHash: sha256,
  acceptedReleaseHash: sha256,
  scope: schema.literal("SYNTHETIC_FIXTURE_ONLY"),
  productionCapable: schema.literal(false),
});
export type DarkShadowTrustAnchor = Infer<typeof DarkShadowTrustAnchorSchema>;

export const DarkShadowOracleSchema = schema.object({
  oracleId: identifier,
  scenarioId: identifier,
  founderSemantics: identifier,
  expectedStructuralEffect: schema.enum([
    "TARGET_LOCATION_EXCLUSION", "CORE_INTENT_GATE", "UNKNOWN_HARD_CONSTRAINT_FALLBACK",
    "CONTEXT_ONLY_CHANGE", "ALTERNATIVE_IS_NEUTRAL", "REJECT_IS_CONTEXTUAL", "BYTE_IDENTICAL_REPLAY",
  ] as const),
  candidateSetMustRemainIdentical: schema.literal(true),
  visibleResultMustRemainUnchanged: schema.literal(true),
  rankingExpectation: schema.literal("NOT_CONFIGURED"),
  confidenceExpectation: schema.literal("NOT_CONFIGURED"),
  productionAuthorized: schema.literal(false),
  productQualityClaim: schema.literal(false),
  oracleHash: sha256,
});
export type DarkShadowOracle = Infer<typeof DarkShadowOracleSchema>;

export const DarkShadowOracleCatalogSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.oracleCatalog),
  catalogId: identifier,
  scenarioIds: schema.array(identifier, { min: 10, max: 10 }),
  oracles: schema.array(DarkShadowOracleSchema, { min: 10, max: 10 }),
  closedScenarioSet: schema.literal(true),
  productionAuthorized: schema.literal(false),
  productQualityClaim: schema.literal(false),
  catalogHash: sha256,
});
export type DarkShadowOracleCatalog = Infer<typeof DarkShadowOracleCatalogSchema>;

export const DarkShadowReleaseSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.release),
  releaseId: identifier,
  controlHash: sha256,
  oracleCatalogHash: sha256,
  engineRegistryHash: sha256,
  phase3CReleaseHash: sha256,
  phase3CPolicyHash: sha256,
  rankingCandidate: schema.object({ state: schema.literal("NOT_CONFIGURED"), productWeightsConfigured: schema.literal(false) }),
  confidenceCandidate: schema.object({ state: schema.literal("NOT_CONFIGURED"), calibrated: schema.literal(false) }),
  productionAuthorized: schema.literal(false),
  shadowActivationAuthorized: schema.literal(false),
  releaseHash: sha256,
});
export type DarkShadowRelease = Infer<typeof DarkShadowReleaseSchema>;

export const DarkShadowEnvelopeSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.envelope),
  executionId: identifier,
  evaluationTime: timestamp,
  authority: DarkShadowAuthoritySchema,
  control: DarkShadowControlSchema,
  input: schema.object({
    requestHash: sha256,
    contextVersion: contractRef,
    contextHash: sha256,
    worldCohortHash: sha256,
    worldRegistryVersion: contractRef,
    worldRegistryHash: sha256,
    worldHandoffHash: schema.union([sha256, schema.literal(null)] as const),
    userProjectionHash: sha256,
    userProjectionState: schema.enum(["ACTIVE", "NEUTRAL"] as const),
    userNeutralReason: nullableIdentifier,
    candidateSetHash: sha256,
    candidateIds: schema.array(identifier, { min: 1, max: 40 }),
    phase3CReleaseHash: sha256,
    phase3CPolicyHash: sha256,
  }),
  canonicalResult: FounderLabResultSchema,
  engine: schema.object({
    engineId: schema.literal("decision-vnext-dark-shadow-mirror-fixture"),
    engineRegistryHash: sha256,
    fixtureOnly: schema.literal(true),
    productWeightsConfigured: schema.literal(false),
    rankingState: schema.literal("NOT_CONFIGURED"),
    confidenceState: schema.literal("NOT_CONFIGURED"),
  }),
  visibleDecisionMutation: schema.literal(false),
  writesWorldState: schema.literal(false),
  writesUserState: schema.literal(false),
  envelopeHash: sha256,
});
export type DarkShadowEnvelope = Infer<typeof DarkShadowEnvelopeSchema>;

const candidateDeviation = schema.object({ candidateId: identifier, canonical: identifier, shadow: identifier });
export const DarkShadowMetricsSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.metrics),
  interpretationParity: schema.enum(["IDENTICAL", "DIFFERENT"] as const),
  interpretationChangedFields: schema.array(identifier, { max: 30 }),
  hardConstraintDeviations: schema.array(candidateDeviation, { max: 40 }),
  candidateTierDeviations: schema.array(candidateDeviation, { max: 40 }),
  unknownCandidateCount: schema.number({ integer: true, min: 0, max: 40 }),
  fallbackCandidateCount: schema.number({ integer: true, min: 0, max: 40 }),
  unknownFallbackRateBasisPoints: schema.number({ integer: true, min: 0, max: 10_000 }),
  falseConfirmationCandidateIds: schema.array(identifier, { max: 40 }),
  falseExclusionCandidateIds: schema.array(identifier, { max: 40 }),
  replayParity: schema.literal("BYTE_IDENTICAL"),
  productQualityClaim: schema.literal(false),
  metricsHash: sha256,
});
export type DarkShadowMetrics = Infer<typeof DarkShadowMetricsSchema>;

export const DarkShadowReportSchema = schema.object({
  contractVersion: version(DARK_SHADOW_VERSIONS.report),
  envelopeHash: sha256,
  canonicalResultHash: sha256,
  shadowResult: FounderLabResultSchema,
  metrics: DarkShadowMetricsSchema,
  boundaries: schema.object({
    visibleDecisionChanged: schema.literal(false),
    eligibilityAuthorityCreated: schema.literal(false),
    rankingAuthorityCreated: schema.literal(false),
    confidenceAuthorityCreated: schema.literal(false),
    userIntelligenceWriteCreated: schema.literal(false),
    worldWriteCreated: schema.literal(false),
    productionDataUsed: schema.literal(false),
  }),
  runtime: schema.object({
    classification: schema.literal("NON_SEMANTIC_DIAGNOSTIC"),
    measuredMilliseconds: schema.union([schema.number({ min: 0 }), schema.literal(null)] as const),
  }),
  reportHash: sha256,
});
export type DarkShadowReport = Infer<typeof DarkShadowReportSchema>;
