#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { evaluateRetrievalPromotion, retrievalScenarioMetrics, summarizeRetrievalScenarios } from "./retrieval-quality-contract.mjs";
import { pairedBootstrap } from "./statistics.mjs";
import { orderingMissReason } from "./wave2.4-retrieval-shortlisting.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputOption = option("input");
const fullFidelityOption = option("full-fidelity");
const queryCacheOption = option("query-cache");
const outputOption = option("output");
if (!inputOption || !fullFidelityOption || !queryCacheOption || !outputOption) throw new Error("--input, --full-fidelity, --query-cache and --output are required");

const seeds = ["backyrd-d1-basel-v1-2026", "backyrd-d1-basel-v1-2026-2", "backyrd-d1-basel-v1-2026-3"];
const experiments = ["H0_WAVE2_3", "H1_TIE_SAFE_CALIBRATION", "H2_FAMILY_CORROBORATION"];
const finalExperiment = "H1_TIE_SAFE_CALIBRATION";
const worlds = await Promise.all(seeds.map((seed) => readJson(resolve(repoRoot, inputOption, `${seed}.json`))));
const contract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const freeze = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.freeze.json"));
const historical = await readJson(resolve(repoRoot, "decision-lab/baselines/wave2.3-retrieval-rebuild-v1.json"));
const records = worlds.flatMap((world) => world.records);
if (records.length !== 126) throw new Error("Wave 2.4 completeness failed");
if (worlds.some((world) => world.semanticQualityValidity !== "FULL_FIDELITY" || world.preflight.scientificValidity !== "PASS" || world.retrievalContractFreeze !== freeze.freezeManifestHash)) throw new Error("Wave 2.4 scientific preflight failed");

const unique = (values) => [...new Set(values)];
const quantile = (values, p) => {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null;
};
const candidatesFor = (record, experiment) => record.retrievalShortlisting.experiments[experiment] ?? [];
const rowsFor = (experiment, k = contract.promotionK) => records.map((record) => {
  const candidates = candidatesFor(record, experiment);
  return {
    key: `${record.seed}:${record.scenarioId}`,
    seed: record.seed,
    split: record.split,
    family: record.family,
    metrics: retrievalScenarioMetrics({ candidateIds: candidates.map((row) => row.spot_id), eligibleUtilityById: record.retrievalContractEvidence.eligibleUtilityById, relevanceThreshold: contract.relevanceThreshold, k }),
    latencyMs: experiment === "H0_WAVE2_3" ? record.retrievalRebuild.latencyMs : record.retrievalShortlisting.latencyMs,
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
    diagnosticK: Object.fromEntries(contract.diagnosticKs.map((k) => [k, summarizeRetrievalScenarios(rowsFor(experiment, k))])),
    rows,
  };
};
const detailed = Object.fromEntries(experiments.map((experiment) => [experiment, summarize(experiment)]));
const pairs = detailed[finalExperiment].rows.map((row, index) => [detailed.H0_WAVE2_3.rows[index].metrics.topKCapacityCapture, row.metrics.topKCapacityCapture]);
const paired = pairedBootstrap(pairs, { iterations: 5000, seed: "wave2.4-vs-wave2.3", confidence: 0.95 });

function orderingAnalysis(beforeRows, afterRows) {
  const before = { RETRIEVED_AT_20: 0, SOURCE_ORDERING_FAILURE: 0, COVERAGE_GAP: 0 };
  const after = { RETRIEVED_AT_20: 0, SOURCE_ORDERING_FAILURE: 0, COVERAGE_GAP: 0 };
  const causes = {};
  let resolvedOrderingMisses = 0;
  for (let index = 0; index < beforeRows.length; index += 1) {
    const baseline = beforeRows[index];
    const candidate = afterRows[index];
    for (const [spotId, utility] of Object.entries(baseline.truth)) {
      if (utility < contract.relevanceThreshold) continue;
      const beforeRank = baseline.candidates.findIndex((row) => row.spot_id === spotId) + 1;
      const afterRank = candidate.candidates.findIndex((row) => row.spot_id === spotId) + 1;
      before[beforeRank === 0 ? "COVERAGE_GAP" : beforeRank <= contract.promotionK ? "RETRIEVED_AT_20" : "SOURCE_ORDERING_FAILURE"] += 1;
      after[afterRank === 0 ? "COVERAGE_GAP" : afterRank <= contract.promotionK ? "RETRIEVED_AT_20" : "SOURCE_ORDERING_FAILURE"] += 1;
      if (beforeRank > contract.promotionK) {
        if (afterRank > 0 && afterRank <= contract.promotionK) resolvedOrderingMisses += 1;
        else {
          const evidence = candidate.candidates.find((row) => row.spot_id === spotId);
          const cause = orderingMissReason(evidence);
          causes[cause] = (causes[cause] ?? 0) + 1;
        }
      }
    }
  }
  const reduction = before.SOURCE_ORDERING_FAILURE
    ? (before.SOURCE_ORDERING_FAILURE - after.SOURCE_ORDERING_FAILURE) / before.SOURCE_ORDERING_FAILURE
    : 0;
  return {
    before,
    after,
    resolvedOrderingMisses,
    remainingOrderingMissCauses: causes,
    relativeOrderingMissReduction: reduction,
    materiallyReduced: paired.meanDelta >= contract.thresholds.pairedCapacityCaptureLiftMinimum && (paired.interval?.[0] ?? 0) > 0,
  };
}

function sourceContribution(rows) {
  const appearances = rows.flatMap((row) => row.candidates.slice(0, contract.promotionK).flatMap((candidate) => {
    const sources = unique(candidate.evidence.map((evidence) => evidence.source));
    return sources.map((source) => ({ source, useful: (row.truth[candidate.spot_id] ?? 0) >= contract.relevanceThreshold, unique: sources.length === 1 }));
  }));
  return Object.fromEntries(unique(appearances.map((row) => row.source)).sort().map((source) => {
    const selected = appearances.filter((row) => row.source === source);
    return [source, {
      top20Memberships: selected.length,
      top20PresenceRate: selected.length / (rows.length * contract.promotionK),
      usefulMemberships: selected.filter((row) => row.useful).length,
      uniqueUsefulMemberships: selected.filter((row) => row.useful && row.unique).length,
      usefulDensity: selected.length ? selected.filter((row) => row.useful).length / selected.length : null,
    }];
  }));
}

const finalRows = detailed[finalExperiment].rows;
const integrity = records.reduce((summary, record) => {
  const row = record.retrievalShortlisting.integrity[finalExperiment];
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
const candidate = { overall: detailed[finalExperiment].overall, seeds: detailed[finalExperiment].seeds, splits: detailed[finalExperiment].splits };
const baseline = { overall: detailed.H0_WAVE2_3.overall, seeds: detailed.H0_WAVE2_3.seeds, splits: detailed.H0_WAVE2_3.splits };
const promotion = evaluateRetrievalPromotion({ candidate, baseline, thresholds: contract.thresholds, paired: { meanDelta: paired.meanDelta, confidenceLowerBound: paired.interval?.[0] ?? null }, externalCostPerDecisionUsd });
const comparison = { ...historical.comparison, wave2_3: baseline.overall, wave2_4: candidate.overall };
const top20Relevant = finalRows.reduce((sum, row) => sum + row.candidates.slice(0, contract.promotionK).filter((candidateRow) => (row.truth[candidateRow.spot_id] ?? 0) >= contract.relevanceThreshold).length, 0);
const ordering = orderingAnalysis(detailed.H0_WAVE2_3.rows, finalRows);
const coveragePreserved = Math.abs(candidate.overall.fullPoolRecall - baseline.overall.fullPoolRecall) < 1e-12
  && ordering.before.COVERAGE_GAP === ordering.after.COVERAGE_GAP;
const body = {
  version: "wave2.4-retrieval-shortlisting-v1",
  sample: { seeds: 3, scenariosPerSeed: 42, decisions: 126, embeddingMode: "FULL_FIDELITY" },
  frozenIdentities: { retrievalQualityFreeze: freeze.freezeManifestHash, d2_1: worlds[0].preflight.identities.parentFreezeManifestHash, d2_2: worlds[0].preflight.identities.personalizationTreatmentFreezeHash },
  sourceHashes: { executionSource: worlds[0].sourceHash, engineMutation: "NONE", shortlistManifest: worlds[0].records[0].retrievalShortlisting.manifest.hash },
  comparison,
  experiments: Object.fromEntries(experiments.map((experiment) => [experiment, { overall: detailed[experiment].overall, seeds: detailed[experiment].seeds, splits: detailed[experiment].splits, diagnosticK: detailed[experiment].diagnosticK }])),
  experimentDecisions: {
    H0_WAVE2_3: "CONTROL",
    H1_TIE_SAFE_CALIBRATION: promotion.pass ? "KEEP_AND_PROMOTE" : "KEEP_AS_DIAGNOSTIC_WIN_NOT_PROMOTED",
    H2_FAMILY_CORROBORATION: "REJECTED_UNBALANCED_CAPACITY_AND_COVERAGE",
    FIXED_SOURCE_QUOTAS: "REJECTED_OFFLINE_CAPACITY_REGRESSION",
  },
  pairedLift: paired,
  promotion,
  ordering,
  coveragePreservation: { preserved: coveragePreserved, baselineFullPoolRecall: baseline.overall.fullPoolRecall, candidateFullPoolRecall: candidate.overall.fullPoolRecall },
  sourceContribution: sourceContribution(finalRows),
  usefulCandidateDensityAt20: top20Relevant / (finalRows.length * contract.promotionK),
  sourceMonopolization: { maximumSingleSourceTop20PresenceRate: Math.max(...Object.values(sourceContribution(finalRows)).map((row) => row.top20PresenceRate)), interpretation: "membership evidence may overlap; no source quota is applied" },
  externalUsage: { model: "text-embedding-3-small", dimensions: 1536, spotPromptTokens, queryPromptTokens, queryCacheHash: createHash("sha256").update(await readFile(resolve(repoRoot, queryCacheOption))).digest("hex"), pricePerMillionTokensUsd, externalCostPerDecisionUsd },
  integrity: { ...integrity, scientificValidity: "PASS", latentTruthInEngineInput: false, retrievalQualityContractMutation: "NONE", wave23CandidateIdentityPreserved: coveragePreserved, productionAccess: "NONE" },
  semantic: { decision: "KEEP", role: "recall evidence only; tie-safe calibrated and never treated as final utility" },
  verdict: promotion.pass ? "PASS" : "FAIL",
  architectureVerdict: promotion.pass ? "PROMOTED" : "NOT_PROMOTED",
};
const result = { ...body, resultHash: contentHash(body) };
await writeJson(resolve(repoRoot, outputOption), result);
process.stdout.write(`${JSON.stringify({ comparison, experiments: result.experiments, pairedLift: paired, promotion, ordering, coveragePreservation: result.coveragePreservation, resultHash: result.resultHash }, null, 2)}\n`);
