import { contentHash } from "./canonical.js";
import {
  CONTRACT_VERSIONS,
  ConsentEnvelope,
  RelevantUserProjection,
  RelevantUserProjectionRequest,
  RelevantUserProjectionRequestSchema,
  RelevantUserProjectionSchema,
  parseConsentEnvelope,
  parseRelevantUserProjection,
} from "./contracts.js";
import {
  DarkProjectionLifecycle,
  DarkProjectionTrustContext,
  runDarkProjectionRuntime,
} from "./dark-projection-runtime.js";
import {
  INTERNAL_PROJECTION_NO_WRITE_PROOF,
  INTERNAL_PROJECTION_RELEASE,
  INTERNAL_PROJECTION_RETENTION_TEMPLATE_HASH,
} from "./internal-allowlisted-projection.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const without = (value: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const equal = (left: unknown, right: unknown): boolean => contentHash(left) === contentHash(right);
const gitSha = schema.string({ pattern: /^[a-f0-9]{40}$/ });

export const FOUNDER_LIVE_PROJECTION_FLAGS = Object.freeze({
  USER_LEARNING_RUNTIME: false,
  eventIngestionEnabled: false,
  projectionRuntimeActivated: false,
  projectionPersistenceAuthorized: false,
  writebackAuthorized: false,
  networkCallsAuthorized: false,
  productOutputsAuthorized: false,
  rankingAuthorized: false,
  eligibilityAuthorized: false,
  confidenceInfluenceAuthorized: false,
  shadowTrafficAuthorized: false,
  killSwitch: "FORCED_OFF" as const,
});

export type FounderLiveEnvironment = "LOCAL_TEST" | "PROD_LIKE_TEST";
export type FounderLiveRuntimeMode = "OFF" | FounderLiveEnvironment | "EMERGENCY_OFF";

/** Unknown values, including PRODUCTION, are deliberately OFF. */
export function resolveFounderLiveRuntimeMode(value: unknown): FounderLiveRuntimeMode {
  return value === "LOCAL_TEST" || value === "PROD_LIKE_TEST" || value === "EMERGENCY_OFF" ? value : "OFF";
}

const founderSlotBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.founderLiveSubjectSlot,
  slotId: "backyrd-founder-live-first-subject-slot-1",
  intendedMemberCount: 1 as const,
  configuredMemberCount: 0 as const,
  status: "NOT_CONFIGURED_PENDING_EXPLICIT_RELEASE" as const,
  subjectIdentifierPresent: false as const,
  subjectIdentifierHash: null,
  acceptedFutureBindingSources: ["SERVER_AUTH_APP_METADATA", "CANONICAL_SERVER_SUBJECT_MAPPING"] as const,
  clientUserMetadataAuthorityAccepted: false as const,
  explicitReleaseRequired: true as const,
  productionAuthorized: false as const,
});
export const FOUNDER_LIVE_SUBJECT_SLOT = Object.freeze({ ...founderSlotBody, slotHash: contentHash(founderSlotBody) });

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.founderLiveProjectionRelease,
  releaseId: "backyrd-user-intelligence-founder-live-projection-1",
  issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const,
  canonicalBaseSha: "480e621f63aaf0fd9385bc5fa4b7886b9e82dd55",
  canonicalBaseTree: "47383a7b9ff367008e3cb8d384246a79fb97eede",
  validFrom: "2026-09-17T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z",
  week3ReleaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
  founderSlotHash: FOUNDER_LIVE_SUBJECT_SLOT.slotHash,
  noWriteProofHash: INTERNAL_PROJECTION_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: INTERNAL_PROJECTION_RETENTION_TEMPLATE_HASH,
  flags: FOUNDER_LIVE_PROJECTION_FLAGS,
  enabledTestEnvironments: ["LOCAL_TEST", "PROD_LIKE_TEST"] as const,
  liveFounderSlotConfigured: false as const,
  productionAuthorized: false as const,
  runtimeActivated: false as const,
  limitations: [
    "REAL_FOUNDER_SUBJECT_NOT_CONFIGURED",
    "SYNTHETIC_TEST_SUBJECTS_ONLY",
    "NO_LEARNING_EVENT_INGESTION_PERSISTENCE_OR_WRITEBACK",
    "NO_PRODUCT_OUTPUT_RANKING_ELIGIBILITY_OR_CONFIDENCE_INFLUENCE",
    "RETENTION_NOT_CONFIGURED",
  ] as const,
});
export const FOUNDER_LIVE_PROJECTION_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });

const anchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.founderLiveProjectionTrustAnchor,
  anchorId: "backyrd-user-intelligence-founder-live-projection-anchor-1",
  acceptedReleaseId: FOUNDER_LIVE_PROJECTION_RELEASE.releaseId,
  acceptedReleaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
  acceptedFounderSlotHash: FOUNDER_LIVE_SUBJECT_SLOT.slotHash,
  issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const,
  validFrom: FOUNDER_LIVE_PROJECTION_RELEASE.validFrom,
  validUntil: FOUNDER_LIVE_PROJECTION_RELEASE.validUntil,
  productionAuthorized: false as const,
});
export const FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR = Object.freeze({ ...anchorBody, anchorHash: contentHash(anchorBody) });

export const FounderLiveSubjectAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveSubjectAuthority),
  authorityRecordId: identifier,
  pseudonymousSubjectId: identifier,
  boundUserId: identifier,
  subjectBindingHash: sha256,
  sessionBindingHash: sha256,
  consentHash: sha256,
  acceptedRequestHash: sha256,
  purpose: schema.literal("FOUNDER_LIVE_RELEVANT_USER_PROJECTION"),
  environment: schema.enum(["LOCAL_TEST", "PROD_LIKE_TEST"] as const),
  bindingSource: schema.literal("SYNTHETIC_LOCAL_MAPPING"),
  subjectClass: schema.literal("PSEUDONYMOUS_SYNTHETIC_FOUNDER_TEST_SUBJECT"),
  lifecycle: schema.enum(["ACTIVE", "NO_CONSENT", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
  acceptedReleaseHash: sha256,
  acceptedSlotHash: sha256,
  status: schema.literal("ACTIVE"),
  userMetadataUsedForAuthorization: schema.literal(false),
  syntheticOnly: schema.literal(true),
  productionAuthorized: schema.literal(false),
  validFrom: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_SERVER_SUBJECT_AUTHORITY_REGISTRY"),
  authorityHash: sha256,
});
export type FounderLiveSubjectAuthority = Infer<typeof FounderLiveSubjectAuthoritySchema>;

export const FounderLiveProjectionInvocationSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveProjectionInvocation),
  invocationId: identifier,
  authorityRecordId: identifier,
  purpose: schema.literal("FOUNDER_LIVE_RELEVANT_USER_PROJECTION"),
  environment: schema.enum(["LOCAL_TEST", "PROD_LIKE_TEST"] as const),
  requestHash: sha256,
  consentHash: sha256,
  sessionBindingHash: sha256,
  releaseHash: sha256,
  productionAuthorized: schema.literal(false),
  persistenceAuthorized: schema.literal(false),
  writebackAuthorized: schema.literal(false),
  rankingAuthorized: schema.literal(false),
  eligibilityAuthorized: schema.literal(false),
  invocationHash: sha256,
});
export type FounderLiveProjectionInvocation = Infer<typeof FounderLiveProjectionInvocationSchema>;

const FOUNDER_LIVE_UNAVAILABLE_CODES = [
  "RUNTIME_OFF",
  "NO_CONSENT",
  "LIFECYCLE_BLOCKED",
  "SESSION_CHANGED",
  "PROJECTION_NOT_AVAILABLE",
  "KILL_SWITCH",
  "AUTHORITY_DENIED",
] as const;
export type FounderLiveUnavailableCode = typeof FOUNDER_LIVE_UNAVAILABLE_CODES[number];

const FounderLiveUnavailableOutcomeSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveProjectionOutcome),
  status: schema.literal("UNAVAILABLE"),
  reasonCode: schema.enum(FOUNDER_LIVE_UNAVAILABLE_CODES),
  retryable: schema.boolean(),
  personalDataIncluded: schema.literal(false),
  detailsIncluded: schema.literal(false),
  productionAuthorized: schema.literal(false),
  outcomeHash: sha256,
});
const FounderLiveAvailableOutcomeSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveProjectionOutcome),
  status: schema.literal("AVAILABLE"),
  environment: schema.enum(["LOCAL_TEST", "PROD_LIKE_TEST"] as const),
  projection: RelevantUserProjectionSchema,
  persistenceAuthorized: schema.literal(false),
  writebackAuthorized: schema.literal(false),
  rankingAuthorized: schema.literal(false),
  eligibilityAuthorized: schema.literal(false),
  productionAuthorized: schema.literal(false),
  outcomeHash: sha256,
});
export const FounderLiveProjectionOutcomeSchema = schema.union([FounderLiveUnavailableOutcomeSchema, FounderLiveAvailableOutcomeSchema]);
export type FounderLiveProjectionOutcome = Infer<typeof FounderLiveProjectionOutcomeSchema>;

export interface FounderLiveProjectionTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  getFounderSlot(id: string): unknown;
  getSubjectAuthority(id: string): unknown;
}

export function founderLiveRequestHash(input: {
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly environment: FounderLiveEnvironment;
  readonly sessionBindingHash: string;
}): string {
  return contentHash({
    request: RelevantUserProjectionRequestSchema.parse(input.request),
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    environment: input.environment,
    purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION",
    sessionBindingHash: sha256.parse(input.sessionBindingHash),
    releaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
  });
}

export function createSyntheticFounderLiveSubjectAuthority(input: {
  readonly authorityRecordId: string;
  readonly pseudonymousSubjectId: string;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly sessionBindingHash: string;
  readonly consent: ConsentEnvelope;
  readonly requestHash: string;
  readonly environment: FounderLiveEnvironment;
  readonly lifecycle?: DarkProjectionLifecycle;
}): FounderLiveSubjectAuthority {
  if (!input.pseudonymousSubjectId.startsWith("synthetic-founder-") || !input.userId.startsWith("synthetic-founder-")) {
    throw new ContractValidationError("$.subject", "only pseudonymous synthetic founder test subjects are permitted");
  }
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveSubjectAuthority,
    authorityRecordId: input.authorityRecordId,
    pseudonymousSubjectId: input.pseudonymousSubjectId,
    boundUserId: input.userId,
    subjectBindingHash: input.subjectBindingHash,
    sessionBindingHash: input.sessionBindingHash,
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    acceptedRequestHash: input.requestHash,
    purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION" as const,
    environment: input.environment,
    bindingSource: "SYNTHETIC_LOCAL_MAPPING" as const,
    subjectClass: "PSEUDONYMOUS_SYNTHETIC_FOUNDER_TEST_SUBJECT" as const,
    lifecycle: input.lifecycle ?? "ACTIVE",
    acceptedReleaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
    acceptedSlotHash: FOUNDER_LIVE_SUBJECT_SLOT.slotHash,
    status: "ACTIVE" as const,
    userMetadataUsedForAuthorization: false as const,
    syntheticOnly: true as const,
    productionAuthorized: false as const,
    validFrom: FOUNDER_LIVE_PROJECTION_RELEASE.validFrom,
    validUntil: FOUNDER_LIVE_PROJECTION_RELEASE.validUntil,
    issuer: "BACKYRD_SERVER_SUBJECT_AUTHORITY_REGISTRY" as const,
  };
  return FounderLiveSubjectAuthoritySchema.parse({ ...body, authorityHash: contentHash(body) });
}

export function createFounderLiveRepositoryTrust(records: readonly FounderLiveSubjectAuthority[], verifiedAt = "2026-09-17T12:00:00.000Z"): FounderLiveProjectionTrustContext {
  const map = new Map(records.map((record) => [record.authorityRecordId, record]));
  if (map.size !== records.length) throw new ContractValidationError("$.authorityRecords", "duplicate subject authority record id");
  return {
    verifiedAt,
    getRelease: (id) => id === FOUNDER_LIVE_PROJECTION_RELEASE.releaseId ? FOUNDER_LIVE_PROJECTION_RELEASE : null,
    getTrustAnchor: (id) => id === FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR.anchorId ? FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR : null,
    getFounderSlot: (id) => id === FOUNDER_LIVE_SUBJECT_SLOT.slotId ? FOUNDER_LIVE_SUBJECT_SLOT : null,
    getSubjectAuthority: (id) => map.get(id) ?? null,
  };
}

function verifyRelease(trust: FounderLiveProjectionTrustContext): void {
  if (!equal(trust.getRelease(FOUNDER_LIVE_PROJECTION_RELEASE.releaseId), FOUNDER_LIVE_PROJECTION_RELEASE)
    || !equal(trust.getTrustAnchor(FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR.anchorId), FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR)
    || !equal(trust.getFounderSlot(FOUNDER_LIVE_SUBJECT_SLOT.slotId), FOUNDER_LIVE_SUBJECT_SLOT)) {
    throw new ContractValidationError("$.trust", "founder live release is not independently accepted");
  }
  if (Date.parse(trust.verifiedAt) < Date.parse(FOUNDER_LIVE_PROJECTION_RELEASE.validFrom)
    || Date.parse(trust.verifiedAt) > Date.parse(FOUNDER_LIVE_PROJECTION_RELEASE.validUntil)) {
    throw new ContractValidationError("$.trust.verifiedAt", "founder live release is outside its validity interval");
  }
  if (Object.entries(FOUNDER_LIVE_PROJECTION_FLAGS).some(([name, value]) => name === "killSwitch" ? value !== "FORCED_OFF" : value !== false)) {
    throw new ContractValidationError("$.release.flags", "every shipped founder live capability must remain off");
  }
}

export function createFounderLiveProjectionInvocation(input: {
  readonly invocationId: string;
  readonly authorityRecordId: string;
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly environment: FounderLiveEnvironment;
  readonly sessionBindingHash: string;
}): FounderLiveProjectionInvocation {
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveProjectionInvocation,
    invocationId: input.invocationId,
    authorityRecordId: input.authorityRecordId,
    purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION" as const,
    environment: input.environment,
    requestHash: founderLiveRequestHash(input),
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    sessionBindingHash: input.sessionBindingHash,
    releaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
    productionAuthorized: false as const,
    persistenceAuthorized: false as const,
    writebackAuthorized: false as const,
    rankingAuthorized: false as const,
    eligibilityAuthorized: false as const,
  };
  return FounderLiveProjectionInvocationSchema.parse({ ...body, invocationHash: contentHash(body) });
}

function verifyAuthority(input: {
  readonly invocation: FounderLiveProjectionInvocation;
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly currentSessionBindingHash: string;
  readonly trust: FounderLiveProjectionTrustContext;
}): FounderLiveSubjectAuthority {
  verifyRelease(input.trust);
  const authority = FounderLiveSubjectAuthoritySchema.parse(input.trust.getSubjectAuthority(input.invocation.authorityRecordId));
  if (contentHash(without(authority as unknown as Record<string, unknown>, "authorityHash")) !== authority.authorityHash) throw new ContractValidationError("$.authorityHash", "subject authority hash mismatch");
  if (authority.acceptedReleaseHash !== FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash
    || authority.acceptedSlotHash !== FOUNDER_LIVE_SUBJECT_SLOT.slotHash
    || authority.boundUserId !== input.request.actor.userId
    || authority.subjectBindingHash !== input.request.actor.subjectBindingHash
    || authority.sessionBindingHash !== input.currentSessionBindingHash
    || authority.consentHash !== contentHash(input.consent)
    || authority.acceptedRequestHash !== input.invocation.requestHash
    || authority.lifecycle !== input.lifecycle
    || authority.environment !== input.invocation.environment) throw new ContractValidationError("$.authority", "subject authority binding mismatch");
  if (Date.parse(input.trust.verifiedAt) < Date.parse(authority.validFrom) || Date.parse(input.trust.verifiedAt) > Date.parse(authority.validUntil)) throw new ContractValidationError("$.authority", "subject authority expired");
  return authority;
}

function unavailable(reasonCode: FounderLiveUnavailableCode, retryable = false): FounderLiveProjectionOutcome {
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveProjectionOutcome,
    status: "UNAVAILABLE" as const,
    reasonCode,
    retryable,
    personalDataIncluded: false as const,
    detailsIncluded: false as const,
    productionAuthorized: false as const,
  };
  return FounderLiveProjectionOutcomeSchema.parse({ ...body, outcomeHash: contentHash(body) });
}

export interface FounderLiveProjectionInput {
  readonly configuration: unknown;
  readonly invocation: unknown;
  readonly request: unknown;
  readonly consent: unknown;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly currentSessionBindingHash: string;
  readonly syntheticEvents: readonly unknown[];
  readonly trust: FounderLiveProjectionTrustContext;
  readonly darkProjectionAuthorityRecordId: string;
  readonly darkProjectionTrust: DarkProjectionTrustContext;
  readonly now: string;
  /** Client user_metadata is accepted as transport input only to reject it as authority. */
  readonly clientUserMetadata?: unknown;
}

/** Server-side boundary. It returns a minimized canonical projection or a non-personal stable error. */
export function consumeFounderLiveProjection(input: FounderLiveProjectionInput): FounderLiveProjectionOutcome {
  const mode = resolveFounderLiveRuntimeMode(input.configuration);
  if (mode === "OFF" || mode === "EMERGENCY_OFF") return unavailable("RUNTIME_OFF");
  let request: RelevantUserProjectionRequest;
  let consent: ConsentEnvelope;
  let invocation: FounderLiveProjectionInvocation;
  try {
    request = RelevantUserProjectionRequestSchema.parse(input.request);
    consent = parseConsentEnvelope(input.consent);
    invocation = FounderLiveProjectionInvocationSchema.parse(input.invocation);
  } catch {
    return unavailable("AUTHORITY_DENIED");
  }
  if (request.killSwitch) return unavailable("KILL_SWITCH");
  if (input.lifecycle !== "ACTIVE") return unavailable("LIFECYCLE_BLOCKED");
  if (consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) return unavailable("NO_CONSENT");
  if (invocation.sessionBindingHash !== input.currentSessionBindingHash) return unavailable("SESSION_CHANGED", true);
  if (input.clientUserMetadata !== undefined) return unavailable("AUTHORITY_DENIED");
  try {
    if (contentHash(without(invocation as unknown as Record<string, unknown>, "invocationHash")) !== invocation.invocationHash
      || invocation.releaseHash !== FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash
      || invocation.consentHash !== contentHash(consent)
      || invocation.requestHash !== founderLiveRequestHash({ request, consent, environment: invocation.environment, sessionBindingHash: input.currentSessionBindingHash })) {
      return unavailable("AUTHORITY_DENIED");
    }
    verifyAuthority({ invocation, request, consent, lifecycle: input.lifecycle, currentSessionBindingHash: input.currentSessionBindingHash, trust: input.trust });
    const result = runDarkProjectionRuntime({
      configuration: "LOCAL_SYNTHETIC_TEST",
      authorityRecordId: input.darkProjectionAuthorityRecordId,
      consent,
      lifecycle: input.lifecycle,
      request,
      events: input.syntheticEvents,
      trust: input.darkProjectionTrust,
      now: input.now,
    });
    if (!result.projection) return unavailable("PROJECTION_NOT_AVAILABLE", true);
    const projection = parseRelevantUserProjection(result.projection, request);
    const serialized = JSON.stringify(projection);
    for (const forbidden of ["\"ledger\"", "\"rawEvents\"", "\"rawText\"", "\"evidence\"", "\"reviewText\"", "\"preciseLocation\"", "\"ownerTier\"", "\"payment\"", "\"advertising\""]) {
      if (serialized.includes(forbidden)) return unavailable("PROJECTION_NOT_AVAILABLE");
    }
    const body = {
      contractVersion: CONTRACT_VERSIONS.founderLiveProjectionOutcome,
      status: "AVAILABLE" as const,
      environment: invocation.environment,
      projection,
      persistenceAuthorized: false as const,
      writebackAuthorized: false as const,
      rankingAuthorized: false as const,
      eligibilityAuthorized: false as const,
      productionAuthorized: false as const,
    };
    return FounderLiveProjectionOutcomeSchema.parse({ ...body, outcomeHash: contentHash(body) });
  } catch {
    return unavailable("AUTHORITY_DENIED");
  }
}

export const FOUNDER_LIVE_PIPELINE_TOPOLOGY = Object.freeze({
  stages: [
    "MOBILE_EVENT",
    "CONSENT_PURPOSE_GATE",
    "APPEND_ONLY_EVIDENCE",
    "DEDUPE_CORRECTIONS",
    "FULL_INCREMENTAL_PROJECTION",
    "RELEVANT_USER_PROJECTION",
    "DECISION_CONSUMER",
  ] as const,
  mobileEventAdapterRegistered: false as const,
  evidencePersistenceRegistered: false as const,
  writebackPortRegistered: false as const,
  decisionConsumesRawEvents: false as const,
  decisionPort: CONTRACT_VERSIONS.projection,
  productionAuthorized: false as const,
});

export const FOUNDER_LIVE_NO_WRITE_PROOF = Object.freeze({
  proofId: "backyrd-user-intelligence-founder-live-no-write-1",
  predecessorProofHash: INTERNAL_PROJECTION_NO_WRITE_PROOF.proofHash,
  databaseClientDependency: false as const,
  networkClientDependency: false as const,
  persistencePortDependency: false as const,
  eventIngestionAdapterRegistered: false as const,
  productConsumerRegistered: false as const,
  writebackPortRegistered: false as const,
  privacyExportReachableFromDecisionOrMobile: false as const,
  productOutputsPossible: false as const,
  proofHash: contentHash({
    predecessorProofHash: INTERNAL_PROJECTION_NO_WRITE_PROOF.proofHash,
    databaseClientDependency: false,
    networkClientDependency: false,
    persistencePortDependency: false,
    eventIngestionAdapterRegistered: false,
    productConsumerRegistered: false,
    writebackPortRegistered: false,
    privacyExportReachableFromDecisionOrMobile: false,
    productOutputsPossible: false,
  }),
});

export const FOUNDER_LIVE_RETENTION_TEMPLATE = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.founderLiveRetentionDecision,
  templateId: "backyrd-user-intelligence-founder-live-retention-1",
  status: "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL" as const,
  productionAuthorized: false as const,
  defaultsForbidden: true as const,
  classes: [
    { dataClass: "SERVER_SUBJECT_AUTHORITY", personal: true, action: "DELETE", duration: null },
    { dataClass: "CONSENT_AND_SESSION_BINDING", personal: true, action: "DELETE", duration: null },
    { dataClass: "EPHEMERAL_RELEVANT_USER_PROJECTION", personal: true, action: "DELETE", duration: null },
    { dataClass: "PRIVACY_LEGAL_EXPORT", personal: true, action: "LEGAL_PROCESS_ONLY", duration: null },
    { dataClass: "NON_PERSONAL_RELEASE_EVIDENCE", personal: false, action: "RETAIN_NON_PERSONAL_ONLY", duration: null },
  ] as const,
  requiredApprovals: ["FOUNDER", "CTO", "LEGAL"] as const,
  prohibitedFallbacks: ["FIXTURE_DURATION", "INFINITE_RETENTION", "SOURCE_CODE_DEFAULT", "CLIENT_SELECTED_DURATION"] as const,
});
export const FOUNDER_LIVE_RETENTION_TEMPLATE_HASH = contentHash(FOUNDER_LIVE_RETENTION_TEMPLATE);

export const FounderLiveRehearsalSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveProjectionRehearsal),
  releaseHash: sha256,
  offReason: schema.literal("RUNTIME_OFF"),
  testOnProjectionHash: sha256,
  emergencyOffReason: schema.literal("RUNTIME_OFF"),
  postEmergencyOffReason: schema.literal("RUNTIME_OFF"),
  databaseWrites: schema.literal(0),
  networkCalls: schema.literal(0),
  persistenceWrites: schema.literal(0),
  productOutputs: schema.literal(0),
  cacheEntriesAfterEmergencyOff: schema.literal(0),
  rehearsalHash: sha256,
});
export type FounderLiveRehearsal = Infer<typeof FounderLiveRehearsalSchema>;

export function rehearseFounderLiveProjection(input: Omit<FounderLiveProjectionInput, "configuration">): FounderLiveRehearsal {
  const off = consumeFounderLiveProjection({ ...input, configuration: undefined });
  const on = consumeFounderLiveProjection({ ...input, configuration: FounderLiveProjectionInvocationSchema.parse(input.invocation).environment });
  const emergency = consumeFounderLiveProjection({ ...input, configuration: "EMERGENCY_OFF" });
  const postEmergency = consumeFounderLiveProjection({ ...input, configuration: "EMERGENCY_OFF", syntheticEvents: [] });
  if (off.status !== "UNAVAILABLE" || off.reasonCode !== "RUNTIME_OFF" || on.status !== "AVAILABLE"
    || emergency.status !== "UNAVAILABLE" || emergency.reasonCode !== "RUNTIME_OFF"
    || postEmergency.status !== "UNAVAILABLE" || postEmergency.reasonCode !== "RUNTIME_OFF") {
    throw new ContractValidationError("$.rehearsal", "OFF to TEST-ON to emergency-OFF sequence failed");
  }
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveProjectionRehearsal,
    releaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
    offReason: "RUNTIME_OFF" as const,
    testOnProjectionHash: on.projection.projectionHash,
    emergencyOffReason: "RUNTIME_OFF" as const,
    postEmergencyOffReason: "RUNTIME_OFF" as const,
    databaseWrites: 0 as const,
    networkCalls: 0 as const,
    persistenceWrites: 0 as const,
    productOutputs: 0 as const,
    cacheEntriesAfterEmergencyOff: 0 as const,
  };
  return FounderLiveRehearsalSchema.parse({ ...body, rehearsalHash: contentHash(body) });
}

export const FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH = contentHash({
  releaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
  trustAnchorHash: FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR.anchorHash,
  founderSlotHash: FOUNDER_LIVE_SUBJECT_SLOT.slotHash,
  noWriteProofHash: FOUNDER_LIVE_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: FOUNDER_LIVE_RETENTION_TEMPLATE_HASH,
  pipelineTopologyHash: contentHash(FOUNDER_LIVE_PIPELINE_TOPOLOGY),
});

export const FounderLivePostDeployEvidenceSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLivePostDeployEvidence),
  evidenceId: identifier,
  canonicalMainSha: gitSha,
  canonicalTreeSha: gitSha,
  artifactManifestHash: sha256,
  releaseHash: sha256,
  trustAnchorHash: sha256,
  founderSlotHash: sha256,
  noWriteProofHash: sha256,
  retentionTemplateHash: sha256,
  status: schema.literal("NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"),
  deploymentExecuted: schema.literal(false),
  founderSubjectConfigured: schema.literal(false),
  productionAuthorityPresent: schema.literal(false),
  executionAuthorized: schema.literal(false),
  evidenceHash: sha256,
});
export type FounderLivePostDeployEvidence = Infer<typeof FounderLivePostDeployEvidenceSchema>;

export function buildFounderLivePostDeployEvidence(): FounderLivePostDeployEvidence {
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLivePostDeployEvidence,
    evidenceId: "backyrd-user-intelligence-founder-live-not-executed-1",
    canonicalMainSha: FOUNDER_LIVE_PROJECTION_RELEASE.canonicalBaseSha,
    canonicalTreeSha: FOUNDER_LIVE_PROJECTION_RELEASE.canonicalBaseTree,
    artifactManifestHash: FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH,
    releaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
    trustAnchorHash: FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR.anchorHash,
    founderSlotHash: FOUNDER_LIVE_SUBJECT_SLOT.slotHash,
    noWriteProofHash: FOUNDER_LIVE_NO_WRITE_PROOF.proofHash,
    retentionTemplateHash: FOUNDER_LIVE_RETENTION_TEMPLATE_HASH,
    status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" as const,
    deploymentExecuted: false as const,
    founderSubjectConfigured: false as const,
    productionAuthorityPresent: false as const,
    executionAuthorized: false as const,
  };
  return FounderLivePostDeployEvidenceSchema.parse({ ...body, evidenceHash: contentHash(body) });
}

export function verifyFounderLivePostDeployEvidence(value: unknown): FounderLivePostDeployEvidence {
  const parsed = FounderLivePostDeployEvidenceSchema.parse(value);
  if (!equal(parsed, buildFounderLivePostDeployEvidence())) throw new ContractValidationError("$.postDeployEvidence", "founder live post-deploy evidence binding mismatch");
  return parsed;
}
