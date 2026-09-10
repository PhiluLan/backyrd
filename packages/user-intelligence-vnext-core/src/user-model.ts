import { canonicalJson, contentHash } from "./canonical.js";
import { ConsentEnvelope, ConsentEnvelopeSchema, CONTRACT_VERSIONS, parseConsentEnvelope, RelevantUserProjection, RelevantUserProjectionRequest, UserConceptReferenceSchema } from "./contracts.js";
import {
  ContextEvidenceBinding, EvidenceAuthorityContext, EvidenceBuildResult, EvidenceChainV2, parseEvidenceEngineState,
  verifyEvidenceEngineState, WorldEvidenceBinding,
} from "./evidence-chain.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";
import { buildRelevantUserProjection } from "./projection.js";

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

export const InterpretationPolicySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.interpretationPolicy),
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
  syntheticSufficiency: schema.object({ partialIndependentJourneys: count, sufficientIndependentJourneys: count }),
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
  if (parsed.syntheticSufficiency.partialIndependentJourneys > parsed.syntheticSufficiency.sufficientIndependentJourneys) throw new ContractValidationError("$.syntheticSufficiency", "partial threshold cannot exceed sufficient threshold");
  return parsed;
}

export const UserModelAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelAuthority),
  contextVersion: identifier,
  authority: schema.literal("SERVER_USER_MODEL_ORCHESTRATOR"),
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256, boundBy: schema.literal("SERVER_AUTHENTICATION") }),
  consent: ConsentEnvelopeSchema,
  lifecycleState: schema.enum(["ACTIVE", "WITHDRAWN", "RESET", "ERASED"] as const),
  interpretationPolicy: schema.object({ policyVersion: identifier, policyHash: sha256, acceptedAuthority: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionPolicyConfigured: schema.literal(false) }),
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
  getInterpretationPolicy(): unknown;
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
  interpretationPolicy: schema.object({ policyVersion: identifier, policyHash: sha256, authority: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionPolicyConfigured: schema.literal(false) }),
  conceptRegistry: schema.object({ registryVersion: identifier, registryHash: sha256 }),
  reducer: schema.object({ reducerVersion: identifier, codeHash: sha256 }),
  temporal: schema.object({ temporalPolicyVersion: identifier, recency: schema.literal("NOT_CONFIGURED"), decay: schema.literal("NOT_CONFIGURED") }),
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

export const UserModelStateSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.userModelState),
  status: schema.enum(["ACTIVE", "COLD", "SUPPRESSED_NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"] as const),
  subjectBindingHash: schema.nullable(sha256),
  manifest: schema.nullable(UserModelManifestV3Schema),
  observations: schema.array(ObservationRecordSchema, { max: 4096 }),
  interpretations: schema.array(InterpretationRecordSchema, { max: 4096 }),
  snapshot: schema.nullable(UserModelSnapshotV3Schema),
  latestSnapshotPointer: schema.nullable(schema.object({ snapshotId: identifier, snapshotHash: sha256 })),
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
    if (parsed.subjectBindingHash !== null || parsed.manifest !== null || parsed.observations.length || parsed.interpretations.length || parsed.snapshot !== null || parsed.latestSnapshotPointer !== null || parsed.incrementalReducerStateHash !== null || parsed.projectionCacheKeys.length || parsed.attributionWorkItems.length || parsed.rebuildMaterial !== null) throw new ContractValidationError("$.status", "suppressed lifecycle state contains personal model data");
  }
  if (parsed.snapshot && (!parsed.latestSnapshotPointer || parsed.latestSnapshotPointer.snapshotId !== parsed.snapshot.snapshotId || parsed.latestSnapshotPointer.snapshotHash !== parsed.snapshot.snapshotHash)) throw new ContractValidationError("$.latestSnapshotPointer", "snapshot pointer mismatch");
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "stateHash")) !== parsed.stateHash) throw new ContractValidationError("$.stateHash", "user model state hash mismatch");
  return parsed;
}

function emptyState(status: "SUPPRESSED_NO_CONSENT" | "WITHDRAWN" | "RESET" | "ERASED"): UserModelState {
  const body = { contractVersion: CONTRACT_VERSIONS.userModelState, status, subjectBindingHash: null, manifest: null, observations: [], interpretations: [], snapshot: null, latestSnapshotPointer: null, incrementalReducerStateHash: null, projectionCacheKeys: [], attributionWorkItems: [], rebuildMaterial: null } as const;
  return parseUserModelState({ ...body, stateHash: contentHash(body) });
}

function resolveAuthority(command: UserModelCommand, context: UserModelAuthorityContext): { authority: UserModelAuthority; policy: InterpretationPolicy } {
  const authority = UserModelAuthoritySchema.parse(context.getAuthority());
  parseConsentEnvelope(authority.consent);
  const policy = parseInterpretationPolicy(context.getInterpretationPolicy());
  if (policy.policyVersion !== authority.interpretationPolicy.policyVersion || policy.policyHash !== authority.interpretationPolicy.policyHash || policy.authority !== authority.interpretationPolicy.acceptedAuthority) throw new ContractValidationError("$.interpretationPolicy", "policy is not bound by server authority");
  if (command.interpretationPolicyVersion !== policy.policyVersion || command.conceptRegistryVersion !== authority.conceptRegistry.registryVersion || command.reducerVersion !== authority.reducer.reducerVersion || command.temporalPolicyVersion !== authority.temporalPolicyVersion) throw new ContractValidationError("$.command", "command attempts to select an unauthorized policy, registry, reducer or clock");
  if (Date.parse(command.interpretedAt) < Date.parse(policy.validFrom) || (policy.validUntil !== null && Date.parse(command.interpretedAt) > Date.parse(policy.validUntil))) throw new ContractValidationError("$.interpretedAt", "interpretation policy is not temporally applicable");
  assertUnique(authority.conceptRegistry.conceptIds, "$.conceptRegistry.conceptIds");
  if (authority.conceptRegistry.registryHash !== contentHash({ registryVersion: authority.conceptRegistry.registryVersion, conceptIds: [...authority.conceptRegistry.conceptIds].sort() })) throw new ContractValidationError("$.conceptRegistry.registryHash", "concept registry authority hash mismatch");
  return { authority, policy };
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
  const state = conflict ? "CONFLICTING" : journeys.length >= policy.syntheticSufficiency.sufficientIndependentJourneys ? "SUFFICIENT" : journeys.length >= policy.syntheticSufficiency.partialIndependentJourneys ? "PARTIAL" : "UNMATURE";
  return { state, independentEvidenceCount: journeys.length, evidenceDiversityCount: new Set(records.flatMap((record) => record.evidenceChainHashes)).size, recencyState: "NOT_CONFIGURED", conflict, limitations: ["SYNTHETIC_THRESHOLDS_ONLY", "RECENCY_NOT_CONFIGURED", "DECAY_NOT_CONFIGURED"] };
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

function buildManifest(authority: UserModelAuthority, policy: InterpretationPolicy): UserModelManifestV3 {
  const body = {
    contractVersion: CONTRACT_VERSIONS.userModelManifest, manifestId: `manifest-${contentHash({ policyHash: policy.policyHash, registryHash: authority.conceptRegistry.registryHash, reducer: authority.reducer })}`,
    evidenceContractVersion: CONTRACT_VERSIONS.evidenceChainV2, observationContractVersion: CONTRACT_VERSIONS.observationRecord, interpretationContractVersion: CONTRACT_VERSIONS.interpretationRecord, snapshotContractVersion: CONTRACT_VERSIONS.userModelSnapshot,
    interpretationPolicy: { policyVersion: policy.policyVersion, policyHash: policy.policyHash, authority: "SYNTHETIC_FIXTURE_ONLY", productionPolicyConfigured: false },
    conceptRegistry: { registryVersion: authority.conceptRegistry.registryVersion, registryHash: authority.conceptRegistry.registryHash }, reducer: { reducerVersion: authority.reducer.reducerVersion, codeHash: authority.reducer.codeHash },
    temporal: { temporalPolicyVersion: authority.temporalPolicyVersion, recency: "NOT_CONFIGURED", decay: "NOT_CONFIGURED" }, retentionConfigured: false,
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

export function buildUserModel(evidence: EvidenceBuildResult, rawCommand: unknown, evidenceAuthority: EvidenceAuthorityContext, modelContext: UserModelAuthorityContext): UserModelBuildResult {
  const command = UserModelCommandSchema.parse(rawCommand);
  const { authority, policy } = resolveAuthority(command, modelContext);
  const suppressed = authority.lifecycleState !== "ACTIVE" || authority.consent.state !== "GRANTED" || !authority.consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE");
  if (suppressed) {
    parseEvidenceEngineState(evidence.state);
    if (evidence.state.status === "ACTIVE" || evidence.rebuildMaterial !== null || evidence.acceptedEvents.length || evidence.deduplication.length) throw new ContractValidationError("$.evidence", "suppressed model build received persistable personal evidence");
    const status = authority.lifecycleState === "ERASED" ? "ERASED" : authority.lifecycleState === "WITHDRAWN" ? "WITHDRAWN" : authority.lifecycleState === "RESET" ? "RESET" : "SUPPRESSED_NO_CONSENT";
    const state = emptyState(status); return { state, persistable: state };
  }
  if (evidence.rebuildMaterial === null) throw new ContractValidationError("$.evidence", "active model build requires authoritative evidence rebuild material");
  verifyEvidenceEngineState(evidence.state, evidence.rebuildMaterial, evidenceAuthority);
  if (evidence.state.subjectBindingHash !== authority.subject.subjectBindingHash || evidence.rebuildMaterial.subject.boundUserId !== authority.subject.boundUserId) throw new ContractValidationError("$.subject", "foreign evidence cannot enter the user model");
  if (evidence.rebuildMaterial.consent.consentVersion !== authority.consent.consentVersion || evidence.rebuildMaterial.consent.policyVersion !== authority.consent.policyVersion) throw new ContractValidationError("$.consent", "evidence consent differs from model authority");
  const manifest = buildManifest(authority, policy);
  const observations = observationRecords(evidence.state.chains, authority.subject.subjectBindingHash);
  const interpretations = buildInterpretations(observations, evidence.rebuildMaterial.worldEvidence, evidence.rebuildMaterial.contextEvidence, policy, command, authority);
  const modelDimensions = dimensions(interpretations, policy);
  const overall = maturity(interpretations, policy);
  const conceptKeys = uniqueSorted(interpretations.filter((record) => record.concept).map((record) => `${record.concept!.registryVersion}:${record.concept!.conceptId}`));
  const conflicts = conceptKeys.map((key) => {
    const matching = interpretations.filter((record) => record.concept && `${record.concept.registryVersion}:${record.concept.conceptId}` === key);
    return { key: `conflict-${contentHash(key)}`, positiveInterpretationIds: uniqueSorted(matching.filter((row) => row.direction === "POSITIVE").map((row) => row.interpretationId)), negativeInterpretationIds: uniqueSorted(matching.filter((row) => row.direction === "NEGATIVE").map((row) => row.interpretationId)), state: "UNRESOLVED" as const };
  }).filter((row) => row.positiveInterpretationIds.length && row.negativeInterpretationIds.length);
  const snapshotBody = {
    contractVersion: CONTRACT_VERSIONS.userModelSnapshot, snapshotId: `snapshot-${contentHash({ evidenceStateHash: evidence.state.stateHash, manifestHash: manifest.manifestHash, interpretedAt: command.interpretedAt })}`,
    subject: { subjectBindingHash: authority.subject.subjectBindingHash, boundBy: "SERVER_AUTHENTICATION", userIdExternallyExposed: false }, manifest: { manifestId: manifest.manifestId, manifestHash: manifest.manifestHash },
    source: { evidenceStateHash: evidence.state.stateHash, evidenceChainHashes: evidence.state.chains.map((chain) => chain.chainHash).sort(), observationHashes: observations.map((row) => row.observationHash).sort(), interpretationHashes: interpretations.map((row) => row.interpretationHash).sort() },
    dimensions: modelDimensions, overallSufficiency: overall, conflicts,
    lifecycle: { state: "ACTIVE", consentVersion: authority.consent.consentVersion, purpose: "PERSONALIZED_RECOMMENDATIONS", retentionConfigured: false },
  } as const;
  const snapshot = UserModelSnapshotV3Schema.parse({ ...snapshotBody, snapshotHash: contentHash(snapshotBody) });
  const status = observations.length ? "ACTIVE" as const : "COLD" as const;
  const commandHash = contentHash(command);
  const stateBody = { contractVersion: CONTRACT_VERSIONS.userModelState, status, subjectBindingHash: authority.subject.subjectBindingHash, manifest, observations, interpretations, snapshot, latestSnapshotPointer: { snapshotId: snapshot.snapshotId, snapshotHash: snapshot.snapshotHash }, incrementalReducerStateHash: contentHash({ snapshotHash: snapshot.snapshotHash, evidenceStateHash: evidence.state.stateHash }), projectionCacheKeys: [], attributionWorkItems: [], rebuildMaterial: { evidenceStateHash: evidence.state.stateHash, commandHash } } as const;
  const state = parseUserModelState({ ...stateBody, stateHash: contentHash(stateBody) });
  return { state, persistable: state };
}

export function verifyUserModelState(value: unknown, evidence: EvidenceBuildResult, command: unknown, evidenceAuthority: EvidenceAuthorityContext, modelContext: UserModelAuthorityContext): UserModelState {
  const parsed = parseUserModelState(value);
  const rebuilt = buildUserModel(evidence, command, evidenceAuthority, modelContext).state;
  if (comparable(parsed) !== comparable(rebuilt)) throw new ContractValidationError("$.state", "user model differs from recursive authoritative rebuild");
  return parsed;
}

export function updateUserModel(previous: UserModelBuildResult, completeEvidence: EvidenceBuildResult, command: unknown, evidenceAuthority: EvidenceAuthorityContext, modelContext: UserModelAuthorityContext): UserModelBuildResult {
  const prior = parseUserModelState(previous.state);
  if (prior.rebuildMaterial === null || !prior.snapshot || !prior.manifest) throw new ContractValidationError("$.rebuildMaterial", "suppressed or erased model cannot be incrementally reused");
  const nextEvidenceHashes = new Set(completeEvidence.state.chains.map((chain) => chain.chainHash));
  if (prior.snapshot.source.evidenceChainHashes.some((hash) => !nextEvidenceHashes.has(hash))) throw new ContractValidationError("$.completeEvidence", "incremental input removed or replaced prior canonical evidence");
  return buildUserModel(completeEvidence, command, evidenceAuthority, modelContext);
}

export interface UserModelLifecycleResult {
  readonly action: "CONSENT_WITHDRAWAL" | "FULL_PERSONALIZATION_RESET" | "ACCOUNT_ERASURE";
  readonly status: "COMPLETED";
  readonly state: UserModelState;
  readonly storeResults: readonly { readonly store: string; readonly effect: "DELETE" | "RETAIN_NON_PERSONAL" }[];
  readonly proofHash: string;
}

export function applyUserModelLifecycle(action: UserModelLifecycleResult["action"], stores: readonly string[]): UserModelLifecycleResult {
  const unique = uniqueSorted(stores);
  if (unique.length !== stores.length) throw new ContractValidationError("$.stores", "lifecycle stores must be unique");
  const state = emptyState(action === "ACCOUNT_ERASURE" ? "ERASED" : action === "CONSENT_WITHDRAWAL" ? "WITHDRAWN" : "RESET");
  const storeResults = unique.map((store) => ({ store, effect: store === "technical_audit_manifests" ? "RETAIN_NON_PERSONAL" as const : "DELETE" as const }));
  const body = { action, status: "COMPLETED" as const, state, storeResults };
  return { ...body, proofHash: contentHash(body) };
}

export function verifyUserModelLifecycleCompletion(value: UserModelLifecycleResult, requiredStores: readonly string[]): UserModelLifecycleResult {
  parseUserModelState(value.state);
  if (value.state.rebuildMaterial !== null) throw new ContractValidationError("$.state.rebuildMaterial", "completed lifecycle result retains model rebuild material");
  if (new Set(value.storeResults.map((row) => row.store)).size !== value.storeResults.length || value.storeResults.length !== requiredStores.length) throw new ContractValidationError("$.storeResults", "lifecycle proof must cover every store exactly once");
  for (const store of requiredStores) {
    const row = value.storeResults.find((candidate) => candidate.store === store);
    if (!row || (store === "technical_audit_manifests" ? row.effect !== "RETAIN_NON_PERSONAL" : row.effect !== "DELETE")) throw new ContractValidationError("$.storeResults", `completed lifecycle action lacks deletion proof for ${store}`);
  }
  const body = { action: value.action, status: value.status, state: value.state, storeResults: value.storeResults };
  if (contentHash(body) !== value.proofHash) throw new ContractValidationError("$.proofHash", "model lifecycle proof mismatch");
  return value;
}

/**
 * Compatibility adapter for the canonical RelevantUserProjection contract.
 * Phase 3A has no production interpretation/projection policy, therefore it can
 * only emit a neutral, minimized projection and never ranking instructions.
 */
export function buildUserModelDecisionProjection(request: RelevantUserProjectionRequest, consent: ConsentEnvelope, model: UserModelBuildResult, now: string): RelevantUserProjection {
  const state = parseUserModelState(model.state);
  const reason = request.killSwitch ? "KILL_SWITCH" as const
    : consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE") ? "NO_CONSENT" as const
    : state.status === "COLD" ? "COLD_START" as const
    : state.status !== "ACTIVE" ? "MISSING_SNAPSHOT" as const
    : "INSUFFICIENT_CONFIDENCE" as const;
  return buildRelevantUserProjection({
    request, consent,
    manifest: state.manifest ? { manifestId: state.manifest.manifestId, manifestHash: state.manifest.manifestHash } : { manifestId: "phase3a-non-personal-contract-manifest", manifestHash: contentHash("phase3a-non-personal-contract-manifest") },
    snapshot: null,
    content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } },
    identity: { projectionId: `projection-${contentHash({ requestId: request.requestId, modelStateHash: state.stateHash })}` },
    clock: { now }, forcedNeutralReason: reason,
  });
}
