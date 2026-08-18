import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { repoRoot } from "./io.mjs";
import { buildN6AFlightRecord, callAiBuddy, estimateStage, requireAiBudget } from "./n6a-ai-decision-buddy.mjs";
import { buildN6AScenarioMatrix } from "./n6a-scenarios.mjs";
import { evaluateN6ARuns } from "./n6a-evaluator.mjs";

const config = JSON.parse(await readFile(resolve(repoRoot, "decision-lab/config/n6a-ai-decision-buddy-v1.json"), "utf8"));
const validation = JSON.parse(await readFile(resolve(repoRoot, "decision-lab/config/n6a-validation-contract-v1.json"), "utf8"));
const stagePaths = {
  DRY_RUN: "decision-lab/baselines/n6a-ai-decision-buddy-dry-run-v1.json",
  SMOKE: "decision-lab/baselines/n6a-ai-decision-buddy-smoke-v1.json",
  PILOT: "decision-lab/baselines/n6a-ai-decision-buddy-pilot-v1.json",
  FULL: "decision-lab/baselines/n6a-ai-decision-buddy-full-v1.json"
};
const round = (value) => Number(value.toFixed(8));

function dryRun(env = process.env) {
  const estimates = Object.fromEntries(["SMOKE", "PILOT", "FULL"].map((stage) => [stage, estimateStage(config, stage)]));
  const totalWorstCaseCostUsd = Object.values(estimates).reduce((sum, row) => sum + row.worstCaseCostUsd, 0);
  const budget = Number(env.DECISION_LAB_AI_BUDGET_USD);
  const body = {
    version: config.version, stage: "DRY_RUN", externalAiCalls: 0, model: config.model, candidateCount: config.candidateCount,
    estimates, totalWorstCaseCostUsd: round(totalWorstCaseCostUsd), configuredBudgetUsd: Number.isFinite(budget) && budget > 0 ? budget : null,
    budgetStatus: !Number.isFinite(budget) || budget <= 0 ? "BLOCKED_BUDGET_REQUIRED" : totalWorstCaseCostUsd <= budget ? "FULL_SEQUENCE_WITHIN_BUDGET" : "STAGED_ONLY_CHECK_REMAINING_BEFORE_EACH_STAGE",
    inputContractHash: contentHash({ version: config.inputContractVersion, candidateCount: config.candidateCount }),
    validationContractHash: contentHash(validation), secretMaterialPresent: false, production: "UNCHANGED"
  };
  return { ...body, resultHash: contentHash(body) };
}

async function priorSpend(stage) {
  const required = stage === "SMOKE" ? [] : stage === "PILOT" ? ["SMOKE"] : ["SMOKE", "PILOT"];
  let spent = 0;
  for (const previous of required) {
    const file = resolve(repoRoot, stagePaths[previous]);
    let result; try { result = JSON.parse(await readFile(file, "utf8")); } catch { throw new Error(`N6A_REQUIRED_PRIOR_STAGE_MISSING:${previous}`); }
    if (!result.proceed) throw new Error(`N6A_REQUIRED_PRIOR_STAGE_DID_NOT_PROCEED:${previous}`);
    spent += Number(result.metrics?.usage?.costUsd ?? 0);
  }
  return spent;
}

function proceed(stage, metrics) {
  const gates = stage === "SMOKE" ? config.smokeProceedGates : config.pilotProceedGates;
  const matrix = {
    integrity: metrics.invalidOutputRate <= gates.invalidOutputRateMaximum,
    hallucinations: metrics.hallucinatedCandidateRate <= (gates.hallucinatedCandidateRateMaximum ?? 0),
    latency: metrics.latency.p95Ms <= gates.p95LatencyMsMaximum
  };
  if (stage === "PILOT") Object.assign(matrix, {
    direction: (metrics.byArm.ACTUAL?.buddyDirectionAlignment ?? 0) >= gates.buddyDirectionAlignmentMinimum,
    rankingLift: metrics.personalizationLift >= gates.ndcgLiftVsNeutralMinimum,
    matureLift: metrics.matureUserLift >= gates.maturePersonalizationLiftMinimum,
    harm: metrics.personalizationHarmRate <= gates.personalizationHarmRateMaximum
  });
  return { proceed: Object.values(matrix).every(Boolean), gateMatrix: matrix };
}

async function execute(stage, env = process.env) {
  const budgetUsd = requireAiBudget(env); const spentUsd = await priorSpend(stage); const estimate = estimateStage(config, stage);
  if (spentUsd + estimate.worstCaseCostUsd > budgetUsd + 1e-12) throw new Error(`N6A_AI_BUDGET_PROJECTED_EXCEEDED:${round(spentUsd + estimate.worstCaseCostUsd)}>${budgetUsd}`);
  const spec = config.stages[stage]; const arms = spec.arms;
  const count = spec.scenarioCount;
  const seedCount = stage === "FULL" ? 3 : 1;
  const scenarios = buildN6AScenarioMatrix({ count, seeds: validation.seeds.slice(0, seedCount), arms });
  if (scenarios.length !== spec.maxRequests) throw new Error(`N6A_REQUEST_COVERAGE_MISMATCH:${scenarios.length}:${spec.maxRequests}`);
  const ledger = { spentUsd };
  const runs = [];
  for (const scenario of scenarios) {
    const result = await callAiBuddy({ config, input: scenario.input, ledger, env });
    runs.push({ scenario, result });
  }
  const metrics = evaluateN6ARuns(runs); const decision = proceed(stage, metrics);
  const sealedRuns = runs.map(({ scenario, result }) => {
    const failureClassification = !result.validation.valid ? "INTEGRITY_FAILURE" : !scenario.evaluator.truth[result.ranking[0].spot_id].directionAligned ? "AI_REASONING_MISS" : result.decisionConfidence > 0.75 && scenario.evaluator.truth[result.ranking[0].spot_id].utility < 0.45 ? "CONFIDENCE_MISS" : "NONE";
    return { scenarioId: scenario.scenarioId, family: scenario.family, arm: scenario.arm, inputHash: scenario.input.inputHash, execution: result.execution, validation: result.validation, ranking: result.ranking, decisionConfidence: result.decisionConfidence, usage: result.usage, costUsd: result.costUsd, latencyMs: result.latencyMs, responseHash: result.responseHash, flightRecorder: buildN6AFlightRecord(scenario.input, result, failureClassification) };
  });
  const body = { version: config.version, stage, status: "COMPLETE", model: config.model, requestCount: runs.length, candidateCount: config.candidateCount, metrics, ...decision, spentBeforeStageUsd: spentUsd, cumulativeSpentUsd: ledger.spentUsd, runs: sealedRuns, validationContractHash: contentHash(validation), scientificValidity: metrics.invalidOutputRate === 0 ? "PASS" : "FAIL", production: "UNCHANGED" };
  return { ...body, resultHash: contentHash(body) };
}

export async function runN6A({ stage = "DRY_RUN", write = false, env = process.env } = {}) {
  if (!Object.hasOwn(stagePaths, stage)) throw new Error(`unknown_n6a_stage:${stage}`);
  const result = stage === "DRY_RUN" ? dryRun(env) : await execute(stage, env);
  if (write) await writeFile(resolve(repoRoot, stagePaths[stage]), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const stageArg = process.argv.indexOf("--stage"); const stage = stageArg >= 0 ? process.argv[stageArg + 1] : "DRY_RUN";
  const result = await runN6A({ stage, write: process.argv.includes("--write") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (["SMOKE", "PILOT"].includes(stage) && !result.proceed) process.exitCode = 2;
}
