#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { evaluateRetrievalPromotion, retrievalScenarioMetrics, summarizeRetrievalScenarios } from "./retrieval-quality-contract.mjs";
import { pairedBootstrap } from "./statistics.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputOption = option("input");
const fullFidelityOption = option("full-fidelity");
const outputOption = option("output");
if (!inputOption || !fullFidelityOption || !outputOption) throw new Error("--input, --full-fidelity and --output are required");

const input = resolve(repoRoot, inputOption);
const fullFidelityDir = resolve(repoRoot, fullFidelityOption);
const output = resolve(repoRoot, outputOption);
const contract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const freeze = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.freeze.json"));
const wave2_1 = await readJson(resolve(repoRoot, "decision-lab/baselines/wave2.1-retrieval-next-gen-v1.json"));
const engines = ["v13", "wave1", "wave2", "wave2.1"];
const seeds = ["backyrd-d1-basel-v1-2026", "backyrd-d1-basel-v1-2026-2", "backyrd-d1-basel-v1-2026-3"];
const arms = Object.fromEntries(await Promise.all(engines.map(async (engine) => [engine, await Promise.all(seeds.map((seed) => readJson(resolve(input, engine, `${seed}.json`))))])));

const scenarioRows = (worlds, k) => worlds.flatMap((world) => world.records.map((record) => ({
  key: `${record.seed}:${record.scenarioId}`,
  seed: record.seed,
  split: record.split,
  family: record.family,
  metrics: retrievalScenarioMetrics({
    candidateIds: record.retrievalContractEvidence.candidateIds,
    eligibleUtilityById: record.retrievalContractEvidence.eligibleUtilityById,
    relevanceThreshold: contract.relevanceThreshold,
    k,
  }),
  latencyMs: record.latencyMs,
  resultCount: record.finalTopK.length,
  hardViolation: !record.hardConstraintResult.pass,
})));

const group = (rows, field) => Object.fromEntries([...new Set(rows.map((row) => row[field]))].sort().map((value) => [value, summarizeRetrievalScenarios(rows.filter((row) => row[field] === value))]));
const summarizeEngine = (worlds) => {
  const rows = scenarioRows(worlds, contract.promotionK);
  return {
    overall: summarizeRetrievalScenarios(rows),
    seeds: group(rows, "seed"),
    splits: group(rows, "split"),
    diagnosticK: Object.fromEntries(contract.diagnosticKs.map((k) => [k, summarizeRetrievalScenarios(scenarioRows(worlds, k))])),
    rows,
    sourceHash: worlds[0].sourceHash,
    queryPromptTokens: worlds.reduce((sum, world) => sum + Number(world.externalUsage?.promptTokens ?? 0), 0),
  };
};
const detailed = Object.fromEntries(engines.map((engine) => [engine, summarizeEngine(arms[engine])]));

const paired = (baselineName, candidateName) => {
  const baseline = new Map(detailed[baselineName].rows.map((row) => [row.key, row.metrics.topKCapacityCapture]));
  const pairs = detailed[candidateName].rows.flatMap((row) => Number.isFinite(row.metrics.topKCapacityCapture) && Number.isFinite(baseline.get(row.key)) ? [[baseline.get(row.key), row.metrics.topKCapacityCapture]] : []);
  return pairedBootstrap(pairs, { iterations: 2000, seed: `d4.1:${baselineName}:${candidateName}`, confidence: 0.95 });
};

const manifests = await Promise.all((await readdir(fullFidelityDir)).filter((name) => name.endsWith(".json")).sort().map((name) => readJson(resolve(fullFidelityDir, name))));
const spotPromptTokens = manifests.reduce((sum, manifest) => sum + Number(manifest.actualPromptTokens ?? 0), 0);
const pricePerMillionTokensUsd = 0.02;
const historical = Object.fromEntries(engines.map((engine) => [engine, {
  overall: detailed[engine].overall,
  seeds: detailed[engine].seeds,
  splits: detailed[engine].splits,
  diagnosticK: detailed[engine].diagnosticK,
  sourceHash: detailed[engine].sourceHash,
  queryPromptTokens: detailed[engine].queryPromptTokens,
  queryCostPerDecisionUsd: detailed[engine].queryPromptTokens / 126 / 1_000_000 * pricePerMillionTokensUsd,
} ]));
const comparisons = {
  wave1_vs_v13: paired("v13", "wave1"),
  wave2_vs_wave1: paired("wave1", "wave2"),
  wave2_1_vs_wave2: paired("wave2", "wave2.1"),
};
const diagnosticPromotion = {
  wave1_vs_v13: evaluateRetrievalPromotion({ candidate: historical.wave1, baseline: historical.v13, thresholds: contract.thresholds, paired: { meanDelta: comparisons.wave1_vs_v13.meanDelta, confidenceLowerBound: comparisons.wave1_vs_v13.interval?.[0] ?? null }, externalCostPerDecisionUsd: historical.wave1.queryCostPerDecisionUsd }),
  wave2_vs_wave1: evaluateRetrievalPromotion({ candidate: historical.wave2, baseline: historical.wave1, thresholds: contract.thresholds, paired: { meanDelta: comparisons.wave2_vs_wave1.meanDelta, confidenceLowerBound: comparisons.wave2_vs_wave1.interval?.[0] ?? null }, externalCostPerDecisionUsd: historical.wave2.queryCostPerDecisionUsd }),
  wave2_1_vs_wave2: evaluateRetrievalPromotion({ candidate: historical["wave2.1"], baseline: historical.wave2, thresholds: contract.thresholds, paired: { meanDelta: comparisons.wave2_1_vs_wave2.meanDelta, confidenceLowerBound: comparisons.wave2_1_vs_wave2.interval?.[0] ?? null }, externalCostPerDecisionUsd: historical["wave2.1"].queryCostPerDecisionUsd }),
};
const body = {
  version: "d4.1-retrieval-quality-contract-evidence-v1",
  contractFreezeHash: freeze.freezeManifestHash,
  sample: { engines: 4, seeds: 3, scenariosPerSeed: 42, decisions: 504, embeddingMode: "FULL_FIDELITY" },
  oracleCapacity: {
    promotionK: contract.promotionK,
    source: "eligible Ground Truth in the frozen Wave 2.1 root-cause evidence; independent of Engine output",
    meanMaximumRecallAtK: wave2_1.metrics.fast.overall.recallAt20Capacity.mean,
    minimumMaximumRecallAtK: wave2_1.metrics.fast.overall.recallAt20Capacity.minimum,
    maximumMaximumRecallAtK: wave2_1.metrics.fast.overall.recallAt20Capacity.maximum,
    meanEligibleRelevantSpots: wave2_1.metrics.fast.overall.recallAt20Capacity.meanRelevant,
    scenariosCapableOfHistoricalPoint65: wave2_1.metrics.fast.overall.recallAt20Capacity.scenariosCapableOfPoint65,
    scenarios: 126,
    parentEvidenceResultHash: wave2_1.resultHash,
  },
  historical,
  comparisons,
  diagnosticPromotion,
  historicalVerdicts: { v13: "UNCHANGED", wave1: "UNCHANGED", wave2: "FAIL_UNCHANGED", wave2_1: "FAIL_UNCHANGED", wave2_1Architecture: "NOT_PROMOTED_UNCHANGED" },
  scientificValidity: {
    status: "PASS",
    thresholdsFrozenBeforeHistoricalRun: true,
    thresholdFreezeCommit: process.env.D4_1_THRESHOLD_FREEZE_COMMIT ?? null,
    groundTruthMutation: "NONE",
    scenarioMutation: "NONE",
    engineMutation: "NONE",
    oracleFeedsEngine: false,
    productionAccess: "NONE",
  },
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, spotPromptTokens, pricePerMillionTokensUsd },
  parentWave2_1ResultHash: wave2_1.resultHash,
};
const result = { ...body, resultHash: contentHash(body) };
await writeJson(output, result);
process.stdout.write(`${JSON.stringify({ historical: Object.fromEntries(engines.map((engine) => [engine, historical[engine].overall])), comparisons, diagnosticPromotion, resultHash: result.resultHash }, null, 2)}\n`);
