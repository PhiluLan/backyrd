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
import {
  FounderLivePrivateUuidProvider,
  FounderLiveServerSessionSchema,
  FounderLiveUuidExternalTrustContext,
  authorizeFounderLiveUuidSession,
} from "./founder-live-uuid-authority.js";
import type { DecisionVNextUserProjectionPort } from "./ports.js";
import { ContractValidationError, Infer, schema, sha256, timestamp } from "./schema.js";

const without = (value: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const equal = (left: unknown, right: unknown): boolean => contentHash(left) === contentHash(right);

export const PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE = "FOUNDER_LIVE_RELEVANT_USER_PROJECTION" as const;

/**
 * Public project identity is represented only by this exact binding hash. The
 * project reference and host remain server configuration and never enter a
 * response, report or checked-in evidence record.
 */
export const PRODUCTION_PROJECTION_PROJECT_BINDING_HASH = "f48ac4ff21838fdb725a47e490f2da337de9c182c213a56b94be45fd3b5b84b8" as const;
export const PRODUCTION_PROJECTION_SOURCE_SET_HASH = "a10d210b79ff4d4cbb7ce5efe2fe67dfef7c292a3d74bc9f68c79d50e78f2d40" as const;
export const PRODUCTION_PROJECTION_ARTIFACT_HASH = "1310936d18ae75be89825df36e4953ef06fe42608a02f77a67fa45c109fe54f8" as const;

export const PRODUCTION_PROJECTION_PORT_FLAGS = Object.freeze({
  runtimeActivated: false,
  deploymentAuthorized: false,
  executionAuthorized: false,
  learningAuthorized: false,
  persistenceAuthorized: false,
  writebackAuthorized: false,
  rankingAuthorized: false,
  eligibilityAuthorized: false,
  shadowTrafficAuthorized: false,
  syntheticFallbackAuthorized: false,
  emptyFallbackAuthorized: false,
});

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.productionProjectionPortRelease,
  releaseId: "backyrd-user-intelligence-production-projection-port-1",
  canonicalBaseSha: "96f648cebbfdfd854aec688613ddbedb447c25bb",
  canonicalBaseTree: "4321f018f04056f14aea6c7d59c4cb21a88a9a44",
  issuer: "BACKYRD_USER_INTELLIGENCE_RELEASE_AUTHORITY" as const,
  purpose: PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE,
  projectBindingHash: PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
  sourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
  artifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH,
  projectionContractVersion: CONTRACT_VERSIONS.projection,
  portContractVersion: "backyrd.user-intelligence.decision-projection-port@1.0" as const,
  validFrom: "2026-09-18T00:00:00.000Z",
  validUntil: "2030-01-01T00:00:00.000Z",
  flags: PRODUCTION_PROJECTION_PORT_FLAGS,
  productionAuthorized: false as const,
});
export const PRODUCTION_PROJECTION_PORT_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });

const anchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.productionProjectionPortTrustAnchor,
  anchorId: "backyrd-user-intelligence-production-projection-port-anchor-1",
  acceptedReleaseId: PRODUCTION_PROJECTION_PORT_RELEASE.releaseId,
  acceptedReleaseHash: PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash,
  acceptedProjectBindingHash: PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
  acceptedSourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
  acceptedArtifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH,
  acceptedPurpose: PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE,
  issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const,
  validFrom: PRODUCTION_PROJECTION_PORT_RELEASE.validFrom,
  validUntil: PRODUCTION_PROJECTION_PORT_RELEASE.validUntil,
  productionAuthorized: false as const,
});
export const PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR = Object.freeze({ ...anchorBody, anchorHash: contentHash(anchorBody) });

export const ProductionProjectionEnvelopeSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productionProjectionEnvelope),
  purpose: schema.literal(PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE),
  requestHash: sha256,
  subjectBindingHash: sha256,
  consentHash: sha256,
  lifecycle: schema.literal("ACTIVE"),
  projectBindingHash: schema.literal(PRODUCTION_PROJECTION_PROJECT_BINDING_HASH),
  releaseHash: schema.literal(PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash),
  sourceSetHash: schema.literal(PRODUCTION_PROJECTION_SOURCE_SET_HASH),
  artifactHash: schema.literal(PRODUCTION_PROJECTION_ARTIFACT_HASH),
  projection: RelevantUserProjectionSchema,
  issuedAt: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_USER_INTELLIGENCE_PROJECTION_AUTHORITY"),
  envelopeHash: sha256,
});
export type ProductionProjectionEnvelope = Infer<typeof ProductionProjectionEnvelopeSchema>;

export interface ProductionProjectionReleaseTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  acceptsProjectionEnvelopeHash(hash: string): boolean;
}

export interface ProductionProjectionSessionProvider {
  readonly contractVersion: "backyrd.user-intelligence.server-session-provider@1.0";
  readVerifiedSession(): Promise<unknown>;
}

export interface ProductionProjectionConsentLifecycleProvider {
  readonly contractVersion: "backyrd.user-intelligence.consent-lifecycle-provider@1.0";
  readForAuthenticatedUser(authUserId: string): Promise<{
    readonly consent: unknown;
    readonly lifecycle: "ACTIVE" | "CONSENT_WITHDRAWN" | "FULL_RESET" | "ACCOUNT_ERASURE";
  } | null>;
}

export interface ProductionProjectionReadProvider {
  readonly contractVersion: "backyrd.user-intelligence.authorized-projection-read-provider@1.0";
  readAuthorizedProjection(input: {
    readonly authUserId: string;
    readonly requestHash: string;
    readonly purpose: typeof PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE;
    readonly projectBindingHash: typeof PRODUCTION_PROJECTION_PROJECT_BINDING_HASH;
    readonly releaseHash: string;
    readonly sourceSetHash: typeof PRODUCTION_PROJECTION_SOURCE_SET_HASH;
    readonly artifactHash: typeof PRODUCTION_PROJECTION_ARTIFACT_HASH;
  }): Promise<unknown>;
}

export type ProductionProjectionPortErrorCode =
  | "CONFIGURATION_DENIED"
  | "SESSION_DENIED"
  | "CONSENT_OR_LIFECYCLE_DENIED"
  | "PROJECTION_MISSING"
  | "PROJECTION_AUTHORITY_DENIED";

export class ProductionProjectionPortError extends Error {
  readonly code: ProductionProjectionPortErrorCode;
  constructor(code: ProductionProjectionPortErrorCode) {
    super(`production_projection_port:${code}`);
    this.name = "ProductionProjectionPortError";
    this.code = code;
  }
}

function verifyRelease(input: {
  readonly projectRef: string;
  readonly host: string;
  readonly releaseTrust: ProductionProjectionReleaseTrustContext;
}): void {
  const projectBindingHash = contentHash({ projectRef: input.projectRef, host: input.host });
  if (projectBindingHash !== PRODUCTION_PROJECTION_PROJECT_BINDING_HASH
    || !equal(input.releaseTrust.getRelease(PRODUCTION_PROJECTION_PORT_RELEASE.releaseId), PRODUCTION_PROJECTION_PORT_RELEASE)
    || !equal(input.releaseTrust.getTrustAnchor(PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR.anchorId), PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR)
    || Date.parse(input.releaseTrust.verifiedAt) < Date.parse(PRODUCTION_PROJECTION_PORT_RELEASE.validFrom)
    || Date.parse(input.releaseTrust.verifiedAt) > Date.parse(PRODUCTION_PROJECTION_PORT_RELEASE.validUntil)
    || Object.values(PRODUCTION_PROJECTION_PORT_FLAGS).some((value) => value !== false)) {
    throw new ProductionProjectionPortError("CONFIGURATION_DENIED");
  }
}

function requestHash(request: RelevantUserProjectionRequest, consent: ConsentEnvelope): string {
  return contentHash({
    request,
    consentHash: contentHash(consent),
    purpose: PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE,
    projectBindingHash: PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
    releaseHash: PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash,
    sourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
    artifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH,
  });
}

/**
 * Canonical server-only read port. It never builds, guesses or substitutes a
 * projection. Missing data is an explicit error, and every read re-verifies
 * session, consent, lifecycle, private UUID authority and the external release
 * trust anchors. No user identifier crosses the returned contract.
 */
export function createProductionRelevantUserProjectionPort(input: {
  readonly projectRef: string;
  readonly host: string;
  readonly mode: "LOCAL_TEST" | "PROD_LIKE_TEST";
  readonly sessionProvider: ProductionProjectionSessionProvider;
  readonly consentLifecycleProvider: ProductionProjectionConsentLifecycleProvider;
  readonly projectionProvider: ProductionProjectionReadProvider;
  readonly privateUuidProvider: FounderLivePrivateUuidProvider;
  readonly uuidTrust: FounderLiveUuidExternalTrustContext;
  readonly releaseTrust: ProductionProjectionReleaseTrustContext;
}): DecisionVNextUserProjectionPort {
  verifyRelease(input);
  if (input.sessionProvider.contractVersion !== "backyrd.user-intelligence.server-session-provider@1.0"
    || input.consentLifecycleProvider.contractVersion !== "backyrd.user-intelligence.consent-lifecycle-provider@1.0"
    || input.projectionProvider.contractVersion !== "backyrd.user-intelligence.authorized-projection-read-provider@1.0") {
    throw new ProductionProjectionPortError("CONFIGURATION_DENIED");
  }
  return Object.freeze({
    contractVersion: "backyrd.user-intelligence.decision-projection-port@1.0" as const,
    async project(rawRequest: RelevantUserProjectionRequest): Promise<RelevantUserProjection> {
      verifyRelease(input);
      let request: RelevantUserProjectionRequest;
      let session: Infer<typeof FounderLiveServerSessionSchema>;
      try {
        request = RelevantUserProjectionRequestSchema.parse(rawRequest);
        session = FounderLiveServerSessionSchema.parse(await input.sessionProvider.readVerifiedSession());
      } catch { throw new ProductionProjectionPortError("SESSION_DENIED"); }
      if (session.authUserId !== request.actor.userId
        || session.authenticationContextHash !== request.actor.authenticationContextHash
        || request.actor.boundBy !== "SERVER"
        || request.killSwitch) throw new ProductionProjectionPortError("SESSION_DENIED");

      const state = await input.consentLifecycleProvider.readForAuthenticatedUser(session.authUserId);
      if (!state) throw new ProductionProjectionPortError("CONSENT_OR_LIFECYCLE_DENIED");
      let consent: ConsentEnvelope;
      try { consent = parseConsentEnvelope(state.consent); }
      catch { throw new ProductionProjectionPortError("CONSENT_OR_LIFECYCLE_DENIED"); }
      if (state.lifecycle !== "ACTIVE" || consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) {
        throw new ProductionProjectionPortError("CONSENT_OR_LIFECYCLE_DENIED");
      }
      const capability = authorizeFounderLiveUuidSession({
        mode: input.mode, session, request, consent, lifecycle: state.lifecycle,
        provider: input.privateUuidProvider, trust: input.uuidTrust,
      });
      if (capability.status !== "AUTHORIZED_READ_ONLY") throw new ProductionProjectionPortError("SESSION_DENIED");

      const expectedRequestHash = requestHash(request, consent);
      const rawEnvelope = await input.projectionProvider.readAuthorizedProjection({
        authUserId: session.authUserId,
        requestHash: expectedRequestHash,
        purpose: PRODUCTION_RELEVANT_USER_PROJECTION_PURPOSE,
        projectBindingHash: PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
        releaseHash: PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash,
        sourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
        artifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH,
      });
      if (rawEnvelope === null || rawEnvelope === undefined) throw new ProductionProjectionPortError("PROJECTION_MISSING");
      let envelope: ProductionProjectionEnvelope;
      try { envelope = ProductionProjectionEnvelopeSchema.parse(rawEnvelope); }
      catch { throw new ProductionProjectionPortError("PROJECTION_AUTHORITY_DENIED"); }
      if (contentHash(without(envelope as unknown as Record<string, unknown>, "envelopeHash")) !== envelope.envelopeHash
        || !input.releaseTrust.acceptsProjectionEnvelopeHash(envelope.envelopeHash)
        || envelope.requestHash !== expectedRequestHash
        || envelope.subjectBindingHash !== capability.subjectBindingHash
        || envelope.consentHash !== capability.consentHash
        || Date.parse(input.releaseTrust.verifiedAt) < Date.parse(envelope.issuedAt)
        || Date.parse(input.releaseTrust.verifiedAt) >= Date.parse(envelope.validUntil)) {
        throw new ProductionProjectionPortError("PROJECTION_AUTHORITY_DENIED");
      }
      try { return parseRelevantUserProjection(envelope.projection, request); }
      catch { throw new ProductionProjectionPortError("PROJECTION_AUTHORITY_DENIED"); }
    },
  });
}

export const PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF = Object.freeze({
  contractVersion: "backyrd.user-intelligence.production-projection-no-write-proof@1.0",
  portMethod: "READ_ONLY" as const,
  projectionBuildAuthorized: false as const,
  syntheticFallbackAuthorized: false as const,
  emptyFallbackAuthorized: false as const,
  eventReadAuthorized: false as const,
  persistenceAuthorized: false as const,
  writebackAuthorized: false as const,
  rankingAuthorized: false as const,
  eligibilityAuthorized: false as const,
  executionAuthorized: false as const,
  proofHash: contentHash({
    portMethod: "READ_ONLY", projectionBuildAuthorized: false, syntheticFallbackAuthorized: false,
    emptyFallbackAuthorized: false, eventReadAuthorized: false, persistenceAuthorized: false,
    writebackAuthorized: false, rankingAuthorized: false, eligibilityAuthorized: false, executionAuthorized: false,
  }),
});

export function assertProductionProjectionEnvelope(value: unknown): ProductionProjectionEnvelope {
  const envelope = ProductionProjectionEnvelopeSchema.parse(value);
  if (contentHash(without(envelope as unknown as Record<string, unknown>, "envelopeHash")) !== envelope.envelopeHash) {
    throw new ContractValidationError("$.envelopeHash", "hash mismatch");
  }
  return envelope;
}
