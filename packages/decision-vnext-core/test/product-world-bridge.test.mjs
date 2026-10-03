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

test("a broad accessibility request rejects known barriers before ranking", () => {
  const common = [fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "COFFEE_DAYTIME"), fact("classification.place_types", ["CAFE"])];
  const trueFact = (key) => fact(key, true, { resolution: "KNOWN_TRUE" });
  const accessible = read(binding("a1111111-1111-4111-a111-111111111111", [...common,
    trueFact("accessibility.step_free_entrance"), trueFact("accessibility.wheelchair_paths"), trueFact("accessibility.accessible_seating"),
  ]));
  const barred = read(binding("b2222222-2222-4222-a222-222222222222", [...common,
    fact("accessibility.step_free_entrance", false, { resolution: "KNOWN_FALSE" }),
    trueFact("accessibility.wheelchair_paths"), trueFact("accessibility.accessible_seating"),
  ]));
  const unknown = read(binding("c3333333-3333-4333-a333-333333333333", [...common,
    trueFact("accessibility.step_free_entrance"), trueFact("accessibility.accessible_seating"),
  ], ["accessibility.wheelchair_paths"]));
  const worlds = [accessible, barred, unknown];
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "accessible-coffee", idempotencyKey: "accessible-coffee-key", naturalLanguage: "barrierefreier Ort für Kaffee", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
  const byId = new Map(result.evaluation.candidates.map((candidate) => [candidate.candidateId, candidate]));
  assert.ok(byId.get(accessible.spot.spotId).confirmedHardConstraints.includes("ACCESSIBILITY_BASIC"));
  assert.ok(byId.get(barred.spot.spotId).failedHardConstraints.includes("ACCESSIBILITY_BASIC"));
  assert.equal(byId.get(barred.spot.spotId).tier, "INELIGIBLE");
  assert.ok(byId.get(unknown.spot.spotId).unknownHardConstraints.includes("ACCESSIBILITY_BASIC"));
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

test("a qualitative cheap request does not certify an unpriced or medium-priced meal", () => {
  const base = [fact("purpose.primary_visit", "EAT_DRINK"), fact("classification.primary_category", "EAT"), fact("classification.place_types", ["RESTAURANT"])];
  const worlds = [
    read(binding("a1111111-1111-4111-a111-111111111111", [...base, fact("operation.price_level", "LOW")])),
    read(binding("b2222222-2222-4222-a222-222222222222", [...base, fact("operation.price_level", "MEDIUM")])),
    read(binding("c3333333-3333-4333-a333-333333333333", base, ["operation.price_level"])),
  ];
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "cheap-lunch-request", idempotencyKey: "cheap-lunch-key", naturalLanguage: "Günstig Mittag essen", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
  const [cheap, medium, unknownPrice] = result.evaluation.candidates;
  assert.equal(cheap.tier, "ELIGIBLE_CONFIRMED");
  assert.ok(cheap.reasons.some((row) => row.reasonCode === "price-level-fit" && row.confirmed));
  for (const candidate of [medium, unknownPrice]) {
    assert.equal(candidate.tier, "UNCONFIRMED_FALLBACK");
    assert.ok(candidate.limitations.includes("PRICE_LEVEL_EVIDENCE_NOT_LOW"));
    assert.ok(candidate.reasons.some((row) => row.reasonCode === "price-level-unconfirmed" && !row.confirmed));
  }
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

test("family requests rank places without an age declaration but respect verified universal access rules", () => {
  const base = [fact("purpose.primary_visit", "CULTURE_ARTS"), fact("classification.primary_category", "CULTURE_ARTS"), fact("classification.place_types", ["MUSEUM"])];
  const ageRule = (mode, minimumAge, accompaniment = "NONE") => fact("rule.age_access_conditions", {
    rules: [{ mode, minimumAge, accompaniment, appliesFromTime: null, days: [], area: null, event: null }], notes: null,
  });
  const worlds = [
    read(binding("11111111-1111-4111-a111-111111111111", base)),
    read(binding("22222222-2222-4222-a222-222222222222", [...base, ageRule("NO_MINIMUM", null)])),
    read(binding("33333333-3333-4333-a333-333333333333", [...base, ageRule("GENERAL_MINIMUM", 12)])),
    read(binding("44444444-4444-4444-a444-444444444444", [...base, ageRule("UNACCOMPANIED_MINIMUM", 12, "ADULT")])),
    read(binding("55555555-5555-4555-a555-555555555555", [...base, fact("rule.age_access_conditions", {
      rules: [{ mode: "GENERAL_MINIMUM", minimumAge: 12, accompaniment: "NONE", appliesFromTime: null, days: [], area: "VR exhibit", event: null }], notes: null,
    })])),
  ];
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "family-age-request", idempotencyKey: "family-age-key", naturalLanguage: "Museum mit meiner 4-jährigen Tochter in Basel", explicit: {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
  assert.equal(result.evaluation.interpretation.group.minimumAge, 4);
  assert.equal(result.evaluation.interpretation.group.adultPresent, true);
  assert.ok(!result.evaluation.interpretation.hardConstraints.includes("AGE_OR_LEGAL"));
  const [unspecified, allAges, restricted, accompanied, scoped] = result.evaluation.candidates;
  assert.equal(unspecified.tier, "UNCONFIRMED_FALLBACK");
  assert.ok(unspecified.limitations.includes("VISIT_SITUATION_EVIDENCE_UNKNOWN"));
  assert.ok(unspecified.reasons.some((row) => row.reasonCode === "visit-unconfirmed" && !row.confirmed));
  assert.ok(!unspecified.unknownHardConstraints.includes("AGE_OR_LEGAL"));
  assert.equal(allAges.tier, "UNCONFIRMED_FALLBACK", "age access alone does not prove a family experience");
  assert.ok(allAges.matchedSoftPreferences.includes("AGE_COMPATIBLE"));
  assert.equal(restricted.tier, "INELIGIBLE");
  assert.ok(restricted.failedHardConstraints.includes("AGE_OR_LEGAL"));
  assert.equal(accompanied.tier, "UNCONFIRMED_FALLBACK");
  assert.equal(scoped.tier, "UNCONFIRMED_FALLBACK", "an exhibit-only restriction cannot be applied to the entire museum");
  assert.ok(!scoped.matchedSoftPreferences.includes("AGE_COMPATIBLE"));
  const unspecifiedAge = { ...request, requestId: "family-unspecified-age", idempotencyKey: "family-unspecified-key", naturalLanguage: "Museum mit den Kindern in Basel" };
  const withoutAge = evaluateProductWorldViews(unspecifiedAge, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
  assert.equal(withoutAge.evaluation.interpretation.group.minimumAge, null);
  assert.ok(withoutAge.evaluation.candidates.every((candidate) => !candidate.unknownHardConstraints.includes("AGE_OR_LEGAL")));
});

test("rainy family outings admit museums and climbing gyms by verified type, never zoos or parks", () => {
  const venues = [
    ["11111111-1111-4111-a111-111111111111", "CULTURE_ARTS", "CULTURE_ARTS", "MUSEUM"],
    ["22222222-2222-4222-a222-222222222222", "SPORT_MOVEMENT", "SPORT_MOVEMENT", "CLIMBING_GYM"],
    ["33333333-3333-4333-a333-333333333333", "NATURE_ANIMAL_EXPERIENCE", "OUTDOOR_NATURE", "ZOO"],
    ["44444444-4444-4444-a444-444444444444", "NATURE_ANIMAL_EXPERIENCE", "OUTDOOR_NATURE", "PARK"],
  ];
  const worlds = venues.map(([id, purpose, category, type]) => read(binding(id, [
    fact("purpose.primary_visit", purpose), fact("classification.primary_category", category), fact("classification.place_types", [type]),
  ])));
  const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: "rain-family-request", idempotencyKey: "rain-family-key", naturalLanguage: "Ausflug mit meiner 4 jährigen Tochter bei Regen", explicit: { primaryIntent: "ACTIVITY_EXPERIENCE", hardConstraints: ["INDOOR_REQUIRED"], softPreferences: ["WK:context.visit_situations:FAMILY"] }, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
  const byId = new Map(result.evaluation.candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const [id] of venues.slice(0, 2)) {
    assert.equal(byId.get(id).tier, "UNCONFIRMED_FALLBACK", "indoor venue type alone does not confirm suitability for a child");
    assert.ok(byId.get(id).confirmedHardConstraints.includes("INDOOR_REQUIRED"));
    assert.ok(byId.get(id).reasons.some((row) => row.reasonCode === "visit-unconfirmed"));
  }
  for (const [id] of venues.slice(2)) {
    assert.equal(byId.get(id).tier, "INELIGIBLE");
    assert.ok(byId.get(id).failedHardConstraints.includes("INDOOR_REQUIRED"));
  }
});

test("scoped family evidence counts only when the request proves its age and accompaniment scope", () => {
  const base = [fact("purpose.primary_visit", "CULTURE_ARTS"), fact("classification.primary_category", "CULTURE_ARTS"), fact("classification.place_types", ["MUSEUM"])];
  const conditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: "MIXED_AGES", accompaniment: "ADULT", eventMode: null };
  const scoped = read(binding("a1111111-1111-4111-a111-111111111111", [...base, fact("context.visit_situations", [{ situation: "FAMILY", conditions }])]));
  const areaOnly = read(binding("b2222222-2222-4222-a222-222222222222", [...base, fact("context.visit_situations", [{ situation: "FAMILY", conditions: { ...conditions, area: "Kinderatelier" } }])]));
  const worlds = [scoped, areaOnly];
  const evaluate = (text, suffix) => {
    const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: `family-scope-${suffix}`, idempotencyKey: `family-scope-key-${suffix}`, naturalLanguage: text,
      explicit: { primaryIntent: "ACTIVITY_EXPERIENCE" }, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
    return evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort())).evaluation.candidates;
  };
  const withAdult = evaluate("Museum mit meiner 4-jährigen Tochter in Basel", "adult");
  assert.equal(withAdult[0].visitSituation.state, "CONFIRMED");
  assert.equal(withAdult[0].tier, "ELIGIBLE_CONFIRMED");
  assert.equal(withAdult[1].tier, "UNCONFIRMED_FALLBACK", "an area-only claim must not confirm the whole museum");
  const ageUnknown = evaluate("Familienausflug ins Museum in Basel", "unknown-age");
  assert.equal(ageUnknown[0].tier, "UNCONFIRMED_FALLBACK", "mixed-age scope is not proven without a child's age");
});

test("query requirements apply across family, cafe, craft-beer, date, alternatives and exclusions", () => {
  const conditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };
  const venues = [
    ["11111111-1111-4111-a111-111111111111", "Play room", "ACTIVITY_PLAY", "ACTIVITIES_PLAY", "ARCADE", [fact("context.visit_situations", [{ situation: "FAMILY", conditions }])]],
    ["22222222-2222-4222-a222-222222222222", "Generic gym", "SPORT_MOVEMENT", "SPORT_MOVEMENT", "GYM", []],
    ["33333333-3333-4333-a333-333333333333", "Family museum", "CULTURE_ARTS", "CULTURE_ARTS", "MUSEUM", [fact("context.visit_situations", [{ situation: "FAMILY", conditions }])]],
    ["44444444-4444-4444-a444-444444444444", "Cozy cafe", "EAT_DRINK", "COFFEE_DAYTIME", "CAFE", [fact("context.atmosphere", [{ atmosphere: "COZY", conditions }]), fact("offering.food_specialities", ["DESSERTS"])]],
    ["55555555-5555-4555-a555-555555555555", "Lively cafe", "EAT_DRINK", "COFFEE_DAYTIME", "CAFE", [fact("context.atmosphere", [{ atmosphere: "LIVELY", conditions }])]],
    ["66666666-6666-4666-a666-666666666666", "Craft taproom", "EAT_DRINK", "DRINKS", "TAPROOM", [fact("offering.groups", ["CRAFT_BEER"])]],
    ["77777777-7777-4777-a777-777777777777", "Ordinary bar", "EAT_DRINK", "DRINKS", "BAR", [fact("offering.groups", ["BEER"]), fact("context.visit_situations", [{ situation: "FRIENDS_GROUP", conditions }])]],
    ["88888888-8888-4888-a888-888888888888", "Date bar", "EAT_DRINK", "DRINKS", "BAR", [fact("context.visit_situations", [{ situation: "DATE_PAIR", conditions }])]],
    ["99999999-9999-4999-a999-999999999999", "Mixed restaurant bar", "EAT_DRINK", "EAT", "BAR", []],
    ["aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", "Cinema", "ENTERTAINMENT", "ENTERTAINMENT", "CINEMA", []],
  ];
  const worlds = venues.map(([id, _name, purpose, category, type, extras]) => read(binding(id, [
    fact("purpose.primary_visit", purpose), fact("classification.primary_category", category), fact("classification.place_types", [type]), ...extras,
  ])));
  const assessPlan = (text, intent, hardConstraints, softPreferences = []) => {
    const request = { contractVersion: "backyrd.decision-vnext.product-request@1.0", requestId: `query-${contentHash(text).slice(0, 12)}`, idempotencyKey: `idem-${contentHash(text).slice(0, 12)}`, naturalLanguage: text,
      explicit: { primaryIntent: intent, hardConstraints, softPreferences }, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
    const result = evaluateProductWorldViews(request, { authorizedCity: "Basel", serverTime: at }, { status: "NEUTRAL", projectionHash: contentHash("neutral") }, worlds, contentHash(worlds.map((world) => world.spot.spotId).sort()));
    return new Map(result.evaluation.candidates.map((candidate) => [candidate.candidateId, candidate]));
  };
  const tier = (rows, index) => rows.get(venues[index][0]).tier;
  const family = assessPlan("Ausflug mit meiner 4-jährigen Tochter bei Regen", "ACTIVITY_EXPERIENCE", ["INDOOR_REQUIRED", "WK_REQUIRED:G1:context.visit_situations:FAMILY"]);
  assert.equal(tier(family, 0), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(family, 2), "ELIGIBLE_CONFIRMED", "a family-confirmed museum remains available without a specific age declaration");
  assert.notEqual(tier(family, 1), "ELIGIBLE_CONFIRMED", "an indoor gym without family evidence must not be recommended");
  assert.ok(family.get(venues[1][0]).unknownHardConstraints.includes("QUERY_REQUIRED_G1"));
  const familyByExperience = assessPlan("Ausflug mit meiner 4-jährigen Tochter bei Regen", "ACTIVITY_EXPERIENCE", [
    "INDOOR_REQUIRED",
    "WK_REQUIRED:G1:classification.primary_category:ACTIVITIES_PLAY",
    "WK_REQUIRED:G1:classification.primary_category:CULTURE_ARTS",
    "WK_REQUIRED:G1:classification.primary_category:ENTERTAINMENT",
  ], ["WK:context.visit_situations:FAMILY"]);
  assert.equal(tier(familyByExperience, 0), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(familyByExperience, 2), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(familyByExperience, 1), "INELIGIBLE", "a generic gym must not enter a family outing just because it is indoors");
  const confirmedScope = familyByExperience.get(venues[2][0]).reasons.find((row) => row.reasonCode === "query-relevance");
  assert.match(confirmedScope.statementDe, /geprüften Kernmerkmale/);
  assert.doesNotMatch(confirmedScope.statementDe, /konkreten Wunsch/);

  const cozy = assessPlan("Gemütliches Café", "COFFEE", ["WK_REQUIRED:G1:context.atmosphere:COZY"]);
  assert.equal(tier(cozy, 3), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(cozy, 4), "INELIGIBLE");
  const cake = assessPlan("Kaffee und Kuchen", "COFFEE", ["WK_REQUIRED:G1:offering.food_specialities:DESSERTS"]);
  assert.equal(tier(cake, 3), "ELIGIBLE_CONFIRMED");
  assert.notEqual(tier(cake, 4), "ELIGIBLE_CONFIRMED");
  const craft = assessPlan("Craft Beer trinken", "DRINKS", ["WK_REQUIRED:G1:offering.groups:CRAFT_BEER"]);
  assert.equal(tier(craft, 5), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(craft, 6), "INELIGIBLE");
  const date = assessPlan("Date Night in einer Bar", "NIGHTLIFE", ["WK_REQUIRED:G1:context.visit_situations:DATE_PAIR"]);
  assert.equal(tier(date, 7), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(date, 6), "INELIGIBLE");
  const alternatives = assessPlan("Museum oder Kino", "ACTIVITY_EXPERIENCE", ["WK_REQUIRED:G1:classification.place_types:MUSEUM", "WK_REQUIRED:G1:classification.place_types:CINEMA"]);
  assert.equal(tier(alternatives, 2), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(alternatives, 9), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(alternatives, 1), "INELIGIBLE");
  const noRestaurant = assessPlan("Drinks, aber kein Restaurant", "DRINKS", ["WK_EXCLUDED:X:classification.primary_category:EAT"]);
  assert.equal(tier(noRestaurant, 5), "ELIGIBLE_CONFIRMED");
  assert.equal(tier(noRestaurant, 8), "INELIGIBLE");
  const merelyPreferred = assessPlan("Bar, gerne lebhaft", "DRINKS", [], ["WK:context.atmosphere:LIVELY"]);
  assert.equal(tier(merelyPreferred, 6), "ELIGIBLE_CONFIRMED", "optional attributes may not silently become eligibility requirements");
});
