import { canonicalJson, contentHash } from "./canonical.js";
import {
  CanonicalUserEvent, CanonicalUserEventSchema, ConsentEnvelopeSchema, CONTRACT_VERSIONS,
  parseCanonicalUserEvent, parseConsentEnvelope,
} from "./contracts.js";
import { assertConfiguredEventSemantics, CANONICAL_EVENT_CATALOG, EvidenceSlot, SemanticEventClass } from "./event-catalog.js";
import { JourneyResolution, JourneyResolutionSchema, parseJourneyResolution } from "./journey-resolver.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const count = schema.number({ min: 0, integer: true });
const without = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const byEvent = (left: CanonicalUserEvent, right: CanonicalUserEvent) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId);

const WorldFactReferenceSchema = schema.object({ referenceId: identifier, kind: schema.enum(["CONCEPT", "FACT"] as const), trust: schema.enum(["VERIFIED", "SUPPORTED", "CONTESTED", "UNKNOWN"] as const), freshness: schema.enum(["CURRENT_AT_EVENT", "STALE_AT_EVENT", "UNKNOWN"] as const), provenanceSummary: identifier });
export const WorldEvidenceBindingSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.worldEvidenceConsumer), bindingId: identifier,
  eventId: identifier, eventHash: sha256, spotId: identifier,
  worldRegistryVersion: identifier, worldRegistryHash: sha256,
  stateKind: schema.enum(["EVENT_TIME_SNAPSHOT", "EVENT_TIME_PROJECTION"] as const), stateHash: sha256,
  evidenceAt: timestamp, resolvedAt: timestamp,
  references: schema.array(WorldFactReferenceSchema, { max: 64 }),
  conflicts: schema.array(identifier, { max: 32 }), unknowns: schema.array(identifier, { max: 32 }), exclusions: schema.array(identifier, { max: 32 }),
  bindingHash: sha256,
});
export type WorldEvidenceBinding = Infer<typeof WorldEvidenceBindingSchema>;

export function withWorldEvidenceHash(value: Omit<WorldEvidenceBinding, "bindingHash">): WorldEvidenceBinding {
  return WorldEvidenceBindingSchema.parse({ ...value, bindingHash: contentHash(value) });
}

export function parseWorldEvidenceBinding(value: unknown): WorldEvidenceBinding {
  const parsed = WorldEvidenceBindingSchema.parse(value);
  if (Date.parse(parsed.evidenceAt) > Date.parse(parsed.resolvedAt)) throw new ContractValidationError("$.resolvedAt", "world resolution cannot predate its evidence state");
  if (contentHash(without(parsed as unknown as Record<string, unknown>, ["bindingHash"])) !== parsed.bindingHash) throw new ContractValidationError("$.bindingHash", "world evidence binding hash mismatch");
  return parsed;
}

export const EventTimeWorldEvidenceRequestSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.worldEvidenceConsumer), requestId: identifier,
  eventId: identifier, eventHash: sha256, spotId: identifier, occurredAt: timestamp, resolutionPolicyVersion: identifier,
});
export type EventTimeWorldEvidenceRequest = Infer<typeof EventTimeWorldEvidenceRequestSchema>;
export interface EventTimeWorldEvidenceProvider { readonly providerVersion: string; resolve(request: EventTimeWorldEvidenceRequest): unknown; }
export function resolveEventTimeWorldEvidence(provider: EventTimeWorldEvidenceProvider, value: unknown): WorldEvidenceBinding {
  const request = EventTimeWorldEvidenceRequestSchema.parse(value);
  const result = parseWorldEvidenceBinding(provider.resolve(request));
  if (result.eventId !== request.eventId || result.eventHash !== request.eventHash || result.spotId !== request.spotId) throw new ContractValidationError("$.binding", "world provider returned a binding for another event or spot");
  if (Date.parse(result.evidenceAt) > Date.parse(request.occurredAt)) throw new ContractValidationError("$.evidenceAt", "current world state cannot be used as historical event-time evidence");
  return result;
}

export const ContextEvidenceBindingSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.contextEvidence), bindingId: identifier,
  eventId: identifier, eventHash: sha256, source: schema.enum(["USER_EXPLICIT", "SERVER_AUTHORIZED", "CAUTIOUSLY_INFERRED", "UNKNOWN", "NOT_CONFIGURED"] as const),
  contextContractVersion: identifier, contextHash: sha256, evidenceAt: timestamp,
  dimensions: schema.array(identifier, { max: 24 }), rawLocationIncluded: schema.literal(false), privateSocialDataIncluded: schema.literal(false),
  longTermTasteEligible: schema.literal(false), limitations: schema.array(identifier, { max: 24 }), bindingHash: sha256,
});
export type ContextEvidenceBinding = Infer<typeof ContextEvidenceBindingSchema>;
export function withContextEvidenceHash(value: Omit<ContextEvidenceBinding, "bindingHash">): ContextEvidenceBinding { return ContextEvidenceBindingSchema.parse({ ...value, bindingHash: contentHash(value) }); }
export function parseContextEvidenceBinding(value: unknown): ContextEvidenceBinding {
  const parsed = ContextEvidenceBindingSchema.parse(value);
  if ((parsed.source === "UNKNOWN" || parsed.source === "NOT_CONFIGURED") && parsed.dimensions.length > 0) throw new ContractValidationError("$.dimensions", "unknown context cannot carry inferred dimensions");
  if (contentHash(without(parsed as unknown as Record<string, unknown>, ["bindingHash"])) !== parsed.bindingHash) throw new ContractValidationError("$.bindingHash", "context evidence binding hash mismatch");
  return parsed;
}

export const CorrectionAuthorityRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.correctionResolution), authority: schema.literal("SERVER_EVENT_LEDGER"),
  correctionEventId: identifier, targetEventId: identifier, boundUserId: identifier, targetUserId: identifier,
  targetSpotId: schema.nullable(identifier), correctionSpotId: schema.nullable(identifier), targetOccurredAt: timestamp,
  policyVersion: identifier, resolutionRecordHash: sha256,
});
export type CorrectionAuthorityRecord = Infer<typeof CorrectionAuthorityRecordSchema>;
export function withCorrectionResolutionHash(value: Omit<CorrectionAuthorityRecord, "resolutionRecordHash">): CorrectionAuthorityRecord { return CorrectionAuthorityRecordSchema.parse({ ...value, resolutionRecordHash: contentHash(value) }); }
export function parseCorrectionAuthorityRecord(value: unknown): CorrectionAuthorityRecord {
  const parsed = CorrectionAuthorityRecordSchema.parse(value);
  if (contentHash(without(parsed as unknown as Record<string, unknown>, ["resolutionRecordHash"])) !== parsed.resolutionRecordHash) throw new ContractValidationError("$.resolutionRecordHash", "correction authority hash mismatch");
  return parsed;
}

const DEDUPE_REASONS = ["SAME_EVENT_ID", "SAME_IDEMPOTENCY_KEY", "SAME_PRODUCT_SOURCE_RECORD", "SAME_REVIEW_PRODUCT_RECORD"] as const;
export const DeduplicationRecordSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.deduplication), keptEventId: identifier, duplicateEventId: identifier, reason: schema.enum(DEDUPE_REASONS), auditHash: sha256 });
export type DeduplicationRecord = Infer<typeof DeduplicationRecordSchema>;
export interface DeduplicationResult { readonly events: readonly CanonicalUserEvent[]; readonly records: readonly DeduplicationRecord[]; }

function semanticBody(event: CanonicalUserEvent): Record<string, unknown> {
  return without(event as unknown as Record<string, unknown>, ["eventId", "eventHash", "idempotencyKey", "observedAt", "ingestedAt", "temporalBinding"]);
}

function dedupeRecord(keptEventId: string, duplicateEventId: string, reason: DeduplicationRecord["reason"]): DeduplicationRecord {
  const body = { contractVersion: CONTRACT_VERSIONS.deduplication, keptEventId, duplicateEventId, reason } as const;
  return DeduplicationRecordSchema.parse({ ...body, auditHash: contentHash(body) });
}

export function deduplicateCanonicalEvents(values: readonly unknown[], expectedUserId?: string): DeduplicationResult {
  const parsed = values.map((value) => parseCanonicalUserEvent(value, expectedUserId)).sort(byEvent);
  const accepted: CanonicalUserEvent[] = []; const records: DeduplicationRecord[] = [];
  const byId = new Map<string, CanonicalUserEvent>(); const byKey = new Map<string, CanonicalUserEvent>(); const bySource = new Map<string, CanonicalUserEvent>(); const byReviewRecord = new Map<string, CanonicalUserEvent>();
  for (const event of parsed) {
    const idMatch = byId.get(event.eventId);
    if (idMatch) {
      if (idMatch.eventHash !== event.eventHash) throw new ContractValidationError("$.eventId", "conflicting reuse of canonical event id");
      records.push(dedupeRecord(idMatch.eventId, event.eventId, "SAME_EVENT_ID")); continue;
    }
    const keyMatch = byKey.get(event.idempotencyKey);
    if (keyMatch) {
      if (contentHash(semanticBody(keyMatch)) !== contentHash(semanticBody(event))) throw new ContractValidationError("$.idempotencyKey", "conflicting reuse of idempotency key");
      records.push(dedupeRecord(keyMatch.eventId, event.eventId, "SAME_IDEMPOTENCY_KEY")); continue;
    }
    const journey = event.journey.resolution === "SERVER_RESOLVED" ? event.journey.journeyId : "UNRESOLVED";
    if (event.eventType === "REVIEW_RECORDED") {
      const reviewKey = `${event.userId}|${event.source.sourceRecordId}|${event.references.spotId ?? ""}`;
      const reviewMatch = byReviewRecord.get(reviewKey);
      if (reviewMatch) {
        const reviewJourney = reviewMatch.journey.resolution === "SERVER_RESOLVED" ? reviewMatch.journey.journeyId : "UNRESOLVED";
        if (reviewJourney !== journey) throw new ContractValidationError("$.source.sourceRecordId", "one review product record cannot authorize multiple journeys");
        records.push(dedupeRecord(reviewMatch.eventId, event.eventId, "SAME_REVIEW_PRODUCT_RECORD")); continue;
      }
      byReviewRecord.set(reviewKey, event);
    }
    const sourceKey = event.eventType === "REVIEW_RECORDED"
      ? `${event.userId}|REVIEW_RECORDED|${event.source.sourceRecordId}|${event.references.spotId ?? ""}|${journey}`
      : `${event.userId}|${event.eventType}|${event.source.system}|${event.source.producer}|${event.source.sourceRecordId}|${journey}`;
    const sourceMatch = bySource.get(sourceKey);
    if (sourceMatch) {
      if (event.eventType !== "REVIEW_RECORDED" && contentHash(semanticBody(sourceMatch)) !== contentHash(semanticBody(event))) throw new ContractValidationError("$.source.sourceRecordId", "conflicting semantic reuse of product source record");
      records.push(dedupeRecord(sourceMatch.eventId, event.eventId, event.eventType === "REVIEW_RECORDED" ? "SAME_REVIEW_PRODUCT_RECORD" : "SAME_PRODUCT_SOURCE_RECORD")); continue;
    }
    byId.set(event.eventId, event); byKey.set(event.idempotencyKey, event); bySource.set(sourceKey, event); accepted.push(event);
  }
  return { events: accepted, records };
}

const EvidenceDirectionSchema = schema.enum(["POSITIVE", "NEGATIVE", "NOT_APPLICABLE"] as const);
const EvidenceItemSchema = schema.object({
  eventId: identifier, eventHash: sha256, eventType: identifier, occurredAt: timestamp,
  semanticClass: schema.enum(["EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "DECISION", "EXPERIENCE", "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION", "UNKNOWN"] as const),
  slot: schema.enum(["EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "DECISION", "EXPERIENCE", "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION"] as const),
  direction: EvidenceDirectionSchema, active: schema.boolean(),
  spotId: schema.optional(identifier), decisionId: schema.optional(identifier), candidateId: schema.optional(identifier),
  worldBindingHash: schema.optional(sha256), contextBindingHash: schema.optional(sha256),
});
export type EvidenceItem = Infer<typeof EvidenceItemSchema>;
const slotArray = () => schema.array(EvidenceItemSchema, { max: 512 });
const EvidenceSlotsSchema = schema.object({ exposure: slotArray(), interaction: slotArray(), search: slotArray(), intent: slotArray(), decision: slotArray(), experience: slotArray(), satisfaction: slotArray(), stateChange: slotArray(), correction: slotArray(), socialObservation: slotArray() });

const CorrectionHistorySchema = schema.object({ correctionEventId: identifier, correctionEventHash: sha256, targetEventId: identifier, targetEventHash: sha256, resolutionRecordHash: sha256, applied: schema.literal(true) });
const ReliabilitySchema = schema.object({ eventId: identifier, state: schema.enum(["UNTRUSTED_OBSERVATION", "AUTHENTICATED", "SERVER_VERIFIED", "UNKNOWN"] as const) });
export const EvidenceChainV2Schema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.evidenceChainV2), chainId: identifier,
  subject: schema.object({ subjectBindingHash: sha256, boundBy: schema.literal("SERVER"), userIdIncluded: schema.literal(false) }),
  journey: JourneyResolutionSchema,
  eventHashes: schema.array(schema.object({ eventId: identifier, eventHash: sha256 }), { min: 1, max: 512 }),
  references: schema.object({ spotIds: schema.array(identifier, { max: 32 }), decisionIds: schema.array(identifier, { max: 32 }), candidateIds: schema.array(identifier, { max: 64 }) }),
  slots: EvidenceSlotsSchema,
  worldEvidence: schema.array(schema.object({ eventId: identifier, bindingId: identifier, bindingHash: sha256 }), { max: 512 }),
  contextEvidence: schema.array(schema.object({ eventId: identifier, bindingId: identifier, bindingHash: sha256, source: schema.enum(["USER_EXPLICIT", "SERVER_AUTHORIZED", "CAUTIOUSLY_INFERRED", "UNKNOWN", "NOT_CONFIGURED"] as const) }), { max: 512 }),
  sourceReliability: schema.array(ReliabilitySchema, { max: 512 }),
  independence: schema.object({ state: schema.enum(["ELIGIBLE_SERVER_RESOLVED", "NOT_ELIGIBLE_UNRESOLVED"] as const), independentExperienceUnits: schema.number({ min: 0, max: 1, integer: true }), reasonCodes: schema.array(identifier, { min: 1, max: 16 }) }),
  uncertainty: schema.object({ state: schema.enum(["BOUNDED", "MATERIAL", "UNKNOWN"] as const), reasonCodes: schema.array(identifier, { min: 1, max: 32 }) }),
  limitations: schema.array(identifier, { min: 1, max: 64 }), corrections: schema.array(CorrectionHistorySchema, { max: 128 }),
  processingAuthorization: schema.object({ purpose: schema.literal("PERSONALIZED_RECOMMENDATIONS"), consentState: schema.literal("GRANTED"), consentVersion: identifier }),
  lifecycle: schema.object({ state: schema.literal("ACTIVE"), retentionClass: identifier, retentionDurationDefined: schema.literal(false) }),
  builderPolicyVersion: identifier, chainHash: sha256,
});
export type EvidenceChainV2 = Infer<typeof EvidenceChainV2Schema>;

export const EvidenceChainBuildInputSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.evidenceBuilderInput), builderPolicyVersion: identifier,
  subject: schema.object({ boundUserId: identifier, subjectBindingHash: sha256, authority: schema.literal("SERVER_AUTHENTICATION"), userIdExternallyExposed: schema.literal(false) }),
  consent: ConsentEnvelopeSchema, events: schema.array(CanonicalUserEventSchema, { max: 1024 }),
  journeyResolutions: schema.array(JourneyResolutionSchema, { max: 1024 }), worldEvidence: schema.array(WorldEvidenceBindingSchema, { max: 1024 }),
  contextEvidence: schema.array(ContextEvidenceBindingSchema, { max: 1024 }), corrections: schema.array(CorrectionAuthorityRecordSchema, { max: 512 }),
  lifecycleState: schema.enum(["ACTIVE", "WITHDRAWN", "ERASED"] as const),
});
export type EvidenceChainBuildInput = Infer<typeof EvidenceChainBuildInputSchema>;

export const EvidenceEngineStateSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.evidenceEngineState), status: schema.enum(["ACTIVE", "SUPPRESSED_NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"] as const),
  subjectBindingHash: schema.nullable(sha256), ledgerEventHashes: schema.array(sha256, { max: 1024 }), chains: schema.array(EvidenceChainV2Schema, { max: 1024 }),
  latestPointers: schema.array(schema.object({ journeyKey: identifier, chainId: identifier, chainHash: sha256 }), { max: 1024 }),
  caches: schema.array(sha256, { max: 1024 }), workItems: schema.array(identifier, { max: 1024 }), stateHash: sha256,
});
export type EvidenceEngineState = Infer<typeof EvidenceEngineStateSchema>;
export interface EvidenceBuildResult { readonly state: EvidenceEngineState; readonly acceptedEvents: readonly CanonicalUserEvent[]; readonly deduplication: readonly DeduplicationRecord[]; readonly input: EvidenceChainBuildInput; }

function parseEngineState(value: unknown): EvidenceEngineState {
  const parsed = EvidenceEngineStateSchema.parse(value);
  if (parsed.status !== "ACTIVE" && (parsed.subjectBindingHash !== null || parsed.ledgerEventHashes.length || parsed.chains.length || parsed.latestPointers.length || parsed.caches.length || parsed.workItems.length)) throw new ContractValidationError("$.status", "suppressed or erased evidence state must contain no personal data");
  if (contentHash(without(parsed as unknown as Record<string, unknown>, ["stateHash"])) !== parsed.stateHash) throw new ContractValidationError("$.stateHash", "evidence engine state hash mismatch");
  return parsed;
}
export const parseEvidenceEngineState = parseEngineState;

export function emptyEvidenceEngineState(status: "SUPPRESSED_NO_CONSENT" | "WITHDRAWN" | "RESET" | "ERASED"): EvidenceEngineState {
  const body = { contractVersion: CONTRACT_VERSIONS.evidenceEngineState, status, subjectBindingHash: null, ledgerEventHashes: [], chains: [], latestPointers: [], caches: [], workItems: [] } as const;
  return parseEngineState({ ...body, stateHash: contentHash(body) });
}

function directionOf(event: CanonicalUserEvent): EvidenceItem["direction"] {
  if (event.eventType === "SATISFACTION_RECORDED" && event.payload.kind === "SATISFACTION") return event.payload.direction;
  return "NOT_APPLICABLE";
}
function slotKey(slot: EvidenceSlot): keyof EvidenceChainV2["slots"] { return ({ EXPOSURE: "exposure", INTERACTION: "interaction", SEARCH: "search", INTENT: "intent", DECISION: "decision", EXPERIENCE: "experience", SATISFACTION: "satisfaction", STATE_CHANGE: "stateChange", CORRECTION: "correction", SOCIAL_OBSERVATION: "socialObservation" } as const)[slot]; }
function uniqueSorted(values: readonly (string | undefined)[]): string[] { return [...new Set(values.filter((value): value is string => value !== undefined))].sort(); }

function validateCorrections(events: readonly CanonicalUserEvent[], records: readonly CorrectionAuthorityRecord[]): ReadonlySet<string> {
  const eventMap = new Map(events.map((event) => [event.eventId, event])); const recordMap = new Map(records.map((record) => [record.correctionEventId, parseCorrectionAuthorityRecord(record)]));
  const inactive = new Set<string>(); const edges = new Map<string, string>();
  for (const correction of events.filter((event) => event.eventType === "USER_CORRECTION")) {
    const targetId = correction.supersedesEventId!; const target = eventMap.get(targetId); const authority = recordMap.get(correction.eventId);
    if (!target) throw new ContractValidationError("$.corrections", "correction target is absent from the canonical ledger");
    if (!authority || authority.targetEventId !== targetId || authority.correctionEventId !== correction.eventId) throw new ContractValidationError("$.corrections", "correction lacks its server ledger authority record");
    if (target.userId !== correction.userId || authority.boundUserId !== correction.userId || authority.targetUserId !== target.userId) throw new ContractValidationError("$.corrections", "cross-user correction is forbidden");
    const targetSpot = target.references.spotId ?? null;
    if (authority.targetSpotId !== targetSpot || (authority.correctionSpotId !== null && authority.correctionSpotId !== targetSpot)) throw new ContractValidationError("$.corrections", "cross-spot correction is forbidden");
    if (authority.targetOccurredAt !== target.occurredAt || Date.parse(correction.occurredAt) <= Date.parse(target.occurredAt)) throw new ContractValidationError("$.corrections", "correction must occur after its target event");
    edges.set(correction.eventId, targetId); inactive.add(targetId);
  }
  for (const start of edges.keys()) { const seen = new Set<string>(); let cursor: string | undefined = start; while (cursor && edges.has(cursor)) { if (seen.has(cursor)) throw new ContractValidationError("$.corrections", "cyclic supersedes chain"); seen.add(cursor); cursor = edges.get(cursor); } }
  return inactive;
}

function validateBindings(events: readonly CanonicalUserEvent[], world: readonly WorldEvidenceBinding[], context: readonly ContextEvidenceBinding[]): void {
  const eventMap = new Map(events.map((event) => [event.eventId, event]));
  for (const binding of world) { const parsed = parseWorldEvidenceBinding(binding); const event = eventMap.get(parsed.eventId); if (!event || event.eventHash !== parsed.eventHash || event.references.spotId !== parsed.spotId) throw new ContractValidationError("$.worldEvidence", "world binding does not match its canonical event"); if (Date.parse(parsed.evidenceAt) > Date.parse(event.occurredAt)) throw new ContractValidationError("$.worldEvidence.evidenceAt", "world evidence is newer than the event"); }
  for (const binding of context) { const parsed = parseContextEvidenceBinding(binding); const event = eventMap.get(parsed.eventId); if (!event || event.eventHash !== parsed.eventHash) throw new ContractValidationError("$.contextEvidence", "context binding does not match its canonical event"); if (Date.parse(parsed.evidenceAt) > Date.parse(event.occurredAt)) throw new ContractValidationError("$.contextEvidence.evidenceAt", "context evidence is newer than the event"); }
}

function chainFor(group: readonly CanonicalUserEvent[], resolution: JourneyResolution, input: EvidenceChainBuildInput, inactive: ReadonlySet<string>, worldMap: ReadonlyMap<string, WorldEvidenceBinding>, contextMap: ReadonlyMap<string, ContextEvidenceBinding>, correctionMap: ReadonlyMap<string, CorrectionAuthorityRecord>): EvidenceChainV2 {
  const sorted = [...group].sort(byEvent); const slots: Record<keyof EvidenceChainV2["slots"], EvidenceItem[]> = { exposure: [], interaction: [], search: [], intent: [], decision: [], experience: [], satisfaction: [], stateChange: [], correction: [], socialObservation: [] };
  const reliability: Array<{ eventId: string; state: "UNTRUSTED_OBSERVATION" | "AUTHENTICATED" | "SERVER_VERIFIED" | "UNKNOWN" }> = [];
  for (const event of sorted) {
    const catalog = assertConfiguredEventSemantics(event); const slot = catalog.evidenceSlots[0];
    if (!slot) throw new ContractValidationError("$.eventType", "configured event must declare an evidence slot");
    const world = worldMap.get(event.eventId); const context = contextMap.get(event.eventId);
    const item: EvidenceItem = { eventId: event.eventId, eventHash: event.eventHash, eventType: event.eventType, occurredAt: event.occurredAt, semanticClass: catalog.semanticClass, slot, direction: directionOf(event), active: !inactive.has(event.eventId), ...(event.references.spotId ? { spotId: event.references.spotId } : {}), ...(event.references.decisionId ? { decisionId: event.references.decisionId } : {}), ...(event.references.candidateId ? { candidateId: event.references.candidateId } : {}), ...(world ? { worldBindingHash: world.bindingHash } : {}), ...(context ? { contextBindingHash: context.bindingHash } : {}) };
    slots[slotKey(slot)].push(item);
    reliability.push({ eventId: event.eventId, state: event.authority.sourceTrust === "PRIVILEGED_LIFECYCLE" ? "UNKNOWN" : event.authority.sourceTrust });
  }
  const experience = sorted.some((event) => !inactive.has(event.eventId) && (event.eventType === "VERIFIED_VISIT" || event.eventType === "REVIEW_RECORDED"));
  const eligible = resolution.independenceEligible && resolution.journeyId !== null;
  const corrections = sorted.filter((event) => event.eventType === "USER_CORRECTION").map((event) => { const target = sorted.find((candidate) => candidate.eventId === event.supersedesEventId) ?? group.find((candidate) => candidate.eventId === event.supersedesEventId); const authority = correctionMap.get(event.eventId); if (!target || !authority) throw new ContractValidationError("$.corrections", "correction target cannot be materialized in chain"); return { correctionEventId: event.eventId, correctionEventHash: event.eventHash, targetEventId: target.eventId, targetEventHash: target.eventHash, resolutionRecordHash: authority.resolutionRecordHash, applied: true as const }; });
  const uncertaintyReasons = uniqueSorted([
    ...sorted.filter((event) => event.eventType === "VERIFIED_VISIT" || event.eventType === "REVIEW_RECORDED").map(() => "EXPERIENCE_HAS_NO_IMPLICIT_SATISFACTION"),
    ...(!eligible ? ["JOURNEY_NOT_INDEPENDENCE_ELIGIBLE"] : []),
    ...sorted.filter((event) => !worldMap.has(event.eventId) && event.references.spotId).map(() => "EVENT_TIME_WORLD_EVIDENCE_MISSING"),
    ...sorted.filter((event) => (worldMap.get(event.eventId)?.conflicts.length ?? 0) > 0).map(() => "WORLD_EVIDENCE_CONFLICT"),
    ...sorted.filter((event) => (worldMap.get(event.eventId)?.unknowns.length ?? 0) > 0).map(() => "WORLD_EVIDENCE_UNKNOWNS"),
    ...sorted.filter((event) => !contextMap.has(event.eventId)).map(() => "CONTEXT_EVIDENCE_MISSING"),
  ]);
  const journeyKey = resolution.journeyId ?? `unresolved-${resolution.eventId}`;
  const body = {
    contractVersion: CONTRACT_VERSIONS.evidenceChainV2, chainId: `chain-${contentHash({ subject: input.subject.subjectBindingHash, journeyKey, builder: input.builderPolicyVersion })}`,
    subject: { subjectBindingHash: input.subject.subjectBindingHash, boundBy: "SERVER" as const, userIdIncluded: false as const }, journey: resolution,
    eventHashes: sorted.map((event) => ({ eventId: event.eventId, eventHash: event.eventHash })),
    references: { spotIds: uniqueSorted(sorted.map((event) => event.references.spotId)), decisionIds: uniqueSorted(sorted.map((event) => event.references.decisionId)), candidateIds: uniqueSorted(sorted.map((event) => event.references.candidateId)) },
    slots, worldEvidence: sorted.flatMap((event) => { const binding = worldMap.get(event.eventId); return binding ? [{ eventId: event.eventId, bindingId: binding.bindingId, bindingHash: binding.bindingHash }] : []; }),
    contextEvidence: sorted.flatMap((event) => { const binding = contextMap.get(event.eventId); return binding ? [{ eventId: event.eventId, bindingId: binding.bindingId, bindingHash: binding.bindingHash, source: binding.source }] : []; }),
    sourceReliability: reliability, independence: { state: eligible ? "ELIGIBLE_SERVER_RESOLVED" as const : "NOT_ELIGIBLE_UNRESOLVED" as const, independentExperienceUnits: eligible && experience ? 1 : 0, reasonCodes: [eligible ? "SERVER_RESOLVED_JOURNEY" : "UNRESOLVED_JOURNEY", "MAX_ONE_EXPERIENCE_UNIT_PER_JOURNEY"] },
    uncertainty: { state: uncertaintyReasons.length ? "MATERIAL" as const : "BOUNDED" as const, reasonCodes: uncertaintyReasons.length ? uncertaintyReasons : ["NO_MATERIAL_UNCERTAINTY_RECORDED"] },
    limitations: uniqueSorted(["NO_TASTE_SCORE", "NO_ATTRIBUTION", "NO_EVENT_WEIGHT", "NO_TEMPORAL_DECAY", "NO_RANKING_AUTHORITY", "CURRENT_CONTEXT_NOT_LONG_TERM_TASTE", "WORLD_CONCEPTS_NOT_INDEPENDENT_EXPERIENCES", ...sorted.flatMap((event) => CANONICAL_EVENT_CATALOG[event.eventType].forbiddenInterpretations)]), corrections,
    processingAuthorization: { purpose: "PERSONALIZED_RECOMMENDATIONS" as const, consentState: "GRANTED" as const, consentVersion: input.consent.consentVersion },
    lifecycle: { state: "ACTIVE" as const, retentionClass: "UNRESOLVED_PRIVACY_POLICY", retentionDurationDefined: false as const }, builderPolicyVersion: input.builderPolicyVersion,
  };
  return EvidenceChainV2Schema.parse({ ...body, chainHash: contentHash(body) });
}

export interface EvidenceVerificationContext { readonly events: readonly CanonicalUserEvent[]; readonly journeyResolutions: readonly JourneyResolution[]; readonly worldEvidence: readonly WorldEvidenceBinding[]; readonly contextEvidence: readonly ContextEvidenceBinding[]; readonly corrections: readonly CorrectionAuthorityRecord[]; }
export function verifyEvidenceChainV2(value: unknown, context: EvidenceVerificationContext): EvidenceChainV2 {
  const chain = EvidenceChainV2Schema.parse(value);
  if (contentHash(without(chain as unknown as Record<string, unknown>, ["chainHash"])) !== chain.chainHash) throw new ContractValidationError("$.chainHash", "evidence chain hash mismatch");
  parseJourneyResolution(chain.journey);
  const ledger = new Map(context.events.map((event) => [event.eventId, parseCanonicalUserEvent(event)]));
  const allItems = Object.values(chain.slots).flat();
  if (allItems.length !== chain.eventHashes.length) throw new ContractValidationError("$.slots", "every canonical event must appear in exactly one evidence slot");
  const expectedEventHashes = allItems.map((item) => ({ eventId: item.eventId, eventHash: item.eventHash })).sort((left, right) => left.eventId.localeCompare(right.eventId));
  if (canonicalComparable([...chain.eventHashes].sort((left, right) => left.eventId.localeCompare(right.eventId))) !== canonicalComparable(expectedEventHashes)) throw new ContractValidationError("$.eventHashes", "event hash index differs from evidence slots");
  for (const item of allItems) {
    const event = ledger.get(item.eventId); if (!event || event.eventHash !== item.eventHash) throw new ContractValidationError("$.slots", "evidence item is not traceable to the canonical ledger");
    const catalog = assertConfiguredEventSemantics(event); const expectedSlot = catalog.evidenceSlots[0];
    if (item.eventType !== event.eventType || item.semanticClass !== catalog.semanticClass || item.slot !== expectedSlot || item.direction !== directionOf(event)) throw new ContractValidationError("$.slots", "inner evidence semantics do not match the canonical event catalog");
    if (item.spotId !== event.references.spotId || item.decisionId !== event.references.decisionId || item.candidateId !== event.references.candidateId) throw new ContractValidationError("$.slots", "inner evidence references do not match the canonical ledger");
  }
  const expectedWorld = new Map(context.worldEvidence.map((binding) => [binding.eventId, parseWorldEvidenceBinding(binding)]));
  const expectedContext = new Map(context.contextEvidence.map((binding) => [binding.eventId, parseContextEvidenceBinding(binding)]));
  for (const item of allItems) { if (item.worldBindingHash !== expectedWorld.get(item.eventId)?.bindingHash && (item.worldBindingHash !== undefined || expectedWorld.has(item.eventId))) throw new ContractValidationError("$.worldEvidence", "inner world binding differs from authoritative evidence"); if (item.contextBindingHash !== expectedContext.get(item.eventId)?.bindingHash && (item.contextBindingHash !== undefined || expectedContext.has(item.eventId))) throw new ContractValidationError("$.contextEvidence", "inner context binding differs from authoritative evidence"); }
  const inactive = validateCorrections([...ledger.values()], context.corrections);
  for (const item of allItems) if (item.active === inactive.has(item.eventId)) throw new ContractValidationError("$.slots.active", "correction activity state differs from the canonical ledger");
  const authoritativeResolutions = new Map(context.journeyResolutions.map((resolution) => [resolution.eventId, parseJourneyResolution(resolution)]));
  const chainResolution = authoritativeResolutions.get(chain.journey.eventId);
  if (!chainResolution || canonicalComparable(chainResolution) !== canonicalComparable(chain.journey)) throw new ContractValidationError("$.journey", "chain journey differs from the authoritative resolver output");
  const chainEvents = allItems.map((item) => ledger.get(item.eventId)!);
  const expectedReferences = { spotIds: uniqueSorted(chainEvents.map((event) => event.references.spotId)), decisionIds: uniqueSorted(chainEvents.map((event) => event.references.decisionId)), candidateIds: uniqueSorted(chainEvents.map((event) => event.references.candidateId)) };
  if (canonicalComparable(chain.references) !== canonicalComparable(expectedReferences)) throw new ContractValidationError("$.references", "chain reference index differs from the canonical ledger");
  const expectedReliability = chainEvents.sort(byEvent).map((event) => ({ eventId: event.eventId, state: event.authority.sourceTrust === "PRIVILEGED_LIFECYCLE" ? "UNKNOWN" : event.authority.sourceTrust }));
  if (canonicalComparable(chain.sourceReliability) !== canonicalComparable(expectedReliability)) throw new ContractValidationError("$.sourceReliability", "source reliability differs from event authority");
  const expectedWorldIndex = chainEvents.sort(byEvent).flatMap((event) => { const binding = expectedWorld.get(event.eventId); return binding ? [{ eventId: event.eventId, bindingId: binding.bindingId, bindingHash: binding.bindingHash }] : []; });
  const expectedContextIndex = chainEvents.sort(byEvent).flatMap((event) => { const binding = expectedContext.get(event.eventId); return binding ? [{ eventId: event.eventId, bindingId: binding.bindingId, bindingHash: binding.bindingHash, source: binding.source }] : []; });
  if (canonicalComparable(chain.worldEvidence) !== canonicalComparable(expectedWorldIndex) || canonicalComparable(chain.contextEvidence) !== canonicalComparable(expectedContextIndex)) throw new ContractValidationError("$.worldEvidence", "chain evidence indexes differ from authoritative bindings");
  const expectedLimitations = uniqueSorted(["NO_TASTE_SCORE", "NO_ATTRIBUTION", "NO_EVENT_WEIGHT", "NO_TEMPORAL_DECAY", "NO_RANKING_AUTHORITY", "CURRENT_CONTEXT_NOT_LONG_TERM_TASTE", "WORLD_CONCEPTS_NOT_INDEPENDENT_EXPERIENCES", ...chainEvents.flatMap((event) => CANONICAL_EVENT_CATALOG[event.eventType].forbiddenInterpretations)]);
  if (canonicalComparable(chain.limitations) !== canonicalComparable(expectedLimitations)) throw new ContractValidationError("$.limitations", "chain limitations differ from canonical semantics");
  const expectedChainId = `chain-${contentHash({ subject: chain.subject.subjectBindingHash, journeyKey: chain.journey.journeyId ?? `unresolved-${chain.journey.eventId}`, builder: chain.builderPolicyVersion })}`;
  if (chain.chainId !== expectedChainId) throw new ContractValidationError("$.chainId", "chain identity does not match subject, journey and builder policy");
  const experience = chainEvents.some((event) => !inactive.has(event.eventId) && (event.eventType === "VERIFIED_VISIT" || event.eventType === "REVIEW_RECORDED"));
  const eligible = chain.journey.independenceEligible && chain.journey.journeyId !== null;
  const expectedIndependence = { state: eligible ? "ELIGIBLE_SERVER_RESOLVED" : "NOT_ELIGIBLE_UNRESOLVED", independentExperienceUnits: eligible && experience ? 1 : 0, reasonCodes: [eligible ? "SERVER_RESOLVED_JOURNEY" : "UNRESOLVED_JOURNEY", "MAX_ONE_EXPERIENCE_UNIT_PER_JOURNEY"] };
  if (canonicalComparable(chain.independence) !== canonicalComparable(expectedIndependence)) throw new ContractValidationError("$.independence", "independence was not derived from the authoritative journey and active experience");
  const correctionMap = new Map(context.corrections.map((record) => [record.correctionEventId, parseCorrectionAuthorityRecord(record)]));
  const expectedCorrections = chainEvents.filter((event) => event.eventType === "USER_CORRECTION").map((event) => { const target = ledger.get(event.supersedesEventId!); const authority = correctionMap.get(event.eventId); if (!target || !authority) throw new ContractValidationError("$.corrections", "correction history lacks ledger authority"); return { correctionEventId: event.eventId, correctionEventHash: event.eventHash, targetEventId: target.eventId, targetEventHash: target.eventHash, resolutionRecordHash: authority.resolutionRecordHash, applied: true }; });
  if (canonicalComparable(chain.corrections) !== canonicalComparable(expectedCorrections)) throw new ContractValidationError("$.corrections", "correction history differs from the authoritative ledger");
  const expectedUncertaintyReasons = uniqueSorted([
    ...chainEvents.filter((event) => event.eventType === "VERIFIED_VISIT" || event.eventType === "REVIEW_RECORDED").map(() => "EXPERIENCE_HAS_NO_IMPLICIT_SATISFACTION"),
    ...(!eligible ? ["JOURNEY_NOT_INDEPENDENCE_ELIGIBLE"] : []),
    ...chainEvents.filter((event) => !expectedWorld.has(event.eventId) && event.references.spotId).map(() => "EVENT_TIME_WORLD_EVIDENCE_MISSING"),
    ...chainEvents.filter((event) => (expectedWorld.get(event.eventId)?.conflicts.length ?? 0) > 0).map(() => "WORLD_EVIDENCE_CONFLICT"),
    ...chainEvents.filter((event) => (expectedWorld.get(event.eventId)?.unknowns.length ?? 0) > 0).map(() => "WORLD_EVIDENCE_UNKNOWNS"),
    ...chainEvents.filter((event) => !expectedContext.has(event.eventId)).map(() => "CONTEXT_EVIDENCE_MISSING"),
  ]);
  const expectedUncertainty = { state: expectedUncertaintyReasons.length ? "MATERIAL" : "BOUNDED", reasonCodes: expectedUncertaintyReasons.length ? expectedUncertaintyReasons : ["NO_MATERIAL_UNCERTAINTY_RECORDED"] };
  if (canonicalComparable(chain.uncertainty) !== canonicalComparable(expectedUncertainty)) throw new ContractValidationError("$.uncertainty", "uncertainty differs from authoritative missing/conflicting evidence");
  return chain;
}

function canonicalComparable(value: unknown): string { return canonicalJson(value); }

export function buildEvidenceChains(value: unknown): EvidenceBuildResult {
  const input = EvidenceChainBuildInputSchema.parse(value); parseConsentEnvelope(input.consent);
  const status = input.lifecycleState === "ERASED" ? "ERASED" : input.lifecycleState === "WITHDRAWN" ? "WITHDRAWN" : input.consent.state !== "GRANTED" || !input.consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE") ? "SUPPRESSED_NO_CONSENT" : null;
  if (status) return { state: emptyEvidenceEngineState(status), acceptedEvents: [], deduplication: [], input };
  const deduped = deduplicateCanonicalEvents(input.events, input.subject.boundUserId); const events = deduped.events;
  for (const event of events) assertConfiguredEventSemantics(event);
  const resolutions = new Map<string, JourneyResolution>();
  for (const raw of input.journeyResolutions) { const resolution = parseJourneyResolution(raw); if (resolution.subjectBindingHash !== input.subject.subjectBindingHash || resolutions.has(resolution.eventId)) throw new ContractValidationError("$.journeyResolutions", "foreign or duplicate journey resolution"); resolutions.set(resolution.eventId, resolution); }
  for (const event of events) { const resolution = resolutions.get(event.eventId); if (!resolution) throw new ContractValidationError("$.journeyResolutions", "every event requires a journey resolution result"); if (event.journey.resolution === "SERVER_RESOLVED" && (resolution.journeyId !== event.journey.journeyId || !resolution.independenceEligible)) throw new ContractValidationError("$.journeyResolutions", "resolver output conflicts with server-bound event journey"); if (event.journey.resolution === "UNRESOLVED" && resolution.journeyId !== null) throw new ContractValidationError("$.journeyResolutions", "resolver invented a journey for an unresolved event"); }
  const worlds = input.worldEvidence.map(parseWorldEvidenceBinding); const contexts = input.contextEvidence.map(parseContextEvidenceBinding); const correctionRecords = input.corrections.map(parseCorrectionAuthorityRecord);
  validateBindings(events, worlds, contexts); const inactive = validateCorrections(events, correctionRecords);
  const worldMap = new Map(worlds.map((row) => [row.eventId, row])); const contextMap = new Map(contexts.map((row) => [row.eventId, row])); const correctionMap = new Map(correctionRecords.map((row) => [row.correctionEventId, row]));
  const groupMap = new Map<string, CanonicalUserEvent[]>();
  for (const event of events) { let resolution = resolutions.get(event.eventId)!; if (event.eventType === "USER_CORRECTION" && event.supersedesEventId) resolution = resolutions.get(event.supersedesEventId) ?? resolution; const key = resolution.journeyId ?? `unresolved-${event.eventId}`; const group = groupMap.get(key) ?? []; group.push(event); groupMap.set(key, group); }
  const chains = [...groupMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => { const first = group.find((event) => event.eventType !== "USER_CORRECTION") ?? group[0]!; const resolution = resolutions.get(first.eventId)!; return chainFor(group, resolution, input, inactive, worldMap, contextMap, correctionMap); });
  for (const chain of chains) verifyEvidenceChainV2(chain, { events, journeyResolutions: [...resolutions.values()], worldEvidence: worlds, contextEvidence: contexts, corrections: correctionRecords });
  const body = { contractVersion: CONTRACT_VERSIONS.evidenceEngineState, status: "ACTIVE" as const, subjectBindingHash: input.subject.subjectBindingHash, ledgerEventHashes: events.map((event) => event.eventHash).sort(), chains, latestPointers: chains.map((chain) => ({ journeyKey: chain.journey.journeyId ?? `unresolved-${chain.journey.eventId}`, chainId: chain.chainId, chainHash: chain.chainHash })).sort((left, right) => left.journeyKey.localeCompare(right.journeyKey)), caches: [], workItems: [] };
  return { state: parseEngineState({ ...body, stateHash: contentHash(body) }), acceptedEvents: events, deduplication: deduped.records, input };
}

export function updateEvidenceChains(previous: EvidenceBuildResult, delta: unknown): EvidenceBuildResult {
  const next = EvidenceChainBuildInputSchema.parse(delta);
  if (previous.input.subject.subjectBindingHash !== next.subject.subjectBindingHash || previous.input.subject.boundUserId !== next.subject.boundUserId || previous.input.builderPolicyVersion !== next.builderPolicyVersion) throw new ContractValidationError("$.subject", "incremental update cannot change subject or builder policy");
  return buildEvidenceChains({ ...next, events: [...previous.acceptedEvents, ...next.events], journeyResolutions: [...previous.input.journeyResolutions, ...next.journeyResolutions], worldEvidence: [...previous.input.worldEvidence, ...next.worldEvidence], contextEvidence: [...previous.input.contextEvidence, ...next.contextEvidence], corrections: [...previous.input.corrections, ...next.corrections] });
}
