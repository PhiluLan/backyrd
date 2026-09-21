import test from "node:test";
import assert from "node:assert/strict";
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION } from "@backyrd/world-knowledge-core";
import { contentHash } from "../dist/canonical.js";
import { parseProductWorldResolverBinding } from "../dist/product-world-resolver-binding.js";
import { evaluateOpeningState } from "../dist/opening-state.js";
import { evaluateProductV1IntentClassification, evaluateProductWorldViews } from "../dist/product-v1-evaluator.js";

const at = "2026-09-20T12:00:00.000Z";
const fact = (key, value, extras = {}) => ({ key, value, scope: "SPOT", resolution: "KNOWN_VALUE", freshness: "CURRENT", trust: "VERIFIED", basisClaimHashes: [contentHash(key)], ...extras });
const binding = (spotId, rows, unknowns = []) => ({
  contractVersion: "backyrd.world-knowledge.product-resolver-binding@1.0",
  manifestHash: contentHash({ spotId, rows, unknowns }), registryHash: REGISTRY_HASH, resolvedAt: at,
  decisionProjection: { contractVersion: "backyrd.world-knowledge.product-decision-projection@1.0", registryVersion: REGISTRY_VERSION,
    policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, spotId,
    facts: [fact("identity.name", "Synthetic Spot"), fact("location.locality", "Basel"), ...rows,
      ...unknowns.map((key) => ({ key, value: null, scope: "SPOT", resolution: "UNKNOWN", freshness: "CURRENT", trust: "VERIFIED", basisClaimHashes: [contentHash(key)] }))],
    explicitUnknowns: unknowns.map((key) => ({ key, scope: "SPOT" })), conflicts: [] },
});
const voltaId = "1101ee26-5046-4cdc-921a-5a3bd4cb5306";
const cafeId = "22222222-2222-4222-a222-222222222222";
const policy = { version: "test-verified", configured: true, authorizedTrustStates: ["VERIFIED"] };
const read = (value) => parseProductWorldResolverBinding(value, "Basel");

test("time-valid AREA_CLOSED from the manifest's claim closes the venue, then expires", () => {
  const world = read(binding(voltaId, [fact("state.current", { kind: "AREA_CLOSED", scope: "VENUE" }, { validityVerified: true, validFrom: null, validUntil: "2026-12-23T15:31:00.000Z" })]));
  assert.equal(evaluateOpeningState(world, at, policy).status, "closed");
  assert.equal(evaluateOpeningState(world, "2026-12-24T12:00:00.000Z", policy).status, "expired");
  const unverified = binding(voltaId, [fact("state.current", { kind: "AREA_CLOSED", scope: "VENUE" })]);
  assert.throws(() => read(unverified), /validity_unverified/);
  const noExpiry = binding(voltaId, [fact("state.current", { kind: "AREA_CLOSED", scope: "VENUE" }, { validityVerified: true, validFrom: null, validUntil: null })]);
  assert.throws(() => read(noExpiry), /validity_unverified/);
});

test("Volta's verified PUB confirms drinks, but onsite coffee cannot replace its EAT/PUB primary purpose", () => {
  const world = read(binding(voltaId, [fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "EAT"), fact("classification.place_types", ["PUB"]), fact("offering.groups", ["COFFEE"])], ["offering.onsite"]));
  assert.equal(world.explicitUnknowns.find((row) => row.key === "offering.onsite")?.key, "offering.onsite");
  const core = { purpose: "EAT_DRINK", category: world.spot.classification.primaryCategory, placeTypes: world.spot.classification.placeTypes, disputed: false, evidenceSourceHash: world.snapshotHash };
  assert.equal(evaluateProductV1IntentClassification({ ...core, intent: "DRINKS" }).state, "CONFIRMED");
  assert.equal(evaluateProductV1IntentClassification({ ...core, intent: "COFFEE" }).state, "INCOMPATIBLE");
});

test("Volta's current AREA_CLOSED blocks even a core-matching drinks request", () => {
  const world = read(binding(voltaId, [fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "EAT"), fact("classification.place_types", ["PUB"]), fact("state.current", { kind: "AREA_CLOSED", scope: "VENUE" }, { validityVerified: true, validFrom: null, validUntil: "2026-12-23T15:31:00.000Z" })]));
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "volta-request", idempotencyKey: "volta-key", naturalLanguage: "Ein Drink in Basel", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, [world], contentHash([world.spot.spotId]));
  assert.equal(result.evaluation.candidates[0].coreIntentCoverage.state, "CONFIRMED");
  assert.equal(result.evaluation.candidates[0].tier, "INELIGIBLE");
  assert.ok(result.evaluation.candidates[0].failedHardConstraints.includes("ACTUAL_AVAILABILITY"));
  assert.ok(result.evaluation.candidates[0].reasons.some((row) => row.reasonCode === "currently-closed"));
});

test("a closure expiring tonight cannot close a requested future Sunday", () => {
  const world = read(binding(voltaId, [fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "DRINKS"), fact("state.current", { kind: "AREA_CLOSED", scope: "VENUE" }, { validityVerified: true, validFrom: null, validUntil: "2026-09-19T22:00:00.000Z" })]));
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "future-request", idempotencyKey: "future-key", naturalLanguage: "Sonntag einen Drink in Basel", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: "2026-09-19T12:00:00.000Z" }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, [world], contentHash([world.spot.spotId]));
  assert.equal(result.evaluation.candidates[0].actualAvailability.status, "unknown");
  assert.equal(result.evaluation.candidates[0].failedHardConstraints.includes("ACTUAL_AVAILABILITY"), false);
  assert.ok(result.evaluation.candidates[0].unknownHardConstraints.includes("OPEN_ON_REQUESTED_DAY"));
});

test("an explicitly requested weekday is checked against verified hours and explained with exact intervals", () => {
  const common = [fact("location.timezone", "Europe/Zurich"), fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "COFFEE_DAYTIME"), fact("classification.place_types", ["CAFE"])];
  const open = read(binding("33333333-3333-4333-a333-333333333333", [...common, fact("hours.regular", [{ day: "SUNDAY", intervals: [{ start: "09:00", end: "18:00" }] }])]));
  const closed = read(binding("44444444-4444-4444-a444-444444444444", [...common, fact("hours.regular", [{ day: "SUNDAY", intervals: [] }])]));
  const missing = read(binding("55555555-5555-4555-a555-555555555555", common, ["hours.regular"]));
  const worlds = [open, closed, missing];
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "sunday-hours-request", idempotencyKey: "sunday-hours-key", naturalLanguage: "Sonntag gemütlich Kaffee trinken", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
  const byId = new Map(result.evaluation.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const openAssessment = byId.get(open.spot.spotId);
  const closedAssessment = byId.get(closed.spot.spotId);
  const missingAssessment = byId.get(missing.spot.spotId);
  assert.equal(openAssessment.actualAvailability.status, "open");
  assert.ok(openAssessment.confirmedHardConstraints.includes("OPEN_ON_REQUESTED_DAY"));
  assert.equal(openAssessment.reasons.find((reason) => reason.reasonCode === "requested-day-opening-hours")?.statementDe, "Öffnungszeiten am gefragten Sonntag: 09:00–18:00.");
  assert.equal(closedAssessment.actualAvailability.status, "closed");
  assert.equal(closedAssessment.tier, "INELIGIBLE");
  assert.ok(closedAssessment.failedHardConstraints.includes("OPEN_ON_REQUESTED_DAY"));
  assert.equal(missingAssessment.actualAvailability.status, "unknown");
  assert.ok(missingAssessment.unknownHardConstraints.includes("OPEN_ON_REQUESTED_DAY"));
  assert.equal(missingAssessment.tier, "UNCONFIRMED_FALLBACK");
});

test("a verified overnight interval counts on the requested following day", () => {
  const world = read(binding("66666666-6666-4666-a666-666666666666", [
    fact("location.timezone", "Europe/Zurich"), fact("purpose.primary_visit", "EAT_DRINK"),
    fact("classification.primary_category", "COFFEE_DAYTIME"), fact("classification.place_types", ["CAFE"]),
    fact("hours.regular", [{ day: "SATURDAY", intervals: [{ start: "22:00", end: "02:00" }] }, { day: "SUNDAY", intervals: [] }]),
  ]));
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "overnight-request", idempotencyKey: "overnight-key", naturalLanguage: "Sonntag Kaffee trinken", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, [world], contentHash([world.spot.spotId]));
  assert.equal(result.evaluation.candidates[0].actualAvailability.status, "open");
  assert.equal(result.evaluation.candidates[0].reasons.find((reason) => reason.reasonCode === "requested-day-opening-hours")?.statementDe, "Öffnungszeiten am gefragten Sonntag: 00:00–02:00.");
});

test("confirmed context changes ranking evidence; missing data and numeric budget remain unknown", () => {
  const contextConditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };
  const cafe = read(binding(cafeId, [fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "COFFEE_DAYTIME"), fact("classification.place_types", ["CAFE"]), fact("context.atmosphere", [{ atmosphere: "COZY", conditions: contextConditions }]), fact("operation.price_level", "MEDIUM")], ["context.typical_dayparts"]));
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "bridge-request", idempotencyKey: "bridge-key", naturalLanguage: "Sonntag gemütlich Kaffee trinken, höchstens 20 CHF", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const projection = { status: "NEUTRAL", projectionHash: contentHash("neutral") };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, projection, [cafe], contentHash([cafe.spot.spotId]));
  const assessed = result.evaluation.candidates[0];
  assert.ok(assessed.matchedSoftPreferences.includes("ATMOSPHERE_QUIET"));
  assert.ok(assessed.reasons.some((row) => row.reasonCode === "atmosphere-fit" && row.confirmed));
  assert.ok(assessed.unknownHardConstraints.includes("BUDGET_MAXIMUM"));
  assert.equal(assessed.typicalDaypart.state, "UNKNOWN");
  assert.equal(assessed.tier, "UNCONFIRMED_FALLBACK");
});

test("Consum Weinbar's verified date, quiet atmosphere and evening context affect Product reasons", () => {
  const conditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };
  const world = read(binding("ff90b2f4-0c51-4423-adb5-e9a0ad22213e", [
    fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "DRINKS"), fact("classification.place_types", ["WINE_BAR"]),
    fact("context.visit_situations", [{ situation: "DATE_PAIR", conditions }]), fact("context.atmosphere", [{ atmosphere: "QUIET", conditions }]),
    fact("context.typical_dayparts", [{ daypart: "EVENING", conditions: { days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null } }]), fact("operation.price_level", "HIGH"),
  ]));
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "consum-request", idempotencyKey: "consum-key", naturalLanguage: "Abends gemütlich Wein trinken für ein Date in Basel", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, [world], contentHash([world.spot.spotId]));
  const assessed = result.evaluation.candidates[0];
  assert.equal(assessed.coreIntentCoverage.state, "CONFIRMED");
  assert.deepEqual(assessed.matchedSoftPreferences, ["ATMOSPHERE_QUIET", "TYPICAL_DAYPART", "VISIT_SITUATION"]);
  assert.ok(assessed.reasons.some((row) => row.reasonCode === "daypart-fit" && row.confirmed));
});
