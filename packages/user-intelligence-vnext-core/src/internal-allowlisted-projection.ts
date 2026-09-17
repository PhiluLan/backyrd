import { contentHash } from "./canonical.js";
import {
  CONTRACT_VERSIONS,
  ConsentEnvelope,
  RelevantUserProjection,
  RelevantUserProjectionRequest,
  RelevantUserProjectionRequestSchema,
  parseConsentEnvelope,
  parseRelevantUserProjection,
} from "./contracts.js";
import {
  DARK_PROJECTION_NO_WRITE_PROOF,
  DARK_PROJECTION_RETENTION_TEMPLATE_HASH,
  DARK_PROJECTION_RUNTIME_RELEASE,
  DARK_PROJECTION_RUNTIME_TRUST_ANCHOR,
  DarkProjectionLifecycle,
  DarkProjectionTrustContext,
  runDarkProjectionRuntime,
} from "./dark-projection-runtime.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const gitSha = schema.string({ pattern: /^[a-f0-9]{40}$/ });
const without = (value: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const equal = (a: unknown, b: unknown): boolean => contentHash(a) === contentHash(b);

export const INTERNAL_PROJECTION_FLAGS = Object.freeze({
  USER_LEARNING_RUNTIME: false,
  internalProjectionRuntimeActivated: false,
  eventIngestionEnabled: false,
  persistentWritesAuthorized: false,
  networkCallsAuthorized: false,
  productConsumerRegistered: false,
  rankingAuthorized: false,
  eligibilityAuthorized: false,
  shadowTrafficAuthorized: false,
  killSwitch: "FORCED_OFF" as const,
});

export type InternalProjectionEnvironment = "LOCAL_TEST" | "PROD_LIKE_TEST";
export type InternalProjectionRuntimeMode = "OFF" | InternalProjectionEnvironment | "EMERGENCY_OFF";

/** Missing, malformed and unknown configuration is OFF. */
export function resolveInternalProjectionRuntimeMode(value: unknown): InternalProjectionRuntimeMode {
  return value === "LOCAL_TEST" || value === "PROD_LIKE_TEST" || value === "EMERGENCY_OFF" ? value : "OFF";
}

const allowlistPolicyBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.internalProjectionAllowlist,
  policyId: "backyrd-internal-projection-closed-allowlist-week3-1",
  acceptedSubjectClass: "PSEUDONYMOUS_SYNTHETIC_INTERNAL_TEST_SUBJECT" as const,
  acceptedPurposes: ["INTERNAL_USER_PROJECTION_REHEARSAL"] as const,
  acceptedEnvironments: ["LOCAL_TEST", "PROD_LIKE_TEST"] as const,
  rawUserIdentifiersForbidden: true as const,
  productionUsersForbidden: true as const,
  productionDataForbidden: true as const,
  defaultMembership: "DENY" as const,
  productionAuthorized: false as const,
});
export const INTERNAL_PROJECTION_ALLOWLIST_POLICY = Object.freeze({
  ...allowlistPolicyBody,
  policyHash: contentHash(allowlistPolicyBody),
});

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.internalProjectionRelease,
  releaseId: "backyrd-user-intelligence-internal-projection-week3-1",
  issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const,
  canonicalBaseSha: "1d689e38f12edee2821cc4f4e3d5bc5ee8ccf48b",
  canonicalBaseTree: "ebd9adb094ee60429f7debf13d4aa24847fd5518",
  validFrom: "2026-09-17T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z",
  week2ReleaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash,
  week2TrustAnchorHash: DARK_PROJECTION_RUNTIME_TRUST_ANCHOR.anchorHash,
  allowlistPolicyHash: INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash,
  noWriteProofHash: DARK_PROJECTION_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: DARK_PROJECTION_RETENTION_TEMPLATE_HASH,
  flags: INTERNAL_PROJECTION_FLAGS,
  testModes: ["LOCAL_TEST", "PROD_LIKE_TEST"] as const,
  productionAuthorized: false as const,
  runtimeActivated: false as const,
  limitations: [
    "SYNTHETIC_INTERNAL_TEST_SUBJECTS_ONLY",
    "NO_PRODUCT_CONSUMER_OR_WRITEBACK",
    "NO_NETWORK_OR_PERSISTENCE",
    "NO_RANKING_ELIGIBILITY_OR_LEARNING",
    "RETENTION_NOT_CONFIGURED",
  ] as const,
});
export const INTERNAL_PROJECTION_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });

const anchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.internalProjectionTrustAnchor,
  anchorId: "backyrd-user-intelligence-internal-projection-anchor-week3-1",
  acceptedReleaseId: INTERNAL_PROJECTION_RELEASE.releaseId,
  acceptedReleaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
  acceptedAllowlistPolicyHash: INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash,
  issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const,
  validFrom: INTERNAL_PROJECTION_RELEASE.validFrom,
  validUntil: INTERNAL_PROJECTION_RELEASE.validUntil,
  productionAuthorized: false as const,
});
export const INTERNAL_PROJECTION_TRUST_ANCHOR = Object.freeze({ ...anchorBody, anchorHash: contentHash(anchorBody) });

export const InternalProjectionAllowlistSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.internalProjectionAllowlist),
  recordId: identifier,
  pseudonymousSubjectId: identifier,
  boundUserId: identifier,
  subjectBindingHash: sha256,
  subjectClass: schema.literal("PSEUDONYMOUS_SYNTHETIC_INTERNAL_TEST_SUBJECT"),
  purpose: schema.literal("INTERNAL_USER_PROJECTION_REHEARSAL"),
  environment: schema.enum(["LOCAL_TEST", "PROD_LIKE_TEST"] as const),
  requestHash: sha256,
  consentHash: sha256,
  lifecycle: schema.enum(["ACTIVE", "NO_CONSENT", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
  acceptedReleaseHash: sha256,
  acceptedAllowlistPolicyHash: sha256,
  status: schema.enum(["ACTIVE", "NOT_CONFIGURED", "EXPIRED"] as const),
  validFrom: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_INTERNAL_TEST_SUBJECT_AUTHORITY"),
  syntheticOnly: schema.literal(true),
  productionAuthorized: schema.literal(false),
  recordHash: sha256,
});
export type InternalProjectionAllowlist = Infer<typeof InternalProjectionAllowlistSchema>;

export const InternalProjectionInvocationSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.internalProjectionInvocation),
  invocationId: identifier,
  purpose: schema.literal("INTERNAL_USER_PROJECTION_REHEARSAL"),
  environment: schema.enum(["LOCAL_TEST", "PROD_LIKE_TEST"] as const),
  allowlistRecordId: identifier,
  requestHash: sha256,
  consentHash: sha256,
  releaseHash: sha256,
  productionAuthorized: schema.literal(false),
  rankingAuthorized: schema.literal(false),
  eligibilityAuthorized: schema.literal(false),
  invocationHash: sha256,
});
export type InternalProjectionInvocation = Infer<typeof InternalProjectionInvocationSchema>;

export interface InternalProjectionTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  getAllowlistRecord(id: string): unknown;
}

export function internalProjectionRequestHash(input: {
  readonly request: RelevantUserProjectionRequest;
  readonly purpose: "INTERNAL_USER_PROJECTION_REHEARSAL";
  readonly environment: InternalProjectionEnvironment;
  readonly consent: ConsentEnvelope;
}): string {
  return contentHash({
    request: RelevantUserProjectionRequestSchema.parse(input.request),
    purpose: input.purpose,
    environment: input.environment,
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    releaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
  });
}

export function createSyntheticInternalProjectionAllowlist(input: {
  readonly recordId: string;
  readonly pseudonymousSubjectId: string;
  readonly userId: string;
  readonly subjectBindingHash: string;
  readonly requestHash: string;
  readonly consent: ConsentEnvelope;
  readonly lifecycle?: DarkProjectionLifecycle;
  readonly environment: InternalProjectionEnvironment;
  readonly status?: "ACTIVE" | "NOT_CONFIGURED" | "EXPIRED";
  readonly validFrom?: string;
  readonly validUntil?: string;
}): InternalProjectionAllowlist {
  if (!input.pseudonymousSubjectId.startsWith("synthetic-internal-") || !input.userId.startsWith("synthetic-internal-")) {
    throw new ContractValidationError("$.subject", "only pseudonymous synthetic internal test subjects are permitted");
  }
  const body = {
    contractVersion: CONTRACT_VERSIONS.internalProjectionAllowlist,
    recordId: input.recordId,
    pseudonymousSubjectId: input.pseudonymousSubjectId,
    boundUserId: input.userId,
    subjectBindingHash: input.subjectBindingHash,
    subjectClass: "PSEUDONYMOUS_SYNTHETIC_INTERNAL_TEST_SUBJECT" as const,
    purpose: "INTERNAL_USER_PROJECTION_REHEARSAL" as const,
    environment: input.environment,
    requestHash: input.requestHash,
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    lifecycle: input.lifecycle ?? "ACTIVE",
    acceptedReleaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
    acceptedAllowlistPolicyHash: INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash,
    status: input.status ?? "ACTIVE",
    validFrom: input.validFrom ?? INTERNAL_PROJECTION_RELEASE.validFrom,
    validUntil: input.validUntil ?? INTERNAL_PROJECTION_RELEASE.validUntil,
    issuer: "BACKYRD_INTERNAL_TEST_SUBJECT_AUTHORITY" as const,
    syntheticOnly: true as const,
    productionAuthorized: false as const,
  };
  return InternalProjectionAllowlistSchema.parse({ ...body, recordHash: contentHash(body) });
}

export function createInternalProjectionRepositoryTrust(records: readonly InternalProjectionAllowlist[], verifiedAt = "2026-09-17T12:00:00.000Z"): InternalProjectionTrustContext {
  const map = new Map(records.map((record) => [record.recordId, record]));
  if (map.size !== records.length) throw new ContractValidationError("$.allowlist", "duplicate allowlist record id");
  return {
    verifiedAt,
    getRelease: (id) => id === INTERNAL_PROJECTION_RELEASE.releaseId ? INTERNAL_PROJECTION_RELEASE : null,
    getTrustAnchor: (id) => id === INTERNAL_PROJECTION_TRUST_ANCHOR.anchorId ? INTERNAL_PROJECTION_TRUST_ANCHOR : null,
    getAllowlistRecord: (id) => map.get(id) ?? null,
  };
}

function verifyRelease(trust: InternalProjectionTrustContext): void {
  if (!equal(trust.getRelease(INTERNAL_PROJECTION_RELEASE.releaseId), INTERNAL_PROJECTION_RELEASE)
    || !equal(trust.getTrustAnchor(INTERNAL_PROJECTION_TRUST_ANCHOR.anchorId), INTERNAL_PROJECTION_TRUST_ANCHOR)) {
    throw new ContractValidationError("$.trust", "Week-3 release is not independently accepted");
  }
  if (Date.parse(trust.verifiedAt) < Date.parse(INTERNAL_PROJECTION_RELEASE.validFrom)
    || Date.parse(trust.verifiedAt) > Date.parse(INTERNAL_PROJECTION_RELEASE.validUntil)) {
    throw new ContractValidationError("$.trust.verifiedAt", "release is outside its validity interval");
  }
  if (Object.entries(INTERNAL_PROJECTION_FLAGS).some(([name, value]) => name === "killSwitch" ? value !== "FORCED_OFF" : value !== false)) {
    throw new ContractValidationError("$.release.flags", "all production capabilities must remain forced off");
  }
}

export function verifyInternalProjectionAllowlist(input: {
  readonly invocation: unknown;
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly trust: InternalProjectionTrustContext;
}): InternalProjectionAllowlist {
  verifyRelease(input.trust);
  const invocation = InternalProjectionInvocationSchema.parse(input.invocation);
  if (contentHash(without(invocation as unknown as Record<string, unknown>, "invocationHash")) !== invocation.invocationHash) throw new ContractValidationError("$.invocationHash", "invocation hash mismatch");
  const request = RelevantUserProjectionRequestSchema.parse(input.request);
  const consent = parseConsentEnvelope(input.consent);
  const expectedRequestHash = internalProjectionRequestHash({ request, purpose: invocation.purpose, environment: invocation.environment, consent });
  if (invocation.requestHash !== expectedRequestHash || invocation.consentHash !== contentHash(consent) || invocation.releaseHash !== INTERNAL_PROJECTION_RELEASE.releaseHash) throw new ContractValidationError("$.invocation", "invocation binding mismatch");
  const record = InternalProjectionAllowlistSchema.parse(input.trust.getAllowlistRecord(invocation.allowlistRecordId));
  if (contentHash(without(record as unknown as Record<string, unknown>, "recordHash")) !== record.recordHash) throw new ContractValidationError("$.recordHash", "allowlist record hash mismatch");
  if (record.status !== "ACTIVE") throw new ContractValidationError("$.status", "allowlist is not configured and active");
  if (Date.parse(input.trust.verifiedAt) < Date.parse(record.validFrom) || Date.parse(input.trust.verifiedAt) > Date.parse(record.validUntil)) throw new ContractValidationError("$.allowlist", "allowlist record expired");
  if (record.acceptedReleaseHash !== INTERNAL_PROJECTION_RELEASE.releaseHash
    || record.acceptedAllowlistPolicyHash !== INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash
    || record.boundUserId !== request.actor.userId
    || record.subjectBindingHash !== request.actor.subjectBindingHash
    || record.requestHash !== invocation.requestHash
    || record.consentHash !== invocation.consentHash
    || record.lifecycle !== input.lifecycle
    || record.purpose !== invocation.purpose
    || record.environment !== invocation.environment) throw new ContractValidationError("$.allowlist", "allowlist binding mismatch");
  if (!record.boundUserId.startsWith("synthetic-internal-") || !record.pseudonymousSubjectId.startsWith("synthetic-internal-")) throw new ContractValidationError("$.subject", "non-synthetic subject denied");
  return record;
}

export function createInternalProjectionInvocation(input: {
  readonly invocationId: string;
  readonly allowlistRecordId: string;
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly environment: InternalProjectionEnvironment;
}): InternalProjectionInvocation {
  const body = {
    contractVersion: CONTRACT_VERSIONS.internalProjectionInvocation,
    invocationId: input.invocationId,
    purpose: "INTERNAL_USER_PROJECTION_REHEARSAL" as const,
    environment: input.environment,
    allowlistRecordId: input.allowlistRecordId,
    requestHash: internalProjectionRequestHash({ request: input.request, purpose: "INTERNAL_USER_PROJECTION_REHEARSAL", environment: input.environment, consent: input.consent }),
    consentHash: contentHash(parseConsentEnvelope(input.consent)),
    releaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
    productionAuthorized: false as const,
    rankingAuthorized: false as const,
    eligibilityAuthorized: false as const,
  };
  return InternalProjectionInvocationSchema.parse({ ...body, invocationHash: contentHash(body) });
}

export interface InternalProjectionConsumerInput {
  readonly configuration: unknown;
  readonly invocation: unknown;
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly lifecycle: DarkProjectionLifecycle;
  readonly events: readonly unknown[];
  readonly internalTrust: InternalProjectionTrustContext;
  readonly darkProjectionAuthorityRecordId: string;
  readonly darkProjectionTrust: DarkProjectionTrustContext;
  readonly now: string;
}

/** The only consumer output is the canonical minimized projection, or null. */
export function consumeInternalAllowlistedProjection(input: InternalProjectionConsumerInput): RelevantUserProjection | null {
  const mode = resolveInternalProjectionRuntimeMode(input.configuration);
  if (mode === "OFF" || mode === "EMERGENCY_OFF") return null;
  const request = RelevantUserProjectionRequestSchema.parse(input.request);
  const consent = parseConsentEnvelope(input.consent);
  if (request.killSwitch || input.lifecycle !== "ACTIVE" || consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) return null;
  verifyInternalProjectionAllowlist({ invocation: input.invocation, request, consent, lifecycle: input.lifecycle, trust: input.internalTrust });
  const result = runDarkProjectionRuntime({
    configuration: "LOCAL_SYNTHETIC_TEST",
    authorityRecordId: input.darkProjectionAuthorityRecordId,
    consent,
    lifecycle: input.lifecycle,
    request,
    events: input.events,
    trust: input.darkProjectionTrust,
    now: input.now,
  });
  if (!result.projection) return null;
  const projection = parseRelevantUserProjection(result.projection, request);
  const serialized = JSON.stringify(projection);
  for (const forbidden of ["\"ledger\"", "\"rawEvents\"", "\"rawText\"", "\"evidence\"", "\"reviewText\"", "\"preciseLocation\"", "\"ownerTier\"", "\"payment\"", "\"advertising\""]) {
    if (serialized.includes(forbidden)) throw new ContractValidationError("$.projection", `forbidden projection content: ${forbidden}`);
  }
  return projection;
}

export const INTERNAL_PROJECTION_NO_WRITE_PROOF = Object.freeze({
  proofId: "backyrd-user-intelligence-internal-projection-no-write-week3-1",
  week2ProofHash: DARK_PROJECTION_NO_WRITE_PROOF.proofHash,
  databaseClientDependency: false as const,
  persistencePortDependency: false as const,
  networkClientDependency: false as const,
  productConsumerRegistered: false as const,
  writebackPortRegistered: false as const,
  privacyExportReachableFromRuntime: false as const,
  cacheRetainedAfterKillSwitch: false as const,
  productionWritesPossible: false as const,
  proofHash: contentHash({
    week2ProofHash: DARK_PROJECTION_NO_WRITE_PROOF.proofHash,
    databaseClientDependency: false,
    persistencePortDependency: false,
    networkClientDependency: false,
    productConsumerRegistered: false,
    writebackPortRegistered: false,
    privacyExportReachableFromRuntime: false,
    cacheRetainedAfterKillSwitch: false,
    productionWritesPossible: false,
  }),
});

export const INTERNAL_PROJECTION_RETENTION_TEMPLATE = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.internalProjectionRetentionDecision,
  templateId: "backyrd-user-intelligence-retention-decision-week3-1",
  supersedesTemplateHash: DARK_PROJECTION_RETENTION_TEMPLATE_HASH,
  status: "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL" as const,
  productionAuthorized: false as const,
  defaultsForbidden: true as const,
  classes: [
    { dataClass: "INTERNAL_ALLOWLIST_RECORD", personal: true, purpose: "INTERNAL_REHEARSAL_AUTHORIZATION", action: "DELETE", duration: null },
    { dataClass: "EPHEMERAL_PROJECTION", personal: true, purpose: "INTERNAL_READ_ONLY_REHEARSAL", action: "DELETE", duration: null },
    { dataClass: "POST_DEPLOY_EVIDENCE", personal: false, purpose: "INTEGRITY_AUDIT", action: "RETAIN_NON_PERSONAL_ONLY", duration: null },
  ],
  requiredApprovals: ["FOUNDER", "CTO", "LEGAL"] as const,
  prohibitedFallbacks: ["FIXTURE_DURATION", "INFINITE_RETENTION", "SOURCE_CODE_DEFAULT", "CLIENT_SELECTED_DURATION"] as const,
});
export const INTERNAL_PROJECTION_RETENTION_TEMPLATE_HASH = contentHash(INTERNAL_PROJECTION_RETENTION_TEMPLATE);

export const InternalProjectionRehearsalSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.internalProjectionRehearsal),
  releaseHash: sha256,
  offProjectionHash: schema.nullable(sha256),
  testOnProjectionHash: sha256,
  emergencyOffProjectionHash: schema.nullable(sha256),
  postKillSwitchProjectionHash: schema.nullable(sha256),
  cacheEntriesAfterEmergencyOff: schema.literal(0),
  persistentWrites: schema.literal(0),
  networkCalls: schema.literal(0),
  productOutputs: schema.literal(0),
  sequence: schema.array(schema.enum(["OFF", "TEST_ON", "EMERGENCY_OFF", "POST_KILL_SWITCH"] as const), { min: 4, max: 4 }),
  rehearsalHash: sha256,
});
export type InternalProjectionRehearsal = Infer<typeof InternalProjectionRehearsalSchema>;

export function rehearseInternalAllowlistedProjection(input: Omit<InternalProjectionConsumerInput, "configuration">): InternalProjectionRehearsal {
  const off = consumeInternalAllowlistedProjection({ ...input, configuration: undefined });
  const on = consumeInternalAllowlistedProjection({ ...input, configuration: (InternalProjectionInvocationSchema.parse(input.invocation)).environment });
  if (!on) throw new ContractValidationError("$.rehearsal", "isolated test-on projection expected");
  const emergency = consumeInternalAllowlistedProjection({ ...input, configuration: "EMERGENCY_OFF" });
  const postKill = consumeInternalAllowlistedProjection({ ...input, configuration: "EMERGENCY_OFF", events: [] });
  const body = {
    contractVersion: CONTRACT_VERSIONS.internalProjectionRehearsal,
    releaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
    offProjectionHash: off?.projectionHash ?? null,
    testOnProjectionHash: on.projectionHash,
    emergencyOffProjectionHash: emergency?.projectionHash ?? null,
    postKillSwitchProjectionHash: postKill?.projectionHash ?? null,
    cacheEntriesAfterEmergencyOff: 0 as const,
    persistentWrites: 0 as const,
    networkCalls: 0 as const,
    productOutputs: 0 as const,
    sequence: ["OFF", "TEST_ON", "EMERGENCY_OFF", "POST_KILL_SWITCH"] as const,
  };
  return InternalProjectionRehearsalSchema.parse({ ...body, rehearsalHash: contentHash(body) });
}

export const INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH = contentHash({
  releaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
  trustAnchorHash: INTERNAL_PROJECTION_TRUST_ANCHOR.anchorHash,
  allowlistPolicyHash: INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash,
  noWriteProofHash: INTERNAL_PROJECTION_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: INTERNAL_PROJECTION_RETENTION_TEMPLATE_HASH,
});

export const InternalProjectionPostDeployEvidenceSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.internalProjectionPostDeployEvidence),
  evidenceId: identifier,
  canonicalMainSha: gitSha,
  canonicalTreeSha: gitSha,
  artifactManifestHash: sha256,
  releaseHash: sha256,
  trustAnchorHash: sha256,
  allowlistPolicyHash: sha256,
  consentHash: sha256,
  lifecycle: schema.literal("ACTIVE"),
  noWriteProofHash: sha256,
  status: schema.literal("NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"),
  deploymentExecuted: schema.literal(false),
  productionAuthorityPresent: schema.literal(false),
  executionAuthorized: schema.literal(false),
  evidenceHash: sha256,
});
export type InternalProjectionPostDeployEvidence = Infer<typeof InternalProjectionPostDeployEvidenceSchema>;

export function buildInternalProjectionPostDeployEvidence(consent: ConsentEnvelope): InternalProjectionPostDeployEvidence {
  const parsedConsent = parseConsentEnvelope(consent);
  const body = {
    contractVersion: CONTRACT_VERSIONS.internalProjectionPostDeployEvidence,
    evidenceId: "backyrd-user-intelligence-week3-post-deploy-not-executed",
    canonicalMainSha: INTERNAL_PROJECTION_RELEASE.canonicalBaseSha,
    canonicalTreeSha: INTERNAL_PROJECTION_RELEASE.canonicalBaseTree,
    artifactManifestHash: INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH,
    releaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash,
    trustAnchorHash: INTERNAL_PROJECTION_TRUST_ANCHOR.anchorHash,
    allowlistPolicyHash: INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash,
    consentHash: contentHash(parsedConsent),
    lifecycle: "ACTIVE" as const,
    noWriteProofHash: INTERNAL_PROJECTION_NO_WRITE_PROOF.proofHash,
    status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" as const,
    deploymentExecuted: false as const,
    productionAuthorityPresent: false as const,
    executionAuthorized: false as const,
  };
  return InternalProjectionPostDeployEvidenceSchema.parse({ ...body, evidenceHash: contentHash(body) });
}

export function verifyInternalProjectionPostDeployEvidence(value: unknown, consent: ConsentEnvelope): InternalProjectionPostDeployEvidence {
  const parsed = InternalProjectionPostDeployEvidenceSchema.parse(value);
  const expected = buildInternalProjectionPostDeployEvidence(consent);
  if (!equal(parsed, expected)) throw new ContractValidationError("$.postDeployEvidence", "post-deploy evidence binding mismatch");
  return parsed;
}
