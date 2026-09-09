import { withContentHash } from "./canonical.js";
import { ConfidenceSchema, CONTRACT_VERSIONS, type Confidence, type DecisionContextSnapshot, type EligibleCandidate } from "./contracts.js";
import { candidateEvidence } from "./world-knowledge.js";

const evidence = (candidate: EligibleCandidate, kind: string) => {
  const item = candidateEvidence(candidate.candidate).find((entry) => entry.kind === kind);
  if (!item) throw new Error(`confidence_evidence_missing:${kind}`);
  return item.evidenceId;
};

export function buildPhase1Confidence(input: {
  candidate: EligibleCandidate;
  context: DecisionContextSnapshot;
  fixtureScore: number;
  nextFixtureScore?: number;
}): Confidence {
  const quality = input.candidate.candidate.fixtureDataQuality;
  const contextCompleteness = input.context.intentKeys.length + input.context.moodKeys.length > 0 ? 1 : 0.5;
  const separation = input.nextFixtureScore === undefined ? 1 : Math.min(1, Math.abs(input.fixtureScore - input.nextFixtureScore));
  const limitations = [
    { code: "phase1-confidence-not-calibrated", evidenceIds: [evidence(input.candidate, "data_quality")] },
    ...(quality < 0.4 ? [{ code: "weak-world-evidence", evidenceIds: [evidence(input.candidate, "data_quality")] }] : []),
    { code: "phase1-user-model-not-used", evidenceIds: [] },
  ];
  return ConfidenceSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.confidence,
    status: "uncalibrated-phase1",
    components: [
      { key: "world_fact_coverage", evaluationValue: quality },
      { key: "world_freshness", evaluationValue: 1 },
      { key: "context_completeness", evaluationValue: contextCompleteness },
      { key: "user_knowledge", evaluationValue: 0 },
      { key: "ranking_separation", evaluationValue: separation },
      { key: "retrieval_agreement", evaluationValue: 1 },
    ],
    limitations,
  }, "confidenceHash"));
}
