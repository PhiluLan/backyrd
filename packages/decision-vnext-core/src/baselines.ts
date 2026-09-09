import { withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, FitDimensionsSchema, type DecisionContextSnapshot, type EligibleCandidate, type FitDimensions } from "./contracts.js";

export type BaselineId = "baseline-a-open-distance-popularity" | "baseline-b-mood-intent";

export const BASELINE_FIXTURES = Object.freeze({
  a: {
    rankingVersion: "backyrd-vnext-baseline-a-v1",
    weightFixtureVersion: "backyrd-vnext-baseline-a-fixture-weights-v1-unapproved",
    weights: { open: 0.5, distance: 0.35, popularity: 0.15 },
    popularityContributionCap: 0.15,
  },
  b: {
    rankingVersion: "backyrd-vnext-baseline-b-v1",
    weightFixtureVersion: "backyrd-vnext-baseline-b-fixture-weights-v1-unapproved",
    weights: { intent: 0.5, mood: 0.5 },
  },
} as const);

interface RankedCandidate {
  readonly eligibleCandidate: EligibleCandidate;
  readonly fit: FitDimensions;
  readonly fixtureScore: number;
}

const evidence = (candidate: EligibleCandidate, kind: string) => {
  const item = candidate.candidate.evidence.find((entry) => entry.kind === kind);
  if (!item) throw new Error(`baseline_evidence_missing:${kind}`);
  return item.evidenceId;
};
const ratio = (requested: readonly string[], offered: readonly string[]) => requested.length === 0 ? 0 : requested.filter((key) => offered.includes(key)).length / requested.length;

function fit(candidate: EligibleCandidate, dimensions: FitDimensions["dimensions"]): FitDimensions {
  return FitDimensionsSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.fitDimensions,
    spotId: candidate.candidate.spotId,
    featureSetVersion: "backyrd-vnext-phase1-fixture-features-v1",
    dimensions,
  }, "fitHash"));
}

export function rankBaselineA(candidates: readonly EligibleCandidate[]): readonly RankedCandidate[] {
  const fixture = BASELINE_FIXTURES.a;
  return candidates.map((eligibleCandidate) => {
    const candidate = eligibleCandidate.candidate;
    const open = candidate.openStatus === "open" ? 1 : candidate.openStatus === "unknown" ? 0.5 : 0;
    const distance = Math.max(0, 1 - Math.min(candidate.distanceMeters, 20_000) / 20_000);
    const popularity = candidate.fixturePopularity;
    const dimensions = [
      { key: "fixture.open" as const, rawValue: open, evidenceIds: [evidence(eligibleCandidate, "open_status")], status: "unapproved-product-placeholder" as const },
      { key: "fixture.distance" as const, rawValue: distance, evidenceIds: [evidence(eligibleCandidate, "distance")], status: "unapproved-product-placeholder" as const },
      { key: "fixture.popularity" as const, rawValue: popularity, evidenceIds: [evidence(eligibleCandidate, "popularity")], status: "unapproved-product-placeholder" as const },
    ];
    const fixtureScore = open * fixture.weights.open + distance * fixture.weights.distance + Math.min(fixture.popularityContributionCap, popularity * fixture.weights.popularity);
    return { eligibleCandidate, fit: fit(eligibleCandidate, dimensions), fixtureScore };
  }).sort((left, right) => right.fixtureScore - left.fixtureScore || left.eligibleCandidate.candidate.spotId.localeCompare(right.eligibleCandidate.candidate.spotId));
}

export function rankBaselineB(candidates: readonly EligibleCandidate[], context: DecisionContextSnapshot): readonly RankedCandidate[] {
  const fixture = BASELINE_FIXTURES.b;
  return candidates.map((eligibleCandidate) => {
    const candidate = eligibleCandidate.candidate;
    const intent = ratio(context.intentKeys, candidate.fixtureIntentKeys);
    const mood = ratio(context.moodKeys, candidate.fixtureMoodKeys);
    const dimensions = [
      { key: "fixture.intent_match" as const, rawValue: intent, evidenceIds: [evidence(eligibleCandidate, "intent_tags")], status: "unapproved-product-placeholder" as const },
      { key: "fixture.mood_match" as const, rawValue: mood, evidenceIds: [evidence(eligibleCandidate, "mood_tags")], status: "unapproved-product-placeholder" as const },
    ];
    return { eligibleCandidate, fit: fit(eligibleCandidate, dimensions), fixtureScore: intent * fixture.weights.intent + mood * fixture.weights.mood };
  }).sort((left, right) => right.fixtureScore - left.fixtureScore || left.eligibleCandidate.candidate.spotId.localeCompare(right.eligibleCandidate.candidate.spotId));
}

export type { RankedCandidate };
