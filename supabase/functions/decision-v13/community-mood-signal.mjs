export const COMMUNITY_MOOD_MAX_COMPONENT = 0.06;

const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function communityMoodComponent(evidence) {
  const signalStrength = Math.max(0, Math.min(1, finiteNumber(evidence?.signal_strength)));
  return Object.freeze({
    signalStrength,
    component: signalStrength * COMMUNITY_MOOD_MAX_COMPONENT,
    matchedConcepts: Array.isArray(evidence?.matched_concepts) ? evidence.matched_concepts : [],
    eligibleContributors: Number.isInteger(evidence?.eligible_contributors)
      ? evidence.eligible_contributors
      : null,
  });
}
