import { DecisionRequestSchema } from "./contracts.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

const key = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });
const city = schema.string({ min: 1, max: 120 });

export const CONTEXT_KERNEL_VERSIONS = Object.freeze({
  clientInput: "backyrd-vnext-context-kernel-client-input-v1",
  registry: "backyrd-vnext-context-dimension-registry-v1",
  policy: "backyrd-vnext-context-policy-v1",
  authority: "backyrd-vnext-context-authority-v1",
  trustAnchor: "backyrd-vnext-context-authority-trust-anchor-v1",
  executionEnvelope: "backyrd-vnext-context-execution-envelope-v1",
  snapshot: "backyrd-vnext-situational-context-kernel-v1",
  weatherPort: "backyrd-vnext-context-weather-port-v1",
  oracle: "backyrd-vnext-context-oracle-v1",
  oracleAuthority: "backyrd-vnext-context-oracle-authority-v1",
  flipReport: "backyrd-vnext-context-flip-report-v1",
  degradation: "backyrd-vnext-context-degradation-v1",
} as const);

export const CONTEXT_AUTHORITIES = ["EXPLICIT", "SERVER_AUTHORIZED", "DERIVED", "UNKNOWN", "NOT_CONFIGURED", "NOT_AVAILABLE", "DENIED"] as const;
export const CONTEXT_CONSUMERS = ["ELIGIBILITY", "RANKING", "EXPLANATION", "EVALUATION"] as const;
export const CONTEXT_UNKNOWN_POLICIES = ["EXCLUDE_IF_UNKNOWN", "ALLOW_WITH_LIMITATION", "REQUIRE_USER_CLARIFICATION", "NOT_CONFIGURED", "FAIL_CLOSED"] as const;

export const LocationScopeSchema = schema.object({
  kind: schema.literal("CITY_SCOPE"),
  city,
  radiusMeters: schema.optional(schema.number({ integer: true, min: 1, max: 200_000 })),
  accuracy: schema.enum(["CITY_ONLY", "APPROXIMATE", "AUTHORIZED_RADIUS", "UNKNOWN"] as const),
});
export type LocationScope = Infer<typeof LocationScopeSchema>;

export const ContextTypedValueSchema = schema.union([
  schema.object({ kind: schema.literal("BOOLEAN"), value: schema.boolean() }),
  schema.object({ kind: schema.literal("DURATION_MINUTES"), minutes: schema.number({ integer: true, min: 0, max: 100_800 }) }),
  schema.object({ kind: schema.literal("DISTANCE_METERS"), meters: schema.number({ integer: true, min: 0, max: 200_000 }) }),
  schema.object({ kind: schema.literal("CONCEPT_REFS"), registryVersion: key, conceptIds: schema.array(key, { min: 1, max: 20 }) }),
  schema.object({ kind: schema.literal("OPAQUE_FIXTURE_KEY"), namespace: key, value: key }),
  schema.object({ kind: schema.literal("WEATHER_OBSERVATION"), conditionRef: key, observedAt: timestamp, validUntil: timestamp, geographicScopeHash: sha256, freshness: schema.enum(["FRESH", "STALE", "UNKNOWN"] as const) }),
]);
export type ContextTypedValue = Infer<typeof ContextTypedValueSchema>;

export const ContextDimensionDefinitionSchema = schema.object({
  dimensionKey: key,
  contractVersion: key,
  domain: schema.enum(["TIME", "LOCATION", "COMPANION", "INTENT", "OCCASION", "MOOD", "BUDGET", "AVAILABLE_TIME", "WEATHER", "SESSION", "EXPLORATION", "CONSTRAINT"] as const),
  dataType: schema.enum(["BOOLEAN", "DURATION_MINUTES", "DISTANCE_METERS", "CONCEPT_REFS", "OPAQUE_FIXTURE_KEY", "WEATHER_OBSERVATION"] as const),
  allowedAuthorities: schema.array(schema.enum(CONTEXT_AUTHORITIES), { min: 1, max: 7 }),
  sensitivity: schema.enum(["NON_PERSONAL", "PSEUDONYMOUS", "PERSONAL", "SENSITIVE"] as const),
  persistence: schema.enum(["SNAPSHOT", "EPHEMERAL_ONLY", "NEVER"] as const),
  maximumPrecision: schema.enum(["CITY", "CITY_RADIUS", "MINUTES", "CONCEPT_REFERENCE", "BOOLEAN", "OPAQUE_TECHNICAL", "NONE"] as const),
  validity: schema.enum(["RUN_ONLY", "SESSION", "UNTIL_EXPLICIT_EXPIRY"] as const),
  allowedConsumers: schema.array(schema.enum(CONTEXT_CONSUMERS), { max: 4 }),
  eligibilityRelevance: schema.enum(["NONE", "POLICY_GATED"] as const),
  rankingRelevance: schema.enum(["NONE", "POLICY_GATED"] as const),
  explanationRelevance: schema.enum(["NONE", "AUTHORIZED_EVIDENCE_ONLY"] as const),
  learningPolicy: schema.enum(["FORBIDDEN", "REQUIRES_SEPARATE_AUTHORIZED_EVENT"] as const),
  unknownPolicyRequired: schema.boolean(),
  status: schema.enum(["ACTIVE", "DRAFT", "DEPRECATED", "NOT_CONFIGURED"] as const),
});
export type ContextDimensionDefinition = Infer<typeof ContextDimensionDefinitionSchema>;

export const ContextDimensionRegistrySchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.registry),
  registryId: identifier,
  registryVersion: key,
  fixtureOnly: schema.boolean(),
  productTaxonomyConfigured: schema.literal(false),
  definitions: schema.array(ContextDimensionDefinitionSchema, { min: 1, max: 100 }),
  registryHash: sha256,
});
export type ContextDimensionRegistry = Infer<typeof ContextDimensionRegistrySchema>;

export const ContextConstraintPolicySchema = schema.object({
  policyId: identifier,
  dimensionKey: key,
  operator: schema.enum(["REQUIRE_TRUE", "MAXIMUM", "EQUALS", "CONTAINS_CONCEPT"] as const),
  unknownPolicy: schema.enum(CONTEXT_UNKNOWN_POLICIES),
  fixtureOnly: schema.boolean(),
  productApproved: schema.literal(false),
});

export const ContextPolicySchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.policy),
  policyId: identifier,
  policyVersion: key,
  registryVersion: key,
  registryHash: sha256,
  fixtureOnly: schema.boolean(),
  productSemanticsConfigured: schema.literal(false),
  maximumClientClockSkewSeconds: schema.number({ integer: true, min: 0, max: 86_400 }),
  maximumOfflineAgeSeconds: schema.number({ integer: true, min: 0, max: 2_592_000 }),
  maximumWeatherAgeSeconds: schema.number({ integer: true, min: 0, max: 604_800 }),
  maximumSessionCandidates: schema.number({ integer: true, min: 1, max: 1_000 }),
  acceptedDerivedRules: schema.array(schema.object({ ruleId: identifier, ruleVersion: key }), { max: 30 }),
  constraintPolicies: schema.array(ContextConstraintPolicySchema, { max: 30 }),
  policyHash: sha256,
});
export type ContextPolicy = Infer<typeof ContextPolicySchema>;

export const ServerSessionStateSchema = schema.object({
  shownCandidateIds: schema.array(identifier, { max: 1_000 }),
  openedCandidateIds: schema.array(identifier, { max: 1_000 }),
  rejectedCandidateIds: schema.array(identifier, { max: 1_000 }),
  alternativeRequestCount: schema.number({ integer: true, min: 0, max: 1_000 }),
  stateHash: sha256,
});
export type ServerSessionState = Infer<typeof ServerSessionStateSchema>;

export const ContextAuthorityRecordSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.authority),
  authorityId: identifier,
  authorityKind: schema.literal("SYNTHETIC_SERVER_CONTEXT_AUTHORITY"),
  decisionId: identifier,
  sessionId: identifier,
  actorSubjectBindingHash: sha256,
  serverTime: timestamp,
  expiresAt: timestamp,
  clientLocationInputHash: sha256,
  authorizedLocationScope: LocationScopeSchema,
  locationComparison: schema.literal("MATCH"),
  locationPermission: schema.enum(["GRANTED", "DENIED", "NOT_AVAILABLE"] as const),
  locationSource: schema.enum(["SYNTHETIC_AUTHORIZED_PROVIDER", "EXPLICIT_CITY_SELECTION", "SERVER_POLICY"] as const),
  timeZone: key,
  acceptedRegistryVersion: key,
  acceptedRegistryHash: sha256,
  acceptedPolicyVersion: key,
  acceptedPolicyHash: sha256,
  worldSnapshotBindingHash: sha256,
  userProjectionBindingHash: sha256,
  candidatePoolBindingHash: sha256,
  eligibilityPolicyBindingHash: sha256,
  degradationPolicyBindingHash: sha256,
  weatherObservationBinding: schema.union([schema.object({ sourceHash: sha256, conditionRef: key, observedAt: timestamp, validUntil: timestamp, geographicScopeHash: sha256 }), schema.literal(null)]),
  sessionState: ServerSessionStateSchema,
  authorityHash: sha256,
});
export type ContextAuthorityRecord = Infer<typeof ContextAuthorityRecordSchema>;

export const ContextAuthorityTrustAnchorSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.trustAnchor),
  trustAnchorId: identifier,
  acceptedAuthorityId: identifier,
  acceptedAuthorityHash: sha256,
  acceptedRegistryHash: sha256,
  acceptedPolicyHash: sha256,
  acceptedWorldSnapshotBindingHash: sha256,
  acceptedUserProjectionBindingHash: sha256,
  acceptedCandidatePoolBindingHash: sha256,
  acceptedEligibilityPolicyBindingHash: sha256,
  acceptedDegradationPolicyBindingHash: sha256,
  authorityKind: schema.literal("SYNTHETIC_SERVER_CONTEXT_AUTHORITY"),
  productionCapable: schema.literal(false),
});
export type ContextAuthorityTrustAnchor = Infer<typeof ContextAuthorityTrustAnchorSchema>;

export const ExplicitContextInputSchema = schema.object({
  dimensionKey: key,
  value: ContextTypedValueSchema,
});
export const ClientConstraintDeclarationSchema = schema.object({
  constraintId: identifier,
  dimensionKey: key,
  operator: schema.enum(["REQUIRE_TRUE", "MAXIMUM", "EQUALS", "CONTAINS_CONCEPT"] as const),
  expectedValue: ContextTypedValueSchema,
});
export const ClientSoftPreferenceSchema = schema.object({
  preferenceId: identifier,
  dimensionKey: key,
  preferredValue: ContextTypedValueSchema,
});
export const ContextKernelClientInputSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.clientInput),
  request: DecisionRequestSchema,
  explicitDimensions: schema.array(ExplicitContextInputSchema, { max: 40 }),
  hardConstraints: schema.array(ClientConstraintDeclarationSchema, { max: 30 }),
  softPreferences: schema.array(ClientSoftPreferenceSchema, { max: 30 }),
});
export type ContextKernelClientInput = Infer<typeof ContextKernelClientInputSchema>;

const KnownExplicitDimensionSchema = schema.object({ dimensionKey: key, state: schema.literal("KNOWN"), authority: schema.literal("EXPLICIT"), value: ContextTypedValueSchema, sourceHash: sha256, validUntil: schema.union([timestamp, schema.literal(null)]), dimensionHash: sha256 });
const KnownServerDimensionSchema = schema.object({ dimensionKey: key, state: schema.literal("KNOWN"), authority: schema.literal("SERVER_AUTHORIZED"), value: ContextTypedValueSchema, sourceHash: sha256, observedAt: timestamp, validUntil: schema.union([timestamp, schema.literal(null)]), dimensionHash: sha256 });
const DerivedDimensionSchema = schema.object({ dimensionKey: key, state: schema.literal("KNOWN"), authority: schema.literal("DERIVED"), value: ContextTypedValueSchema, ruleId: identifier, ruleVersion: key, sourceHashes: schema.array(sha256, { min: 1, max: 20 }), derivedAt: timestamp, limitations: schema.array(identifier, { max: 20 }), proofHash: sha256, dimensionHash: sha256 });
const MissingDimensionSchema = schema.union([
  schema.object({ dimensionKey: key, state: schema.literal("UNKNOWN"), authority: schema.literal("UNKNOWN"), reasonCode: identifier, consideredAt: timestamp, dimensionHash: sha256 }),
  schema.object({ dimensionKey: key, state: schema.literal("NOT_CONFIGURED"), authority: schema.literal("NOT_CONFIGURED"), reasonCode: identifier, consideredAt: timestamp, dimensionHash: sha256 }),
  schema.object({ dimensionKey: key, state: schema.literal("NOT_AVAILABLE"), authority: schema.literal("NOT_AVAILABLE"), reasonCode: identifier, consideredAt: timestamp, dimensionHash: sha256 }),
  schema.object({ dimensionKey: key, state: schema.literal("DENIED"), authority: schema.literal("DENIED"), reasonCode: identifier, consideredAt: timestamp, dimensionHash: sha256 }),
]);
export const ContextDimensionValueSchema = schema.union([KnownExplicitDimensionSchema, KnownServerDimensionSchema, DerivedDimensionSchema, MissingDimensionSchema]);
export type ContextDimensionValue = Infer<typeof ContextDimensionValueSchema>;

export const BoundHardConstraintSchema = schema.object({
  constraintId: identifier,
  kind: schema.literal("HARD"),
  dimensionKey: key,
  operator: schema.enum(["REQUIRE_TRUE", "MAXIMUM", "EQUALS", "CONTAINS_CONCEPT"] as const),
  expectedValue: ContextTypedValueSchema,
  sourceDimensionHash: sha256,
  policyId: schema.union([identifier, schema.literal(null)]),
  policyVersion: key,
  unknownPolicy: schema.enum(CONTEXT_UNKNOWN_POLICIES),
  status: schema.enum(["ACTIVE_FIXTURE", "NOT_CONFIGURED"] as const),
  constraintHash: sha256,
});
export type BoundHardConstraint = Infer<typeof BoundHardConstraintSchema>;

export const BoundSoftPreferenceSchema = schema.object({
  preferenceId: identifier,
  kind: schema.literal("SOFT"),
  dimensionKey: key,
  preferredValue: ContextTypedValueSchema,
  sourceDimensionHash: sha256,
  eligibilityAuthority: schema.literal(false),
  productSemantics: schema.literal("NOT_CONFIGURED"),
  preferenceHash: sha256,
});
export type BoundSoftPreference = Infer<typeof BoundSoftPreferenceSchema>;

export const ContextSnapshotSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.snapshot),
  registryBinding: schema.object({ registryVersion: key, registryHash: sha256 }),
  policyBinding: schema.object({ policyVersion: key, policyHash: sha256 }),
  authorityBinding: schema.object({ authorityId: identifier, authorityHash: sha256 }),
  decisionId: identifier,
  sessionId: identifier,
  actorSubjectBindingHash: sha256,
  resolvedAt: timestamp,
  requestHash: sha256,
  temporal: schema.object({ serverTime: timestamp, localDate: schema.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ }), localTime: schema.string({ pattern: /^\d{2}:\d{2}:\d{2}$/ }), weekDay: schema.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const), timeZone: key, requestTiming: schema.object({ state: schema.enum(["CURRENT", "LATE_WITH_LIMITATION"] as const), ageSeconds: schema.number({ integer: true, min: 0 }) }) }),
  location: schema.object({ clientInputHash: sha256, clientRepresentation: schema.enum(["CITY", "PRECISE_COORDINATE_MINIMIZED"] as const), authorizedScope: LocationScopeSchema, comparison: schema.literal("MATCH"), permission: schema.enum(["GRANTED", "DENIED", "NOT_AVAILABLE"] as const), source: schema.enum(["SYNTHETIC_AUTHORIZED_PROVIDER", "EXPLICIT_CITY_SELECTION", "SERVER_POLICY"] as const), rawCoordinatesPersisted: schema.literal(false) }),
  dimensions: schema.array(ContextDimensionValueSchema, { max: 100 }),
  hardConstraints: schema.array(BoundHardConstraintSchema, { max: 30 }),
  softPreferences: schema.array(BoundSoftPreferenceSchema, { max: 30 }),
  sessionState: ServerSessionStateSchema,
  sourceBindings: schema.object({ worldSnapshotBindingHash: sha256, userProjectionBindingHash: sha256, candidatePoolBindingHash: sha256, eligibilityPolicyBindingHash: sha256, degradationPolicyBindingHash: sha256 }),
  limitations: schema.array(identifier, { max: 100 }),
  exclusions: schema.array(identifier, { max: 50 }),
  privacy: schema.object({ rawLocationPersisted: schema.literal(false), companionIdentityAllowed: schema.literal(false), freeTextPersisted: schema.literal(false), retention: schema.literal("RUN_SCOPED_FIXTURE"), exportRequiredIfPersisted: schema.literal(true), deletionRequiredIfPersisted: schema.literal(true) }),
  writesWorldState: schema.literal(false),
  writesUserIntelligence: schema.literal(false),
  commercialInfluence: schema.literal("FORBIDDEN"),
  contextHash: sha256,
});
export type ContextSnapshot = Infer<typeof ContextSnapshotSchema>;

export const ContextExecutionEnvelopeSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.executionEnvelope),
  authority: ContextAuthorityRecordSchema,
  clientInputHash: sha256,
  registryBinding: schema.object({ registryVersion: key, registryHash: sha256 }),
  policyBinding: schema.object({ policyVersion: key, policyHash: sha256 }),
  contextSnapshot: ContextSnapshotSchema,
  worldSnapshotBindingHash: sha256,
  userProjectionBindingHash: sha256,
  candidatePoolBindingHash: sha256,
  eligibilityPolicyBindingHash: sha256,
  degradationPolicyBindingHash: sha256,
  eligibilityPolicyAuthority: schema.literal(false),
  rankingAuthority: schema.literal(false),
  writesWorldState: schema.literal(false),
  writesUserIntelligence: schema.literal(false),
  commercialInfluence: schema.literal("FORBIDDEN"),
  envelopeHash: sha256,
});
export type ContextExecutionEnvelope = Infer<typeof ContextExecutionEnvelopeSchema>;

export const WeatherObservationSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.weatherPort),
  providerId: identifier,
  providerVersion: key,
  conditionRef: key,
  observedAt: timestamp,
  validUntil: timestamp,
  geographicScopeHash: sha256,
  sourceHash: sha256,
});
export type WeatherObservation = Infer<typeof WeatherObservationSchema>;
export interface ContextWeatherProviderPort {
  readonly contractVersion: typeof CONTEXT_KERNEL_VERSIONS.weatherPort;
  readObservation(input: { readonly authorizedScope: LocationScope; readonly at: string }): Promise<WeatherObservation | null>;
}

export const ContextDegradationEntrySchema = schema.object({
  code: key,
  action: schema.enum(["FAIL_CLOSED", "REQUEST_REJECTED", "USER_CLARIFICATION_REQUIRED", "DIMENSION_IGNORED_WITH_LIMITATION", "CANDIDATE_EXCLUDED", "NEUTRAL_DEFAULT", "EVALUATION_NOT_CONFIGURED"] as const),
  scope: schema.enum(["REQUEST", "DIMENSION", "CONSTRAINT", "SESSION", "EVALUATION"] as const),
  subjectRef: schema.union([identifier, schema.literal(null)]),
});
export type ContextDegradationEntry = Infer<typeof ContextDegradationEntrySchema>;

export const ScenarioOracleSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.oracle),
  oracleId: identifier,
  scenarioId: identifier,
  baseContextHash: sha256,
  flippedContextHash: sha256,
  expectedStructuralChanges: schema.array(key, { min: 1, max: 30 }),
  expectedEligibilityEffect: schema.enum(["UNCHANGED", "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT", "NOT_CONFIGURED"] as const),
  rankingDirection: schema.enum(["NOT_CONFIGURED", "FOUNDER_APPROVED_DIRECTION"] as const),
  allowedUncertainty: schema.array(key, { max: 20 }),
  expectedExplanationEvidence: schema.array(key, { max: 20 }),
  expectationClass: schema.enum(["STRUCTURAL_INVARIANT", "FOUNDER_APPROVED_EXPECTATION", "SYNTHETIC_FIXTURE_EXPECTATION", "NOT_CONFIGURED"] as const),
  productApprovalStatus: schema.enum(["NOT_REQUIRED_STRUCTURAL", "FOUNDER_APPROVED", "NOT_APPROVED", "NOT_CONFIGURED"] as const),
  oracleVersion: key,
  authorityRecord: schema.object({ contractVersion: version(CONTEXT_KERNEL_VERSIONS.oracleAuthority), authorityId: identifier, authorityKind: schema.enum(["TECHNICAL_ARCHITECTURE", "FOUNDER_PRODUCT"] as const), approvedAt: timestamp, authorityHash: sha256 }),
  oracleHash: sha256,
});
export type ScenarioOracle = Infer<typeof ScenarioOracleSchema>;

export const ContextFlipReportSchema = schema.object({
  contractVersion: version(CONTEXT_KERNEL_VERSIONS.flipReport),
  scenarioId: identifier,
  baseContextHash: sha256,
  flippedContextHash: sha256,
  baseDecisionIdentity: sha256,
  flippedDecisionIdentity: sha256,
  changedDimensionKeys: schema.array(key, { max: 100 }),
  unchangedDimensionKeys: schema.array(key, { max: 100 }),
  hardConstraintSetChanged: schema.boolean(),
  softPreferenceSetChanged: schema.boolean(),
  writesUserIntelligence: schema.literal(false),
  rankingQualityClaim: schema.literal(false),
  oracle: ScenarioOracleSchema,
  reportHash: sha256,
});
export type ContextFlipReport = Infer<typeof ContextFlipReportSchema>;
