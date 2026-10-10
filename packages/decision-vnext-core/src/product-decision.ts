import { validateProductUnderstanding, type ProductInterpretation, type ProductUnderstanding } from "./product-request-understanding.js";
import { Buffer } from "node:buffer";
import {
  CONTRACT_VERSIONS,
  ProductDecisionLearningInputSchema,
  ProductDecisionLearningReceiptSchema,
  parseRelevantUserProjection,
  type ProductDecisionLearningInput,
  type RelevantUserProjection,
} from "@backyrd/user-intelligence-vnext-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import {
  DecisionProductCandidateSchema,
  DecisionProductEvaluationSchema, DecisionProductExecutionEnvelopeSchema, DecisionProductExecutionSchema,
  DecisionProductInteractionRequestSchema, DecisionProductInteractionResponseSchema,
  DecisionProductPresentationSchema, DecisionProductRankVectorSchema, DecisionProductRequestSchema,
  DecisionProductResponseSchema, PRODUCT_DECISION_VERSIONS,
  type DecisionProductCandidateAssessment, type DecisionProductEvaluation, type DecisionProductExecution,
  type DecisionProductInteractionRequest, type DecisionProductPresentation, type DecisionProductRequest,
  type DecisionProductResponse,
} from "./product-v1-contracts.js";
import { DECISION_PRODUCT_EVALUATION_POLICY, DECISION_PRODUCT_EVALUATION_RELEASE, DECISION_PRODUCT_INTENT_POLICY, DECISION_PRODUCT_RANKING_POLICY } from "./product-v1-authority.js";
import { decodeWorldPreference, decodeWorldQueryConstraint, PRODUCT_INDOOR_CONSTRAINT } from "./product-query-semantics.js";

const tierScore = { ELIGIBLE_CONFIRMED: 3, UNCONFIRMED_FALLBACK: 2, NOT_CONFIGURED: 1, INELIGIBLE: 0 } as const;
const coreScore = { CONFIRMED: 5, UNKNOWN: 3, NOT_CONFIGURED: 2, NOT_APPLICABLE: 1, DISPUTED: 0, INCOMPATIBLE: -1 } as const;
const availabilityScore = { open: 6, not_requested: 5, unknown: 4, not_authorized: 3, expired: 2, disputed: 1, closed: 0 } as const;
const positiveDirectStates = new Set(["SAVED", "REPEATEDLY_SELECTED", "VISITED"]);
const negativeDirectStates = new Set(["EXCLUDED"]);
const PRODUCT_PRESENTATION_WINDOW = 8;
const situationalExperienceCategories = new Set([
  "EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "CULTURE_ARTS",
  "ENTERTAINMENT", "ACTIVITIES_PLAY", "OUTDOOR_NATURE", "ATTRACTIONS_LANDMARKS",
]);

type RankableCandidate = DecisionProductResponse["candidates"][number];
type ProductReason = RankableCandidate["reasons"][number];
type CandidateForRanking = Pick<RankableCandidate, "spotId" | "tier" | "coreIntentCoverage" | "actualAvailability" | "unknownHardConstraints" | "contextualReject" | "rankVector">;
type RankedCandidate = CandidateForRanking & {
  readonly assessment: DecisionProductCandidateAssessment;
  readonly presentation: DecisionProductPresentation;
  readonly rank: number | null;
  readonly comparativeReason: ProductReason | null;
};

const reasonDomain = (domain: DecisionProductCandidateAssessment["reasons"][number]["domain"]): ProductReason["domain"] =>
  domain === "LIMITATION" ? "LIMITATION" : domain;

function userRelevance(candidate: DecisionProductCandidateAssessment, projection: RelevantUserProjection) {
  const direct = projection.status === "ACTIVE"
    ? projection.directSpot.filter((item) => item.spotId === candidate.candidateId && (positiveDirectStates.has(item.state) || negativeDirectStates.has(item.state))).sort((a, b) => b.confidence - a.confidence)[0]
    : undefined;
  const matches = projection.status === "ACTIVE" ? candidate.userTasteMatches : [];
  const weighted = matches.reduce((sum, item) => sum + item.affinity * item.confidence, 0);
  const weight = matches.reduce((sum, item) => sum + Math.abs(item.affinity) * item.confidence, 0);
  const tasteConfidence = matches.length ? Math.min(1, weight / matches.length) : 0;
  const state = direct && positiveDirectStates.has(direct.state) ? "POSITIVE_DIRECT" as const
    : direct && negativeDirectStates.has(direct.state) ? "NEGATIVE_DIRECT" as const
      : matches.length && weighted > 0.05 ? "POSITIVE_TASTE" as const
        : matches.length && weighted < -0.05 ? "NEGATIVE_TASTE" as const
          : matches.length ? "MIXED_TASTE" as const : "NEUTRAL" as const;
  return {
    state,
    confidence: direct?.confidence ?? (state === "POSITIVE_TASTE" || state === "NEGATIVE_TASTE" ? tasteConfidence : 0),
    sourceHash: contentHash({ projectionHash: projection.projectionHash, candidateId: candidate.candidateId, direct: direct ?? null, matches }),
  };
}

const userRelevanceScore = (state: ReturnType<typeof userRelevance>["state"]): number => ({
  POSITIVE_DIRECT: 5, POSITIVE_TASTE: 4, MIXED_TASTE: 3, NEUTRAL: 3, NEGATIVE_TASTE: 2, NEGATIVE_DIRECT: 1,
})[state];

function vector(candidate: DecisionProductCandidateAssessment, projection: RelevantUserProjection) {
  const hardConstraintState = candidate.failedHardConstraints.length || candidate.rejectionClass === "SITUATIONAL_REJECT"
    ? "FAIL" as const : candidate.unknownHardConstraints.length ? "UNKNOWN" as const : "PASS" as const;
  const body = {
    hardConstraintState,
    eligibilityTier: candidate.tier,
    coreIntentState: candidate.coreIntentCoverage.state,
    primaryVisitPurposeState: candidate.primaryVisitPurpose.state,
    actualAvailability: candidate.actualAvailability.status,
    userRelevance: userRelevance(candidate, projection),
    contextFit: {
      secondaryIntentConfirmed: candidate.secondaryIntentCoverage.state === "CONFIRMED",
      visitSituationConfirmed: candidate.visitSituation.state === "CONFIRMED",
      matchedSoftPreferenceCount: candidate.matchedSoftPreferences.length,
      atmosphereConfirmed: candidate.atmosphere.state === "CONFIRMED",
      typicalDaypartConfirmed: candidate.typicalDaypart.state === "CONFIRMED",
    },
    worldEvidence: {
      conflictFree: candidate.conflicts.length === 0,
      confirmedReasonCount: candidate.reasons.filter((reason) => reason.domain === "WORLD" && reason.confirmed && !reason.reasonCode.startsWith("primary-purpose-")).length,
    },
    neutralIdentity: candidate.neutralTieBreakerHash,
  };
  return deepFreeze(DecisionProductRankVectorSchema.parse({ ...body, vectorHash: contentHash(body) }));
}

function compareBoolean(left: boolean, right: boolean): number { return Number(right) - Number(left); }
function compareNumber(left: number, right: number): number { return right - left; }

function rankingChecks(left: CandidateForRanking, right: CandidateForRanking): readonly (readonly [number, string])[] {
  const a = left.rankVector; const b = right.rankVector;
  const hard = compareNumber(a.hardConstraintState === "PASS" ? 2 : a.hardConstraintState === "UNKNOWN" ? 1 : 0, b.hardConstraintState === "PASS" ? 2 : b.hardConstraintState === "UNKNOWN" ? 1 : 0);
  return [
    [hard, "der besser belegten Erfüllung harter Bedingungen"],
    [compareNumber(tierScore[a.eligibilityTier], tierScore[b.eligibilityTier]), "der besser belegten Eignungsklasse"],
    [compareNumber(coreScore[a.coreIntentState], coreScore[b.coreIntentState]), "der besser belegten Hauptabsicht"],
    [compareNumber(coreScore[a.primaryVisitPurposeState], coreScore[b.primaryVisitPurposeState]), "des zusätzlich bestätigten Hauptzwecks"],
    [compareNumber(availabilityScore[a.actualAvailability], availabilityScore[b.actualAvailability]), "der besser belegten Verfügbarkeit"],
    [compareBoolean(a.contextFit.secondaryIntentConfirmed, b.contextFit.secondaryIntentConfirmed), "einer bestätigten Nebenabsicht"],
    [compareBoolean(a.contextFit.visitSituationConfirmed, b.contextFit.visitSituationConfirmed), "der bestätigten Besuchssituation"],
    [compareNumber(a.contextFit.matchedSoftPreferenceCount, b.contextFit.matchedSoftPreferenceCount), "weiterer bestätigter Kontextmerkmale"],
    [compareBoolean(a.contextFit.atmosphereConfirmed, b.contextFit.atmosphereConfirmed), "der bestätigten Atmosphäre"],
    [compareBoolean(a.contextFit.typicalDaypartConfirmed, b.contextFit.typicalDaypartConfirmed), "der bestätigten Tageszeit"],
    [compareNumber(userRelevanceScore(a.userRelevance.state), userRelevanceScore(b.userRelevance.state)), "der consentgebundenen persönlichen Passung"],
    [compareNumber(a.userRelevance.confidence, b.userRelevance.confidence), "der Stärke der consentgebundenen persönlichen Evidenz"],
    [compareBoolean(a.worldEvidence.conflictFree, b.worldEvidence.conflictFree), "weniger widersprüchlicher World-Angaben"],
    [compareNumber(a.worldEvidence.confirmedReasonCount, b.worldEvidence.confirmedReasonCount), "zusätzlicher bestätigter World-Gründe"],
    [a.neutralIdentity.localeCompare(b.neutralIdentity), "eines neutralen stabilen Tie-Breakers, nicht wegen einer besser belegten Passung"],
  ];
}

function compareCandidates(left: CandidateForRanking, right: CandidateForRanking): number {
  return rankingChecks(left, right).find(([difference]) => difference !== 0)?.[0] ?? 0;
}

function rankable(candidate: CandidateForRanking, situationalIds: ReadonlySet<string> | null = null): boolean {
  const onlyRequestedDayOpeningUnknown = candidate.unknownHardConstraints.length > 0
    && candidate.unknownHardConstraints.every((constraint) => constraint === "OPEN_ON_REQUESTED_DAY")
    && ["unknown", "not_authorized", "expired", "disputed"].includes(candidate.actualAvailability);
  return (situationalIds === null || situationalIds.has(candidate.spotId))
    && candidate.tier !== "INELIGIBLE"
    && (candidate.rankVector.hardConstraintState === "PASS" || onlyRequestedDayOpeningUnknown)
    && candidate.coreIntentCoverage !== "INCOMPATIBLE"
    && candidate.coreIntentCoverage !== "DISPUTED"
    && !candidate.contextualReject;
}

function presentationsById(candidates: readonly DecisionProductCandidateAssessment[], raw: readonly unknown[]): ReadonlyMap<string, DecisionProductPresentation> {
  const presentations = raw.map((value) => DecisionProductPresentationSchema.parse(value));
  for (const presentation of presentations) assertContentHash(presentation as unknown as Record<string, unknown>, "presentationHash");
  const byId = new Map(presentations.map((value) => [value.spotId, value]));
  const candidateIds = new Set(candidates.map((value) => value.candidateId));
  if (byId.size !== presentations.length || byId.size !== candidateIds.size || presentations.some((value) => !candidateIds.has(value.spotId))) throw new Error("product_decision_presentation_binding_invalid");
  return byId;
}

function candidateRows(evaluation: DecisionProductEvaluation, projection: RelevantUserProjection, presentations: readonly unknown[], situationalIds: ReadonlySet<string> | null): readonly RankedCandidate[] {
  const byId = presentationsById(evaluation.candidates, presentations);
  // Validate every rank vector, but build the large hashed presentation only
  // for the final window. A city cohort may contain hundreds of candidates.
  const rows = evaluation.candidates.map((candidate) => {
    const presentation = byId.get(candidate.candidateId); if (!presentation) throw new Error("product_decision_presentation_missing");
    const rankVector = vector(candidate, projection);
    return {
      assessment: candidate, spotId: candidate.candidateId, presentation, tier: candidate.tier, rank: null,
      coreIntentCoverage: candidate.coreIntentCoverage.state, actualAvailability: candidate.actualAvailability.status,
      unknownHardConstraints: candidate.unknownHardConstraints, rankVector,
      contextualReject: candidate.rejectionClass === "SITUATIONAL_REJECT", comparativeReason: null,
    };
  }).sort(compareCandidates);
  let position = 0;
  const rankedRows = rows.filter((candidate) => rankable(candidate, situationalIds));
  return deepFreeze(rows.map((candidate) => {
    const ranked = rankable(candidate, situationalIds); if (ranked) position += 1;
    const next = ranked ? rankedRows[position] : undefined;
    const decidingFactor = next ? rankingChecks(candidate, next).find(([difference]) => difference < 0)?.[1] : undefined;
    const comparativeReason: ProductReason | null = decidingFactor
      ? { code: "product-rank-versus-next-v1", domain: "RANKING", sourceHash: DECISION_PRODUCT_RANKING_POLICY.policyHash, statement: `Vor dem nächsten Platz wegen ${decidingFactor}.`, confirmed: true } : null;
    return { ...candidate, rank: ranked ? position : null, comparativeReason };
  }));
}

function materializeCandidate(candidate: RankedCandidate): RankableCandidate {
  const assessment = candidate.assessment;
  const reasons: ProductReason[] = [
    ...assessment.reasons.map((item) => ({ code: item.reasonCode, domain: reasonDomain(item.domain), sourceHash: item.sourceHash, statement: item.statementDe, confirmed: item.confirmed })),
    { code: "product-ranking-policy-v3", domain: "RANKING", sourceHash: DECISION_PRODUCT_RANKING_POLICY.policyHash, statement: "Zuerst zählen belegte Eignung und der Wunsch für diesen Moment; persönliche Vorlieben kommen danach.", confirmed: true },
    ...(candidate.comparativeReason ? [candidate.comparativeReason] : []),
  ];
  return DecisionProductCandidateSchema.parse(withContentHash({
    spotId: candidate.spotId, presentation: candidate.presentation, tier: candidate.tier, rank: candidate.rank,
    coreIntentCoverage: candidate.coreIntentCoverage, actualAvailability: candidate.actualAvailability,
    confirmedHardConstraints: assessment.confirmedHardConstraints, unknownHardConstraints: assessment.unknownHardConstraints,
    failedHardConstraints: assessment.failedHardConstraints, rankVector: candidate.rankVector, reasons,
    limitations: assessment.limitations, contextualReject: candidate.contextualReject,
  }, "candidateHash"));
}

export interface DecisionProductBuildInput {
  readonly request: unknown;
  readonly evaluation: unknown;
  readonly projection: unknown;
  readonly presentations: readonly unknown[];
  readonly actor: { readonly subjectBindingHash: string; readonly authenticationContextHash: string; readonly sessionBindingHash: string; readonly sessionId: string };
  readonly authority: { readonly serverTime: string; readonly authorizedCity: string; readonly locationBindingHash: string };
  readonly evaluatorContractVersion: string;
}

export function buildDecisionProductExecution(input: DecisionProductBuildInput): DecisionProductExecution {
  const request = DecisionProductRequestSchema.parse(input.request);
  const requestHash = contentHash(request); const decisionId = `decision-${contentHash({ requestId: request.requestId, idempotencyKey: request.idempotencyKey }).slice(0, 32)}`;
  const evaluation = DecisionProductEvaluationSchema.parse(input.evaluation);
  assertContentHash(evaluation as unknown as Record<string, unknown>, "evaluationHash");
  if (evaluation.requestHash !== requestHash || evaluation.evaluatorVersion !== input.evaluatorContractVersion || evaluation.evaluationPolicyHash !== DECISION_PRODUCT_EVALUATION_POLICY.policyHash || evaluation.evaluationReleaseHash !== DECISION_PRODUCT_EVALUATION_RELEASE.releaseHash || evaluation.intentPolicyHash !== DECISION_PRODUCT_INTENT_POLICY.policyHash || evaluation.sourceKind !== "CANONICAL_PRODUCT_PORTS") throw new Error("product_decision_evaluation_authority_invalid");
  for (const candidate of evaluation.candidates) assertContentHash(candidate as unknown as Record<string, unknown>, "assessmentHash");
  const projection = parseRelevantUserProjection(input.projection);
  if (evaluation.userProjectionHash !== projection.projectionHash) throw new Error("product_decision_projection_binding_invalid");
  if (projection.decisionId !== decisionId || (projection.status === "ACTIVE" && projection.subjectBindingHash !== input.actor.subjectBindingHash)) throw new Error("product_decision_projection_subject_invalid");
  if (evaluation.interpretation.targetCity !== input.authority.authorizedCity) throw new Error("product_decision_location_binding_invalid");
  if (projection.boundaries.eligibilityAuthority || projection.boundaries.rankingAuthority) throw new Error("product_decision_user_authority_forbidden");
  const learningEvents = buildDecisionLearningEvents({ request, projection, sessionId: input.actor.sessionId, decisionId, contextHash: evaluation.interpretation.interpretationHash, occurredAt: input.authority.serverTime });
  const envelopeBody = {
    contractVersion: PRODUCT_DECISION_VERSIONS.envelope, decisionId, requestHash,
    idempotencyIdentityHash: contentHash({ subjectBindingHash: input.actor.subjectBindingHash, idempotencyKey: request.idempotencyKey, requestHash }),
    actor: { subjectBindingHash: input.actor.subjectBindingHash, authenticationContextHash: input.actor.authenticationContextHash, sessionBindingHash: input.actor.sessionBindingHash, boundBy: "SERVER" as const },
    authority: { ...input.authority, purpose: "PRODUCT_DECISION" as const, transportSlug: "decision-v13" as const },
    bindings: { worldCohortHash: evaluation.worldCohort.cohortHash, userProjectionHash: projection.projectionHash, contextHash: evaluation.interpretation.interpretationHash, rankingPolicyHash: DECISION_PRODUCT_RANKING_POLICY.policyHash, evaluatorContractVersion: evaluation.evaluatorVersion },
    boundaries: { authenticatedAccountsOnly: true as const, founderAllowlistUsed: false as const, legacyEngineUsed: false as const, fallbackUsed: false as const, hardConstraintsBeforeRanking: true as const, userProjectionEligibilityAuthority: false as const, commercialInfluence: false as const },
  };
  const envelope = DecisionProductExecutionEnvelopeSchema.parse(withContentHash(envelopeBody, "envelopeHash"));
  // Rank the complete canonical World cohort before choosing a presentation
  // window. The durable, byte-identical idempotency record is capped at 64 KiB;
  // a city-sized cohort must not turn an otherwise valid request into a 503.
  // An unspecified activity is not a license to invent a restaurant/bar
  // intent. It can, however, support a provisional situation-first choice
  // when canonical World evidence explicitly confirms that company/context.
  // Hotels, gyms and other non-visit categories are not generic substitutes.
  const situation = evaluation.interpretation.group.companionType;
  const situationRequested = situation !== null && ["DATE_PAIR", "FRIENDS_GROUP", "FAMILY", "ALONE"].includes(situation)
    && evaluation.interpretation.softPreferences.includes(`WK:context.visit_situations:${situation}`);
  const situationalIds = evaluation.interpretation.primaryIntent !== null ? null : new Set(
    situationRequested ? evaluation.candidates.filter((candidate) => candidate.visitSituation.state === "CONFIRMED"
      && situationalExperienceCategories.has(candidate.worldClassification.primaryCategory ?? "")).map((candidate) => candidate.candidateId) : [],
  );
  const ranked = candidateRows(evaluation, projection, input.presentations, situationalIds);
  const available = ranked.filter((candidate) => rankable(candidate, situationalIds));
  const previouslyPresented = new Set(request.previouslyPresentedCandidateIds);
  const firstUnseenIndex = available.findIndex((candidate) => !previouslyPresented.has(candidate.spotId));
  const maxWindowSize = firstUnseenIndex < 0 ? 0 : Math.min(PRODUCT_PRESENTATION_WINDOW, available.length - firstUnseenIndex);
  for (let windowSize = maxWindowSize; windowSize >= (maxWindowSize === 0 ? 0 : 1); windowSize -= 1) {
    const selected = firstUnseenIndex < 0 ? ranked.filter((candidate) => !rankable(candidate, situationalIds)).slice(0, PRODUCT_PRESENTATION_WINDOW)
      : ranked.length <= PRODUCT_PRESENTATION_WINDOW && windowSize === maxWindowSize ? ranked
        : available.slice(firstUnseenIndex, firstUnseenIndex + windowSize);
    const candidates = selected.map(materializeCandidate);
    const primary = firstUnseenIndex < 0 ? null : available[firstUnseenIndex];
    const responseBody = {
      contractVersion: PRODUCT_DECISION_VERSIONS.response, status: "AVAILABLE" as const, decisionId, requestHash, envelopeHash: envelope.envelopeHash,
      rankingPolicyVersion: PRODUCT_DECISION_VERSIONS.rankingPolicy, rankingPolicyHash: DECISION_PRODUCT_RANKING_POLICY.policyHash,
      interpretation: evaluation.interpretation, primaryCandidateId: primary?.spotId ?? null, candidates,
      limitations: candidates.filter((candidate) => rankable(candidate, situationalIds)).length < available.length ? [...evaluation.limitations, "CANDIDATE_WINDOW_LIMITED"] : evaluation.limitations,
      alternative: { requested: request.alternativeRequested, selectedCandidateId: request.alternativeRequested ? primary?.spotId ?? null : null, negativeSignalProduced: false as const },
      reject: { candidateIds: request.rejectedCandidateIds, contextualOnly: true as const, worldFactProduced: false as const },
      personalization: { state: projection.status, neutralReason: projection.neutralReason, projectionHash: projection.projectionHash },
      learning: {
        mode: projection.status === "ACTIVE" ? "CONSENT_BOUND_EVENTS" as const : "DISABLED_NEUTRAL" as const,
        acknowledgement: projection.status === "ACTIVE" ? "CONSENT_BOUND_IDEMPOTENT" as const : "NOT_APPLICABLE_NEUTRAL" as const,
        eventCount: learningEvents.length,
        rawTextIncluded: false as const,
      },
      productOutputAuthorized: true as const, legacyEngineUsed: false as const, fallbackUsed: false as const,
    };
    const response = DecisionProductResponseSchema.parse(withContentHash(responseBody, "resultHash"));
    const execution = DecisionProductExecutionSchema.parse({ response, envelope, projection, learningEvents });
    if (Buffer.byteLength(canonicalJson(execution), "utf8") <= 65_536) return deepFreeze(execution);
  }
  throw new Error("product_decision_response_budget_exceeded");
}

export function buildDecisionLearningEvents(input: {
  readonly request: DecisionProductRequest; readonly projection: RelevantUserProjection; readonly sessionId: string;
  readonly decisionId: string; readonly contextHash: string; readonly occurredAt: string;
}): readonly ProductDecisionLearningInput[] {
  if (input.projection.status !== "ACTIVE") return deepFreeze([]);
  const specs: Array<{ eventType: ProductDecisionLearningInput["eventType"]; candidateId: string | null; spotId: string | null }> = [
    { eventType: "decision_requested", candidateId: null, spotId: null },
  ];
  if (input.request.alternativeRequested) specs.push({ eventType: "alternative_requested", candidateId: null, spotId: null });
  for (const spotId of [...new Set(input.request.rejectedCandidateIds)].sort()) specs.push({ eventType: "candidate_rejected", candidateId: spotId, spotId });
  return deepFreeze(specs.map((spec) => {
    const identity = contentHash({ decisionId: input.decisionId, sessionId: input.sessionId, contextBindingHash: input.contextHash, ...spec });
    return ProductDecisionLearningInputSchema.parse({
      contractVersion: CONTRACT_VERSIONS.productDecisionLearningInput,
      eventId: `decision-event-${identity.slice(0, 32)}`,
      idempotencyKey: `decision-learning-${identity}`,
      ...spec,
      decisionId: input.decisionId,
      sessionId: input.sessionId,
      contextBindingHash: input.contextHash,
      occurredAt: input.occurredAt,
      feedback: null,
      targetEventId: null,
    });
  }));
}

/** Builds UI interaction inputs for the same canonical User port; it does not mint event authority. */
export function buildDecisionInteractionLearningEvent(input: {
  readonly eventType: "candidate_impression" | "candidate_opened";
  readonly actionId: string;
  readonly sessionId: string;
  readonly candidateId: string;
  readonly occurredAt: string;
  readonly verifiedExecution: DecisionProductExecution;
}): ProductDecisionLearningInput {
  const execution = DecisionProductExecutionSchema.parse(input.verifiedExecution);
  const candidate = execution.response.candidates.find((item) => item.spotId === input.candidateId && item.rank !== null);
  if (!candidate) throw new Error("product_decision_interaction_candidate_not_presented");
  const decisionId = execution.response.decisionId;
  const contextBindingHash = execution.response.interpretation.interpretationHash;
  return ProductDecisionLearningInputSchema.parse({
    contractVersion: CONTRACT_VERSIONS.productDecisionLearningInput,
    eventId: `decision-event-${contentHash({ actionId: input.actionId, decisionId, eventType: input.eventType, candidateId: input.candidateId, contextBindingHash }).slice(0, 32)}`,
    idempotencyKey: `decision-learning-${contentHash({ actionId: input.actionId, decisionId, eventType: input.eventType })}`,
    eventType: input.eventType,
    decisionId,
    sessionId: input.sessionId,
    candidateId: input.candidateId,
    spotId: candidate.spotId,
    contextBindingHash,
    occurredAt: input.occurredAt,
    feedback: null,
    targetEventId: null,
  });
}

export function buildAuthorizedDecisionInteractionLearningEvent(input: {
  readonly request: DecisionProductInteractionRequest;
  readonly authority: { readonly sessionId: string; readonly spotId: string; readonly contextBindingHash: string; readonly occurredAt: string };
}): ProductDecisionLearningInput {
  const request = DecisionProductInteractionRequestSchema.parse(input.request);
  if (input.authority.spotId !== request.candidateId) throw new Error("product_decision_interaction_candidate_authority_invalid");
  return ProductDecisionLearningInputSchema.parse({
    contractVersion: CONTRACT_VERSIONS.productDecisionLearningInput,
    eventId: `decision-event-${contentHash({ actionId: request.actionId, decisionId: request.decisionId, eventType: request.eventType, candidateId: request.candidateId, contextBindingHash: input.authority.contextBindingHash }).slice(0, 32)}`,
    idempotencyKey: `decision-learning-${contentHash({ idempotencyKey: request.idempotencyKey, decisionId: request.decisionId, eventType: request.eventType })}`,
    eventType: request.eventType,
    decisionId: request.decisionId,
    sessionId: input.authority.sessionId,
    candidateId: request.candidateId,
    spotId: input.authority.spotId,
    contextBindingHash: input.authority.contextBindingHash,
    occurredAt: input.authority.occurredAt,
    feedback: null,
    targetEventId: null,
  });
}

export function validateDecisionProductExecution(input: DecisionProductBuildInput, supplied: unknown): DecisionProductExecution {
  const parsed = DecisionProductExecutionSchema.parse(supplied);
  const expected = buildDecisionProductExecution(input);
  if (canonicalJson(parsed) !== canonicalJson(expected)) throw new Error("product_decision_recursive_integrity_mismatch");
  return expected;
}

export type DecisionProductRuntimeBoundary = "REQUEST_START" | "AUTH" | "RATE_LIMIT" | "BODY_PARSE" | "INTERACTION_AUTHORITY" | "INTERPRETATION" | "EVALUATION" | "IDEMPOTENCY" | "LEARNING" | "FINAL_OUTPUT";
export interface DecisionProductRuntimeTiming {
  readonly stage: DecisionProductRuntimeBoundary;
  readonly controlBeforeMs: number;
  readonly operationMs: number;
  readonly controlAfterMs: number;
}
export interface DecisionProductAuthenticatedActor { readonly userId: string; readonly subjectBindingHash: string; readonly authenticationContextHash: string; readonly sessionBindingHash: string; readonly sessionId: string }
export interface DecisionProductRuntimePorts {
  readonly auth: { authenticate(token: string, signal: AbortSignal): Promise<DecisionProductAuthenticatedActor | null> };
  readonly rateLimit: { consume(subjectBindingHash: string, signal: AbortSignal): Promise<boolean> };
  readonly control: { assertBoundary(boundary: DecisionProductRuntimeBoundary, signal: AbortSignal): Promise<void> | void; readonly timeoutMilliseconds: number; readonly maxRequestBytes: number };
  readonly interpret?: (request: DecisionProductRequest, actor: DecisionProductAuthenticatedActor, signal: AbortSignal) => Promise<ProductInterpretation>;
  readonly evaluate: (request: DecisionProductRequest, actor: DecisionProductAuthenticatedActor, signal: AbortSignal, understanding?: ProductUnderstanding | null) => Promise<Omit<DecisionProductBuildInput, "request" | "actor">>;
  readonly idempotency: { commit(input: { subjectBindingHash: string; idempotencyKey: string; payloadHash: string; execution: DecisionProductExecution }, signal: AbortSignal): Promise<{ status: "CREATED" } | { status: "REPLAYED"; execution: unknown } | { status: "CONFLICT" | "EXPIRED" }> };
  readonly interaction: { resolve(input: { request: DecisionProductInteractionRequest; actor: DecisionProductAuthenticatedActor }, signal: AbortSignal): Promise<
    { status: "AUTHORIZED"; sessionId: string; spotId: string; contextBindingHash: string; occurredAt: string }
    | { status: "SUPPRESSED_NO_CONSENT" }
  > };
  readonly learning: {
    readonly contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0";
    record(event: ProductDecisionLearningInput, signal: AbortSignal): Promise<unknown>;
  };
  readonly diagnostics?: {
    reportFailure(stage: string, code: string): void;
    reportTimings?(outcome: "SUCCESS" | "ERROR", stages: readonly DecisionProductRuntimeTiming[]): void;
  };
}

export class DecisionProductError extends Error {
  constructor(readonly code: string, readonly status: number, readonly publicMessage: string) { super(code); this.name = "DecisionProductError"; }
}

const errorResponse = (error: DecisionProductError) => new Response(JSON.stringify({ contractVersion: PRODUCT_DECISION_VERSIONS.error, status: "UNAVAILABLE", error: { code: error.code, message: error.publicMessage }, legacyFallbackUsed: false }), { status: error.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/** Exactly one vNext product route. No allowlist, legacy invocation, dual run or fallback hook exists. */
export function createDecisionProductHttpHandler(ports: DecisionProductRuntimePorts): (request: Request) => Promise<Response> {
  return async (request) => {
    const abort = new AbortController();
    const timings: DecisionProductRuntimeTiming[] = [];
    const reportTimings = (outcome: "SUCCESS" | "ERROR") => {
      try { ports.diagnostics?.reportTimings?.(outcome, timings); } catch { /* Diagnostics may never affect a Decision. */ }
    };
    let stage: string = "REQUEST_START";
    const timeoutError = new DecisionProductError("REQUEST_TIMEOUT", 504, "Die sichere Auswertung hat zu lange gedauert.");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => { abort.abort(timeoutError); reject(timeoutError); }, ports.control.timeoutMilliseconds);
    });
    const race = <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, deadline]);
    const at = async <T>(boundary: DecisionProductRuntimeBoundary, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      stage = boundary;
      const elapsed = { stage: boundary, controlBeforeMs: 0, operationMs: 0, controlAfterMs: 0 };
      const measure = async <V>(key: "controlBeforeMs" | "operationMs" | "controlAfterMs", call: () => Promise<V> | V): Promise<V> => {
        const started = performance.now();
        try { return await race(Promise.resolve(call())); }
        finally { elapsed[key] = Math.round(performance.now() - started); }
      };
      try {
        await measure("controlBeforeMs", () => ports.control.assertBoundary(boundary, abort.signal));
        const result = await measure("operationMs", () => operation(abort.signal));
        // A control transition during an awaited operation must suppress its
        // result, including a response assembled from already-read data.
        await measure("controlAfterMs", () => ports.control.assertBoundary(boundary, abort.signal));
        return result;
      } finally { timings.push(elapsed); }
    };
    try {
      await at("REQUEST_START", async () => undefined);
      if (request.method !== "POST") throw new DecisionProductError("METHOD_NOT_ALLOWED", 405, "Diese Decision-Route unterstützt nur POST.");
      const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) throw new DecisionProductError("UNAUTHENTICATED", 401, "Bitte melde dich an.");
      const actor = await at("AUTH", (signal) => ports.auth.authenticate(token, signal));
      if (!actor) throw new DecisionProductError("UNAUTHENTICATED", 401, "Die Anmeldung ist ungültig oder abgelaufen.");
      if (!await at("RATE_LIMIT", (signal) => ports.rateLimit.consume(actor.subjectBindingHash, signal))) throw new DecisionProductError("RATE_LIMITED", 429, "Zu viele Anfragen. Bitte versuche es später erneut.");
      const parsedRequest = await at("BODY_PARSE", async () => {
        const text = await request.text(); if (new TextEncoder().encode(text).length > ports.control.maxRequestBytes) throw new DecisionProductError("REQUEST_TOO_LARGE", 413, "Die Anfrage ist zu groß.");
        let raw: unknown; try { raw = JSON.parse(text); } catch { throw new DecisionProductError("INVALID_JSON", 400, "Die Anfrage enthält kein gültiges JSON."); }
        const version = raw && typeof raw === "object" && "contractVersion" in raw ? (raw as { contractVersion?: unknown }).contractVersion : null;
        return version === PRODUCT_DECISION_VERSIONS.interactionRequest
          ? DecisionProductInteractionRequestSchema.parse(raw)
          : DecisionProductRequestSchema.parse(raw);
      });
      if (parsedRequest.contractVersion === PRODUCT_DECISION_VERSIONS.interactionRequest) {
        const authority = await at("INTERACTION_AUTHORITY", (signal) => ports.interaction.resolve({ request: parsedRequest, actor }, signal));
        if (authority.status === "AUTHORIZED") {
          const event = buildAuthorizedDecisionInteractionLearningEvent({ request: parsedRequest, authority });
          await at("LEARNING", async (signal) => {
            if (ports.learning.contractVersion !== "backyrd.user-intelligence.product-decision-learning-port@1.0") throw new Error("product_decision_learning_port_version_invalid");
            ProductDecisionLearningReceiptSchema.parse(await ports.learning.record(event, signal));
          });
        }
        await at("FINAL_OUTPUT", async () => undefined);
        const response = DecisionProductInteractionResponseSchema.parse({
          contractVersion: PRODUCT_DECISION_VERSIONS.interactionResponse,
          status: "ACKNOWLEDGED",
          decisionId: parsedRequest.decisionId,
          candidateId: parsedRequest.candidateId,
          eventType: parsedRequest.eventType,
          legacyWriteUsed: false,
          fallbackUsed: false,
        });
        reportTimings("SUCCESS");
        return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
      }
      const interpreted = ports.interpret
        ? await at("INTERPRETATION", (signal) => ports.interpret!(parsedRequest, actor, signal))
        : { request: parsedRequest, understanding: null };
      if (!interpreted || Object.keys(interpreted).sort().join() !== "request,understanding") throw new Error("product_ai_intent_request_boundary_invalid");
      const productRequest = DecisionProductRequestSchema.parse(interpreted.request);
      const understanding = interpreted.understanding === null ? null : validateProductUnderstanding(interpreted.understanding, productRequest);
      const withoutInterpretedFields = (explicit: DecisionProductRequest["explicit"]): Record<string, unknown> =>
        Object.fromEntries(Object.entries(explicit).filter(([key]) =>
          !["primaryIntent", "secondaryIntent", "softPreferences", "hardConstraints", "unresolvedTerms"].includes(key)));
      const originalSoft = new Set(parsedRequest.explicit.softPreferences ?? []);
      const interpretedSoft = new Set(productRequest.explicit.softPreferences ?? []);
      const originalHard = new Set(parsedRequest.explicit.hardConstraints ?? []);
      const interpretedHard = new Set(productRequest.explicit.hardConstraints ?? []);
      const originalUnresolved = new Set(parsedRequest.explicit.unresolvedTerms ?? []);
      const interpretedUnresolved = new Set(productRequest.explicit.unresolvedTerms ?? []);
      if (productRequest.requestId !== parsedRequest.requestId || productRequest.idempotencyKey !== parsedRequest.idempotencyKey
        || productRequest.naturalLanguage !== parsedRequest.naturalLanguage
        || canonicalJson(productRequest.alternativeRequested) !== canonicalJson(parsedRequest.alternativeRequested)
        || canonicalJson(productRequest.previouslyPresentedCandidateIds) !== canonicalJson(parsedRequest.previouslyPresentedCandidateIds)
        || canonicalJson(productRequest.rejectedCandidateIds) !== canonicalJson(parsedRequest.rejectedCandidateIds)
        || canonicalJson(withoutInterpretedFields(productRequest.explicit)) !== canonicalJson(withoutInterpretedFields(parsedRequest.explicit))
        || Object.hasOwn(parsedRequest.explicit, "primaryIntent") && productRequest.explicit.primaryIntent !== parsedRequest.explicit.primaryIntent
        || Object.hasOwn(parsedRequest.explicit, "secondaryIntent") && productRequest.explicit.secondaryIntent !== parsedRequest.explicit.secondaryIntent
        || [...originalSoft].some((value) => !interpretedSoft.has(value))
        || [...interpretedSoft].some((value) => !originalSoft.has(value) && decodeWorldPreference(value) === null)
        || [...originalHard].some((value) => !interpretedHard.has(value))
        || [...interpretedHard].some((value) => !originalHard.has(value) && value !== PRODUCT_INDOOR_CONSTRAINT && decodeWorldQueryConstraint(value) === null)
        || [...originalUnresolved].some((value) => !interpretedUnresolved.has(value))) {
        throw new Error("product_ai_intent_request_boundary_invalid");
      }
      const evaluated = await at("EVALUATION", (signal) => ports.evaluate(productRequest, actor, signal, understanding));
      stage = "RESPONSE_BUILD";
      const expectedInput = { request: productRequest, actor, ...evaluated }; const execution = buildDecisionProductExecution(expectedInput);
      const committed = await at("IDEMPOTENCY", (signal) => ports.idempotency.commit({ subjectBindingHash: actor.subjectBindingHash, idempotencyKey: productRequest.idempotencyKey, payloadHash: contentHash(productRequest), execution }, signal));
      if (committed.status === "CONFLICT" || committed.status === "EXPIRED") throw new DecisionProductError("IDEMPOTENCY_CONFLICT", 409, "Diese Anfrage-ID wurde bereits mit anderen Eingaben verwendet oder ist abgelaufen.");
      const resolved = committed.status === "REPLAYED" ? validateDecisionProductExecution(expectedInput, committed.execution) : execution;
      await at("LEARNING", async (signal) => {
        if (ports.learning.contractVersion !== "backyrd.user-intelligence.product-decision-learning-port@1.0") throw new Error("product_decision_learning_port_version_invalid");
        for (const event of resolved.learningEvents) {
          const receipt = ProductDecisionLearningReceiptSchema.parse(await ports.learning.record(event, signal));
          if (!receipt.persisted || receipt.neutralProjectionRequired || !["PERSISTED", "REPLAYED"].includes(receipt.status)) throw new Error("product_decision_learning_projection_became_neutral");
        }
      });
      await at("FINAL_OUTPUT", async () => undefined);
      reportTimings("SUCCESS");
      return new Response(JSON.stringify(resolved.response), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch (error) {
      const known = error instanceof DecisionProductError ? error : new DecisionProductError("DECISION_UNAVAILABLE", 503, "Decision ist momentan nicht verfügbar. Bitte versuche es später erneut.");
      const internalCode = error instanceof Error && /^product_[a-z0-9_]{1,75}$/.test(error.message) ? error.message : known.code;
      try { ports.diagnostics?.reportFailure(stage, internalCode); } catch { /* Diagnostics may never change the fail-closed response. */ }
      reportTimings("ERROR");
      return errorResponse(known);
    } finally { if (timeout) clearTimeout(timeout); }
  };
}
