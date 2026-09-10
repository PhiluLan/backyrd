import { canonicalJson, contentHash } from "./canonical.js";
import { ConsentEnvelope, ConsentEnvelopeSchema, CONTRACT_VERSIONS, parseConsentEnvelope, RelevantUserProjection, RelevantUserProjectionRequest, UserConceptReferenceSchema } from "./contracts.js";
import {
  ContextEvidenceBinding, EvidenceAuthorityContext, EvidenceBuildResult, EvidenceChainV2, EvidenceItem, parseEvidenceEngineState,
  verifyEvidenceEngineState, WorldEvidenceBinding,
} from "./evidence-chain.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";
import { buildRelevantUserProjection } from "./projection.js";
import {
  LifecycleStoreName, planLifecycleImpact, REQUIRED_LIFECYCLE_STORES,
  USER_INTELLIGENCE_LIFECYCLE_MANIFEST, USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
} from "./lifecycle.js";

const count = schema.number({ min: 0, integer: true });
const withoutHash = (value: Readonly<Record<string, unknown>>, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const comparable = (value: unknown) => canonicalJson(value);
const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort();

const MODEL_DIMENSIONS = [
  "LONG_TERM_CONCEPT_TASTE", "RECENT_PREFERENCE", "CONTEXTUAL_TASTE", "AVERSION",
  "PRACTICAL_PREFERENCE", "DIRECT_SPOT_AFFINITY", "EXPLORATION_FAMILIARITY", "ATTRIBUTION_UNRESOLVED",
] as const;
const POLICY_ACTIONS = [
  "NO_STATEMENT", "DIRECT_SPOT_ONLY", "CONCEPT_FROM_WORLD_SATISFACTION",
  "CONTEXTUAL_CONCEPT_FROM_WORLD_SATISFACTION", "PRACTICAL_CONTEXT_ONLY", "EXPLORATION_OBSERVATION",
] as const;
const EVENT_SLOTS = ["EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "DECISION", "EXPERIENCE", "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION"] as const;

const InterpretationRuleSchema = schema.object({
  eventType: identifier,
  evidenceSlot: schema.enum(EVENT_SLOTS),
  action: schema.enum(POLICY_ACTIONS),
  requiredDirection: schema.enum(["POSITIVE", "NEGATIVE", "ANY", "NOT_APPLICABLE"] as const),
  requiresIndependentJourney: schema.boolean(),
  requiresWorldEvidence: schema.boolean(),
});

const SyntheticSufficiencyPolicySchema = schema.object({
  policyId: identifier,
  authority: schema.literal("SYNTHETIC_FIXTURE_ONLY"),
  productCalibrated: schema.literal(false),
  productionAuthorized: schema.literal(false),
  limitations: schema.array(identifier, { min: 1, max: 16 }),
  thresholds: schema.object({ partialIndependentJourneys: count, sufficientIndependentJourneys: count }),
  policyHash: sha256,
});

export const InterpretationPolicySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.interpretationPolicy),
  policyId: identifier,
  policyVersion: identifier,
  authority: schema.literal("SYNTHETIC_FIXTURE_ONLY"),
  productionAuthorized: schema.literal(false),
  validFrom: timestamp,
  validUntil: schema.nullable(timestamp),
  rules: schema.array(InterpretationRuleSchema, { max: 64 }),
  allowedContextDimensions: schema.array(identifier, { max: 24 }),
  attributionMode: schema.literal("WORLD_CONCEPTS_AS_COMPETING_EXPLANATIONS"),
  repetitionMode: schema.literal("COUNT_INDEPENDENT_JOURNEYS_ONLY"),
  correctionMode: schema.literal("ACTIVE_EVIDENCE_ONLY_APPEND_HISTORY"),
  recencyWindow: schema.literal("NOT_CONFIGURED"),
  decay: schema.literal("NOT_CONFIGURED"),
  retention: schema.literal("NOT_CONFIGURED"),
  syntheticSufficiency: SyntheticSufficiencyPolicySchema,
  policyHash: sha256,
});
export type InterpretationPolicy = Infer<typeof InterpretationPolicySchema>;

export function withInterpretationPolicyHash(value: Omit<InterpretationPolicy, "policyHash">): InterpretationPolicy {
  return InterpretationPolicySchema.parse({ ...value, policyHash: contentHash(value) });
}

export function parseInterpretationPolicy(value: unknown): InterpretationPolicy {
  const parsed = InterpretationPolicySchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "policyHash")) !== parsed.policyHash) throw new ContractValidationError("$.policyHash", "interpretation policy hash mismatch");
  const identities = parsed.rules.map((rule) => `${rule.eventType}|${rule.evidenceSlot}`);
  if (new Set(identities).size !== identities.length) throw new ContractValidationError("$.rules", "event and slot rule must be unique");
  if (contentHash(withoutHash(parsed.syntheticSufficiency as unknown as Record<string, unknown>, "policyHash")) !== parsed.syntheticSufficiency.policyHash) throw new ContractValidationError("$.syntheticSufficiency.policyHash", "synthetic sufficiency policy hash mismatch");
  if (parsed.syntheticSufficiency.thresholds.partialIndependentJourneys > parsed.syntheticSufficiency.thresholds.sufficientIndependentJourneys) throw new ContractValidationError("$.syntheticSufficiency", "partial threshold cannot exceed sufficient threshold");
  return parsed;
}

export const UserModelAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelAuthority),
  contextVersion: identifier,
  authority: schema.literal("SERVER_USER_MODEL_ORCHESTRATOR"),
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256, boundBy: schema.literal("SERVER_AUTHENTICATION") }),
  consent: ConsentEnvelopeSchema,
  lifecycleState: schema.enum(["ACTIVE", "WITHDRAWN", "RESET", "ERASED"] as const),
  interpretationPolicy: schema.object({ policyId: identifier, policyVersion: identifier, policyHash: sha256, acceptedAuthority: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionPolicyConfigured: schema.literal(false) }),
  conceptRegistry: schema.object({ registryVersion: identifier, registryHash: sha256, conceptIds: schema.array(identifier, { max: 1024 }), authority: schema.literal("SERVER_REGISTRY") }),
  reducer: schema.object({ reducerVersion: identifier, codeHash: sha256, authority: schema.literal("SERVER_RELEASE") }),
  temporalPolicyVersion: identifier,
  projectionPolicyVersion: identifier,
  retentionConfigured: schema.literal(false),
  verifiedAt: timestamp,
});
export type UserModelAuthority = Infer<typeof UserModelAuthoritySchema>;

export interface UserModelAuthorityContext {
  getAuthority(): unknown;
  getAuthorityRecord(): unknown;
  getInterpretationPolicy(): unknown;
}

export const UserModelAuthorityRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelAuthorityRecord), recordId: identifier,
  issuer: schema.literal("SYNTHETIC_SERVER_AUTHORITY_FIXTURE"), authorityContractVersion: schema.literal(CONTRACT_VERSIONS.userModelAuthority), authorityHash: sha256,
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256 }), consentHash: sha256,
  lifecycleState: schema.enum(["ACTIVE", "WITHDRAWN", "RESET", "ERASED"] as const),
  interpretationPolicy: schema.object({ policyId: identifier, policyVersion: identifier, policyHash: sha256 }),
  conceptRegistry: schema.object({ registryVersion: identifier, registryHash: sha256 }),
  reducer: schema.object({ reducerVersion: identifier, codeHash: sha256 }),
  temporalPolicyVersion: identifier, projectionPolicyVersion: identifier, retentionConfigured: schema.literal(false),
  validFrom: timestamp, validUntil: timestamp, issuedAt: timestamp, verifiedAt: timestamp, recordHash: sha256,
});
export type UserModelAuthorityRecord = Infer<typeof UserModelAuthorityRecordSchema>;

export function withUserModelAuthorityRecordHash(value: Omit<UserModelAuthorityRecord, "recordHash">): UserModelAuthorityRecord {
  return UserModelAuthorityRecordSchema.parse({ ...value, recordHash: contentHash(value) });
}

export const UserModelAuthorityTrustAnchorSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelAuthorityTrustAnchor), anchorId: identifier,
  acceptedIssuer: schema.literal("SYNTHETIC_SERVER_AUTHORITY_FIXTURE"), acceptedRecordId: identifier, acceptedRecordHash: sha256,
  environment: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionAuthorized: schema.literal(false),
  validFrom: timestamp, validUntil: timestamp, verifiedAt: timestamp, anchorHash: sha256,
});
export type UserModelAuthorityTrustAnchor = Infer<typeof UserModelAuthorityTrustAnchorSchema>;
export interface UserModelAuthorityTrustContext { getAcceptedTrustAnchor(recordId: string): unknown; }

export function withUserModelAuthorityTrustAnchorHash(value: Omit<UserModelAuthorityTrustAnchor, "anchorHash">): UserModelAuthorityTrustAnchor {
  return UserModelAuthorityTrustAnchorSchema.parse({ ...value, anchorHash: contentHash(value) });
}

export const UserModelCommandSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelCommand),
  runId: identifier,
  source: schema.literal("SERVER_ORCHESTRATOR"),
  interpretationPolicyVersion: identifier,
  conceptRegistryVersion: identifier,
  reducerVersion: identifier,
  temporalPolicyVersion: identifier,
  interpretedAt: timestamp,
});
export type UserModelCommand = Infer<typeof UserModelCommandSchema>;

export const ObservationRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.observationRecord),
  observationId: identifier,
  subjectBindingHash: sha256,
  chainId: identifier,
  chainHash: sha256,
  eventId: identifier,
  eventHash: sha256,
  eventType: identifier,
  occurredAt: timestamp,
  evidenceSlot: schema.enum(EVENT_SLOTS),
  direction: schema.enum(["POSITIVE", "NEGATIVE", "NOT_APPLICABLE"] as const),
  active: schema.boolean(),
  journeyKey: identifier,
  independenceEligible: schema.boolean(),
  spotId: schema.optional(identifier),
  worldBindingHash: schema.optional(sha256),
  contextBindingHash: schema.optional(sha256),
  observationHash: sha256,
});
export type ObservationRecord = Infer<typeof ObservationRecordSchema>;

const AttributionSchema = schema.object({
  state: schema.enum(["DIRECT_SPOT", "DIRECT_CONCEPT", "COMPETING_CONCEPTS", "CONTEXT_BOUND", "UNKNOWN", "NOT_CONFIGURED"] as const),
  attributionUnitId: identifier,
  competingConceptIds: schema.array(identifier, { max: 64 }),
  independentExperienceUnits: schema.number({ min: 0, max: 1, integer: true }),
});

export const InterpretationRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.interpretationRecord),
  interpretationId: identifier,
  subjectBindingHash: sha256,
  dimension: schema.enum(MODEL_DIMENSIONS),
  statement: schema.enum(["POSSIBLE_AFFINITY", "POSSIBLE_AVERSION", "DIRECT_SPOT_RELATIONSHIP", "PRACTICAL_HYPOTHESIS", "CONTEXTUAL_HYPOTHESIS", "EXPLORATION_UNRESOLVED", "ATTRIBUTION_UNRESOLVED"] as const),
  direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"] as const),
  observationIds: schema.array(identifier, { min: 1, max: 64 }),
  observationHashes: schema.array(sha256, { min: 1, max: 64 }),
  evidenceChainHashes: schema.array(sha256, { min: 1, max: 64 }),
  concept: schema.optional(UserConceptReferenceSchema),
  spotId: schema.optional(identifier),
  context: schema.nullable(schema.object({ contextHash: sha256, dimensions: schema.array(identifier, { min: 1, max: 24 }), transfersToLongTermTaste: schema.literal(false) })),
  attribution: AttributionSchema,
  independenceKeys: schema.array(identifier, { max: 64 }),
  policy: schema.object({ policyVersion: identifier, policyHash: sha256, authority: schema.literal("SYNTHETIC_FIXTURE_ONLY") }),
  temporal: schema.object({ interpretedAt: timestamp, temporalPolicyVersion: identifier, applicability: schema.enum(["APPLICABLE", "NOT_APPLICABLE"] as const), recency: schema.literal("NOT_CONFIGURED"), decay: schema.literal("NOT_CONFIGURED") }),
  limitations: schema.array(identifier, { min: 1, max: 32 }),
  interpretationHash: sha256,
});
export type InterpretationRecord = Infer<typeof InterpretationRecordSchema>;

const SufficiencySchema = schema.object({
  state: schema.enum(["UNMATURE", "PARTIAL", "SUFFICIENT", "CONFLICTING", "NOT_CONFIGURED"] as const),
  independentEvidenceCount: count,
  evidenceDiversityCount: count,
  recencyState: schema.literal("NOT_CONFIGURED"),
  conflict: schema.boolean(),
  limitations: schema.array(identifier, { min: 1, max: 32 }),
  policy: SyntheticSufficiencyPolicySchema,
});
const DimensionEntrySchema = schema.object({
  key: identifier,
  statement: schema.enum(["POSSIBLE_AFFINITY", "POSSIBLE_AVERSION", "DIRECT_SPOT_RELATIONSHIP", "PRACTICAL_HYPOTHESIS", "CONTEXTUAL_HYPOTHESIS", "EXPLORATION_UNRESOLVED", "NOT_CONFIGURED"] as const),
  interpretationIds: schema.array(identifier, { max: 128 }),
  positiveInterpretationIds: schema.array(identifier, { max: 128 }),
  negativeInterpretationIds: schema.array(identifier, { max: 128 }),
  propagatesToConceptTaste: schema.literal(false),
  sufficiency: SufficiencySchema,
});

const ModelDimensionsSchema = schema.object({
  longTermConceptTaste: schema.array(DimensionEntrySchema, { max: 512 }),
  recentPreferenceState: schema.array(DimensionEntrySchema, { max: 512 }),
  contextualTaste: schema.array(DimensionEntrySchema, { max: 512 }),
  aversions: schema.array(DimensionEntrySchema, { max: 512 }),
  practicalPreferences: schema.array(DimensionEntrySchema, { max: 128 }),
  directSpotAffinities: schema.array(DimensionEntrySchema, { max: 512 }),
  explorationFamiliarity: schema.array(DimensionEntrySchema, { max: 32 }),
});

export const UserModelManifestV3Schema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelManifest),
  manifestId: identifier,
  evidenceContractVersion: schema.literal(CONTRACT_VERSIONS.evidenceChainV2),
  observationContractVersion: schema.literal(CONTRACT_VERSIONS.observationRecord),
  interpretationContractVersion: schema.literal(CONTRACT_VERSIONS.interpretationRecord),
  snapshotContractVersion: schema.literal(CONTRACT_VERSIONS.userModelSnapshot),
  modelAuthority: schema.object({ recordId: identifier, recordHash: sha256, trustAnchorId: identifier, trustAnchorHash: sha256 }),
  interpretationPolicy: schema.object({ policyId: identifier, policyVersion: identifier, policyHash: sha256, authority: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionPolicyConfigured: schema.literal(false) }),
  sufficiencyPolicy: SyntheticSufficiencyPolicySchema,
  conceptRegistry: schema.object({ registryVersion: identifier, registryHash: sha256 }),
  reducer: schema.object({ reducerVersion: identifier, codeHash: sha256 }),
  temporal: schema.object({ temporalPolicyVersion: identifier, projectionPolicyVersion: identifier, recency: schema.literal("NOT_CONFIGURED"), decay: schema.literal("NOT_CONFIGURED") }),
  retentionConfigured: schema.literal(false),
  boundaries: schema.object({ eligibilityAuthority: schema.literal(false), rankingAuthority: schema.literal(false), worldFactWriteAuthority: schema.literal(false), commercialInputsAccepted: schema.literal(false), productionWiring: schema.literal(false) }),
  unresolvedProductPolicies: schema.array(identifier, { min: 1, max: 64 }),
  manifestHash: sha256,
});
export type UserModelManifestV3 = Infer<typeof UserModelManifestV3Schema>;

export const UserModelSnapshotV3Schema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelSnapshot),
  snapshotId: identifier,
  subject: schema.object({ subjectBindingHash: sha256, boundBy: schema.literal("SERVER_AUTHENTICATION"), userIdExternallyExposed: schema.literal(false) }),
  manifest: schema.object({ manifestId: identifier, manifestHash: sha256 }),
  source: schema.object({ evidenceStateHash: sha256, evidenceChainHashes: schema.array(sha256, { max: 1024 }), observationHashes: schema.array(sha256, { max: 4096 }), interpretationHashes: schema.array(sha256, { max: 4096 }) }),
  dimensions: ModelDimensionsSchema,
  overallSufficiency: SufficiencySchema,
  conflicts: schema.array(schema.object({ key: identifier, positiveInterpretationIds: schema.array(identifier, { min: 1, max: 128 }), negativeInterpretationIds: schema.array(identifier, { min: 1, max: 128 }), state: schema.literal("UNRESOLVED") }), { max: 512 }),
  lifecycle: schema.object({ state: schema.literal("ACTIVE"), consentVersion: identifier, purpose: schema.literal("PERSONALIZED_RECOMMENDATIONS"), retentionConfigured: schema.literal(false) }),
  snapshotHash: sha256,
});
export type UserModelSnapshotV3 = Infer<typeof UserModelSnapshotV3Schema>;

export const UserModelEvidenceCheckpointSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelEvidenceCheckpoint), checkpointId: identifier,
  subjectBindingHash: sha256, evidenceStateHash: sha256, ledgerEventHashes: schema.array(sha256, { max: 1024 }),
  evidenceChainHashes: schema.array(sha256, { max: 1024 }), checkpointHash: sha256,
});
export type UserModelEvidenceCheckpoint = Infer<typeof UserModelEvidenceCheckpointSchema>;

export const UserModelStateSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelState),
  status: schema.enum(["ACTIVE", "COLD", "SUPPRESSED_NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"] as const),
  subjectBindingHash: schema.nullable(sha256),
  manifest: schema.nullable(UserModelManifestV3Schema),
  observations: schema.array(ObservationRecordSchema, { max: 4096 }),
  interpretations: schema.array(InterpretationRecordSchema, { max: 4096 }),
  snapshot: schema.nullable(UserModelSnapshotV3Schema),
  latestSnapshotPointer: schema.nullable(schema.object({ snapshotId: identifier, snapshotHash: sha256 })),
  evidenceCheckpoint: schema.nullable(UserModelEvidenceCheckpointSchema),
  incrementalReducerStateHash: schema.nullable(sha256),
  projectionCacheKeys: schema.array(sha256, { max: 128 }),
  attributionWorkItems: schema.array(identifier, { max: 128 }),
  rebuildMaterial: schema.nullable(schema.object({ evidenceStateHash: sha256, commandHash: sha256 })),
  stateHash: sha256,
});
export type UserModelState = Infer<typeof UserModelStateSchema>;
export interface UserModelBuildResult { readonly state: UserModelState; readonly persistable: UserModelState; }

function parseObservation(value: unknown): ObservationRecord {
  const parsed = ObservationRecordSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "observationHash")) !== parsed.observationHash) throw new ContractValidationError("$.observationHash", "observation record hash mismatch");
  return parsed;
}

function parseInterpretation(value: unknown): InterpretationRecord {
  const parsed = InterpretationRecordSchema.parse(value);
  if (parsed.observationIds.length !== parsed.observationHashes.length) throw new ContractValidationError("$.observationHashes", "interpretation provenance cardinality mismatch");
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "interpretationHash")) !== parsed.interpretationHash) throw new ContractValidationError("$.interpretationHash", "interpretation record hash mismatch");
  return parsed;
}

function parseManifest(value: unknown): UserModelManifestV3 {
  const parsed = UserModelManifestV3Schema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "manifestHash")) !== parsed.manifestHash) throw new ContractValidationError("$.manifestHash", "user model manifest hash mismatch");
  return parsed;
}

function parseSnapshot(value: unknown): UserModelSnapshotV3 {
  const parsed = UserModelSnapshotV3Schema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "snapshotHash")) !== parsed.snapshotHash) throw new ContractValidationError("$.snapshotHash", "user model snapshot hash mismatch");
  return parsed;
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) throw new ContractValidationError(path, "duplicate identity");
}

/** Structural parse plus self-hash checks only. This is deliberately not an authority boundary. */
export function parseUserModelState(value: unknown): UserModelState {
  const parsed = UserModelStateSchema.parse(value);
  for (const record of parsed.observations) parseObservation(record);
  for (const record of parsed.interpretations) parseInterpretation(record);
  if (parsed.manifest) parseManifest(parsed.manifest);
  if (parsed.snapshot) parseSnapshot(parsed.snapshot);
  assertUnique(parsed.observations.map((row) => row.observationId), "$.observations.observationId");
  assertUnique(parsed.observations.map((row) => row.observationHash), "$.observations.observationHash");
  assertUnique(parsed.interpretations.map((row) => row.interpretationId), "$.interpretations.interpretationId");
  assertUnique(parsed.interpretations.map((row) => row.interpretationHash), "$.interpretations.interpretationHash");
  if (parsed.status !== "ACTIVE" && parsed.status !== "COLD") {
    if (parsed.subjectBindingHash !== null || parsed.manifest !== null || parsed.observations.length || parsed.interpretations.length || parsed.snapshot !== null || parsed.latestSnapshotPointer !== null || parsed.evidenceCheckpoint !== null || parsed.incrementalReducerStateHash !== null || parsed.projectionCacheKeys.length || parsed.attributionWorkItems.length || parsed.rebuildMaterial !== null) throw new ContractValidationError("$.status", "suppressed lifecycle state contains personal model data");
  }
  if (parsed.snapshot && (!parsed.latestSnapshotPointer || parsed.latestSnapshotPointer.snapshotId !== parsed.snapshot.snapshotId || parsed.latestSnapshotPointer.snapshotHash !== parsed.snapshot.snapshotHash)) throw new ContractValidationError("$.latestSnapshotPointer", "snapshot pointer mismatch");
  if (parsed.evidenceCheckpoint && contentHash(withoutHash(parsed.evidenceCheckpoint as unknown as Record<string, unknown>, "checkpointHash")) !== parsed.evidenceCheckpoint.checkpointHash) throw new ContractValidationError("$.evidenceCheckpoint.checkpointHash", "evidence checkpoint hash mismatch");
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "stateHash")) !== parsed.stateHash) throw new ContractValidationError("$.stateHash", "user model state hash mismatch");
  return parsed;
}

function emptyState(status: "SUPPRESSED_NO_CONSENT" | "WITHDRAWN" | "RESET" | "ERASED"): UserModelState {
  const body = { contractVersion: CONTRACT_VERSIONS.userModelState, status, subjectBindingHash: null, manifest: null, observations: [], interpretations: [], snapshot: null, latestSnapshotPointer: null, evidenceCheckpoint: null, incrementalReducerStateHash: null, projectionCacheKeys: [], attributionWorkItems: [], rebuildMaterial: null } as const;
  return parseUserModelState({ ...body, stateHash: contentHash(body) });
}

function parseAuthorityRecord(value: unknown): UserModelAuthorityRecord {
  const parsed = UserModelAuthorityRecordSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "recordHash")) !== parsed.recordHash) throw new ContractValidationError("$.recordHash", "model authority record hash mismatch");
  return parsed;
}

function parseAuthorityTrustAnchor(value: unknown): UserModelAuthorityTrustAnchor {
  const parsed = UserModelAuthorityTrustAnchorSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "anchorHash")) !== parsed.anchorHash) throw new ContractValidationError("$.anchorHash", "model authority trust anchor hash mismatch");
  return parsed;
}

function resolveAuthority(command: UserModelCommand, context: UserModelAuthorityContext, trustContext: UserModelAuthorityTrustContext): { authority: UserModelAuthority; policy: InterpretationPolicy; record: UserModelAuthorityRecord; trustAnchor: UserModelAuthorityTrustAnchor } {
  const authority = UserModelAuthoritySchema.parse(context.getAuthority());
  parseConsentEnvelope(authority.consent);
  const policy = parseInterpretationPolicy(context.getInterpretationPolicy());
  const record = parseAuthorityRecord(context.getAuthorityRecord());
  const trustAnchor = parseAuthorityTrustAnchor(trustContext.getAcceptedTrustAnchor(record.recordId));
  if (trustAnchor.acceptedRecordId !== record.recordId || trustAnchor.acceptedRecordHash !== record.recordHash || trustAnchor.acceptedIssuer !== record.issuer) throw new ContractValidationError("$.trustAnchor", "model authority record is not accepted by the external trust anchor");
  if (Date.parse(command.interpretedAt) < Date.parse(record.validFrom) || Date.parse(command.interpretedAt) > Date.parse(record.validUntil) || Date.parse(command.interpretedAt) < Date.parse(trustAnchor.validFrom) || Date.parse(command.interpretedAt) > Date.parse(trustAnchor.validUntil)) throw new ContractValidationError("$.authorityRecord", "model authority record or trust anchor is not temporally valid");
  const authorityHash = contentHash(authority);
  if (record.authorityHash !== authorityHash || record.authorityContractVersion !== authority.contractVersion || record.subject.boundUserId !== authority.subject.boundUserId || record.subject.subjectBindingHash !== authority.subject.subjectBindingHash || record.consentHash !== contentHash(authority.consent) || record.lifecycleState !== authority.lifecycleState || record.verifiedAt !== authority.verifiedAt) throw new ContractValidationError("$.authorityRecord", "authority subject, consent, lifecycle or verification time differs from the accepted record");
  if (policy.policyId !== authority.interpretationPolicy.policyId || policy.policyVersion !== authority.interpretationPolicy.policyVersion || policy.policyHash !== authority.interpretationPolicy.policyHash || policy.authority !== authority.interpretationPolicy.acceptedAuthority) throw new ContractValidationError("$.interpretationPolicy", "policy is not bound by server authority");
  if (record.interpretationPolicy.policyId !== policy.policyId || record.interpretationPolicy.policyVersion !== policy.policyVersion || record.interpretationPolicy.policyHash !== policy.policyHash || record.conceptRegistry.registryVersion !== authority.conceptRegistry.registryVersion || record.conceptRegistry.registryHash !== authority.conceptRegistry.registryHash || record.reducer.reducerVersion !== authority.reducer.reducerVersion || record.reducer.codeHash !== authority.reducer.codeHash || record.temporalPolicyVersion !== authority.temporalPolicyVersion || record.projectionPolicyVersion !== authority.projectionPolicyVersion || record.retentionConfigured !== authority.retentionConfigured) throw new ContractValidationError("$.authorityRecord", "policy, registry, reducer or lifecycle policy differs from the accepted record");
  if (command.interpretationPolicyVersion !== policy.policyVersion || command.conceptRegistryVersion !== authority.conceptRegistry.registryVersion || command.reducerVersion !== authority.reducer.reducerVersion || command.temporalPolicyVersion !== authority.temporalPolicyVersion) throw new ContractValidationError("$.command", "command attempts to select an unauthorized policy, registry, reducer or clock");
  if (Date.parse(command.interpretedAt) < Date.parse(policy.validFrom) || (policy.validUntil !== null && Date.parse(command.interpretedAt) > Date.parse(policy.validUntil))) throw new ContractValidationError("$.interpretedAt", "interpretation policy is not temporally applicable");
  assertUnique(authority.conceptRegistry.conceptIds, "$.conceptRegistry.conceptIds");
  if (authority.conceptRegistry.registryHash !== contentHash({ registryVersion: authority.conceptRegistry.registryVersion, conceptIds: [...authority.conceptRegistry.conceptIds].sort() })) throw new ContractValidationError("$.conceptRegistry.registryHash", "concept registry authority hash mismatch");
  return { authority, policy, record, trustAnchor };
}

function observationRecords(chains: readonly EvidenceChainV2[], subjectBindingHash: string): ObservationRecord[] {
  const records: ObservationRecord[] = [];
  for (const chain of [...chains].sort((a, b) => a.chainId.localeCompare(b.chainId))) {
    const journeyKey = chain.journey.journeyId ?? `unresolved-${chain.journey.eventId}`;
    for (const item of Object.values(chain.slots).flat().sort((a, b) => a.eventId.localeCompare(b.eventId))) {
      const body = {
        contractVersion: CONTRACT_VERSIONS.observationRecord, observationId: `observation-${contentHash({ chainHash: chain.chainHash, eventHash: item.eventHash })}`,
        subjectBindingHash, chainId: chain.chainId, chainHash: chain.chainHash, eventId: item.eventId, eventHash: item.eventHash,
        eventType: item.eventType, occurredAt: item.occurredAt, evidenceSlot: item.slot, direction: item.direction, active: item.active,
        journeyKey, independenceEligible: chain.independence.state === "ELIGIBLE_SERVER_RESOLVED",
        ...(item.spotId ? { spotId: item.spotId } : {}), ...(item.worldBindingHash ? { worldBindingHash: item.worldBindingHash } : {}), ...(item.contextBindingHash ? { contextBindingHash: item.contextBindingHash } : {}),
      } as const;
      records.push(ObservationRecordSchema.parse({ ...body, observationHash: contentHash(body) }));
    }
  }
  return records.sort((a, b) => a.observationId.localeCompare(b.observationId));
}

function interpretationBody(input: {
  readonly observation: ObservationRecord; readonly dimension: InterpretationRecord["dimension"]; readonly statement: InterpretationRecord["statement"];
  readonly direction: InterpretationRecord["direction"]; readonly policy: InterpretationPolicy; readonly command: UserModelCommand;
  readonly concept?: { readonly contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0"; readonly registryVersion: string; readonly conceptId: string };
  readonly spotId?: string; readonly context: InterpretationRecord["context"]; readonly attribution: InterpretationRecord["attribution"];
  readonly limitations: readonly string[];
}): Omit<InterpretationRecord, "interpretationHash"> {
  const identity = contentHash({ observationHash: input.observation.observationHash, dimension: input.dimension, statement: input.statement, concept: input.concept ?? null, spotId: input.spotId ?? null, context: input.context, policyHash: input.policy.policyHash });
  return {
    contractVersion: CONTRACT_VERSIONS.interpretationRecord, interpretationId: `interpretation-${identity}`,
    subjectBindingHash: input.observation.subjectBindingHash, dimension: input.dimension, statement: input.statement, direction: input.direction,
    observationIds: [input.observation.observationId], observationHashes: [input.observation.observationHash], evidenceChainHashes: [input.observation.chainHash],
    ...(input.concept ? { concept: input.concept } : {}), ...(input.spotId ? { spotId: input.spotId } : {}), context: input.context,
    attribution: input.attribution, independenceKeys: input.observation.independenceEligible ? [input.observation.journeyKey] : [],
    policy: { policyVersion: input.policy.policyVersion, policyHash: input.policy.policyHash, authority: "SYNTHETIC_FIXTURE_ONLY" },
    temporal: { interpretedAt: input.command.interpretedAt, temporalPolicyVersion: input.command.temporalPolicyVersion, applicability: "APPLICABLE", recency: "NOT_CONFIGURED", decay: "NOT_CONFIGURED" },
    limitations: [...input.limitations],
  };
}

function buildInterpretations(observations: readonly ObservationRecord[], worlds: readonly WorldEvidenceBinding[], contexts: readonly ContextEvidenceBinding[], policy: InterpretationPolicy, command: UserModelCommand, authority: UserModelAuthority): InterpretationRecord[] {
  const worldByHash = new Map(worlds.map((world) => [world.bindingHash, world]));
  const contextByHash = new Map(contexts.map((context) => [context.bindingHash, context]));
  const output: InterpretationRecord[] = [];
  const rules = new Map(policy.rules.map((rule) => [`${rule.eventType}|${rule.evidenceSlot}`, rule]));
  for (const observation of observations) {
    if (!observation.active) continue;
    const rule = rules.get(`${observation.eventType}|${observation.evidenceSlot}`);
    if (!rule || rule.action === "NO_STATEMENT") continue;
    if (rule.requiredDirection !== "ANY" && observation.direction !== rule.requiredDirection) continue;
    if (rule.requiresIndependentJourney && !observation.independenceEligible) continue;
    const world = observation.worldBindingHash ? worldByHash.get(observation.worldBindingHash) : undefined;
    if (rule.requiresWorldEvidence && !world) continue;
    const knownConcepts = (world?.references ?? []).filter((reference) => reference.kind === "CONCEPT" && (reference.trust === "VERIFIED" || reference.trust === "SUPPORTED") && reference.freshness === "CURRENT_AT_EVENT" && authority.conceptRegistry.conceptIds.includes(reference.referenceId));
    const competing = uniqueSorted(knownConcepts.map((reference) => reference.referenceId));
    const unitId = `attribution-${contentHash({ observationHash: observation.observationHash, competing })}`;
    const direction = observation.direction === "POSITIVE" || observation.direction === "NEGATIVE" ? observation.direction : "UNKNOWN";
    if (rule.action === "DIRECT_SPOT_ONLY" || rule.action.includes("CONCEPT_FROM_WORLD_SATISFACTION")) {
      if (observation.spotId) {
        const body = interpretationBody({ observation, dimension: "DIRECT_SPOT_AFFINITY", statement: "DIRECT_SPOT_RELATIONSHIP", direction, policy, command, spotId: observation.spotId, context: null, attribution: { state: "DIRECT_SPOT", attributionUnitId: unitId, competingConceptIds: competing, independentExperienceUnits: observation.independenceEligible ? 1 : 0 }, limitations: ["DOES_NOT_PROPAGATE_TO_CONCEPT_TASTE", "NO_NUMERIC_SIGNAL_STRENGTH"] });
        output.push(InterpretationRecordSchema.parse({ ...body, interpretationHash: contentHash(body) }));
      }
    }
    if (rule.action.includes("CONCEPT_FROM_WORLD_SATISFACTION")) {
      if (!competing.length) {
        const body = interpretationBody({ observation, dimension: "ATTRIBUTION_UNRESOLVED", statement: "ATTRIBUTION_UNRESOLVED", direction, policy, command, ...(observation.spotId ? { spotId: observation.spotId } : {}), context: null, attribution: { state: "UNKNOWN", attributionUnitId: unitId, competingConceptIds: [], independentExperienceUnits: observation.independenceEligible ? 1 : 0 }, limitations: ["NO_AUTHORIZED_EVENT_TIME_CONCEPT", "NO_CONCEPT_TASTE_STATEMENT"] });
        output.push(InterpretationRecordSchema.parse({ ...body, interpretationHash: contentHash(body) }));
      }
      for (const conceptId of competing) {
        const isContextual = rule.action === "CONTEXTUAL_CONCEPT_FROM_WORLD_SATISFACTION";
        const contextRef = observation.contextBindingHash ? contextByHash.get(observation.contextBindingHash) : undefined;
        const allowedDimensions = uniqueSorted((contextRef?.dimensions ?? []).filter((dimension) => policy.allowedContextDimensions.includes(dimension)));
        const context = isContextual && contextRef && allowedDimensions.length ? { contextHash: contextRef.contextHash, dimensions: allowedDimensions, transfersToLongTermTaste: false as const } : null;
        if (isContextual && !context) continue;
        const dimension = isContextual ? "CONTEXTUAL_TASTE" as const : direction === "NEGATIVE" ? "AVERSION" as const : "LONG_TERM_CONCEPT_TASTE" as const;
        const statement = isContextual ? "CONTEXTUAL_HYPOTHESIS" as const : direction === "NEGATIVE" ? "POSSIBLE_AVERSION" as const : "POSSIBLE_AFFINITY" as const;
        const body = interpretationBody({ observation, dimension, statement, direction, policy, command, concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: authority.conceptRegistry.registryVersion, conceptId }, context, attribution: { state: isContextual ? "CONTEXT_BOUND" : competing.length > 1 ? "COMPETING_CONCEPTS" : "DIRECT_CONCEPT", attributionUnitId: unitId, competingConceptIds: competing, independentExperienceUnits: observation.independenceEligible ? 1 : 0 }, limitations: [competing.length > 1 ? "COMPETING_ATTRIBUTION_EXPLANATIONS" : "SYNTHETIC_POLICY_ONLY", "NO_NUMERIC_SIGNAL_STRENGTH"] });
        output.push(InterpretationRecordSchema.parse({ ...body, interpretationHash: contentHash(body) }));
      }
    }
    if (rule.action === "PRACTICAL_CONTEXT_ONLY") {
      const body = interpretationBody({ observation, dimension: "PRACTICAL_PREFERENCE", statement: "PRACTICAL_HYPOTHESIS", direction: "UNKNOWN", policy, command, ...(observation.spotId ? { spotId: observation.spotId } : {}), context: null, attribution: { state: "NOT_CONFIGURED", attributionUnitId: unitId, competingConceptIds: [], independentExperienceUnits: 0 }, limitations: ["PRACTICAL_IS_NOT_TASTE", "CAUSAL_PREFERENCE_NOT_CLAIMED", "SYNTHETIC_POLICY_ONLY"] });
      output.push(InterpretationRecordSchema.parse({ ...body, interpretationHash: contentHash(body) }));
    }
  }
  return output.sort((a, b) => a.interpretationId.localeCompare(b.interpretationId));
}

function maturity(records: readonly InterpretationRecord[], policy: InterpretationPolicy): Infer<typeof SufficiencySchema> {
  const journeys = uniqueSorted(records.flatMap((record) => record.independenceKeys));
  const directions = new Set(records.map((record) => record.direction).filter((direction) => direction !== "UNKNOWN"));
  const conflict = directions.has("POSITIVE") && directions.has("NEGATIVE");
  const thresholds = policy.syntheticSufficiency.thresholds;
  const state = conflict ? "CONFLICTING" : journeys.length >= thresholds.sufficientIndependentJourneys ? "SUFFICIENT" : journeys.length >= thresholds.partialIndependentJourneys ? "PARTIAL" : "UNMATURE";
  return { state, independentEvidenceCount: journeys.length, evidenceDiversityCount: new Set(records.flatMap((record) => record.evidenceChainHashes)).size, recencyState: "NOT_CONFIGURED", conflict, limitations: uniqueSorted(["SYNTHETIC_THRESHOLDS_ONLY", "RECENCY_NOT_CONFIGURED", "DECAY_NOT_CONFIGURED", ...policy.syntheticSufficiency.limitations]), policy: policy.syntheticSufficiency };
}

function dimensionEntries(records: readonly InterpretationRecord[], dimension: InterpretationRecord["dimension"], policy: InterpretationPolicy): Infer<typeof DimensionEntrySchema>[] {
  const relevant = records.filter((record) => record.dimension === dimension);
  const grouped = new Map<string, InterpretationRecord[]>();
  for (const record of relevant) {
    const key = record.concept ? `${record.concept.registryVersion}:${record.concept.conceptId}` : record.spotId ? `spot:${record.spotId}` : `${dimension}:unresolved`;
    const group = grouped.get(key) ?? []; group.push(record); grouped.set(key, group);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => ({
    key, statement: group[0]!.statement === "ATTRIBUTION_UNRESOLVED" ? "NOT_CONFIGURED" : group[0]!.statement,
    interpretationIds: group.map((row) => row.interpretationId).sort(),
    positiveInterpretationIds: group.filter((row) => row.direction === "POSITIVE").map((row) => row.interpretationId).sort(),
    negativeInterpretationIds: group.filter((row) => row.direction === "NEGATIVE").map((row) => row.interpretationId).sort(),
    propagatesToConceptTaste: false as const, sufficiency: maturity(group, policy),
  }));
}

function buildManifest(authority: UserModelAuthority, policy: InterpretationPolicy, record: UserModelAuthorityRecord, trustAnchor: UserModelAuthorityTrustAnchor): UserModelManifestV3 {
  const body = {
    contractVersion: CONTRACT_VERSIONS.userModelManifest, manifestId: `manifest-${contentHash({ policyHash: policy.policyHash, registryHash: authority.conceptRegistry.registryHash, reducer: authority.reducer })}`,
    evidenceContractVersion: CONTRACT_VERSIONS.evidenceChainV2, observationContractVersion: CONTRACT_VERSIONS.observationRecord, interpretationContractVersion: CONTRACT_VERSIONS.interpretationRecord, snapshotContractVersion: CONTRACT_VERSIONS.userModelSnapshot,
    modelAuthority: { recordId: record.recordId, recordHash: record.recordHash, trustAnchorId: trustAnchor.anchorId, trustAnchorHash: trustAnchor.anchorHash },
    interpretationPolicy: { policyId: policy.policyId, policyVersion: policy.policyVersion, policyHash: policy.policyHash, authority: "SYNTHETIC_FIXTURE_ONLY", productionPolicyConfigured: false },
    sufficiencyPolicy: policy.syntheticSufficiency,
    conceptRegistry: { registryVersion: authority.conceptRegistry.registryVersion, registryHash: authority.conceptRegistry.registryHash }, reducer: { reducerVersion: authority.reducer.reducerVersion, codeHash: authority.reducer.codeHash },
    temporal: { temporalPolicyVersion: authority.temporalPolicyVersion, projectionPolicyVersion: authority.projectionPolicyVersion, recency: "NOT_CONFIGURED", decay: "NOT_CONFIGURED" }, retentionConfigured: false,
    boundaries: { eligibilityAuthority: false, rankingAuthority: false, worldFactWriteAuthority: false, commercialInputsAccepted: false, productionWiring: false },
    unresolvedProductPolicies: ["EVENT_SIGNAL_STRENGTHS", "SAVE_SEMANTICS", "NAVIGATION_SEMANTICS", "VISIT_SEMANTICS", "REVIEW_MOOD_EFFECT", "MOMENT_EFFECT", "DWELL_EFFECT", "QUICK_SKIP_EFFECT", "SEARCH_EFFECT", "DECAY_DURATIONS", "MATURITY_THRESHOLDS", "CONTEXT_ALLOWLIST", "RETENTION_DURATIONS"],
  } as const;
  return UserModelManifestV3Schema.parse({ ...body, manifestHash: contentHash(body) });
}

function dimensions(records: readonly InterpretationRecord[], policy: InterpretationPolicy): Infer<typeof ModelDimensionsSchema> {
  return {
    longTermConceptTaste: dimensionEntries(records, "LONG_TERM_CONCEPT_TASTE", policy),
    recentPreferenceState: [],
    contextualTaste: dimensionEntries(records, "CONTEXTUAL_TASTE", policy),
    aversions: dimensionEntries(records, "AVERSION", policy),
    practicalPreferences: dimensionEntries(records, "PRACTICAL_PREFERENCE", policy),
    directSpotAffinities: dimensionEntries(records, "DIRECT_SPOT_AFFINITY", policy),
    explorationFamiliarity: [],
  };
}

function evidenceCheckpoint(evidence: EvidenceBuildResult, subjectBindingHash: string): UserModelEvidenceCheckpoint {
  const body = { contractVersion: CONTRACT_VERSIONS.userModelEvidenceCheckpoint, checkpointId: `checkpoint-${contentHash({ evidenceStateHash: evidence.state.stateHash, subjectBindingHash })}`, subjectBindingHash, evidenceStateHash: evidence.state.stateHash, ledgerEventHashes: [...evidence.state.ledgerEventHashes].sort(), evidenceChainHashes: evidence.state.chains.map((chain) => chain.chainHash).sort() } as const;
  return UserModelEvidenceCheckpointSchema.parse({ ...body, checkpointHash: contentHash(body) });
}

function assembleModelState(evidence: EvidenceBuildResult, command: UserModelCommand, authority: UserModelAuthority, policy: InterpretationPolicy, record: UserModelAuthorityRecord, trustAnchor: UserModelAuthorityTrustAnchor, observations: readonly ObservationRecord[], interpretations: readonly InterpretationRecord[]): UserModelBuildResult {
  const manifest = buildManifest(authority, policy, record, trustAnchor);
  const modelDimensions = dimensions(interpretations, policy);
  const overall = maturity(interpretations, policy);
  const conceptKeys = uniqueSorted(interpretations.filter((entry) => entry.concept).map((entry) => `${entry.concept!.registryVersion}:${entry.concept!.conceptId}`));
  const conflicts = conceptKeys.map((key) => {
    const matching = interpretations.filter((entry) => entry.concept && `${entry.concept.registryVersion}:${entry.concept.conceptId}` === key);
    return { key: `conflict-${contentHash(key)}`, positiveInterpretationIds: uniqueSorted(matching.filter((entry) => entry.direction === "POSITIVE").map((entry) => entry.interpretationId)), negativeInterpretationIds: uniqueSorted(matching.filter((entry) => entry.direction === "NEGATIVE").map((entry) => entry.interpretationId)), state: "UNRESOLVED" as const };
  }).filter((entry) => entry.positiveInterpretationIds.length && entry.negativeInterpretationIds.length);
  const sortedObservations = [...observations].sort((left, right) => left.observationId.localeCompare(right.observationId));
  const sortedInterpretations = [...interpretations].sort((left, right) => left.interpretationId.localeCompare(right.interpretationId));
  const snapshotBody = {
    contractVersion: CONTRACT_VERSIONS.userModelSnapshot, snapshotId: `snapshot-${contentHash({ evidenceStateHash: evidence.state.stateHash, manifestHash: manifest.manifestHash, interpretedAt: command.interpretedAt })}`,
    subject: { subjectBindingHash: authority.subject.subjectBindingHash, boundBy: "SERVER_AUTHENTICATION", userIdExternallyExposed: false }, manifest: { manifestId: manifest.manifestId, manifestHash: manifest.manifestHash },
    source: { evidenceStateHash: evidence.state.stateHash, evidenceChainHashes: evidence.state.chains.map((chain) => chain.chainHash).sort(), observationHashes: sortedObservations.map((entry) => entry.observationHash).sort(), interpretationHashes: sortedInterpretations.map((entry) => entry.interpretationHash).sort() },
    dimensions: modelDimensions, overallSufficiency: overall, conflicts,
    lifecycle: { state: "ACTIVE", consentVersion: authority.consent.consentVersion, purpose: "PERSONALIZED_RECOMMENDATIONS", retentionConfigured: false },
  } as const;
  const snapshot = UserModelSnapshotV3Schema.parse({ ...snapshotBody, snapshotHash: contentHash(snapshotBody) });
  const checkpoint = evidenceCheckpoint(evidence, authority.subject.subjectBindingHash);
  const status = sortedObservations.length ? "ACTIVE" as const : "COLD" as const;
  const commandHash = contentHash(command);
  const stateBody = { contractVersion: CONTRACT_VERSIONS.userModelState, status, subjectBindingHash: authority.subject.subjectBindingHash, manifest, observations: sortedObservations, interpretations: sortedInterpretations, snapshot, latestSnapshotPointer: { snapshotId: snapshot.snapshotId, snapshotHash: snapshot.snapshotHash }, evidenceCheckpoint: checkpoint, incrementalReducerStateHash: contentHash({ snapshotHash: snapshot.snapshotHash, checkpointHash: checkpoint.checkpointHash, reducerCodeHash: authority.reducer.codeHash }), projectionCacheKeys: [], attributionWorkItems: [], rebuildMaterial: { evidenceStateHash: evidence.state.stateHash, commandHash } } as const;
  const state = parseUserModelState({ ...stateBody, stateHash: contentHash(stateBody) });
  return { state, persistable: state };
}

function assertActiveEvidenceAuthority(evidence: EvidenceBuildResult, evidenceAuthority: EvidenceAuthorityContext, authority: UserModelAuthority): void {
  if (evidence.rebuildMaterial === null) throw new ContractValidationError("$.evidence", "active model build requires authoritative evidence rebuild material");
  verifyEvidenceEngineState(evidence.state, evidence.rebuildMaterial, evidenceAuthority);
  if (evidence.state.subjectBindingHash !== authority.subject.subjectBindingHash || evidence.rebuildMaterial.subject.boundUserId !== authority.subject.boundUserId) throw new ContractValidationError("$.subject", "foreign evidence cannot enter the user model");
  if (evidence.rebuildMaterial.consent.consentVersion !== authority.consent.consentVersion || evidence.rebuildMaterial.consent.policyVersion !== authority.consent.policyVersion || evidence.rebuildMaterial.consent.purpose !== authority.consent.purpose) throw new ContractValidationError("$.consent", "evidence consent differs from model authority");
}

export function buildUserModel(evidence: EvidenceBuildResult, rawCommand: unknown, evidenceAuthority: EvidenceAuthorityContext, modelContext: UserModelAuthorityContext, trustContext: UserModelAuthorityTrustContext): UserModelBuildResult {
  const command = UserModelCommandSchema.parse(rawCommand);
  const { authority, policy, record, trustAnchor } = resolveAuthority(command, modelContext, trustContext);
  const suppressed = authority.lifecycleState !== "ACTIVE" || authority.consent.state !== "GRANTED" || !authority.consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE");
  if (suppressed) {
    parseEvidenceEngineState(evidence.state);
    if (evidence.state.status === "ACTIVE" || evidence.rebuildMaterial !== null || evidence.acceptedEvents.length || evidence.deduplication.length) throw new ContractValidationError("$.evidence", "suppressed model build received persistable personal evidence");
    const status = authority.lifecycleState === "ERASED" ? "ERASED" : authority.lifecycleState === "WITHDRAWN" ? "WITHDRAWN" : authority.lifecycleState === "RESET" ? "RESET" : "SUPPRESSED_NO_CONSENT";
    const state = emptyState(status); return { state, persistable: state };
  }
  assertActiveEvidenceAuthority(evidence, evidenceAuthority, authority);
  const observations = observationRecords(evidence.state.chains, authority.subject.subjectBindingHash);
  const interpretations = buildInterpretations(observations, evidence.rebuildMaterial!.worldEvidence, evidence.rebuildMaterial!.contextEvidence, policy, command, authority);
  return assembleModelState(evidence, command, authority, policy, record, trustAnchor, observations, interpretations);
}

export function verifyUserModelState(value: unknown, evidence: EvidenceBuildResult, command: unknown, evidenceAuthority: EvidenceAuthorityContext, modelContext: UserModelAuthorityContext, trustContext: UserModelAuthorityTrustContext): UserModelState {
  const parsed = parseUserModelState(value);
  const rebuilt = buildUserModel(evidence, command, evidenceAuthority, modelContext, trustContext).state;
  if (comparable(parsed) !== comparable(rebuilt)) throw new ContractValidationError("$.state", "user model differs from recursive authoritative rebuild");
  return parsed;
}

export interface IncrementalUserModelInput {
  readonly previous: UserModelBuildResult; readonly previousEvidence: EvidenceBuildResult; readonly nextEvidence: EvidenceBuildResult;
  readonly previousCommand: unknown; readonly command: unknown; readonly previousEvidenceAuthority: EvidenceAuthorityContext; readonly nextEvidenceAuthority: EvidenceAuthorityContext;
  readonly previousModelContext: UserModelAuthorityContext; readonly previousTrustContext: UserModelAuthorityTrustContext;
  readonly modelContext: UserModelAuthorityContext; readonly trustContext: UserModelAuthorityTrustContext;
}

function chainItems(chain: EvidenceChainV2): readonly EvidenceItem[] {
  return Object.values(chain.slots).flat();
}

function assertHistoricalChainPreserved(previous: EvidenceChainV2, next: EvidenceChainV2): void {
  if (previous.subject.subjectBindingHash !== next.subject.subjectBindingHash || previous.builderPolicyVersion !== next.builderPolicyVersion || previous.processingAuthorization.consentVersion !== next.processingAuthorization.consentVersion || previous.journey.journeyId !== next.journey.journeyId || previous.journey.policyVersion !== next.journey.policyVersion || previous.journey.authorityContextVersion !== next.journey.authorityContextVersion || previous.journey.independenceEligible !== next.journey.independenceEligible) throw new ContractValidationError("$.nextEvidence", "incremental evidence replaced historical chain authority");
  const nextItems = new Map(chainItems(next).map((item) => [item.eventHash, item]));
  const correctedTargets = new Set(next.corrections.map((correction) => correction.targetEventHash));
  for (const priorItem of chainItems(previous)) {
    const nextItem = nextItems.get(priorItem.eventHash);
    if (!nextItem) throw new ContractValidationError("$.nextEvidence", "incremental evidence removed historical chain item");
    const priorBody = withoutHash(priorItem as unknown as Record<string, unknown>, "active"); const nextBody = withoutHash(nextItem as unknown as Record<string, unknown>, "active");
    if (comparable(priorBody) !== comparable(nextBody) || (!priorItem.active && nextItem.active) || (priorItem.active && !nextItem.active && !correctedTargets.has(priorItem.eventHash))) throw new ContractValidationError("$.nextEvidence", "incremental evidence replaced historical canonical evidence without an authorized correction");
  }
  for (const binding of previous.worldEvidence) if (!next.worldEvidence.some((candidate) => comparable(candidate) === comparable(binding))) throw new ContractValidationError("$.nextEvidence", "incremental evidence replaced historical world binding");
  for (const binding of previous.contextEvidence) if (!next.contextEvidence.some((candidate) => comparable(candidate) === comparable(binding))) throw new ContractValidationError("$.nextEvidence", "incremental evidence replaced historical context binding");
}

/** Genuine delta path: only changed/new chains are observed and interpreted. It never delegates the next state to buildUserModel. */
export function updateUserModel(input: IncrementalUserModelInput): UserModelBuildResult {
  const command = UserModelCommandSchema.parse(input.command);
  const prior = verifyUserModelState(input.previous.state, input.previousEvidence, input.previousCommand, input.previousEvidenceAuthority, input.previousModelContext, input.previousTrustContext);
  if (prior.rebuildMaterial === null || !prior.snapshot || !prior.manifest || !prior.evidenceCheckpoint) throw new ContractValidationError("$.previous", "suppressed or erased model cannot be incrementally reused");
  const { authority, policy, record, trustAnchor } = resolveAuthority(command, input.modelContext, input.trustContext);
  assertActiveEvidenceAuthority(input.nextEvidence, input.nextEvidenceAuthority, authority);
  if (prior.evidenceCheckpoint.evidenceStateHash !== input.previousEvidence.state.stateHash || prior.evidenceCheckpoint.checkpointHash !== evidenceCheckpoint(input.previousEvidence, authority.subject.subjectBindingHash).checkpointHash) throw new ContractValidationError("$.previous.evidenceCheckpoint", "previous ledger checkpoint is missing or manipulated");
  const expectedManifest = buildManifest(authority, policy, record, trustAnchor);
  if (prior.manifest.interpretationPolicy.policyHash !== expectedManifest.interpretationPolicy.policyHash || prior.manifest.conceptRegistry.registryHash !== expectedManifest.conceptRegistry.registryHash || prior.manifest.reducer.codeHash !== expectedManifest.reducer.codeHash || prior.manifest.temporal.temporalPolicyVersion !== expectedManifest.temporal.temporalPolicyVersion) throw new ContractValidationError("$.manifest", "policy, registry, reducer or temporal change requires a full rebuild");
  const nextLedger = new Set(input.nextEvidence.state.ledgerEventHashes);
  if (prior.evidenceCheckpoint.ledgerEventHashes.some((hash) => !nextLedger.has(hash))) throw new ContractValidationError("$.nextEvidence", "incremental evidence removed or replaced historical ledger evidence");
  const priorChains = new Map(input.previousEvidence.state.chains.map((chain) => [chain.chainId, chain]));
  const nextChains = new Map(input.nextEvidence.state.chains.map((chain) => [chain.chainId, chain]));
  for (const chainId of priorChains.keys()) if (!nextChains.has(chainId)) throw new ContractValidationError("$.nextEvidence", "incremental evidence removed a historical chain");
  for (const [chainId, chain] of priorChains) if (nextChains.get(chainId)?.chainHash !== chain.chainHash) assertHistoricalChainPreserved(chain, nextChains.get(chainId)!);
  const affectedChainIds = new Set([...nextChains].filter(([chainId, chain]) => priorChains.get(chainId)?.chainHash !== chain.chainHash).map(([chainId]) => chainId));
  const retainedObservations = prior.observations.filter((observation) => !affectedChainIds.has(observation.chainId));
  const deltaChains = [...nextChains.values()].filter((chain) => affectedChainIds.has(chain.chainId));
  const deltaObservations = observationRecords(deltaChains, authority.subject.subjectBindingHash);
  const retainedObservationIds = new Set(retainedObservations.map((observation) => observation.observationId));
  const retainedInterpretations = prior.interpretations.filter((interpretation) => interpretation.observationIds.every((id) => retainedObservationIds.has(id)));
  const deltaInterpretations = buildInterpretations(deltaObservations, input.nextEvidence.rebuildMaterial!.worldEvidence, input.nextEvidence.rebuildMaterial!.contextEvidence, policy, command, authority);
  return assembleModelState(input.nextEvidence, command, authority, policy, record, trustAnchor, [...retainedObservations, ...deltaObservations], [...retainedInterpretations, ...deltaInterpretations]);
}

const MODEL_LIFECYCLE_ACTIONS = ["CONSENT_WITHDRAWAL", "FULL_PERSONALIZATION_RESET", "ACCOUNT_ERASURE"] as const;
const LifecycleEffectSchema = schema.enum(["DELETE", "INVALIDATE", "RETAIN_NON_PERSONAL"] as const);
export const UserModelLifecyclePlanSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelLifecyclePlan), operationId: identifier, action: schema.enum(MODEL_LIFECYCLE_ACTIONS), status: schema.literal("PLANNED"),
  manifestVersion: schema.literal(USER_INTELLIGENCE_LIFECYCLE_MANIFEST.version), manifestHash: schema.literal(USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH),
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256 }), plannedAt: timestamp,
  requirements: schema.array(schema.object({ store: schema.enum(REQUIRED_LIFECYCLE_STORES), effect: LifecycleEffectSchema }), { min: 1, max: 64 }), planHash: sha256,
});
export type UserModelLifecyclePlan = Infer<typeof UserModelLifecyclePlanSchema>;

export const UserModelLifecycleExecutionRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelLifecycleExecution), recordId: identifier, operationId: identifier, action: schema.enum(MODEL_LIFECYCLE_ACTIONS),
  manifestVersion: schema.literal(USER_INTELLIGENCE_LIFECYCLE_MANIFEST.version), manifestHash: schema.literal(USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH),
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256 }), store: schema.enum(REQUIRED_LIFECYCLE_STORES), effect: LifecycleEffectSchema,
  executedAt: timestamp, executorAuthority: schema.literal("SYNTHETIC_AUTHORIZED_STORE_EXECUTOR"), personalDataRemaining: schema.boolean(), recordHash: sha256,
});
export type UserModelLifecycleExecutionRecord = Infer<typeof UserModelLifecycleExecutionRecordSchema>;
export function withUserModelLifecycleExecutionRecordHash(value: Omit<UserModelLifecycleExecutionRecord, "recordHash">): UserModelLifecycleExecutionRecord { return UserModelLifecycleExecutionRecordSchema.parse({ ...value, recordHash: contentHash(value) }); }

export const UserModelLifecycleTrustAnchorSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelLifecycleTrustAnchor), anchorId: identifier, recordId: identifier, recordHash: sha256,
  acceptedExecutorAuthority: schema.literal("SYNTHETIC_AUTHORIZED_STORE_EXECUTOR"), environment: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionAuthorized: schema.literal(false), verifiedAt: timestamp, anchorHash: sha256,
});
export type UserModelLifecycleTrustAnchor = Infer<typeof UserModelLifecycleTrustAnchorSchema>;
export function withUserModelLifecycleTrustAnchorHash(value: Omit<UserModelLifecycleTrustAnchor, "anchorHash">): UserModelLifecycleTrustAnchor { return UserModelLifecycleTrustAnchorSchema.parse({ ...value, anchorHash: contentHash(value) }); }
export interface UserModelLifecycleExecutionContext { listExecutionRecords(operationId: string): readonly unknown[]; getAcceptedTrustAnchor(recordId: string): unknown; }

export const UserModelLifecycleCompletionSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelLifecycleCompletion), operationId: identifier, action: schema.enum(MODEL_LIFECYCLE_ACTIONS), status: schema.literal("COMPLETED"),
  manifestVersion: schema.literal(USER_INTELLIGENCE_LIFECYCLE_MANIFEST.version), manifestHash: schema.literal(USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH),
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256 }), state: UserModelStateSchema,
  executionRecordHashes: schema.array(sha256, { min: 1, max: 64 }), completedAt: timestamp, completionHash: sha256,
});
export type UserModelLifecycleCompletion = Infer<typeof UserModelLifecycleCompletionSchema>;

function lifecycleRequirements(action: typeof MODEL_LIFECYCLE_ACTIONS[number]): readonly { store: LifecycleStoreName; effect: "DELETE" | "INVALIDATE" | "RETAIN_NON_PERSONAL" }[] {
  return planLifecycleImpact(action).map(({ store, effect }) => {
    if (effect !== "DELETE" && effect !== "INVALIDATE" && effect !== "RETAIN_NON_PERSONAL") throw new ContractValidationError("$.action", "unsupported model lifecycle plan effect");
    return { store, effect };
  });
}

export function planUserModelLifecycle(action: typeof MODEL_LIFECYCLE_ACTIONS[number], operationId: string, boundUserId: string, subjectBindingHash: string, plannedAt: string): UserModelLifecyclePlan {
  const body = { contractVersion: CONTRACT_VERSIONS.userModelLifecyclePlan, operationId, action, status: "PLANNED" as const, manifestVersion: USER_INTELLIGENCE_LIFECYCLE_MANIFEST.version, manifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH, subject: { boundUserId, subjectBindingHash }, plannedAt, requirements: lifecycleRequirements(action) } as const;
  return UserModelLifecyclePlanSchema.parse({ ...body, planHash: contentHash(body) });
}

export function verifyUserModelLifecycleCompletion(rawPlan: unknown, context: UserModelLifecycleExecutionContext, completedAt: string): UserModelLifecycleCompletion {
  const plan = UserModelLifecyclePlanSchema.parse(rawPlan);
  if (contentHash(withoutHash(plan as unknown as Record<string, unknown>, "planHash")) !== plan.planHash) throw new ContractValidationError("$.planHash", "lifecycle plan hash mismatch");
  const canonicalRequirements = lifecycleRequirements(plan.action);
  if (comparable(plan.requirements) !== comparable(canonicalRequirements)) throw new ContractValidationError("$.requirements", "lifecycle requirements must come from the complete canonical manifest");
  const rawRecords = context.listExecutionRecords(plan.operationId);
  const records = rawRecords.map((raw) => {
    const record = UserModelLifecycleExecutionRecordSchema.parse(raw);
    if (contentHash(withoutHash(record as unknown as Record<string, unknown>, "recordHash")) !== record.recordHash) throw new ContractValidationError("$.execution.recordHash", "lifecycle execution record hash mismatch");
    return record;
  });
  assertUnique(records.map((record) => record.recordId), "$.execution.recordId"); assertUnique(records.map((record) => record.store), "$.execution.store"); assertUnique(records.map((record) => record.recordHash), "$.execution.recordHash");
  if (records.length !== canonicalRequirements.length) throw new ContractValidationError("$.execution", "execution evidence must cover every canonical lifecycle store exactly once");
  for (const requirement of canonicalRequirements) {
    const record = records.find((candidate) => candidate.store === requirement.store);
    if (!record || record.effect !== requirement.effect || record.operationId !== plan.operationId || record.action !== plan.action || record.manifestVersion !== plan.manifestVersion || record.manifestHash !== plan.manifestHash || record.subject.boundUserId !== plan.subject.boundUserId || record.subject.subjectBindingHash !== plan.subject.subjectBindingHash) throw new ContractValidationError("$.execution", `invalid or missing execution evidence for ${requirement.store}`);
    if (record.personalDataRemaining) throw new ContractValidationError("$.execution.personalDataRemaining", `${requirement.store} still contains personal data`);
    const anchor = UserModelLifecycleTrustAnchorSchema.parse(context.getAcceptedTrustAnchor(record.recordId));
    if (contentHash(withoutHash(anchor as unknown as Record<string, unknown>, "anchorHash")) !== anchor.anchorHash || anchor.recordId !== record.recordId || anchor.recordHash !== record.recordHash || anchor.acceptedExecutorAuthority !== record.executorAuthority) throw new ContractValidationError("$.execution.trustAnchor", "execution record is not independently accepted");
    if (Date.parse(record.executedAt) < Date.parse(plan.plannedAt) || Date.parse(record.executedAt) > Date.parse(completedAt) || Date.parse(anchor.verifiedAt) < Date.parse(record.executedAt)) throw new ContractValidationError("$.execution.executedAt", "execution chronology is invalid");
  }
  const state = emptyState(plan.action === "ACCOUNT_ERASURE" ? "ERASED" : plan.action === "CONSENT_WITHDRAWAL" ? "WITHDRAWN" : "RESET");
  const body = { contractVersion: CONTRACT_VERSIONS.userModelLifecycleCompletion, operationId: plan.operationId, action: plan.action, status: "COMPLETED" as const, manifestVersion: plan.manifestVersion, manifestHash: plan.manifestHash, subject: plan.subject, state, executionRecordHashes: records.map((record) => record.recordHash).sort(), completedAt } as const;
  return UserModelLifecycleCompletionSchema.parse({ ...body, completionHash: contentHash(body) });
}

/**
 * Compatibility adapter for the canonical RelevantUserProjection contract.
 * Phase 3A has no production interpretation/projection policy, therefore it can
 * only emit a neutral, minimized projection and never ranking instructions.
 */
export function buildUserModelDecisionProjection(request: RelevantUserProjectionRequest, consent: ConsentEnvelope, model: UserModelBuildResult, now: string): RelevantUserProjection {
  parseConsentEnvelope(consent);
  const privacySuppressed = request.killSwitch || consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE");
  const state = privacySuppressed ? null : parseUserModelState(model.state);
  if (state && (state.status === "ACTIVE" || state.status === "COLD")) {
    if (!state.snapshot || !state.manifest || state.subjectBindingHash !== request.actor.subjectBindingHash) throw new ContractValidationError("$.request.actor", "active model and request subject binding differ");
    if (state.snapshot.lifecycle.consentVersion !== consent.consentVersion || state.snapshot.lifecycle.purpose !== consent.purpose) throw new ContractValidationError("$.consent", "projection consent is stale or belongs to another purpose");
    if (state.manifest.temporal.projectionPolicyVersion !== request.projectionPolicyVersion) throw new ContractValidationError("$.projectionPolicyVersion", "projection policy is not bound to the model authority");
    if (request.snapshot && (request.snapshot.snapshotId !== state.snapshot.snapshotId || request.snapshot.snapshotHash !== state.snapshot.snapshotHash)) throw new ContractValidationError("$.request.snapshot", "projection request references a foreign or stale model snapshot");
  }
  const reason = request.killSwitch ? "KILL_SWITCH" as const
    : privacySuppressed ? "NO_CONSENT" as const
    : state?.status === "COLD" ? "COLD_START" as const
    : state?.status !== "ACTIVE" ? "MISSING_SNAPSHOT" as const
    : "INSUFFICIENT_CONFIDENCE" as const;
  const neutralManifest = { manifestId: "phase3a-non-personal-contract-manifest", manifestHash: contentHash({ contractVersion: CONTRACT_VERSIONS.projection, projectionPolicyVersion: request.projectionPolicyVersion, productionPolicyConfigured: false }) };
  return buildRelevantUserProjection({
    request, consent,
    manifest: neutralManifest,
    snapshot: null,
    content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } },
    identity: { projectionId: `projection-${contentHash({ contractVersion: CONTRACT_VERSIONS.projection, requestId: request.requestId, decisionId: request.decisionId, projectionPolicyVersion: request.projectionPolicyVersion, neutralReason: reason })}` },
    clock: { now }, forcedNeutralReason: reason,
  });
}

export interface UserModelIntegrityVerificationInput {
  readonly state: unknown; readonly evidence: EvidenceBuildResult; readonly command: unknown;
  readonly evidenceAuthority: EvidenceAuthorityContext; readonly modelContext: UserModelAuthorityContext; readonly trustContext: UserModelAuthorityTrustContext;
  readonly projection?: { readonly value: unknown; readonly request: RelevantUserProjectionRequest; readonly consent: ConsentEnvelope; readonly now: string };
  readonly lifecycle?: { readonly value: unknown; readonly plan: unknown; readonly executionContext: UserModelLifecycleExecutionContext; readonly completedAt: string };
}

/** Canonical authority boundary for a complete Phase-3A model bundle. */
export function verifyUserModelIntegrity(input: UserModelIntegrityVerificationInput): UserModelState {
  const state = verifyUserModelState(input.state, input.evidence, input.command, input.evidenceAuthority, input.modelContext, input.trustContext);
  if (input.projection) {
    const expected = buildUserModelDecisionProjection(input.projection.request, input.projection.consent, { state, persistable: state }, input.projection.now);
    if (comparable(input.projection.value) !== comparable(expected)) throw new ContractValidationError("$.projection", "projection differs from the authoritative model projection");
  }
  if (input.lifecycle) {
    const expected = verifyUserModelLifecycleCompletion(input.lifecycle.plan, input.lifecycle.executionContext, input.lifecycle.completedAt);
    if (comparable(input.lifecycle.value) !== comparable(expected)) throw new ContractValidationError("$.lifecycle", "lifecycle completion differs from authorized execution evidence");
  }
  return state;
}
