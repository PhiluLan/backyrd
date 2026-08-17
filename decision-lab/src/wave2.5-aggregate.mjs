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
const experiments = ["H0_WAVE2_4", "H1_DETERMINISTIC_STRUCTURED", "H2_STRUCTURED_PLUS_RETRIEVAL"];
const evaluatedExperiment = "H1_DETERMINISTIC_STRUCTURED";
const worlds = await Promise.all(seeds.map((seed) => readJson(resolve(repoRoot, inputOption, `${seed}.json`))));
const contract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const freeze = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.freeze.json"));
const historical = await readJson(resolve(repoRoot, "decision-lab/baselines/wave2.4-retrieval-shortlisting-v1.json"));
const records = worlds.flatMap((world) => world.records);
if (records.length !== 126) throw new Error("Wave 2.5 completeness failed");
if (worlds.some((world) => world.semanticQualityValidity !== "FULL_FIDELITY" || world.preflight.scientificValidity !== "PASS" || world.retrievalContractFreeze !== freeze.freezeManifestHash)) throw new Error("Wave 2.5 scientific preflight failed");

const unique = (values) => [...new Set(values)];
const quantile = (values, p) => { const rows = values.filter(Number.isFinite).sort((a, b) => a - b); return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null; };
const candidatesFor = (record, experiment) => record.retrievalRelevance.experiments[experiment] ?? [];
const rowsFor = (experiment, k = contract.promotionK) => records.map((record) => {
  const candidates = candidatesFor(record, experiment);
  return {
    key: `${record.seed}:${record.scenarioId}`,
    seed: record.seed,
    split: record.split,
    family: record.family,
    maturity: record.maturity,
    persona: record.persona,
    metrics: retrievalScenarioMetrics({ candidateIds: candidates.map((row) => row.spot_id), eligibleUtilityById: record.retrievalContractEvidence.eligibleUtilityById, relevanceThreshold: contract.relevanceThreshold, k }),
    latencyMs: experiment === "H0_WAVE2_4" ? record.retrievalShortlisting.latencyMs : record.retrievalRelevance.latencyMs,
    resultCount: record.finalTopK.length,
    hardViolation: !record.hardConstraintResult.pass,
    truth: record.retrievalContractEvidence.eligibleUtilityById,
    candidates,
  };
});
const group = (rows, field) => Object.fromEntries(unique(rows.map((row) => row[field])).sort().map((value) => [value, summarizeRetrievalScenarios(rows.filter((row) => row[field] === value))]));
const summarize = (experiment) => {
  const rows = rowsFor(experiment);
  const overall = summarizeRetrievalScenarios(rows);
  overall.latencyMs.p50 = quantile(rows.map((row) => row.latencyMs), 0.5);
  return {
    overall,
    seeds: group(rows, "seed"),
    splits: group(rows, "split"),
    families: group(rows, "family"),
    maturity: group(rows, "maturity"),
    diagnosticK: Object.fromEntries(contract.diagnosticKs.map((k) => [k, summarizeRetrievalScenarios(rowsFor(experiment, k))])),
    rows,
  };
};
const detailed = Object.fromEntries(experiments.map((experiment) => [experiment, summarize(experiment)]));
const paired = pairedBootstrap(detailed[evaluatedExperiment].rows.map((row, index) => [detailed.H0_WAVE2_4.rows[index].metrics.topKCapacityCapture, row.metrics.topKCapacityCapture]), { iterations: 5000, seed: "wave2.5-vs-wave2.4", confidence: 0.95 });

function missAnalysis(beforeRows, afterRows) {
  const before = { RETRIEVED_AT_20: 0, ORDERING_MISS: 0, COVERAGE_MISS: 0 };
  const after = { RETRIEVED_AT_20: 0, ORDERING_MISS: 0, COVERAGE_MISS: 0 };
  const coverageClusters = {};
  const remainingOrdering = { QUERY_EVIDENCE_MISSING_OR_UNKNOWN: 0, QUERY_EVIDENCE_PRESENT_BUT_INSUFFICIENT: 0 };
  for (let index = 0; index < beforeRows.length; index += 1) {
    const baseline = beforeRows[index];
    const candidate = afterRows[index];
    for (const [spotId, utility] of Object.entries(baseline.truth)) {
      if (utility < contract.relevanceThreshold) continue;
      const beforeRank = baseline.candidates.findIndex((row) => row.spot_id === spotId) + 1;
      const afterRow = candidate.candidates.find((row) => row.spot_id === spotId);
      const afterRank = afterRow ? candidate.candidates.indexOf(afterRow) + 1 : 0;
      const bucket = (rank) => rank === 0 ? "COVERAGE_MISS" : rank <= contract.promotionK ? "RETRIEVED_AT_20" : "ORDERING_MISS";
      before[bucket(beforeRank)] += 1;
      after[bucket(afterRank)] += 1;
      if (afterRank === 0) {
        const key = `${candidate.family}:${candidate.maturity}`;
        coverageClusters[key] = (coverageClusters[key] ?? 0) + 1;
      } else if (afterRank > contract.promotionK) {
        const deterministic = afterRow.relevance_evidence?.deterministic;
        const missing = !deterministic?.activeWeight || deterministic.unknownWeight >= deterministic.activeWeight;
        remainingOrdering[missing ? "QUERY_EVIDENCE_MISSING_OR_UNKNOWN" : "QUERY_EVIDENCE_PRESENT_BUT_INSUFFICIENT"] += 1;
      }
    }
  }
  return { before, after, coverageClusters, remainingOrdering, orderingReduction: before.ORDERING_MISS ? (before.ORDERING_MISS - after.ORDERING_MISS) / before.ORDERING_MISS : 0 };
}

function sourceContribution(rows) {
  const appearances = rows.flatMap((row) => row.candidates.slice(0, contract.promotionK).flatMap((candidate) => unique((candidate.evidence ?? []).map((evidence) => evidence.source)).map((source) => ({ source, useful: (row.truth[candidate.spot_id] ?? 0) >= contract.relevanceThreshold }))));
  return Object.fromEntries(unique(appearances.map((row) => row.source)).sort().map((source) => {
    const selected = appearances.filter((row) => row.source === source);
    return [source, { top20Memberships: selected.length, usefulMemberships: selected.filter((row) => row.useful).length, usefulDensity: selected.length ? selected.filter((row) => row.useful).length / selected.length : null }];
  }));
}

const finalRows = detailed[evaluatedExperiment].rows;
const integrity = records.reduce((summary, record) => {
  const row = record.retrievalRelevance.integrity[evaluatedExperiment];
  summary.unresolved += row.unresolved;
  summary.productFailures += row.productFailures;
  summary.distributionFailures += row.distributionFailures;
  summary.userConstraintFailures += row.hardConstraintFailures;
  return summary;
}, { unresolved: 0, productFailures: 0, distributionFailures: 0, userConstraintFailures: 0 });
const manifests = await Promise.all((await readdir(resolve(repoRoot, fullFidelityOption))).filter((name) => name.endsWith(".json") && name !== "query-cache.json").sort().map((name) => readJson(resolve(repoRoot, fullFidelityOption, name))));
const spotPromptTokens = manifests.reduce((sum, manifest) => sum + Number(manifest.actualPromptTokens ?? 0), 0);
const queryPromptTokens = worlds.reduce((sum, world) => sum + Number(world.externalUsage?.promptTokens ?? 0), 0);
const pricePerMillionTokensUsd = 0.02;
const externalCostPerDecisionUsd = queryPromptTokens / records.length / 1_000_000 * pricePerMillionTokensUsd;
const candidate = { overall: detailed[evaluatedExperiment].overall, seeds: detailed[evaluatedExperiment].seeds, splits: detailed[evaluatedExperiment].splits };
const baseline = { overall: detailed.H0_WAVE2_4.overall, seeds: detailed.H0_WAVE2_4.seeds, splits: detailed.H0_WAVE2_4.splits };
const promotion = evaluateRetrievalPromotion({ candidate, baseline, thresholds: contract.thresholds, paired: { meanDelta: paired.meanDelta, confidenceLowerBound: paired.interval?.[0] ?? null }, externalCostPerDecisionUsd });
const misses = missAnalysis(detailed.H0_WAVE2_4.rows, finalRows);
const identityPreserved = records.every((record) => experiments.every((experiment) => {
  const baselineIds = candidatesFor(record, "H0_WAVE2_4").map((row) => row.spot_id).sort();
  const candidateIds = candidatesFor(record, experiment).map((row) => row.spot_id).sort();
  return JSON.stringify(baselineIds) === JSON.stringify(candidateIds);
}));
const top20Relevant = finalRows.reduce((sum, row) => sum + row.candidates.slice(0, contract.promotionK).filter((candidateRow) => (row.truth[candidateRow.spot_id] ?? 0) >= contract.relevanceThreshold).length, 0);
const comparison = { ...historical.comparison, wave2_5: candidate.overall };
const body = {
  version: "wave2.5-retrieval-relevance-v1",
  sample: { seeds: 3, scenariosPerSeed: 42, decisions: 126, embeddingMode: "FULL_FIDELITY" },
  frozenIdentities: { retrievalQualityFreeze: freeze.freezeManifestHash, d2_1: worlds[0].preflight.identities.parentFreezeManifestHash, d2_2: worlds[0].preflight.identities.personalizationTreatmentFreezeHash },
  sourceHashes: { executionSource: worlds[0].sourceHash, engineMutation: "NONE", relevanceManifest: worlds[0].records[0].retrievalRelevance.manifest.hash },
  comparison,
  experiments: Object.fromEntries(experiments.map((experiment) => [experiment, { overall: detailed[experiment].overall, seeds: detailed[experiment].seeds, splits: detailed[experiment].splits, families: detailed[experiment].families, maturity: detailed[experiment].maturity, diagnosticK: detailed[experiment].diagnosticK }])),
  experimentDecisions: {
    H0_WAVE2_4: "CONTROL_RETAINED",
    H1_DETERMINISTIC_STRUCTURED: "EVALUATED_NOT_PROMOTED",
    H2_STRUCTURED_PLUS_RETRIEVAL: "EVALUATED_NOT_PROMOTED",
    LIGHTWEIGHT_LEARNED: "NOT_SCIENTIFICALLY_EXECUTABLE_WITHOUT_DEDICATED_TRAINING_SPLIT",
    AI_ASSISTED: "NOT_OPERATIONALLY_JUSTIFIED_WITHOUT_FROZEN_RELEVANCE_CONTRACT",
  },
  pairedLift: paired,
  promotion,
  misses,
  sourceContribution: sourceContribution(finalRows),
  usefulCandidateDensityAt20: top20Relevant / (finalRows.length * contract.promotionK),
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, relevanceApiCalls: 0, spotPromptTokens, queryPromptTokens, queryCacheHash: createHash("sha256").update(await readFile(resolve(repoRoot, queryCacheOption))).digest("hex"), pricePerMillionTokensUsd, externalCostPerDecisionUsd },
  integrity: { ...integrity, scientificValidity: "PASS", latentTruthInEngineInput: false, personalizationInRelevanceInput: false, learnedTrainingOnHoldout: false, retrievalQualityContractMutation: "NONE", wave24CandidateIdentityPreserved: identityPreserved, productionAccess: "NONE" },
  verdict: promotion.pass ? "PASS" : "FAIL",
  architectureVerdict: promotion.pass ? "PROMOTED" : "NOT_PROMOTED",
  relevanceVerdict: promotion.pass && paired.meanDelta > 0 ? "EFFECTIVE" : "INSUFFICIENT",
};
const result = { ...body, resultHash: contentHash(body) };
await writeJson(resolve(repoRoot, outputOption), result);
process.stdout.write(`${JSON.stringify({ comparison, experiments: result.experiments, pairedLift: paired, promotion, misses, integrity: result.integrity, resultHash: result.resultHash }, null, 2)}\n`);
