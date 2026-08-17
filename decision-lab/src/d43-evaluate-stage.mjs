#!/usr/bin/env node
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { estimateStageCost } from "./d43-ai-reranker.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";

const mean = (rows) => rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
const percentile = (rows, p) => { const sorted = rows.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null; };

export function evaluateStage(result, config, budgetUsd) {
  const actual = result.records.map((row) => row.arms.ACTUAL);
  const metric = (arm, key) => mean(actual.map((row) => row[arm][key]));
  const keys = [`meanUtilityAtK`, `ndcgAt${config.candidateCount}`, `precisionAt${config.candidateCount}`];
  const metrics = Object.fromEntries(["control", "wave4", "ai"].map((arm) => [arm, Object.fromEntries(keys.map((key) => [key, metric(arm, key)]))]));
  const deltasVsControl = Object.fromEntries(keys.map((key) => [key, metrics.ai[key] - metrics.control[key]]));
  const criteria = result.stage === "SMOKE" ? config.smokeProceedCriteria : config.pilotProceedCriteria;
  const calls = result.records.flatMap((row) => Object.values(row.arms));
  const schemaFailureRate = calls.filter((row) => !row.aiResult.validation.valid).length / calls.length;
  const integrityViolations = Object.entries(result.integrity).filter(([key, value]) => key.endsWith("Violations") && value !== 0).length;
  const positiveRankingMetricCount = Object.values(deltasVsControl).filter((value) => value > 0).length;
  const maximumRegression = Math.max(0, ...Object.values(deltasVsControl).map((value) => -value));
  const p95LatencyMs = percentile(calls.map((row) => row.aiResult.latencyMs), 0.95);
  const fullWorstCaseUsd = estimateStageCost(config, "FULL").worstCase.costUsd;
  const pilotWorstCaseUsd = estimateStageCost(config, "PILOT").worstCase.costUsd;
  const remainingBudgetUsd = budgetUsd - result.costs.cumulativeSpentUsd;
  const commonGates = {
    integrity: integrityViolations <= criteria.integrityViolationsMaximum,
    schema: schemaFailureRate <= criteria.schemaFailureRateMaximum,
    latency: p95LatencyMs !== null && p95LatencyMs <= criteria.p95LatencyMsMaximum,
  };
  const gates = result.stage === "SMOKE"
    ? { ...commonGates, pilotAndFullBudget: pilotWorstCaseUsd + fullWorstCaseUsd <= remainingBudgetUsd }
    : {
      ...commonGates,
      meanUtility: deltasVsControl.meanUtilityAtK >= criteria.meanUtilityDeltaMinimum,
      rankingSignal: positiveRankingMetricCount >= criteria.rankingMetricsWithPositiveDeltaMinimum,
      regression: maximumRegression <= criteria.anyRankingMetricRegressionMaximum,
      fullBudget: fullWorstCaseUsd <= remainingBudgetUsd,
    };
  const report = {
    version: "backyrd-d4.3-stage-evaluation-v1", stage: result.stage, metrics, deltasVsControl,
    schemaFailureRate, integrityViolations, positiveRankingMetricCount, maximumRegression, p95LatencyMs,
    costs: { ...result.costs, budgetUsd, remainingBudgetUsd, projectedPilotWorstCaseUsd: pilotWorstCaseUsd, projectedFullWorstCaseUsd: fullWorstCaseUsd },
    gates, proceed: Object.values(gates).every(Boolean), decision: Object.values(gates).every(Boolean) ? "PROCEED" : "STOP_EARLY",
    productionAccess: "NONE",
  };
  return { ...report, reportHash: contentHash(report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stage = String(process.argv[2] ?? "").toLowerCase();
  if (!stage) throw new Error("stage_required");
  const [result, config] = await Promise.all([
    readJson(resolve(repoRoot, `decision-lab/baselines/d4.3-ai-reranker-${stage}-v1.json`)),
    readJson(resolve(repoRoot, "decision-lab/config/d4.3-ai-reranker-v1.json")),
  ]);
  const budgetUsd = Number(process.env.DECISION_LAB_AI_BUDGET_USD);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("budget_required");
  const report = evaluateStage(result, config, budgetUsd);
  await writeJson(resolve(repoRoot, `decision-lab/baselines/d4.3-ai-reranker-${stage}-evaluation-v1.json`), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.proceed) process.exitCode = 3;
}
