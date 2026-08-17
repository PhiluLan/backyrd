import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_MODEL, TASTE_ENGINE_VERSIONS, TASTE_SPACE,
  buildUserTasteMap, projectCurrentTaste, validateTasteEngineScientificBoundary
} from "../src/taste-engine.mjs";
import { validateTasteEngineFreeze } from "../src/taste-engine-freeze.mjs";

const AS_OF = "2026-08-17T12:00:00.000Z";
const userId = "user-wave3a";
const event = (id, eventType, concepts, options = {}) => ({
  id, userId, eventType, concepts, consent: "granted",
  occurredAt: options.occurredAt ?? "2026-08-16T12:00:00.000Z",
  spotId: options.spotId ?? `spot-${id}`,
  sessionId: options.sessionId ?? `session-${id}`,
  placeType: options.placeType ?? "cafe",
  contexts: options.contexts ?? []
});
const row = (map, concept, kind = "GLOBAL", key = "global") => map.rows.find((item) => item.concept === concept && item.scope.kind === kind && item.scope.key === key);

test("taste contracts are independently versioned and the universal space is controlled", () => {
  assert.equal(Object.keys(TASTE_ENGINE_VERSIONS).length, 6);
  assert.ok(TASTE_SPACE.length >= 35);
  assert.equal(new Set(TASTE_SPACE.map(({ key }) => key)).size, TASTE_SPACE.length);
  assert.ok(TASTE_SPACE.some(({ key }) => key === "place_type.cafe"));
});

test("a new user remains unknown instead of receiving fabricated preferences", () => {
  const map = buildUserTasteMap([], { asOf: AS_OF });
  assert.deepEqual(map.rows, []);
  assert.equal(map.unknownConcepts.length, TASTE_SPACE.length);
  assert.equal(map.userId, null);
});

test("exposure and not-there corrections are not preference evidence", () => {
  const map = buildUserTasteMap([
    event("shown", "decision_shown", []),
    event("not-there", "not_there", [])
  ], { asOf: AS_OF });
  assert.deepEqual(map.rows, []);
  assert.equal(EVIDENCE_MODEL.decision_shown.strength, 0);
  assert.equal(EVIDENCE_MODEL.not_there.direction, 0);
});

test("repeated independent positive evidence increases affinity and confidence without unbounded growth", () => {
  const one = buildUserTasteMap([event("one", "liked", ["vibe.cozy"])], { asOf: AS_OF });
  const many = buildUserTasteMap([
    event("one", "liked", ["vibe.cozy"]),
    event("two", "saved", ["vibe.cozy"]),
    event("three", "verified_visit", ["vibe.cozy"]),
    event("four", "positive_post_visit", ["vibe.cozy"])
  ], { asOf: AS_OF });
  assert.ok(row(many, "vibe.cozy").affinity > row(one, "vibe.cozy").affinity);
  assert.ok(row(many, "vibe.cozy").confidence > row(one, "vibe.cozy").confidence);
  assert.ok(row(one, "vibe.cozy").affinity < 0.5);
  assert.ok(row(many, "vibe.cozy").affinity <= 1);
});

test("explicit negative evidence is separate and conflicting evidence lowers certainty", () => {
  const positive = buildUserTasteMap([
    event("p1", "saved", ["energy.energetic"]), event("p2", "liked", ["energy.energetic"])
  ], { asOf: AS_OF });
  const conflict = buildUserTasteMap([
    event("p1", "saved", ["energy.energetic"]), event("p2", "liked", ["energy.energetic"]),
    event("n1", "disliked", ["energy.energetic"]), event("n2", "negative_post_visit", ["energy.energetic"])
  ], { asOf: AS_OF });
  const negative = buildUserTasteMap([
    event("n1", "disliked", ["energy.energetic"]), event("n2", "negative_post_visit", ["energy.energetic"])
  ], { asOf: AS_OF });
  assert.ok(row(negative, "energy.energetic").affinity < 0);
  assert.ok(row(conflict, "energy.energetic").confidence < row(positive, "energy.energetic").confidence);
  assert.equal(row(conflict, "energy.energetic").positiveEventCount, 2);
  assert.equal(row(conflict, "energy.energetic").negativeEventCount, 2);
});

test("diverse spots and sessions produce more confidence than repeated evidence from one source", () => {
  const repeated = buildUserTasteMap([1, 2, 3].map((index) => event(`r${index}`, "liked", ["discovery.hidden_gem"], { spotId: "same-spot", sessionId: "same-session" })), { asOf: AS_OF });
  const diverse = buildUserTasteMap([1, 2, 3].map((index) => event(`d${index}`, "liked", ["discovery.hidden_gem"])), { asOf: AS_OF });
  assert.ok(row(diverse, "discovery.hidden_gem").confidence > row(repeated, "discovery.hidden_gem").confidence);
});

test("old evidence decays and recent corroboration can express preference drift", () => {
  const old = event("old", "saved", ["vibe.quiet"], { occurredAt: "2023-08-17T12:00:00.000Z" });
  const oldMap = buildUserTasteMap([old], { asOf: AS_OF });
  const driftMap = buildUserTasteMap([
    old,
    event("new1", "disliked", ["vibe.quiet"]),
    event("new2", "negative_post_visit", ["vibe.quiet"])
  ], { asOf: AS_OF });
  assert.equal(row(oldMap, "vibe.quiet").decayState, "STALE");
  assert.ok(row(driftMap, "vibe.quiet").affinity < 0);
});

test("onboarding is confidence-capped and later behavior can override it", () => {
  const initial = buildUserTasteMap([event("onboard", "onboarding_preference", ["price.premium"])], { asOf: AS_OF });
  const corrected = buildUserTasteMap([
    event("onboard", "onboarding_preference", ["price.premium"]),
    event("n1", "disliked", ["price.premium"]), event("n2", "negative_post_visit", ["price.premium"]),
    event("n3", "negative_post_visit", ["price.premium"])
  ], { asOf: AS_OF });
  assert.ok(row(initial, "price.premium").confidence <= 0.35);
  assert.ok(row(corrected, "price.premium").affinity < 0);
});

test("place-type and contextual scopes modulate rather than duplicate global taste", () => {
  const map = buildUserTasteMap([
    event("family", "saved", ["social_style.family_friendly"], { placeType: "activity", contexts: ["audience.family", "time.weekend"] }),
    event("friends", "saved", ["energy.energetic"], { placeType: "bar", contexts: ["audience.friends", "time.evening"] })
  ], { asOf: AS_OF });
  assert.ok(row(map, "social_style.family_friendly", "PLACE_TYPE", "activity"));
  assert.ok(row(map, "energy.energetic", "CONTEXT", "audience.friends"));
  const family = projectCurrentTaste(map, { placeType: "activity", contexts: ["audience.family", "time.weekend"] });
  const friends = projectCurrentTaste(map, { placeType: "bar", contexts: ["audience.friends", "time.evening"] });
  const familyEnergy = family.rows.find(({ concept }) => concept === "energy.energetic");
  const friendsEnergy = friends.rows.find(({ concept }) => concept === "energy.energetic");
  assert.ok(friendsEnergy.affinity > familyEnergy.affinity);
  assert.notEqual(family.projectionHash, friends.projectionHash);
});

test("explicit current intent is authoritative over contradictory history", () => {
  const map = buildUserTasteMap([
    event("quiet1", "saved", ["vibe.quiet"]), event("quiet2", "positive_post_visit", ["vibe.quiet"])
  ], { asOf: AS_OF });
  const projection = projectCurrentTaste(map, { explicitIntent: [{ concept: "vibe.quiet", direction: -1 }, { concept: "vibe.lively", direction: 1 }] });
  assert.ok(projection.rows.find(({ concept }) => concept === "vibe.quiet").affinity <= -0.75);
  assert.ok(projection.rows.find(({ concept }) => concept === "vibe.lively").affinity >= 0.75);
  assert.equal(projection.rows.find(({ concept }) => concept === "vibe.quiet").authority, "EXPLICIT_CURRENT_INTENT");
  assert.equal(projection.hardConstraints, "OUTSIDE_TASTE_AND_AUTHORITATIVE");
});

test("processing is idempotent and conflicting reuse of an evidence id fails closed", () => {
  const input = event("same", "saved", ["vibe.cozy"]);
  const once = buildUserTasteMap([input], { asOf: AS_OF });
  const repeated = buildUserTasteMap([input, structuredClone(input)], { asOf: AS_OF });
  assert.equal(once.mapHash, repeated.mapHash);
  assert.throws(() => buildUserTasteMap([input, { ...input, eventType: "liked" }], { asOf: AS_OF }), /evidence_id_conflict/);
});

test("consent, context bounds, concept allowlist and single-user boundaries fail closed", () => {
  assert.throws(() => buildUserTasteMap([{ ...event("x", "liked", ["vibe.cozy"]), consent: "missing" }], { asOf: AS_OF }), /consent/);
  assert.throws(() => buildUserTasteMap([event("x", "liked", ["forbidden.secret"])], { asOf: AS_OF }), /unknown_taste_concept/);
  assert.throws(() => buildUserTasteMap([event("x", "liked", ["vibe.cozy"], { contexts: ["audience.family", "audience.friends"] })], { asOf: AS_OF }), /context_scope_explosion/);
  assert.throws(() => buildUserTasteMap([event("x", "liked", ["vibe.cozy"], { contexts: ["time.morning", "time.evening"] })], { asOf: AS_OF }), /context_scope_explosion/);
  assert.throws(() => buildUserTasteMap([event("x", "liked", ["vibe.cozy"], { occurredAt: "2026-08-18T12:00:00.000Z" })], { asOf: AS_OF }), /future_evidence_not_allowed/);
  assert.throws(() => buildUserTasteMap([event("x", "liked", ["vibe.cozy"]), { ...event("y", "liked", ["vibe.cozy"]), userId: "other" }], { asOf: AS_OF }), /mixed_user_evidence/);
});

test("scientific boundary rejects latent truth and runtime utility leakage", () => {
  assert.equal(validateTasteEngineScientificBoundary({ event: event("x", "liked", ["vibe.cozy"]) }), true);
  assert.equal(validateTasteEngineScientificBoundary({ latentTruth: { cozy: 1 } }), false);
  assert.equal(validateTasteEngineScientificBoundary({ expected_utility: 0.9 }), false);
});

test("the versioned Taste Engine freeze validates without silent contract drift", async () => {
  const result = await validateTasteEngineFreeze();
  assert.equal(result.valid, true, result.reasons.join(","));
  assert.equal(result.actual.freezeVersion, "backyrd-taste-engine-freeze-v1.1");
});

test("calibrated learning requires corroboration before strong affinity", () => {
  const singleOutcome = buildUserTasteMap([event("one-outcome", "positive_post_visit", ["vibe.cozy"])], { asOf: AS_OF });
  const repeatedWeak = buildUserTasteMap(Array.from({ length: 8 }, (_, index) => event(`weak-${index}`, "spot_tapped", ["vibe.cozy"], {
    spotId: "same-spot", sessionId: "same-session"
  })), { asOf: AS_OF });
  const corroborated = buildUserTasteMap(Array.from({ length: 3 }, (_, index) => event(`strong-${index}`, "positive_post_visit", ["vibe.cozy"], {
    spotId: `spot-${index}`, sessionId: `session-${index}`
  })), { asOf: AS_OF });
  const affinity = (map) => map.rows.find(({ concept, scope }) => concept === "vibe.cozy" && scope.kind === "GLOBAL").affinity;
  assert.ok(Math.abs(affinity(singleOutcome)) < 0.15);
  assert.ok(Math.abs(affinity(repeatedWeak)) < 0.15);
  assert.ok(affinity(corroborated) > 0.15);
});
