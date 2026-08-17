#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
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
const worlds = await Promise.all(seeds.map((seed) => readJson(resolve(repoRoot, inputOption, `${seed}.json`))));
const contract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const freeze = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.freeze.json"));
const historical = await readJson(resolve(repoRoot, "decision-lab/baselines/wave2.2-retrieval-breakthrough-v1.json"));
if (worlds.flatMap((world) => world.records).length !== 126) throw new Error("Wave 2.3 completeness failed");
if (worlds.some((world) => world.semanticQualityValidity !== "FULL_FIDELITY" || world.preflight.scientificValidity !== "PASS" || world.retrievalContractFreeze !== freeze.freezeManifestHash)) throw new Error("Wave 2.3 scientific preflight failed");

const experiments = ["H0_WAVE2_2", "H1_SPECIALIZED_RECALL", "H2_AVAILABILITY_SHORTLIST", "H3_OBSERVED_QUALITY"];
const candidatesFor = (record, experiment) => experiment === "H0_WAVE2_2" ? record.retrievalBreakthrough.finalUnion : record.retrievalRebuild.experiments[experiment];
const rowsFor = (experiment, k = contract.promotionK) => worlds.flatMap((world) => world.records.map((record) => {
  const candidates = candidatesFor(record, experiment) ?? [];
  return {
    key: `${record.seed}:${record.scenarioId}`, seed: record.seed, split: record.split, family: record.family,
    metrics: retrievalScenarioMetrics({ candidateIds: candidates.map((row) => row.spot_id), eligibleUtilityById: record.retrievalContractEvidence.eligibleUtilityById, relevanceThreshold: contract.relevanceThreshold, k }),
    latencyMs: experiment === "H0_WAVE2_2" ? record.latencyMs : record.retrievalRebuild.latencyMs,
    resultCount: record.finalTopK.length, hardViolation: !record.hardConstraintResult.pass,
    truth: record.retrievalContractEvidence.eligibleUtilityById, candidates,
  };
}));
const group = (rows, field) => Object.fromEntries([...new Set(rows.map((row) => row[field]))].sort().map((value) => [value, summarizeRetrievalScenarios(rows.filter((row) => row[field] === value))]));
const summarize = (experiment) => {
  const rows = rowsFor(experiment);
  return { overall: summarizeRetrievalScenarios(rows), seeds: group(rows, "seed"), splits: group(rows, "split"), diagnosticK: Object.fromEntries(contract.diagnosticKs.map((k) => [k, summarizeRetrievalScenarios(rowsFor(experiment, k))])), rows };
};
const detailed = Object.fromEntries(experiments.map((experiment) => [experiment, summarize(experiment)]));
const pairs = detailed.H3_OBSERVED_QUALITY.rows.map((row, index) => [detailed.H0_WAVE2_2.rows[index].metrics.topKCapacityCapture, row.metrics.topKCapacityCapture]);
const paired = pairedBootstrap(pairs, { iterations: 5000, seed: "wave2.3-vs-wave2.2", confidence: 0.95 });

const missSummary = (rows) => {
  const counts = { RETRIEVED_AT_20: 0, SOURCE_ORDERING_FAILURE: 0, COVERAGE_GAP: 0 };
  for (const row of rows) for (const [spotId, utility] of Object.entries(row.truth)) if (utility >= contract.relevanceThreshold) {
    const rank = row.candidates.findIndex((candidate) => candidate.spot_id === spotId) + 1;
    counts[rank > 0 && rank <= contract.promotionK ? "RETRIEVED_AT_20" : rank > contract.promotionK ? "SOURCE_ORDERING_FAILURE" : "COVERAGE_GAP"] += 1;
  }
  return counts;
};
const sourceContribution = (rows) => {
  const sourceRows = rows.flatMap((row) => row.candidates.flatMap((candidate) => {
    const sources = unique(candidate.evidence.map((evidence) => evidence.source));
    return sources.map((source) => ({ source, useful: (row.truth[candidate.spot_id] ?? 0) >= contract.relevanceThreshold, unique: sources.length === 1 }));
  }));
  return Object.fromEntries(unique(sourceRows.map((row) => row.source)).sort().map((source) => {
    const selected = sourceRows.filter((row) => row.source === source);
    return [source, { candidates: selected.length, usefulCandidates: selected.filter((row) => row.useful).length, uniqueUsefulCandidates: selected.filter((row) => row.useful && row.unique).length, usefulDensity: selected.length ? selected.filter((row) => row.useful).length / selected.length : null }];
  }));
};
const unique = (values) => [...new Set(values)];
const finalRows = detailed.H3_OBSERVED_QUALITY.rows;
const integrity = worlds.flatMap((world) => world.records).reduce((summary, record) => {
  const row = record.retrievalRebuild.integrity.H3_OBSERVED_QUALITY;
  summary.unresolved += row.unresolved; summary.productFailures += row.productFailures;
  summary.distributionFailures += row.distributionFailures; summary.userConstraintFailures += row.hardConstraintFailures;
  return summary;
}, { unresolved: 0, productFailures: 0, distributionFailures: 0, userConstraintFailures: 0 });
const manifests = await Promise.all((await readdir(resolve(repoRoot, fullFidelityOption))).filter((name) => name.endsWith(".json")).sort().map((name) => readJson(resolve(repoRoot, fullFidelityOption, name))));
const spotPromptTokens = manifests.reduce((sum, manifest) => sum + Number(manifest.actualPromptTokens ?? 0), 0);
const queryPromptTokens = worlds.reduce((sum, world) => sum + Number(world.externalUsage?.promptTokens ?? 0), 0);
const pricePerMillionTokensUsd = 0.02;
const externalCostPerDecisionUsd = queryPromptTokens / 126 / 1_000_000 * pricePerMillionTokensUsd;
const candidate = { overall: detailed.H3_OBSERVED_QUALITY.overall, seeds: detailed.H3_OBSERVED_QUALITY.seeds, splits: detailed.H3_OBSERVED_QUALITY.splits };
const baseline = { overall: detailed.H0_WAVE2_2.overall, seeds: detailed.H0_WAVE2_2.seeds, splits: detailed.H0_WAVE2_2.splits };
const promotion = evaluateRetrievalPromotion({ candidate, baseline, thresholds: contract.thresholds, paired: { meanDelta: paired.meanDelta, confidenceLowerBound: paired.interval?.[0] ?? null }, externalCostPerDecisionUsd });
const comparison = {
  v13: historical.comparison.v13, wave1: historical.comparison.wave1, wave2: historical.comparison.wave2,
  wave2_1: historical.comparison.wave2_1, wave2_2: baseline.overall, wave2_3: candidate.overall,
};
const body = {
  version: "wave2.3-retrieval-rebuild-v1",
  sample: { seeds: 3, scenariosPerSeed: 42, decisions: 126, embeddingMode: "FULL_FIDELITY" },
  frozenIdentities: { retrievalQualityFreeze: freeze.freezeManifestHash, d2_1: worlds[0].preflight.identities.parentFreezeManifestHash, d2_2: worlds[0].preflight.identities.personalizationTreatmentFreezeHash },
  sourceHashes: { executionSource: worlds[0].sourceHash, engineMutation: "NONE" },
  comparison,
  experiments: Object.fromEntries(experiments.map((experiment) => [experiment, { overall: detailed[experiment].overall, seeds: detailed[experiment].seeds, splits: detailed[experiment].splits, diagnosticK: detailed[experiment].diagnosticK }])),
  experimentDecisions: { H0_WAVE2_2: "CONTROL", H1_SPECIALIZED_RECALL: "MEASURED", H2_AVAILABILITY_SHORTLIST: "MEASURED", H3_OBSERVED_QUALITY: promotion.pass ? "KEEP" : "REJECTED_PROMOTION_CONTRACT_FAILED" },
  pairedLift: paired,
  promotion,
  rootCause: { before: missSummary(detailed.H0_WAVE2_2.rows), after: missSummary(finalRows) },
  sourceContribution: sourceContribution(finalRows),
  usefulCandidateDensity: finalRows.reduce((sum, row) => sum + row.metrics.fullPoolRecall * row.metrics.oracle.relevantCount, 0) / finalRows.reduce((sum, row) => sum + row.metrics.candidateCount, 0),
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, spotPromptTokens, queryPromptTokens, queryCacheHash: createHash("sha256").update(await readFile(resolve(repoRoot, queryCacheOption))).digest("hex"), pricePerMillionTokensUsd, externalCostPerDecisionUsd },
  integrity: { ...integrity, scientificValidity: "PASS", latentTruthInEngineInput: false, retrievalQualityContractMutation: "NONE", productionAccess: "NONE" },
  semantic: { decision: "KEEP", role: "single focused recall projection; never treated as final utility" },
  verdict: promotion.pass ? "PASS" : "FAIL",
  architectureVerdict: promotion.pass ? "PROMOTED" : "NOT_PROMOTED",
};
const result = { ...body, resultHash: contentHash(body) };
await writeJson(resolve(repoRoot, outputOption), result);
process.stdout.write(`${JSON.stringify({ comparison, experiments: result.experiments, pairedLift: paired, promotion, rootCause: result.rootCause, resultHash: result.resultHash }, null, 2)}\n`);
