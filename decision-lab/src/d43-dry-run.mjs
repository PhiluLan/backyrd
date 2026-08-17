#!/usr/bin/env node
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { fullExperimentCostProjection, requireBudget } from "./d43-ai-reranker.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";

export function buildDryRunReport(config, env = process.env) {
  const budgetUsd = requireBudget(env);
  const priorSpentUsd = Number(env.DECISION_LAB_AI_PRIOR_SPENT_USD ?? 0);
  if (!Number.isFinite(priorSpentUsd) || priorSpentUsd < 0) throw new Error("invalid_prior_spend");
  const projection = fullExperimentCostProjection(config);
  const withinBudget = priorSpentUsd + projection.totalWorstCaseUsd <= budgetUsd;
  const report = {
    version: "backyrd-d4.3-ai-reranker-dry-run-v1",
    generatedAt: "2026-08-17T16:00:00.000Z",
    mode: "DRY_RUN",
    externalApiCalls: 0,
    experimentVersion: config.version,
    model: config.model,
    modelConfig: config.modelConfig,
    candidateCount: config.candidateCount,
    budgetUsd,
    priorSpentUsd,
    pricingUsdPerMillionTokens: config.pricingUsdPerMillionTokens,
    projection,
    remainingAfterWorstCaseUsd: budgetUsd - priorSpentUsd - projection.totalWorstCaseUsd,
    budgetGate: withinBudget ? "PASS" : "FAIL_CLOSED",
    nextStage: withinBudget ? "SMOKE_AUTHORIZED" : "STOPPED_BUDGET",
    productionAccess: "NONE",
    secretMaterialPresent: false,
  };
  return { ...report, resultHash: contentHash(report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = await readJson(resolve(repoRoot, "decision-lab/config/d4.3-ai-reranker-v1.json"));
  const report = buildDryRunReport(config);
  const output = resolve(repoRoot, "decision-lab/baselines/d4.3-ai-reranker-dry-run-v1.json");
  await writeJson(output, report);
  process.stdout.write(`${JSON.stringify({ output, ...report }, null, 2)}\n`);
  if (report.budgetGate !== "PASS") process.exitCode = 2;
}
