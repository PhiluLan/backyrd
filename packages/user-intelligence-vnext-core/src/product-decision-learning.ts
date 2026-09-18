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
import { buildRelevantUserProjection } from "./projection.js";
import { Infer, identifier, schema, sha256, timestamp } from "./schema.js";

export const PRODUCT_DECISION_LEARNING_PURPOSE = "PERSONALIZED_DECISION_LEARNING" as const;
export const PRODUCT_DECISION_PROJECTION_PURPOSE = "DECISION_RELEVANT_USER_PROJECTION" as const;
export const PRODUCT_DECISION_EVENT_VERSION = "backyrd.user-intelligence.product-decision-event@1.0" as const;
export const PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH = contentHash([
  "product-decision-learning.ts",
  "contracts.ts",
  "projection.ts",
]);
export const PRODUCT_DECISION_LEARNING_ARTIFACT_HASH = contentHash({
  eventVersion: PRODUCT_DECISION_EVENT_VERSION,
  purpose: PRODUCT_DECISION_LEARNING_PURPOSE,
  sourceSetHash: PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH,
});

export const PRODUCT_DECISION_EVENT_TYPES = Object.freeze([
  "decision_requested",
  "candidate_impression",
  "candidate_opened",
  "candidate_saved",
  "alternative_requested",
  "candidate_rejected",
  "explicit_feedback",
  "outcome_confirmed",
  "event_correction",
] as const);
export type ProductDecisionEventType = typeof PRODUCT_DECISION_EVENT_TYPES[number];

const nullableIdentifier = schema.union([identifier, schema.literal(null)] as const);
const feedback = schema.union([
  schema.object({ response: schema.enum(["HAS_MATCHED", "HAS_NOT_MATCHED", "CANNOT_ASSESS_OR_SKIPPED"] as const), explicitlySelected: schema.literal(true) }),
  schema.literal(null),
] as const);

/** Strict transport input. User, signal strength, policy, independence and authority are deliberately absent. */
export const ProductDecisionLearningInputSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productDecisionLearningInput),
  eventId: identifier,
  idempotencyKey: identifier,
  eventType: schema.enum(PRODUCT_DECISION_EVENT_TYPES),
  decisionId: identifier,
  sessionId: identifier,
  candidateId: nullableIdentifier,
  spotId: nullableIdentifier,
  contextBindingHash: sha256,
  occurredAt: timestamp,
  feedback,
  targetEventId: nullableIdentifier,
});
export type ProductDecisionLearningInput = Infer<typeof ProductDecisionLearningInputSchema>;

export const ProductDecisionLearningAuthoritySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productDecisionLearningAuthority),
  authorityRecordId: identifier,
  authority: schema.literal("SERVER_DECISION_LEDGER"),
  authUserId: identifier,
  subjectBindingHash: sha256,
  authenticationContextHash: sha256,
  decisionId: identifier,
  sessionId: identifier,
  journeyId: identifier,
  candidateId: nullableIdentifier,
  spotId: nullableIdentifier,
  contextBindingHash: sha256,
  explicitUserActionVerified: schema.boolean(),
  productStateVerified: schema.boolean(),
  outcomeVerified: schema.boolean(),
  targetEventId: nullableIdentifier,
  targetRecordHash: schema.union([sha256, schema.literal(null)] as const),
  eventOccurredAt: timestamp,
  authorityPolicyVersion: identifier,
  releaseHash: sha256,
  artifactHash: sha256,
  sourceSetHash: sha256,
  validFrom: timestamp,
  validUntil: timestamp,
  issuer: schema.literal("BACKYRD_DECISION_EVENT_AUTHORITY"),
  recordHash: sha256,
});
export type ProductDecisionLearningAuthority = Infer<typeof ProductDecisionLearningAuthoritySchema>;

export const ProductDecisionLearningRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productDecisionLearningRecord),
  eventVersion: schema.literal(PRODUCT_DECISION_EVENT_VERSION),
  eventId: identifier,
  idempotencyKey: identifier,
  eventType: schema.enum(PRODUCT_DECISION_EVENT_TYPES),
  purpose: schema.literal(PRODUCT_DECISION_LEARNING_PURPOSE),
  userId: identifier,
  subjectBindingHash: sha256,
  decisionId: identifier,
  sessionId: identifier,
  journeyId: identifier,
  candidateId: nullableIdentifier,
  spotId: nullableIdentifier,
  contextBindingHash: sha256,
  occurredAt: timestamp,
  feedback,
  targetEventId: nullableIdentifier,
  targetRecordHash: schema.union([sha256, schema.literal(null)] as const),
  authorityRecordId: identifier,
  authorityRecordHash: sha256,
  consentHash: sha256,
  consentVersion: identifier,
  lifecycle: schema.literal("ACTIVE"),
  semanticDisposition: schema.enum(["OBSERVATION_ONLY", "PLANNING_STATE", "WEAK_CONTEXTUAL_NEGATIVE", "EXPLICIT_OUTCOME", "CORRECTION"] as const),
  boundaries: schema.object({ rawEvidenceIncluded: schema.literal(false), rawTextIncluded: schema.literal(false), sensitiveInferenceIncluded: schema.literal(false), worldMutationAuthorized: schema.literal(false), clientRankingAuthorized: schema.literal(false), clientProfileMutationAuthorized: schema.literal(false) }),
  recordHash: sha256,
});
export type ProductDecisionLearningRecord = Infer<typeof ProductDecisionLearningRecordSchema>;

export const ProductDecisionLearningReceiptSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productDecisionLearningReceipt),
  status: schema.enum(["PERSISTED", "REPLAYED", "SUPPRESSED_NO_CONSENT", "SUPPRESSED_LIFECYCLE"] as const),
  persisted: schema.boolean(),
  eventId: nullableIdentifier,
  recordHash: schema.union([sha256, schema.literal(null)] as const),
  neutralProjectionRequired: schema.boolean(),
});
export type ProductDecisionLearningReceipt = Infer<typeof ProductDecisionLearningReceiptSchema>;

const releaseBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.productDecisionLearningRelease,
  releaseId: "backyrd-user-intelligence-product-decision-learning-1",
  purpose: PRODUCT_DECISION_LEARNING_PURPOSE,
  eventVersion: PRODUCT_DECISION_EVENT_VERSION,
  authorityPolicyVersion: "backyrd-product-decision-learning-authority-policy-1",
  sourceSetHash: PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH,
  artifactHash: PRODUCT_DECISION_LEARNING_ARTIFACT_HASH,
  projectionContractVersion: CONTRACT_VERSIONS.projection,
  productionAuthorized: false as const,
  runtimeActivated: false as const,
  rankingAuthorized: false as const,
  eligibilityAuthorized: false as const,
  clientWriteAuthorized: false as const,
});
export const PRODUCT_DECISION_LEARNING_RELEASE = Object.freeze({ ...releaseBody, releaseHash: contentHash(releaseBody) });
const anchorBody = Object.freeze({
  contractVersion: CONTRACT_VERSIONS.productDecisionLearningTrustAnchor,
  anchorId: "backyrd-user-intelligence-product-decision-learning-anchor-1",
  acceptedReleaseId: PRODUCT_DECISION_LEARNING_RELEASE.releaseId,
  acceptedReleaseHash: PRODUCT_DECISION_LEARNING_RELEASE.releaseHash,
  issuer: "BACKYRD_CTO_RELEASE_REGISTRY" as const,
  productionAuthorized: false as const,
});
export const PRODUCT_DECISION_LEARNING_TRUST_ANCHOR = Object.freeze({ ...anchorBody, anchorHash: contentHash(anchorBody) });

export interface ProductDecisionLearningTrustContext {
  readonly verifiedAt: string;
  getRelease(id: string): unknown;
  getTrustAnchor(id: string): unknown;
  acceptsAuthorityRecordHash(hash: string): boolean;
}
export const ProductDecisionServerSessionSchema = schema.object({
  authUserId: identifier,
  subjectBindingHash: sha256,
  authenticationContextHash: sha256,
  authenticated: schema.literal(true),
  blocked: schema.literal(false),
  deleted: schema.literal(false),
  issuedAt: timestamp,
  expiresAt: timestamp,
  verifiedAt: timestamp,
});
export interface ProductDecisionSessionProvider {
  readonly contractVersion: "backyrd.user-intelligence.product-session-provider@1.0";
  readVerifiedSession(): Promise<unknown>;
}
export const ProductDecisionConsentLifecycleStateSchema = schema.object({
  consent: schema.object({
    contractVersion: schema.literal(CONTRACT_VERSIONS.consentEnvelope), purpose: schema.literal("PERSONALIZED_RECOMMENDATIONS"),
    state: schema.enum(["GRANTED", "DENIED", "WITHDRAWN", "UNKNOWN"] as const), consentVersion: identifier, policyVersion: identifier, uxVersion: identifier,
    effectiveAt: timestamp, captureContext: schema.enum(["ONBOARDING", "SETTINGS", "MIGRATION_VERIFIED", "SYSTEM_UNKNOWN"] as const),
    allowedProcessing: schema.array(schema.enum(["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"] as const), { max: 4 }),
    lifecycleEffect: schema.enum(["ALLOW", "DO_NOT_PROCESS", "PURGE_PERSONALIZATION"] as const),
  }),
  lifecycle: schema.enum(["ACTIVE", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"] as const),
});
export interface ProductDecisionConsentLifecycleProvider {
  readonly contractVersion: "backyrd.user-intelligence.product-consent-lifecycle-provider@1.0";
  readForAuthenticatedUser(authUserId: string): Promise<unknown>;
}
export interface ProductDecisionAuthorityProvider {
  readonly contractVersion: "backyrd.user-intelligence.product-decision-authority-provider@1.0";
  resolve(input: ProductDecisionLearningInput, authenticatedUserId: string): Promise<unknown>;
}
export interface ProductDecisionLearningRepository {
  readonly contractVersion: "backyrd.user-intelligence.product-decision-learning-repository@1.0";
  append(record: ProductDecisionLearningRecord): Promise<{ readonly status: "PERSISTED" | "REPLAYED"; readonly eventId: string; readonly recordHash: string }>;
}
export interface ProductDecisionLearningRateLimitPort {
  readonly contractVersion: "backyrd.user-intelligence.product-decision-learning-rate-limit@1.0";
  consume(input: { readonly subjectBindingHash: string; readonly sessionId: string; readonly eventType: ProductDecisionEventType }): Promise<{ readonly allowed: boolean }>;
}

const hashBody = <T extends Record<string, unknown>>(value: T, hashKey: string): string => contentHash(Object.fromEntries(Object.entries(value).filter(([key]) => key !== hashKey)));
const same = (left: unknown, right: unknown): boolean => contentHash(left) === contentHash(right);
const semantics = (event: ProductDecisionLearningInput): ProductDecisionLearningRecord["semanticDisposition"] => {
  if (event.eventType === "candidate_saved") return "PLANNING_STATE";
  if (event.eventType === "candidate_rejected") return "WEAK_CONTEXTUAL_NEGATIVE";
  if (event.eventType === "explicit_feedback" && event.feedback?.response !== "CANNOT_ASSESS_OR_SKIPPED") return "EXPLICIT_OUTCOME";
  if (event.eventType === "outcome_confirmed") return "EXPLICIT_OUTCOME";
  if (event.eventType === "event_correction") return "CORRECTION";
  return "OBSERVATION_ONLY";
};

function validateEventBindings(input: ProductDecisionLearningInput, authority: ProductDecisionLearningAuthority): void {
  const candidateRequired = ["candidate_impression", "candidate_opened", "candidate_saved", "candidate_rejected", "explicit_feedback", "outcome_confirmed"].includes(input.eventType);
  if (candidateRequired && (!input.candidateId || !input.spotId)) throw new Error("product_decision_learning_candidate_binding_required");
  if (!candidateRequired && input.eventType !== "event_correction" && (input.candidateId !== null || input.spotId !== null)) throw new Error("product_decision_learning_irrelevant_candidate_binding");
  if (input.eventType === "explicit_feedback" && (!input.feedback || !authority.explicitUserActionVerified)) throw new Error("product_decision_learning_explicit_feedback_authority_required");
  if (input.eventType !== "explicit_feedback" && input.feedback !== null) throw new Error("product_decision_learning_feedback_not_allowed");
  if (input.eventType === "outcome_confirmed" && (!authority.explicitUserActionVerified || !authority.outcomeVerified)) throw new Error("product_decision_learning_outcome_authority_required");
  if (input.eventType === "candidate_saved" && !authority.productStateVerified) throw new Error("product_decision_learning_product_state_required");
  if (input.eventType === "event_correction" ? input.targetEventId === null : input.targetEventId !== null) throw new Error("product_decision_learning_correction_target_invalid");
  if (authority.targetEventId !== input.targetEventId || (input.eventType === "event_correction" ? authority.targetRecordHash === null : authority.targetRecordHash !== null)) throw new Error("product_decision_learning_correction_authority_invalid");
}

export function createProductDecisionLearningWritePort(input: {
  readonly mode: "LOCAL_INTEGRATION_TEST" | "PRODUCT_RUNTIME";
  readonly now: () => Date;
  readonly sessionProvider: ProductDecisionSessionProvider;
  readonly consentLifecycleProvider: ProductDecisionConsentLifecycleProvider;
  readonly authorityProvider: ProductDecisionAuthorityProvider;
  readonly repository: ProductDecisionLearningRepository;
  readonly rateLimit: ProductDecisionLearningRateLimitPort;
  readonly trust: ProductDecisionLearningTrustContext;
}) {
  if (input.mode === "PRODUCT_RUNTIME" && !PRODUCT_DECISION_LEARNING_RELEASE.productionAuthorized) throw new Error("product_decision_learning_runtime_not_authorized");
  if (input.sessionProvider.contractVersion !== "backyrd.user-intelligence.product-session-provider@1.0" || input.consentLifecycleProvider.contractVersion !== "backyrd.user-intelligence.product-consent-lifecycle-provider@1.0" || input.authorityProvider.contractVersion !== "backyrd.user-intelligence.product-decision-authority-provider@1.0" || input.repository.contractVersion !== "backyrd.user-intelligence.product-decision-learning-repository@1.0" || input.rateLimit.contractVersion !== "backyrd.user-intelligence.product-decision-learning-rate-limit@1.0" || !same(input.trust.getRelease(PRODUCT_DECISION_LEARNING_RELEASE.releaseId), PRODUCT_DECISION_LEARNING_RELEASE) || !same(input.trust.getTrustAnchor(PRODUCT_DECISION_LEARNING_TRUST_ANCHOR.anchorId), PRODUCT_DECISION_LEARNING_TRUST_ANCHOR)) throw new Error("product_decision_learning_configuration_denied");
  return Object.freeze({
    contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0" as const,
    async record(raw: unknown): Promise<ProductDecisionLearningReceipt> {
      const event = ProductDecisionLearningInputSchema.parse(raw);
      let session: Infer<typeof ProductDecisionServerSessionSchema>;
      try { session = ProductDecisionServerSessionSchema.parse(await input.sessionProvider.readVerifiedSession()); }
      catch { throw new Error("product_decision_learning_session_denied"); }
      if (Date.parse(input.trust.verifiedAt) < Date.parse(session.issuedAt) || Date.parse(input.trust.verifiedAt) >= Date.parse(session.expiresAt) || session.verifiedAt !== input.trust.verifiedAt) throw new Error("product_decision_learning_session_denied");
      const rawState = await input.consentLifecycleProvider.readForAuthenticatedUser(session.authUserId);
      if (!rawState) return ProductDecisionLearningReceiptSchema.parse({ contractVersion: CONTRACT_VERSIONS.productDecisionLearningReceipt, status: "SUPPRESSED_LIFECYCLE", persisted: false, eventId: null, recordHash: null, neutralProjectionRequired: true });
      let state: Infer<typeof ProductDecisionConsentLifecycleStateSchema>;
      try { state = ProductDecisionConsentLifecycleStateSchema.parse(rawState); }
      catch { throw new Error("product_decision_learning_lifecycle_invalid"); }
      if (state.lifecycle !== "ACTIVE") return ProductDecisionLearningReceiptSchema.parse({ contractVersion: CONTRACT_VERSIONS.productDecisionLearningReceipt, status: "SUPPRESSED_LIFECYCLE", persisted: false, eventId: null, recordHash: null, neutralProjectionRequired: true });
      let consent: ConsentEnvelope;
      try { consent = parseConsentEnvelope(state.consent); } catch { throw new Error("product_decision_learning_consent_invalid"); }
      if (consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) return ProductDecisionLearningReceiptSchema.parse({ contractVersion: CONTRACT_VERSIONS.productDecisionLearningReceipt, status: "SUPPRESSED_NO_CONSENT", persisted: false, eventId: null, recordHash: null, neutralProjectionRequired: true });
      if (!(await input.rateLimit.consume({ subjectBindingHash: session.subjectBindingHash, sessionId: event.sessionId, eventType: event.eventType })).allowed) throw new Error("product_decision_learning_rate_limited");
      const authority = ProductDecisionLearningAuthoritySchema.parse(await input.authorityProvider.resolve(event, session.authUserId));
      if (hashBody(authority as unknown as Record<string, unknown>, "recordHash") !== authority.recordHash || !input.trust.acceptsAuthorityRecordHash(authority.recordHash) || authority.authUserId !== session.authUserId || authority.subjectBindingHash !== session.subjectBindingHash || authority.authenticationContextHash !== session.authenticationContextHash || authority.decisionId !== event.decisionId || authority.sessionId !== event.sessionId || authority.candidateId !== event.candidateId || authority.spotId !== event.spotId || authority.contextBindingHash !== event.contextBindingHash || authority.eventOccurredAt !== event.occurredAt || authority.authorityPolicyVersion !== PRODUCT_DECISION_LEARNING_RELEASE.authorityPolicyVersion || authority.releaseHash !== PRODUCT_DECISION_LEARNING_RELEASE.releaseHash || authority.artifactHash !== PRODUCT_DECISION_LEARNING_ARTIFACT_HASH || authority.sourceSetHash !== PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH || Date.parse(input.trust.verifiedAt) < Date.parse(authority.validFrom) || Date.parse(input.trust.verifiedAt) >= Date.parse(authority.validUntil) || Date.parse(event.occurredAt) > input.now().getTime() + 300_000) throw new Error("product_decision_learning_authority_denied");
      validateEventBindings(event, authority);
      const body = {
        contractVersion: CONTRACT_VERSIONS.productDecisionLearningRecord,
        eventVersion: PRODUCT_DECISION_EVENT_VERSION,
        eventId: event.eventId, idempotencyKey: event.idempotencyKey, eventType: event.eventType,
        purpose: PRODUCT_DECISION_LEARNING_PURPOSE, userId: session.authUserId, subjectBindingHash: session.subjectBindingHash,
        decisionId: authority.decisionId, sessionId: authority.sessionId, journeyId: authority.journeyId,
        candidateId: authority.candidateId, spotId: authority.spotId, contextBindingHash: authority.contextBindingHash,
        occurredAt: authority.eventOccurredAt, feedback: event.feedback, targetEventId: event.targetEventId, targetRecordHash: authority.targetRecordHash,
        authorityRecordId: authority.authorityRecordId, authorityRecordHash: authority.recordHash,
        consentHash: contentHash(consent), consentVersion: consent.consentVersion, lifecycle: "ACTIVE" as const,
        semanticDisposition: semantics(event),
        boundaries: { rawEvidenceIncluded: false as const, rawTextIncluded: false as const, sensitiveInferenceIncluded: false as const, worldMutationAuthorized: false as const, clientRankingAuthorized: false as const, clientProfileMutationAuthorized: false as const },
      };
      const record = ProductDecisionLearningRecordSchema.parse({ ...body, recordHash: contentHash(body) });
      const result = await input.repository.append(record);
      if (!result || !["PERSISTED", "REPLAYED"].includes(result.status) || typeof result.eventId !== "string" || typeof result.recordHash !== "string") throw new Error("product_decision_learning_repository_receipt_invalid");
      if (result.eventId !== record.eventId || result.recordHash !== record.recordHash) throw new Error("product_decision_learning_repository_receipt_invalid");
      return ProductDecisionLearningReceiptSchema.parse({ contractVersion: CONTRACT_VERSIONS.productDecisionLearningReceipt, status: result.status, persisted: true, eventId: result.eventId, recordHash: result.recordHash, neutralProjectionRequired: false });
    },
  });
}

export interface ProductProjectionReadProvider {
  readonly contractVersion: "backyrd.user-intelligence.product-projection-read-provider@1.0";
  read(input: { readonly authUserId: string; readonly requestHash: string; readonly consentHash: string }): Promise<unknown>;
}

export const ProductProjectionEnvelopeSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.productProjectionEnvelope),
  purpose: schema.literal(PRODUCT_DECISION_PROJECTION_PURPOSE),
  requestHash: sha256, subjectBindingHash: sha256, consentHash: sha256,
  projection: RelevantUserProjectionSchema, issuedAt: timestamp, validUntil: timestamp,
  issuer: schema.literal("BACKYRD_USER_INTELLIGENCE_PROJECTION_AUTHORITY"), envelopeHash: sha256,
});

const neutralProjection = (request: RelevantUserProjectionRequest, reason: "NO_CONSENT" | "KILL_SWITCH" | "MISSING_SNAPSHOT", now: string): RelevantUserProjection => buildRelevantUserProjection({
  request: { ...request, snapshot: null },
  consent: { contractVersion: CONTRACT_VERSIONS.consentEnvelope, purpose: "PERSONALIZED_RECOMMENDATIONS", state: reason === "NO_CONSENT" ? "UNKNOWN" : "GRANTED", consentVersion: "neutral-product-projection", policyVersion: "neutral-product-projection", uxVersion: "neutral-product-projection", effectiveAt: now, captureContext: "SYSTEM_UNKNOWN", allowedProcessing: reason === "NO_CONSENT" ? [] : ["PERSONALIZATION_EVIDENCE"], lifecycleEffect: reason === "NO_CONSENT" ? "DO_NOT_PROCESS" : "ALLOW" },
  manifest: { manifestId: "neutral-product-projection", manifestHash: contentHash("neutral-product-projection") }, snapshot: null,
  content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } },
  identity: { projectionId: `neutral-${contentHash({ requestId: request.requestId, decisionId: request.decisionId, reason }).slice(0, 24)}` }, clock: { now }, forcedNeutralReason: reason,
});

/** Product port for every authenticated account; no Founder UUID allowlist is consulted. */
export function createProductRelevantUserProjectionPort(input: {
  readonly now: () => Date;
  readonly sessionProvider: ProductDecisionSessionProvider;
  readonly consentLifecycleProvider: ProductDecisionConsentLifecycleProvider;
  readonly projectionProvider: ProductProjectionReadProvider;
  readonly acceptsEnvelopeHash: (hash: string) => boolean;
}) {
  return Object.freeze({
    contractVersion: "backyrd.user-intelligence.decision-projection-port@1.0" as const,
    async project(raw: unknown): Promise<RelevantUserProjection> {
      const request = RelevantUserProjectionRequestSchema.parse(raw); const now = input.now().toISOString();
      let session: Infer<typeof ProductDecisionServerSessionSchema>;
      try { session = ProductDecisionServerSessionSchema.parse(await input.sessionProvider.readVerifiedSession()); }
      catch { throw new Error("product_projection_session_denied"); }
      if (Date.parse(now) < Date.parse(session.issuedAt) || Date.parse(now) >= Date.parse(session.expiresAt) || session.verifiedAt !== now || session.authUserId !== request.actor.userId || session.subjectBindingHash !== request.actor.subjectBindingHash || session.authenticationContextHash !== request.actor.authenticationContextHash || request.actor.boundBy !== "SERVER") throw new Error("product_projection_session_denied");
      if (request.killSwitch) return neutralProjection(request, "KILL_SWITCH", now);
      const rawState = await input.consentLifecycleProvider.readForAuthenticatedUser(session.authUserId);
      if (!rawState) return neutralProjection(request, "NO_CONSENT", now);
      let state: Infer<typeof ProductDecisionConsentLifecycleStateSchema>;
      try { state = ProductDecisionConsentLifecycleStateSchema.parse(rawState); }
      catch { throw new Error("product_projection_lifecycle_invalid"); }
      if (state.lifecycle !== "ACTIVE") return neutralProjection(request, "NO_CONSENT", now);
      let consent: ConsentEnvelope; try { consent = parseConsentEnvelope(state.consent); } catch { throw new Error("product_projection_consent_invalid"); }
      if (consent.state !== "GRANTED" || !consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) return neutralProjection(request, "NO_CONSENT", now);
      if (request.snapshot === null) return neutralProjection(request, "MISSING_SNAPSHOT", now);
      const expectedRequestHash = contentHash({ request, consentHash: contentHash(consent), purpose: PRODUCT_DECISION_PROJECTION_PURPOSE });
      const value = ProductProjectionEnvelopeSchema.parse(await input.projectionProvider.read({ authUserId: session.authUserId, requestHash: expectedRequestHash, consentHash: contentHash(consent) }));
      if (hashBody(value as unknown as Record<string, unknown>, "envelopeHash") !== value.envelopeHash || !input.acceptsEnvelopeHash(value.envelopeHash) || value.requestHash !== expectedRequestHash || value.subjectBindingHash !== session.subjectBindingHash || value.consentHash !== contentHash(consent) || Date.parse(now) < Date.parse(value.issuedAt) || Date.parse(now) >= Date.parse(value.validUntil)) throw new Error("product_projection_authority_denied");
      return parseRelevantUserProjection(value.projection, request);
    },
  });
}
