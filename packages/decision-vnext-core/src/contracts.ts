import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const CONTRACT_VERSIONS = Object.freeze({
  decisionRequest: "backyrd-vnext-decision-request-v2", executionEnvelope: "backyrd-vnext-execution-envelope-v3", contextSnapshot: "backyrd-vnext-situational-context-v2",
  worldAdapter: "backyrd-vnext-world-adapter-v2", userAdapter: "backyrd-vnext-user-adapter-v1", worldCandidate: "backyrd-vnext-world-candidate-v2", candidatePool: "backyrd-vnext-candidate-pool-v2",
  eligibility: "backyrd-vnext-eligibility-result-v2", fitDimensions: "backyrd-vnext-fit-dimensions-v2", confidence: "backyrd-vnext-confidence-v2", evidence: "backyrd-vnext-evidence-v2",
  recommendation: "backyrd-vnext-recommendation-v2", decisionResult: "backyrd-vnext-decision-result-v3", engineManifest: "backyrd-vnext-engine-manifest-v3",
} as const);

const key = schema.string({ min: 1, max: 180, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });
const bounded = schema.number({ min: 0, max: 1 });
const city = schema.string({ min: 1, max: 120 });
const evidenceId = schema.string({ pattern: /^ev-[a-z0-9-]+$/ });

export const HardConstraintSchema = schema.union([schema.object({ kind: schema.literal("open_now"), value: schema.boolean() })]);
export const PlaceholderDimensionSchema = schema.union([
  schema.object({ state: schema.literal("KNOWN"), namespace: key, values: schema.array(key, { max: 20 }) }),
  schema.object({ state: schema.enum(["UNKNOWN", "NOT_CONFIGURED"]), namespace: key }),
]);
export const SoftPreferenceSchema = schema.object({ key, value: schema.union([schema.string({ max: 120 }), schema.number(), schema.boolean()]), status: schema.literal("phase1-placeholder") });

export const DecisionRequestSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.decisionRequest), idempotencyKey: identifier, clientRequestedAt: timestamp,
  location: schema.union([schema.object({ kind: schema.literal("city"), city }), schema.object({ kind: schema.literal("coordinate"), latitude: schema.number({ min: -90, max: 90 }), longitude: schema.number({ min: -180, max: 180 }) })]),
  intentKeys: schema.array(key, { max: 20 }), moodKeys: schema.array(key, { max: 20 }), socialContext: schema.optional(key), occasion: schema.optional(key),
  budget: schema.optional(PlaceholderDimensionSchema), availableTime: schema.optional(PlaceholderDimensionSchema), weather: schema.optional(PlaceholderDimensionSchema), exploration: schema.optional(PlaceholderDimensionSchema),
  shownCandidateIds: schema.array(identifier, { max: 100 }), rejectedCandidateIds: schema.array(identifier, { max: 100 }), hardConstraints: schema.array(HardConstraintSchema, { max: 20 }),
  softPreferences: schema.array(SoftPreferenceSchema, { max: 20 }), freeText: schema.optional(schema.string({ max: 1_000 })), client: schema.object({ surface: schema.enum(["mobile", "web", "synthetic"]), version: identifier }),
});
export type DecisionRequest = Infer<typeof DecisionRequestSchema>;

export const SourceBindingSchema = schema.object({ contractVersion: key, id: identifier, hash: sha256 });
export const WorldBindingSchema = schema.object({ portContractVersion: key, registryVersion: key, registryHash: sha256, ruleRegistryVersion: key, ruleRegistryHash: sha256, snapshotSetHash: sha256 });
const UserNeutralReasonSchema = schema.enum(["NO_CONSENT", "INSUFFICIENT_CONFIDENCE", "WRONG_DOMAIN", "CONTEXT_MISMATCH", "ITEM_BUDGET", "BYTE_BUDGET", "UNKNOWN_CONCEPT", "CONFLICT", "EXPIRED_EVIDENCE", "COLD_START", "MISSING_SNAPSHOT", "INCOMPATIBLE_VERSION", "KILL_SWITCH"]);
export const UserBindingSchema = schema.object({ projectionContractVersion: key, projectionId: identifier, projectionHash: sha256, manifestId: identifier, manifestHash: sha256, subjectBindingHash: sha256, status: schema.enum(["ACTIVE", "NEUTRAL"]), neutralReason: schema.union([UserNeutralReasonSchema, schema.literal(null)]) });

export const SituationalContextSnapshotSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.contextSnapshot), decisionId: identifier, sessionId: identifier, resolvedAt: timestamp,
  explicit: schema.object({ location: schema.object({ kind: schema.literal("city"), city }), intentKeys: schema.array(key, { max: 20 }), moodKeys: schema.array(key, { max: 20 }), socialContext: schema.optional(key), occasion: schema.optional(key), budget: PlaceholderDimensionSchema, availableTime: PlaceholderDimensionSchema, weather: PlaceholderDimensionSchema, exploration: PlaceholderDimensionSchema, hardConstraints: schema.array(HardConstraintSchema, { max: 20 }), softPreferences: schema.array(SoftPreferenceSchema, { max: 20 }), shownCandidateIds: schema.array(identifier, { max: 100 }), rejectedCandidateIds: schema.array(identifier, { max: 100 }) }),
  serverBound: schema.object({ actorSubjectBindingHash: sha256, authorizedLocationScope: schema.object({ kind: schema.literal("city"), city }), canonicalTime: timestamp, locationAuthority: schema.object({ clientLocationHash: sha256, authorizedScopeHash: sha256, comparison: schema.literal("MATCH") }) }),
  derived: schema.array(schema.union([
    schema.object({ namespace: key, state: schema.literal("DERIVED"), sourceHashes: schema.array(sha256, { min: 1, max: 20 }) }),
    schema.object({ namespace: key, state: schema.enum(["UNKNOWN", "NOT_CONFIGURED"]), sourceHashes: schema.array(sha256, { max: 20 }) }),
  ]), { max: 30 }),
  limitations: schema.array(key, { max: 30 }), rawLocationPersisted: schema.literal(false), writesUserIntelligence: schema.literal(false), contextHash: sha256,
});
export type SituationalContextSnapshot = Infer<typeof SituationalContextSnapshotSchema>;
export type DecisionContextSnapshot = SituationalContextSnapshot;

export const EngineManifestSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.engineManifest), contractSetVersion: schema.literal("backyrd-vnext-contract-set-v3"), decisionRequestVersion: schema.literal(CONTRACT_VERSIONS.decisionRequest), executionEnvelopeVersion: schema.literal(CONTRACT_VERSIONS.executionEnvelope), decisionResultVersion: schema.literal(CONTRACT_VERSIONS.decisionResult),
  engineVersion: identifier, sourceSha: schema.string({ pattern: /^(?:[a-f0-9]{40}|phase1-[a-z0-9-]+)$/ }), sandboxWorldVersion: identifier,
  worldPortVersion: key, worldRegistryVersion: key, worldRegistryHash: sha256, worldRuleRegistryVersion: key, worldRuleRegistryHash: sha256, userProjectionVersion: key, userManifestVersion: key,
  contextVersion: key, candidateGeneratorVersion: identifier, candidatePoolVersion: key, eligibilityRulesetVersion: identifier, unknownPolicyVersion: identifier, featureSetVersion: identifier,
  openingStateVersion: identifier, openingSourcePolicyVersion: key, rankingVersion: identifier, weightFixtureVersion: key, confidenceVersion: identifier, evidenceVersion: identifier, explanationVersion: identifier, explorationPolicyVersion: key, manifestHash: sha256,
});
export type EngineManifest = Infer<typeof EngineManifestSchema>;

export const DecisionExecutionEnvelopeSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.executionEnvelope), authenticatedActor: schema.union([schema.object({ kind: schema.literal("user"), userId: identifier, subjectBindingHash: sha256 }), schema.object({ kind: schema.literal("anonymous"), subjectBindingHash: sha256 })]),
  decisionId: identifier, serverRequestId: identifier, sessionId: identifier, executedAt: timestamp, rolloutMode: schema.enum(["evaluation", "shadow"]), deadlineAt: timestamp, serverIdempotencyKey: identifier,
  authorizedLocationScope: schema.object({ kind: schema.literal("city"), city }),
  contextBinding: SourceBindingSchema, worldBinding: WorldBindingSchema, userBinding: UserBindingSchema, candidatePoolBinding: SourceBindingSchema, engineManifest: EngineManifestSchema,
  degradationState: schema.array(key, { max: 30 }), personalizationKillSwitch: schema.boolean(), commercialInfluence: schema.literal("FORBIDDEN"), envelopeHash: sha256,
});
export type DecisionExecutionEnvelope = Infer<typeof DecisionExecutionEnvelopeSchema>;

export const EvidenceItemSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.evidence), evidenceId, spotId: identifier, sourceDomain: schema.enum(["WORLD", "USER", "CONTEXT"]), sourceReference: key, sourceHash: sha256, signal: key,
  influence: schema.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "LIMITATION"]), trustState: key, policyVersion: key,
  value: schema.union([schema.object({ kind: schema.literal("boolean"), value: schema.boolean() }), schema.object({ kind: schema.literal("text"), value: schema.string({ max: 300 }) }), schema.object({ kind: schema.literal("number"), value: schema.number(), unit: key }), schema.object({ kind: schema.literal("keys"), values: schema.array(key, { max: 30 }) }), schema.object({ kind: schema.literal("open_status"), value: schema.enum(["open", "closed", "unknown", "not_authorized", "expired", "disputed"]) })]),
  observedAt: timestamp, confidenceState: schema.enum(["UNASSESSED", "FIXTURE", "WEAK", "SUPPORTED"]), limitations: schema.array(key, { max: 20 }), evidenceHash: sha256,
});
export type EvidenceItem = Infer<typeof EvidenceItemSchema>;

export const WorldCandidateSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.worldCandidate), spotId: identifier, city, distanceMeters: schema.number({ min: 0 }), distributionAllowed: schema.boolean(), openStatus: schema.enum(["open", "closed", "unknown", "not_authorized", "expired", "disputed"]), fixturePopularity: bounded, fixtureDataQuality: bounded,
  fixtureIntentKeys: schema.array(key, { max: 20 }), fixtureMoodKeys: schema.array(key, { max: 20 }),
  worldReference: schema.object({ contractVersion: key, registryVersion: key, registryHash: sha256, ruleRegistryVersion: key, ruleRegistryHash: sha256, snapshotHash: sha256, resolvedAt: timestamp, readiness: schema.array(schema.object({ useCase: key, state: schema.enum(["READY", "PARTIAL", "NOT_READY"]), reasonCodes: schema.array(key, { max: 20 }) }), { max: 20 }), exclusions: schema.array(schema.object({ code: key, count: schema.number({ integer: true, min: 1 }) }), { max: 30 }) }),
  evidence: schema.array(EvidenceItemSchema, { max: 100 }), candidateHash: sha256,
});
export type WorldCandidate = Infer<typeof WorldCandidateSchema>;

export const CandidatePoolSnapshotSchema = schema.object({ contractVersion: version(CONTRACT_VERSIONS.candidatePool), serverRequestId: identifier, worldVersion: identifier, candidateGeneratorVersion: identifier, candidates: schema.array(schema.object({ candidate: WorldCandidateSchema, retrievalSource: schema.object({ kind: schema.enum(["synthetic_fixture", "versioned_adapter"]), sourceId: identifier, personalized: schema.literal(false) }), retrievalPosition: schema.number({ integer: true, min: 1 }) }), { max: 500 }), candidatePoolHash: sha256 });
export type CandidatePoolSnapshot = Infer<typeof CandidatePoolSnapshotSchema>;

export const EligibilityCheckSchema = schema.object({ ruleId: schema.enum(["distribution-allowed-v1", "explicit-city-match-v1", "explicit-open-now-v1"]), rulesetVersion: schema.literal("backyrd-vnext-eligibility-phase1-v1"), outcome: schema.enum(["pass", "fail", "unknown", "not_configured"]), evidenceIds: schema.array(evidenceId, { max: 10 }), unknownPolicy: schema.enum(["not-applicable", "fail", "not-configured"]), reasonCodes: schema.array(key, { max: 10 }), proofHash: sha256 });
export const EligibilityResultSchema = schema.object({ contractVersion: version(CONTRACT_VERSIONS.eligibility), spotId: identifier, eligible: schema.boolean(), checks: schema.array(EligibilityCheckSchema, { max: 3 }), resultHash: sha256 });
export type EligibilityResult = Infer<typeof EligibilityResultSchema>;
export const FitDimensionsSchema = schema.object({ contractVersion: version(CONTRACT_VERSIONS.fitDimensions), spotId: identifier, featureSetVersion: schema.literal("backyrd-vnext-phase1-fixture-features-v1"), dimensions: schema.array(schema.object({ key: schema.enum(["fixture.open", "fixture.distance", "fixture.popularity", "fixture.intent_match", "fixture.mood_match"]), rawValue: bounded, evidenceIds: schema.array(evidenceId, { max: 20 }), status: schema.literal("unapproved-product-placeholder") }), { max: 10 }), fitHash: sha256 });
export type FitDimensions = Infer<typeof FitDimensionsSchema>;
export const ConfidenceSchema = schema.object({ contractVersion: version(CONTRACT_VERSIONS.confidence), status: schema.literal("uncalibrated-phase1"), components: schema.array(schema.object({ key: schema.enum(["world_data_sufficiency", "world_trust_freshness", "user_sufficiency", "context_completeness", "eligibility_certainty", "ranking_separation", "evidence_coverage"]), state: schema.enum(["UNASSESSED", "NOT_CONFIGURED", "FIXTURE_VALUE"]), evaluationValue: schema.union([bounded, schema.literal(null)]) }), { max: 7 }), limitations: schema.array(schema.object({ code: key, evidenceIds: schema.array(evidenceId, { max: 20 }) }), { max: 30 }), confidenceHash: sha256 });
export type Confidence = Infer<typeof ConfidenceSchema>;
export const AuthorizedReasonSchema = schema.object({ reasonCode: schema.enum(["verified_open", "nearby_fixture", "popularity_fixture", "intent_match_fixture", "mood_match_fixture", "weak_world_evidence"]), evidenceIds: schema.array(evidenceId, { max: 20 }), renderedText: schema.string({ min: 1, max: 300 }) });
export type AuthorizedReason = Infer<typeof AuthorizedReasonSchema>;
export const DecisionRecommendationSchema = schema.object({ contractVersion: version(CONTRACT_VERSIONS.recommendation), spotId: identifier, rank: schema.number({ integer: true, min: 1 }), eligibility: EligibilityResultSchema, fit: FitDimensionsSchema, confidence: ConfidenceSchema, reasons: schema.array(AuthorizedReasonSchema, { max: 10 }), recommendationHash: sha256 });
export type DecisionRecommendation = Infer<typeof DecisionRecommendationSchema>;
export const DecisionResultSchema = schema.object({ contractVersion: version(CONTRACT_VERSIONS.decisionResult), decisionId: identifier, serverRequestId: identifier, mode: schema.enum(["evaluation", "shadow"]), createdAt: timestamp, requestHash: sha256, executionEnvelopeHash: sha256, contextSnapshot: SituationalContextSnapshotSchema, contextBinding: SourceBindingSchema, worldBinding: WorldBindingSchema, userBinding: UserBindingSchema, candidatePool: CandidatePoolSnapshotSchema, candidatePoolBinding: SourceBindingSchema, engineManifest: EngineManifestSchema, baseline: schema.enum(["baseline-a-open-distance-popularity", "baseline-b-mood-intent"]), eligibilityResults: schema.array(EligibilityResultSchema, { max: 500 }), recommendations: schema.array(DecisionRecommendationSchema, { max: 20 }), limitations: schema.array(key, { max: 50 }), resultHash: sha256 });
export type DecisionResult = Infer<typeof DecisionResultSchema>;

const eligibleCandidateBrand: unique symbol = Symbol("EligibleCandidate");
export type EligibleCandidate = Readonly<{ candidate: WorldCandidate; eligibility: EligibilityResult & { readonly eligible: true }; retrievalSource: CandidatePoolSnapshot["candidates"][number]["retrievalSource"]; retrievalPosition: number; readonly [eligibleCandidateBrand]: true }>;
export function brandEligibleCandidate(value: Omit<EligibleCandidate, typeof eligibleCandidateBrand>): EligibleCandidate { if (value.eligibility.eligible !== true) throw new Error("ineligible_candidate_cannot_be_branded"); return Object.freeze({ ...value, [eligibleCandidateBrand]: true as const }); }
export const parseDecisionRequest = (value: unknown): DecisionRequest => DecisionRequestSchema.parse(value);
export const parseDecisionExecutionEnvelope = (value: unknown): DecisionExecutionEnvelope => DecisionExecutionEnvelopeSchema.parse(value);
export const parseDecisionResult = (value: unknown): DecisionResult => DecisionResultSchema.parse(value);
