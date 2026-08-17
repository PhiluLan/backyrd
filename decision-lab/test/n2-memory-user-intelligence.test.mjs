import test from "node:test";
import assert from "node:assert/strict";
import {
  N2_MEMORY_CONTRACT_HASH, N2_VERSIONS, RETENTION_CLASSES,
  buildUserIntelligence, deriveBehavioralPatterns, ingestMemoryEvents,
  memoryToTasteEvidence, queryUserIntelligence, validateMemoryEvent,
  validateN2ScientificBoundary
} from "../src/n2-memory-user-intelligence.mjs";
import { buildN2AcceptanceResult } from "../src/n2-acceptance.mjs";
import { validateN2Freeze } from "../src/n2-freeze.mjs";

const AS_OF = "2026-08-17T12:00:00.000Z";
const USER = "user-n2";
const event = (id, eventType, options = {}) => ({
  id, userId: options.userId ?? USER, idempotencyKey: options.idempotencyKey ?? `product:${id}`,
  eventType, contractVersion: N2_VERSIONS.memoryEventContract,
  occurredAt: options.occurredAt ?? "2026-08-10T12:00:00.000Z",
  observedAt: options.observedAt, ingestedAt: options.ingestedAt,
  sessionId: options.sessionId ?? `session-${id}`, spotId: options.spotId ?? `spot-${id}`,
  decisionId: options.decisionId ?? "decision-1",
  momentSignature: options.momentSignature ?? { audience: "friends", daypart: "evening", calendar: "weekend", occasion: "afterwork", placeType: "bar" },
  spotEvidence: options.spotEvidence ?? { placeType: "bar", concepts: ["discovery.hidden_gem", "vibe.social"] },
  provenance: options.provenance ?? { source: "product_event", sourceEventId: id, sourceVersion: "v1" },
  consentPurpose: "personalized_recommendations", consentState: options.consentState ?? "granted",
  supersedesEventId: options.supersedesEventId
});

test("the N2 contracts are independently versioned, bounded and deterministic", () => {
  assert.equal(Object.keys(N2_VERSIONS).length, 6);
  assert.match(N2_MEMORY_CONTRACT_HASH, /^[a-f0-9]{64}$/);
  assert.equal(RETENTION_CLASSES.EXPOSURE.maxAgeDays, 90);
  assert.equal(validateMemoryEvent(event("save", "saved"), { asOf: AS_OF }).eventClass, "DELIBERATE_INTENT");
  assert.equal(validateMemoryEvent(event("save", "saved"), { asOf: AS_OF }).eventHash, validateMemoryEvent(event("save", "saved"), { asOf: AS_OF }).eventHash);
});

test("memory is immutable fact while Taste is rebuilt through the unchanged adapter", () => {
  const ledger = ingestMemoryEvents([
    event("shown", "candidate_exposed", { spotEvidence: { placeType: "bar", concepts: [] } }),
    event("tap", "spot_tapped"), event("save", "saved"), event("visit", "verified_visit")
  ], { asOf: AS_OF });
  const taste = memoryToTasteEvidence(ledger);
  assert.equal(ledger.events.length, 4);
  assert.equal(taste.find(({ id }) => id === "shown").eventType, "decision_shown");
  assert.equal(taste.find(({ id }) => id === "visit").eventType, "verified_visit");
  assert.ok(ledger.events.every((item) => !Object.hasOwn(item, "affinity")));
});

test("duplicate and replay are idempotent while conflicting identities fail closed", () => {
  const saved = event("same", "saved");
  const once = ingestMemoryEvents([saved], { asOf: AS_OF });
  const replay = ingestMemoryEvents([saved, structuredClone(saved)], { asOf: AS_OF });
  assert.equal(once.ledgerHash, replay.ledgerHash);
  assert.equal(replay.events.length, 1);
  assert.throws(() => ingestMemoryEvents([saved, { ...saved, eventType: "spot_tapped" }], { asOf: AS_OF }), /memory_idempotency_conflict/);
  assert.throws(() => ingestMemoryEvents([saved, event("different", "saved", { idempotencyKey: saved.idempotencyKey })], { asOf: AS_OF }), /memory_idempotency_conflict/);
});

test("out-of-order ingestion is deterministic and append-only correction supersedes without mutation", () => {
  const original = event("original", "saved", { occurredAt: "2026-08-01T12:00:00Z" });
  const correction = event("correction", "not_there", { occurredAt: "2026-08-02T12:00:00Z", supersedesEventId: "original", spotEvidence: { placeType: "bar", concepts: [] } });
  const forward = ingestMemoryEvents([original, correction], { asOf: AS_OF });
  const reverse = ingestMemoryEvents([correction, original], { asOf: AS_OF });
  assert.equal(forward.ledgerHash, reverse.ledgerHash);
  assert.deepEqual(forward.supersededEventIds, ["original"]);
  assert.equal(forward.events.length, 2);
  assert.deepEqual(memoryToTasteEvidence(forward).map(({ eventType }) => eventType), ["not_there"]);
});

test("exposure and not-there remain neutral and weak events cannot manufacture strong Taste", () => {
  const inputs = [event("shown", "candidate_exposed", { spotEvidence: { placeType: "bar", concepts: [] } }), event("not-there", "not_there", { spotEvidence: { placeType: "bar", concepts: [] } })];
  const profile = buildUserIntelligence(inputs, { asOf: AS_OF });
  assert.equal(profile.tasteMap.rows.length, 0);
  const weak = buildUserIntelligence(Array.from({ length: 30 }, (_, index) => event(`tap-${index}`, "spot_tapped", { spotId: "same-spot", sessionId: "same-session" })), { asOf: AS_OF });
  const row = weak.tasteMap.rows.find(({ concept, scope }) => concept === "discovery.hidden_gem" && scope.kind === "GLOBAL");
  assert.ok(Math.abs(row.affinity) <= 0.14);
  assert.equal(row.distinctSpotCount, 1);
  assert.equal(row.distinctSessionCount, 1);
});

test("independent outcomes create a pattern while one-off and weak evidence remain UNKNOWN", () => {
  const common = { momentSignature: { audience: "solo", daypart: "evening", calendar: "weekday", occasion: "afterwork", placeType: "cafe", friction: "low" }, spotEvidence: { placeType: "cafe", concepts: ["vibe.quiet"] } };
  const one = ingestMemoryEvents([event("one", "verified_visit", common)], { asOf: AS_OF });
  assert.equal(deriveBehavioralPatterns(one, { asOf: AS_OF })[0].state, "UNKNOWN");
  const repeated = buildUserIntelligence([
    event("a", "verified_visit", { ...common, occurredAt: "2026-07-01T12:00:00Z", sessionId: "s1", spotId: "p1" }),
    event("b", "positive_post_visit", { ...common, occurredAt: "2026-07-12T12:00:00Z", sessionId: "s2", spotId: "p2" }),
    event("c", "verified_visit", { ...common, occurredAt: "2026-08-01T12:00:00Z", sessionId: "s3", spotId: "p3" }),
    event("d", "saved", { ...common, occurredAt: "2026-08-05T12:00:00Z", sessionId: "s4", spotId: "p4" })
  ], { asOf: AS_OF });
  assert.equal(repeated.patterns.length, 1);
  assert.equal(repeated.patterns[0].state, "KNOWN");
  assert.ok(repeated.patterns[0].confidence >= 0.55);
});

test("contradictory evidence is retained rather than averaged into false certainty", () => {
  const profile = buildUserIntelligence([
    event("positive-1", "positive_post_visit"), event("positive-2", "saved"),
    event("negative-1", "negative_post_visit"), event("negative-2", "explicit_negative")
  ], { asOf: AS_OF });
  assert.ok(profile.contradictions.some(({ concept }) => concept === "discovery.hidden_gem"));
  const row = profile.tasteMap.rows.find(({ concept, scope }) => concept === "discovery.hidden_gem" && scope.kind === "GLOBAL");
  assert.ok(row.positiveEventCount > 0 && row.negativeEventCount > 0);
  assert.ok(row.confidence < 0.8);
});

test("lifecycle states are evidence-aware rather than raw-count labels", () => {
  assert.equal(buildUserIntelligence([], { asOf: AS_OF }).knowledgeState, "COLD");
  assert.equal(buildUserIntelligence([event("onboard", "onboarding_preference")], { asOf: AS_OF }).knowledgeState, "EARLY");
  const repeated = Array.from({ length: 50 }, (_, index) => event(`tap-${index}`, "spot_tapped", { sessionId: "same-session", spotId: "same-spot" }));
  assert.equal(buildUserIntelligence(repeated, { asOf: AS_OF }).knowledgeState, "DEVELOPING");
  const mature = Array.from({ length: 35 }, (_, index) => event(`visit-${index}`, "verified_visit", { sessionId: `s-${index}`, spotId: `p-${index}` }));
  assert.equal(buildUserIntelligence(mature, { asOf: AS_OF }).knowledgeState, "LONG_TERM");
});

test("global and contextual User Intelligence travels across cities", () => {
  const inputs = [event("basel-1", "verified_visit"), event("basel-2", "positive_post_visit")].map((item) => ({ ...item, provenance: { ...item.provenance, city: "basel" } }));
  const basel = buildUserIntelligence(inputs, { asOf: AS_OF, queryCity: "basel" });
  const copenhagen = buildUserIntelligence(inputs, { asOf: AS_OF, queryCity: "copenhagen" });
  assert.equal(basel.tasteMap.mapHash, copenhagen.tasteMap.mapHash);
  assert.deepEqual(basel.graph.tasteConcepts, copenhagen.graph.tasteConcepts);
  assert.equal(copenhagen.boundaries.cityIndependentTruth, true);
});

test("consent withdrawal produces no derived residue and missing consent is never negative", () => {
  const withdrawn = buildUserIntelligence([event("save", "saved")], { asOf: AS_OF, consentState: "withdrawn" });
  assert.equal(withdrawn.knowledgeState, "UNKNOWN");
  assert.equal(withdrawn.tasteMap, null);
  assert.deepEqual(withdrawn.patterns, []);
  assert.deepEqual(withdrawn.timeline, []);
  assert.throws(() => validateMemoryEvent(event("no-consent", "saved", { consentState: "missing" }), { asOf: AS_OF }), /consent/);
});

test("malformed, future, stale, version-mismatched and cross-user inputs fail closed", () => {
  assert.throws(() => validateMemoryEvent({ ...event("future", "saved"), occurredAt: "2026-08-18T12:00:00Z" }, { asOf: AS_OF }), /future/);
  assert.throws(() => validateMemoryEvent({ ...event("old", "spot_tapped"), occurredAt: "2025-01-01T12:00:00Z" }, { asOf: AS_OF }), /stale/);
  assert.throws(() => validateMemoryEvent({ ...event("version", "saved"), contractVersion: "v0" }, { asOf: AS_OF }), /version/);
  assert.throws(() => validateMemoryEvent({ ...event("malformed", "saved"), momentSignature: { secretCoordinate: "x" } }, { asOf: AS_OF }), /unsupported_moment_field/);
  assert.throws(() => validateMemoryEvent({ ...event("place", "saved"), spotEvidence: { placeType: "unknown", concepts: ["vibe.cozy"] } }, { asOf: AS_OF }), /unknown_place_type/);
  assert.throws(() => validateMemoryEvent({ ...event("concept", "saved"), spotEvidence: { placeType: "bar", concepts: ["invented.preference"] } }, { asOf: AS_OF }), /unknown_spot_evidence_concept/);
  assert.throws(() => ingestMemoryEvents([event("a", "saved"), event("b", "saved", { userId: "other-user" })], { asOf: AS_OF }), /cross_user/);
  assert.throws(() => validateMemoryEvent({ ...event("leak", "saved"), latentTruth: {} }, { asOf: AS_OF }), /forbidden_memory_field/);
});

test("the query boundary is bounded and explicitly does not implement N5 relevance", () => {
  const profile = buildUserIntelligence([event("save", "saved")], { asOf: AS_OF });
  const result = queryUserIntelligence(profile, { concepts: ["vibe.social"], placeType: "bar", contexts: ["audience.friends"], includeTimeline: true, timelineLimit: 2 });
  assert.ok(result.tasteRows.every(({ concept }) => concept === "vibe.social"));
  assert.ok(result.timeline.length <= 2);
  assert.equal(result.boundary, "N5_MUST_SELECT_RELEVANCE");
});

test("scientific boundary excludes evaluation truth and private Trust evidence", () => {
  assert.equal(validateN2ScientificBoundary(event("safe", "saved")), true);
  assert.equal(validateN2ScientificBoundary({ oracle: true }), false);
  assert.equal(validateN2ScientificBoundary({ trust_score: 0.8 }), false);
});

test("1k and 10k event histories remain deterministic and queryable", { timeout: 15_000 }, () => {
  const history = Array.from({ length: 10_000 }, (_, index) => event(`bulk-${index}`, index % 5 === 0 ? "verified_visit" : "spot_tapped", {
    occurredAt: new Date(Date.parse("2026-02-20T12:00:00Z") + (index % 170) * 86_400_000 + index).toISOString(),
    sessionId: `session-${index % 120}`, spotId: `spot-${index % 400}`
  }));
  const started = performance.now();
  const profile = buildUserIntelligence(history, { asOf: AS_OF });
  const durationMs = performance.now() - started;
  assert.equal(profile.memorySummary.eventCount, 10_000);
  assert.ok(profile.timeline.length >= 10_000);
  assert.ok(durationMs < 10_000, `local 10k synthetic build took ${durationMs.toFixed(1)}ms`);
  const firstThousand = buildUserIntelligence(history.slice(0, 1_000), { asOf: AS_OF });
  assert.equal(firstThousand.memorySummary.eventCount, 1_000);
});

test("the sealed N2 acceptance artifact and freeze validate", async () => {
  const result = buildN2AcceptanceResult();
  assert.equal(result.acceptance.crossCityTasteHashEqual, true);
  assert.equal(result.acceptance.withdrawalLeavesDerivedRows, 0);
  const freeze = await validateN2Freeze();
  assert.equal(freeze.valid, true, freeze.reasons.join(","));
});
