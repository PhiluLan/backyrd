import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceChains } from "../src/n5-6-canonical-user-intelligence.mjs";
import { buildN5_6_2EnginePreflight } from "../src/n5-6-2-engine-preflight.mjs";
import { N5_6_2_SEEDS, buildN5_6_2World } from "../src/n5-6-2-realistic-user-world.mjs";

test("N5.6.2 world has stable persistent population and Product-like diversity", () => {
  const world = buildN5_6_2World(56201);
  assert.equal(world.users.length, 12);
  assert.ok(world.users.filter(({ cohort }) => cohort === "LONG_TERM").length >= 8);
  assert.ok(world.users.find(({ id }) => id === "NORTH_STAR_REALISTIC_01").events.length >= 400);
  const sessions = world.users.flatMap(({ sessions }) => sessions);
  assert.ok(new Set(sessions.map(({ sessionType }) => sessionType)).size >= 6);
  assert.ok(new Set(sessions.map(({ placeType }) => placeType)).size >= 6);
  assert.ok(new Set(sessions.map(({ audience }) => audience)).size >= 5);
  assert.ok(sessions.some(({ travel }) => travel));
  assert.ok(sessions.some(({ compromise }) => compromise));
  assert.ok(sessions.some(({ logistics }) => logistics));
  assert.ok(sessions.some(({ noise }) => noise));
});

test("same seed deterministically replays and distinct frozen seeds differ", () => {
  const first = buildN5_6_2World(56201); const replay = buildN5_6_2World(56201);
  assert.equal(first.worldHash, replay.worldHash);
  assert.equal(first.engineInputHash, replay.engineInputHash);
  assert.equal(new Set(N5_6_2_SEEDS.map((seed) => buildN5_6_2World(seed).worldHash)).size, 3);
});

test("runtime Engine inputs contain no evaluator-only truth", () => {
  const world = buildN5_6_2World(56201);
  const serialized = JSON.stringify(world.engineInputs);
  assert.doesNotMatch(serialized, /(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i);
  assert.doesNotMatch(serialized, /Nuanced explorer|Social nightlife regular|Family planner/);
});

test("realistic visit plus explicit negative reproduces N5.6 evidence-loss defect", () => {
  const world = buildN5_6_2World(56201);
  const intelligence = Object.fromEntries(world.spots.map((spot) => [spot.id, { concepts: spot.concepts }]));
  const user = world.users.find(({ events }) => events.some(({ eventType }) => ["explicit_negative", "negative_post_visit"].includes(eventType)));
  const negative = user.events.find(({ eventType }) => ["explicit_negative", "negative_post_visit"].includes(eventType));
  const journey = user.events.filter((event) => event.sessionId === negative.sessionId && event.spotId === negative.spotId);
  assert.ok(journey.some(({ eventType }) => eventType === "verified_visit"));
  const chain = buildEvidenceChains(journey, { asOf: world.asOf, spotIntelligence: intelligence })[0];
  assert.ok(chain.samples.length > 0);
  assert.equal(chain.samples.some(({ eventId, direction }) => eventId === negative.id && direction < 0), false);
  assert.ok(chain.samples.every(({ direction }) => direction > 0));
});

test("N5.6.2 preflight stops official treatment on reproducible Engine defect", async () => {
  const result = await buildN5_6_2EnginePreflight();
  assert.equal(result.defectProven, true);
  assert.equal(result.stopRule.triggered, true);
  assert.equal(result.stopRule.officialMeasurementStarted, false);
  assert.equal(result.stopRule.engineModified, false);
  assert.equal(result.n562Disposition, "STOPPED_ENGINE_DEFECT");
  assert.equal(result.scientificValidity, "PASS");
  assert.ok(result.seedResults.every(({ negativeFeedbackJourneys, negativeFeedbackSamplesSelected, learnedNegativeNodes, swallowedNegativeJourneys }) => negativeFeedbackJourneys > 0 && negativeFeedbackSamplesSelected === 0 && learnedNegativeNodes === 0 && swallowedNegativeJourneys === negativeFeedbackJourneys));
});
