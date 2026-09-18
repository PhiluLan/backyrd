import {
  ProductDecisionLearningInputSchema,
  RelevantUserProjectionSchema,
} from "@backyrd/user-intelligence-vnext-core";
import {
  FounderLabCandidateAssessmentSchema,
  FounderLabCohortSchema,
  FounderLabCorrectionsSchema,
  FounderLabInterpretationSchema,
} from "./phase3c-lab-contracts.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const PRODUCT_DECISION_VERSIONS = Object.freeze({
  request: "backyrd.decision-vnext.product-request@1.0",
  interactionRequest: "backyrd.decision-vnext.product-interaction-request@1.0",
  interactionResponse: "backyrd.decision-vnext.product-interaction-response@1.0",
  response: "backyrd.decision-vnext.product-response@1.0",
  envelope: "backyrd.decision-vnext.product-envelope@1.0",
  rankingPolicy: "backyrd.decision-vnext.product-ranking-policy@1.0",
  evaluation: "backyrd.decision-vnext.product-evaluation@1.0",
  evaluationPolicy: "backyrd.decision-vnext.product-evaluation-policy@1.0",
  evaluationRelease: "backyrd.decision-vnext.product-evaluation-release@1.0",
  presentation: "backyrd.decision-vnext.product-presentation@1.0",
  error: "backyrd.decision-vnext.product-error@1.0",
} as const);

const nullableIdentifier = schema.union([identifier, schema.literal(null)] as const);
const nullableText = schema.union([schema.string({ min: 1, max: 500 }), schema.literal(null)] as const);
const nullableRank = schema.union([schema.number({ integer: true, min: 1, max: 1000 }), schema.literal(null)] as const);
const contractRef = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });

/** Client-controlled values only. No actor, policy, engine or authority fields. */
export const DecisionProductRequestSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.request),
  requestId: identifier,
  idempotencyKey: identifier,
  naturalLanguage: schema.string({ min: 1, max: 2_000 }),
  explicit: FounderLabCorrectionsSchema,
  alternativeRequested: schema.boolean(),
  previouslyPresentedCandidateIds: schema.array(identifier, { max: 50 }),
  rejectedCandidateIds: schema.array(identifier, { max: 50 }),
});
export type DecisionProductRequest = Infer<typeof DecisionProductRequestSchema>;

/** Same-route UI interaction input. Candidate and session authority remain server-owned. */
export const DecisionProductInteractionRequestSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.interactionRequest),
  actionId: identifier,
  idempotencyKey: identifier,
  decisionId: identifier,
  eventType: schema.enum(["candidate_impression", "candidate_opened"] as const),
  candidateId: identifier,
});
export type DecisionProductInteractionRequest = Infer<typeof DecisionProductInteractionRequestSchema>;

export const DecisionProductInteractionResponseSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.interactionResponse),
  status: schema.literal("ACKNOWLEDGED"),
  decisionId: identifier,
  candidateId: identifier,
  eventType: schema.enum(["candidate_impression", "candidate_opened"] as const),
  legacyWriteUsed: schema.literal(false),
  fallbackUsed: schema.literal(false),
});
export type DecisionProductInteractionResponse = Infer<typeof DecisionProductInteractionResponseSchema>;

/** Strict, product-safe projection. Commercial and Owner fields have no channel. */
export const DecisionProductPresentationSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.presentation),
  spotId: identifier,
  name: schema.string({ min: 1, max: 160 }),
  locality: nullableIdentifier,
  categoryLabel: nullableText,
  imageUrl: schema.union([schema.string({ min: 1, max: 2_000, pattern: /^https:\/\// }), schema.literal(null)] as const),
  sourceHash: sha256,
  presentationHash: sha256,
});
export type DecisionProductPresentation = Infer<typeof DecisionProductPresentationSchema>;

export const DecisionProductRankingPolicySchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.rankingPolicy),
  policyId: identifier,
  precedence: schema.array(schema.enum([
    "HARD_CONSTRAINTS", "ELIGIBILITY_TIER", "CORE_INTENT_COVERAGE", "ACTUAL_AVAILABILITY",
    "CONSENTED_USER_RELEVANCE", "SITUATIONAL_CONTEXT_FIT", "WORLD_EVIDENCE", "NEUTRAL_IDENTITY",
  ] as const), { min: 8, max: 8 }),
  userSignals: schema.array(schema.enum(["DIRECT_SPOT_POSITIVE"] as const), { min: 1, max: 1 }),
  commercialSignalsForbidden: schema.literal(true),
  fixtureOrderForbidden: schema.literal(true),
  spotNameForbidden: schema.literal(true),
  policyHash: sha256,
});
export type DecisionProductRankingPolicy = Infer<typeof DecisionProductRankingPolicySchema>;

export const DecisionProductEvaluationPolicySchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.evaluationPolicy),
  policyId: identifier,
  scope: schema.literal("PRODUCT_DECISION"),
  requiresCanonicalWorldPort: schema.literal(true),
  requiresCanonicalUserProjectionPort: schema.literal(true),
  requiresVerifiedContext: schema.literal(true),
  founderLabAuthorityAccepted: schema.literal(false),
  syntheticFixtureAuthorityAccepted: schema.literal(false),
  hardConstraintsBeforeRanking: schema.literal(true),
  policyHash: sha256,
});

export const DecisionProductEvaluationReleaseSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.evaluationRelease),
  releaseId: identifier,
  evaluationPolicyHash: sha256,
  rankingPolicyHash: sha256,
  productSemanticsApproved: schema.literal(true),
  productRankingAuthorized: schema.literal(true),
  runtimeActivated: schema.literal(false),
  productionExecutionAuthorized: schema.literal(false),
  releaseHash: sha256,
});

/** Product evaluator output. Phase-3C Lab flags and fixture authority have no channel. */
export const DecisionProductEvaluationSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.evaluation),
  evaluationId: identifier,
  createdAt: timestamp,
  requestHash: sha256,
  interpretation: FounderLabInterpretationSchema,
  worldCohort: FounderLabCohortSchema,
  userProjectionHash: sha256,
  candidates: schema.array(FounderLabCandidateAssessmentSchema, { max: 40 }),
  limitations: schema.array(identifier, { max: 50 }),
  evaluatorVersion: contractRef,
  evaluationPolicyHash: sha256,
  evaluationReleaseHash: sha256,
  sourceKind: schema.literal("CANONICAL_PRODUCT_PORTS"),
  productSemanticsApproved: schema.literal(true),
  productRankingAuthorized: schema.literal(true),
  fixtureSourceUsed: schema.literal(false),
  evaluationHash: sha256,
});
export type DecisionProductEvaluation = Infer<typeof DecisionProductEvaluationSchema>;

const rankVector = schema.object({
  hardConstraintState: schema.enum(["PASS", "UNKNOWN", "FAIL"] as const),
  eligibilityTier: schema.enum(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"] as const),
  coreIntentState: schema.enum(["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "INCOMPATIBLE", "DISPUTED", "NOT_APPLICABLE"] as const),
  actualAvailability: schema.enum(["open", "closed", "unknown", "not_authorized", "expired", "disputed", "not_requested"] as const),
  userRelevance: schema.object({ state: schema.enum(["POSITIVE_DIRECT", "NEUTRAL"] as const), confidence: schema.number({ min: 0, max: 1 }), sourceHash: sha256 }),
  contextFit: schema.object({ secondaryIntentConfirmed: schema.boolean(), visitSituationConfirmed: schema.boolean(), matchedSoftPreferenceCount: schema.number({ integer: true, min: 0, max: 30 }), atmosphereConfirmed: schema.boolean(), typicalDaypartConfirmed: schema.boolean() }),
  worldEvidence: schema.object({ conflictFree: schema.boolean(), confirmedReasonCount: schema.number({ integer: true, min: 0, max: 60 }) }),
  neutralIdentity: identifier,
  vectorHash: sha256,
});

const productReason = schema.object({
  code: identifier,
  domain: schema.enum(["WORLD", "USER", "CONTEXT", "ELIGIBILITY", "RANKING", "LIMITATION"] as const),
  sourceHash: sha256,
  statement: schema.string({ min: 1, max: 500 }),
  confirmed: schema.boolean(),
});

export const DecisionProductCandidateSchema = schema.object({
  spotId: identifier,
  presentation: DecisionProductPresentationSchema,
  tier: schema.enum(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"] as const),
  rank: nullableRank,
  coreIntentCoverage: schema.enum(["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "INCOMPATIBLE", "DISPUTED", "NOT_APPLICABLE"] as const),
  actualAvailability: schema.enum(["open", "closed", "unknown", "not_authorized", "expired", "disputed", "not_requested"] as const),
  confirmedHardConstraints: schema.array(identifier, { max: 30 }),
  unknownHardConstraints: schema.array(identifier, { max: 30 }),
  failedHardConstraints: schema.array(identifier, { max: 30 }),
  rankVector,
  reasons: schema.array(productReason, { min: 1, max: 80 }),
  limitations: schema.array(identifier, { max: 40 }),
  contextualReject: schema.boolean(),
  candidateHash: sha256,
});
export type DecisionProductCandidate = Infer<typeof DecisionProductCandidateSchema>;

export const DecisionProductResponseSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.response),
  status: schema.literal("AVAILABLE"),
  decisionId: identifier,
  requestHash: sha256,
  envelopeHash: sha256,
  rankingPolicyVersion: version(PRODUCT_DECISION_VERSIONS.rankingPolicy),
  rankingPolicyHash: sha256,
  interpretation: FounderLabInterpretationSchema,
  primaryCandidateId: nullableIdentifier,
  candidates: schema.array(DecisionProductCandidateSchema, { max: 40 }),
  limitations: schema.array(identifier, { max: 60 }),
  alternative: schema.object({ requested: schema.boolean(), selectedCandidateId: nullableIdentifier, negativeSignalProduced: schema.literal(false) }),
  reject: schema.object({ candidateIds: schema.array(identifier, { max: 50 }), contextualOnly: schema.literal(true), worldFactProduced: schema.literal(false) }),
  personalization: schema.object({ state: schema.enum(["ACTIVE", "NEUTRAL"] as const), neutralReason: nullableIdentifier, projectionHash: sha256 }),
  learning: schema.object({
    mode: schema.enum(["CONSENT_BOUND_EVENTS", "DISABLED_NEUTRAL"] as const),
    acknowledgement: schema.enum(["CONSENT_BOUND_IDEMPOTENT", "NOT_APPLICABLE_NEUTRAL"] as const),
    eventCount: schema.number({ integer: true, min: 0, max: 52 }),
    rawTextIncluded: schema.literal(false),
  }),
  productOutputAuthorized: schema.literal(true),
  legacyEngineUsed: schema.literal(false),
  fallbackUsed: schema.literal(false),
  resultHash: sha256,
});
export type DecisionProductResponse = Infer<typeof DecisionProductResponseSchema>;

export const DecisionProductExecutionEnvelopeSchema = schema.object({
  contractVersion: version(PRODUCT_DECISION_VERSIONS.envelope),
  decisionId: identifier,
  requestHash: sha256,
  idempotencyIdentityHash: sha256,
  actor: schema.object({ subjectBindingHash: sha256, authenticationContextHash: sha256, sessionBindingHash: sha256, boundBy: schema.literal("SERVER") }),
  authority: schema.object({ serverTime: timestamp, authorizedCity: identifier, locationBindingHash: sha256, purpose: schema.literal("PRODUCT_DECISION"), transportSlug: schema.literal("decision-v13") }),
  bindings: schema.object({ worldCohortHash: sha256, userProjectionHash: sha256, contextHash: sha256, rankingPolicyHash: sha256, evaluatorContractVersion: contractRef }),
  boundaries: schema.object({ authenticatedAccountsOnly: schema.literal(true), founderAllowlistUsed: schema.literal(false), legacyEngineUsed: schema.literal(false), fallbackUsed: schema.literal(false), hardConstraintsBeforeRanking: schema.literal(true), userProjectionEligibilityAuthority: schema.literal(false), commercialInfluence: schema.literal(false) }),
  envelopeHash: sha256,
});
export type DecisionProductExecutionEnvelope = Infer<typeof DecisionProductExecutionEnvelopeSchema>;

export const DecisionProductExecutionSchema = schema.object({
  response: DecisionProductResponseSchema,
  envelope: DecisionProductExecutionEnvelopeSchema,
  projection: RelevantUserProjectionSchema,
  learningEvents: schema.array(ProductDecisionLearningInputSchema, { max: 52 }),
});
export type DecisionProductExecution = Infer<typeof DecisionProductExecutionSchema>;
