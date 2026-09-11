import { canonicalBytes, contentHash } from "./canonical.js";
import { REQUIRED_LIFECYCLE_STORES } from "./lifecycle.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

export const CONTRACT_VERSIONS = Object.freeze({
  canonicalUserEvent: "backyrd.user-intelligence.canonical-user-event@1.0",
  temporalValidation: "backyrd.user-intelligence.temporal-validation@1.0",
  temporalPolicy: "backyrd.user-intelligence.temporal-policy@1.0",
  eventReferencePolicy: "backyrd.user-intelligence.event-reference-policy@1.0",
  userEventAuthority: "backyrd.user-intelligence.user-event-authority@1.0",
  consentEnvelope: "backyrd.user-intelligence.consent-envelope@1.0",
  evidenceChain: "backyrd.user-intelligence.evidence-chain@1.0",
  userConceptReference: "backyrd.user-intelligence.user-concept-reference@1.0",
  tasteNode: "backyrd.user-intelligence.taste-node@1.0",
  practicalPreference: "backyrd.user-intelligence.practical-preference@1.0",
  directSpotAffinity: "backyrd.user-intelligence.direct-spot-affinity@1.0",
  manifest: "backyrd.user-intelligence.manifest@1.0",
  snapshot: "backyrd.user-intelligence.snapshot@1.0",
  projectionRequest: "backyrd.user-intelligence.projection-request@1.0",
  projection: "backyrd.user-intelligence.projection@1.0",
  transparencyView: "backyrd.user-intelligence.transparency-view@1.0",
  lifecycleCommand: "backyrd.user-intelligence.lifecycle-command@1.0",
  canonicalEventCatalog: "backyrd.user-intelligence.canonical-event-catalog@2.0",
  journeyResolution: "backyrd.user-intelligence.journey-resolution@2.0",
  deduplication: "backyrd.user-intelligence.deduplication@2.0",
  evidenceChainV2: "backyrd.user-intelligence.evidence-chain@2.0",
  worldEvidenceConsumer: "backyrd.user-intelligence.world-evidence-consumer@2.0",
  contextEvidence: "backyrd.user-intelligence.context-evidence@2.0",
  correctionResolution: "backyrd.user-intelligence.correction-resolution@2.0",
  evidenceEngineState: "backyrd.user-intelligence.evidence-engine-state@2.0",
  evidenceBuilderInput: "backyrd.user-intelligence.evidence-builder-input@2.0",
  interpretationPolicy: "backyrd.user-intelligence.interpretation-policy@3a.0",
  observationRecord: "backyrd.user-intelligence.observation-record@3a.0",
  interpretationRecord: "backyrd.user-intelligence.interpretation-record@3a.0",
  userModelManifest: "backyrd.user-intelligence.user-model-manifest@3a.0",
  userModelSnapshot: "backyrd.user-intelligence.user-model-snapshot@3a.0",
  userModelState: "backyrd.user-intelligence.user-model-state@3a.0",
  userModelCommand: "backyrd.user-intelligence.user-model-command@3a.0",
  userModelAuthority: "backyrd.user-intelligence.user-model-authority@3a.0",
  userModelAuthorityRecord: "backyrd.user-intelligence.user-model-authority-record@3a.1",
  userModelAuthorityTrustAnchor: "backyrd.user-intelligence.user-model-authority-trust-anchor@3a.1",
  userModelEvidenceCheckpoint: "backyrd.user-intelligence.user-model-evidence-checkpoint@3a.1",
  userModelLifecyclePlan: "backyrd.user-intelligence.user-model-lifecycle-plan@3a.1",
  userModelLifecycleExecution: "backyrd.user-intelligence.user-model-lifecycle-execution@3a.1",
  userModelLifecycleTrustAnchor: "backyrd.user-intelligence.user-model-lifecycle-trust-anchor@3a.1",
  userModelLifecycleCompletion: "backyrd.user-intelligence.user-model-lifecycle-completion@3a.1",
  signalSemanticsRegistry: "backyrd.user-intelligence.signal-semantics-registry@3b.2",
  calibrationPolicy: "backyrd.user-intelligence.calibration-policy@3b.2",
  calibrationPolicyTrustAnchor: "backyrd.user-intelligence.calibration-policy-trust-anchor@3b.2",
  calibrationAuthorityProof: "backyrd.user-intelligence.calibration-authority-proof@3b.1",
  calibrationEvidenceAdapter: "backyrd.user-intelligence.phase2-calibration-adapter@3b.1",
  calibrationEvidence: "backyrd.user-intelligence.calibration-evidence@3b.1",
  calibrationEvidenceTrustAnchor: "backyrd.user-intelligence.calibration-evidence-trust-anchor@3b.1",
  calibrationScenario: "backyrd.user-intelligence.calibration-scenario@3b.2",
  calibrationSemanticTarget: "backyrd.user-intelligence.calibration-semantic-target@3b.2",
  calibrationConflictRecord: "backyrd.user-intelligence.calibration-conflict-record@3b.2",
  calibrationReport: "backyrd.user-intelligence.calibration-report@3b.2",
  calibrationReleaseSummary: "backyrd.user-intelligence.calibration-release-summary@3b.2",
} as const);

export const SYNTHETIC_CONCEPT_REGISTRY_VERSION = "backyrd.synthetic-user-concepts@1.0";
export const SYNTHETIC_CONCEPT_IDS = Object.freeze([
  "place_type.cafe", "place_type.bar", "place_type.restaurant",
  "vibe.cozy", "vibe.quiet", "vibe.lively",
  "energy.calm", "energy.energetic",
  "price.budget", "price.premium",
  "environment.indoor", "environment.outdoor",
] as const);

const version = <T extends string>(value: T) => schema.literal(value);
const smallText = schema.string({ min: 1, max: 240 });
const count = schema.number({ min: 0, integer: true });
const confidence = schema.number({ min: 0, max: 1 });
const affinity = schema.number({ min: -1, max: 1 });
const knowledgeState = schema.enum(["UNKNOWN", "HYPOTHESIS", "SUPPORTED", "CONTRADICTED"] as const);

export const UserEventAuthoritySchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.userEventAuthority),
  kind: schema.enum(["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT", "VERIFIED_OUTCOME", "ADMINISTRATIVE_LIFECYCLE_ACTION"] as const),
  boundUserId: identifier,
  binding: schema.literal("SERVER_BOUND"),
  assertedBy: identifier,
  authenticatedActorId: schema.optional(identifier),
  sourceTrust: schema.enum(["UNTRUSTED_OBSERVATION", "AUTHENTICATED", "SERVER_VERIFIED", "PRIVILEGED_LIFECYCLE"] as const),
});
export type UserEventAuthority = Infer<typeof UserEventAuthoritySchema>;

export function parseUserEventAuthority(value: unknown): UserEventAuthority {
  const parsed = UserEventAuthoritySchema.parse(value);
  const expectedTrust = parsed.kind === "CLIENT_OBSERVATION" ? "UNTRUSTED_OBSERVATION"
    : parsed.kind === "ADMINISTRATIVE_LIFECYCLE_ACTION" ? "PRIVILEGED_LIFECYCLE"
    : ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT", "VERIFIED_OUTCOME"].includes(parsed.kind) ? "SERVER_VERIFIED"
    : "AUTHENTICATED";
  if (parsed.sourceTrust !== expectedTrust) throw new ContractValidationError("$.sourceTrust", "authority kind and source trust are inconsistent");
  if (["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"].includes(parsed.kind) && parsed.authenticatedActorId === undefined) throw new ContractValidationError("$.authenticatedActorId", "authenticated actor is required");
  return parsed;
}

export const ConsentEnvelopeSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.consentEnvelope),
  purpose: schema.literal("PERSONALIZED_RECOMMENDATIONS"),
  state: schema.enum(["GRANTED", "DENIED", "WITHDRAWN", "UNKNOWN"] as const),
  consentVersion: identifier,
  policyVersion: identifier,
  uxVersion: identifier,
  effectiveAt: timestamp,
  captureContext: schema.enum(["ONBOARDING", "SETTINGS", "MIGRATION_VERIFIED", "SYSTEM_UNKNOWN"] as const),
  allowedProcessing: schema.array(schema.enum(["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"] as const), { max: 4 }),
  lifecycleEffect: schema.enum(["ALLOW", "DO_NOT_PROCESS", "PURGE_PERSONALIZATION"] as const),
});
export type ConsentEnvelope = Infer<typeof ConsentEnvelopeSchema>;

export function parseConsentEnvelope(value: unknown): ConsentEnvelope {
  const parsed = ConsentEnvelopeSchema.parse(value);
  if (parsed.state === "GRANTED" && parsed.lifecycleEffect !== "ALLOW") throw new ContractValidationError("$.lifecycleEffect", "granted consent must allow processing");
  if (parsed.state !== "GRANTED" && parsed.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) throw new ContractValidationError("$.allowedProcessing", "non-granted consent cannot authorize personalization evidence");
  if (["WITHDRAWN", "DENIED"].includes(parsed.state) && parsed.lifecycleEffect !== "PURGE_PERSONALIZATION") throw new ContractValidationError("$.lifecycleEffect", "withdrawn or denied consent must purge personalization");
  if (parsed.state === "UNKNOWN" && parsed.lifecycleEffect !== "DO_NOT_PROCESS") throw new ContractValidationError("$.lifecycleEffect", "unknown consent must not process");
  return parsed;
}

export const UserConceptReferenceSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.userConceptReference),
  registryVersion: identifier,
  conceptId: identifier,
});
export type UserConceptReference = Infer<typeof UserConceptReferenceSchema>;

export function assertUserConceptCompatible(value: unknown, registryVersion: string, knownConceptIds: readonly string[]): UserConceptReference {
  const parsed = UserConceptReferenceSchema.parse(value);
  if (parsed.registryVersion !== registryVersion) throw new ContractValidationError("$.registryVersion", "incompatible registry version");
  if (!knownConceptIds.includes(parsed.conceptId)) throw new ContractValidationError("$.conceptId", "unknown concept; aliases and fuzzy matching are forbidden");
  return parsed;
}

const SourceSchema = schema.object({
  system: identifier,
  producer: identifier,
  sourceRecordId: identifier,
  provenance: schema.enum(["CLIENT_OBSERVED", "USER_DECLARED", "PRODUCT_STATE", "DATABASE_TRIGGER", "SERVER_VERIFIED", "ADMINISTRATIVE"] as const),
});
export const EventReferencesSchema = schema.object({
  sessionId: schema.optional(identifier),
  decisionId: schema.optional(identifier),
  spotId: schema.optional(identifier),
  candidateId: schema.optional(identifier),
  experienceEventId: schema.optional(identifier),
});

export const JourneyBindingSchema = schema.union([
  schema.object({ resolution: schema.literal("SERVER_RESOLVED"), journeyId: identifier, resolutionPolicyVersion: identifier, independenceEligible: schema.literal(true) }),
  schema.object({ resolution: schema.literal("UNRESOLVED"), journeyId: schema.literal(null), resolutionPolicyVersion: identifier, independenceEligible: schema.literal(false) }),
]);

export const ServerReferenceBindingSchema = schema.object({
  authority: schema.literal("SERVER_PRODUCT_TRUTH"), boundUserId: identifier,
  resolutionRecordHash: sha256, referencePolicyVersion: identifier,
});

export const TemporalBindingSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.temporalValidation), policyVersion: identifier,
  timeAuthority: schema.enum(["SERVER_CLOCK", "CLIENT_REPORTED_ACCEPTED_OFFLINE"] as const), validatedAt: timestamp,
});

const ObservationPayloadSchema = schema.union([
  schema.object({ kind: schema.literal("DECISION_REQUEST"), contextReference: identifier }),
  schema.object({ kind: schema.literal("EXPOSURE"), candidateCount: count }),
  schema.object({ kind: schema.literal("INTERACTION"), action: schema.enum(["SPOT_OPENED"] as const) }),
  schema.object({ kind: schema.literal("INTENT"), action: schema.enum(["SAVED", "SAVE_REMOVED", "NAVIGATION", "RESERVATION"] as const) }),
  schema.object({ kind: schema.literal("EXPERIENCE"), experienceType: schema.enum(["VERIFIED_VISIT", "REVIEW"] as const), reviewOrigin: schema.optional(schema.enum(["STANDARD_REVIEW", "SMART_REVIEW"] as const)), experienceState: schema.literal("CONFIRMED"), satisfaction: schema.literal("UNKNOWN") }),
  schema.object({ kind: schema.literal("SATISFACTION"), direction: schema.enum(["POSITIVE", "NEGATIVE"] as const), declaration: schema.literal("EXPLICIT_USER_FEEDBACK") }),
  schema.object({ kind: schema.literal("CORRECTION"), targetEventId: identifier, correction: schema.enum(["NOT_THERE", "RETRACT", "REPLACE"] as const) }),
  schema.object({ kind: schema.literal("DECLARATION"), concept: UserConceptReferenceSchema, direction: schema.enum(["POSITIVE", "NEGATIVE"] as const) }),
]);

export const CanonicalUserEventSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.canonicalUserEvent),
  eventId: identifier,
  eventType: schema.enum(["DECISION_REQUESTED", "CANDIDATE_EXPOSED", "SPOT_OPENED", "SAVED", "SAVE_REMOVED", "NAVIGATION_INTENT", "RESERVATION_INTENT", "VERIFIED_VISIT", "REVIEW_RECORDED", "SATISFACTION_RECORDED", "USER_CORRECTION", "ONBOARDING_DECLARATION"] as const),
  eventClass: schema.enum(["REQUEST_CONTEXT", "EXPOSURE", "WEAK_INTERACTION", "DELIBERATE_INTENT", "EXPERIENCE", "EXPLICIT_SATISFACTION", "EXPLICIT_CORRECTION", "DECLARATION"] as const),
  occurredAt: timestamp,
  observedAt: timestamp,
  ingestedAt: timestamp,
  userId: identifier,
  references: EventReferencesSchema,
  journey: JourneyBindingSchema,
  referenceResolution: schema.optional(ServerReferenceBindingSchema),
  temporalBinding: TemporalBindingSchema,
  source: SourceSchema,
  authority: UserEventAuthoritySchema,
  consent: ConsentEnvelopeSchema,
  retentionClass: identifier,
  idempotencyKey: identifier,
  supersedesEventId: schema.optional(identifier),
  payload: ObservationPayloadSchema,
  eventHash: sha256,
});
export type CanonicalUserEvent = Infer<typeof CanonicalUserEventSchema>;

export const EVENT_REFERENCE_MATRIX = Object.freeze({
  DECISION_REQUESTED: { required: ["decisionId"], allowed: ["sessionId", "decisionId"], journey: "OPTIONAL", referenceResolution: "REQUIRED", authority: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] },
  CANDIDATE_EXPOSED: { required: ["decisionId", "spotId", "candidateId"], allowed: ["sessionId", "decisionId", "spotId", "candidateId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["CLIENT_OBSERVATION"] },
  SPOT_OPENED: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId", "candidateId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"] },
  SAVED: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] },
  SAVE_REMOVED: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] },
  NAVIGATION_INTENT: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"] },
  RESERVATION_INTENT: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] },
  VERIFIED_VISIT: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId", "experienceEventId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["VERIFIED_OUTCOME"] },
  REVIEW_RECORDED: { required: ["spotId"], allowed: ["sessionId", "decisionId", "spotId", "experienceEventId"], journey: "REQUIRED", referenceResolution: "REQUIRED", authority: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"] },
  SATISFACTION_RECORDED: { required: [], allowed: ["spotId", "experienceEventId"], journey: "QUALIFIED_EXPERIENCE", referenceResolution: "REQUIRED", authority: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] },
  USER_CORRECTION: { required: [], allowed: [], journey: "OPTIONAL", referenceResolution: "REQUIRED", authority: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] },
  ONBOARDING_DECLARATION: { required: [], allowed: [], journey: "FORBIDDEN", referenceResolution: "FORBIDDEN", authority: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] },
} as const);

const EVENT_SEMANTICS: Readonly<Record<CanonicalUserEvent["eventType"], { eventClass: CanonicalUserEvent["eventClass"]; payloadKind: CanonicalUserEvent["payload"]["kind"] }>> = Object.freeze({
  DECISION_REQUESTED: { eventClass: "REQUEST_CONTEXT", payloadKind: "DECISION_REQUEST" },
  CANDIDATE_EXPOSED: { eventClass: "EXPOSURE", payloadKind: "EXPOSURE" },
  SPOT_OPENED: { eventClass: "WEAK_INTERACTION", payloadKind: "INTERACTION" },
  SAVED: { eventClass: "DELIBERATE_INTENT", payloadKind: "INTENT" },
  SAVE_REMOVED: { eventClass: "DELIBERATE_INTENT", payloadKind: "INTENT" },
  NAVIGATION_INTENT: { eventClass: "DELIBERATE_INTENT", payloadKind: "INTENT" },
  RESERVATION_INTENT: { eventClass: "DELIBERATE_INTENT", payloadKind: "INTENT" },
  VERIFIED_VISIT: { eventClass: "EXPERIENCE", payloadKind: "EXPERIENCE" },
  REVIEW_RECORDED: { eventClass: "EXPERIENCE", payloadKind: "EXPERIENCE" },
  SATISFACTION_RECORDED: { eventClass: "EXPLICIT_SATISFACTION", payloadKind: "SATISFACTION" },
  USER_CORRECTION: { eventClass: "EXPLICIT_CORRECTION", payloadKind: "CORRECTION" },
  ONBOARDING_DECLARATION: { eventClass: "DECLARATION", payloadKind: "DECLARATION" },
});

function withoutHash(value: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function validateEventReferences(parsed: CanonicalUserEvent): void {
  const rule = EVENT_REFERENCE_MATRIX[parsed.eventType];
  const references = parsed.references as Readonly<Record<string, string | undefined>>;
  for (const required of rule.required) if (references[required] === undefined) throw new ContractValidationError(`$.references.${required}`, `${parsed.eventType} requires this authoritative reference`);
  for (const [name, value] of Object.entries(references)) if (value !== undefined && !(rule.allowed as readonly string[]).includes(name)) throw new ContractValidationError(`$.references.${name}`, `${parsed.eventType} forbids this reference`);
  if (!(rule.authority as readonly string[]).includes(parsed.authority.kind)) throw new ContractValidationError("$.authority.kind", `${parsed.eventType} requires its declared source authority`);
  if (rule.referenceResolution === "REQUIRED" && parsed.referenceResolution === undefined) throw new ContractValidationError("$.referenceResolution", `${parsed.eventType} requires server product truth resolution`);
  if (rule.referenceResolution === "FORBIDDEN" && parsed.referenceResolution !== undefined) throw new ContractValidationError("$.referenceResolution", `${parsed.eventType} forbids product reference resolution`);
  if (parsed.referenceResolution !== undefined && parsed.referenceResolution.boundUserId !== parsed.userId) throw new ContractValidationError("$.referenceResolution.boundUserId", "reference resolution is bound to another user");
  if (rule.journey === "REQUIRED" && parsed.journey.resolution !== "SERVER_RESOLVED") throw new ContractValidationError("$.journey", `${parsed.eventType} requires a server-resolved journey`);
  if (rule.journey === "FORBIDDEN" && parsed.journey.resolution !== "UNRESOLVED") throw new ContractValidationError("$.journey", `${parsed.eventType} forbids a journey`);
  if (rule.journey === "QUALIFIED_EXPERIENCE" && parsed.references.experienceEventId === undefined && parsed.journey.resolution !== "SERVER_RESOLVED") throw new ContractValidationError("$.references.experienceEventId", "satisfaction requires an experience target or qualified journey");
  if (parsed.references.candidateId !== undefined && (parsed.references.decisionId === undefined || parsed.references.spotId === undefined)) throw new ContractValidationError("$.references.candidateId", "candidate requires decision and spot references");
}

export function parseCanonicalUserEvent(value: unknown, expectedUserId?: string): CanonicalUserEvent {
  const parsed = CanonicalUserEventSchema.parse(value);
  parseUserEventAuthority(parsed.authority);
  parseConsentEnvelope(parsed.consent);
  const expected = EVENT_SEMANTICS[parsed.eventType];
  if (parsed.eventClass !== expected.eventClass || parsed.payload.kind !== expected.payloadKind) throw new ContractValidationError("$.eventType", "event type, class and payload are inconsistent");
  if (parsed.userId !== parsed.authority.boundUserId || (expectedUserId !== undefined && parsed.userId !== expectedUserId)) throw new ContractValidationError("$.userId", "identity is not bound to the authenticated server context");
  const expectedProvenance = parsed.authority.kind === "CLIENT_OBSERVATION" ? "CLIENT_OBSERVED"
    : parsed.authority.kind === "AUTHENTICATED_USER_ACTION" ? "USER_DECLARED"
    : parsed.authority.kind === "SERVER_VERIFIED_PRODUCT_STATE" ? "PRODUCT_STATE"
    : parsed.authority.kind === "DATABASE_DERIVED_EVENT" ? "DATABASE_TRIGGER"
    : parsed.authority.kind === "VERIFIED_OUTCOME" ? "SERVER_VERIFIED" : "ADMINISTRATIVE";
  if (parsed.source.provenance !== expectedProvenance) throw new ContractValidationError("$.source.provenance", "source provenance and authority are inconsistent");
  validateEventReferences(parsed);
  if (["EXPERIENCE", "EXPLICIT_SATISFACTION"].includes(parsed.eventClass) && ["CLIENT_OBSERVATION"].includes(parsed.authority.kind)) throw new ContractValidationError("$.authority.kind", "client observation cannot assert experience or satisfaction");
  if (parsed.eventType === "VERIFIED_VISIT" && parsed.authority.kind !== "VERIFIED_OUTCOME") throw new ContractValidationError("$.authority.kind", "verified visit requires verified outcome authority");
  if (parsed.eventType === "VERIFIED_VISIT" && (parsed.payload.kind !== "EXPERIENCE" || parsed.payload.experienceType !== "VERIFIED_VISIT")) throw new ContractValidationError("$.payload", "verified visit payload is required");
  if (parsed.eventType === "REVIEW_RECORDED") {
    if (parsed.payload.kind !== "EXPERIENCE" || parsed.payload.experienceType !== "REVIEW" || parsed.payload.reviewOrigin === undefined) throw new ContractValidationError("$.payload", "review origin is required");
  }
  if (parsed.eventType === "USER_CORRECTION") {
    if (parsed.payload.kind !== "CORRECTION" || parsed.supersedesEventId === undefined || parsed.payload.targetEventId !== parsed.supersedesEventId) throw new ContractValidationError("$.supersedesEventId", "correction target and supersedes event must be identical");
  } else if (parsed.supersedesEventId !== undefined) throw new ContractValidationError("$.supersedesEventId", "only a user correction may supersede an event");
  const expectedIntentAction = parsed.eventType === "SAVED" ? "SAVED" : parsed.eventType === "SAVE_REMOVED" ? "SAVE_REMOVED" : parsed.eventType === "NAVIGATION_INTENT" ? "NAVIGATION" : parsed.eventType === "RESERVATION_INTENT" ? "RESERVATION" : null;
  if (expectedIntentAction !== null && (parsed.payload.kind !== "INTENT" || parsed.payload.action !== expectedIntentAction)) throw new ContractValidationError("$.payload", `${parsed.eventType} has inconsistent intent semantics`);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "eventHash")) !== parsed.eventHash) throw new ContractValidationError("$.eventHash", "hash mismatch");
  return parsed;
}

export function withEventHash<T extends Omit<CanonicalUserEvent, "eventHash">>(event: T): T & { readonly eventHash: string } {
  return { ...event, eventHash: contentHash(event) };
}

const EvidenceReferenceSchema = schema.object({ eventId: identifier, eventHash: sha256, occurredAt: timestamp });
const EvidenceSegmentSchema = schema.object({ references: schema.array(EvidenceReferenceSchema, { max: 64 }), state: knowledgeState });
const TasteAttributionSchema = schema.object({
  concept: UserConceptReferenceSchema,
  direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"] as const),
  evidence: schema.array(EvidenceReferenceSchema, { min: 1, max: 32 }),
  interpretationPolicyRef: identifier,
});
const ConflictSchema = schema.object({
  conflictId: identifier,
  kind: schema.enum(["POSITIVE_AND_NEGATIVE", "EXPERIENCE_WITH_UNKNOWN_SATISFACTION", "CORRECTION", "SOURCE_DISAGREEMENT"] as const),
  evidence: schema.array(EvidenceReferenceSchema, { min: 1, max: 32 }),
  resolution: schema.enum(["UNRESOLVED", "CORRECTED", "SUPERSEDED"] as const),
});

export const EvidenceChainSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.evidenceChain),
  chainId: identifier,
  userId: identifier,
  journeyId: identifier,
  spotId: schema.optional(identifier),
  processingAuthorization: schema.object({ consentState: schema.enum(["GRANTED", "DENIED", "WITHDRAWN", "UNKNOWN"] as const), consentVersion: identifier, personalizationEvidenceAllowed: schema.boolean() }),
  segments: schema.object({
    exposure: EvidenceSegmentSchema,
    deliberateIntent: EvidenceSegmentSchema,
    experience: EvidenceSegmentSchema,
    satisfaction: EvidenceSegmentSchema,
    explicitCorrection: EvidenceSegmentSchema,
    directSpotRelationship: EvidenceSegmentSchema,
    practicalBehavior: EvidenceSegmentSchema,
    tasteAttribution: schema.array(TasteAttributionSchema, { max: 32 }),
  }),
  conflicts: schema.array(ConflictSchema, { max: 32 }),
  independence: schema.object({ journeyUnits: schema.literal(1), independentExperiences: schema.number({ min: 0, max: 1, integer: true }), repeatedSameSpotInteractions: count, multiConceptSingleExperience: schema.boolean() }),
  builderPolicyRef: identifier,
  chainHash: sha256,
});
export type EvidenceChain = Infer<typeof EvidenceChainSchema>;

export function parseEvidenceChain(value: unknown, expectedUserId?: string): EvidenceChain {
  const parsed = EvidenceChainSchema.parse(value);
  if (expectedUserId !== undefined && parsed.userId !== expectedUserId) throw new ContractValidationError("$.userId", "cross-user evidence chain");
  if (parsed.processingAuthorization.consentState !== "GRANTED" && parsed.processingAuthorization.personalizationEvidenceAllowed) throw new ContractValidationError("$.processingAuthorization", "non-granted consent cannot authorize evidence");
  if (!parsed.processingAuthorization.personalizationEvidenceAllowed) {
    const referenceCount = Object.entries(parsed.segments).filter(([key]) => key !== "tasteAttribution").reduce((sum, [, segment]) => sum + (segment as { readonly references: readonly unknown[] }).references.length, 0);
    if (referenceCount > 0 || parsed.segments.tasteAttribution.length > 0 || parsed.conflicts.length > 0) throw new ContractValidationError("$.segments", "no-consent chain must not contain personalization evidence");
  }
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "chainHash")) !== parsed.chainHash) throw new ContractValidationError("$.chainHash", "hash mismatch");
  return parsed;
}

const EvidenceSummarySchema = schema.object({ count, independentJourneys: count, references: schema.array(EvidenceReferenceSchema, { max: 32 }) });
const SufficiencySchema = schema.object({ level: schema.enum(["UNKNOWN", "LOW", "PARTIAL", "SUFFICIENT"] as const), policyRef: identifier, reasons: schema.array(identifier, { max: 16 }) });
const ScopeSchema = schema.object({ kind: schema.enum(["GLOBAL", "PLACE_TYPE", "CONTEXT"] as const), reference: schema.optional(identifier) });

export const TasteNodeSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.tasteNode), nodeId: identifier, concept: UserConceptReferenceSchema, scope: ScopeSchema,
  affinity, confidence, positiveEvidence: EvidenceSummarySchema, negativeEvidence: EvidenceSummarySchema,
  temporalView: schema.object({ asOf: timestamp, recentState: knowledgeState, longTermState: knowledgeState }),
  contradictions: schema.array(identifier, { max: 32 }), sufficiency: SufficiencySchema,
  reducerRef: identifier, policyRef: identifier,
});
export type TasteNode = Infer<typeof TasteNodeSchema>;

export const PracticalPreferenceSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.practicalPreference), preferenceId: identifier,
  dimension: schema.enum(["DISTANCE_BEHAVIOR", "PLANNING_BEHAVIOR", "FRICTION_TOLERANCE", "EXPLORATION_REPETITION"] as const),
  contextScope: schema.optional(identifier), observedBehavior: smallText, knowledgeState, confidence,
  opportunityControl: schema.enum(["NOT_OBSERVED", "PARTIAL", "CONTROLLED"] as const), evidence: EvidenceSummarySchema,
  causalPreferenceClaimed: schema.literal(false), policyRef: identifier,
});
export type PracticalPreference = Infer<typeof PracticalPreferenceSchema>;

export const DirectSpotAffinitySchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.directSpotAffinity), relationshipId: identifier, spotId: identifier,
  state: schema.enum(["UNKNOWN", "OBSERVED", "SAVED", "REPEATEDLY_SELECTED", "VISITED", "EXCLUDED", "CORRECTED"] as const),
  observations: schema.object({ viewed: count, saved: count, selected: count, visited: count, excluded: count, corrected: count }),
  experienceEvidence: EvidenceSummarySchema, satisfactionEvidence: EvidenceSummarySchema, confidence,
  propagatesToConceptTaste: schema.literal(false), policyRef: identifier,
});
export type DirectSpotAffinity = Infer<typeof DirectSpotAffinitySchema>;

export const UserIntelligenceManifestSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.manifest), manifestId: identifier,
  contracts: schema.object({ event: identifier, evidenceChain: identifier, snapshot: identifier, projection: identifier, transparency: identifier }),
  reducer: schema.object({ version: identifier, codeHash: sha256 }),
  registryVersions: schema.array(identifier, { min: 1, max: 16 }),
  policies: schema.object({ eventWeight: identifier, sourceReliability: identifier, attribution: identifier, decay: identifier, maturity: identifier, sufficiency: identifier, lifecycle: identifier, projection: identifier, contextAllowlist: identifier }),
  compatibility: schema.object({ worldKnowledgeContract: identifier, situationalContextContract: identifier, decisionContract: identifier }),
  unresolvedPolicies: schema.array(identifier, { max: 32 }), manifestHash: sha256,
});
export type UserIntelligenceManifest = Infer<typeof UserIntelligenceManifestSchema>;

export function parseUserIntelligenceManifest(value: unknown): UserIntelligenceManifest {
  const parsed = UserIntelligenceManifestSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "manifestHash")) !== parsed.manifestHash) throw new ContractValidationError("$.manifestHash", "hash mismatch");
  return parsed;
}

export const DomainSufficiencySchema = schema.object({ domain: identifier, sufficiency: SufficiencySchema });
const ContradictionSummarySchema = schema.object({ conflictId: identifier, state: schema.enum(["UNRESOLVED", "CORRECTED", "SUPERSEDED"] as const), domain: identifier });

export const UserIntelligenceSnapshotSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.snapshot), snapshotId: identifier, userId: identifier,
  sourceWatermark: schema.object({ lastEventId: schema.optional(identifier), occurredThrough: schema.optional(timestamp), sourceLedgerHash: sha256 }),
  manifest: schema.object({ manifestId: identifier, manifestHash: sha256 }),
  tasteNodes: schema.array(TasteNodeSchema, { max: 512 }), practicalPreferences: schema.array(PracticalPreferenceSchema, { max: 128 }), directSpotAffinities: schema.array(DirectSpotAffinitySchema, { max: 512 }),
  contradictions: schema.array(ContradictionSummarySchema, { max: 256 }), domainSufficiency: schema.array(DomainSufficiencySchema, { max: 64 }),
  changeSummary: schema.object({ created: count, updated: count, corrected: count, suppressed: count }),
  lifecycle: schema.object({ consentVersion: identifier, purpose: schema.literal("PERSONALIZED_RECOMMENDATIONS"), validUntil: schema.nullable(timestamp), invalidatedAt: schema.nullable(timestamp) }),
  snapshotHash: sha256,
  technicalMetadata: schema.object({ createdAt: timestamp }),
});
export type UserIntelligenceSnapshot = Infer<typeof UserIntelligenceSnapshotSchema>;

export function snapshotSemanticBody(snapshot: Omit<UserIntelligenceSnapshot, "snapshotHash"> | UserIntelligenceSnapshot): Record<string, unknown> {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "snapshotHash" && key !== "technicalMetadata"));
}

export function parseUserIntelligenceSnapshot(value: unknown, expectedUserId?: string): UserIntelligenceSnapshot {
  const parsed = UserIntelligenceSnapshotSchema.parse(value);
  if (expectedUserId !== undefined && parsed.userId !== expectedUserId) throw new ContractValidationError("$.userId", "cross-user snapshot");
  if (contentHash(snapshotSemanticBody(parsed)) !== parsed.snapshotHash) throw new ContractValidationError("$.snapshotHash", "hash mismatch");
  return parsed;
}

export const AuthenticatedActorSchema = schema.object({ kind: schema.literal("AUTHENTICATED_USER"), userId: identifier, subjectBindingHash: sha256, authenticationContextHash: sha256, boundBy: schema.literal("SERVER") });
const MinimizedContextSchema = schema.object({ contextContractVersion: identifier, contextHash: sha256, placeTypes: schema.array(identifier, { max: 12 }), domainKeys: schema.array(identifier, { max: 24 }), rawLocationIncluded: schema.literal(false), socialDetailsIncluded: schema.literal(false) });

export const RelevantUserProjectionRequestSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.projectionRequest), requestId: identifier, actor: AuthenticatedActorSchema,
  decisionId: identifier, snapshot: schema.nullable(schema.object({ snapshotId: identifier, snapshotHash: sha256 })), context: MinimizedContextSchema,
  requestedDomains: schema.array(identifier, { max: 24 }), budgets: schema.object({ maxItems: schema.number({ min: 0, max: 64, integer: true }), maxBytes: schema.number({ min: 256, max: 65536, integer: true }) }),
  projectionPolicyVersion: identifier, killSwitch: schema.boolean(),
});
export type RelevantUserProjectionRequest = Infer<typeof RelevantUserProjectionRequestSchema>;

export const PROJECTION_REASON_CODES = Object.freeze(["EXACT_CONTEXT", "PLACE_TYPE_MATCH", "PORTABLE_GLOBAL", "DIRECT_SPOT_RELATIONSHIP", "PRACTICAL_CONTEXT_MATCH"] as const);
export const SUPPRESSION_REASON_CODES = Object.freeze(["NO_CONSENT", "INSUFFICIENT_CONFIDENCE", "WRONG_DOMAIN", "CONTEXT_MISMATCH", "ITEM_BUDGET", "BYTE_BUDGET", "UNKNOWN_CONCEPT", "CONFLICT", "EXPIRED_EVIDENCE", "COLD_START", "MISSING_SNAPSHOT", "INCOMPATIBLE_VERSION", "KILL_SWITCH"] as const);
export const ProjectionReasonSchema = schema.object({ code: schema.enum(PROJECTION_REASON_CODES), subjectRef: identifier, policyRef: identifier });
export const SuppressionSummarySchema = schema.object({ total: count, byReason: schema.array(schema.object({ code: schema.enum(SUPPRESSION_REASON_CODES), count }), { max: 16 }) });
export const ProjectedTasteSchema = schema.object({ concept: UserConceptReferenceSchema, scope: ScopeSchema, affinity, confidence, reason: ProjectionReasonSchema });
export const ProjectedPracticalSchema = schema.object({ preferenceId: identifier, dimension: identifier, knowledgeState, confidence, reason: ProjectionReasonSchema });
export const ProjectedDirectSpotSchema = schema.object({ relationshipId: identifier, spotId: identifier, state: identifier, confidence, reason: ProjectionReasonSchema });

export const RelevantUserProjectionSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.projection), projectionId: identifier, decisionId: identifier, subjectBindingHash: sha256,
  snapshot: schema.nullable(schema.object({ snapshotId: identifier, snapshotHash: sha256 })),
  manifest: schema.object({ manifestId: identifier, manifestHash: sha256 }),
  status: schema.enum(["ACTIVE", "NEUTRAL"] as const), neutralReason: schema.nullable(schema.enum(SUPPRESSION_REASON_CODES)),
  taste: schema.array(ProjectedTasteSchema, { max: 64 }), practical: schema.array(ProjectedPracticalSchema, { max: 64 }), directSpot: schema.array(ProjectedDirectSpotSchema, { max: 64 }),
  domainSufficiency: schema.array(DomainSufficiencySchema, { max: 64 }), knowledgeLevel: schema.enum(["UNKNOWN", "LOW", "PARTIAL", "SUFFICIENT"] as const),
  suppression: SuppressionSummarySchema,
  boundaries: schema.object({ rawEventsIncluded: schema.literal(false), reviewTextIncluded: schema.literal(false), rawLocationIncluded: schema.literal(false), privateSocialDataIncluded: schema.literal(false), eligibilityAuthority: schema.literal(false), rankingAuthority: schema.literal(false) }),
  budgets: schema.object({ maxItems: count, maxBytes: count, actualItems: count, canonicalPayloadBytes: count }),
  projectionHash: sha256, technicalMetadata: schema.object({ createdAt: timestamp }),
});
export type RelevantUserProjection = Infer<typeof RelevantUserProjectionSchema>;

export function projectionHashBody(projection: Omit<RelevantUserProjection, "projectionHash"> | RelevantUserProjection): Record<string, unknown> {
  const body: Record<string, unknown> = Object.fromEntries(Object.entries(projection).filter(([key]) => key !== "projectionHash" && key !== "technicalMetadata"));
  const budgets = body.budgets as Record<string, unknown>;
  body.budgets = Object.fromEntries(Object.entries(budgets).filter(([key]) => key !== "canonicalPayloadBytes"));
  return body;
}

export function parseRelevantUserProjection(value: unknown, request?: RelevantUserProjectionRequest): RelevantUserProjection {
  const parsed = RelevantUserProjectionSchema.parse(value);
  const items = parsed.taste.length + parsed.practical.length + parsed.directSpot.length;
  if (parsed.budgets.actualItems !== items || items > parsed.budgets.maxItems) throw new ContractValidationError("$.budgets", "item budget mismatch");
  const actualBytes = canonicalBytes(projectionHashBody(parsed));
  if (parsed.budgets.canonicalPayloadBytes !== actualBytes || actualBytes > parsed.budgets.maxBytes) throw new ContractValidationError("$.budgets", "byte budget mismatch");
  if (contentHash(projectionHashBody(parsed)) !== parsed.projectionHash) throw new ContractValidationError("$.projectionHash", "hash mismatch");
  if (parsed.status === "NEUTRAL" && (items !== 0 || parsed.neutralReason === null)) throw new ContractValidationError("$.status", "neutral projection must be empty and explained");
  if (parsed.status === "ACTIVE" && parsed.neutralReason !== null) throw new ContractValidationError("$.neutralReason", "active projection cannot have a neutral reason");
  if (["NO_CONSENT", "MISSING_SNAPSHOT", "KILL_SWITCH"].includes(parsed.neutralReason ?? "")) {
    if (parsed.snapshot !== null || parsed.domainSufficiency.length > 0 || parsed.suppression.total !== 0 || parsed.suppression.byReason.length > 0) throw new ContractValidationError("$", "privacy-neutral projection must not expose snapshot or profile-derived details");
  }
  const expectedSubject = parsed.status === "NEUTRAL" ? contentHash("backyrd.user-intelligence.neutral-subject-binding@1.0") : request?.actor.subjectBindingHash;
  if (request && (parsed.subjectBindingHash !== expectedSubject || parsed.decisionId !== request.decisionId || parsed.budgets.maxItems !== request.budgets.maxItems || parsed.budgets.maxBytes !== request.budgets.maxBytes)) throw new ContractValidationError("$", "projection does not match server request binding");
  return parsed;
}

export const UserTransparencyViewSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.transparencyView), viewId: identifier, userId: identifier,
  snapshot: schema.object({ snapshotId: identifier, snapshotHash: sha256 }),
  topics: schema.array(schema.object({ topicId: identifier, labelKey: identifier, sourceKind: schema.enum(["USER_DECLARED", "LEARNED_ASSUMPTION", "DIRECT_SPOT_RELATIONSHIP", "PRACTICAL_OBSERVATION"] as const), confidenceBand: schema.enum(["UNKNOWN", "LOW", "MEDIUM", "HIGH"] as const), basisSummaryKey: identifier, correctable: schema.boolean(), activityExcludable: schema.boolean() }), { max: 128 }),
  controls: schema.array(schema.enum(["CORRECT_ASSUMPTION", "EXCLUDE_ACTIVITY", "RESET_DOMAIN", "RESET_ALL_PERSONALIZATION"] as const), { max: 4 }),
  internalSecurityDataIncluded: schema.literal(false), otherUserDataIncluded: schema.literal(false),
});
export type UserTransparencyView = Infer<typeof UserTransparencyViewSchema>;

export const LifecycleCommandSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.lifecycleCommand), commandId: identifier,
  action: schema.enum(["EXPORT", "CORRECTION", "ACTIVITY_EXCLUSION", "PARTIAL_RESET", "FULL_PERSONALIZATION_RESET", "CONSENT_WITHDRAWAL", "RETENTION_EXPIRY", "ACCOUNT_ERASURE", "REBUILD"] as const),
  userId: identifier, authority: UserEventAuthoritySchema, idempotencyKey: identifier,
  scope: schema.object({ domains: schema.array(identifier, { max: 64 }), eventIds: schema.array(identifier, { max: 256 }), allPersonalization: schema.boolean() }),
  targetStores: schema.array(schema.enum(REQUIRED_LIFECYCLE_STORES), { min: 1, max: 32 }), expectedEffect: schema.enum(["EXPORT_ONLY", "CORRECT_AND_REBUILD", "EXCLUDE_AND_REBUILD", "PURGE_AND_INVALIDATE", "PURGE_AND_DELETE", "REBUILD_DERIVED"] as const),
  completion: schema.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "PARTIAL"] as const), failureCode: schema.nullable(identifier),
  storeResults: schema.array(schema.object({ store: schema.enum(REQUIRED_LIFECYCLE_STORES), effect: schema.enum(["DELETED", "INVALIDATED", "REBUILT", "EXPORTED", "NO_CHANGE"] as const), completion: schema.enum(["PENDING", "COMPLETED", "FAILED"] as const) }), { max: 32 }),
  auditId: identifier, requestedAt: timestamp,
});
export type LifecycleCommand = Infer<typeof LifecycleCommandSchema>;

export function parseLifecycleCommand(value: unknown, expectedUserId?: string): LifecycleCommand {
  const parsed = LifecycleCommandSchema.parse(value);
  parseUserEventAuthority(parsed.authority);
  if (parsed.userId !== parsed.authority.boundUserId || (expectedUserId !== undefined && parsed.userId !== expectedUserId)) throw new ContractValidationError("$.userId", "lifecycle command identity mismatch");
  if (["FAILED", "PARTIAL"].includes(parsed.completion) !== (parsed.failureCode !== null)) throw new ContractValidationError("$.failureCode", "failure code must exist exactly for failed or partial commands");
  if (new Set(parsed.targetStores).size !== parsed.targetStores.length || new Set(parsed.storeResults.map(({ store }) => store)).size !== parsed.storeResults.length) throw new ContractValidationError("$.targetStores", "lifecycle stores must be unique");
  if (parsed.action === "ACCOUNT_ERASURE") {
    if (parsed.expectedEffect !== "PURGE_AND_DELETE") throw new ContractValidationError("$.expectedEffect", "account erasure requires purge-and-delete semantics");
    const personalStores = REQUIRED_LIFECYCLE_STORES.filter((store) => store !== "technical_audit_manifests");
    for (const store of personalStores) if (!parsed.targetStores.includes(store)) throw new ContractValidationError("$.targetStores", `account erasure must target ${store}`);
    if (parsed.completion === "COMPLETED") for (const store of personalStores) {
      const result = parsed.storeResults.find((entry) => entry.store === store);
      if (!result || result.effect !== "DELETED" || result.completion !== "COMPLETED") throw new ContractValidationError("$.storeResults", `completed account erasure must prove deletion of ${store}`);
    }
  }
  return parsed;
}

export const ReducerChangeRecordSchema = schema.object({
  contractVersion: schema.literal("backyrd.user-intelligence.reducer-change@1.0"), changeId: identifier, userId: identifier,
  beforeHash: schema.nullable(sha256), afterHash: schema.nullable(sha256), reasonCode: identifier, evidenceChainId: identifier,
  reducerVersion: identifier, occurredAt: timestamp,
});
export type ReducerChangeRecord = Infer<typeof ReducerChangeRecordSchema>;
