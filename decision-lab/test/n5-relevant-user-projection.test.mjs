import test from "node:test";
import assert from "node:assert/strict";
import { contentHash } from "../src/canonical-json.mjs";
import { N2_VERSIONS } from "../src/n2-memory-user-intelligence.mjs";
import { buildCurrentMoment } from "../src/n3-moment-intelligence.mjs";
import { TASTE_ENGINE_VERSIONS } from "../src/taste-engine.mjs";
import {
  N5_CONTRACT_HASH, N5_LIMITS, N5_RELEVANCE_CONTRACT_HASH,
  N5_SUFFICIENCY_CONTRACT_HASH, N5_SUPPRESSION_CONTRACT_HASH, N5_VERSIONS,
  buildRelevantUserProjection, serializeRelevantUserProjectionForN6
} from "../src/n5-relevant-user-projection.mjs";
import { buildN5ValidationResult } from "../src/n5-validation.mjs";

const NOW = "2026-08-18T12:00:00.000Z";
const taste = (concept, scope = { kind: "GLOBAL", key: "global" }, options = {}) => ({
  concept, family: concept.split(".")[0], scope, affinity: options.affinity ?? 0.8,
  confidence: options.confidence ?? 0.84, positiveEvidence: 2, negativeEvidence: 0,
  positiveEventCount: 6, negativeEventCount: 0, distinctSpotCount: 4, distinctSessionCount: 5,
  sourceFamilies: ["outcome"], firstEvidenceAt: "2026-01-01T00:00:00.000Z",
  lastUpdatedAt: "2026-08-10T00:00:00.000Z", decayState: options.decayState ?? "CURRENT",
  engineVersion: TASTE_ENGINE_VERSIONS.learningEngine
});
const makeProfile = (userId, rows = [], patterns = [], options = {}) => {
  const body = {
    userId, asOf: NOW, queryCity: "Basel", knowledgeState: options.knowledgeState ?? "MATURE",
    consentState: options.consentState ?? "granted", memorySummary: {},
    tasteMap: { userId, asOf: NOW, rows, unknownConcepts: [], versions: TASTE_ENGINE_VERSIONS },
    patterns, contradictions: [], timeline: [], graph: {}, versions: N2_VERSIONS
  };
  return Object.freeze({ ...body, intelligenceHash: contentHash(body) });
};
const makeMoment = (userId, explicit, now = "2026-08-16T13:00:00.000Z", city = "Basel") => buildCurrentMoment({
  decisionId: `decision-${userId}-${contentHash({ explicit, now }).slice(0, 8)}`, userId,
  request: { requestId: `request-${userId}`, query: "fixture" }, explicit,
  context: { now, timeZone: city === "Copenhagen" ? "Europe/Copenhagen" : "Europe/Zurich", location: { city, source: "explicit_selected", id: `city-${city}` } },
  memoryPatterns: [], memoryConsentState: "granted", observedAt: now
}).currentMoment;
const project = (profile, moment, currentIntent = {}) => buildRelevantUserProjection({ userIntelligence: profile, currentMoment: moment, currentIntent });

test("N5 contracts, budgets and hashes are explicit", () => {
  assert.equal(Object.keys(N5_VERSIONS).length, 6);
  assert.equal(N5_LIMITS.maxTasteConcepts, 12);
  for (const hash of [N5_CONTRACT_HASH, N5_RELEVANCE_CONTRACT_HASH, N5_SUFFICIENCY_CONTRACT_HASH, N5_SUPPRESSION_CONTRACT_HASH]) assert.match(hash, /^[a-f0-9]{64}$/);
});

test("cold users remain sparse and honest", () => {
  const userId = "cold";
  const result = project(makeProfile(userId, [], [], { knowledgeState: "COLD" }), makeMoment(userId, { activity_intent: ["culture"] }), { requiredPlaceTypes: ["culture"] });
  assert.deepEqual(result.projection.relevantTaste, []);
  assert.equal(result.projection.knowledgeSufficiency.level, "LOW");
  assert.ok(result.projection.uncertainties.includes("COLD_USER"));
});

test("explicit current intent suppresses conflicting history", () => {
  const userId = "intent";
  const result = project(makeProfile(userId, [taste("vibe.quiet"), taste("vibe.lively")]), makeMoment(userId, { social_context: "friends", vibe: ["lively"] }), {
    conceptDirections: [{ concept: "vibe.quiet", direction: -1 }, { concept: "vibe.lively", direction: 1 }]
  });
  assert.ok(result.projection.relevantTaste.some(({ concept }) => concept === "vibe.lively"));
  assert.ok(!result.projection.relevantTaste.some(({ concept }) => concept === "vibe.quiet"));
  assert.ok(result.projection.suppressionSummary.audited.some(({ key, reasonCode }) => key === "vibe.quiet" && reasonCode === "CURRENT_INTENT_OVERRIDES_HISTORY"));
});

test("context taste replaces the same global concept without double counting", () => {
  const userId = "hierarchy";
  const result = project(makeProfile(userId, [
    taste("vibe.cozy"), taste("vibe.cozy", { kind: "CONTEXT", key: "audience.family" }, { affinity: 0.95 })
  ]), makeMoment(userId, { social_context: "family_with_kids", vibe: ["cozy"] }));
  const cozy = result.projection.relevantTaste.filter(({ concept }) => concept === "vibe.cozy");
  assert.equal(cozy.length, 1);
  assert.equal(cozy[0].sourceLayer, "CONTEXT");
});

test("place-type evidence is scoped and portable across cities", () => {
  const userId = "portable";
  const result = project(makeProfile(userId, [taste("price.budget", { kind: "PLACE_TYPE", key: "bar" })]), makeMoment(userId, { activity_intent: ["drink"] }, NOW, "Copenhagen"), { requiredPlaceTypes: ["bar"] });
  assert.equal(result.projection.relevantTaste[0].concept, "price.budget");
  assert.doesNotMatch(JSON.stringify(result.n6Projection), /Basel|Copenhagen|queryCity/);
});

test("patterns require matching independent context anchors", () => {
  const userId = "patterns";
  const patterns = [{ patternKey: "solo-afterwork", contextSignature: { audience: "solo", daypart: "evening", occasion: "afterwork", placeType: "bar" }, state: "KNOWN", confidence: 0.85, outcomeSupportCount: 4, recencyState: "CURRENT", version: N2_VERSIONS.behavioralPatternContract }];
  const profile = makeProfile(userId, [], patterns);
  const match = project(profile, makeMoment(userId, { social_context: "solo", occasion: "afterwork", activity_intent: ["drink"] }, "2026-08-18T17:30:00.000Z"), { requiredPlaceTypes: ["bar"] });
  const miss = project(profile, makeMoment(userId, { social_context: "family_with_kids", activity_intent: ["activity"] }), { requiredPlaceTypes: ["activity"] });
  assert.equal(match.projection.relevantPatterns.length, 1);
  assert.equal(miss.projection.relevantPatterns.length, 0);
});

test("N6 serialization is deterministic, bounded and contains no raw history", () => {
  const userId = "serialize";
  const result = project(makeProfile(userId, [taste("vibe.cozy")]), makeMoment(userId, { vibe: ["cozy"] }));
  assert.deepEqual(result.n6Projection, serializeRelevantUserProjectionForN6(result.projection));
  assert.ok(result.n6Projection.serializedBytes <= N5_LIMITS.maxSerializedBytes);
  assert.ok(result.n6Projection.estimatedTokens <= N5_LIMITS.maxEstimatedTokens);
  assert.doesNotMatch(JSON.stringify(result.n6Projection), /timeline|rawHistory|userId|spotId/);
  assert.equal(Object.isFrozen(result.projection), true);
});

test("candidate, latent truth, cross-user and consent influence fail closed", () => {
  const userId = "guard"; const profile = makeProfile(userId, [taste("vibe.cozy")]); const currentMoment = makeMoment(userId, { vibe: ["cozy"] });
  assert.throws(() => buildRelevantUserProjection({ userIntelligence: profile, currentMoment, currentIntent: {}, candidates: [] }), /unsupported_n5_input/);
  assert.throws(() => project({ ...profile, latentTruth: true }, currentMoment), /forbidden_n5_input/);
  assert.throws(() => project({ ...profile, userId: "other" }, currentMoment), /cross_user_projection/);
  assert.throws(() => project({ ...profile, consentState: "withdrawn" }, currentMoment), /personalization_consent_required/);
});

test("prospectively frozen N5 validation passes every mandatory arm", async () => {
  const result = await buildN5ValidationResult({ includePerformance: false });
  assert.equal(result.scenarioCount, 30);
  assert.equal(result.cohortArmCount, 15);
  assert.equal(result.allMandatoryGatesPass, true);
  assert.equal(result.scientificValidity, "PASS");
});
