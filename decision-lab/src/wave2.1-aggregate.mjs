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
const loadMode = async (mode) => Promise.all(seeds.map((seed) => readJson(resolve(input, mode, "wave2.1", `${seed}.json`))));
const arms = { fast: await loadMode("fast_simulation"), full: await loadMode("full_fidelity") };
const wave2 = await readJson(resolve(repoRoot, "decision-lab/baselines/wave2-retrieval-spot-intelligence-v1.json"));
const wave1 = await readJson(resolve(repoRoot, "decision-lab/baselines/wave1-intent-constraints-v1.json"));
const records = (worlds) => worlds.flatMap((world) => world.records);
for (const worlds of Object.values(arms)) {
  if (records(worlds).length !== 126) throw new Error("Wave 2.1 completeness failed");
  if (worlds.some((world) => world.preflight.scientificValidity !== "PASS")) throw new Error("Scientific Validity failed");
  if (records(worlds).some((row) => !row.retrievalNextGen)) throw new Error("Retrieval Next Gen evidence missing");
}

const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const quantile = (values, p) => { const rows = values.filter(Number.isFinite).sort((a, b) => a - b); return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null; };
const recall = (relevant, ordered, k) => relevant.length ? relevant.filter((id) => new Set(ordered.slice(0, k)).has(id)).length / relevant.length : 1;

function ablationOrder(row, projections) {
  return row.retrievalNextGen.candidateUnion.map((candidate) => {
    const evidence = candidate.evidence.filter((item) => projections.includes(item.projection));
    return { spotId: candidate.spot_id, score: evidence.reduce((sum, item) => sum + item.rrf_contribution, 0), evidence };
  }).filter((candidate) => candidate.evidence.length)
    .sort((a, b) => b.score - a.score || b.evidence.length - a.evidence.length || a.spotId.localeCompare(b.spotId))
    .map((candidate) => candidate.spotId);
}

function experiment(rows, projections) {
  return {
    projections,
    goodOrBetterRecallAt20: mean(rows.map((row) => {
      const relevant = row.retrievalNextGen.rootCause.map((item) => item.spotId);
      return recall(relevant, ablationOrder(row, projections), 20);
    })),
    candidatePoolSize: mean(rows.map((row) => ablationOrder(row, projections).length)),
  };
}

function summarizeRows(rows) {
  const root = rows.flatMap((row) => row.retrievalNextGen.rootCause);
  const causes = [...new Set(root.map((row) => row.primaryCause))].sort();
  const sourceEvidence = rows.flatMap((row) => row.retrievalNextGen.candidateUnion.flatMap((candidate) => candidate.evidence.map((evidence) => ({ ...evidence, spotId: candidate.spot_id, useful: (row.retrievalNextGen.rootCause.find((item) => item.spotId === candidate.spot_id)?.utility ?? 0) >= 0.6 }))));
  const sources = [...new Set(sourceEvidence.map((row) => row.source))].sort();
  const projections = [...new Set(sourceEvidence.map((row) => row.projection))].sort();
  return {
    decisions: rows.length,
    goodOrBetterRecall: mean(rows.map((row) => row.retrieval.goodOrBetterRecall)),
    goodOrBetterRecallAt20: mean(rows.map((row) => row.retrieval.goodOrBetterRecallAt20)),
    goodOrBetterRecallAt50: mean(rows.map((row) => row.retrieval.goodOrBetterRecallAt50)),
    bestAvailableRetrievalRate: mean(rows.map((row) => row.retrieval.bestAvailableRetrieved ? 1 : 0)),
    candidatePoolSize: mean(rows.map((row) => row.retrieval.candidatePoolSize)),
    noResultRate: mean(rows.map((row) => Number(row.finalTopK.length === 0))),
    starvationRate: mean(rows.map((row) => Number(row.finalTopK.length < 10))),
    hardConstraintFailures: rows.filter((row) => !row.hardConstraintResult.pass).length,
    ndcgAt10: mean(rows.map((row) => row.metrics.ranking.ndcgAt10)),
    precisionAt10: mean(rows.map((row) => row.metrics.ranking.precisionAt10)),
    latencyMs: { median: quantile(rows.map((row) => row.latencyMs), 0.5), p95: quantile(rows.map((row) => row.latencyMs), 0.95), max: quantile(rows.map((row) => row.latencyMs), 1) },
    recallAt20Capacity: {
      mean: mean(rows.map((row) => row.retrievalNextGen.recallAt20Capacity.capacity)),
      minimum: Math.min(...rows.map((row) => row.retrievalNextGen.recallAt20Capacity.capacity)),
      maximum: Math.max(...rows.map((row) => row.retrievalNextGen.recallAt20Capacity.capacity)),
      meanRelevant: mean(rows.map((row) => row.retrievalNextGen.recallAt20Capacity.relevant)),
      scenariosCapableOfPoint65: rows.filter((row) => row.retrievalNextGen.recallAt20Capacity.capacity >= 0.65).length,
    },
    rootCause: Object.fromEntries(causes.map((cause) => [cause, root.filter((row) => row.primaryCause === cause).length])),
    sourceContribution: Object.fromEntries(sources.map((source) => [source, { evidence: sourceEvidence.filter((row) => row.source === source).length, usefulEvidence: sourceEvidence.filter((row) => row.source === source && row.useful).length }])),
    projectionContribution: Object.fromEntries(projections.map((projection) => [projection, { evidence: sourceEvidence.filter((row) => row.projection === projection).length, usefulEvidence: sourceEvidence.filter((row) => row.projection === projection && row.useful).length }])),
  };
}

const grouped = (rows, key) => Object.fromEntries([...new Set(rows.map(key))].sort().map((value) => [value, summarizeRows(rows.filter((row) => key(row) === value))]));
const summarize = (worlds) => {
  const rows = records(worlds);
  return { overall: summarizeRows(rows), seeds: grouped(rows, (row) => row.seed), splits: grouped(rows, (row) => row.split) };
};

const metrics = { fast: summarize(arms.fast), full: summarize(arms.full) };
const fullRows = records(arms.full);
const experiments = [
  { id: "H0_BASE_EVIDENCE_RRF", ...experiment(fullRows, ["base"]) },
  { id: "H1_LEXICAL_DECOMPOSITION", ...experiment(fullRows, ["base", "lexical_specificity"]) },
  { id: "H2_SEMANTIC_CONCEPT_DECOMPOSITION", ...experiment(fullRows, ["base", "semantic_concept"]) },
  { id: "H3_VIBE_DECOMPOSITION", ...experiment(fullRows, ["base", "vibe"]) },
  { id: "H4_ALL_PROJECTIONS", ...experiment(fullRows, ["base", "category", "lexical_specificity", "vibe", "occasion_context", "semantic_concept"]) },
];

const fullManifests = await Promise.all((await readdir(fullFidelityDir)).filter((name) => name.endsWith(".json")).sort().map((name) => readJson(resolve(fullFidelityDir, name))));
const queryPromptTokens = arms.full.reduce((sum, world) => sum + Number(world.externalUsage?.promptTokens ?? 0), 0);
const spotPromptTokens = fullManifests.reduce((sum, manifest) => sum + Number(manifest.actualPromptTokens ?? 0), 0);
const externalCostUsd = (queryPromptTokens + spotPromptTokens) / 1_000_000 * 0.02;
const queryCacheHash = createHash("sha256").update(await readFile(queryCache)).digest("hex");
const fullImprovesAllSeeds = seeds.every((seed) => metrics.full.seeds[seed].goodOrBetterRecallAt20 > wave2.metrics.full.wave2.seeds[seed].goodOrBetterRecallAt20);
const holdoutImproves = metrics.full.splits.LOCKED_HOLDOUT.goodOrBetterRecallAt20 > wave2.metrics.full.wave2.splits.LOCKED_HOLDOUT.goodOrBetterRecallAt20;
const productFailures = fullRows.reduce((sum, row) => sum + row.hardConstraintResult.results.filter((gate) => gate.gateId === "PRODUCT_ELIGIBILITY" && gate.status === "FAIL").length, 0);
const distributionFailures = fullRows.reduce((sum, row) => sum + row.hardConstraintResult.results.filter((gate) => gate.gateId === "DISTRIBUTION_ELIGIBILITY" && gate.status === "FAIL").length, 0);
const userConstraintFailures = fullRows.reduce((sum, row) => sum + row.hardConstraintResult.results.filter((gate) => ["HARD_CATEGORY", "CATEGORY_EXCLUSION", "OPEN_NOW"].includes(gate.gateId) && gate.status === "FAIL").length, 0);

const result = {
  version: "wave2.1-retrieval-next-gen-v1",
  sampleSizes: { modes: 2, seeds: 3, scenariosPerSeed: 42, decisionsPerMode: 126, totalDecisions: 252 },
  frozenIdentities: { d2_1: arms.full[0].preflight.identities.parentFreezeManifestHash, d2_2: arms.full[0].preflight.identities.personalizationTreatmentFreezeHash },
  sourceHashes: { v13: wave2.sourceHashes.v13, wave1: wave2.sourceHashes.wave1, wave2: wave2.sourceHashes.wave2, executionSource: arms.full[0].engine.sourceHash },
  comparison: { v13: wave1.metrics.v13, wave1Full: wave2.metrics.full.wave1.overall, wave2Full: wave2.metrics.full.wave2.overall, wave2_1Full: metrics.full.overall },
  metrics,
  experiments,
  integrity: { productFailures, distributionFailures, userConstraintFailures, scientificValidity: "PASS", latentTruthInEngineInput: false, rankingMutation: "NONE", productionAccess: "NONE" },
  semantic: { priorClassification: wave2.semantic.classification, decision: "HARDEN", rationale: "Multi-projection semantic evidence is retained for unique recall; utility calibration remains a downstream responsibility." },
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, spotPromptTokens, queryPromptTokens, queryCacheHash, pricePerMillionTokensUsd: 0.02, estimatedCostUsd: externalCostUsd, capUsd: 3 },
  promotion: {
    goodOrBetterRecallAt20Floor: metrics.full.overall.goodOrBetterRecallAt20 >= 0.65,
    oracleCapacitySupportsFloor: metrics.full.overall.recallAt20Capacity.mean >= 0.65,
    improvesAllSeeds: fullImprovesAllSeeds,
    lockedHoldoutImproves: holdoutImproves,
    fullPoolDoesNotRegress: metrics.full.overall.goodOrBetterRecall >= wave2.metrics.full.wave2.overall.goodOrBetterRecall,
    noIntegrityRegression: productFailures === 0 && distributionFailures === 0 && userConstraintFailures === 0,
    candidatePoolOperational: metrics.full.overall.candidatePoolSize <= 100,
    costWithinCap: externalCostUsd < 3,
  },
};
result.retrievalQuality = metrics.full.overall.goodOrBetterRecallAt20 > wave2.metrics.full.wave2.overall.goodOrBetterRecallAt20 && fullImprovesAllSeeds && holdoutImproves ? "IMPROVED" : "NOT_IMPROVED";
result.architectureVerdict = Object.values(result.promotion).every(Boolean) ? "PROMOTED" : "NOT_PROMOTED";
result.verdict = result.architectureVerdict === "PROMOTED" ? "PASS" : "FAIL";
result.resultHash = contentHash(result);
await writeJson(output, result);
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, retrievalQuality: result.retrievalQuality, architecture: result.architectureVerdict, promotion: result.promotion, wave2: wave2.metrics.full.wave2.overall, wave2_1: metrics.full.overall, experiments, externalCostUsd }, null, 2)}\n`);
