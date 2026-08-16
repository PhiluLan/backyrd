#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputOption = option("input");
const fullFidelityOption = option("full-fidelity");
const queryCacheOption = option("query-cache");
const outputOption = option("output");
if (!inputOption || !fullFidelityOption || !queryCacheOption || !outputOption) throw new Error("--input, --full-fidelity, --query-cache and --output are required");
const input = resolve(repoRoot, inputOption);
const fullFidelityDir = resolve(repoRoot, fullFidelityOption);
const queryCache = resolve(repoRoot, queryCacheOption);
const output = resolve(repoRoot, outputOption);
const seeds = ["backyrd-d1-basel-v1-2026", "backyrd-d1-basel-v1-2026-2", "backyrd-d1-basel-v1-2026-3"];
const loadArm = async (mode, engine) => Promise.all(seeds.map((seed) => readJson(resolve(input, mode, engine, `${seed}.json`))));
const arms = {
  fast: { wave1: await loadArm("fast_simulation", "wave1"), wave2: await loadArm("fast_simulation", "wave2") },
  full: { wave1: await loadArm("full_fidelity", "wave1"), wave2: await loadArm("full_fidelity", "wave2") },
};
const records = (worlds) => worlds.flatMap((world) => world.records);
for (const worlds of Object.values(arms).flatMap((mode) => Object.values(mode))) {
  if (records(worlds).length !== 126) throw new Error("Wave 2 completeness failed");
  if (worlds.some((world) => world.preflight.scientificValidity !== "PASS")) throw new Error("Scientific Validity failed");
}
const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const quantile = (values, p) => { const rows = values.filter(Number.isFinite).sort((a, b) => a - b); return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null; };
const summarizeRows = (rows) => ({
  decisions: rows.length,
  goodOrBetterRecall: mean(rows.map((row) => row.retrieval.goodOrBetterRecall)),
  goodOrBetterRecallAt20: mean(rows.map((row) => row.retrieval.goodOrBetterRecallAt20)),
  goodOrBetterRecallAt50: mean(rows.map((row) => row.retrieval.goodOrBetterRecallAt50)),
  excellentFitRecall: mean(rows.map((row) => row.retrieval.excellentFitRecall)),
  excellentFitRecallAt20: mean(rows.map((row) => row.retrieval.excellentFitRecallAt20)),
  excellentFitRecallAt50: mean(rows.map((row) => row.retrieval.excellentFitRecallAt50)),
  bestAvailableRetrievalRate: mean(rows.map((row) => row.retrieval.bestAvailableRetrieved ? 1 : 0)),
  candidatePoolSize: mean(rows.map((row) => row.retrieval.candidatePoolSize)),
  retrievalCeiling: mean(rows.map((row) => row.retrieval.retrievalCeiling)),
  badSemanticMatchRate: (() => { const candidates = rows.reduce((sum, row) => sum + row.retrieval.semanticCandidates, 0); return candidates ? rows.reduce((sum, row) => sum + row.retrieval.badSemanticMatches, 0) / candidates : null; })(),
  semanticGoodOrBetterRecallAt20: mean(rows.map((row) => row.retrieval.semanticGoodOrBetterRecallAt20)),
  semanticGoodOrBetterRecallAt50: mean(rows.map((row) => row.retrieval.semanticGoodOrBetterRecallAt50)),
  semanticSimilarity: { min: Math.min(...rows.map((row) => row.retrieval.semanticSimilarity.min).filter(Number.isFinite)), mean: mean(rows.map((row) => row.retrieval.semanticSimilarity.mean)), max: Math.max(...rows.map((row) => row.retrieval.semanticSimilarity.max).filter(Number.isFinite)), normalizedSaturationRate: mean(rows.map((row) => row.retrieval.semanticSimilarity.normalizedSaturationRate)) },
  semanticUtilityRankCorrelation: mean(rows.map((row) => row.retrieval.semanticUtilityRankCorrelation)),
  noResultRate: rows.length ? rows.filter((row) => row.finalTopK.length === 0).length / rows.length : null,
  starvationRate: rows.length ? rows.filter((row) => row.finalTopK.length < 10).length / rows.length : null,
  hardConstraintFailures: rows.filter((row) => !row.hardConstraintResult.pass).length,
  ndcgAt10: mean(rows.map((row) => row.metrics.ranking.ndcgAt10)),
  precisionAt10: mean(rows.map((row) => row.metrics.ranking.precisionAt10)),
  latencyMs: { median: quantile(rows.map((row) => row.latencyMs), 0.5), p95: quantile(rows.map((row) => row.latencyMs), 0.95), max: quantile(rows.map((row) => row.latencyMs), 1) },
});
const grouped = (rows, key) => Object.fromEntries([...new Set(rows.map(key))].sort().map((value) => [value, summarizeRows(rows.filter((row) => key(row) === value))]));
const sourceContribution = (rows) => {
  const sources = [...new Set(rows.flatMap((row) => Object.keys(row.retrieval.sourceContribution)))].sort();
  return Object.fromEntries(sources.map((source) => [source, rows.reduce((total, row) => {
    const value = row.retrieval.sourceContribution[source] ?? {};
    return { candidates: total.candidates + (value.candidates ?? 0), useful: total.useful + (value.useful ?? 0), uniqueUseful: total.uniqueUseful + (value.uniqueUseful ?? 0) };
  }, { candidates: 0, useful: 0, uniqueUseful: 0 })]));
};
const summarize = (worlds) => {
  const rows = records(worlds);
  return {
    overall: summarizeRows(rows),
    seeds: grouped(rows, (row) => row.seed),
    splits: grouped(rows, (row) => row.split),
    categories: grouped(rows, (row) => row.retrieval.scenarioCategory ?? "none"),
    contexts: grouped(rows, (row) => `${row.contextClass.audience}:${row.contextClass.timeBucket}:${row.contextClass.weather}`),
    densities: grouped(rows, (row) => row.retrieval.scenarioDensity ?? "unknown"),
    maturity: grouped(rows, (row) => row.maturity),
    sourceContribution: sourceContribution(rows),
  };
};
const metrics = {
  fast: { wave1: summarize(arms.fast.wave1), wave2: summarize(arms.fast.wave2) },
  full: { wave1: summarize(arms.full.wave1), wave2: summarize(arms.full.wave2) },
};
const seedImproves = (mode) => seeds.every((seed) => metrics[mode].wave2.seeds[seed].goodOrBetterRecallAt20 > metrics[mode].wave1.seeds[seed].goodOrBetterRecallAt20);
const holdoutImproves = (mode) => metrics[mode].wave2.splits.LOCKED_HOLDOUT.goodOrBetterRecallAt20 > metrics[mode].wave1.splits.LOCKED_HOLDOUT.goodOrBetterRecallAt20;
const fullRows = records(arms.full.wave2);
const missRows = fullRows.flatMap((row) => row.retrieval.missed.map((miss) => ({ scenarioId: row.scenarioId, seed: row.seed, split: row.split, ...miss })));
const gapCounts = Object.fromEntries(["ENGINE_RETRIEVAL_FAILURE", "SPOT_DATA_LIMITATION", "BOTH", "UNKNOWN"].map((key) => [key, missRows.filter((row) => row.classification === key).length]));
const fullManifests = await Promise.all((await readdir(fullFidelityDir)).filter((name) => name.endsWith(".json")).sort().map((name) => readJson(resolve(fullFidelityDir, name))));
const queryPromptTokens = Object.values(arms.full).flat().reduce((sum, world) => sum + Number(world.externalUsage?.promptTokens ?? 0), 0);
const spotPromptTokens = fullManifests.reduce((sum, manifest) => sum + Number(manifest.actualPromptTokens ?? 0), 0);
const externalCostUsd = (queryPromptTokens + spotPromptTokens) / 1_000_000 * 0.02;
const queryCacheHash = createHash("sha256").update(await readFile(queryCache)).digest("hex");
const semanticContribution = metrics.full.wave2.sourceContribution.semantic_v13 ?? { candidates: 0, useful: 0, uniqueUseful: 0 };
const semanticUsefulRate = semanticContribution.useful / Math.max(1, semanticContribution.candidates);
const semanticBadRate = metrics.full.wave2.overall.badSemanticMatchRate;
const semanticClassification = semanticContribution.candidates === 0
  ? "INCONCLUSIVE"
  : metrics.full.wave2.overall.semanticGoodOrBetterRecallAt20 >= 0.65 && semanticBadRate <= 0.2 && semanticContribution.uniqueUseful > 0
    ? "KEEP"
    : semanticContribution.uniqueUseful > 0 || semanticUsefulRate >= 0.25
      ? "HARDEN"
      : semanticContribution.useful === 0 && semanticBadRate >= 0.8
        ? "REPLACE"
        : "REFACTOR";
const wave2Rows = [...records(arms.fast.wave2), ...records(arms.full.wave2)];
const productFailures = wave2Rows.reduce((sum, row) => sum + row.hardConstraintResult.results.filter((gate) => gate.gateId === "PRODUCT_ELIGIBILITY" && gate.status === "FAIL").length, 0);
const distributionFailures = wave2Rows.reduce((sum, row) => sum + row.hardConstraintResult.results.filter((gate) => gate.gateId === "DISTRIBUTION_ELIGIBILITY" && gate.status === "FAIL").length, 0);
const userConstraintFailures = wave2Rows.reduce((sum, row) => sum + row.hardConstraintResult.results.filter((gate) => ["HARD_CATEGORY", "CATEGORY_EXCLUSION", "OPEN_NOW"].includes(gate.gateId) && gate.status === "FAIL").length, 0);
const sourceHashes = {
  wave1: arms.fast.wave1[0].engine.sourceHash,
  wave2: arms.fast.wave2[0].engine.sourceHash,
  v13: arms.fast.wave2[0].engine.parentV13SourceHash,
};
const result = {
  version: "wave2-retrieval-spot-intelligence-v1",
  sampleSizes: { modes: 2, engines: 2, seeds: 3, scenariosPerSeed: 42, decisionsPerArm: 126, totalDecisions: 504 },
  frozenIdentities: { d2_1: arms.fast.wave2[0].preflight.identities.parentFreezeManifestHash, d2_2: arms.fast.wave2[0].preflight.identities.personalizationTreatmentFreezeHash },
  sourceHashes,
  metrics,
  semantic: { classification: semanticClassification, fullFidelitySourceContribution: semanticContribution, fastSimulation: metrics.fast.wave2.overall, fullFidelity: metrics.full.wave2.overall },
  spotIntelligenceGaps: { counts: gapCounts, records: missRows.slice(0, 200) },
  integrity: { productFailures, distributionFailures, userConstraintFailures, scientificValidity: "PASS", productionAccess: "NONE" },
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, spotPromptTokens, queryPromptTokens, queryCacheHash, pricePerMillionTokensUsd: 0.02, estimatedCostUsd: externalCostUsd, capUsdPerSeed: 1 },
  promotion: {
    fastImprovesAllSeeds: seedImproves("fast"), fullImprovesAllSeeds: seedImproves("full"),
    fastHoldoutImproves: holdoutImproves("fast"), fullHoldoutImproves: holdoutImproves("full"),
    fullRecallFloor: metrics.full.wave2.overall.goodOrBetterRecallAt20 >= 0.65,
    noIntegrityRegression: productFailures === 0 && distributionFailures === 0 && userConstraintFailures === 0,
    noHarmfulAvailabilityRegression: metrics.full.wave2.overall.noResultRate <= metrics.full.wave1.overall.noResultRate + 0.05 && metrics.full.wave2.overall.starvationRate <= metrics.full.wave1.overall.starvationRate + 0.1,
    semanticClassified: ["KEEP", "HARDEN", "REFACTOR", "REPLACE"].includes(semanticClassification),
    costWithinCap: externalCostUsd < 3,
  },
};
result.retrievalQuality = result.promotion.fastImprovesAllSeeds && result.promotion.fullImprovesAllSeeds && result.promotion.fastHoldoutImproves && result.promotion.fullHoldoutImproves ? "IMPROVED" : "NOT_IMPROVED";
result.verdict = Object.values(result.promotion).every(Boolean) && result.retrievalQuality === "IMPROVED" ? "PASS" : "FAIL";
result.sourceArtifactHash = createHash("sha256").update(await readFile(new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url))).digest("hex");
result.resultHash = contentHash(result);
await writeJson(output, result);
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, retrievalQuality: result.retrievalQuality, semantic: result.semantic.classification, promotion: result.promotion, metrics: { wave1Full: metrics.full.wave1.overall, wave2Full: metrics.full.wave2.overall }, externalCostUsd }, null, 2)}\n`);
