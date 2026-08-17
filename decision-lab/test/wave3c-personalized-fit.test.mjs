import test from "node:test";
import assert from "node:assert/strict";
import { buildUserTasteMap } from "../src/taste-engine.mjs";
import { personalizedFitManifest, rankWithPersonalizedFit, spotTasteConcepts } from "../src/wave3c-personalized-fit.mjs";

const spot = (id, moods, category = "bar", overrides = {}) => ({
  id, category, observed: { name: id, description: moods.join(" "), city: "Synthetic Basel", status: "approved", distribution: "normal", priceLevel: 3, moods, ...overrides },
});
const lively = spot("lively", ["lively", "social"]);
const quiet = spot("quiet", ["quiet", "cozy"]);
const neutralMap = buildUserTasteMap([], { asOf: "2026-08-10T12:00:00.000Z" });
const evidence = (id, eventType, concepts, spotId, sessionId) => ({ id, userId: "user", eventType, concepts, consent: "granted", occurredAt: `2026-07-${String(10 + id).padStart(2, "0")}T12:00:00.000Z`, placeType: "bar", contexts: ["audience.friends", "time.evening", "time.weekday"], spotId, sessionId });

test("explicit current intent outranks conflicting history inside the eligible pool", () => {
  const history = buildUserTasteMap([
    evidence(1, "saved", ["vibe.quiet", "vibe.cozy"], "q1", "s1"),
    evidence(2, "verified_visit", ["vibe.quiet", "vibe.cozy"], "q2", "s2"),
    evidence(3, "positive_post_visit", ["vibe.quiet", "vibe.cozy"], "q3", "s3"),
  ], { asOf: "2026-08-10T12:00:00.000Z" });
  const ranked = rankWithPersonalizedFit({ candidateIds: [quiet.id, lively.id], spots: [quiet, lively], tasteMap: history, request: { query: "heute laut und lebhaft", rawFreeText: "heute laut und lebhaft" }, context: { audience: "friends", timeBucket: "evening", weekday: 5 }, maturity: "mature" });
  assert.equal(ranked.results[0].spotId, lively.id);
  assert.ok(ranked.results.every((row) => row.evidence.intentFit.matched.every((item) => item.authority === "EXPLICIT_CURRENT_INTENT")));
});

test("unknown Taste is neutral and does not invent personal movement", () => {
  const input = { candidateIds: [lively.id, quiet.id], spots: [lively, quiet], tasteMap: neutralMap, request: { query: "etwas trinken" }, context: { audience: "friends", timeBucket: "evening", weekday: 5 }, maturity: "cold" };
  const first = rankWithPersonalizedFit(input); const second = rankWithPersonalizedFit(input);
  assert.deepEqual(first, second);
  assert.ok(first.allCandidates.every((row) => row.evidence.personalWeight === 0));
});

test("the Fit layer preserves Product and Distribution eligibility fail closed", () => {
  const pending = spot("pending", ["lively"], "bar", { status: "pending" });
  const excluded = spot("excluded", ["lively"], "bar", { distribution: "excluded" });
  assert.throws(() => rankWithPersonalizedFit({ candidateIds: [pending.id], spots: [pending], tasteMap: neutralMap, request: {}, context: {}, maturity: "cold" }), /product_ineligible/);
  assert.throws(() => rankWithPersonalizedFit({ candidateIds: [excluded.id], spots: [excluded], tasteMap: neutralMap, request: {}, context: {}, maturity: "cold" }), /distribution_ineligible/);
});

test("Spot representation uses observed intelligence and preserves source candidates", () => {
  assert.ok(spotTasteConcepts(lively).includes("vibe.lively"));
  const ranked = rankWithPersonalizedFit({ candidateIds: [quiet.id, lively.id], spots: [quiet, lively], tasteMap: neutralMap, request: {}, context: {}, maturity: "cold" });
  assert.deepEqual(new Set(ranked.allCandidates.map((row) => row.spotId)), new Set([quiet.id, lively.id]));
  assert.equal(ranked.recorder.candidateCount, 2);
});

test("manifest prohibits evaluation truth and final utility inputs", () => {
  const manifest = personalizedFitManifest();
  assert.equal(manifest.latentTruthUse, undefined);
  assert.ok(manifest.prohibitedInputs.includes("latent_truth"));
  assert.equal(manifest.retrievalMutation, "NONE");
  assert.equal(manifest.finalUtilityModel, "NOT_IMPLEMENTED");
});
