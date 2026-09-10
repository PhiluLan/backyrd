import {
  CONTRACT_VERSIONS,
  createSyntheticExecution,
  generateSyntheticWorld,
} from "../dist/index.js";

export const config = Object.freeze({
  configVersion: "backyrd-vnext-sandbox-config-v1",
  worldVersion: "backyrd-vnext-synthetic-world-test-v1",
  seed: 717,
  observedAt: "2026-01-15T12:00:00.000Z",
  spotCount: 36,
  userCount: 8,
  cities: ["Fixture Basel", "Fixture Zurich", "Fixture Bern"],
  candidatePoolSize: 36,
});

export const world = () => generateSyntheticWorld(config);
export const request = () => ({
  contractVersion: CONTRACT_VERSIONS.decisionRequest,
  idempotencyKey: "fixture-request-1",
  clientRequestedAt: config.observedAt,
  location: { kind: "city", city: "Fixture Basel" },
  intentKeys: ["fixture.intent.eat"],
  moodKeys: ["fixture.mood.calm"],
  shownCandidateIds: [],
  rejectedCandidateIds: [],
  hardConstraints: [{ kind: "open_now", value: true }],
  softPreferences: [],
  client: { surface: "synthetic", version: "phase1-test-v1" },
});

export const execution = (baseline = "baseline-a-open-distance-popularity", syntheticWorld = world()) => {
  const value = request();
  return createSyntheticExecution({ request: value, world: syntheticWorld, baseline: baseline ?? "baseline-a-open-distance-popularity", sourceSha: "phase1-test-source", authorizedLocationScope: value.location, candidatePoolSize: 36 });
};
