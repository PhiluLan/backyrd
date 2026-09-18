import { contentHash } from "./canonical.js";
import {
  ConsentEnvelope,
  CONTRACT_VERSIONS,
  RelevantUserProjection,
  RelevantUserProjectionRequest,
  RelevantUserProjectionRequestSchema,
  RelevantUserProjectionSchema,
  parseConsentEnvelope,
  parseRelevantUserProjection,
} from "./contracts.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const uuid = schema.string({ pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i });
const equal = (left: unknown, right: unknown): boolean => contentHash(left) === contentHash(right);
const without = (value: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

export const FOUNDER_LIVE_UUID_FLAGS = Object.freeze({
  USER_LEARNING_RUNTIME: false,
  projectionRuntimeActivated: false,
  projectionWritebackAuthorized: false,
  persistenceAuthorized: false,
  rankingAuthorized: false,
  eligibilityAuthorized: false,
  shadowTrafficAuthorized: false,
  productionAuthorized: false,
  killSwitch: "FORCED_OFF" as const,
});

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.founderLiveUuidAuthorityRelease,
  releaseId: "backyrd-founder-live-uuid-authority-closure-1",
  canonicalBaseSha: "a76910f6da5b407dae6d4022528e644613caf5d8",
  canonicalBaseTree: "730a405788ffc70e2c8ee32caadcf3b5a39bbb30",
  issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const,
  providerContractVersion: CONTRACT_VERSIONS.founderLiveUuidPrivateStoreEnvelope,
  privateProviderId: "BACKYRD_PRIVATE_FOUNDER_UUID_STORE" as const,
  secretReference: "BACKYRD_FOUNDER_LIVE_UUID_AUTHORITY_V1" as const,
  expectedMemberCount: 2 as const,
  identifiersPersistedInRepository: false as const,
  identifiersIncludedInReleaseEvidence: false as const,
  acceptedIdentifierKind: "SUPABASE_AUTH_USER_UUID" as const,
  emailAuthorityAccepted: false as const,
  userMetadataAuthorityAccepted: false as const,
  flags: FOUNDER_LIVE_UUID_FLAGS,
  validFrom: "2026-09-18T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z",
  productionAuthorized: false as const,
  runtimeActivated: false as const,
  executionAuthorized: false as const,
});
export const FOUNDER_LIVE_UUID_AUTHORITY_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });

const anchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.founderLiveUuidAuthorityTrustAnchor,
  anchorId: "backyrd-founder-live-uuid-authority-anchor-1",
  acceptedReleaseId: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseId,
  acceptedReleaseHash: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseHash,
  acceptedPrivateProviderId: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.privateProviderId,
  acceptedProviderContractVersion: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.providerContractVersion,
  expectedMemberCount: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.expectedMemberCount,
  issuer: "BACKYRD_CTO_PRIVATE_IDENTITY_REGISTRY" as const,
  validFrom: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.validFrom,
  validUntil: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.validUntil,
  productionAuthorized: false as const,
});
export const FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR = Object.freeze({ ...anchorBody, anchorHash: contentHash(anchorBody) });

export const FounderLiveServerSessionSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveUuidServerSession),
  authUserId: uuid,
  sessionBindingHash: sha256,
  authenticationContextHash: sha256,
  issuer: schema.literal("SUPABASE_AUTH_SERVER"),
  authenticationMethod: schema.literal("SERVER_VERIFIED_JWT"),
  authenticated: schema.literal(true),
  anonymous: schema.literal(false),
  blocked: schema.boolean(),
  deleted: schema.boolean(),
  issuedAt: timestamp,
  expiresAt: timestamp,
  verifiedAt: timestamp,
});
export type FounderLiveServerSession = Infer<typeof FounderLiveServerSessionSchema>;

export const FounderLiveUuidPrivateRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveUuidPrivateRecord),
  recordId: identifier,
  authUserId: uuid,
  status: schema.enum(["ACTIVE", "BLOCKED", "DELETED", "REVOKED"] as const),
  purpose: schema.literal("FOUNDER_LIVE_RELEVANT_USER_PROJECTION"),
  consentHash: sha256,
  consentState: schema.enum(["GRANTED", "DENIED", "WITHDRAWN"] as const),
  lifecycle: schema.enum(["ACTIVE", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
  acceptedSessionBindingHash: sha256,
  subjectBindingHash: sha256,
  cohortVersion: schema.literal("FOUNDER_LIVE_TWO_MEMBER_COHORT_V1"),
  validFrom: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_PRIVATE_IDENTITY_AUTHORITY"),
  recordHash: sha256,
});
export type FounderLiveUuidPrivateRecord = Infer<typeof FounderLiveUuidPrivateRecordSchema>;

export const FounderLiveUuidPrivateStoreEnvelopeSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveUuidPrivateStoreEnvelope),
  providerId: schema.literal("BACKYRD_PRIVATE_FOUNDER_UUID_STORE"),
  cohortVersion: schema.literal("FOUNDER_LIVE_TWO_MEMBER_COHORT_V1"),
  configuredMemberCount: schema.literal(2),
  records: schema.array(FounderLiveUuidPrivateRecordSchema, { min: 2, max: 2 }),
  productionAuthorized: schema.literal(false),
  runtimeActivated: schema.literal(false),
  envelopeHash: sha256,
});
export type FounderLiveUuidPrivateStoreEnvelope = Infer<typeof FounderLiveUuidPrivateStoreEnvelopeSchema>;

export interface FounderLivePrivateUuidProvider {
  readonly contractVersion: typeof CONTRACT_VERSIONS.founderLiveUuidPrivateStoreEnvelope;
  readonly providerId: "BACKYRD_PRIVATE_FOUNDER_UUID_STORE";
  readonly cohortVersion: "FOUNDER_LIVE_TWO_MEMBER_COHORT_V1";
  configuredMemberCount(): number;
  findByAuthUserId(authUserId: string): unknown;
  providerEnvelopeHash(): string;
}

export interface FounderLiveUuidExternalTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  acceptsPrivateProviderEnvelopeHash(hash: string): boolean;
  acceptsPrivateRecordHash(hash: string): boolean;
  acceptsPrivacyLegalAuthorityHash(hash: string): boolean;
}

/**
 * Server-only adapter. The returned provider deliberately exposes no enumeration API.
 * Callers must load the JSON through a secret/private-store facility and must never log it.
 */
export function createFounderLivePrivateUuidProvider(loadSecret: () => string): FounderLivePrivateUuidProvider {
  let raw: unknown;
  try { raw = JSON.parse(loadSecret()); }
  catch { throw new ContractValidationError("$.privateStore", "private UUID authority secret is unavailable or invalid"); }
  const envelope = FounderLiveUuidPrivateStoreEnvelopeSchema.parse(raw);
  if (contentHash(without(envelope as unknown as Record<string, unknown>, "envelopeHash")) !== envelope.envelopeHash) {
    throw new ContractValidationError("$.privateStore.envelopeHash", "private provider envelope hash mismatch");
  }
  const ids = new Set(envelope.records.map((record) => record.authUserId));
  const recordIds = new Set(envelope.records.map((record) => record.recordId));
  const hashes = new Set(envelope.records.map((record) => record.recordHash));
  if (ids.size !== 2 || recordIds.size !== 2 || hashes.size !== 2) throw new ContractValidationError("$.privateStore.records", "private founder UUID records must be unique");
  for (const record of envelope.records) {
    if (contentHash(without(record as unknown as Record<string, unknown>, "recordHash")) !== record.recordHash) {
      throw new ContractValidationError("$.privateStore.records", "private founder UUID record hash mismatch");
    }
  }
  const byUser = new Map(envelope.records.map((record) => [record.authUserId, record]));
  return Object.freeze({
    contractVersion: envelope.contractVersion,
    providerId: envelope.providerId,
    cohortVersion: envelope.cohortVersion,
    configuredMemberCount: () => envelope.configuredMemberCount,
    findByAuthUserId: (authUserId: string) => byUser.get(authUserId) ?? null,
    providerEnvelopeHash: () => envelope.envelopeHash,
  });
}

export const FounderLiveUuidCapabilitySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveUuidCapability),
  status: schema.literal("AUTHORIZED_READ_ONLY"),
  purpose: schema.literal("FOUNDER_LIVE_RELEVANT_USER_PROJECTION"),
  subjectBindingHash: sha256,
  sessionBindingHash: sha256,
  consentHash: sha256,
  authorityRecordHash: sha256,
  releaseHash: sha256,
  projectionReadAuthorized: schema.literal(true),
  learningAuthorized: schema.literal(false),
  persistenceAuthorized: schema.literal(false),
  writebackAuthorized: schema.literal(false),
  rankingAuthorized: schema.literal(false),
  eligibilityAuthorized: schema.literal(false),
  shadowTrafficAuthorized: schema.literal(false),
  productionAuthorized: schema.literal(false),
  capabilityHash: sha256,
});
export type FounderLiveUuidCapability = Infer<typeof FounderLiveUuidCapabilitySchema>;

const DENIAL_CODES = [
  "RUNTIME_OFF", "AUTHORITY_DENIED", "SESSION_EXPIRED", "SESSION_REVOKED", "CONSENT_BLOCKED",
  "LIFECYCLE_BLOCKED", "EMERGENCY_OFF",
] as const;
export const FounderLiveUuidDenialSchema = schema.object({
  status: schema.literal("DENIED"),
  reasonCode: schema.enum(DENIAL_CODES),
  personalDataIncluded: schema.literal(false),
  retryable: schema.boolean(),
  productionAuthorized: schema.literal(false),
  denialHash: sha256,
});
export type FounderLiveUuidDenial = Infer<typeof FounderLiveUuidDenialSchema>;
export type FounderLiveUuidAuthorization = FounderLiveUuidCapability | FounderLiveUuidDenial;

function denied(reasonCode: typeof DENIAL_CODES[number], retryable = false): FounderLiveUuidDenial {
  const body = { status: "DENIED" as const, reasonCode, personalDataIncluded: false as const, retryable, productionAuthorized: false as const };
  return FounderLiveUuidDenialSchema.parse({ ...body, denialHash: contentHash(body) });
}

function verifyExternalRelease(trust: FounderLiveUuidExternalTrustContext): boolean {
  if (!equal(trust.getRelease(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseId), FOUNDER_LIVE_UUID_AUTHORITY_RELEASE)) return false;
  if (!equal(trust.getTrustAnchor(FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR.anchorId), FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR)) return false;
  if (Date.parse(trust.verifiedAt) < Date.parse(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.validFrom)
    || Date.parse(trust.verifiedAt) > Date.parse(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.validUntil)) return false;
  return Object.entries(FOUNDER_LIVE_UUID_FLAGS).every(([name, value]) => name === "killSwitch" ? value === "FORCED_OFF" : value === false);
}

export function authorizeFounderLiveUuidSession(input: {
  readonly mode: unknown;
  readonly session: unknown;
  readonly request: unknown;
  readonly consent: unknown;
  readonly lifecycle: unknown;
  readonly provider: FounderLivePrivateUuidProvider;
  readonly trust: FounderLiveUuidExternalTrustContext;
}): FounderLiveUuidAuthorization {
  if (input.mode === "EMERGENCY_OFF") return denied("EMERGENCY_OFF");
  if (input.mode !== "LOCAL_TEST" && input.mode !== "PROD_LIKE_TEST") return denied("RUNTIME_OFF");
  let session: FounderLiveServerSession;
  let request: RelevantUserProjectionRequest;
  let consent: ConsentEnvelope;
  try {
    session = FounderLiveServerSessionSchema.parse(input.session);
    request = RelevantUserProjectionRequestSchema.parse(input.request);
    consent = parseConsentEnvelope(input.consent);
  } catch { return denied("AUTHORITY_DENIED"); }
  if (!verifyExternalRelease(input.trust)
    || input.provider.contractVersion !== FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.providerContractVersion
    || input.provider.providerId !== FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.privateProviderId
    || input.provider.cohortVersion !== "FOUNDER_LIVE_TWO_MEMBER_COHORT_V1"
    || input.provider.configuredMemberCount() !== 2
    || !input.trust.acceptsPrivateProviderEnvelopeHash(input.provider.providerEnvelopeHash())) return denied("AUTHORITY_DENIED");
  if (session.blocked || session.deleted) return denied("SESSION_REVOKED");
  if (Date.parse(session.verifiedAt) < Date.parse(session.issuedAt) || Date.parse(session.verifiedAt) >= Date.parse(session.expiresAt)) return denied("SESSION_EXPIRED", true);
  if (input.lifecycle !== "ACTIVE") return denied("LIFECYCLE_BLOCKED");
  if (consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) return denied("CONSENT_BLOCKED");
  let record: FounderLiveUuidPrivateRecord;
  try { record = FounderLiveUuidPrivateRecordSchema.parse(input.provider.findByAuthUserId(session.authUserId)); }
  catch { return denied("AUTHORITY_DENIED"); }
  if (contentHash(without(record as unknown as Record<string, unknown>, "recordHash")) !== record.recordHash
    || !input.trust.acceptsPrivateRecordHash(record.recordHash)
    || record.authUserId !== session.authUserId
    || request.actor.userId !== session.authUserId
    || request.actor.boundBy !== "SERVER"
    || request.actor.authenticationContextHash !== session.authenticationContextHash
    || request.actor.subjectBindingHash !== record.subjectBindingHash
    || record.acceptedSessionBindingHash !== session.sessionBindingHash
    || record.consentHash !== contentHash(consent)
    || record.consentState !== "GRANTED"
    || record.lifecycle !== "ACTIVE"
    || record.status !== "ACTIVE"
    || Date.parse(input.trust.verifiedAt) < Date.parse(record.validFrom)
    || Date.parse(input.trust.verifiedAt) > Date.parse(record.validUntil)) return denied("AUTHORITY_DENIED");
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveUuidCapability,
    status: "AUTHORIZED_READ_ONLY" as const,
    purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION" as const,
    subjectBindingHash: record.subjectBindingHash,
    sessionBindingHash: record.acceptedSessionBindingHash,
    consentHash: record.consentHash,
    authorityRecordHash: record.recordHash,
    releaseHash: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseHash,
    projectionReadAuthorized: true as const,
    learningAuthorized: false as const,
    persistenceAuthorized: false as const,
    writebackAuthorized: false as const,
    rankingAuthorized: false as const,
    eligibilityAuthorized: false as const,
    shadowTrafficAuthorized: false as const,
    productionAuthorized: false as const,
  };
  return FounderLiveUuidCapabilitySchema.parse({ ...body, capabilityHash: contentHash(body) });
}

export const FounderLiveUuidProjectionHandoffSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveUuidProjectionHandoff),
  projection: RelevantUserProjectionSchema,
  capabilityHash: sha256,
  readOnly: schema.literal(true),
  learningAuthorized: schema.literal(false),
  persistenceAuthorized: schema.literal(false),
  writebackAuthorized: schema.literal(false),
  rankingAuthorized: schema.literal(false),
  eligibilityAuthorized: schema.literal(false),
  productionAuthorized: schema.literal(false),
  handoffHash: sha256,
});

/** Only the canonical minimized projection crosses this boundary. */
export function createFounderLiveUuidProjectionHandoff(input: {
  readonly capability: unknown;
  readonly request: RelevantUserProjectionRequest;
  readonly projection: RelevantUserProjection;
}): Infer<typeof FounderLiveUuidProjectionHandoffSchema> {
  const capability = FounderLiveUuidCapabilitySchema.parse(input.capability);
  if (contentHash(without(capability as unknown as Record<string, unknown>, "capabilityHash")) !== capability.capabilityHash) throw new ContractValidationError("$.capability", "capability hash mismatch");
  const request = RelevantUserProjectionRequestSchema.parse(input.request);
  if (request.actor.subjectBindingHash !== capability.subjectBindingHash) throw new ContractValidationError("$.request.actor", "subject binding mismatch");
  const projection = parseRelevantUserProjection(input.projection, request);
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveUuidProjectionHandoff,
    projection,
    capabilityHash: capability.capabilityHash,
    readOnly: true as const,
    learningAuthorized: false as const,
    persistenceAuthorized: false as const,
    writebackAuthorized: false as const,
    rankingAuthorized: false as const,
    eligibilityAuthorized: false as const,
    productionAuthorized: false as const,
  };
  return FounderLiveUuidProjectionHandoffSchema.parse({ ...body, handoffHash: contentHash(body) });
}

export const FounderLivePrivacyLegalAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.founderLiveUuidPrivacyLegalAuthority),
  authorityRecordId: identifier,
  subjectBindingHash: sha256,
  action: schema.enum(["EXPORT", "WITHDRAW", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
  issuer: schema.literal("BACKYRD_PRIVACY_LEGAL_AUTHORITY"),
  validFrom: timestamp,
  validUntil: timestamp,
  authorityHash: sha256,
});

export function authorizeFounderLivePrivacyLegalAction(input: {
  readonly authority: unknown;
  readonly subjectBindingHash: string;
  readonly action: "EXPORT" | "WITHDRAW" | "FULL_RESET" | "ACCOUNT_ERASURE";
  readonly trust: FounderLiveUuidExternalTrustContext;
}): Infer<typeof FounderLivePrivacyLegalAuthoritySchema> {
  const authority = FounderLivePrivacyLegalAuthoritySchema.parse(input.authority);
  if (contentHash(without(authority as unknown as Record<string, unknown>, "authorityHash")) !== authority.authorityHash
    || !input.trust.acceptsPrivacyLegalAuthorityHash(authority.authorityHash)
    || authority.subjectBindingHash !== sha256.parse(input.subjectBindingHash)
    || authority.action !== input.action
    || Date.parse(input.trust.verifiedAt) < Date.parse(authority.validFrom)
    || Date.parse(input.trust.verifiedAt) > Date.parse(authority.validUntil)) {
    throw new ContractValidationError("$.privacyLegalAuthority", "privacy/legal authority denied");
  }
  return authority;
}

export const FOUNDER_LIVE_UUID_NO_WRITE_PROOF = Object.freeze({
  contractVersion: "backyrd.user-intelligence.founder-live-uuid-no-write-proof@1.0",
  privateProviderReadOnly: true as const,
  providerEnumerationExposed: false as const,
  databaseClientDependency: false as const,
  networkClientDependency: false as const,
  eventIngestionRegistered: false as const,
  learningPortRegistered: false as const,
  persistencePortRegistered: false as const,
  writebackPortRegistered: false as const,
  privacyLegalPortExposedToProduct: false as const,
  productOutputRegistered: false as const,
  executionAuthorized: false as const,
  proofHash: contentHash({
    privateProviderReadOnly: true,
    providerEnumerationExposed: false,
    databaseClientDependency: false,
    networkClientDependency: false,
    eventIngestionRegistered: false,
    learningPortRegistered: false,
    persistencePortRegistered: false,
    writebackPortRegistered: false,
    privacyLegalPortExposedToProduct: false,
    productOutputRegistered: false,
    executionAuthorized: false,
  }),
});

export const FOUNDER_LIVE_UUID_RETENTION_TEMPLATE = Object.freeze({
  contractVersion: "backyrd.user-intelligence.founder-live-uuid-retention@1.0",
  status: "NOT_CONFIGURED" as const,
  sourceCodeDefaultsForbidden: true as const,
  concreteDurations: null,
  personalStores: ["PRIVATE_UUID_AUTHORITY", "SESSION_BINDING", "CONSENT_BINDING", "PROJECTION_CACHE", "REBUILD_MATERIAL"] as const,
  withdrawalEffect: "BLOCK_AND_DELETE_PERSONALIZATION" as const,
  resetEffect: "DELETE_MODEL_AND_REBUILD_MATERIAL" as const,
  erasureEffect: "DELETE_ALL_PERSONAL_STORES" as const,
  nonPersonalReleaseEvidenceMayRemain: true as const,
  requiredApprovals: ["FOUNDER", "CTO", "LEGAL"] as const,
  productionAuthorized: false as const,
});
export const FOUNDER_LIVE_UUID_RETENTION_TEMPLATE_HASH = contentHash(FOUNDER_LIVE_UUID_RETENTION_TEMPLATE);

export const FOUNDER_LIVE_UUID_ARTIFACT_MANIFEST_HASH = contentHash({
  releaseHash: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseHash,
  trustAnchorHash: FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR.anchorHash,
  noWriteProofHash: FOUNDER_LIVE_UUID_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: FOUNDER_LIVE_UUID_RETENTION_TEMPLATE_HASH,
});
