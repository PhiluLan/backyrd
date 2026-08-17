#!/usr/bin/env node
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { currentD43Identity } from "./d43-freeze.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";

const [dryRun, smoke, smokeEvaluation, pilot, pilotEvaluation, freeze] = await Promise.all([
  readJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-dry-run-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-smoke-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-smoke-evaluation-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-pilot-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-pilot-evaluation-v1.json")),
  currentD43Identity(),
]);

const successfulSmokeCostUsd = smoke.costs.stageCostUsd;
const invalidOutputCapSmokeCostUsd = 0.0104938;
const pilotIncrementalCostUsd = pilot.costs.stageCostUsd;
const totalCostUsd = pilot.costs.cumulativeSpentUsd;
const averageValidLiveCallCostUsd = (successfulSmokeCostUsd + pilotIncrementalCostUsd) / 60;
const decisionsPerUser = 8;
const monthly = Object.fromEntries([100, 500, 2000, 10000].map((users) => [users, users * decisionsPerUser * averageValidLiveCallCostUsd]));
const result = {
  version: "backyrd-d4.3-ai-reranker-stopped-early-result-v1",
  generatedAt: "2026-08-17T18:30:00.000Z",
  status: "STOPPED_EARLY",
  stopReason: "D4.3-MI-003_PILOT_PROCEED_GATE_MATHEMATICALLY_UNSATISFIABLE_FOR_PURE_TOP10_RERANKING",
  freeze: { ...freeze, freezeHash: contentHash(freeze) },
  stages: {
    dryRun: { resultHash: dryRun.resultHash, budgetGate: dryRun.budgetGate, externalApiCalls: 0 },
    smoke: { resultHash: smoke.resultHash, evaluationHash: smokeEvaluation.reportHash, proceed: smokeEvaluation.proceed },
    pilot: { resultHash: pilot.resultHash, evaluationHash: pilotEvaluation.reportHash, proceed: pilotEvaluation.proceed },
    full: { executed: false, reason: "PILOT_PROCEED_GATE_FAILED" },
  },
  pilotMetrics: pilotEvaluation.metrics,
  pilotDeltasVsWave3CControl: pilotEvaluation.deltasVsControl,
  measurementIntegrity: {
    incidents: [
      { id: "D4.3-MI-001", issue: "Initial 1100-token input cap below strict-schema payload", externalCalls: 0, costUsd: 0, disposition: "FIXED_BEFORE_EXTERNAL_CALL" },
      { id: "D4.3-MI-002", issue: "Initial 500-token output cap truncated every structured response", externalCalls: 15, costUsd: invalidOutputCapSmokeCostUsd, disposition: "FIXED_AND_SMOKE_RESTARTED" },
      { id: "D4.3-MI-003", issue: "Pilot requires two positive metrics although Mean Utility@10 and Precision@10 are set-invariant when all ten candidates are reranked", disposition: "STOP_FULL_RUN_NO_POST_RESULT_GATE_CHANGE" },
      { id: "D4.3-MI-004", issue: "No pre-run immutable source/config freeze was sealed before live Smoke/Pilot", disposition: "SCIENTIFIC_VALIDITY_FAIL_POST_STOP_EVIDENCE_FREEZE_ONLY" },
    ],
    scientificValidity: "FAIL",
  },
  integrity: pilot.integrity,
  costs: {
    smokeInvalidCapUsd: invalidOutputCapSmokeCostUsd,
    smokeSuccessfulUsd: successfulSmokeCostUsd,
    pilotIncrementalUsd: pilotIncrementalCostUsd,
    fullRunUsd: 0,
    totalUsd: totalCostUsd,
    budgetUsd: dryRun.budgetUsd,
    remainingBudgetUsd: dryRun.budgetUsd - totalCostUsd,
    averageValidLiveCallUsd: averageValidLiveCallCostUsd,
    projectedMonthlyUsd: { assumptions: { aiCallsPerDecision: 1, decisionsPerActiveUserPerMonth: decisionsPerUser }, byActiveUsers: monthly },
  },
  verdicts: {
    experiment: "STOPPED_EARLY", aiRankingQuality: "INCONCLUSIVE", personalizationValue: "INCONCLUSIVE",
    contextualDecisionIntelligence: "INCONCLUSIVE", currentIntentAuthority: "PASS",
    aiCostProfile: "INCONCLUSIVE", aiLatencyProfile: "ACCEPTABLE_PILOT_ONLY", scientificValidity: "FAIL",
    aiDecisionLayer: "FURTHER_TEST_REQUIRED", production: "UNCHANGED",
  },
};
result.resultHash = contentHash(result);
await writeJson(resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-stopped-early-v1.json"), result);
process.stdout.write(`${JSON.stringify({ status: result.status, resultHash: result.resultHash, totalCostUsd, remainingBudgetUsd: result.costs.remainingBudgetUsd }, null, 2)}\n`);
