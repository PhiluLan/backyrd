import { withContentHash } from "./canonical.js";
import { ConfidenceSchema, CONTRACT_VERSIONS, type Confidence, type DecisionContextSnapshot, type EligibleCandidate } from "./contracts.js";
import { candidateEvidence } from "./evidence.js";

const evidence = (candidate: EligibleCandidate, signal: string) => {
  const item = candidateEvidence(candidate.candidate).find((entry) => entry.signal === signal);
  if (!item) throw new Error(`confidence_evidence_missing:${signal}`);
  return item.evidenceId;
};

export function buildPhase1Confidence(input: {
  candidate: EligibleCandidate;
  context: DecisionContextSnapshot;
  fixtureScore: number;
  nextFixtureScore?: number;
  userState?: { readonly status: "ACTIVE" | "NEUTRAL"; readonly neutralReason: string | null };
}): Confidence {
  const quality = input.candidate.candidate.fixtureDataQuality;
  const contextCompleteness = input.context.explicit.intentKeys.length + input.context.explicit.moodKeys.length > 0 ? 1 : 0.5;
  const separation = input.nextFixtureScore === undefined ? 1 : Math.min(1, Math.abs(input.fixtureScore - input.nextFixtureScore));
  const limitations = [
    { code: "phase1-confidence-not-calibrated", evidenceIds: [evidence(input.candidate, "world.data_quality")] },
    ...(quality < 0.4 ? [{ code: "weak-world-evidence", evidenceIds: [evidence(input.candidate, "world.data_quality")] }] : []),
    { code: input.userState?.status === "ACTIVE" ? "phase1-target-ranking-not-configured" : `user-${(input.userState?.neutralReason ?? "projection-missing").toLowerCase()}`, evidenceIds: [] },
    { code: "capability-intent-registry-not-configured", evidenceIds: [] },
  ];
  return ConfidenceSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.confidence,
    status: "uncalibrated-phase1",
    components: [
      { key: "world_data_sufficiency", state: "FIXTURE_VALUE", evaluationValue: quality },
      { key: "world_trust_freshness", state: "NOT_CONFIGURED", evaluationValue: null },
      { key: "user_sufficiency", state: input.userState?.status === "ACTIVE" ? "UNASSESSED" : "NOT_CONFIGURED", evaluationValue: null },
      { key: "context_completeness", state: "FIXTURE_VALUE", evaluationValue: contextCompleteness },
      { key: "eligibility_certainty", state: "FIXTURE_VALUE", evaluationValue: 1 },
      { key: "ranking_separation", state: "FIXTURE_VALUE", evaluationValue: separation },
      { key: "evidence_coverage", state: "FIXTURE_VALUE", evaluationValue: quality },
    ],
    limitations,
  }, "confidenceHash"));
}
