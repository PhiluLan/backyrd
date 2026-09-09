import {
  BASELINE_FIXTURES,
  CONTRACT_VERSIONS,
  createEngineManifest,
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
  intentKeys: ["fixture.eat"],
  moodKeys: ["fixture.calm"],
  hardConstraints: [{ kind: "open_now", value: true }],
  softPreferences: [],
  client: { surface: "synthetic", version: "phase1-test-v1" },
});

export const execution = (baseline = "baseline-a-open-distance-popularity", syntheticWorld = world()) => {
  const fixture = baseline === "baseline-a-open-distance-popularity" ? BASELINE_FIXTURES.a : BASELINE_FIXTURES.b;
  return {
    contractVersion: CONTRACT_VERSIONS.executionEnvelope,
    authenticatedActor: { kind: "anonymous" },
    serverRequestId: "server-request-fixture-1",
    sessionId: "session-fixture-1",
    executedAt: config.observedAt,
    rolloutMode: "evaluation",
    deadlineAt: "2026-01-15T12:00:05.000Z",
    serverIdempotencyKey: "server-idempotency-fixture-1",
    engineManifest: createEngineManifest({
      sourceSha: "phase1-test-source",
      sandboxWorldVersion: syntheticWorld.version,
      rankingVersion: fixture.rankingVersion,
      weightFixtureVersion: fixture.weightFixtureVersion,
    }),
  };
};
