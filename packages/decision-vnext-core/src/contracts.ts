import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const CONTRACT_VERSIONS = Object.freeze({
  decisionRequest: "backyrd-vnext-decision-request-v1",
  executionEnvelope: "backyrd-vnext-execution-envelope-v1",
  contextSnapshot: "backyrd-vnext-context-snapshot-v1",
  worldKnowledgePort: "backyrd-vnext-world-knowledge-port-v1",
  worldCandidate: "backyrd-vnext-world-candidate-v1",
  candidatePool: "backyrd-vnext-candidate-pool-v1",
  eligibility: "backyrd-vnext-eligibility-result-v1",
  fitDimensions: "backyrd-vnext-fit-dimensions-v1",
  confidence: "backyrd-vnext-confidence-v1",
  evidence: "backyrd-vnext-evidence-v1",
  recommendation: "backyrd-vnext-recommendation-v1",
  decisionResult: "backyrd-vnext-decision-result-v1",
  engineManifest: "backyrd-vnext-engine-manifest-v1",
} as const);

const key = schema.string({ min: 1, max: 120, pattern: /^[a-z][a-z0-9_.-]*$/ });
const bounded = schema.number({ min: 0, max: 1 });
const city = schema.string({ min: 1, max: 120 });
const spotId = identifier;
const evidenceId = schema.string({ pattern: /^ev-[a-z0-9-]+$/ });
const factId = schema.string({ pattern: /^fact-[a-z0-9-]+$/ });

export const HardConstraintSchema = schema.union([
  schema.object({ kind: schema.literal("open_now"), value: schema.boolean() }),
]);

export const SoftPreferenceSchema = schema.object({
  key,
  value: schema.union([schema.string({ max: 120 }), schema.number(), schema.boolean()]),
  status: schema.literal("phase1-placeholder"),
});

export const DecisionRequestSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.decisionRequest),
  idempotencyKey: identifier,
  clientRequestedAt: timestamp,
  location: schema.union([
    schema.object({ kind: schema.literal("city"), city }),
    schema.object({ kind: schema.literal("coordinate"), latitude: schema.number({ min: -90, max: 90 }), longitude: schema.number({ min: -180, max: 180 }) }),
  ]),
  intentKeys: schema.array(key, { max: 20 }),
  moodKeys: schema.array(key, { max: 20 }),
  socialContext: schema.optional(key),
  hardConstraints: schema.array(HardConstraintSchema, { max: 20 }),
  softPreferences: schema.array(SoftPreferenceSchema, { max: 20 }),
  freeText: schema.optional(schema.string({ max: 1_000 })),
  client: schema.object({ surface: schema.enum(["mobile", "web", "synthetic"]), version: identifier }),
});
export type DecisionRequest = Infer<typeof DecisionRequestSchema>;

export const EngineManifestSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.engineManifest),
  contractSetVersion: schema.literal("backyrd-vnext-contract-set-v1"),
  decisionRequestVersion: schema.literal(CONTRACT_VERSIONS.decisionRequest),
  decisionResultVersion: schema.literal(CONTRACT_VERSIONS.decisionResult),
  engineVersion: identifier,
  sourceSha: schema.string({ pattern: /^(?:[a-f0-9]{40}|phase1-[a-z0-9-]+)$/ }),
  sandboxWorldVersion: identifier,
  worldRegistryVersion: identifier,
  contextVersion: identifier,
  candidateGeneratorVersion: identifier,
  eligibilityRulesetVersion: identifier,
  featureSetVersion: identifier,
  rankingVersion: identifier,
  weightFixtureVersion: identifier,
  taxonomyFixtureVersion: identifier,
  confidenceVersion: identifier,
  evidenceVersion: identifier,
  explanationVersion: identifier,
  manifestHash: sha256,
});
export type EngineManifest = Infer<typeof EngineManifestSchema>;

export const DecisionExecutionEnvelopeSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.executionEnvelope),
  authenticatedActor: schema.union([
    schema.object({ kind: schema.literal("user"), userId: identifier }),
    schema.object({ kind: schema.literal("anonymous") }),
  ]),
  serverRequestId: identifier,
  sessionId: identifier,
  executedAt: timestamp,
  rolloutMode: schema.enum(["evaluation", "shadow"]),
  deadlineAt: timestamp,
  serverIdempotencyKey: identifier,
  engineManifest: EngineManifestSchema,
});
export type DecisionExecutionEnvelope = Infer<typeof DecisionExecutionEnvelopeSchema>;

export const DecisionContextSnapshotSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.contextSnapshot),
  serverRequestId: identifier,
  resolvedAt: timestamp,
  location: schema.object({ kind: schema.literal("city"), city }),
  intentKeys: schema.array(key, { max: 20 }),
  moodKeys: schema.array(key, { max: 20 }),
  socialContext: schema.optional(key),
  hardConstraints: schema.array(HardConstraintSchema, { max: 20 }),
  softPreferences: schema.array(SoftPreferenceSchema, { max: 20 }),
  limitations: schema.array(key, { max: 20 }),
  contextHash: sha256,
});
export type DecisionContextSnapshot = Infer<typeof DecisionContextSnapshotSchema>;

export const WorldConceptRefSchema = schema.object({
  registryVersion: identifier,
  conceptId: identifier,
});
export type WorldConceptRef = Infer<typeof WorldConceptRefSchema>;

export const WorldEntityRefSchema = schema.object({
  entityType: schema.enum(["spot", "event", "temporary_place"]),
  entityId: identifier,
});
export type WorldEntityRef = Infer<typeof WorldEntityRefSchema>;

const WorldSourceSchema = schema.union([
  schema.object({ kind: schema.literal("synthetic_fixture"), sourceId: identifier, sourceVersion: identifier }),
  schema.object({ kind: schema.literal("world_knowledge_port"), sourceId: identifier, sourceVersion: identifier }),
]);

const VerificationSchema = schema.object({
  status: schema.enum(["unverified", "source_asserted", "independently_verified", "synthetic_fixture"]),
  methodVersion: identifier,
  verifiedAt: schema.union([timestamp, schema.literal(null)]),
});

const EvidenceSourceSchema = schema.object({
  kind: schema.literal("synthetic_world"),
  sourceId: identifier,
  observedAt: timestamp,
});

const evidenceBase = {
  contractVersion: version(CONTRACT_VERSIONS.evidence),
  evidenceId,
  spotId,
  source: EvidenceSourceSchema,
  confidence: bounded,
  evidenceHash: sha256,
} as const;

export const EvidenceItemSchema = schema.union([
  schema.object({ ...evidenceBase, kind: schema.literal("distribution"), value: schema.object({ allowed: schema.boolean() }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("city"), value: schema.object({ city }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("open_status"), value: schema.object({ status: schema.enum(["open", "closed", "unknown"]) }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("distance"), value: schema.object({ meters: schema.number({ min: 0 }) }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("popularity"), value: schema.object({ normalized: bounded }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("intent_tags"), value: schema.object({ keys: schema.array(key, { max: 20 }) }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("mood_tags"), value: schema.object({ keys: schema.array(key, { max: 20 }) }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("data_quality"), value: schema.object({ normalized: bounded, state: schema.enum(["complete", "partial", "weak"]) }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("world_concept"), value: schema.object({ concept: WorldConceptRefSchema }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("world_relation"), value: schema.object({ relationConcept: WorldConceptRefSchema }) }),
  schema.object({ ...evidenceBase, kind: schema.literal("uncertainty"), value: schema.object({ limitationCode: key }) }),
]);
export type EvidenceItem = Infer<typeof EvidenceItemSchema>;

const WorldAssertedValueSchema = schema.union([
  schema.object({ kind: schema.literal("boolean"), value: schema.literal(true) }),
  schema.object({ kind: schema.literal("number"), value: schema.number(), unit: key }),
  schema.object({ kind: schema.literal("text"), value: schema.string({ max: 500 }) }),
  schema.object({ kind: schema.literal("concept"), value: WorldConceptRefSchema }),
  schema.object({ kind: schema.literal("concept_set"), values: schema.array(WorldConceptRefSchema, { max: 50 }) }),
  schema.object({ kind: schema.literal("open_status"), value: schema.enum(["open", "closed", "unknown"]) }),
]);

const WorldReportedValueSchema = schema.union([
  schema.object({ kind: schema.literal("boolean"), value: schema.boolean() }),
  schema.object({ kind: schema.literal("number"), value: schema.number(), unit: key }),
  schema.object({ kind: schema.literal("text"), value: schema.string({ max: 500 }) }),
  schema.object({ kind: schema.literal("concept"), value: WorldConceptRefSchema }),
  schema.object({ kind: schema.literal("concept_set"), values: schema.array(WorldConceptRefSchema, { max: 50 }) }),
  schema.object({ kind: schema.literal("open_status"), value: schema.enum(["open", "closed"]) }),
]);

export const WorldFactValueSchema = schema.union([
  WorldReportedValueSchema,
  schema.object({ kind: schema.literal("unavailable") }),
]);
export type WorldFactValue = Infer<typeof WorldFactValueSchema>;

const worldFactBase = {
  factId,
  concept: WorldConceptRefSchema,
  source: WorldSourceSchema,
  verification: VerificationSchema,
  observedAt: timestamp,
  validFrom: schema.union([timestamp, schema.literal(null)]),
  validUntil: schema.union([timestamp, schema.literal(null)]),
  confidence: bounded,
  evidenceIds: schema.array(evidenceId, { max: 20 }),
  factHash: sha256,
} as const;

export const WorldFactSchema = schema.union([
  schema.object({ ...worldFactBase, state: schema.literal("known"), value: WorldAssertedValueSchema }),
  schema.object({ ...worldFactBase, state: schema.literal("known_false"), value: schema.object({ kind: schema.literal("boolean"), value: schema.literal(false) }) }),
  schema.object({ ...worldFactBase, state: schema.literal("unknown"), value: schema.object({ kind: schema.literal("unavailable") }) }),
  schema.object({ ...worldFactBase, state: schema.literal("not_applicable"), value: schema.object({ kind: schema.literal("unavailable") }) }),
  schema.object({ ...worldFactBase, state: schema.literal("disputed"), value: WorldReportedValueSchema }),
  schema.object({ ...worldFactBase, state: schema.literal("expired"), value: WorldReportedValueSchema }),
]);
export type WorldFact = Infer<typeof WorldFactSchema>;

export const WorldConceptRelationSchema = schema.object({
  relationId: identifier,
  relationConcept: WorldConceptRefSchema,
  fromConcept: WorldConceptRefSchema,
  toConcept: WorldConceptRefSchema,
  evidenceIds: schema.array(evidenceId, { max: 20 }),
  relationHash: sha256,
});
export type WorldConceptRelation = Infer<typeof WorldConceptRelationSchema>;

export const DerivedSituationFitSchema = schema.object({
  derivedFitId: identifier,
  fitConcept: WorldConceptRefSchema,
  derivationVersion: identifier,
  derivedFromFactIds: schema.array(factId, { max: 50 }),
  evidenceIds: schema.array(evidenceId, { max: 50 }),
  confidence: bounded,
  derivedFitHash: sha256,
});
export type DerivedSituationFit = Infer<typeof DerivedSituationFitSchema>;

export const WorldEntityRelationSchema = schema.object({
  relationId: identifier,
  relationConcept: WorldConceptRefSchema,
  fromEntity: WorldEntityRefSchema,
  toEntity: WorldEntityRefSchema,
  evidenceIds: schema.array(evidenceId, { max: 20 }),
  relationHash: sha256,
});
export type WorldEntityRelation = Infer<typeof WorldEntityRelationSchema>;

export const WorldKnowledgeSchema = schema.object({
  registryVersion: identifier,
  spotEntity: schema.object({ entityType: schema.literal("spot"), entityId: identifier }),
  categoryAssignments: schema.array(WorldFactSchema, { max: 40 }),
  subcategories: schema.array(WorldFactSchema, { max: 100 }),
  decisionIntents: schema.object({
    facts: schema.array(WorldFactSchema, { max: 100 }),
    capabilityRelations: schema.array(WorldConceptRelationSchema, { max: 200 }),
  }),
  capabilities: schema.array(WorldFactSchema, { max: 100 }),
  situationFit: schema.object({
    directClaims: schema.array(WorldFactSchema, { max: 100 }),
    derivedFits: schema.array(DerivedSituationFitSchema, { max: 100 }),
  }),
  amenitiesAndConstraints: schema.array(WorldFactSchema, { max: 200 }),
  temporalAndCurrentState: schema.array(WorldFactSchema, { max: 200 }),
  evidenceAndConfidence: schema.object({
    evidence: schema.array(EvidenceItemSchema, { max: 200 }),
    status: schema.literal("uncalibrated-phase1"),
    coverage: bounded,
    limitations: schema.array(key, { max: 50 }),
  }),
  relatedEntities: schema.array(WorldEntityRelationSchema, { max: 100 }),
  knowledgeHash: sha256,
});
export type WorldKnowledge = Infer<typeof WorldKnowledgeSchema>;

export const WorldCandidateSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.worldCandidate),
  spotId,
  city,
  distanceMeters: schema.number({ min: 0 }),
  distributionAllowed: schema.boolean(),
  openStatus: schema.enum(["open", "closed", "unknown"]),
  fixturePopularity: bounded,
  fixtureDataQuality: bounded,
  worldKnowledge: WorldKnowledgeSchema,
  candidateHash: sha256,
});
export type WorldCandidate = Infer<typeof WorldCandidateSchema>;

export const CandidatePoolSnapshotSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.candidatePool),
  serverRequestId: identifier,
  worldVersion: identifier,
  candidateGeneratorVersion: identifier,
  candidates: schema.array(schema.object({
    candidate: WorldCandidateSchema,
    retrievalSource: schema.union([
      schema.object({ kind: schema.literal("synthetic_fixture"), sourceId: identifier, personalized: schema.literal(false) }),
      schema.object({ kind: schema.literal("versioned_adapter"), sourceId: identifier, personalized: schema.literal(false) }),
    ]),
    retrievalPosition: schema.number({ integer: true, min: 1 }),
  }), { max: 500 }),
  candidatePoolHash: sha256,
});
export type CandidatePoolSnapshot = Infer<typeof CandidatePoolSnapshotSchema>;

export const EligibilityCheckSchema = schema.object({
  ruleId: schema.enum(["distribution-allowed-v1", "explicit-city-match-v1", "explicit-open-now-v1"]),
  rulesetVersion: schema.literal("backyrd-vnext-eligibility-phase1-v1"),
  outcome: schema.enum(["pass", "fail", "unknown"]),
  evidenceIds: schema.array(evidenceId, { max: 10 }),
  unknownPolicy: schema.enum(["not-applicable", "fail"]),
});

export const EligibilityResultSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.eligibility),
  spotId,
  eligible: schema.boolean(),
  checks: schema.array(EligibilityCheckSchema, { max: 3 }),
  resultHash: sha256,
});
export type EligibilityResult = Infer<typeof EligibilityResultSchema>;

export const FitDimensionsSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.fitDimensions),
  spotId,
  featureSetVersion: schema.literal("backyrd-vnext-phase1-fixture-features-v1"),
  dimensions: schema.array(schema.object({
    key: schema.enum(["fixture.open", "fixture.distance", "fixture.popularity", "fixture.intent_match", "fixture.mood_match"]),
    rawValue: bounded,
    evidenceIds: schema.array(evidenceId, { max: 20 }),
    status: schema.literal("unapproved-product-placeholder"),
  }), { max: 10 }),
  fitHash: sha256,
});
export type FitDimensions = Infer<typeof FitDimensionsSchema>;

export const ConfidenceSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.confidence),
  status: schema.literal("uncalibrated-phase1"),
  components: schema.array(schema.object({
    key: schema.enum(["world_fact_coverage", "world_freshness", "context_completeness", "user_knowledge", "ranking_separation", "retrieval_agreement"]),
    evaluationValue: bounded,
  }), { max: 6 }),
  limitations: schema.array(schema.object({ code: key, evidenceIds: schema.array(evidenceId, { max: 20 }) }), { max: 20 }),
  confidenceHash: sha256,
});
export type Confidence = Infer<typeof ConfidenceSchema>;

export const AuthorizedReasonSchema = schema.object({
  reasonCode: schema.enum(["verified_open", "nearby_fixture", "popularity_fixture", "intent_match_fixture", "mood_match_fixture", "weak_world_evidence"]),
  evidenceIds: schema.array(evidenceId, { max: 20 }),
  renderedText: schema.string({ min: 1, max: 300 }),
});
export type AuthorizedReason = Infer<typeof AuthorizedReasonSchema>;

export const DecisionRecommendationSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.recommendation),
  spotId,
  rank: schema.number({ integer: true, min: 1 }),
  eligibility: EligibilityResultSchema,
  fit: FitDimensionsSchema,
  confidence: ConfidenceSchema,
  reasons: schema.array(AuthorizedReasonSchema, { max: 10 }),
  recommendationHash: sha256,
});
export type DecisionRecommendation = Infer<typeof DecisionRecommendationSchema>;

export const DecisionResultSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.decisionResult),
  decisionId: identifier,
  serverRequestId: identifier,
  mode: schema.enum(["evaluation", "shadow"]),
  createdAt: timestamp,
  requestHash: sha256,
  contextSnapshot: DecisionContextSnapshotSchema,
  candidatePool: CandidatePoolSnapshotSchema,
  engineManifest: EngineManifestSchema,
  baseline: schema.enum(["baseline-a-open-distance-popularity", "baseline-b-mood-intent"]),
  recommendations: schema.array(DecisionRecommendationSchema, { max: 20 }),
  resultHash: sha256,
});
export type DecisionResult = Infer<typeof DecisionResultSchema>;

const eligibleCandidateBrand: unique symbol = Symbol("EligibleCandidate");
export type EligibleCandidate = Readonly<{
  candidate: WorldCandidate;
  eligibility: EligibilityResult & { readonly eligible: true };
  retrievalSource: CandidatePoolSnapshot["candidates"][number]["retrievalSource"];
  retrievalPosition: number;
  readonly [eligibleCandidateBrand]: true;
}>;

export function brandEligibleCandidate(value: Omit<EligibleCandidate, typeof eligibleCandidateBrand>): EligibleCandidate {
  if (value.eligibility.eligible !== true) throw new Error("ineligible_candidate_cannot_be_branded");
  return Object.freeze({ ...value, [eligibleCandidateBrand]: true as const });
}

export const parseDecisionRequest = (value: unknown): DecisionRequest => DecisionRequestSchema.parse(value);
export const parseDecisionExecutionEnvelope = (value: unknown): DecisionExecutionEnvelope => DecisionExecutionEnvelopeSchema.parse(value);
export const parseDecisionResult = (value: unknown): DecisionResult => DecisionResultSchema.parse(value);
