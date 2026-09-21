import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORING_TAXONOMY_HASH,
  AUTHORING_TAXONOMY_VERSION,
  AUTHORING_GUIDANCE_HASH,
  AUTHORING_GUIDANCE_VERSION,
  CATEGORY_AUTHORING_MATRIX,
  CUISINE_AUTHORING_OPTIONS,
  FOOD_SPECIALITY_AUTHORING_OPTIONS,
  OFFERING_AUTHORING_OPTIONS,
  PLACE_TYPE_AUTHORING_OPTIONS,
  PRIMARY_CATEGORIES,
  assessPlaceTypeCompatibility,
  getAuthoringFieldsForContext,
  getCategoryPlaceTypes,
  validateAuthoringSubmission,
} from "../dist/index.js";

test("all 16 primary categories have a versioned category/place-type/section contract", () => {
  assert.equal(Object.keys(CATEGORY_AUTHORING_MATRIX).length, 16);
  assert.deepEqual(Object.keys(CATEGORY_AUTHORING_MATRIX).sort(), [...PRIMARY_CATEGORIES].sort());
  assert.match(AUTHORING_TAXONOMY_VERSION, /@4a\.2$/);
  assert.match(AUTHORING_TAXONOMY_HASH, /^[a-f0-9]{64}$/);
  assert.match(AUTHORING_GUIDANCE_VERSION, /@1\.0$/);
  assert.match(AUTHORING_GUIDANCE_HASH, /^[a-f0-9]{64}$/);
  for (const category of PRIMARY_CATEGORIES) {
    assert.ok(CATEGORY_AUTHORING_MATRIX[category].relevantSteps.includes("classification"));
    assert.ok(CATEGORY_AUTHORING_MATRIX[category].relevantSteps.includes("review"));
  }
});

test("place types update by category and existing incompatible values remain explicit conflicts", () => {
  assert.ok(getCategoryPlaceTypes("EAT").some((entry) => entry.value === "RESTAURANT"));
  assert.ok(getCategoryPlaceTypes("EAT").some((entry) => entry.value === "PUB"));
  assert.ok(!getCategoryPlaceTypes("ACTIVITIES_PLAY").some((entry) => entry.value === "RESTAURANT"));
  assert.ok(getCategoryPlaceTypes("ACTIVITIES_PLAY").some((entry) => entry.value === "ESCAPE_ROOM" && entry.state === "CANONICAL"));
  assert.deepEqual(assessPlaceTypeCompatibility("ACTIVITIES_PLAY", ["RESTAURANT"]), { compatible: [], incompatible: ["RESTAURANT"], state: "CONFLICT" });
  assert.ok(getCategoryPlaceTypes("OTHER").some((entry) => entry.value === "OTHER_PLACE" && entry.state === "CANONICAL"));
  assert.equal(assessPlaceTypeCompatibility("OTHER", ["OTHER_PLACE"]).state, "COMPATIBLE");
  assert.equal(assessPlaceTypeCompatibility("OTHER", ["PUB"]).state, "CONFLICT");
});

test("audited wider taxonomy is grouped and bound to the new registry release", () => {
  assert.ok(PLACE_TYPE_AUTHORING_OPTIONS.length > 50);
  assert.ok(CUISINE_AUTHORING_OPTIONS.length > 25);
  assert.ok(FOOD_SPECIALITY_AUTHORING_OPTIONS.length > 20);
  assert.ok(OFFERING_AUTHORING_OPTIONS.some((entry) => entry.group === "Mahlzeiten"));
  assert.equal(validateAuthoringSubmission("classification.place_types", "KNOWN_VALUE", ["ESCAPE_ROOM"]).ok, true);
  assert.equal(validateAuthoringSubmission("offering.cuisines", "KNOWN_VALUE", ["THAI"]).ok, true);
  assert.equal(validateAuthoringSubmission("offering.food_specialities", "KNOWN_VALUE", ["BURGER"]).ok, true);
});

test("gastronomic sections do not appear as required for non-gastronomic categories", () => {
  assert.equal(getAuthoringFieldsForContext("offering", "ACTIVITIES_PLAY").length, 0);
  assert.ok(getAuthoringFieldsForContext("offering", "EAT").length > 0);
  assert.equal(getAuthoringFieldsForContext("activities", "CULTURE_ARTS").length, 0);
});

test("Bäckerei und Café erhalten passende Angebotsfragen ohne Restaurant-Küchenzwang", () => {
  const bakeryCafe = { placeTypes: ["BAKERY", "CAFE"] };
  const offeringKeys = getAuthoringFieldsForContext("offering", "COFFEE_DAYTIME", bakeryCafe).map((field) => field.attributeKey);
  const hourKeys = getAuthoringFieldsForContext("hours", "COFFEE_DAYTIME", bakeryCafe).map((field) => field.attributeKey);
  const objectiveKeys = getAuthoringFieldsForContext("objective", "COFFEE_DAYTIME", bakeryCafe).map((field) => field.attributeKey);
  assert.ok(!offeringKeys.includes("offering.cuisines"));
  assert.ok(offeringKeys.includes("offering.food_specialities"));
  assert.ok(offeringKeys.includes("offering.groups"));
  assert.ok(!hourKeys.includes("hours.kitchen"));
  assert.ok(objectiveKeys.includes("capacity.seats_indoor"));
});

test("Zoo ist in Draußen und Natur auswählbar und erhält keine Gastronomie-Sitzplatzfragen", () => {
  assert.ok(getCategoryPlaceTypes("OUTDOOR_NATURE").some((entry) => entry.value === "ZOO"));
  assert.equal(assessPlaceTypeCompatibility("OUTDOOR_NATURE", ["ZOO"]).state, "COMPATIBLE");
  const zoo = { placeTypes: ["ZOO"] };
  assert.equal(getAuthoringFieldsForContext("offering", "OUTDOOR_NATURE", zoo).length, 0);
  const objectiveKeys = getAuthoringFieldsForContext("objective", "OUTDOOR_NATURE", zoo).map((field) => field.attributeKey);
  assert.ok(!objectiveKeys.includes("capacity.seats_indoor"));
  assert.ok(!objectiveKeys.includes("capacity.seats_outdoor"));
  assert.ok(!objectiveKeys.includes("capacity.seats_total"));
  assert.ok(objectiveKeys.includes("capacity.group_size_supported"));
});

test("Restaurant behält Küchen-, Küchenzeiten- und Sitzplatzfragen", () => {
  const restaurant = { placeTypes: ["RESTAURANT"] };
  assert.ok(getAuthoringFieldsForContext("offering", "EAT", restaurant).some((field) => field.attributeKey === "offering.cuisines"));
  assert.ok(getAuthoringFieldsForContext("hours", "EAT", restaurant).some((field) => field.attributeKey === "hours.kitchen"));
  assert.ok(getAuthoringFieldsForContext("objective", "EAT", restaurant).some((field) => field.attributeKey === "capacity.seats_indoor"));
});

test("weitere Referenztypen erhalten keine fachfremden Gastronomiefragen", () => {
  const references = [
    ["CULTURE_ARTS", "MUSEUM"],
    ["SPORT_MOVEMENT", "CLIMBING_GYM"],
    ["STAY", "HOTEL"],
    ["OUTDOOR_NATURE", "PARK"],
    ["SHOPPING_MARKETS", "MARKET"],
  ];
  for (const [category, placeType] of references) {
    const context = { placeTypes: [placeType] };
    assert.ok(!getAuthoringFieldsForContext("offering", category, context).some((field) => field.attributeKey === "offering.cuisines"), `${placeType} must not imply cuisine`);
    assert.ok(!getAuthoringFieldsForContext("hours", category, context).some((field) => field.attributeKey === "hours.kitchen"), `${placeType} must not imply kitchen hours`);
    assert.ok(!getAuthoringFieldsForContext("objective", category, context).some((field) => field.attributeKey === "capacity.seats_indoor"), `${placeType} must not imply gastronomy seating`);
  }
  assert.ok(getAuthoringFieldsForContext("objective", "SPORT_MOVEMENT", { placeTypes: ["CLIMBING_GYM"] }).some((field) => field.attributeKey === "rule.reservation"));
});
