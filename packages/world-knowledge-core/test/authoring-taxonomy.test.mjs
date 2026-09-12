import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORING_TAXONOMY_HASH,
  AUTHORING_TAXONOMY_VERSION,
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
  for (const category of PRIMARY_CATEGORIES) {
    assert.ok(CATEGORY_AUTHORING_MATRIX[category].relevantSteps.includes("classification"));
    assert.ok(CATEGORY_AUTHORING_MATRIX[category].relevantSteps.includes("review"));
  }
});

test("place types update by category and existing incompatible values remain explicit conflicts", () => {
  assert.ok(getCategoryPlaceTypes("EAT").some((entry) => entry.value === "RESTAURANT"));
  assert.ok(getCategoryPlaceTypes("EAT").some((entry) => entry.value === "PUB"));
  assert.ok(!getCategoryPlaceTypes("ACTIVITIES_PLAY").some((entry) => entry.value === "RESTAURANT"));
  assert.ok(getCategoryPlaceTypes("ACTIVITIES_PLAY").some((entry) => entry.value === "ESCAPE_ROOM" && entry.state === "NOT_CONFIGURED"));
  assert.deepEqual(assessPlaceTypeCompatibility("ACTIVITIES_PLAY", ["RESTAURANT"]), { compatible: [], incompatible: ["RESTAURANT"], state: "CONFLICT" });
  assert.ok(getCategoryPlaceTypes("OTHER").some((entry) => entry.value === "OTHER_PLACE" && entry.state === "NOT_CONFIGURED"));
  assert.equal(assessPlaceTypeCompatibility("OTHER", ["OTHER_PLACE"]).state, "NOT_CONFIGURED");
  assert.equal(assessPlaceTypeCompatibility("OTHER", ["PUB"]).state, "CONFLICT");
});

test("audited wider taxonomy is grouped but cannot bypass Registry 1.1", () => {
  assert.ok(PLACE_TYPE_AUTHORING_OPTIONS.length > 50);
  assert.ok(CUISINE_AUTHORING_OPTIONS.length > 25);
  assert.ok(FOOD_SPECIALITY_AUTHORING_OPTIONS.length > 20);
  assert.ok(OFFERING_AUTHORING_OPTIONS.some((entry) => entry.group === "Mahlzeiten"));
  assert.equal(validateAuthoringSubmission("classification.place_types", "KNOWN_VALUE", ["ESCAPE_ROOM"]).ok, false);
  assert.equal(validateAuthoringSubmission("offering.cuisines", "KNOWN_VALUE", ["THAI"]).ok, false);
  assert.equal(validateAuthoringSubmission("offering.food_specialities", "KNOWN_VALUE", ["BURGER"]).ok, true);
});

test("gastronomic sections do not appear as required for non-gastronomic categories", () => {
  assert.equal(getAuthoringFieldsForContext("offering", "ACTIVITIES_PLAY").length, 0);
  assert.ok(getAuthoringFieldsForContext("offering", "EAT").length > 0);
  assert.ok(getAuthoringFieldsForContext("activities", "CULTURE_ARTS").length === 0);
});
