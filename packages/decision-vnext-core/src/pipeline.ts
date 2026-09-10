import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { BASELINE_FIXTURES, rankBaselineA, rankBaselineB, type BaselineId, type RankedCandidate } from "./baselines.js";
import { generateNeutralCandidatePool, validateCandidatePool } from "./candidate-pool.js";
import { buildPhase1Confidence } from "./confidence.js";
import { CONTRACT_VERSIONS, DecisionExecutionEnvelopeSchema, DecisionRecommendationSchema, DecisionRequestSchema, DecisionResultSchema, type DecisionExecutionEnvelope, type DecisionRecommendation, type DecisionRequest, type DecisionResult, type EngineManifest } from "./contracts.js";
import { resolvePhase1Context, validateSituationalContext } from "./context.js";
import { applyPhase1Eligibility, validateEligibilityResult } from "./eligibility.js";
import { authorizeReasons, renderAuthorizedReasons, validateExplanation } from "./explanation.js";
import { validateEngineManifest } from "./manifest.js";
import type { SyntheticWorld } from "./sandbox.js";
import { buildSyntheticNeutralProjection } from "./sandbox.js";
import { candidateEvidence } from "./evidence.js";
import { createSyntheticExecution } from "./execution.js";
import { SYNTHETIC_MANIFEST } from "@backyrd/user-intelligence-vnext-core";

function assertBaselineManifest(baseline: BaselineId, manifest: EngineManifest): void {
  const fixture = baseline === "baseline-a-open-distance-popularity" ? BASELINE_FIXTURES.a : BASELINE_FIXTURES.b;
  if (manifest.rankingVersion !== fixture.rankingVersion || manifest.weightFixtureVersion !== fixture.weightFixtureVersion) {
    throw new Error("engine_manifest_baseline_mismatch");
  }
}

export function runPhase1Decision(input: {
  request: unknown;
  execution: unknown;
  world: SyntheticWorld;
  baseline: BaselineId;
  candidatePoolSize?: number;
  resultLimit?: number;
}): DecisionResult {
  const request = DecisionRequestSchema.parse(input.request);
  const execution = DecisionExecutionEnvelopeSchema.parse(input.execution);
  assertContentHash(execution as unknown as Record<string, unknown>, "envelopeHash");
  validateEngineManifest(execution.engineManifest);
  if (execution.deadlineAt < execution.executedAt) throw new Error("execution_deadline_invalid");
  assertBaselineManifest(input.baseline, execution.engineManifest);
  if (execution.engineManifest.sandboxWorldVersion !== input.world.version) throw new Error("engine_manifest_world_mismatch");
  const expectedExecution = createSyntheticExecution({ request, world: input.world, baseline: input.baseline, sourceSha: execution.engineManifest.sourceSha, authorizedLocationScope: execution.authorizedLocationScope, ...(input.candidatePoolSize === undefined ? {} : { candidatePoolSize: input.candidatePoolSize }), actor: execution.authenticatedActor, personalizationKillSwitch: execution.personalizationKillSwitch });
  if (execution.envelopeHash !== expectedExecution.envelopeHash) throw new Error("execution_binding_mismatch");
  if (request.location.kind !== "city") throw new Error("phase1_city_location_required");
  const context = resolvePhase1Context(request, { decisionId: execution.decisionId, sessionId: execution.sessionId, executedAt: execution.executedAt, actorSubjectBindingHash: execution.authenticatedActor.subjectBindingHash, authorizedLocationScope: execution.authorizedLocationScope });
  const candidatePool = generateNeutralCandidatePool({ world: input.world, context, serverRequestId: execution.serverRequestId, ...(input.candidatePoolSize === undefined ? {} : { limit: input.candidatePoolSize }) });
  validateCandidatePool(candidatePool);
  if (candidatePool.candidates.some((entry) => entry.candidate.worldReference.registryVersion !== execution.engineManifest.worldRegistryVersion)) {
    throw new Error("engine_manifest_world_registry_mismatch");
  }
  const eligibility = applyPhase1Eligibility(candidatePool, context);
  const projection = buildSyntheticNeutralProjection({ requestId: execution.serverRequestId, decisionId: execution.decisionId, userId: execution.authenticatedActor.kind === "user" ? execution.authenticatedActor.userId : "synthetic-anonymous-user", subjectBindingHash: execution.authenticatedActor.subjectBindingHash, contextHash: context.contextHash, intentKeys: context.explicit.intentKeys, killSwitch: execution.personalizationKillSwitch });
  const ranked: readonly RankedCandidate[] = input.baseline === "baseline-a-open-distance-popularity"
    ? rankBaselineA(eligibility.eligible)
    : rankBaselineB(eligibility.eligible, context);
  const selected = ranked.slice(0, input.resultLimit ?? 3);
  const recommendations: DecisionRecommendation[] = selected.map((entry, index) => {
    const next = ranked[index + 1];
    const confidence = buildPhase1Confidence({ candidate: entry.eligibleCandidate, context, fixtureScore: entry.fixtureScore, userState: projection, ...(next === undefined ? {} : { nextFixtureScore: next.fixtureScore }) });
    const claims = authorizeReasons(entry.eligibleCandidate.candidate, entry.fit, confidence);
    const reasons = renderAuthorizedReasons(claims, candidateEvidence(entry.eligibleCandidate.candidate));
    validateExplanation(reasons, entry.eligibleCandidate.candidate);
    return DecisionRecommendationSchema.parse(withContentHash({
      contractVersion: CONTRACT_VERSIONS.recommendation,
      spotId: entry.eligibleCandidate.candidate.spotId,
      rank: index + 1,
      eligibility: entry.eligibleCandidate.eligibility,
      fit: entry.fit,
      confidence,
      reasons,
    }, "recommendationHash"));
  });
  const result = DecisionResultSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.decisionResult,
    decisionId: execution.decisionId,
    serverRequestId: execution.serverRequestId,
    mode: execution.rolloutMode,
    createdAt: execution.executedAt,
    requestHash: contentHash(request),
    executionEnvelopeHash: execution.envelopeHash,
    contextSnapshot: context,
    contextBinding: execution.contextBinding,
    worldBinding: execution.worldBinding,
    userBinding: execution.userBinding,
    candidatePool,
    candidatePoolBinding: execution.candidatePoolBinding,
    engineManifest: execution.engineManifest,
    baseline: input.baseline,
    eligibilityResults: [...eligibility.eligible.map((entry) => entry.eligibility), ...eligibility.rejected].sort((a, b) => a.spotId.localeCompare(b.spotId)),
    recommendations,
    limitations: execution.degradationState,
  }, "resultHash"));
  return deepFreeze(result) as DecisionResult;
}

export interface ReplayRecord {
  readonly request: DecisionRequest;
  readonly execution: DecisionExecutionEnvelope;
  readonly baseline: BaselineId;
  readonly candidatePoolSize: number;
  readonly resultLimit: number;
  readonly expectedResultHash: string;
  readonly expectedManifestHash: string;
}

export function replayPhase1Decision(record: ReplayRecord, world: SyntheticWorld): DecisionResult {
  if (record.execution.engineManifest.manifestHash !== record.expectedManifestHash) throw new Error("replay_manifest_mismatch");
  const result = runPhase1Decision({ request: record.request, execution: record.execution, world, baseline: record.baseline, candidatePoolSize: record.candidatePoolSize, resultLimit: record.resultLimit });
  if (result.resultHash !== record.expectedResultHash) throw new Error("replay_result_mismatch");
  return result;
}

export function validateDecisionResultIntegrity(result: DecisionResult): void {
  const parsed = DecisionResultSchema.parse(result);
  validateEngineManifest(result.engineManifest);
  validateCandidatePool(result.candidatePool);
  validateSituationalContext(result.contextSnapshot);
  if (result.decisionId !== result.contextSnapshot.decisionId || result.serverRequestId !== result.candidatePool.serverRequestId || result.createdAt !== result.contextSnapshot.resolvedAt) throw new Error("result_identity_binding_mismatch");
  if (result.contextBinding.contractVersion !== result.contextSnapshot.contractVersion || result.contextBinding.id !== result.contextSnapshot.decisionId || result.contextBinding.hash !== result.contextSnapshot.contextHash) throw new Error("result_context_binding_mismatch");
  if (result.candidatePoolBinding.contractVersion !== result.candidatePool.contractVersion || result.candidatePoolBinding.id !== result.candidatePool.serverRequestId || result.candidatePoolBinding.hash !== result.candidatePool.candidatePoolHash) throw new Error("result_candidate_pool_binding_mismatch");
  if (result.candidatePool.worldVersion !== result.engineManifest.sandboxWorldVersion || result.candidatePool.candidateGeneratorVersion !== result.engineManifest.candidateGeneratorVersion) throw new Error("result_candidate_generator_binding_mismatch");
  if (result.worldBinding.portContractVersion !== result.engineManifest.worldPortVersion || result.worldBinding.registryVersion !== result.engineManifest.worldRegistryVersion || result.worldBinding.registryHash !== result.engineManifest.worldRegistryHash || result.worldBinding.ruleRegistryVersion !== result.engineManifest.worldRuleRegistryVersion || result.worldBinding.ruleRegistryHash !== result.engineManifest.worldRuleRegistryHash) throw new Error("result_world_manifest_binding_mismatch");
  if (result.candidatePool.candidates.some(({ candidate }) => candidate.worldReference.contractVersion !== result.worldBinding.portContractVersion || candidate.worldReference.registryVersion !== result.worldBinding.registryVersion || candidate.worldReference.registryHash !== result.worldBinding.registryHash || candidate.worldReference.ruleRegistryVersion !== result.worldBinding.ruleRegistryVersion || candidate.worldReference.ruleRegistryHash !== result.worldBinding.ruleRegistryHash)) throw new Error("candidate_world_binding_mismatch");
  if (result.candidatePool.candidates.some(({ candidate }) => candidate.evidence.some((item) => item.policyVersion !== (item.signal === "temporal.open_status" ? result.engineManifest.openingStateVersion : CONTRACT_VERSIONS.worldAdapter)))) throw new Error("candidate_evidence_policy_version_mismatch");
  const snapshotSetHash = contentHash(result.candidatePool.candidates.map((entry) => entry.candidate.worldReference.snapshotHash));
  if (result.worldBinding.snapshotSetHash !== snapshotSetHash) throw new Error("result_world_snapshot_set_mismatch");
  if (result.userBinding.projectionContractVersion !== result.engineManifest.userProjectionVersion) throw new Error("result_user_manifest_binding_mismatch");
  if (result.userBinding.manifestId !== SYNTHETIC_MANIFEST.manifestId || result.userBinding.manifestHash !== SYNTHETIC_MANIFEST.manifestHash || result.userBinding.projectionId !== `projection-${result.serverRequestId}`) throw new Error("result_user_artifact_binding_mismatch");
  if ((result.userBinding.status === "ACTIVE") !== (result.userBinding.neutralReason === null)) throw new Error("result_user_state_binding_invalid");
  assertBaselineManifest(result.baseline, result.engineManifest);

  const recomputed = applyPhase1Eligibility(result.candidatePool, result.contextSnapshot);
  const expectedEligibility = [...recomputed.eligible.map((entry) => entry.eligibility), ...recomputed.rejected].sort((a, b) => a.spotId.localeCompare(b.spotId));
  if (result.eligibilityResults.length !== result.candidatePool.candidates.length || new Set(result.eligibilityResults.map((entry) => entry.spotId)).size !== result.eligibilityResults.length) throw new Error("eligibility_identity_set_invalid");
  const eligibilityBySpot = new Map(result.eligibilityResults.map((entry) => [entry.spotId, entry]));
  for (const expected of expectedEligibility) {
    const actual = eligibilityBySpot.get(expected.spotId); if (!actual) throw new Error("eligibility_result_missing");
    validateEligibilityResult(actual);
    if (actual.resultHash !== expected.resultHash) throw new Error("eligibility_semantic_replay_mismatch");
    const candidate = result.candidatePool.candidates.find((entry) => entry.candidate.spotId === actual.spotId)?.candidate;
    if (!candidate) throw new Error("eligibility_outside_candidate_pool");
    const ids = new Set(candidate.evidence.map((item) => item.evidenceId));
    if (actual.checks.some((check) => check.evidenceIds.some((id) => !ids.has(id)))) throw new Error("eligibility_cross_spot_evidence");
  }

  const ranked = result.baseline === "baseline-a-open-distance-popularity" ? rankBaselineA(recomputed.eligible) : rankBaselineB(recomputed.eligible, result.contextSnapshot);
  const recommendationSpots = new Set<string>();
  for (let index = 0; index < result.recommendations.length; index += 1) {
    const recommendation = result.recommendations[index]!;
    if (recommendationSpots.has(recommendation.spotId)) throw new Error("duplicate_recommendation_spot_id"); recommendationSpots.add(recommendation.spotId);
    DecisionRecommendationSchema.parse(recommendation);
    assertContentHash(recommendation as unknown as Record<string, unknown>, "recommendationHash");
    const rankedEntry = ranked[index]; if (!rankedEntry || rankedEntry.eligibleCandidate.candidate.spotId !== recommendation.spotId || recommendation.rank !== index + 1) throw new Error("recommendation_ranking_replay_mismatch");
    const candidate = rankedEntry.eligibleCandidate.candidate;
    const centralEligibility = eligibilityBySpot.get(recommendation.spotId);
    validateEligibilityResult(recommendation.eligibility);
    if (!centralEligibility || !centralEligibility.eligible || recommendation.eligibility.resultHash !== centralEligibility.resultHash) throw new Error("recommendation_eligibility_mismatch");
    assertContentHash(recommendation.fit as unknown as Record<string, unknown>, "fitHash");
    if (recommendation.fit.fitHash !== rankedEntry.fit.fitHash || recommendation.fit.spotId !== recommendation.spotId || new Set(recommendation.fit.dimensions.map((dimension) => dimension.key)).size !== recommendation.fit.dimensions.length) throw new Error("recommendation_fit_replay_mismatch");
    const candidateIds = new Set(candidate.evidence.map((item) => item.evidenceId));
    if (recommendation.fit.dimensions.some((dimension) => dimension.evidenceIds.some((id) => !candidateIds.has(id)))) throw new Error("fit_cross_spot_evidence");
    const next = ranked[index + 1];
    const confidence = buildPhase1Confidence({ candidate: rankedEntry.eligibleCandidate, context: result.contextSnapshot, fixtureScore: rankedEntry.fixtureScore, userState: result.userBinding, ...(next === undefined ? {} : { nextFixtureScore: next.fixtureScore }) });
    assertContentHash(recommendation.confidence as unknown as Record<string, unknown>, "confidenceHash");
    if (recommendation.confidence.confidenceHash !== confidence.confidenceHash || recommendation.confidence.components.length !== 7 || new Set(recommendation.confidence.components.map((component) => component.key)).size !== 7) throw new Error("recommendation_confidence_replay_mismatch");
    const expectedReasons = renderAuthorizedReasons(authorizeReasons(candidate, rankedEntry.fit, confidence), candidateEvidence(candidate));
    if (canonicalJson(recommendation.reasons) !== canonicalJson(expectedReasons)) throw new Error("explanation_authorization_replay_mismatch");
    validateExplanation(recommendation.reasons, candidate);
  }
  assertContentHash(parsed as unknown as Record<string, unknown>, "resultHash");
}

export const decisionResultBytes = (result: DecisionResult): Uint8Array => new TextEncoder().encode(canonicalJson(result));
