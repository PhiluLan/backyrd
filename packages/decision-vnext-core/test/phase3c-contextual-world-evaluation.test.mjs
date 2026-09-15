import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY,
  PHASE3C_LAB_VERSIONS,
  runFounderDecisionLab,
} from "../dist/index.js";
import { makeFounderCohortHandoff } from "../../../scripts/decision/phase3c-founder-cohort-fixture.mjs";

const SPOT = { spotId: "00000000-0000-4000-8000-000000000301", name: "Neutraler Testspot" };
const request = (text, id = "contextual-world-test") => ({
  contractVersion: PHASE3C_LAB_VERSIONS.request,
  requestId: id,
  ephemeralText: text,
  deviceLocation: { state: "AVAILABLE", city: "Basel" },
  userMode: "NEUTRAL_MISSING",
  alternativeRequested: false,
  rejectedCandidateIds: [],
});
const conditions = (overrides = {}) => ({ accompaniment: null, ageContext: null, area: null, dayparts: [], days: [], eventMode: null, groupSize: null, occasion: null, ...overrides });
const typicalConditions = (overrides = {}) => ({ accompaniment: null, ageContext: null, area: null, days: [], eventMode: null, groupSize: null, occasion: null, ...overrides });
const run = async (text, context, worldFacts = [], id) => (await runFounderDecisionLab({
  request: request(text, id),
  cohortHandoff: makeFounderCohortHandoff([SPOT], { [SPOT.spotId]: context }, { [SPOT.spotId]: worldFacts }),
})).candidates[0];

test("evaluation-only policy is generic, versioned, non-production, and contains no spot identity shortcut", () => {
  assert.equal(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.productionAuthorized, false);
  assert.equal(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.productRankingAuthorized, false);
  assert.equal(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.confirmedTierRequiresCoreIntentCoverage, "CONFIRMED");
  const serialized = JSON.stringify(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY);
  for (const forbidden of ["Volta Bräu", "ELYS", "Tierpark", "Consum", "Café Frühling", "1101ee26-5046-4cdc-921a-5a3bd4cb5306"]) assert.equal(serialized.includes(forbidden), false);
});

test("primary purpose gates core intent while embedded onsite offering remains additional only", async () => {
  const primary = await run("Ich möchte in Basel Kaffee trinken.", {
    "purpose.primary_visit": "EAT_DRINK",
    "offering.onsite": [{ area: null, kind: "CAFE", relationship: "PART_OF_SPOT" }],
  });
  assert.equal(primary.coreIntentCoverage.state, "CONFIRMED");
  assert.equal(primary.onsiteOfferings.state, "CONFIRMED");
  assert.equal(primary.onsiteOfferings.confirmsCoreIntent, false);
  assert.equal(primary.tier, "ELIGIBLE_CONFIRMED");

  const embedded = await run("Ich möchte in Basel Kaffee trinken.", {
    "purpose.primary_visit": "SPORT_MOVEMENT",
    "offering.onsite": [{ area: "Bistro", kind: "CAFE", relationship: "EMBEDDED_FACILITY" }],
  });
  assert.equal(embedded.coreIntentCoverage.state, "INCOMPATIBLE");
  assert.deepEqual(embedded.onsiteOfferings.relationships, ["EMBEDDED_FACILITY"]);
  assert.equal(embedded.tier, "INELIGIBLE");

  const kiosk = await run("Ich suche in Basel ein Restaurant für ein erstes Date.", {
    "purpose.primary_visit": "NATURE_ANIMAL_EXPERIENCE",
    "offering.onsite": [{ area: "Eingang", kind: "KIOSK", relationship: "EMBEDDED_FACILITY" }],
    "context.visit_situations": [{ situation: "DATE_PAIR", conditions: conditions() }],
  });
  assert.equal(kiosk.coreIntentCoverage.state, "INCOMPATIBLE");
  assert.equal(kiosk.onsiteOfferings.state, "INCOMPATIBLE");
  assert.equal(kiosk.visitSituation.state, "CONFIRMED");
  assert.equal(kiosk.tier, "INELIGIBLE");
});

test("family outing and bouldering use authorized primary-purpose mappings without conflating visit situation", async () => {
  const family = await run("Ich suche in Basel einen Familienausflug mit meiner Familie.", {
    "purpose.primary_visit": "NATURE_ANIMAL_EXPERIENCE",
    "context.visit_situations": [{ situation: "FAMILY", conditions: conditions() }],
  });
  assert.equal(family.coreIntentCoverage.state, "CONFIRMED");
  assert.equal(family.visitSituation.state, "CONFIRMED");

  const familyAfternoon = await run("Ich suche heute Nachmittag in Basel einen Familienausflug für mich und meine zwölfjährige Tochter.", {
    "purpose.primary_visit": "NATURE_ANIMAL_EXPERIENCE",
    "context.visit_situations": [{ situation: "FAMILY", conditions: conditions({ accompaniment: "ADULT", ageContext: "MIXED_AGES", dayparts: ["AFTERNOON"] }) }],
    "context.typical_dayparts": [{ daypart: "AFTERNOON", conditions: typicalConditions() }],
  });
  assert.equal(familyAfternoon.coreIntentCoverage.state, "CONFIRMED");
  assert.equal(familyAfternoon.visitSituation.state, "CONFIRMED");
  assert.equal(familyAfternoon.typicalDaypart.state, "CONFIRMED");

  const bouldering = await run("Ich möchte in Basel mit meiner Familie bouldern.", {
    "purpose.primary_visit": "SPORT_MOVEMENT",
    "context.visit_situations": [{ situation: "FAMILY", conditions: conditions() }],
  });
  assert.equal(bouldering.coreIntentCoverage.state, "CONFIRMED");
  assert.equal(bouldering.visitSituation.state, "CONFIRMED");
  assert.equal(bouldering.tier, "ELIGIBLE_CONFIRMED");

  const business = await run("Ich möchte heute Abend in Basel geschäftlich etwas trinken.", {
    "purpose.primary_visit": "EAT_DRINK",
    "context.visit_situations": [{ situation: "BUSINESS", conditions: conditions() }],
  });
  assert.equal(business.visitSituation.state, "CONFIRMED");
});

test("conditional visit situation, atmosphere, and daypart preserve confirmed, unknown, incompatible, and disputed states", async () => {
  const confirmed = await run("Ich möchte heute Abend in Basel lebhaft etwas trinken, mit Freunden.", {
    "purpose.primary_visit": "EAT_DRINK",
    "context.visit_situations": [{ situation: "FRIENDS_GROUP", conditions: conditions({ dayparts: ["EVENING"] }) }],
    "context.atmosphere": [{ atmosphere: "LIVELY", conditions: conditions({ accompaniment: "GROUP" }) }],
    "context.typical_dayparts": [{ daypart: "EVENING", conditions: typicalConditions({ days: ["WEDNESDAY"], eventMode: "NORMAL_OPERATION" }) }],
  });
  assert.equal(confirmed.visitSituation.state, "CONFIRMED");
  assert.equal(confirmed.atmosphere.state, "CONFIRMED");
  assert.equal(confirmed.typicalDaypart.state, "CONFIRMED");
  assert.equal(confirmed.tier, "ELIGIBLE_CONFIRMED");

  const incompatible = await run("Ich möchte heute Abend in Basel ruhig etwas trinken, allein.", {
    "purpose.primary_visit": "EAT_DRINK",
    "context.visit_situations": [{ situation: "FRIENDS_GROUP", conditions: conditions() }],
    "context.atmosphere": [{ atmosphere: "LIVELY", conditions: conditions() }],
    "context.typical_dayparts": [{ daypart: "MORNING", conditions: typicalConditions() }],
  });
  assert.equal(incompatible.visitSituation.state, "INCOMPATIBLE");
  assert.equal(incompatible.atmosphere.state, "INCOMPATIBLE");
  assert.equal(incompatible.typicalDaypart.state, "INCOMPATIBLE");
  assert.equal(incompatible.tier, "ELIGIBLE_CONFIRMED", "soft contextual mismatch never excludes an otherwise confirmed spot");

  const disputed = await run("Ich möchte heute Abend in Basel ruhig etwas trinken.", {
    "purpose.primary_visit": "EAT_DRINK",
    "context.atmosphere": { disputed: true },
  });
  assert.equal(disputed.atmosphere.state, "DISPUTED");
  assert.ok(disputed.limitations.includes("contextual-world-claim-disputed"));

  const disputedPurpose = await run("Ich möchte in Basel etwas trinken.", { "purpose.primary_visit": { disputed: true } });
  assert.equal(disputedPurpose.coreIntentCoverage.state, "DISPUTED");
  assert.equal(disputedPurpose.tier, "UNCONFIRMED_FALLBACK");
});

test("typical daypart never substitutes for actual opening hours", async () => {
  const closed = await run("Ich möchte heute Abend in Basel jetzt geöffnet essen.", {
    "purpose.primary_visit": "EAT_DRINK",
    "context.typical_dayparts": [{ daypart: "EVENING", conditions: typicalConditions() }],
  }, [
    { key: "location.timezone", value: "Europe/Zurich", resolution: "KNOWN_VALUE" },
    { key: "hours.regular", value: [{ day: "WEDNESDAY", intervals: [{ start: "10:00", end: "12:00" }] }], resolution: "KNOWN_VALUE" },
  ]);
  assert.equal(closed.typicalDaypart.state, "CONFIRMED");
  assert.equal(closed.actualAvailability.status, "closed");
  assert.ok(closed.failedHardConstraints.includes("OPENING_CURRENT"));
  assert.equal(closed.tier, "INELIGIBLE");
});

test("unknown and not-configured contextual knowledge stay distinct and do not invent Product authority", async () => {
  const unknown = await run("Ich möchte in Basel gemütlich Kaffee trinken.", { "purpose.primary_visit": { unknown: true }, "context.atmosphere": { unknown: true } });
  assert.equal(unknown.coreIntentCoverage.state, "UNKNOWN");
  assert.equal(unknown.atmosphere.state, "UNKNOWN");
  assert.equal(unknown.tier, "UNCONFIRMED_FALLBACK");

  const notConfigured = await run("Ich möchte in Basel etwas Unbekanntes tun.", { "purpose.primary_visit": "EAT_DRINK" });
  assert.equal(notConfigured.coreIntentCoverage.state, "NOT_APPLICABLE");
  assert.equal(notConfigured.tier, "NOT_CONFIGURED");
});

test("one-spot cohort is technically evaluable without claiming a meaningful comparison", async () => {
  const result = await runFounderDecisionLab({
    request: request("Ich möchte in Basel etwas trinken.", "one-spot-contextual-evaluation"),
    cohortHandoff: makeFounderCohortHandoff([SPOT], { [SPOT.spotId]: { "purpose.primary_visit": "EAT_DRINK" } }),
  });
  assert.equal(result.worldCohort.spotBindings.length, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.productRankingAuthorized, false);
  assert.equal(result.candidates[0].tier, "ELIGIBLE_CONFIRMED");
});

test("NEARBY is rejected by the canonical World handoff instead of becoming an onsite relation", () => {
  assert.throws(() => makeFounderCohortHandoff([SPOT], {
    [SPOT.spotId]: { "offering.onsite": [{ area: null, kind: "CAFE", relationship: "NEARBY" }] },
  }), /relationship|expected one of/);
});
