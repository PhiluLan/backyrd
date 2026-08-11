import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateWorld } from "../src/generator.mjs";
import { latentUtility } from "../src/utility.mjs";
import { scenarioLibrary, counterfactualPairs } from "../src/scenarios.mjs";

const config = JSON.parse(await readFile(new URL("../config/smoke-v1.json", import.meta.url), "utf8"));
const world = generateWorld(config, {});

test("latent utility exposes components and hard constraints without engine scores", () => {
  const value = latentUtility(world.users[0], world.spots[0], world.contexts[0]);
  assert.equal("combined_score" in value, false);
  assert.equal("semantic_similarity" in value, false);
  assert.equal(value.constraints.productEligible, false);
  assert.equal(value.utility, 0);
});

test("observed data is noisy and incomplete rather than latent truth copy", () => {
  assert.ok(world.spots.some((spot) => spot.observed.description === null));
  assert.ok(world.spots.some((spot) => Object.values(spot.latent.mood).filter((value) => value > 0.58).length > spot.observed.moods.length));
  assert.ok(world.interactions.some((event) => event.exposed && event.type === "decision_impression"));
  assert.ok(world.interactions.some((event) => !event.exposed));
});

test("counterfactual pairs alter only the declared request dimension", () => {
  const scenarios = scenarioLibrary(world);
  for (const pair of counterfactualPairs(scenarios)) {
    assert.notDeepEqual(pair.base.request, pair.counterfactual.request);
    assert.equal(pair.base.userId, pair.counterfactual.userId);
    assert.equal(pair.base.request.city, pair.counterfactual.request.city);
  }
});
