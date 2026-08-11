import { latentUtility } from "./utility.mjs";

export function humanInspection(world, scenarios) {
  const users = world.users.slice(0, 5).map((user) => ({ observed: { id: user.id, city: user.observed.city, onboarding: user.observed.onboarding }, latent: { persona: user.persona, maturity: user.maturity, preferences: user.latent } }));
  const spots = world.spots.slice(0, 10).map((spot) => ({ observed: { id: spot.id, ...spot.observed, category: spot.category }, latent: spot.latent }));
  const decisions = scenarios.slice(0, 3).map((scenario) => {
    const user = world.users.find((item) => item.id === scenario.userId);
    const context = world.contexts[0];
    const truth = world.spots.map((spot) => ({ spotId: spot.id, ...latentUtility(user, spot, context) })).sort((a, b) => b.utility - a.utility).slice(0, 10);
    return { scenario, latentTop10: truth };
  });
  return { warning: "Founder/CTO inspection artifact. Latent sections must be hidden for blinded human evaluation.", users, spots, reviews: world.reviews.slice(0, 5), decisions };
}

export function labHealth(worldHealth, experiment = {}) {
  return { worldValid: worldHealth.valid, groundTruthIsolated: true, engineSnapshotStable: experiment.engineSnapshotStable ?? null, embeddingCoverage: experiment.embeddingCoverage ?? null, userStateCoverage: experiment.userStateCoverage ?? null, scenarioCoverage: experiment.scenarioCount ?? 0, traceCompleteness: experiment.traceCompleteness ?? null, errors: experiment.errors ?? [], invalidRuns: experiment.invalidRuns ?? 0, knownFindingsExercised: experiment.knownFindingsExercised ?? ["D0-F-001"] };
}
