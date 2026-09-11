import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const PHASE3B_VERSIONS = Object.freeze({
  founderDecisionRecord: "backyrd.decision-vnext.context-founder-decisions@3b-1",
  founderAuthority: "backyrd.decision-vnext.context-founder-authority@3b-1",
  founderTrustAnchor: "backyrd.decision-vnext.context-founder-trust-anchor@3b-1",
  registry: "backyrd.decision-vnext.context-registry@3b-1",
  registryRelease: "backyrd.decision-vnext.context-registry-release@3b-1",
  policy: "backyrd.decision-vnext.context-policy@3b-1",
  policyRelease: "backyrd.decision-vnext.context-policy-release@3b-1",
  resolverOutput: "backyrd.decision-vnext.context-resolver-output@3b-1",
  compositeObjective: "backyrd.decision-vnext.composite-context-objective@3b-1",
  candidateTier: "backyrd.decision-vnext.constraint-candidate-tier@3b-1",
  oracle: "backyrd.decision-vnext.context-oracle@3b-1",
  oracleAuthorityCatalog: "backyrd.decision-vnext.context-oracle-authority-catalog@3b-1",
  oracleTrustCatalog: "backyrd.decision-vnext.context-oracle-trust-catalog@3b-1",
  oracleReport: "backyrd.decision-vnext.context-oracle-report@3b-1",
  oracleWorkbench: "backyrd.decision-vnext.context-oracle-workbench@3b-1",
  combinedRelease: "backyrd.decision-vnext.context-release@3b-1",
  combinedTrustAnchor: "backyrd.decision-vnext.context-release-trust-anchor@3b-1",
  observationAdapter: "backyrd.decision-vnext.context-observation-adapter@3b-1",
} as const);

export const ProductReleaseFlagsSchema = schema.object({
  productionAuthorized: schema.literal(false),
  runtimeActivated: schema.literal(false),
  rankingWeightsConfigured: schema.literal(false),
  externalResolverConfigured: schema.literal(false),
  shadowTrafficAuthorized: schema.literal(false),
  productQualityClaim: schema.literal(false),
});

export const FounderDecisionSchema = schema.object({
  decisionId: identifier,
  title: schema.string({ min: 1, max: 160 }),
  selectedOption: identifier,
  instruction: schema.string({ min: 1, max: 2_000 }),
});
export const FounderDecisionRecordSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.founderDecisionRecord),
  recordId: identifier,
  sourcePhase: schema.literal("3A"),
  decisions: schema.array(FounderDecisionSchema, { min: 19, max: 19 }),
  flags: ProductReleaseFlagsSchema,
  recordHash: sha256,
});
export type FounderDecisionRecord = Infer<typeof FounderDecisionRecordSchema>;

export const FounderDecisionAuthoritySchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.founderAuthority),
  authorityId: identifier,
  issuer: schema.literal("BACKYRD_FOUNDER_CONTEXT_DECISION_AUTHORITY"),
  acceptedRecordId: identifier,
  acceptedRecordHash: sha256,
  validFrom: timestamp,
  validUntil: timestamp,
  flags: ProductReleaseFlagsSchema,
  authorityHash: sha256,
});
export type FounderDecisionAuthority = Infer<typeof FounderDecisionAuthoritySchema>;

export const FounderDecisionTrustAnchorSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.founderTrustAnchor),
  trustAnchorId: identifier,
  acceptedAuthorityId: identifier,
  acceptedAuthorityHash: sha256,
  acceptedIssuer: schema.literal("BACKYRD_FOUNDER_CONTEXT_DECISION_AUTHORITY"),
  flags: ProductReleaseFlagsSchema,
  anchorHash: sha256,
});
export type FounderDecisionTrustAnchor = Infer<typeof FounderDecisionTrustAnchorSchema>;

const nullableIdentifier = schema.union([identifier, schema.literal(null)] as const);
const nullableInteger = schema.union([schema.number({ integer: true, min: 0 }), schema.literal(null)] as const);

export const ProductContextConceptSchema = schema.object({
  conceptId: identifier,
  domain: schema.enum(["INTENT", "OCCASION", "MOOD", "COMPANION", "PRICE", "STAY_DURATION", "EXPLORATION", "WEATHER", "ACCESSIBILITY", "ELIGIBILITY"] as const),
  parentConceptId: nullableIdentifier,
  labels: schema.object({ de: schema.string({ min: 1, max: 100 }), en: schema.string({ min: 1, max: 100 }) }),
  lifecycle: schema.literal("DRAFT_PRODUCT_RELEASE"),
  eligibilityAuthority: schema.boolean(),
  rankingAuthority: schema.boolean(),
});
export type ProductContextConcept = Infer<typeof ProductContextConceptSchema>;

export const ContextRegistryReleaseSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.registry),
  registryId: identifier,
  registryVersion: version(PHASE3B_VERSIONS.registry),
  basedOnContextRegistryVersion: identifier,
  basedOnWorldRegistryVersion: schema.string({ min: 1, max: 160 }),
  founderDecisionRecordHash: sha256,
  lifecycle: schema.literal("DRAFT_PRODUCT_RELEASE"),
  concepts: schema.array(ProductContextConceptSchema, { min: 1, max: 100 }),
  unresolvedTaxonomies: schema.array(identifier, { min: 1, max: 30 }),
  flags: ProductReleaseFlagsSchema,
  registryHash: sha256,
});
export type ContextRegistryRelease = Infer<typeof ContextRegistryReleaseSchema>;

export const ContextRegistryReleaseRecordSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.registryRelease),
  releaseId: identifier,
  registryVersion: version(PHASE3B_VERSIONS.registry),
  registryHash: sha256,
  founderAuthorityHash: sha256,
  flags: ProductReleaseFlagsSchema,
  releaseHash: sha256,
});
export type ContextRegistryReleaseRecord = Infer<typeof ContextRegistryReleaseRecordSchema>;

export const RuleClassSchema = schema.enum(["OPENING_CURRENT", "KITCHEN_CURRENT", "ACCESSIBILITY", "AGE_OR_LEGAL", "BUDGET_MAXIMUM", "DISTANCE_MAXIMUM", "DURATION_MAXIMUM", "GROUP_CAPACITY", "RESERVATION", "TAKEAWAY", "PET_ACCESS", "GENERAL_OBJECTIVE"] as const);

export const UnknownRuleSchema = schema.object({
  ruleClass: RuleClassSchema,
  treatment: schema.enum(["EXCLUDE_IF_UNKNOWN", "UNCONFIRMED_FALLBACK", "REQUIRE_USER_CLARIFICATION", "FAIL_CLOSED", "NOT_CONFIGURED"] as const),
  clarificationLimitPerDecisionStep: schema.number({ integer: true, min: 0, max: 1 }),
});
export type UnknownRule = Infer<typeof UnknownRuleSchema>;

export const ProductContextPolicySchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.policy),
  policyId: identifier,
  policyVersion: version(PHASE3B_VERSIONS.policy),
  registryVersion: version(PHASE3B_VERSIONS.registry),
  registryHash: sha256,
  founderDecisionRecordHash: sha256,
  intentMode: schema.literal("HIERARCHICAL_WITH_COMPATIBLE_SECONDARY"),
  compositeSituationRequired: schema.literal(true),
  moodFreeTextMode: schema.literal("EPHEMERAL_RESOLVER_ONLY"),
  priceLevels: schema.array(schema.enum(["VERY_LOW", "LOW", "MEDIUM", "HIGH", "PREMIUM", "FLEXIBLE"] as const), { min: 6, max: 6 }),
  priceAnchor: schema.object({ market: schema.literal("CH"), currency: schema.literal("CHF"), category: schema.literal("FOOD_SERVICE"), consumption: schema.literal("DINNER"), perPerson: schema.literal(true), maximumAmount: schema.literal(20), interpretedLevel: schema.literal("LOW"), universalMapping: schema.literal(false) }),
  stayDurationBuckets: schema.array(schema.object({ key: schema.enum(["SHORT", "MEDIUM", "LONG"] as const), minimumMinutes: nullableInteger, maximumMinutes: nullableInteger }), { min: 3, max: 3 }),
  explorationModes: schema.array(schema.enum(["FAMILIAR", "OPEN_TO_BOTH", "DISCOVER_NEW"] as const), { min: 3, max: 3 }),
  hardConstraintAllowlist: schema.array(identifier, { min: 1, max: 30 }),
  subjectiveDimensionsAlwaysSoft: schema.array(identifier, { min: 1, max: 20 }),
  unknownRules: schema.array(UnknownRuleSchema, { min: 1, max: 30 }),
  sessionTimeLimitSeconds: nullableInteger,
  sessionCandidateLimit: nullableInteger,
  retentionSeconds: nullableInteger,
  rawTextPersistence: schema.literal("FORBIDDEN_AFTER_EPHEMERAL_RESOLUTION"),
  contextLearning: schema.literal("SEPARATE_AUTHORIZED_OBSERVATION_ONLY"),
  flags: ProductReleaseFlagsSchema,
  policyHash: sha256,
});
export type ProductContextPolicy = Infer<typeof ProductContextPolicySchema>;

export const ProductPolicyReleaseRecordSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.policyRelease),
  releaseId: identifier,
  policyVersion: version(PHASE3B_VERSIONS.policy),
  policyHash: sha256,
  registryReleaseHash: sha256,
  founderAuthorityHash: sha256,
  flags: ProductReleaseFlagsSchema,
  releaseHash: sha256,
});
export type ProductPolicyReleaseRecord = Infer<typeof ProductPolicyReleaseRecordSchema>;

export const ResolverInterpretationSchema = schema.object({
  conceptId: identifier,
  role: schema.enum(["PRIMARY", "SECONDARY", "OCCASION", "MOOD", "LOCATION", "BUDGET", "REQUIREMENT"] as const),
  knowledgeState: schema.enum(["KNOWN", "UNKNOWN", "NOT_CONFIGURED"] as const),
});
export const ResolverOutputSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.resolverOutput),
  resolverKind: schema.enum(["INTENT", "OCCASION", "MOOD", "LOCATION", "BUDGET", "HARD_SOFT_LANGUAGE"] as const),
  resolverId: identifier,
  resolverVersion: identifier,
  registryVersion: version(PHASE3B_VERSIONS.registry),
  inputHash: sha256,
  state: schema.enum(["RESOLVED", "PARTIALLY_RESOLVED", "AMBIGUOUS", "UNKNOWN", "DENIED", "NOT_CONFIGURED"] as const),
  interpretations: schema.array(ResolverInterpretationSchema, { max: 12 }),
  alternativeInterpretations: schema.array(ResolverInterpretationSchema, { max: 12 }),
  clarificationRequired: schema.boolean(),
  confidenceState: schema.enum(["SUPPORTED_FIXTURE", "AMBIGUOUS", "UNKNOWN", "NOT_CONFIGURED"] as const),
  sourceIdentity: identifier,
  rawTextPersisted: schema.literal(false),
  validUntil: timestamp,
  proofHash: sha256,
});
export type ResolverOutput = Infer<typeof ResolverOutputSchema>;

export const CompositeComponentSchema = schema.object({
  componentId: identifier,
  dimensionKey: identifier,
  conceptIds: schema.array(identifier, { min: 1, max: 10 }),
  requirement: schema.enum(["REQUIRED", "SOFT"] as const),
  knowledgeState: schema.enum(["KNOWN_TRUE", "UNKNOWN", "KNOWN_FALSE", "NOT_CONFIGURED"] as const),
  sourceHash: sha256,
  worldRelationRefs: schema.array(identifier, { max: 20 }),
  evidenceIds: schema.array(identifier, { max: 20 }),
});
export const CompositeContextObjectiveSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.compositeObjective),
  objectiveId: identifier,
  registryVersion: version(PHASE3B_VERSIONS.registry),
  policyVersion: version(PHASE3B_VERSIONS.policy),
  components: schema.array(CompositeComponentSchema, { min: 2, max: 20 }),
  dependencies: schema.array(schema.object({ fromComponentId: identifier, toComponentId: identifier, relationId: identifier }), { min: 1, max: 40 }),
  hardConstraintIds: schema.array(identifier, { max: 30 }),
  softPreferenceIds: schema.array(identifier, { max: 30 }),
  explanationTemplateId: identifier,
  objectiveHash: sha256,
});
export type CompositeContextObjective = Infer<typeof CompositeContextObjectiveSchema>;

export const CompositeFitResultSchema = schema.object({
  objectiveId: identifier,
  state: schema.enum(["AUTHORIZED_STRONG", "PARTIAL_WITH_LIMITATION", "NOT_SUPPORTED", "NOT_CONFIGURED"] as const),
  satisfiedComponentIds: schema.array(identifier, { max: 20 }),
  missingComponentIds: schema.array(identifier, { max: 20 }),
  evidenceIds: schema.array(identifier, { max: 50 }),
  reasonCode: identifier,
  explanationAuthorized: schema.boolean(),
  resultHash: sha256,
});
export type CompositeFitResult = Infer<typeof CompositeFitResultSchema>;

export const ConstraintCandidateTierSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.candidateTier),
  candidateId: identifier,
  ruleClass: RuleClassSchema,
  knowledgeState: schema.enum(["KNOWN_TRUE", "UNKNOWN", "KNOWN_FALSE", "NOT_CONFIGURED"] as const),
  tier: schema.enum(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "INELIGIBLE", "NOT_CONFIGURED"] as const),
  limitationCodes: schema.array(identifier, { max: 20 }),
  explanationState: schema.enum(["CONFIRMED", "UNCONFIRMED", "NOT_MATCHING", "NOT_CONFIGURED"] as const),
  tierHash: sha256,
});
export type ConstraintCandidateTier = Infer<typeof ConstraintCandidateTierSchema>;

export const ProductScenarioExpectationSchema = schema.object({
  scenarioId: identifier,
  founderDecisionRefs: schema.array(identifier, { min: 1, max: 19 }),
  baseScenarioIdentity: sha256,
  flipScenarioIdentity: sha256,
  changedDimensionKeys: schema.array(identifier, { min: 1, max: 30 }),
  candidateTierEffect: schema.enum(["UNCHANGED", "CONFIRMED_BEFORE_UNKNOWN", "UNKNOWN_FALLBACK", "KNOWN_FALSE_INELIGIBLE", "SESSION_EXCLUDED", "NOT_CONFIGURED"] as const),
  relativeRankingDirection: schema.enum(["UNCHANGED", "TOWARD_FLIP", "AWAY_FROM_REJECTED", "CONFIRMED_BEFORE_UNKNOWN", "NOT_CONFIGURED"] as const),
  clarificationBehavior: schema.enum(["NONE", "REQUIRED_IF_AMBIGUOUS", "REQUIRED", "NOT_CONFIGURED"] as const),
  explanationBehavior: identifier,
  invariantBindings: schema.array(identifier, { min: 1, max: 20 }),
  unchangedBindingHashes: schema.array(sha256, { min: 3, max: 20 }),
});
export type ProductScenarioExpectation = Infer<typeof ProductScenarioExpectationSchema>;
export const ProductScenarioOracleSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.oracle),
  oracleId: identifier,
  oracleVersion: version(PHASE3B_VERSIONS.oracle),
  expectation: ProductScenarioExpectationSchema,
  founderApproved: schema.literal(true),
  productionAuthorized: schema.literal(false),
  productQualityClaim: schema.literal(false),
  oracleHash: sha256,
});
export type ProductScenarioOracle = Infer<typeof ProductScenarioOracleSchema>;

export const ProductOracleAuthorityEntrySchema = schema.object({
  authorityId: identifier,
  scenarioId: identifier,
  oracleId: identifier,
  oracleHash: sha256,
  founderAuthorityHash: sha256,
  registryHash: sha256,
  policyHash: sha256,
  validFrom: timestamp,
  validUntil: timestamp,
  flags: ProductReleaseFlagsSchema,
  authorityHash: sha256,
});
export const ProductOracleAuthorityCatalogSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.oracleAuthorityCatalog),
  catalogId: identifier,
  scenarioAllowlist: schema.array(identifier, { min: 28, max: 28 }),
  entries: schema.array(ProductOracleAuthorityEntrySchema, { min: 28, max: 28 }),
  flags: ProductReleaseFlagsSchema,
  catalogHash: sha256,
});
export type ProductOracleAuthorityCatalog = Infer<typeof ProductOracleAuthorityCatalogSchema>;

export const ProductOracleTrustEntrySchema = schema.object({
  trustAnchorId: identifier,
  scenarioId: identifier,
  acceptedAuthorityId: identifier,
  acceptedAuthorityHash: sha256,
  flags: ProductReleaseFlagsSchema,
  anchorHash: sha256,
});
export const ProductOracleTrustCatalogSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.oracleTrustCatalog),
  catalogId: identifier,
  authorityCatalogHash: sha256,
  scenarioAllowlist: schema.array(identifier, { min: 28, max: 28 }),
  entries: schema.array(ProductOracleTrustEntrySchema, { min: 28, max: 28 }),
  flags: ProductReleaseFlagsSchema,
  catalogHash: sha256,
});
export type ProductOracleTrustCatalog = Infer<typeof ProductOracleTrustCatalogSchema>;

export const ProductContextCombinedReleaseSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.combinedRelease),
  releaseId: version(PHASE3B_VERSIONS.combinedRelease),
  founderDecisionRecordHash: sha256,
  founderAuthorityHash: sha256,
  founderTrustAnchorHash: sha256,
  registryHash: sha256,
  registryReleaseHash: sha256,
  policyHash: sha256,
  policyReleaseHash: sha256,
  oracleAuthorityCatalogHash: sha256,
  oracleTrustCatalogHash: sha256,
  scenarioAllowlist: schema.array(identifier, { min: 28, max: 28 }),
  flags: ProductReleaseFlagsSchema,
  releaseHash: sha256,
});
export type ProductContextCombinedRelease = Infer<typeof ProductContextCombinedReleaseSchema>;

export const ProductContextReleaseTrustAnchorSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.combinedTrustAnchor),
  trustAnchorId: identifier,
  acceptedReleaseId: version(PHASE3B_VERSIONS.combinedRelease),
  acceptedReleaseHash: sha256,
  signatureAlgorithm: schema.literal("Ed25519"),
  verificationKeyId: identifier,
  releaseHashSignature: schema.string({ min: 80, max: 120, pattern: /^[A-Za-z0-9+/]+={0,2}$/ }),
  authorityScope: schema.literal("SYNTHETIC_FIXTURE_ONLY"),
  productionCapable: schema.literal(false),
  productApproved: schema.literal(false),
  flags: ProductReleaseFlagsSchema,
  anchorHash: sha256,
});
export type ProductContextReleaseTrustAnchor = Infer<typeof ProductContextReleaseTrustAnchorSchema>;

export const ProductScenarioReportSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.oracleReport),
  scenarioId: identifier,
  oracleId: identifier,
  oracleHash: sha256,
  authorityHash: sha256,
  releaseHash: sha256,
  actual: ProductScenarioExpectationSchema,
  writesUserIntelligence: schema.literal(false),
  rawTextPersisted: schema.literal(false),
  commercialInfluence: schema.literal("FORBIDDEN"),
  reportHash: sha256,
});
export type ProductScenarioReport = Infer<typeof ProductScenarioReportSchema>;

export const ProductOracleWorkbenchSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.oracleWorkbench),
  releaseHash: sha256,
  scenarios: schema.array(ProductScenarioReportSchema, { min: 28, max: 28 }),
  productQualityClaim: schema.literal(false),
  runtimeActivated: schema.literal(false),
  workbenchHash: sha256,
});
export type ProductOracleWorkbench = Infer<typeof ProductOracleWorkbenchSchema>;

export const ContextObservationAdapterResultSchema = schema.object({
  contractVersion: version(PHASE3B_VERSIONS.observationAdapter),
  action: schema.enum(["ALTERNATIVE_REQUESTED", "SPOT_REJECTED_FOR_CURRENT_DECISION", "SEARCH_CONTEXT"] as const),
  status: schema.enum(["NOT_APPLICABLE", "DENIED", "NOT_CONFIGURED"] as const),
  reasonCode: identifier,
  userEventProduced: schema.literal(false),
  writesUserIntelligence: schema.literal(false),
  resultHash: sha256,
});
export type ContextObservationAdapterResult = Infer<typeof ContextObservationAdapterResultSchema>;
