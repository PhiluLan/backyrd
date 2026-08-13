import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentHash } from "../src/canonical-json.mjs";
import { requestForGoldenScenario } from "../src/d3-a-runner.mjs";

const baseline = JSON.parse(await readFile(new URL("../baselines/v13-d3-a-v1.json", import.meta.url), "utf8"));
const plan = JSON.parse(await readFile(new URL("../config/d3-a-v13-baseline-v1.plan.json", import.meta.url), "utf8"));

test("D3-A baseline package is complete and frozen to D2.1/D2.2/V13", () => {
  assert.equal(baseline.sampleSizes.goldenDecisions, 126);
  assert.equal(baseline.sampleSizes.worlds, 3);
  assert.ok(baseline.sampleSizes.counterfactualPairs > 0);
  assert.ok(baseline.sampleSizes.personalizationTreatments > 0);
  assert.ok(baseline.sampleSizes.remixPairs > 0);
  assert.ok(baseline.sampleSizes.explanationCandidates > 0);
  assert.equal(baseline.identity.engineSourceHash, plan.engineSourceHash);
  assert.equal(baseline.identity.parentFreezeManifestHash, plan.parentFreezeManifestHash);
  assert.equal(baseline.identity.personalizationTreatmentFreezeHash, plan.personalizationTreatmentFreezeHash);
  assert.deepEqual(Object.keys(baseline.metrics.splits).sort(), ["DEVELOPMENT", "LOCKED_HOLDOUT", "REGRESSION"]);
  assert.equal(baseline.validity.productionAccess, "NONE");
});

test("D3-A result hash seals the baseline body", () => {
  const body = structuredClone(baseline);
  delete body.resultHash;
  delete body.runPlanHash;
  assert.equal(contentHash(body), baseline.resultHash);
});

test("Golden request adapter preserves declared hard constraints", () => {
  const scenario = { family: "negation", request: { city: "Synthetic Basel" }, hardConstraints: { category: null, exclusions: ["bar"] }, context: { audience: "solo", timeBucket: "evening", weekday: 5 }, softPreferences: { moods: { quiet: 1, lively: 0 } } };
  const request = requestForGoldenScenario(scenario);
  assert.deepEqual(request.excludedPlaceTypes, ["bar"]);
  assert.equal(request.city, "Synthetic Basel");
  assert.equal(request.limit, 10);
});
