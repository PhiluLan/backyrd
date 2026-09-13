import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_CONTEXT, PHILIPPS_CASA_CLAIMS, SYNTHETIC_WORLDS, buildWorldKnowledgeSnapshot, resolveWorldKnowledge, resolutionRequest, snapshotInput,
} from "../dist/index.js";

test("all required synthetic worlds are present and resolve without production access", () => {
  assert.deepEqual(Object.keys(SYNTHETIC_WORLDS).sort(), ["conflicting", "expiredState", "inconsistentCapacity", "minimal", "partialAccessibility", "philippsCasa", "specialHours", "unknown", "venueKitchenHours"]);
  for (const world of Object.values(SYNTHETIC_WORLDS)) assert.doesNotThrow(() => resolveWorldKnowledge(resolutionRequest(world.claims)));
});

test("Philipps Casa proves the Founder and trust boundaries", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution, COMMERCIAL_CONTEXT));
  assert.equal(snapshot.spot.classification.primaryCategory, "EAT"); assert.deepEqual(snapshot.spot.classification.placeTypes, ["PUB"]);
  assert.deepEqual(resolution.resolved.find((item) => item.attributeKey === "offering.food_specialities").value, ["BURGER", "PIZZA"]); assert.equal(resolution.resolved.some((item) => item.attributeKey === "offering.cuisines"), false);
  assert.equal(resolution.resolved.find((item) => item.attributeKey === "operation.service_format").value, "CASUAL_DINING"); assert.ok(!resolution.resolved.find((item) => item.attributeKey === "offering.groups").value.includes("CASUAL_DINING"));
  assert.ok(resolution.resolved.every((item) => item.trust === "ASSERTED" || item.resolution === "DISPUTED")); assert.equal(snapshot.operationalRules.some((item) => item.key === "hours.regular"), true); assert.equal(snapshot.currentStates.length, 0);
  assert.equal(snapshot.facts.some((item) => item.key === "research.subjective_fits"), false); assert.equal(snapshot.explicitUnknowns.some((item) => item.key === "operation.takeaway"), true);
  assert.equal(snapshot.readiness.find((item) => item.useCase === "INTENT_MATCHING").state, "NOT_READY"); assert.ok(snapshot.conflicts.some((item) => item.code === "UNUSUAL_CATEGORY_PLACE_TYPE_COMBINATION"));
  assert.equal("secondaryCategories" in snapshot.spot.classification, false); assert.equal("confidence" in snapshot, false); assert.equal("readinessPercentage" in snapshot, false);
});

test("Philipps Casa resolution and snapshot identities are golden SHA-256 values", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution));
  assert.equal(resolution.resultHash, "f31fa30f876cce5fd2e16f1af616b194774764d5912d8f4dbfb6d463fe4e32a4"); assert.equal(snapshot.snapshotHash, "318476122cc60f1e6b0534d07c6efd6e319b7755c40457fd2069eda8d663faef");
});

test("unknown spot stays empty and minimal spot never fabricates false", () => {
  for (const name of ["unknown", "minimal"]) {
    const world = SYNTHETIC_WORLDS[name]; const resolution = resolveWorldKnowledge(resolutionRequest(world.claims)); const snapshot = buildWorldKnowledgeSnapshot(snapshotInput(world.spotId, resolution));
    assert.equal(snapshot.facts.some((item) => item.resolution === "KNOWN_FALSE"), false); assert.equal(snapshot.explicitUnknowns.length, 0);
  }
});
