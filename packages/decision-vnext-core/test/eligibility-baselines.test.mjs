import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPhase1Eligibility,
  generateNeutralCandidatePool,
  WorldCandidateSchema,
  rankBaselineA,
  resolvePhase1Context,
  runPhase1Decision,
} from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

const setup = () => {
  const syntheticWorld = world();
  const executionValue = execution(undefined, syntheticWorld);
  const context = resolvePhase1Context(request(), executionValue);
  const pool = generateNeutralCandidatePool({ world: syntheticWorld, context, serverRequestId: executionValue.serverRequestId, limit: 36 });
  return { syntheticWorld, executionValue, context, pool, eligibility: applyPhase1Eligibility(pool, context) };
};

test("central eligibility covers distribution, city and conservative open-now", () => {
  const { pool, eligibility } = setup();
  const results = [...eligibility.eligible.map((entry) => entry.eligibility), ...eligibility.rejected];
  assert.equal(results.length, pool.candidates.length);
  assert.ok(results.some((entry) => entry.checks.find((check) => check.ruleId === "distribution-allowed-v1")?.outcome === "fail"));
  assert.ok(results.some((entry) => entry.checks.find((check) => check.ruleId === "explicit-city-match-v1")?.outcome === "fail"));
  assert.ok(results.some((entry) => entry.checks.find((check) => check.ruleId === "explicit-open-now-v1")?.outcome === "fail"));
  assert.ok(results.some((entry) => entry.checks.find((check) => check.ruleId === "explicit-open-now-v1")?.outcome === "unknown"));
  for (const entry of eligibility.eligible) {
    assert.equal(entry.candidate.distributionAllowed, true);
    assert.equal(entry.candidate.city, "Fixture Basel");
    assert.equal(entry.candidate.openStatus, "open");
    assert.ok(entry.eligibility.checks.every((check) => check.outcome === "pass"));
  }
});

test("excluded candidates never reach ranking and fit cannot restore them", () => {
  const { eligibility } = setup();
  const rejectedIds = new Set(eligibility.rejected.map((entry) => entry.spotId));
  const ranked = rankBaselineA(eligibility.eligible);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((entry) => !rejectedIds.has(entry.eligibleCandidate.candidate.spotId)));
});

test("both baselines consume an identical frozen neutral pool", () => {
  const syntheticWorld = world();
  const resultA = runPhase1Decision({ request: request(), execution: execution("baseline-a-open-distance-popularity", syntheticWorld), world: syntheticWorld, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36 });
  const resultB = runPhase1Decision({ request: request(), execution: execution("baseline-b-mood-intent", syntheticWorld), world: syntheticWorld, baseline: "baseline-b-mood-intent", candidatePoolSize: 36 });
  assert.equal(resultA.candidatePool.candidatePoolHash, resultB.candidatePool.candidatePoolHash);
  assert.ok(Object.isFrozen(resultA.candidatePool));
  assert.deepEqual(resultA.candidatePool.candidates.map(({ candidate }) => candidate.spotId), resultB.candidatePool.candidates.map(({ candidate }) => candidate.spotId));
  assert.ok(resultA.candidatePool.candidates.every((entry) => entry.retrievalSource.sourceId === "synthetic-neutral-world-adapter-v2" && entry.retrievalSource.personalized === false));
});

test("commercial counterfactual fields cannot cross the engine contract boundary", () => {
  const synthetic = world(); const result = runPhase1Decision({ request: request(), execution: execution(undefined, synthetic), world: synthetic, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36, resultLimit: 3 });
  const candidate = result.candidatePool.candidates[0].candidate;
  for (const field of ["paymentStatus", "ownerTier", "sponsored", "advertising", "subscription"]) {
    assert.throws(() => WorldCandidateSchema.parse({ ...candidate, [field]: field === "sponsored" ? true : "counterfactual" }), /unknown field/);
  }
  assert.ok(synthetic.spots.every((spot) => !("commercialProbe" in spot)));
});
