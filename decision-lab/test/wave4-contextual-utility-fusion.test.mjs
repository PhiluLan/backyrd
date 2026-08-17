import test from "node:test";
import assert from "node:assert/strict";
import { buildUserTasteMap } from "../src/taste-engine.mjs";
import { rankWithContextualUtility, utilityContractManifest } from "../src/wave4-contextual-utility-fusion.mjs";

const spot = (id, moods, overrides = {}) => ({
  id,
  category: overrides.category ?? "bar",
  observed: { name: id, description: moods.join(" "), city: "Synthetic Basel", status: "approved", distribution: "normal", priceLevel: 3, moods, ...overrides },
});
const lively = spot("lively", ["lively", "social"]);
const quiet = spot("quiet", ["quiet", "cozy"]);
const neutral = buildUserTasteMap([], { asOf: "2026-08-10T12:00:00.000Z" });
const event = (id, concepts, spotId) => ({ id, userId: "user", eventType: "verified_visit", concepts, consent: "granted", occurredAt: `2026-07-${10 + id}T12:00:00.000Z`, placeType: "bar", contexts: ["audience.friends", "time.evening"], spotId, sessionId: `s${id}` });

test("Utility Contract is explicit, versioned and prohibits evaluation truth", () => {
  const manifest = utilityContractManifest();
  assert.equal(manifest.version, "backyrd-contextual-utility-contract-v1");
  assert.ok(manifest.prohibitedInputs.includes("latent_truth"));
  assert.equal(manifest.retrievalMutation, "NONE");
  assert.equal(manifest.interactions.personalizationBudget.maximumAbsoluteUtilityDelta, 0.08);
});

test("explicit current Intent remains authoritative over conflicting Taste", () => {
  const history = buildUserTasteMap([
    event(1, ["vibe.quiet", "vibe.cozy"], "q1"),
    event(2, ["vibe.quiet", "vibe.cozy"], "q2"),
    event(3, ["vibe.quiet", "vibe.cozy"], "q3"),
  ], { asOf: "2026-08-10T12:00:00.000Z" });
  const result = rankWithContextualUtility({ candidateIds: [quiet.id, lively.id], spots: [quiet, lively], tasteMap: history, request: { query: "heute laut und lebhaft", rawFreeText: "heute laut und lebhaft" }, context: { audience: "friends", timeBucket: "evening", weekday: 5 }, maturity: "power", limit: 2 });
  assert.equal(result.results[0].spotId, lively.id);
  assert.ok(result.allCandidates.every((candidate) => Math.abs(candidate.fusion.personalizationDelta) <= 0.08));
});

test("Cold Start is deterministic and UNKNOWN remains neutral", () => {
  const input = { candidateIds: [quiet.id, lively.id], spots: [quiet, lively], tasteMap: neutral, request: { query: "etwas trinken" }, context: { audience: "friends", timeBucket: "evening", weekday: 5 }, maturity: "cold", limit: 2 };
  const first = rankWithContextualUtility(input);
  const second = rankWithContextualUtility(input);
  assert.deepEqual(first, second);
  assert.ok(first.allCandidates.every((candidate) => candidate.fusion.personalizationDelta === 0));
});

test("Utility consumes only eligible canonical Candidates", () => {
  const pending = spot("pending", ["lively"], { status: "pending" });
  const excluded = spot("excluded", ["lively"], { distribution: "excluded" });
  assert.throws(() => rankWithContextualUtility({ candidateIds: [pending.id], spots: [pending], tasteMap: neutral, request: {}, context: {}, maturity: "cold" }), /product_ineligible/);
  assert.throws(() => rankWithContextualUtility({ candidateIds: [excluded.id], spots: [excluded], tasteMap: neutral, request: {}, context: {}, maturity: "cold" }), /distribution_ineligible/);
});

test("Flight Recorder preserves decomposed evidence and final ranking", () => {
  const result = rankWithContextualUtility({ candidateIds: [quiet.id, lively.id], spots: [quiet, lively], tasteMap: neutral, request: { query: "gemütlich" }, context: { audience: "date", timeBucket: "evening" }, maturity: "cold", limit: 2 });
  assert.equal(result.recorder.candidateCount, 2);
  assert.ok(result.recorder.candidates.every((candidate) => candidate.components.requestFit && candidate.components.contextFit && candidate.components.retrievalEvidence && candidate.fusion));
  assert.deepEqual(result.recorder.outputCandidateIds, result.results.map((row) => row.spotId));
});
