import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { BASELINE_FIXTURES, rankBaselineA, rankBaselineB, type BaselineId, type RankedCandidate } from "./baselines.js";
import { generateNeutralCandidatePool, validateCandidatePool } from "./candidate-pool.js";
import { buildPhase1Confidence } from "./confidence.js";
import { CONTRACT_VERSIONS, DecisionExecutionEnvelopeSchema, DecisionRecommendationSchema, DecisionRequestSchema, DecisionResultSchema, type DecisionExecutionEnvelope, type DecisionRecommendation, type DecisionRequest, type DecisionResult } from "./contracts.js";
import { resolvePhase1Context } from "./context.js";
import { applyPhase1Eligibility } from "./eligibility.js";
import { authorizeReasons, renderAuthorizedReasons, validateExplanation } from "./explanation.js";
import { validateEngineManifest } from "./manifest.js";
import type { SyntheticWorld } from "./sandbox.js";

function assertBaselineManifest(baseline: BaselineId, execution: DecisionExecutionEnvelope): void {
  const fixture = baseline === "baseline-a-open-distance-popularity" ? BASELINE_FIXTURES.a : BASELINE_FIXTURES.b;
  if (execution.engineManifest.rankingVersion !== fixture.rankingVersion || execution.engineManifest.weightFixtureVersion !== fixture.weightFixtureVersion) {
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
  validateEngineManifest(execution.engineManifest);
  if (execution.deadlineAt < execution.executedAt) throw new Error("execution_deadline_invalid");
  assertBaselineManifest(input.baseline, execution);
  if (execution.engineManifest.sandboxWorldVersion !== input.world.version) throw new Error("engine_manifest_world_mismatch");
  const context = resolvePhase1Context(request, execution);
  const candidatePool = generateNeutralCandidatePool({ world: input.world, context, serverRequestId: execution.serverRequestId, ...(input.candidatePoolSize === undefined ? {} : { limit: input.candidatePoolSize }) });
  validateCandidatePool(candidatePool);
  const eligibility = applyPhase1Eligibility(candidatePool, context);
  const ranked: readonly RankedCandidate[] = input.baseline === "baseline-a-open-distance-popularity"
    ? rankBaselineA(eligibility.eligible)
    : rankBaselineB(eligibility.eligible, context);
  const selected = ranked.slice(0, input.resultLimit ?? 3);
  const recommendations: DecisionRecommendation[] = selected.map((entry, index) => {
    const next = ranked[index + 1];
    const confidence = buildPhase1Confidence({ candidate: entry.eligibleCandidate, context, fixtureScore: entry.fixtureScore, ...(next === undefined ? {} : { nextFixtureScore: next.fixtureScore }) });
    const claims = authorizeReasons(entry.eligibleCandidate.candidate, entry.fit, confidence);
    const reasons = renderAuthorizedReasons(claims, entry.eligibleCandidate.candidate.evidence);
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
    decisionId: `decision-${execution.serverRequestId}`,
    serverRequestId: execution.serverRequestId,
    mode: execution.rolloutMode,
    createdAt: execution.executedAt,
    requestHash: contentHash(request),
    contextSnapshot: context,
    candidatePool,
    engineManifest: execution.engineManifest,
    baseline: input.baseline,
    recommendations,
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
  DecisionResultSchema.parse(result);
  validateEngineManifest(result.engineManifest);
  validateCandidatePool(result.candidatePool);
  assertContentHash(result.contextSnapshot as unknown as Record<string, unknown>, "contextHash");
  for (const recommendation of result.recommendations) {
    assertContentHash(recommendation as unknown as Record<string, unknown>, "recommendationHash");
    const candidate = result.candidatePool.candidates.find((entry) => entry.candidate.spotId === recommendation.spotId)?.candidate;
    if (!candidate) throw new Error("recommendation_outside_candidate_pool");
    if (!recommendation.eligibility.eligible) throw new Error("ineligible_recommendation");
    validateExplanation(recommendation.reasons, candidate);
  }
  assertContentHash(result as unknown as Record<string, unknown>, "resultHash");
}

export const decisionResultBytes = (result: DecisionResult): Uint8Array => new TextEncoder().encode(canonicalJson(result));
