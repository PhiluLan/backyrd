import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateWorld } from "../src/generator.mjs";
import { buildPersonalizationTreatment, PERSONALIZATION_COMPONENTS, validateTreatment } from "../src/personalization-treatment.mjs";
import { validatePersonalizationTreatmentFreeze } from "../src/personalization-treatment-freeze.mjs";

const config = JSON.parse(await readFile(new URL("../config/smoke-v1.json", import.meta.url), "utf8"));
const world = generateWorld(config, { engineSourceHash: "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba" });
const source = world.users.find((user) => user.maturity === "mature") ?? world.users[0];
const input = { userId: source.id, scenarioId: "d2-2-adversarial", currentRequest: { city: "Synthetic Basel", query: "cozy date" }, currentContext: { audience: "date", timeBucket: "evening" } };

test("three arms share latent truth, query, context, world and Engine controls", () => {
  const bundle = buildPersonalizationTreatment(world, input);
  assert.equal(bundle.evaluationOnly.sameLatentTruthReference, source.id);
  assert.deepEqual(bundle.controls.currentRequest, input.currentRequest);
  assert.deepEqual(bundle.controls.currentContext, input.currentContext);
  assert.equal(bundle.controls.worldHash, world.manifest.worldHash);
  assert.equal(bundle.controls.engineSourceHash, world.manifest.engineSourceHash);
  assert.equal(new Set(Object.values(bundle.enginePlans).map((arm) => arm.user.id)).size, 3);
});

test("neutral is authenticated, direction-free and projection-free", () => {
  const neutral = buildPersonalizationTreatment(world, input).enginePlans.NEUTRAL;
  assert.equal(neutral.authenticationMode, "authenticated");
  assert.deepEqual(neutral.history, []);
  assert.equal(neutral.onboarding, null);
  assert.equal(neutral.directDerivedWrites, false);
});

test("opposing history is deterministic and directionally controlled", () => {
  const first = buildPersonalizationTreatment(world, input);
  const second = buildPersonalizationTreatment(world, input);
  assert.equal(first.treatmentHash, second.treatmentHash);
  assert.deepEqual(first.enginePlans.OPPOSING, second.enginePlans.OPPOSING);
  assert.ok(first.evaluationOnly.opposingDirection.lowCategories.length > 0);
  assert.ok(first.enginePlans.OPPOSING.history.length > 0);
});

test("all state projections are delegated to canonical learning calls", () => {
  const bundle = buildPersonalizationTreatment(world, input);
  const calls = ["backyrd_ml_log_event_v1", "backyrd_log_taste_event_v3", "backyrd_log_decision_action_v1"];
  for (const arm of [bundle.enginePlans.ACTUAL, bundle.enginePlans.OPPOSING]) for (const event of arm.history) for (const call of event.calls) assert.ok(calls.includes(call.rpc));
  assert.ok(PERSONALIZATION_COMPONENTS.some((row) => row.component === "recent_decision_memory" && row.included));
  assert.ok(Object.values(bundle.enginePlans).every((arm) => arm.directDerivedWrites === false));
  assert.ok(bundle.enginePlans.ACTUAL.history.every((event) => Number.isInteger(event.occurredDay)));
  assert.doesNotMatch(JSON.stringify(bundle.enginePlans), /signalStrength|weightOverride|rankingWeight|scoreOverride/i);
});

test("latent truth cannot enter an Engine plan", () => {
  const bundle = buildPersonalizationTreatment(world, input);
  assert.doesNotMatch(JSON.stringify(bundle.enginePlans), /latent|ground_truth|true_preference|oracle/i);
  assert.match(JSON.stringify(bundle.evaluationOnly), /latent/i);
});

test("adversarial treatment validation passes all twelve scientific controls", () => {
  const result = validateTreatment(buildPersonalizationTreatment(world, input));
  assert.equal(result.pass, true);
  assert.equal(Object.keys(result.checks).length, 12);
  assert.ok(Object.values(result.checks).every(Boolean));
  assert.equal(result.checks.anonymousPathProhibited, true);
  assert.equal(result.checks.noWeightManipulation, true);
  assert.equal(result.checks.candidateAttribution, true);
});

test("each scientific control fails closed under targeted tampering", () => {
  const probes = {
    identityControl: (bundle) => { bundle.enginePlans.ACTUAL.user.id = null; },
    contextControl: (bundle) => { bundle.controls.currentRequest = null; },
    worldControl: (bundle) => { bundle.controls.worldHash = null; },
    engineControl: (bundle) => { bundle.controls.engineSourceHash = null; },
    neutrality: (bundle) => { bundle.enginePlans.NEUTRAL.history.push({ observedEventType: "like" }); },
    opposingDirection: (bundle) => { bundle.evaluationOnly.opposingDirection.lowCategories = []; },
    internalConsistency: (bundle) => { bundle.enginePlans.ACTUAL.directDerivedWrites = true; },
    noLatentLeakage: (bundle) => { bundle.enginePlans.ACTUAL.true_preference = "forbidden"; },
    reproducibilityIdentity: (bundle) => { bundle.treatmentHash = "tampered"; },
    candidateAttribution: (bundle) => { bundle.controls.productEligibility = "OVERRIDDEN"; },
    anonymousPathProhibited: (bundle) => { bundle.enginePlans.NEUTRAL.authenticationMode = "anonymous"; },
    noWeightManipulation: (bundle) => { bundle.enginePlans.OPPOSING.scoreOverride = 1; }
  };
  for (const [check, tamper] of Object.entries(probes)) {
    const bundle = structuredClone(buildPersonalizationTreatment(world, input));
    tamper(bundle);
    const result = validateTreatment(bundle);
    assert.equal(result.pass, false, `${check} tamper must invalidate treatment`);
    assert.equal(result.checks[check], false, `${check} must identify its targeted tamper`);
  }
});

test("cold start permits actual and neutral to carry no informative history", () => {
  const cold = world.users.find((user) => user.maturity === "cold");
  const bundle = buildPersonalizationTreatment(world, { ...input, userId: cold.id });
  assert.equal(bundle.enginePlans.NEUTRAL.history.length, 0);
  assert.equal(bundle.enginePlans.OPPOSING.history.length, 0);
});

test("onboarding preferences are never reconstructed from a completion boolean", () => {
  const onboarding = world.users.find((user) => user.maturity === "onboarding");
  const bundle = buildPersonalizationTreatment(world, { ...input, userId: onboarding.id });
  assert.equal(onboarding.observed.onboarding, true);
  assert.equal(bundle.enginePlans.ACTUAL.onboarding, null);
  assert.equal(bundle.enginePlans.OPPOSING.onboarding, null);
});

test("D2.2 freeze preserves D2.1 and rejects tampering", async () => {
  const frozen = JSON.parse(await readFile(new URL("../config/personalization-treatment-v1.freeze.json", import.meta.url), "utf8"));
  const valid = await validatePersonalizationTreatmentFreeze(frozen);
  assert.equal(valid.valid, true);
  assert.equal(valid.actual.validation.caseCount, 18);
  assert.deepEqual(valid.actual.validation.maturityCoverage, ["cold", "onboarding", "sparse", "developing", "mature", "power"]);
  const bad = { ...frozen, contractHash: "tampered" };
  const invalid = await validatePersonalizationTreatmentFreeze(bad);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.reasons.includes("HASH_MISMATCH:contractHash"));
});
