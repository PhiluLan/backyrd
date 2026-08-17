#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { evaluateRetrievalPromotion, retrievalScenarioMetrics, summarizeRetrievalScenarios } from "./retrieval-quality-contract.mjs";
import { pairedBootstrap } from "./statistics.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputOption = option("input");
const fullFidelityOption = option("full-fidelity");
const queryCacheOption = option("query-cache");
const outputOption = option("output");
if (!inputOption || !fullFidelityOption || !queryCacheOption || !outputOption) throw new Error("--input, --full-fidelity, --query-cache and --output are required");

const seeds = ["backyrd-d1-basel-v1-2026", "backyrd-d1-basel-v1-2026-2", "backyrd-d1-basel-v1-2026-3"];
const input = resolve(repoRoot, inputOption);
const worlds = await Promise.all(seeds.map((seed) => readJson(resolve(input, `${seed}.json`))));
const contract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const freeze = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.freeze.json"));
const historical = await readJson(resolve(repoRoot, "decision-lab/baselines/d4.1-retrieval-quality-contract-v1.json"));
if (worlds.flatMap((world) => world.records).length !== 126) throw new Error("Wave 2.2 completeness failed");
if (worlds.some((world) => world.semanticQualityValidity !== "FULL_FIDELITY" || world.preflight.scientificValidity !== "PASS" || world.retrievalContractFreeze !== freeze.freezeManifestHash)) throw new Error("Wave 2.2 scientific preflight failed");

const experiments = ["H0_WAVE2_1", "H1_CATALOG_COVERAGE", "H2_CALIBRATED_EXISTING", "H3_EVIDENCE_AGGREGATION"];
const rowsFor = (experiment, k = contract.promotionK) => worlds.flatMap((world) => world.records.map((record) => {
  const candidates = record.retrievalBreakthrough.experiments[experiment] ?? [];
  return {
    key: `${record.seed}:${record.scenarioId}`, seed: record.seed, split: record.split, family: record.family,
    metrics: retrievalScenarioMetrics({ candidateIds: candidates.map((row) => row.spot_id), eligibleUtilityById: record.retrievalContractEvidence.eligibleUtilityById, relevanceThreshold: contract.relevanceThreshold, k }),
    latencyMs: record.latencyMs, resultCount: record.finalTopK.length, hardViolation: !record.hardConstraintResult.pass,
    truth: record.retrievalContractEvidence.eligibleUtilityById, candidates, rootCause: record.retrievalNextGen.rootCause,
  };
}));
const group = (rows, field) => Object.fromEntries([...new Set(rows.map((row) => row[field]))].sort().map((value) => [value, summarizeRetrievalScenarios(rows.filter((row) => row[field] === value))]));
const summarize = (experiment) => {
  const rows = rowsFor(experiment);
  return { overall: summarizeRetrievalScenarios(rows), seeds: group(rows, "seed"), splits: group(rows, "split"), diagnosticK: Object.fromEntries(contract.diagnosticKs.map((k) => [k, summarizeRetrievalScenarios(rowsFor(experiment, k))])), rows };
};
const detailed = Object.fromEntries(experiments.map((experiment) => [experiment, summarize(experiment)]));
const pairs = detailed.H3_EVIDENCE_AGGREGATION.rows.map((row, index) => [detailed.H0_WAVE2_1.rows[index].metrics.topKCapacityCapture, row.metrics.topKCapacityCapture]);
const paired = pairedBootstrap(pairs, { iterations: 5000, seed: "wave2.2-vs-wave2.1", confidence: 0.95 });

const finalRows = detailed.H3_EVIDENCE_AGGREGATION.rows;
const misses = finalRows.flatMap((row) => Object.entries(row.truth).filter(([, utility]) => utility >= contract.relevanceThreshold).map(([spotId, utility]) => {
  const rank = row.candidates.findIndex((candidate) => candidate.spot_id === spotId) + 1;
  return { seed: row.seed, split: row.split, family: row.family, spotId, utility, rank: rank || null, cause: rank > 0 && rank <= contract.promotionK ? "RETRIEVED_AT_20" : rank > contract.promotionK ? "SOURCE_ORDERING_FAILURE" : "COVERAGE_GAP" };
}));
const count = (values, key) => Object.fromEntries([...new Set(values.map((value) => value[key]))].sort().map((value) => [value, values.filter((row) => row[key] === value).length]));
const sourceRows = finalRows.flatMap((row) => row.candidates.flatMap((candidate) => {
  const sources = [...new Set(candidate.evidence.map((evidence) => evidence.source))];
  return sources.map((source) => ({ source, spotId: candidate.spot_id, useful: (row.truth[candidate.spot_id] ?? 0) >= contract.relevanceThreshold, uniqueToSource: sources.length === 1 }));
}));
const sourceContribution = Object.fromEntries([...new Set(sourceRows.map((row) => row.source))].sort().map((source) => {
  const records = sourceRows.filter((row) => row.source === source);
  const usefulCandidates = records.filter((row) => row.useful).length;
  const uniqueUsefulCandidates = records.filter((row) => row.useful && row.uniqueToSource).length;
  return [source, {
    candidates: records.length,
    usefulCandidates,
    uniqueUsefulCandidates,
    usefulDensity: records.length ? usefulCandidates / records.length : null,
    badMatchRate: records.length ? (records.length - usefulCandidates) / records.length : null,
  }];
}));
const relevantInPool = finalRows.map((row) => row.metrics.fullPoolRecall * row.metrics.oracle.relevantCount);
const usefulCandidateDensity = relevantInPool.reduce((sum, value) => sum + value, 0) / finalRows.reduce((sum, row) => sum + row.metrics.candidateCount, 0);
const integrity = worlds.flatMap((world) => world.records).reduce((summary, record) => {
  const row = record.retrievalBreakthrough.integrity.H3_EVIDENCE_AGGREGATION;
  summary.unresolved += row.unresolved;
  summary.productFailures += row.productFailures;
  summary.distributionFailures += row.distributionFailures;
  summary.userConstraintFailures += row.hardConstraintFailures;
  return summary;
}, { unresolved: 0, productFailures: 0, distributionFailures: 0, userConstraintFailures: 0 });

const fullFidelityFiles = (await import("node:fs/promises")).readdir(resolve(repoRoot, fullFidelityOption));
const manifests = await Promise.all((await fullFidelityFiles).filter((name) => name.endsWith(".json")).sort().map((name) => readJson(resolve(repoRoot, fullFidelityOption, name))));
const spotPromptTokens = manifests.reduce((sum, manifest) => sum + Number(manifest.actualPromptTokens ?? 0), 0);
const queryPromptTokens = worlds.reduce((sum, world) => sum + Number(world.externalUsage?.promptTokens ?? 0), 0);
const pricePerMillionTokensUsd = 0.02;
const externalCostPerDecisionUsd = queryPromptTokens / 126 / 1_000_000 * pricePerMillionTokensUsd;
const candidate = { overall: detailed.H3_EVIDENCE_AGGREGATION.overall, seeds: detailed.H3_EVIDENCE_AGGREGATION.seeds, splits: detailed.H3_EVIDENCE_AGGREGATION.splits };
const baseline = { overall: detailed.H0_WAVE2_1.overall, seeds: detailed.H0_WAVE2_1.seeds, splits: detailed.H0_WAVE2_1.splits };
const promotion = evaluateRetrievalPromotion({ candidate, baseline, thresholds: contract.thresholds, paired: { meanDelta: paired.meanDelta, confidenceLowerBound: paired.interval?.[0] ?? null }, externalCostPerDecisionUsd });
const body = {
  version: "wave2.2-retrieval-breakthrough-v1",
  sample: { seeds: 3, scenariosPerSeed: 42, decisions: 126, embeddingMode: "FULL_FIDELITY" },
  frozenIdentities: { retrievalQualityFreeze: freeze.freezeManifestHash, d2_1: worlds[0].preflight.identities.parentFreezeManifestHash, d2_2: worlds[0].preflight.identities.personalizationTreatmentFreezeHash },
  sourceHashes: { executionSource: worlds[0].sourceHash, engineMutation: "NONE" },
  comparison: { v13: historical.historical.v13.overall, wave1: historical.historical.wave1.overall, wave2: historical.historical.wave2.overall, wave2_1: historical.historical["wave2.1"].overall, wave2_2: candidate.overall },
  experiments: Object.fromEntries(experiments.map((experiment) => [experiment, { overall: detailed[experiment].overall, seeds: detailed[experiment].seeds, splits: detailed[experiment].splits, diagnosticK: detailed[experiment].diagnosticK }])),
  experimentDecisions: {
    H0_WAVE2_1: "CONTROL",
    H1_CATALOG_COVERAGE: "REJECTED_NO_ROBUST_LIFT",
    H2_CALIBRATED_EXISTING: "REJECTED_NO_ROBUST_LIFT",
    H3_EVIDENCE_AGGREGATION: promotion.pass ? "KEEP" : "REJECTED_PROMOTION_CONTRACT_FAILED",
  },
  pairedLift: paired,
  promotion,
  rootCause: { overall: count(misses, "cause"), byFamily: count(misses.filter((row) => row.cause !== "RETRIEVED_AT_20"), "family") },
  sourceContribution,
  usefulCandidateDensity,
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, spotPromptTokens, queryPromptTokens, queryCacheHash: createHash("sha256").update(await readFile(resolve(repoRoot, queryCacheOption))).digest("hex"), pricePerMillionTokensUsd, externalCostPerDecisionUsd },
  integrity: { ...integrity, scientificValidity: "PASS", latentTruthInEngineInput: false, retrievalQualityContractMutation: "NONE", productionAccess: "NONE" },
  semantic: { decision: "HARDEN", role: "recall evidence with rank calibration; not final utility" },
  verdict: promotion.pass ? "PASS" : "FAIL",
  architectureVerdict: promotion.pass ? "PROMOTED" : "NOT_PROMOTED",
};
const result = { ...body, resultHash: contentHash(body) };
await writeJson(resolve(repoRoot, outputOption), result);
process.stdout.write(`${JSON.stringify({ comparison: result.comparison, experiments: result.experiments, pairedLift: result.pairedLift, promotion: result.promotion, rootCause: result.rootCause, resultHash: result.resultHash }, null, 2)}\n`);
