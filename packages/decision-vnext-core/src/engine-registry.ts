import type { RelevantUserProjection } from "@backyrd/user-intelligence-vnext-core";
import { BASELINE_FIXTURES, rankBaselineA, rankBaselineB } from "./baselines.js";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, type DecisionContextSnapshot, type EligibleCandidate, type EvidenceItem } from "./contracts.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import {
  EvaluationEngineManifestSchema, EvaluationEngineResultSchema, EvaluationEvidenceSchema, EvaluationFitSchema,
  PHASE2_CONTRACT_VERSIONS, PHASE2_ENGINE_IDS,
  type DegradationEntry, type EvaluationEngineManifest, type EvaluationEngineResult, type EvaluationEvidence, type EvaluationFit, type Phase2EngineId,
} from "./phase2-contracts.js";

export const PHASE2_ENGINE_REGISTRY_VERSION = "backyrd-vnext-phase2-engine-registry-v1" as const;
export const PHASE2_CONFIDENCE_VERSION = "backyrd-vnext-phase2-confidence-uncalibrated-v1" as const;
export const PHASE2_EVIDENCE_VERSION = "backyrd-vnext-phase2-evidence-v1" as const;
export const PHASE2_EXPLANATION_VERSION = "backyrd-vnext-phase2-template-explanation-v1" as const;

const ENGINE_FIXTURES: Readonly<Record<Phase2EngineId, { readonly engineVersion: string; readonly rankingPolicyVersion: string; readonly weightPolicyVersion: string }>> = Object.freeze({
  "baseline-a-open-distance-popularity": { engineVersion: BASELINE_FIXTURES.a.rankingVersion, rankingPolicyVersion: "phase2-baseline-a-fixture-policy-v1", weightPolicyVersion: BASELINE_FIXTURES.a.weightFixtureVersion },
  "baseline-b-mood-intent": { engineVersion: BASELINE_FIXTURES.b.rankingVersion, rankingPolicyVersion: "phase2-baseline-b-fixture-policy-v1", weightPolicyVersion: BASELINE_FIXTURES.b.weightFixtureVersion },
  "legacy-v13-frozen-fixture": { engineVersion: "decision-v13-frozen-comparison-fixture-v1", rankingPolicyVersion: "legacy-comparison-no-production-calls-v1", weightPolicyVersion: "legacy-weights-not-imported" },
  "vnext-fixture": { engineVersion: "backyrd-vnext-phase2-fixture-engine-v1", rankingPolicyVersion: "phase2-fixture-ranking-policy-unapproved-v1", weightPolicyVersion: "phase2-fixture-weights-unapproved-v1" },
});

export interface EngineRegistryIdentity {
  readonly sourceSha: string;
  readonly worldPortVersion: string;
  readonly worldRegistryVersion: string;
  readonly worldRegistryHash: string;
  readonly worldRuleRegistryVersion: string;
  readonly worldRuleRegistryHash: string;
  readonly worldSourcePolicyVersion: string;
  readonly worldSourcePolicyHash: string;
  readonly userProjectionVersion: string;
  readonly contextVersion: string;
}

export function createEvaluationEngineManifests(identity: EngineRegistryIdentity): readonly EvaluationEngineManifest[] {
  return PHASE2_ENGINE_IDS.map((engineId) => {
    const fixture = ENGINE_FIXTURES[engineId];
    return EvaluationEngineManifestSchema.parse(withContentHash({
      contractVersion: PHASE2_CONTRACT_VERSIONS.engineManifest, engineId, engineVersion: fixture.engineVersion,
      rankingPolicyVersion: fixture.rankingPolicyVersion, weightPolicyVersion: fixture.weightPolicyVersion,
      candidatePoolContractVersion: CONTRACT_VERSIONS.candidatePool, eligibilityContractVersion: CONTRACT_VERSIONS.eligibility,
      worldPortVersion: identity.worldPortVersion, worldRegistryVersion: identity.worldRegistryVersion, worldRegistryHash: identity.worldRegistryHash,
      worldRuleRegistryVersion: identity.worldRuleRegistryVersion, worldRuleRegistryHash: identity.worldRuleRegistryHash,
      worldSourcePolicyVersion: identity.worldSourcePolicyVersion, worldSourcePolicyHash: identity.worldSourcePolicyHash,
      userProjectionVersion: identity.userProjectionVersion, contextVersion: identity.contextVersion,
      confidenceVersion: PHASE2_CONFIDENCE_VERSION, evidenceVersion: PHASE2_EVIDENCE_VERSION, explanationVersion: PHASE2_EXPLANATION_VERSION,
      degradationPolicyVersion: PHASE2_CONTRACT_VERSIONS.degradation, sourceSha: identity.sourceSha,
      fixtureOnly: true, productWeightsConfigured: false,
    }, "manifestHash"));
  });
}

export function validateEvaluationEngineManifest(manifest: EvaluationEngineManifest): void {
  EvaluationEngineManifestSchema.parse(manifest); assertContentHash(manifest as unknown as Record<string, unknown>, "manifestHash");
  const expected = createEvaluationEngineManifests({ sourceSha: manifest.sourceSha, worldPortVersion: manifest.worldPortVersion, worldRegistryVersion: manifest.worldRegistryVersion, worldRegistryHash: manifest.worldRegistryHash, worldRuleRegistryVersion: manifest.worldRuleRegistryVersion, worldRuleRegistryHash: manifest.worldRuleRegistryHash, worldSourcePolicyVersion: manifest.worldSourcePolicyVersion, worldSourcePolicyHash: manifest.worldSourcePolicyHash, userProjectionVersion: manifest.userProjectionVersion, contextVersion: manifest.contextVersion }).find((item) => item.engineId === manifest.engineId);
  if (!expected || canonicalJson(expected) !== canonicalJson(manifest)) throw new Error("phase2_engine_manifest_unsupported_version");
}

function evaluationEvidence(value: Omit<EvaluationEvidence, "evidenceHash">): EvaluationEvidence {
  return EvaluationEvidenceSchema.parse(withContentHash(value, "evidenceHash"));
}

function convertCandidateEvidence(item: EvidenceItem): EvaluationEvidence {
  return evaluationEvidence({
    evidenceId: item.evidenceId, candidateId: item.spotId, sourceDomain: item.sourceDomain,
    signal: item.signal, sourceHash: item.evidenceHash, policyVersion: item.policyVersion,
    influence: item.influence, trustState: item.trustState, limitations: item.limitations,
  });
}

const clamp = (value: number): number => Math.max(-1, Math.min(1, Number(value.toFixed(6))));

interface MutableRank {
  readonly candidate: EligibleCandidate;
  readonly fixtureScore: number;
  readonly dimensions: readonly { readonly key: string; readonly fixtureValue: number; readonly sourceDomain: "WORLD" | "USER" | "CONTEXT" | "RANKING"; readonly evidenceIds: readonly string[] }[];
  readonly extraEvidence: readonly EvaluationEvidence[];
}

function evidenceFor(candidate: EligibleCandidate, signal: string): EvidenceItem {
  const evidence = candidate.candidate.evidence.find((item) => item.signal === signal);
  if (!evidence) throw new Error(`phase2_ranking_evidence_missing:${signal}`);
  return evidence;
}

function rank(engineId: Phase2EngineId, candidates: readonly EligibleCandidate[], context: DecisionContextSnapshot, projection: RelevantUserProjection | null): readonly MutableRank[] {
  if (engineId === "baseline-a-open-distance-popularity") return rankBaselineA(candidates).map((entry) => ({
    candidate: entry.eligibleCandidate, fixtureScore: entry.fixtureScore,
    dimensions: entry.fit.dimensions.map((dimension) => ({ key: dimension.key, fixtureValue: dimension.rawValue, sourceDomain: dimension.key === "fixture.distance" ? "CONTEXT" as const : "WORLD" as const, evidenceIds: dimension.evidenceIds })), extraEvidence: [],
  }));
  if (engineId === "baseline-b-mood-intent") return rankBaselineB(candidates, context).map((entry) => ({
    candidate: entry.eligibleCandidate, fixtureScore: entry.fixtureScore,
    dimensions: entry.fit.dimensions.map((dimension) => ({ key: dimension.key, fixtureValue: dimension.rawValue, sourceDomain: "WORLD" as const, evidenceIds: dimension.evidenceIds })), extraEvidence: [],
  }));
  if (engineId === "legacy-v13-frozen-fixture") return [...candidates].sort((a, b) => a.retrievalPosition - b.retrievalPosition).map((candidate) => {
    const source = evidenceFor(candidate, "location.distance");
    const proof = evaluationEvidence({ evidenceId: `p2-legacy-${candidate.candidate.spotId}`, candidateId: candidate.candidate.spotId, sourceDomain: "RANKING", signal: "fixture.legacy_retrieval_position", sourceHash: contentHash({ candidateHash: candidate.candidate.candidateHash, retrievalPosition: candidate.retrievalPosition }), policyVersion: ENGINE_FIXTURES[engineId].rankingPolicyVersion, influence: "NEUTRAL", trustState: "FROZEN_FIXTURE", limitations: ["legacy-production-not-invoked"] });
    return { candidate, fixtureScore: clamp(1 - candidate.retrievalPosition / Math.max(1, candidates.length)), dimensions: [{ key: "fixture.legacy_retrieval_position", fixtureValue: clamp(1 - candidate.retrievalPosition / Math.max(1, candidates.length)), sourceDomain: "RANKING", evidenceIds: [proof.evidenceId, source.evidenceId] }], extraEvidence: [proof] };
  });

  const baseBySpot = new Map(rankBaselineB(candidates, context).map((entry) => [entry.eligibleCandidate.candidate.spotId, entry]));
  return candidates.map((candidate): MutableRank => {
    const spotId = candidate.candidate.spotId; const base = baseBySpot.get(spotId); if (!base) throw new Error("phase2_fixture_base_rank_missing");
    const extraEvidence: EvaluationEvidence[] = [];
    const dimensions: MutableRank["dimensions"][number][] = base.fit.dimensions.map((dimension) => ({ key: dimension.key, fixtureValue: dimension.rawValue, sourceDomain: "WORLD", evidenceIds: dimension.evidenceIds }));
    let userAdjustment = 0;
    if (projection?.status === "ACTIVE") {
      const offered = new Set([...candidate.candidate.fixtureIntentKeys, ...candidate.candidate.fixtureMoodKeys]);
      const matchingTaste = projection.taste.filter((item) => offered.has(item.concept.conceptId));
      if (matchingTaste.length) {
        const value = clamp(matchingTaste.reduce((sum, item) => sum + item.affinity, 0) / matchingTaste.length);
        const evidence = evaluationEvidence({ evidenceId: `p2-user-taste-${spotId}`, candidateId: spotId, sourceDomain: "USER", signal: "fixture.user_taste_match", sourceHash: projection.projectionHash, policyVersion: ENGINE_FIXTURES[engineId].rankingPolicyVersion, influence: value < 0 ? "NEGATIVE" : "POSITIVE", trustState: "MINIMIZED_PROJECTION", limitations: ["fixture-semantics-not-product-approved"] });
        extraEvidence.push(evidence); dimensions.push({ key: "fixture.user_taste_match", fixtureValue: value, sourceDomain: "USER", evidenceIds: [evidence.evidenceId] }); userAdjustment += value * 0.25;
      }
      const direct = projection.directSpot.find((item) => item.spotId === spotId);
      if (direct) {
        const value = direct.state === "EXCLUDED" ? -1 : direct.state === "UNKNOWN" ? 0 : 1;
        const evidence = evaluationEvidence({ evidenceId: `p2-user-direct-${spotId}`, candidateId: spotId, sourceDomain: "USER", signal: "fixture.direct_spot_affinity", sourceHash: projection.projectionHash, policyVersion: ENGINE_FIXTURES[engineId].rankingPolicyVersion, influence: value < 0 ? "NEGATIVE" : value > 0 ? "POSITIVE" : "NEUTRAL", trustState: "MINIMIZED_PROJECTION", limitations: ["direct-spot-not-propagated-to-concept-taste"] });
        extraEvidence.push(evidence); dimensions.push({ key: "fixture.direct_spot_affinity", fixtureValue: value, sourceDomain: "USER", evidenceIds: [evidence.evidenceId] }); userAdjustment += value * 0.15;
      }
    }
    return { candidate, fixtureScore: clamp(base.fixtureScore * 0.6 + userAdjustment), dimensions, extraEvidence };
  }).sort((a, b) => b.fixtureScore - a.fixtureScore || a.candidate.candidate.spotId.localeCompare(b.candidate.candidate.spotId));
}

function fit(entry: MutableRank): EvaluationFit {
  return EvaluationFitSchema.parse(withContentHash({ candidateId: entry.candidate.candidate.spotId, dimensions: entry.dimensions.map((dimension) => ({ ...dimension, productSemantics: "NOT_CONFIGURED" as const })), fixtureScore: entry.fixtureScore }, "fitHash"));
}

export function executeEvaluationEngine(input: { readonly manifest: EvaluationEngineManifest; readonly candidates: readonly EligibleCandidate[]; readonly context: DecisionContextSnapshot; readonly projection: RelevantUserProjection | null; readonly candidatePoolHash: string; readonly degradation: readonly DegradationEntry[] }): EvaluationEngineResult {
  const ranked = rank(input.manifest.engineId, input.candidates, input.context, input.projection);
  const rankings = ranked.map((entry, index) => ({ rank: index + 1, candidateId: entry.candidate.candidate.spotId, fit: fit(entry) }));
  const top = ranked.slice(0, 3); const evidenceById = new Map<string, EvaluationEvidence>();
  for (const entry of top) {
    for (const item of entry.candidate.candidate.evidence) evidenceById.set(item.evidenceId, convertCandidateEvidence(item));
    for (const item of entry.extraEvidence) evidenceById.set(item.evidenceId, item);
  }
  const evidence = [...evidenceById.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  const explanation = top.flatMap((entry) => fit(entry).dimensions.filter((dimension) => dimension.fixtureValue !== 0).slice(0, 3).map((dimension) => ({ candidateId: entry.candidate.candidate.spotId, reasonCode: `${dimension.key}.fixture_reason`, evidenceIds: dimension.evidenceIds, renderedText: `Fixture-only signal: ${dimension.key}.` })));
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  if (explanation.some((reason) => reason.evidenceIds.some((id) => !evidenceIds.has(id)))) throw new Error("phase2_explanation_evidence_incomplete");
  const components = [
    { key: "WORLD_DATA" as const, state: top.length ? "AVAILABLE_UNCALIBRATED" as const : "UNKNOWN" as const, evidenceIds: evidence.filter((item) => item.sourceDomain === "WORLD").map((item) => item.evidenceId) },
    { key: "USER_SUFFICIENCY" as const, state: input.projection?.status === "ACTIVE" ? "AVAILABLE_UNCALIBRATED" as const : "UNKNOWN" as const, evidenceIds: evidence.filter((item) => item.sourceDomain === "USER").map((item) => item.evidenceId) },
    { key: "CONTEXT_COMPLETENESS" as const, state: "AVAILABLE_UNCALIBRATED" as const, evidenceIds: [] },
    { key: "RANKING_SEPARATION" as const, state: "AVAILABLE_UNCALIBRATED" as const, evidenceIds: [] },
    { key: "EVIDENCE_COVERAGE" as const, state: "AVAILABLE_UNCALIBRATED" as const, evidenceIds: evidence.map((item) => item.evidenceId) },
    { key: "CONFLICT_UNCERTAINTY" as const, state: "UNKNOWN" as const, evidenceIds: [] },
    { key: "OVERALL" as const, state: "NOT_CONFIGURED" as const, evidenceIds: [] },
  ];
  const confidence = withContentHash({ state: "UNCALIBRATED" as const, components }, "confidenceHash");
  const limitations = ["phase2-fixture-engine-not-product-policy", "confidence-calibration-not-configured", "scenario-oracles-not-configured", ...(input.manifest.engineId === "legacy-v13-frozen-fixture" ? ["legacy-production-not-invoked"] : []), ...(input.projection?.status !== "ACTIVE" ? [`personalization-neutral-${input.projection?.neutralReason ?? "missing-projection"}`] : [])].sort();
  const result = EvaluationEngineResultSchema.parse(withContentHash({ contractVersion: PHASE2_CONTRACT_VERSIONS.engineResult, engineId: input.manifest.engineId, manifest: input.manifest, candidatePoolHash: input.candidatePoolHash, eligibleCandidateSetHash: contentHash(input.candidates.map((candidate) => candidate.candidate.candidateHash)), rankings, top1: rankings[0]?.candidateId ?? null, top3: rankings.slice(0, 3).map((entry) => entry.candidateId), confidence, evidence, explanation, limitations, degradation: input.degradation }, "resultHash"));
  return deepFreeze(result) as EvaluationEngineResult;
}
