import { contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, ConsentEnvelope, parseConsentEnvelope } from "./contracts.js";
import {
  LifecycleAction,
  planLifecycleImpact,
  USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
} from "./lifecycle.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";
import {
  PHASE3C_RELEASE_ARTIFACT_HASH,
  PRODUCT_INTERPRETATION_POLICY_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C,
} from "./product-policy.js";

const without = (value: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const same = (left: unknown, right: unknown): boolean => contentHash(left) === contentHash(right);

export const DARK_RUNTIME_FLAGS = Object.freeze({
  eventIngestionEnabled: false,
  runtimeActivated: false,
  learningAuthorized: false,
  productionWritesAuthorized: false,
  projectionWritesAuthorized: false,
  rankingAuthorized: false,
  eligibilityAuthorized: false,
  shadowTrafficAuthorized: false,
  killSwitch: "FORCED_OFF" as const,
});

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.darkRuntimeRelease,
  releaseId: "backyrd-user-intelligence-dark-runtime-week1-1",
  issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const,
  validFrom: "2026-09-16T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z",
  lifecycleManifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
  productPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash,
  signalRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash,
  phase3cReleaseArtifactHash: PHASE3C_RELEASE_ARTIFACT_HASH,
  flags: DARK_RUNTIME_FLAGS,
  limitations: [
    "SYNTHETIC_AND_LOCAL_INPUT_ONLY",
    "NO_PRODUCT_EVENT_INGESTION",
    "NO_PRODUCTION_DATA_ACCESS",
    "NO_PERSISTENT_WRITE_ADAPTER",
    "RETENTION_DURATIONS_NOT_CONFIGURED",
  ] as const,
});
export const DARK_RUNTIME_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });

const trustAnchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.darkRuntimeTrustAnchor,
  anchorId: "backyrd-user-intelligence-dark-runtime-anchor-week1-1",
  acceptedReleaseId: DARK_RUNTIME_RELEASE.releaseId,
  acceptedReleaseHash: DARK_RUNTIME_RELEASE.releaseHash,
  issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const,
  environment: "CANONICAL_REPOSITORY_DARK_RUNTIME" as const,
  validFrom: DARK_RUNTIME_RELEASE.validFrom,
  validUntil: DARK_RUNTIME_RELEASE.validUntil,
  flags: DARK_RUNTIME_FLAGS,
});
export const DARK_RUNTIME_TRUST_ANCHOR = Object.freeze({ ...trustAnchorBody, anchorHash: contentHash(trustAnchorBody) });

export interface DarkRuntimeAuthorityRecord {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkRuntimeAuthority;
  readonly authorityRecordId: string;
  readonly authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR" | "PRIVACY_LEGAL_PROCESS";
  readonly boundUserId: string;
  readonly subjectBindingHash: string;
  readonly consentHash: string;
  readonly lifecycle: "ACTIVE" | "CONSENT_WITHDRAWN" | "FULL_RESET" | "ACCOUNT_ERASURE";
  readonly allowedActions: readonly DarkRuntimeAction[];
  readonly acceptedReleaseHash: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly issuer: "BACKYRD_DARK_RUNTIME_AUTHORITY_REGISTRY";
  readonly syntheticOnly: true;
  readonly authorityHash: string;
}

export type DarkRuntimeAction =
  | "PREVIEW_EVENT_INGESTION"
  | "PREVIEW_FULL_REBUILD"
  | "PREVIEW_INCREMENTAL_UPDATE"
  | "PREVIEW_PRIVACY_EXPORT"
  | "PLAN_CONSENT_WITHDRAWAL"
  | "PLAN_FULL_RESET"
  | "PLAN_ACCOUNT_ERASURE";

const AuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkRuntimeAuthority),
  authorityRecordId: identifier,
  authorityKind: schema.enum(["SERVER_USER_INTELLIGENCE_ORCHESTRATOR", "PRIVACY_LEGAL_PROCESS"] as const),
  boundUserId: identifier,
  subjectBindingHash: sha256,
  consentHash: sha256,
  lifecycle: schema.enum(["ACTIVE", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
  allowedActions: schema.array(schema.enum(["PREVIEW_EVENT_INGESTION", "PREVIEW_FULL_REBUILD", "PREVIEW_INCREMENTAL_UPDATE", "PREVIEW_PRIVACY_EXPORT", "PLAN_CONSENT_WITHDRAWAL", "PLAN_FULL_RESET", "PLAN_ACCOUNT_ERASURE"] as const), { min: 1, max: 7 }),
  acceptedReleaseHash: sha256,
  validFrom: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_DARK_RUNTIME_AUTHORITY_REGISTRY"),
  syntheticOnly: schema.literal(true),
  authorityHash: sha256,
});

export interface DarkRuntimeTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  getAuthorityRecord(id: string): unknown;
}

export function createSyntheticDarkRuntimeAuthority(input: {
  readonly authorityRecordId: string;
  readonly authorityKind: DarkRuntimeAuthorityRecord["authorityKind"];
  readonly boundUserId: string;
  readonly subjectBindingHash: string;
  readonly consent: ConsentEnvelope;
  readonly lifecycle?: DarkRuntimeAuthorityRecord["lifecycle"];
  readonly allowedActions: readonly DarkRuntimeAction[];
}): DarkRuntimeAuthorityRecord {
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkRuntimeAuthority,
    authorityRecordId: input.authorityRecordId,
    authorityKind: input.authorityKind,
    boundUserId: input.boundUserId,
    subjectBindingHash: input.subjectBindingHash,
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    lifecycle: input.lifecycle ?? "ACTIVE",
    allowedActions: [...new Set(input.allowedActions)].sort(),
    acceptedReleaseHash: DARK_RUNTIME_RELEASE.releaseHash,
    validFrom: "2026-09-16T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    issuer: "BACKYRD_DARK_RUNTIME_AUTHORITY_REGISTRY" as const,
    syntheticOnly: true as const,
  };
  return AuthoritySchema.parse({ ...body, authorityHash: contentHash(body) }) as DarkRuntimeAuthorityRecord;
}

export function createDarkRuntimeRepositoryTrust(records: readonly DarkRuntimeAuthorityRecord[]): DarkRuntimeTrustContext {
  const map = new Map(records.map((record) => [record.authorityRecordId, record]));
  if (map.size !== records.length) throw new ContractValidationError("$.authorityRecords", "duplicate authority record id");
  return {
    verifiedAt: "2026-09-16T12:00:00.000Z",
    getRelease: (id) => id === DARK_RUNTIME_RELEASE.releaseId ? DARK_RUNTIME_RELEASE : null,
    getTrustAnchor: (id) => id === DARK_RUNTIME_TRUST_ANCHOR.anchorId ? DARK_RUNTIME_TRUST_ANCHOR : null,
    getAuthorityRecord: (id) => map.get(id) ?? null,
  };
}

function verifyRelease(trust: DarkRuntimeTrustContext): void {
  const release = trust.getRelease(DARK_RUNTIME_RELEASE.releaseId);
  const anchor = trust.getTrustAnchor(DARK_RUNTIME_TRUST_ANCHOR.anchorId);
  if (!same(release, DARK_RUNTIME_RELEASE) || !same(anchor, DARK_RUNTIME_TRUST_ANCHOR)) throw new ContractValidationError("$.trust", "dark runtime release is not independently accepted");
  if (Date.parse(trust.verifiedAt) < Date.parse(DARK_RUNTIME_RELEASE.validFrom) || Date.parse(trust.verifiedAt) > Date.parse(DARK_RUNTIME_RELEASE.validUntil)) throw new ContractValidationError("$.trust.verifiedAt", "dark runtime release is not valid at verification time");
  const runtimeFlags = DARK_RUNTIME_RELEASE.flags as Readonly<Record<string, unknown>>;
  if (Object.values(runtimeFlags).some((value) => value === true) || runtimeFlags.killSwitch !== "FORCED_OFF") throw new ContractValidationError("$.release.flags", "dark runtime must remain disabled");
}

export function verifyDarkRuntimeAuthority(input: {
  readonly authorityRecordId: string;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly consent: ConsentEnvelope;
  readonly action: DarkRuntimeAction;
  readonly trust: DarkRuntimeTrustContext;
}): DarkRuntimeAuthorityRecord {
  verifyRelease(input.trust);
  const parsed = AuthoritySchema.parse(input.trust.getAuthorityRecord(input.authorityRecordId));
  const expectedHash = contentHash(without(parsed as unknown as Record<string, unknown>, "authorityHash"));
  if (expectedHash !== parsed.authorityHash) throw new ContractValidationError("$.authority.authorityHash", "authority record hash mismatch");
  if (parsed.acceptedReleaseHash !== DARK_RUNTIME_RELEASE.releaseHash || parsed.boundUserId !== input.userId || parsed.subjectBindingHash !== input.subjectBindingHash || parsed.consentHash !== contentHash(parseConsentEnvelope(input.consent))) throw new ContractValidationError("$.authority", "authority binding mismatch");
  if (!parsed.allowedActions.includes(input.action)) throw new ContractValidationError("$.authority.allowedActions", "action is not authorized");
  if (Date.parse(input.trust.verifiedAt) < Date.parse(parsed.validFrom) || Date.parse(input.trust.verifiedAt) > Date.parse(parsed.validUntil)) throw new ContractValidationError("$.authority", "authority record is expired or not yet valid");
  if (input.action === "PREVIEW_PRIVACY_EXPORT" && parsed.authorityKind !== "PRIVACY_LEGAL_PROCESS") throw new ContractValidationError("$.authority.authorityKind", "privacy export requires separate legal authority");
  if (input.action !== "PREVIEW_PRIVACY_EXPORT" && parsed.authorityKind !== "SERVER_USER_INTELLIGENCE_ORCHESTRATOR") throw new ContractValidationError("$.authority.authorityKind", "runtime command requires orchestrator authority");
  return parsed as DarkRuntimeAuthorityRecord;
}

export const RETENTION_DECISION_CLASSES = Object.freeze([
  "SEARCH_MINIMIZED",
  "SKIP_CONTEXTUAL",
  "CONTEXT_MINIMIZED",
  "ATTENTION_RESEARCH",
  "EVIDENCE_LEDGER",
  "USER_MODEL_DERIVED",
  "CORRECTION_GUARD",
  "PRIVACY_EXPORT_EPHEMERAL",
  "NON_PERSONAL_AUDIT",
] as const);

export const DARK_RUNTIME_RETENTION_DECISION_TEMPLATE = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.darkRuntimeRetentionDecision,
  templateId: "backyrd-user-intelligence-retention-decision-week1-1",
  status: "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL" as const,
  productionAuthorized: false as const,
  defaultsForbidden: true as const,
  decisions: RETENTION_DECISION_CLASSES.map((dataClass) => ({
    dataClass,
    concreteDuration: null,
    legalBasis: null,
    founderDecision: null,
    ctoDecision: null,
    legalDecision: null,
    activationReleaseRequired: true as const,
  })),
  prohibitedFallbacks: ["FIXTURE_DURATION", "INFINITE_RETENTION", "SOURCE_CODE_DEFAULT", "CLIENT_SELECTED_DURATION"] as const,
});
export const DARK_RUNTIME_RETENTION_DECISION_TEMPLATE_HASH = contentHash(DARK_RUNTIME_RETENTION_DECISION_TEMPLATE);

export const DarkRuntimeSyntheticEventSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkRuntimeSyntheticEvent),
  eventId: identifier,
  idempotencyKey: identifier,
  userId: identifier,
  subjectBindingHash: sha256,
  eventType: schema.enum(["SEARCH", "QUICK_SKIP", "SAVED", "SAVE_REMOVED", "VISITED", "CORRECTION"] as const),
  journeyId: identifier,
  spotId: schema.optional(identifier),
  targetEventId: schema.optional(identifier),
  occurredAt: timestamp,
  ingestedAt: timestamp,
  authority: schema.literal("SYNTHETIC_SERVER_FIXTURE"),
  rawPersonalDataIncluded: schema.literal(false),
  productionAuthorized: schema.literal(false),
  eventHash: sha256,
});
export type DarkRuntimeSyntheticEvent = Infer<typeof DarkRuntimeSyntheticEventSchema>;

export function withDarkRuntimeSyntheticEventHash(input: Omit<DarkRuntimeSyntheticEvent, "eventHash">): DarkRuntimeSyntheticEvent {
  return DarkRuntimeSyntheticEventSchema.parse({ ...input, eventHash: contentHash(input) });
}

function parseSyntheticEvent(value: unknown, expectedUserId: string, expectedSubject: string): DarkRuntimeSyntheticEvent {
  const event = DarkRuntimeSyntheticEventSchema.parse(value);
  if (event.userId !== expectedUserId || event.subjectBindingHash !== expectedSubject) throw new ContractValidationError("$.event", "foreign subject binding");
  if (contentHash(without(event as unknown as Record<string, unknown>, "eventHash")) !== event.eventHash) throw new ContractValidationError("$.event.eventHash", "event hash mismatch");
  if (event.eventType === "CORRECTION" && event.targetEventId === undefined) throw new ContractValidationError("$.event.targetEventId", "correction requires a target");
  if (event.eventType !== "CORRECTION" && event.targetEventId !== undefined) throw new ContractValidationError("$.event.targetEventId", "only corrections may target an event");
  if (["QUICK_SKIP", "SAVED", "SAVE_REMOVED", "VISITED"].includes(event.eventType) && event.spotId === undefined) throw new ContractValidationError("$.event.spotId", "spot-bound event requires a spot");
  if (Date.parse(event.ingestedAt) < Date.parse(event.occurredAt)) throw new ContractValidationError("$.event.ingestedAt", "ingestion cannot precede occurrence");
  return event;
}

function idempotencyFingerprint(event: DarkRuntimeSyntheticEvent): string {
  const body = Object.fromEntries(Object.entries(event).filter(([key]) => !["eventHash", "eventId", "ingestedAt"].includes(key)));
  return contentHash(body);
}

export interface DarkRuntimeSyntheticState {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkRuntimeSyntheticState;
  readonly stateId: string;
  readonly boundUserId: string | null;
  readonly subjectBindingHash: string | null;
  readonly lifecycle: DarkRuntimeAuthorityRecord["lifecycle"];
  readonly activeEvents: readonly DarkRuntimeSyntheticEvent[];
  readonly correctedEventIds: readonly string[];
  readonly checkpointHash: string;
  readonly productionWrites: 0;
  readonly productionProjectionItems: 0;
  readonly learningActivated: false;
  readonly stateHash: string;
}

function stateBody(input: Omit<DarkRuntimeSyntheticState, "contractVersion" | "stateId" | "checkpointHash" | "productionWrites" | "productionProjectionItems" | "learningActivated" | "stateHash">): Omit<DarkRuntimeSyntheticState, "stateHash"> {
  const activeEvents = [...input.activeEvents].sort((a, b) => a.eventId.localeCompare(b.eventId));
  const correctedEventIds = [...new Set(input.correctedEventIds)].sort();
  const checkpointHash = contentHash(activeEvents.map(({ eventId, eventHash }) => ({ eventId, eventHash })));
  return {
    contractVersion: CONTRACT_VERSIONS.darkRuntimeSyntheticState,
    stateId: `dark-state-${contentHash({ user: input.boundUserId, subject: input.subjectBindingHash, lifecycle: input.lifecycle, checkpointHash }).slice(0, 24)}`,
    boundUserId: input.boundUserId,
    subjectBindingHash: input.subjectBindingHash,
    lifecycle: input.lifecycle,
    activeEvents,
    correctedEventIds,
    checkpointHash,
    productionWrites: 0,
    productionProjectionItems: 0,
    learningActivated: false,
  };
}

function createState(input: Parameters<typeof stateBody>[0]): DarkRuntimeSyntheticState {
  const body = stateBody(input);
  return Object.freeze({ ...body, stateHash: contentHash(body) });
}

export function verifyDarkRuntimeSyntheticState(value: DarkRuntimeSyntheticState): DarkRuntimeSyntheticState {
  if (value.lifecycle === "ACTIVE" && (value.boundUserId === null || value.subjectBindingHash === null)) throw new ContractValidationError("$.state", "active state requires identity binding");
  if (value.lifecycle !== "ACTIVE" && (value.boundUserId !== null || value.subjectBindingHash !== null || value.activeEvents.length > 0)) throw new ContractValidationError("$.state", "suppressed state contains personal data");
  if (value.boundUserId !== null && value.subjectBindingHash !== null) for (const event of value.activeEvents) parseSyntheticEvent(event, value.boundUserId, value.subjectBindingHash);
  const rebuilt = createState({ boundUserId: value.boundUserId, subjectBindingHash: value.subjectBindingHash, lifecycle: value.lifecycle, activeEvents: value.activeEvents, correctedEventIds: value.correctedEventIds });
  if (!same(rebuilt, value)) throw new ContractValidationError("$.state", "synthetic state failed recursive verification");
  if (value.productionWrites !== 0 || value.productionProjectionItems !== 0 || value.learningActivated !== false) throw new ContractValidationError("$.state", "dark state cannot authorize output");
  return value;
}

function reduceEvents(input: {
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly lifecycle: DarkRuntimeAuthorityRecord["lifecycle"];
  readonly events: readonly unknown[];
}): DarkRuntimeSyntheticState {
  if (input.lifecycle !== "ACTIVE") return createState({ boundUserId: null, subjectBindingHash: null, lifecycle: input.lifecycle, activeEvents: [], correctedEventIds: [] });
  const parsed = input.events.map((event) => parseSyntheticEvent(event, input.userId, input.subjectBindingHash));
  const eventIds = new Set<string>();
  const idempotency = new Map<string, string>();
  const unique: DarkRuntimeSyntheticEvent[] = [];
  for (const event of parsed) {
    if (eventIds.has(event.eventId)) continue;
    const fingerprint = idempotencyFingerprint(event);
    const priorHash = idempotency.get(event.idempotencyKey);
    if (priorHash !== undefined) {
      if (priorHash !== fingerprint) throw new ContractValidationError("$.events.idempotencyKey", "idempotency key reused for different content");
      continue;
    }
    eventIds.add(event.eventId); idempotency.set(event.idempotencyKey, fingerprint); unique.push(event);
  }
  const byId = new Map(unique.map((event) => [event.eventId, event]));
  const corrected = new Set<string>();
  for (const event of unique.filter(({ eventType }) => eventType === "CORRECTION")) {
    const target = byId.get(event.targetEventId!);
    if (!target || target.eventType === "CORRECTION") throw new ContractValidationError("$.events.targetEventId", "invalid correction target");
    if (Date.parse(event.occurredAt) < Date.parse(target.occurredAt)) throw new ContractValidationError("$.events.occurredAt", "correction precedes target");
    corrected.add(target.eventId);
  }
  const active = unique.filter((event) => event.eventType !== "CORRECTION" && !corrected.has(event.eventId));
  return createState({ boundUserId: input.userId, subjectBindingHash: input.subjectBindingHash, lifecycle: input.lifecycle, activeEvents: active, correctedEventIds: [...corrected] });
}

export function buildDarkRuntimeSyntheticState(input: Parameters<typeof reduceEvents>[0]): DarkRuntimeSyntheticState {
  return reduceEvents(input);
}

export function updateDarkRuntimeSyntheticState(input: {
  readonly previous: DarkRuntimeSyntheticState;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly lifecycle: DarkRuntimeAuthorityRecord["lifecycle"];
  readonly delta: readonly unknown[];
}): DarkRuntimeSyntheticState {
  const previous = verifyDarkRuntimeSyntheticState(input.previous);
  if (previous.lifecycle !== "ACTIVE" || previous.boundUserId !== input.userId || previous.subjectBindingHash !== input.subjectBindingHash) throw new ContractValidationError("$.previous", "previous state binding mismatch");
  return reduceEvents({ userId: input.userId, subjectBindingHash: input.subjectBindingHash, lifecycle: input.lifecycle, events: [...previous.activeEvents, ...input.delta] });
}

export function verifyDarkRuntimeReplay(input: {
  readonly full: DarkRuntimeSyntheticState;
  readonly incremental: DarkRuntimeSyntheticState;
}): true {
  verifyDarkRuntimeSyntheticState(input.full); verifyDarkRuntimeSyntheticState(input.incremental);
  if (!same(input.full, input.incremental)) throw new ContractValidationError("$.replay", "full and incremental states differ");
  return true;
}

export interface DarkRuntimeMetrics {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkRuntimeMetrics;
  readonly acceptedEvents: number;
  readonly deduplicatedEvents: number;
  readonly lateEvents: number;
  readonly correctionsApplied: number;
  readonly withdrawalLatency: "NOT_MEASURED_NO_RUNTIME";
  readonly erasureCompleteness: "MANIFEST_PLAN_COMPLETE_EXECUTION_NOT_RUN";
  readonly projectionParity: true;
  readonly productionWrites: 0;
  readonly noWriteProof: true;
  readonly metricsHash: string;
}

export function deriveDarkRuntimeMetrics(input: { readonly deliveredEvents: readonly DarkRuntimeSyntheticEvent[]; readonly state: DarkRuntimeSyntheticState }): DarkRuntimeMetrics {
  const state = verifyDarkRuntimeSyntheticState(input.state);
  const uniqueTransport = new Set(input.deliveredEvents.map(({ eventId }) => eventId)).size;
  const lateEvents = input.deliveredEvents.filter(({ occurredAt, ingestedAt }) => Date.parse(ingestedAt) - Date.parse(occurredAt) > 0).length;
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkRuntimeMetrics,
    acceptedEvents: state.activeEvents.length,
    deduplicatedEvents: Math.max(0, input.deliveredEvents.length - uniqueTransport),
    lateEvents,
    correctionsApplied: state.correctedEventIds.length,
    withdrawalLatency: "NOT_MEASURED_NO_RUNTIME" as const,
    erasureCompleteness: "MANIFEST_PLAN_COMPLETE_EXECUTION_NOT_RUN" as const,
    projectionParity: true as const,
    productionWrites: 0 as const,
    noWriteProof: true as const,
  };
  return { ...body, metricsHash: contentHash(body) };
}

export interface DarkRuntimeCommand {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkRuntimeCommand;
  readonly commandId: string;
  readonly action: DarkRuntimeAction;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly consent: ConsentEnvelope;
  readonly authorityRecordId: string;
  readonly requestedAt: string;
  readonly clientSelectedPolicy: false;
  readonly productionWriteRequested: false;
  readonly commandHash: string;
}

const DarkRuntimeCommandSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.darkRuntimeCommand),
  commandId: identifier,
  action: schema.enum(["PREVIEW_EVENT_INGESTION", "PREVIEW_FULL_REBUILD", "PREVIEW_INCREMENTAL_UPDATE", "PREVIEW_PRIVACY_EXPORT", "PLAN_CONSENT_WITHDRAWAL", "PLAN_FULL_RESET", "PLAN_ACCOUNT_ERASURE"] as const),
  userId: identifier,
  subjectBindingHash: sha256,
  consent: schema.object({
    contractVersion: schema.literal(CONTRACT_VERSIONS.consentEnvelope),
    purpose: schema.literal("PERSONALIZED_RECOMMENDATIONS"),
    state: schema.enum(["GRANTED", "DENIED", "WITHDRAWN", "UNKNOWN"] as const),
    consentVersion: identifier,
    policyVersion: identifier,
    uxVersion: identifier,
    effectiveAt: timestamp,
    captureContext: schema.enum(["ONBOARDING", "SETTINGS", "MIGRATION_VERIFIED", "SYSTEM_UNKNOWN"] as const),
    allowedProcessing: schema.array(schema.enum(["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"] as const), { max: 4 }),
    lifecycleEffect: schema.enum(["ALLOW", "DO_NOT_PROCESS", "PURGE_PERSONALIZATION"] as const),
  }),
  authorityRecordId: identifier,
  requestedAt: timestamp,
  clientSelectedPolicy: schema.literal(false),
  productionWriteRequested: schema.literal(false),
  commandHash: sha256,
});

export function withDarkRuntimeCommandHash(input: Omit<DarkRuntimeCommand, "contractVersion" | "commandHash">): DarkRuntimeCommand {
  const body = { contractVersion: CONTRACT_VERSIONS.darkRuntimeCommand, ...input };
  return { ...body, commandHash: contentHash(body) };
}

export interface DarkRuntimeReceipt {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkRuntimeReceipt;
  readonly commandId: string;
  readonly action: DarkRuntimeAction;
  readonly outcome: "BLOCKED_DISABLED" | "PLAN_ONLY" | "SYNTHETIC_PREVIEW_ONLY";
  readonly reasonCode: string;
  readonly lifecyclePlanHash: string | null;
  readonly personalPayloadReturned: false;
  readonly subjectBindingHash: null;
  readonly persistentWritesAttempted: 0;
  readonly persistentWritesCompleted: 0;
  readonly projectionWritesCompleted: 0;
  readonly completed: false;
  readonly receiptHash: string;
}

function lifecycleActionFor(action: DarkRuntimeAction): LifecycleAction | null {
  if (action === "PLAN_CONSENT_WITHDRAWAL") return "CONSENT_WITHDRAWAL";
  if (action === "PLAN_FULL_RESET") return "FULL_PERSONALIZATION_RESET";
  if (action === "PLAN_ACCOUNT_ERASURE") return "ACCOUNT_ERASURE";
  return null;
}

export function evaluateDarkRuntimeCommand(command: DarkRuntimeCommand, trust: DarkRuntimeTrustContext): DarkRuntimeReceipt {
  const parsedCommand = DarkRuntimeCommandSchema.parse(command) as DarkRuntimeCommand;
  parseConsentEnvelope(parsedCommand.consent);
  if (contentHash(without(parsedCommand as unknown as Record<string, unknown>, "commandHash")) !== parsedCommand.commandHash) throw new ContractValidationError("$.command", "command contract or hash mismatch");
  const authority = verifyDarkRuntimeAuthority({ authorityRecordId: parsedCommand.authorityRecordId, userId: parsedCommand.userId, subjectBindingHash: parsedCommand.subjectBindingHash, consent: parsedCommand.consent, action: parsedCommand.action, trust });
  if (authority.lifecycle !== "ACTIVE" && ["PREVIEW_EVENT_INGESTION", "PREVIEW_FULL_REBUILD", "PREVIEW_INCREMENTAL_UPDATE"].includes(parsedCommand.action)) throw new ContractValidationError("$.authority.lifecycle", "inactive lifecycle cannot process personal evidence");
  if (parsedCommand.consent.state !== "GRANTED" && ["PREVIEW_EVENT_INGESTION", "PREVIEW_FULL_REBUILD", "PREVIEW_INCREMENTAL_UPDATE"].includes(parsedCommand.action)) throw new ContractValidationError("$.consent", "granted consent is required for synthetic processing");
  const lifecycleAction = lifecycleActionFor(parsedCommand.action);
  const lifecyclePlan = lifecycleAction === null ? null : planLifecycleImpact(lifecycleAction);
  if (lifecycleAction === "ACCOUNT_ERASURE" && lifecyclePlan!.some(({ store, effect }) => store !== "technical_audit_manifests" && effect !== "DELETE")) throw new ContractValidationError("$.lifecyclePlan", "account erasure requires delete for every personal store");
  const outcome = parsedCommand.action === "PREVIEW_EVENT_INGESTION" ? "BLOCKED_DISABLED" as const : lifecyclePlan ? "PLAN_ONLY" as const : "SYNTHETIC_PREVIEW_ONLY" as const;
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkRuntimeReceipt,
    commandId: parsedCommand.commandId,
    action: parsedCommand.action,
    outcome,
    reasonCode: outcome === "BLOCKED_DISABLED" ? "EVENT_INGESTION_DISABLED_FAIL_CLOSED" : outcome === "PLAN_ONLY" ? "NO_STORE_EXECUTOR_PLAN_ONLY" : "LOCAL_SYNTHETIC_NO_WRITE_PREVIEW",
    lifecyclePlanHash: lifecyclePlan === null ? null : contentHash({ manifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH, lifecycleAction, lifecyclePlan }),
    personalPayloadReturned: false as const,
    subjectBindingHash: null,
    persistentWritesAttempted: 0 as const,
    persistentWritesCompleted: 0 as const,
    projectionWritesCompleted: 0 as const,
    completed: false as const,
  };
  return { ...body, receiptHash: contentHash(body) };
}

export interface DarkRuntimePrivacyExport {
  readonly contractVersion: typeof CONTRACT_VERSIONS.darkRuntimePrivacyExport;
  readonly exportId: string;
  readonly purpose: "PRIVACY_LEGAL_DISCLOSURE";
  readonly normalProductApiAccessible: false;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly observations: readonly { readonly eventId: string; readonly eventType: DarkRuntimeSyntheticEvent["eventType"]; readonly occurredAt: string; readonly spotId: string | null }[];
  readonly derivedState: { readonly activeEventCount: number; readonly correctedEventCount: number; readonly learningActivated: false };
  readonly excludes: readonly ["RAW_TEXT", "SECRETS", "TOKENS", "FOREIGN_USER_DATA", "PRECISE_LOCATION"];
  readonly productionAuthorized: false;
  readonly exportHash: string;
}

export function buildDarkRuntimePrivacyExport(input: {
  readonly exportId: string;
  readonly command: DarkRuntimeCommand;
  readonly state: DarkRuntimeSyntheticState;
  readonly trust: DarkRuntimeTrustContext;
}): DarkRuntimePrivacyExport {
  if (input.command.action !== "PREVIEW_PRIVACY_EXPORT") throw new ContractValidationError("$.command.action", "privacy export command required");
  evaluateDarkRuntimeCommand(input.command, input.trust);
  const state = verifyDarkRuntimeSyntheticState(input.state);
  if (state.boundUserId !== input.command.userId || state.subjectBindingHash !== input.command.subjectBindingHash || state.lifecycle !== "ACTIVE") throw new ContractValidationError("$.state", "export state binding mismatch");
  const body = {
    contractVersion: CONTRACT_VERSIONS.darkRuntimePrivacyExport,
    exportId: input.exportId,
    purpose: "PRIVACY_LEGAL_DISCLOSURE" as const,
    normalProductApiAccessible: false as const,
    userId: input.command.userId,
    subjectBindingHash: input.command.subjectBindingHash,
    observations: state.activeEvents.map(({ eventId, eventType, occurredAt, spotId }) => ({ eventId, eventType, occurredAt, spotId: spotId ?? null })),
    derivedState: { activeEventCount: state.activeEvents.length, correctedEventCount: state.correctedEventIds.length, learningActivated: false as const },
    excludes: ["RAW_TEXT", "SECRETS", "TOKENS", "FOREIGN_USER_DATA", "PRECISE_LOCATION"] as const,
    productionAuthorized: false as const,
  };
  return { ...body, exportHash: contentHash(body) };
}

export const DARK_RUNTIME_NO_WRITE_PROOF = Object.freeze({
  contractVersion: "backyrd.user-intelligence.no-write-proof@week1-1",
  releaseHash: DARK_RUNTIME_RELEASE.releaseHash,
  trustAnchorHash: DARK_RUNTIME_TRUST_ANCHOR.anchorHash,
  adapterKind: "PURE_IN_MEMORY_SYNTHETIC_PREVIEW" as const,
  databaseClientDependency: false as const,
  persistencePortDependency: false as const,
  productEventConsumerRegistered: false as const,
  productProjectionPublisherRegistered: false as const,
  productionWritesPossible: false as const,
  proofHash: contentHash({
    releaseHash: DARK_RUNTIME_RELEASE.releaseHash,
    trustAnchorHash: DARK_RUNTIME_TRUST_ANCHOR.anchorHash,
    adapterKind: "PURE_IN_MEMORY_SYNTHETIC_PREVIEW",
    databaseClientDependency: false,
    persistencePortDependency: false,
    productEventConsumerRegistered: false,
    productProjectionPublisherRegistered: false,
    productionWritesPossible: false,
  }),
});
