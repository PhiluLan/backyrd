import { contentHash } from "./canonical.js";
import {
  CONTRACT_VERSIONS,
  ConsentEnvelope,
  DirectSpotAffinity,
  RelevantUserProjection,
  RelevantUserProjectionRequest,
  RelevantUserProjectionRequestSchema,
  UserIntelligenceSnapshot,
  parseConsentEnvelope,
  parseRelevantUserProjection,
  snapshotSemanticBody,
} from "./contracts.js";
import {
  DARK_RUNTIME_NO_WRITE_PROOF,
  DARK_RUNTIME_RELEASE,
  DARK_RUNTIME_RETENTION_DECISION_TEMPLATE,
} from "./dark-runtime.js";
import { USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH } from "./lifecycle.js";
import { buildRelevantUserProjection } from "./projection.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";
import {
  PRODUCT_INTERPRETATION_POLICY_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C,
} from "./product-policy.js";

const without = (value: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const equal = (a: unknown, b: unknown): boolean => contentHash(a) === contentHash(b);
const sortedUnique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort();

/** Production-facing runtime defaults. Local synthetic evaluation is a separate, non-production capability. */
export const DARK_PROJECTION_RUNTIME_FLAGS = Object.freeze({
  USER_LEARNING_RUNTIME: false,
  eventIngestionEnabled: false,
  projectionRuntimeActivated: false,
  persistentWritesAuthorized: false,
  networkCallsAuthorized: false,
  rankingAuthorized: false,
  eligibilityAuthorized: false,
  shadowTrafficAuthorized: false,
  killSwitch: "FORCED_OFF" as const,
});

export type DarkProjectionRuntimeMode = "OFF" | "LOCAL_SYNTHETIC_TEST";

/** Missing, malformed and unknown configuration always resolves to OFF. */
export function resolveDarkProjectionRuntimeMode(value: unknown): DarkProjectionRuntimeMode {
  return value === "LOCAL_SYNTHETIC_TEST" ? "LOCAL_SYNTHETIC_TEST" : "OFF";
}

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeRelease,
  releaseId: "backyrd-user-intelligence-dark-projection-runtime-week2-1",
  issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const,
  validFrom: "2026-09-16T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z",
  week1ReleaseHash: DARK_RUNTIME_RELEASE.releaseHash,
  week1NoWriteProofHash: DARK_RUNTIME_NO_WRITE_PROOF.proofHash,
  lifecycleManifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
  productPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash,
  signalRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash,
  flags: DARK_PROJECTION_RUNTIME_FLAGS,
  localSyntheticHarnessAvailable: true as const,
  productionAuthorized: false as const,
  limitations: [
    "LOCAL_SYNTHETIC_EVENTS_ONLY",
    "NO_PRODUCT_EVENT_ADAPTER",
    "NO_DATABASE_OR_NETWORK_ADAPTER",
    "NO_LEARNING_OR_TASTE_REDUCER",
    "RETENTION_DURATIONS_NOT_CONFIGURED",
  ] as const,
});
export const DARK_PROJECTION_RUNTIME_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });

const anchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeTrustAnchor,
  anchorId: "backyrd-user-intelligence-dark-projection-runtime-anchor-week2-1",
  acceptedReleaseId: DARK_PROJECTION_RUNTIME_RELEASE.releaseId,
  acceptedReleaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash,
  issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const,
  environment: "LOCAL_SYNTHETIC_DARK_RUNTIME" as const,
  validFrom: DARK_PROJECTION_RUNTIME_RELEASE.validFrom,
  validUntil: DARK_PROJECTION_RUNTIME_RELEASE.validUntil,
  productionAuthorized: false as const,
});
export const DARK_PROJECTION_RUNTIME_TRUST_ANCHOR = Object.freeze({ ...anchorBody, anchorHash: contentHash(anchorBody) });

export type DarkProjectionLifecycle = "ACTIVE" | "NO_CONSENT" | "CONSENT_WITHDRAWN" | "FULL_RESET" | "ACCOUNT_ERASURE";
export type DarkProjectionAction = "LOCAL_INGEST" | "LOCAL_PROJECT" | "LOCAL_REBUILD" | "LEGAL_EXPORT";

export const DarkProjectionAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkProjectionRuntimeAuthority),
  authorityRecordId: identifier,
  authorityKind: schema.enum(["SERVER_USER_INTELLIGENCE_ORCHESTRATOR", "PRIVACY_LEGAL_PROCESS"] as const),
  boundUserId: identifier,
  subjectBindingHash: sha256,
  consentHash: sha256,
  lifecycle: schema.enum(["ACTIVE", "NO_CONSENT", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
  allowedActions: schema.array(schema.enum(["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD", "LEGAL_EXPORT"] as const), { min: 1, max: 4 }),
  acceptedReleaseHash: sha256,
  validFrom: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_DARK_PROJECTION_AUTHORITY_REGISTRY"),
  syntheticOnly: schema.literal(true),
  productionAuthorized: schema.literal(false),
  authorityHash: sha256,
});
export type DarkProjectionAuthority = Infer<typeof DarkProjectionAuthoritySchema>;

export interface DarkProjectionTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  getAuthorityRecord(id: string): unknown;
}

export function createSyntheticDarkProjectionAuthority(input: {
  readonly authorityRecordId: string;
  readonly authorityKind: DarkProjectionAuthority["authorityKind"];
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly consent: ConsentEnvelope;
  readonly lifecycle?: DarkProjectionLifecycle;
  readonly allowedActions: readonly DarkProjectionAction[];
}): DarkProjectionAuthority {
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeAuthority,
    authorityRecordId: input.authorityRecordId,
    authorityKind: input.authorityKind,
    boundUserId: input.userId,
    subjectBindingHash: input.subjectBindingHash,
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    lifecycle: input.lifecycle ?? "ACTIVE",
    allowedActions: sortedUnique(input.allowedActions),
    acceptedReleaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash,
    validFrom: DARK_PROJECTION_RUNTIME_RELEASE.validFrom,
    validUntil: DARK_PROJECTION_RUNTIME_RELEASE.validUntil,
    issuer: "BACKYRD_DARK_PROJECTION_AUTHORITY_REGISTRY" as const,
    syntheticOnly: true as const,
    productionAuthorized: false as const,
  };
  return DarkProjectionAuthoritySchema.parse({ ...body, authorityHash: contentHash(body) });
}

export function createDarkProjectionRepositoryTrust(records: readonly DarkProjectionAuthority[]): DarkProjectionTrustContext {
  const map = new Map(records.map((record) => [record.authorityRecordId, record]));
  if (map.size !== records.length) throw new ContractValidationError("$.authorityRecords", "duplicate authority record id");
  return {
    verifiedAt: "2026-09-16T12:00:00.000Z",
    getRelease: (id) => id === DARK_PROJECTION_RUNTIME_RELEASE.releaseId ? DARK_PROJECTION_RUNTIME_RELEASE : null,
    getTrustAnchor: (id) => id === DARK_PROJECTION_RUNTIME_TRUST_ANCHOR.anchorId ? DARK_PROJECTION_RUNTIME_TRUST_ANCHOR : null,
    getAuthorityRecord: (id) => map.get(id) ?? null,
  };
}

function verifyRelease(trust: DarkProjectionTrustContext): void {
  if (!equal(trust.getRelease(DARK_PROJECTION_RUNTIME_RELEASE.releaseId), DARK_PROJECTION_RUNTIME_RELEASE)
    || !equal(trust.getTrustAnchor(DARK_PROJECTION_RUNTIME_TRUST_ANCHOR.anchorId), DARK_PROJECTION_RUNTIME_TRUST_ANCHOR)) {
    throw new ContractValidationError("$.trust", "Week-2 release is not independently accepted");
  }
  if (Date.parse(trust.verifiedAt) < Date.parse(DARK_PROJECTION_RUNTIME_RELEASE.validFrom)
    || Date.parse(trust.verifiedAt) > Date.parse(DARK_PROJECTION_RUNTIME_RELEASE.validUntil)) {
    throw new ContractValidationError("$.trust.verifiedAt", "release is outside its validity interval");
  }
  if (DARK_PROJECTION_RUNTIME_FLAGS.USER_LEARNING_RUNTIME || DARK_PROJECTION_RUNTIME_FLAGS.killSwitch !== "FORCED_OFF") {
    throw new ContractValidationError("$.release.flags", "production runtime must remain forced off");
  }
}

export function verifyDarkProjectionAuthority(input: {
  readonly authorityRecordId: string;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly consent: ConsentEnvelope;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly action: DarkProjectionAction;
  readonly trust: DarkProjectionTrustContext;
}): DarkProjectionAuthority {
  verifyRelease(input.trust);
  const parsed = DarkProjectionAuthoritySchema.parse(input.trust.getAuthorityRecord(input.authorityRecordId));
  if (contentHash(without(parsed as unknown as Record<string, unknown>, "authorityHash")) !== parsed.authorityHash) throw new ContractValidationError("$.authorityHash", "authority hash mismatch");
  if (parsed.acceptedReleaseHash !== DARK_PROJECTION_RUNTIME_RELEASE.releaseHash
    || parsed.boundUserId !== input.userId
    || parsed.subjectBindingHash !== input.subjectBindingHash
    || parsed.consentHash !== contentHash(parseConsentEnvelope(input.consent))
    || parsed.lifecycle !== input.lifecycle) throw new ContractValidationError("$.authority", "authority binding mismatch");
  if (!parsed.allowedActions.includes(input.action)) throw new ContractValidationError("$.authority.allowedActions", "action is not authorized");
  if (Date.parse(input.trust.verifiedAt) < Date.parse(parsed.validFrom) || Date.parse(input.trust.verifiedAt) > Date.parse(parsed.validUntil)) throw new ContractValidationError("$.authority", "authority expired");
  const needsLegal = input.action === "LEGAL_EXPORT";
  if (needsLegal !== (parsed.authorityKind === "PRIVACY_LEGAL_PROCESS")) throw new ContractValidationError("$.authorityKind", "wrong authority domain");
  return parsed;
}

export const DarkProjectionEventSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkProjectionRuntimeEvent),
  eventId: identifier,
  idempotencyKey: identifier,
  userId: identifier,
  subjectBindingHash: sha256,
  eventType: schema.enum(["SEARCH", "QUICK_SKIP", "SAVED", "SAVE_REMOVED", "VISITED", "DWELL", "CORRECTION"] as const),
  journeyId: identifier,
  spotId: schema.optional(identifier),
  targetEventId: schema.optional(identifier),
  occurredAt: timestamp,
  observedAt: timestamp,
  ingestedAt: timestamp,
  authorityRecordId: identifier,
  authorityRecordHash: sha256,
  serverResolutionHash: sha256,
  minimizedContextHash: sha256,
  rawTextIncluded: schema.literal(false),
  preciseLocationIncluded: schema.literal(false),
  commercialDataIncluded: schema.literal(false),
  productionAuthorized: schema.literal(false),
  eventHash: sha256,
});
export type DarkProjectionEvent = Infer<typeof DarkProjectionEventSchema>;

export function withDarkProjectionEventHash(input: Omit<DarkProjectionEvent, "eventHash">): DarkProjectionEvent {
  return DarkProjectionEventSchema.parse({ ...input, eventHash: contentHash(input) });
}

function parseEvent(value: unknown, authority: DarkProjectionAuthority): DarkProjectionEvent {
  const event = DarkProjectionEventSchema.parse(value);
  if (event.userId !== authority.boundUserId || event.subjectBindingHash !== authority.subjectBindingHash
    || event.authorityRecordId !== authority.authorityRecordId || event.authorityRecordHash !== authority.authorityHash) throw new ContractValidationError("$.event.authority", "event authority binding mismatch");
  if (contentHash(without(event as unknown as Record<string, unknown>, "eventHash")) !== event.eventHash) throw new ContractValidationError("$.eventHash", "event hash mismatch");
  if (event.eventType === "CORRECTION" ? event.targetEventId === undefined : event.targetEventId !== undefined) throw new ContractValidationError("$.targetEventId", "correction target mismatch");
  if (["QUICK_SKIP", "SAVED", "SAVE_REMOVED", "VISITED", "DWELL"].includes(event.eventType) && event.spotId === undefined) throw new ContractValidationError("$.spotId", "spot-bound event requires a spot");
  if (Date.parse(event.observedAt) < Date.parse(event.occurredAt) || Date.parse(event.ingestedAt) < Date.parse(event.observedAt)) throw new ContractValidationError("$.temporal", "invalid event time order");
  return event;
}

const eventSemanticFingerprint = (event: DarkProjectionEvent): string => contentHash(without(without(without(event as unknown as Record<string, unknown>, "eventHash"), "eventId"), "ingestedAt"));

export interface DarkProjectionState {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkProjectionRuntimeState;
  readonly stateId: string;
  readonly userId: string | null;
  readonly subjectBindingHash: string | null;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly ledger: readonly DarkProjectionEvent[];
  readonly activeEventIds: readonly string[];
  readonly correctedEventIds: readonly string[];
  readonly checkpointHash: string;
  readonly persistentWrites: 0;
  readonly networkCalls: 0;
  readonly stateHash: string;
}

function makeState(input: { readonly userId: string | null; readonly subjectBindingHash: string | null; readonly lifecycle: DarkProjectionLifecycle; readonly ledger: readonly DarkProjectionEvent[] }): DarkProjectionState {
  const ledger = [...input.ledger].sort((a, b) => a.eventId.localeCompare(b.eventId));
  const corrections = ledger.filter((event) => event.eventType === "CORRECTION");
  const correctedEventIds = sortedUnique(corrections.map((event) => event.targetEventId!));
  const activeEventIds = ledger.filter((event) => event.eventType !== "CORRECTION" && !correctedEventIds.includes(event.eventId)).map((event) => event.eventId).sort();
  const checkpointHash = contentHash(ledger.map(({ eventId, eventHash }) => ({ eventId, eventHash })));
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeState,
    stateId: `dark-projection-state-${contentHash({ subject: input.subjectBindingHash, lifecycle: input.lifecycle, checkpointHash }).slice(0, 24)}`,
    userId: input.userId,
    subjectBindingHash: input.subjectBindingHash,
    lifecycle: input.lifecycle,
    ledger,
    activeEventIds,
    correctedEventIds,
    checkpointHash,
    persistentWrites: 0 as const,
    networkCalls: 0 as const,
  };
  return Object.freeze({ ...body, stateHash: contentHash(body) });
}

function reduce(input: { readonly previousLedger?: readonly DarkProjectionEvent[]; readonly delivered: readonly unknown[]; readonly authority: DarkProjectionAuthority }): DarkProjectionState {
  if (input.authority.lifecycle !== "ACTIVE") return makeState({ userId: null, subjectBindingHash: null, lifecycle: input.authority.lifecycle, ledger: [] });
  const delivered = [...(input.previousLedger ?? []), ...input.delivered.map((value) => parseEvent(value, input.authority))];
  const byId = new Map<string, DarkProjectionEvent>();
  const byIdempotency = new Map<string, string>();
  for (const event of delivered) {
    const priorById = byId.get(event.eventId);
    if (priorById) {
      if (priorById.eventHash !== event.eventHash) throw new ContractValidationError("$.eventId", "event id reused with different content");
      continue;
    }
    const fingerprint = eventSemanticFingerprint(event);
    const priorFingerprint = byIdempotency.get(event.idempotencyKey);
    if (priorFingerprint) {
      if (priorFingerprint !== fingerprint) throw new ContractValidationError("$.idempotencyKey", "idempotency key reused with different content");
      continue;
    }
    byId.set(event.eventId, event); byIdempotency.set(event.idempotencyKey, fingerprint);
  }
  const ledger = [...byId.values()];
  const targets = new Set<string>();
  for (const correction of ledger.filter((event) => event.eventType === "CORRECTION")) {
    const target = byId.get(correction.targetEventId!);
    if (!target || target.eventType === "CORRECTION") throw new ContractValidationError("$.targetEventId", "invalid correction target");
    if (targets.has(target.eventId)) throw new ContractValidationError("$.targetEventId", "multiple active corrections require explicit supersedes semantics");
    if (Date.parse(correction.occurredAt) < Date.parse(target.occurredAt)) throw new ContractValidationError("$.occurredAt", "correction precedes target");
    targets.add(target.eventId);
  }
  return makeState({ userId: input.authority.boundUserId, subjectBindingHash: input.authority.subjectBindingHash, lifecycle: "ACTIVE", ledger });
}

function buildDarkProjectionState(input: { readonly events: readonly unknown[]; readonly authority: DarkProjectionAuthority }): DarkProjectionState {
  return reduce({ delivered: input.events, authority: input.authority });
}

export function verifyDarkProjectionState(value: DarkProjectionState, authority?: DarkProjectionAuthority): DarkProjectionState {
  if (value.lifecycle === "ACTIVE") {
    if (!authority || value.userId !== authority.boundUserId || value.subjectBindingHash !== authority.subjectBindingHash) throw new ContractValidationError("$.state", "active state authority mismatch");
    for (const event of value.ledger) parseEvent(event, authority);
  } else if (value.userId !== null || value.subjectBindingHash !== null || value.ledger.length || value.activeEventIds.length || value.correctedEventIds.length) throw new ContractValidationError("$.state", "suppressed state contains personal data");
  const rebuilt = makeState({ userId: value.userId, subjectBindingHash: value.subjectBindingHash, lifecycle: value.lifecycle, ledger: value.ledger });
  if (!equal(rebuilt, value)) throw new ContractValidationError("$.state", "recursive state verification failed");
  return value;
}

function updateDarkProjectionState(input: { readonly previous: DarkProjectionState; readonly delta: readonly unknown[]; readonly authority: DarkProjectionAuthority }): DarkProjectionState {
  verifyDarkProjectionState(input.previous, input.authority);
  if (input.previous.lifecycle !== "ACTIVE") throw new ContractValidationError("$.previous", "suppressed state cannot be incrementally updated");
  return reduce({ previousLedger: input.previous.ledger, delivered: input.delta, authority: input.authority });
}

export function rebuildDarkProjectionState(input: { readonly authorityRecordId: string; readonly userId: string; readonly subjectBindingHash: string; readonly consent: ConsentEnvelope; readonly lifecycle: DarkProjectionLifecycle; readonly events: readonly unknown[]; readonly trust: DarkProjectionTrustContext }): DarkProjectionState {
  const authority = verifyDarkProjectionAuthority({ ...input, action: "LOCAL_REBUILD" });
  return buildDarkProjectionState({ events: input.events, authority });
}

export function incrementDarkProjectionState(input: { readonly authorityRecordId: string; readonly userId: string; readonly subjectBindingHash: string; readonly consent: ConsentEnvelope; readonly lifecycle: DarkProjectionLifecycle; readonly previous: DarkProjectionState; readonly delta: readonly unknown[]; readonly trust: DarkProjectionTrustContext }): DarkProjectionState {
  const authority = verifyDarkProjectionAuthority({ ...input, action: "LOCAL_REBUILD" });
  return updateDarkProjectionState({ previous: input.previous, delta: input.delta, authority });
}

export function verifyDarkProjectionParity(full: DarkProjectionState, incremental: DarkProjectionState, authority: DarkProjectionAuthority): true {
  verifyDarkProjectionState(full, authority); verifyDarkProjectionState(incremental, authority);
  if (!equal(full, incremental)) throw new ContractValidationError("$.parity", "full and incremental outputs differ");
  return true;
}

function activeEvents(state: DarkProjectionState): readonly DarkProjectionEvent[] {
  const ids = new Set(state.activeEventIds);
  return state.ledger.filter((event) => ids.has(event.eventId));
}

function directSpotItems(state: DarkProjectionState): readonly { relationshipId: string; spotId: string; state: string; confidence: number; reason: { code: "DIRECT_SPOT_RELATIONSHIP"; subjectRef: string; policyRef: string } }[] {
  const active = activeEvents(state);
  const spots = sortedUnique(active.flatMap((event) => event.spotId ? [event.spotId] : []));
  return spots.flatMap((spotId) => {
    const events = active.filter((event) => event.spotId === spotId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    const visits = new Set(events.filter((event) => event.eventType === "VISITED").map((event) => event.journeyId)).size;
    const saveEvents = events.filter((event) => event.eventType === "SAVED" || event.eventType === "SAVE_REMOVED");
    const saved = saveEvents.at(-1)?.eventType === "SAVED";
    const states = [...(saved ? ["PLANNING_STATE_SAVED"] : []), ...(visits >= 3 ? ["FAMILIARITY_THREE_INDEPENDENT_VISITS"] : [])];
    return states.map((relationshipState) => ({
      relationshipId: `dark-${contentHash({ spotId, relationshipState }).slice(0, 24)}`,
      spotId,
      state: relationshipState,
      confidence: 0,
      reason: { code: "DIRECT_SPOT_RELATIONSHIP" as const, subjectRef: spotId, policyRef: PRODUCT_INTERPRETATION_POLICY_3C.policyId },
    }));
  });
}

function snapshotFor(state: DarkProjectionState, consent: ConsentEnvelope, now: string): UserIntelligenceSnapshot {
  if (!state.userId) throw new ContractValidationError("$.state.userId", "active snapshot requires a user");
  const active = activeEvents(state);
  const spots = sortedUnique(active.flatMap((event) => event.spotId ? [event.spotId] : []));
  const directSpotAffinities: readonly DirectSpotAffinity[] = spots.flatMap((spotId) => {
    const events = active.filter((event) => event.spotId === spotId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    const visits = new Set(events.filter((event) => event.eventType === "VISITED").map((event) => event.journeyId)).size;
    const saveEvents = events.filter((event) => ["SAVED", "SAVE_REMOVED"].includes(event.eventType));
    const saved = saveEvents.at(-1)?.eventType === "SAVED";
    if (!saved && visits < 3) return [];
    return [{
      contractVersion: CONTRACT_VERSIONS.directSpotAffinity,
      relationshipId: `dark-affinity-${contentHash({ spotId }).slice(0, 24)}`,
      spotId,
      state: saved ? "SAVED" as const : "VISITED" as const,
      observations: { viewed: 0, saved: saved ? 1 : 0, selected: 0, visited: visits, excluded: 0, corrected: 0 },
      experienceEvidence: { count: visits, independentJourneys: visits, references: [] },
      satisfactionEvidence: { count: 0, independentJourneys: 0, references: [] },
      confidence: 0,
      propagatesToConceptTaste: false as const,
      policyRef: PRODUCT_INTERPRETATION_POLICY_3C.policyId,
    }];
  });
  const body: Omit<UserIntelligenceSnapshot, "snapshotHash"> = {
    contractVersion: CONTRACT_VERSIONS.snapshot,
    snapshotId: `dark-snapshot-${state.checkpointHash.slice(0, 24)}`,
    userId: state.userId,
    sourceWatermark: { sourceLedgerHash: state.checkpointHash },
    manifest: { manifestId: DARK_PROJECTION_RUNTIME_RELEASE.releaseId, manifestHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash },
    tasteNodes: [], practicalPreferences: [], directSpotAffinities,
    contradictions: [],
    domainSufficiency: [{ domain: "direct-spot-state", sufficiency: { level: directSpotAffinities.length ? "PARTIAL" : "UNKNOWN", policyRef: PRODUCT_INTERPRETATION_POLICY_3C.policyId, reasons: [directSpotAffinities.length ? "AUTHORIZED_STATE_ONLY" : "NO_PROJECTABLE_STATE"] } }],
    changeSummary: { created: directSpotAffinities.length, updated: 0, corrected: state.correctedEventIds.length, suppressed: active.length - directSpotAffinities.length },
    lifecycle: { consentVersion: consent.consentVersion, purpose: "PERSONALIZED_RECOMMENDATIONS", validUntil: null, invalidatedAt: null },
    technicalMetadata: { createdAt: now },
  };
  return { ...body, snapshotHash: contentHash(snapshotSemanticBody(body)) };
}

export const DarkProjectionHandoffSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkProjectionRuntimeHandoff),
  handoffId: identifier,
  purpose: schema.literal("DECISION_PERSONALIZATION_READ_ONLY"),
  consentHash: sha256,
  projectionContractVersion: schema.literal(CONTRACT_VERSIONS.projection),
  projectionId: identifier,
  projectionHash: sha256,
  releaseHash: sha256,
  minimalityProof: schema.object({ rawEventsIncluded: schema.literal(false), evidenceIncluded: schema.literal(false), rawTextIncluded: schema.literal(false), dwellIncluded: schema.literal(false), preciseLocationIncluded: schema.literal(false), commercialDataIncluded: schema.literal(false) }),
  productionAuthorized: schema.literal(false),
  rankingAuthority: schema.literal(false),
  eligibilityAuthority: schema.literal(false),
  handoffHash: sha256,
});
export type DarkProjectionHandoff = Infer<typeof DarkProjectionHandoffSchema>;

export function verifyDarkProjectionHandoff(value: unknown, projection: RelevantUserProjection, consent: ConsentEnvelope): DarkProjectionHandoff {
  const parsed = DarkProjectionHandoffSchema.parse(value);
  parseRelevantUserProjection(projection);
  if (parsed.projectionId !== projection.projectionId || parsed.projectionHash !== projection.projectionHash
    || parsed.consentHash !== contentHash(parseConsentEnvelope(consent)) || parsed.releaseHash !== DARK_PROJECTION_RUNTIME_RELEASE.releaseHash) throw new ContractValidationError("$.handoff", "handoff binding mismatch");
  if (contentHash(without(parsed as unknown as Record<string, unknown>, "handoffHash")) !== parsed.handoffHash) throw new ContractValidationError("$.handoffHash", "handoff hash mismatch");
  return parsed;
}

export interface DarkProjectionRunResult {
  readonly mode: DarkProjectionRuntimeMode;
  readonly outcome: "OFF" | "PROJECTED_LOCAL_ONLY" | "SUPPRESSED";
  readonly state: DarkProjectionState | null;
  readonly projection: RelevantUserProjection | null;
  readonly handoff: DarkProjectionHandoff | null;
  readonly counters: { readonly ingestionReads: number; readonly projectedItems: number; readonly persistentWrites: 0; readonly networkCalls: 0 };
  readonly reasonCode: string;
}

export function runDarkProjectionRuntime(input: {
  readonly configuration: unknown;
  readonly authorityRecordId: string;
  readonly consent: ConsentEnvelope;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly request: RelevantUserProjectionRequest;
  readonly events: readonly unknown[];
  readonly trust: DarkProjectionTrustContext;
  readonly now: string;
}): DarkProjectionRunResult {
  const mode = resolveDarkProjectionRuntimeMode(input.configuration);
  if (mode === "OFF") return { mode, outcome: "OFF", state: null, projection: null, handoff: null, counters: { ingestionReads: 0, projectedItems: 0, persistentWrites: 0, networkCalls: 0 }, reasonCode: "USER_LEARNING_RUNTIME_OFF" };
  const request = RelevantUserProjectionRequestSchema.parse(input.request);
  const consent = parseConsentEnvelope(input.consent);
  const authority = verifyDarkProjectionAuthority({ authorityRecordId: input.authorityRecordId, userId: request.actor.userId, subjectBindingHash: request.actor.subjectBindingHash, consent, lifecycle: input.lifecycle, action: "LOCAL_PROJECT", trust: input.trust });
  if (request.killSwitch) return { mode, outcome: "SUPPRESSED", state: null, projection: null, handoff: null, counters: { ingestionReads: 0, projectedItems: 0, persistentWrites: 0, networkCalls: 0 }, reasonCode: "KILL_SWITCH" };
  if (input.lifecycle !== "ACTIVE" || consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) {
    return { mode, outcome: "SUPPRESSED", state: makeState({ userId: null, subjectBindingHash: null, lifecycle: input.lifecycle, ledger: [] }), projection: null, handoff: null, counters: { ingestionReads: 0, projectedItems: 0, persistentWrites: 0, networkCalls: 0 }, reasonCode: input.lifecycle === "ACTIVE" ? "NO_CONSENT" : input.lifecycle };
  }
  verifyDarkProjectionAuthority({ authorityRecordId: input.authorityRecordId, userId: request.actor.userId, subjectBindingHash: request.actor.subjectBindingHash, consent, lifecycle: input.lifecycle, action: "LOCAL_INGEST", trust: input.trust });
  const state = reduce({ delivered: input.events, authority });
  const snapshot = snapshotFor(state, consent, input.now);
  const items = directSpotItems(state);
  const projectionRequest = RelevantUserProjectionRequestSchema.parse({ ...request, snapshot: { snapshotId: snapshot.snapshotId, snapshotHash: snapshot.snapshotHash } });
  const projection = buildRelevantUserProjection({
    request: projectionRequest, consent,
    manifest: snapshot.manifest, snapshot,
    content: { taste: [], practical: [], directSpot: items, domainSufficiency: snapshot.domainSufficiency, knowledgeLevel: items.length ? "PARTIAL" : "UNKNOWN", suppression: { total: 0, byReason: [] } },
    identity: { projectionId: `dark-projection-${state.checkpointHash.slice(0, 24)}` }, clock: { now: input.now },
  });
  const handoffBody = {
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeHandoff,
    handoffId: `dark-handoff-${projection.projectionHash.slice(0, 24)}`,
    purpose: "DECISION_PERSONALIZATION_READ_ONLY" as const,
    consentHash: contentHash(consent),
    projectionContractVersion: CONTRACT_VERSIONS.projection,
    projectionId: projection.projectionId,
    projectionHash: projection.projectionHash,
    releaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash,
    minimalityProof: { rawEventsIncluded: false as const, evidenceIncluded: false as const, rawTextIncluded: false as const, dwellIncluded: false as const, preciseLocationIncluded: false as const, commercialDataIncluded: false as const },
    productionAuthorized: false as const, rankingAuthority: false as const, eligibilityAuthority: false as const,
  };
  const handoff = DarkProjectionHandoffSchema.parse({ ...handoffBody, handoffHash: contentHash(handoffBody) });
  return { mode, outcome: projection.status === "ACTIVE" ? "PROJECTED_LOCAL_ONLY" : "SUPPRESSED", state, projection, handoff, counters: { ingestionReads: input.events.length, projectedItems: items.length, persistentWrites: 0, networkCalls: 0 }, reasonCode: projection.neutralReason ?? "LOCAL_READ_ONLY_PROJECTION" };
}

export const DARK_PROJECTION_RETENTION_TEMPLATE = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.darkProjectionRetentionDecision,
  templateId: "backyrd-user-intelligence-retention-decision-week2-1",
  supersedesTemplateHash: contentHash(DARK_RUNTIME_RETENTION_DECISION_TEMPLATE),
  status: "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL" as const,
  productionAuthorized: false as const,
  defaultsForbidden: true as const,
  classes: [
    { dataClass: "MINIMIZED_EVENT_LEDGER", purpose: "LOCAL_DARK_REPLAY", personal: true, trigger: "CONSENT_OR_LIFECYCLE", action: "DELETE", duration: null },
    { dataClass: "DERIVED_PROJECTION_STATE", purpose: "READ_ONLY_DECISION_HANDOFF", personal: true, trigger: "CONSENT_OR_LIFECYCLE", action: "DELETE", duration: null },
    { dataClass: "PRIVACY_EXPORT_EPHEMERAL", purpose: "LEGAL_EXPORT", personal: true, trigger: "EXPORT_COMPLETION", action: "DELETE", duration: null },
    { dataClass: "NON_PERSONAL_RELEASE_MANIFEST", purpose: "INTEGRITY_AUDIT", personal: false, trigger: "NEW_RELEASE", action: "RETAIN_NON_PERSONAL_ONLY", duration: null },
  ],
  requiredApprovals: ["FOUNDER", "CTO", "LEGAL"] as const,
  prohibitedFallbacks: ["FIXTURE_DURATION", "INFINITE_RETENTION", "SOURCE_CODE_DEFAULT", "CLIENT_SELECTED_DURATION"] as const,
});
export const DARK_PROJECTION_RETENTION_TEMPLATE_HASH = contentHash(DARK_PROJECTION_RETENTION_TEMPLATE);

export const DarkProjectionPrivacyExportSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkProjectionRuntimePrivacyExport),
  exportId: identifier,
  subjectBindingHash: sha256,
  stateHash: sha256,
  minimizedRecords: schema.array(schema.object({ eventId: identifier, eventType: identifier, occurredAt: timestamp, spotId: schema.optional(identifier) }), { max: 512 }),
  separateLegalAuthority: schema.literal(true),
  normalProductApiAccessible: schema.literal(false),
  excludes: schema.array(identifier, { min: 5, max: 5 }),
  productionAuthorized: schema.literal(false),
  exportHash: sha256,
});
export type DarkProjectionPrivacyExport = Infer<typeof DarkProjectionPrivacyExportSchema>;

export function buildDarkProjectionPrivacyExport(input: { readonly exportId: string; readonly state: DarkProjectionState; readonly consent: ConsentEnvelope; readonly authorityRecordId: string; readonly sourceAuthority: DarkProjectionAuthority; readonly trust: DarkProjectionTrustContext }): DarkProjectionPrivacyExport {
  if (!input.state.userId || !input.state.subjectBindingHash || input.state.lifecycle !== "ACTIVE") throw new ContractValidationError("$.state", "suppressed state cannot be exported from runtime memory");
  verifyDarkProjectionAuthority({ authorityRecordId: input.authorityRecordId, userId: input.state.userId, subjectBindingHash: input.state.subjectBindingHash, consent: input.consent, lifecycle: input.state.lifecycle, action: "LEGAL_EXPORT", trust: input.trust });
  const sourceAuthority = verifyDarkProjectionAuthority({ authorityRecordId: input.sourceAuthority.authorityRecordId, userId: input.state.userId, subjectBindingHash: input.state.subjectBindingHash, consent: input.consent, lifecycle: input.state.lifecycle, action: "LOCAL_REBUILD", trust: input.trust });
  if (!equal(sourceAuthority, input.sourceAuthority)) throw new ContractValidationError("$.sourceAuthority", "ledger source authority is not independently accepted");
  verifyDarkProjectionState(input.state, sourceAuthority);
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimePrivacyExport,
    exportId: input.exportId,
    subjectBindingHash: input.state.subjectBindingHash,
    stateHash: input.state.stateHash,
    minimizedRecords: input.state.ledger.map(({ eventId, eventType, occurredAt, spotId }) => ({ eventId, eventType, occurredAt, ...(spotId ? { spotId } : {}) })),
    separateLegalAuthority: true as const,
    normalProductApiAccessible: false as const,
    excludes: ["RAW_TEXT", "SECRETS", "TOKENS", "FOREIGN_USER_DATA", "PRECISE_LOCATION"] as const,
    productionAuthorized: false as const,
  };
  return DarkProjectionPrivacyExportSchema.parse({ ...body, exportHash: contentHash(body) });
}

export const DARK_PROJECTION_NO_WRITE_PROOF = Object.freeze({
  proofId: "backyrd-user-intelligence-dark-projection-no-write-week2-1",
  week1ProofHash: DARK_RUNTIME_NO_WRITE_PROOF.proofHash,
  databaseClientDependency: false as const,
  persistencePortDependency: false as const,
  networkClientDependency: false as const,
  productionEventConsumerRegistered: false as const,
  productionProjectionPublisherRegistered: false as const,
  localSyntheticPortExported: false as const,
  productionWritesPossible: false as const,
  proofHash: contentHash({ week1ProofHash: DARK_RUNTIME_NO_WRITE_PROOF.proofHash, databaseClientDependency: false, persistencePortDependency: false, networkClientDependency: false, productionEventConsumerRegistered: false, productionProjectionPublisherRegistered: false, localSyntheticPortExported: false, productionWritesPossible: false }),
});

export function deriveDarkProjectionMetrics(result: DarkProjectionRunResult): Readonly<Record<string, unknown>> {
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeMetrics,
    mode: result.mode,
    outcome: result.outcome,
    ingestionReads: result.counters.ingestionReads,
    projectedItems: result.counters.projectedItems,
    persistentWrites: result.counters.persistentWrites,
    networkCalls: result.counters.networkCalls,
    projectionGenerated: result.projection !== null,
    personalDataIncluded: result.state?.userId !== null && result.state?.userId !== undefined,
    noWriteProofHash: DARK_PROJECTION_NO_WRITE_PROOF.proofHash,
  };
  return Object.freeze({ ...body, metricsHash: contentHash(body) });
}

export function rehearseDarkProjectionLifecycle(input: { readonly activeResult: DarkProjectionRunResult }): Readonly<Record<string, unknown>> {
  if (!input.activeResult.state || !input.activeResult.projection) throw new ContractValidationError("$.activeResult", "active local result required");
  const suppressed = (["CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const).map((lifecycle) => {
    const state = makeState({ userId: null, subjectBindingHash: null, lifecycle, ledger: [] });
    return { lifecycle, stateHash: state.stateHash, personalState: false, projection: null, persistentWrites: 0, completionClaimed: false };
  });
  const body = { releaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash, activeStateHash: input.activeResult.state.stateHash, activeProjectionHash: input.activeResult.projection.projectionHash, suppressed };
  return Object.freeze({ ...body, rehearsalHash: contentHash(body) });
}
