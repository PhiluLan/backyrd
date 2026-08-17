import assert from "node:assert/strict";
import test from "node:test";
import config from "../config/d4.3-ai-reranker-v1.json" with { type: "json" };
import { buildDryRunReport } from "../src/d43-dry-run.mjs";
import { currentD43Identity } from "../src/d43-freeze.mjs";
import { readJson, repoRoot } from "../src/io.mjs";
import { resolve } from "node:path";
import {
  assertProjectedBudget,
  estimateTokens,
  fullExperimentCostProjection,
  outputSchema,
  requireBudget,
  validateAiRanking,
} from "../src/d43-ai-reranker.mjs";

test("D4.3 dry run makes zero calls and fits the explicit two-dollar cap", () => {
  const report = buildDryRunReport(config, { DECISION_LAB_AI_BUDGET_USD: "2.00" });
  assert.equal(report.externalApiCalls, 0);
  assert.equal(report.budgetGate, "PASS");
  assert.ok(report.projection.totalWorstCaseUsd < 2);
  assert.equal(report.secretMaterialPresent, false);
});

test("D4.3 budget is mandatory and projected overruns fail closed", () => {
  assert.throws(() => requireBudget({}), /required/);
  assert.throws(() => assertProjectedBudget({ budgetUsd: 2, spentUsd: 1.9, projectedUsd: 0.11 }), /PROJECTED_EXCEEDED/);
});

test("D4.3 estimator and full projection are deterministic", () => {
  assert.equal(estimateTokens({ query: "cozy date" }), estimateTokens({ query: "cozy date" }));
  assert.deepEqual(fullExperimentCostProjection(config), fullExperimentCostProjection(config));
  assert.equal(fullExperimentCostProjection(config).requests, 453);
});

test("D4.3 structured output rejects incomplete, duplicate, unknown and invalid rankings", () => {
  const ids = ["a", "b"];
  const valid = { ranked_candidates: [
    { spot_id: "a", rank: 1, fit: 0.8, confidence: 0.7, reason_codes: ["current_intent_fit"] },
    { spot_id: "b", rank: 2, fit: 0.5, confidence: 0.6, reason_codes: ["contextual_fit"] },
  ], overall_confidence: 0.7 };
  assert.equal(validateAiRanking(valid, ids).valid, true);
  assert.equal(validateAiRanking({ ...valid, ranked_candidates: valid.ranked_candidates.slice(0, 1) }, ids).reason, "INCOMPLETE_RANKING");
  assert.equal(validateAiRanking({ ...valid, ranked_candidates: [valid.ranked_candidates[0], { ...valid.ranked_candidates[1], spot_id: "a" }] }, ids).reason, "DUPLICATE_CANDIDATE");
  assert.equal(validateAiRanking({ ...valid, ranked_candidates: [valid.ranked_candidates[0], { ...valid.ranked_candidates[1], spot_id: "x" }] }, ids).reason, "UNKNOWN_CANDIDATE");
  assert.equal(validateAiRanking({ ...valid, ranked_candidates: [valid.ranked_candidates[0], { ...valid.ranked_candidates[1], rank: 1 }] }, ids).reason, "INVALID_RANK_SEQUENCE");
  assert.deepEqual(outputSchema(ids).properties.ranked_candidates.items.properties.spot_id.enum, ids);
});

test("D4.3 post-stop evidence freeze matches current sources and makes no certification claim", async () => {
  const frozen = await readJson(resolve(repoRoot, "decision-lab/config/d4.3-ai-reranker-v1.freeze.json"));
  assert.deepEqual(await currentD43Identity(), frozen);
  assert.equal(frozen.freezeTiming, "POST_PILOT_STOP_EVIDENCE_ONLY_NOT_PRE_RUN_CERTIFICATION");
  assert.equal(frozen.scientificStatus, "FAIL_MEASUREMENT_CONTRACT_AND_PRE_RUN_FREEZE");
});

test("D4.3 result is stopped before Full and is secret-free", async () => {
  const result = await readJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-stopped-early-v1.json"));
  assert.equal(result.status, "STOPPED_EARLY");
  assert.equal(result.stages.full.executed, false);
  assert.equal(result.verdicts.scientificValidity, "FAIL");
  assert.equal(result.verdicts.production, "UNCHANGED");
  assert.doesNotMatch(JSON.stringify(result), /sk-[A-Za-z0-9_-]{12,}/);
});
