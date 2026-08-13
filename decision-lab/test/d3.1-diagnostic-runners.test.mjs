import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateWorld } from "../src/generator.mjs";
import { buildPersonalizationTreatment } from "../src/personalization-treatment.mjs";
import { CANONICAL_EXECUTION_PATH, coverageReport, evaluateExplanationAlignment, runCounterfactualEvaluation, runExplanationAlignment, runPersonalizationTreatmentComparison, runRemixEvaluation } from "../src/d3.1-diagnostic-runners.mjs";
import { createTreatmentMaterializer } from "../src/d3.1-canonical-adapters.mjs";
import { contentHash } from "../src/canonical-json.mjs";

const engineSourceHash = "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba";
const config = JSON.parse(await readFile(new URL("../config/smoke-v1.json", import.meta.url), "utf8"));
const coverageContract = JSON.parse(await readFile(new URL("../config/d3.1-diagnostic-coverage-v1.json", import.meta.url), "utf8"));
const world = generateWorld(config, { engineSourceHash });
const eligible = world.spots.filter((spot) => spot.observed.status === "approved" && !["quarantined", "excluded"].includes(spot.observed.distribution));

function fakeExecutor(input) {
  const exclude = new Set(input.request.excludeSpotIds ?? []);
  const offset = contentHash({ query: input.request.query, audience: input.request.audience, userId: input.userId }).charCodeAt(0) % eligible.length;
  const rows = [...eligible.slice(offset), ...eligible.slice(0, offset)].filter((spot) => !exclude.has(spot.id)).slice(0, input.request.limit ?? 10);
  const candidates = rows.map((spot, index) => ({ spot_id: spot.id, rank: index + 1, place_type: spot.category, category_name: spot.category, human_reason: `${spot.observed.name} passt zur Suche nach ${input.request.query}.`, explanation: { personalized_component: input.diagnostic?.treatmentArm === "ACTUAL" ? .2 : input.diagnostic?.treatmentArm === "OPPOSING" ? .1 : 0, semantic_component: .3 - index * .01, source_bonus: .04, intent_boost: .08, category_fit_component: .05, category_mismatch_penalty: 0, place_type_boost: 0, contextual_taste_component: 0, recent_memory_component: 0, v12_only_penalty: 0, weak_intent_penalty: 0 }, explanationEvidence: { claimedFactors: ["intent_boost", "category_fit_component"], supportedFactors: ["intent_boost", "category_fit_component"] } }));
  const traceBody = { v12CandidateIds: rows.slice(0, 6).map((spot) => spot.id), semanticCandidateIds: rows.map((spot) => spot.id), fallbackUsed: false };
  return { executionPath: CANONICAL_EXECUTION_PATH, engineSourceHash, authenticated: true, candidates, hardGates: { pass: true }, trace: { ...traceBody, traceHash: contentHash(traceBody) } };
}

const utilityMap = () => Object.fromEntries(eligible.map((spot, index) => [spot.id, 1 - index / eligible.length]));

test("counterfactual runner executes both sides with single-variable proof and canonical V13 identity", async () => {
  const user = world.users[0];
  const pairs = Array.from({ length: 5 }, (_, index) => ({ id: `pair-${index}`, dimension: "audience", changedPath: "$.request.audience", worldId: world.manifest.worldId, seed: world.manifest.seed, base: { id: `base-${index}`, name: "base", userId: user.id, request: { city: "Synthetic Basel", query: "cozy", audience: ["date"], limit: 10 } }, counterfactual: { id: `changed-${index}`, name: "changed", userId: user.id, request: { city: "Synthetic Basel", query: "cozy", audience: ["friends"], limit: 10 } } }));
  const result = await runCounterfactualEvaluation({ pairs, executor: fakeExecutor, engineSourceHash, utilityFor: utilityMap });
  assert.equal(result.executableMeasurements, 5);
  assert.ok(result.measurements.every((row) => row.changedPaths.every((path) => path.startsWith("$.request.audience"))));
  const bad = structuredClone(pairs[0]); bad.counterfactual.request.city = "Other";
  await assert.rejects(() => runCounterfactualEvaluation({ pairs: [bad], executor: fakeExecutor, engineSourceHash, utilityFor: utilityMap }), /isolation failed/);
});

test("personalization runner consumes frozen ACTUAL NEUTRAL OPPOSING plans without anonymous or weight control", async () => {
  const maturities = ["cold", "onboarding", "sparse", "developing", "mature", "power"];
  const bundles = maturities.map((maturity) => buildPersonalizationTreatment(world, { userId: world.users.find((user) => user.maturity === maturity).id, currentRequest: { city: "Synthetic Basel", query: "cozy", audience: ["date"], limit: 10 }, currentContext: { audience: "date", timeBucket: "evening" } }));
  const materialize = async (plan) => ({ stateRef: plan.user.id, rawDerivedConsistent: true, directDerivedWrites: false });
  const result = await runPersonalizationTreatmentComparison({ bundles, materialize, executor: fakeExecutor, engineSourceHash, utilityFor: utilityMap });
  assert.equal(result.executableMeasurements, 6);
  assert.ok(result.measurements.every((row) => Object.keys(row.candidateIds).join(",") === "ACTUAL,NEUTRAL,OPPOSING"));
});

test("treatment materializer preserves canonical calls and rejects inconsistent projections", async () => {
  const calls = [];
  const materialize = createTreatmentMaterializer({ invokeCanonical: async (userId, call) => calls.push([userId, call.rpc]), insertHistoricalEvent: async (userId, call, day) => calls.push([userId, call.rpc, day]), snapshotState: async (userId) => ({ stateRef: userId, rawDerivedConsistent: true }) });
  const bundle = buildPersonalizationTreatment(world, { userId: world.users.find((user) => user.maturity === "mature").id, currentRequest: {}, currentContext: {} });
  const state = await materialize(bundle.enginePlans.ACTUAL);
  assert.equal(state.rawDerivedConsistent, true);
  assert.ok(calls.length > 0);
  const broken = createTreatmentMaterializer({ invokeCanonical: async () => {}, insertHistoricalEvent: async () => {}, snapshotState: async () => ({ stateRef: "x", rawDerivedConsistent: false }) });
  await assert.rejects(() => broken(bundle.enginePlans.ACTUAL), /inconsistency/);
});

test("remix runner uses initial shown IDs as canonical exclusions and measures starvation", async () => {
  const user = world.users[0];
  const cases = ["normal", "sparse_pool", "mature", "cold_sparse", "many_alternatives", "few_alternatives"].map((family) => ({ id: family, family, userId: user.id, request: { city: "Synthetic Basel", query: family, limit: 10 }, context: {} }));
  const result = await runRemixEvaluation({ cases, executor: fakeExecutor, engineSourceHash, utilityFor: utilityMap });
  assert.equal(result.executableMeasurements, 6);
  assert.ok(result.measurements.every((row) => row.repeatedSpotIds.length === 0));
  assert.ok(result.measurements.every((row) => row.excludedSpotIds.length === row.initialTopK.length));
});

test("explanation alignment distinguishes all four frozen diagnostic classes and missing never passes", () => {
  const base = { explanation: { intent_boost: .4, semantic_component: .1 } };
  const result = evaluateExplanationAlignment({ candidates: [
    { id: "a", human_reason: "intent", ...base, explanationEvidence: { claimedFactors: ["intent_boost"], supportedFactors: ["intent_boost"] } },
    { id: "b", human_reason: "semantic", ...base, explanationEvidence: { claimedFactors: ["semantic_component"], supportedFactors: ["semantic_component"] } },
    { id: "c", human_reason: "memory", ...base, explanationEvidence: { claimedFactors: ["recent_memory_component"], supportedFactors: [] } },
    { id: "d", human_reason: "", ...base, explanationEvidence: { claimedFactors: [], supportedFactors: [] } }
  ] });
  assert.deepEqual(result.measurements.map((row) => row.classification), ["ALIGNED", "PARTIALLY_ALIGNED", "MISLEADING", "UNSUPPORTED"]);
});

test("coverage fails closed for a missing arm and becomes ready only with all four", async () => {
  const user = world.users[0];
  const explanation = await runExplanationAlignment({ cases: Array.from({ length: 4 }, (_, index) => ({ id: `e-${index}`, userId: user.id, request: { city: "Synthetic Basel", query: "cozy", limit: 1 }, context: {} })), executor: fakeExecutor, engineSourceHash });
  const results = { counterfactual: { executableMeasurements: 5 }, personalization: { executableMeasurements: 6 }, remix: { executableMeasurements: 6 }, explanation };
  assert.equal(coverageReport({ expected: coverageContract, results }).ready, true);
  delete results.remix;
  assert.equal(coverageReport({ expected: coverageContract, results }).verdict, "NOT_READY");
});

test("all diagnostic runners reject Engine identity drift and latent input leakage", async () => {
  const badExecutor = async () => ({ ...(await fakeExecutor({ userId: world.users[0].id, request: { query: "x" } })), engineSourceHash: "changed" });
  await assert.rejects(() => runRemixEvaluation({ cases: [{ id: "x", family: "normal", userId: world.users[0].id, request: { query: "x" }, context: {} }], executor: badExecutor, engineSourceHash, utilityFor: utilityMap }), /hash drift/);
  await assert.rejects(() => runRemixEvaluation({ cases: [{ id: "x", family: "normal", userId: world.users[0].id, request: { query: "x", latent_truth: "leak" }, context: {} }], executor: fakeExecutor, engineSourceHash, utilityFor: utilityMap }), /Latent evaluation field/);
});
