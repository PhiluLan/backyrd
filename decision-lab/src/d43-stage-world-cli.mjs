#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { compactAiInput, rerankWithAi } from "./d43-ai-reranker.mjs";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { requestForGoldenScenario, runD3AWorld } from "./d3-a-runner.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios } from "./golden-scenarios.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { listQuality } from "./metrics.mjs";
import { buildPersonalizationTreatment, TREATMENT_ARMS } from "./personalization-treatment.mjs";
import { latentUtility } from "./utility.mjs";
import { materializeTreatmentTaste, rankWithPersonalizedFit } from "./wave3c-personalized-fit.mjs";
import { rankWithContextualUtility } from "./wave4-contextual-utility-fusion.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const stage = String(option("stage") ?? "").toUpperCase();
const configPath = resolve(repoRoot, option("config"));
const outputPath = resolve(repoRoot, option("output"));
const priorSpentUsd = Number(option("prior-spent-usd") ?? 0);
if (!stage || !configPath || !outputPath) throw new Error("--stage, --config and --output are required");

function selectRepresentative(records, scenarios, stageConfig) {
  const allowed = new Set(stageConfig.allowedSplits);
  const scenarioById = new Map(scenarios.map((row) => [row.id, row]));
  const available = records.filter((row) => allowed.has(scenarioById.get(row.scenarioId)?.split));
  const selected = [];
  const families = [...new Set(available.map((row) => scenarioById.get(row.scenarioId)?.family))].sort();
  while (selected.length < Math.min(stageConfig.decisions, available.length)) {
    let changed = false;
    for (const family of families) {
      const next = available.find((row) => scenarioById.get(row.scenarioId)?.family === family && !selected.includes(row));
      if (next) { selected.push(next); changed = true; }
      if (selected.length >= stageConfig.decisions) break;
    }
    if (!changed) break;
  }
  return selected;
}

function compactTaste(tasteMap) {
  const best = new Map();
  for (const row of tasteMap.rows) {
    const current = best.get(row.concept);
    if (!current || row.confidence > current.confidence) best.set(row.concept, row);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence || Math.abs(b.affinity) - Math.abs(a.affinity)).map((row) => ({
    concept: row.concept, affinity: row.affinity, confidence: row.confidence, authority: row.scope.kind,
  }));
}

function compactCandidates(world, candidateIds) {
  const byId = new Map(world.spots.map((spot) => [spot.id, spot]));
  return candidateIds.map((id, index) => {
    const spot = byId.get(id);
    return {
      spotId: id, category: spot.category, name: spot.observed.name, description: spot.observed.description,
      moods: spot.observed.moods ?? [], priceLevel: spot.observed.priceLevel, retrievalRank: index + 1,
      dataConfidence: spot.density === "dense" ? "high" : spot.density === "medium" ? "medium" : "low",
    };
  });
}

function truthFor(world, user, context) {
  return Object.fromEntries(world.spots.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
}

function quality(ids, truth, k) { return listQuality(ids, truth, 0.6, k); }

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`D4.3 preflight failed:${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key}_missing`);
const [worldConfig, experimentConfig, constitution, coverageContract] = await Promise.all([
  readJson(configPath),
  readJson(resolve(repoRoot, "decision-lab/config/d4.3-ai-reranker-v1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json")),
  readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json")),
]);
const stageConfig = experimentConfig.stages[stage];
if (!stageConfig) throw new Error(`unknown_stage:${stage}`);
const sourceUrl = new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url);
const sourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const candidateRun = await runD3AWorld({
  config: worldConfig, metadata, constitution, coverageContract, env: process.env,
  engine: { sourceUrl, expectedSourceHash: sourceHash, baselineId: "backyrd-d4.3-frozen-candidate-path-v1", wave1: true, goldenOnly: true },
});
const world = generateWorld({ ...worldConfig, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata);
const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion);
const scenarioById = new Map(scenarios.map((row) => [row.id, row]));
const selected = selectRepresentative(candidateRun.records, scenarios, stageConfig);
const budgetLedger = { spentUsd: priorSpentUsd };
const records = [];

for (const candidateRecord of selected) {
  const scenario = scenarioById.get(candidateRecord.scenarioId);
  const user = world.users.find((row) => row.id === scenario.userId);
  const context = { ...world.contexts.find((row) => row.id === scenario.context.contextId), ...scenario.context };
  const request = requestForGoldenScenario(scenario);
  const allEligible = candidateRecord.retrievalContractEvidence.candidateIds.filter((id) => Object.hasOwn(candidateRecord.retrievalContractEvidence.eligibleUtilityById, id));
  const candidateIds = allEligible.slice(0, experimentConfig.candidateCount);
  if (candidateIds.length < 2) throw new Error(`insufficient_smoke_candidates:${scenario.id}`);
  const truth = truthFor(world, user, context);
  const treatment = buildPersonalizationTreatment(world, { userId: user.id, scenarioId: scenario.id, currentRequest: request, currentContext: scenario.context });
  const arms = {};
  for (const arm of TREATMENT_ARMS) {
    const tasteMap = materializeTreatmentTaste(world, treatment, arm);
    const control = rankWithPersonalizedFit({ candidateIds, spots: world.spots, tasteMap, request, context, maturity: user.maturity, limit: candidateIds.length });
    const wave4 = rankWithContextualUtility({ candidateIds, spots: world.spots, tasteMap, request, context, maturity: user.maturity, limit: candidateIds.length });
    const input = compactAiInput({ request, context, tasteProjection: compactTaste(tasteMap), candidates: compactCandidates(world, candidateIds) });
    let ai;
    try {
      ai = await rerankWithAi({ config: experimentConfig, input, candidateIds, budgetLedger });
    } catch (error) {
      if (/AI_BUDGET/.test(error.message)) throw error;
      ai = { validation: { valid: false, reason: error.message }, ranking: null, execution: "ERROR_FALLBACK", costUsd: 0, latencyMs: null, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
    }
    const aiIds = ai.validation.valid ? ai.ranking.map((row) => row.spot_id) : control.results.map((row) => row.spotId);
    arms[arm] = {
      control: quality(control.results.map((row) => row.spotId), truth, candidateIds.length),
      wave4: quality(wave4.results.map((row) => row.spotId), truth, candidateIds.length),
      ai: quality(aiIds, truth, candidateIds.length),
      aiResult: ai,
      inputHash: contentHash(input), candidateIdsHash: contentHash(candidateIds),
    };
  }
  records.push({
    scenarioId: scenario.id, split: scenario.split, family: scenario.family, maturity: user.maturity,
    candidateCount: candidateIds.length, hardConstraintPass: candidateRecord.hardConstraintResult.pass, arms,
  });
}

const result = {
  version: "backyrd-d4.3-ai-stage-world-v1", stage, seed: worldConfig.seed, experimentContractHash: contentHash(experimentConfig),
  candidatePathSourceHash: sourceHash, records,
  costs: {
    priorSpentUsd, stageCostUsd: budgetLedger.spentUsd - priorSpentUsd, cumulativeSpentUsd: budgetLedger.spentUsd,
    inputTokens: records.flatMap((row) => Object.values(row.arms)).filter((row) => row.aiResult.execution === "LIVE").reduce((sum, row) => sum + row.aiResult.usage.inputTokens, 0),
    outputTokens: records.flatMap((row) => Object.values(row.arms)).filter((row) => row.aiResult.execution === "LIVE").reduce((sum, row) => sum + row.aiResult.usage.outputTokens, 0),
    cacheReplayCount: records.flatMap((row) => Object.values(row.arms)).filter((row) => row.aiResult.execution === "CACHE_REPLAY").length,
  },
  integrity: {
    hardConstraintViolations: records.filter((row) => !row.hardConstraintPass).length,
    invalidAiOutputs: records.flatMap((row) => Object.values(row.arms)).filter((row) => !row.aiResult.validation.valid).length,
    candidateMutationViolations: records.flatMap((row) => Object.values(row.arms)).filter((row) => row.aiResult.validation.valid && row.aiResult.ranking.some((item) => !item.spot_id)).length,
    productEligibilityViolations: 0, distributionEligibilityViolations: 0, latentTruthRuntimeInput: false,
    productionAccess: "NONE", retrievalMutation: "NONE", tasteEngineMutation: "NONE",
  },
};
result.resultHash = contentHash(result);
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ stage, seed: worldConfig.seed, records: records.length, costs: result.costs, integrity: result.integrity, resultHash: result.resultHash }, null, 2)}\n`);
