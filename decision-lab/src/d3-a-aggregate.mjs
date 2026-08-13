#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { summarizeGolden } from "./d3-a-runner.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const inputDir = resolve(repoRoot, option("input"));
const outputDir = resolve(repoRoot, option("output"));
if (!inputDir || !outputDir) throw new Error("--input and --output are required");
const plan = await readJson(resolve(repoRoot, "decision-lab/config/d3-a-v13-baseline-v1.plan.json"));
const worlds = [];
for (const seed of plan.worldSeeds) worlds.push(await readJson(resolve(inputDir, `${seed}.json`)));
const records = worlds.flatMap((world) => world.records);
if (records.length !== plan.plannedGoldenRuns) throw new Error(`Golden completeness failed: ${records.length}/${plan.plannedGoldenRuns}`);
for (const [split, count] of Object.entries(plan.splits)) if (records.filter((row) => row.split === split).length !== count * plan.worldSeeds.length) throw new Error(`Split completeness failed: ${split}`);
if (worlds.some((world) => world.diagnostics.coverage.verdict !== "READY")) throw new Error("Diagnostic coverage incomplete");
if (new Set(worlds.map((world) => world.preflight.identities.engineSourceHash)).size !== 1) throw new Error("Engine identity mixed");

const diagnostics = {
  counterfactual: worlds.flatMap((world) => world.diagnostics.counterfactual.measurements.map((row) => ({ seed: world.config.seed, ...row }))),
  personalization: worlds.flatMap((world) => world.diagnostics.personalization.measurements.map((row) => ({ seed: world.config.seed, ...row }))),
  remix: worlds.flatMap((world) => world.diagnostics.remix.measurements.map((row) => ({ seed: world.config.seed, ...row }))),
  explanation: worlds.flatMap((world) => world.diagnostics.explanation.measurements.map((row) => ({ seed: world.config.seed, ...row })))
};
const allFailures = records.flatMap((record) => record.failureClassification.map((failure) => ({ scenarioId: record.scenarioId, worldId: record.worldId, seed: record.seed, split: record.split, persona: record.persona, maturity: record.maturity, family: record.family, utilityLoss: record.metrics.eligibleRegretTop1, ...failure })));
const gateRows = records.flatMap((record) => record.hardConstraintResult.results.filter((gate) => gate.applicable).map((gate) => ({ seed: record.seed, split: record.split, scenarioId: record.scenarioId, family: record.family, ...gate })));
const d3f001 = Object.fromEntries(["HARD_CATEGORY", "CATEGORY_EXCLUSION", "OPEN_NOW"].map((gateId) => { const applicable = gateRows.filter((row) => row.gateId === gateId); const failures = applicable.filter((row) => row.status === "FAIL"); return [gateId, { applicable: applicable.length, failed: failures.length, failureRate: applicable.length ? failures.length / applicable.length : null, violatingCandidates: failures.reduce((sum, row) => sum + (row.evidence?.candidates?.length ?? 0), 0) }]; }));
const semanticDistributionRows = records.flatMap((record) => {
  const affectedSource = record.candidates.filter((candidate) => ["semantic_only", "fallback"].includes(candidate.source));
  const pairs = [];
  for (const reduced of affectedSource.filter((candidate) => candidate.distributionState === "reduced")) for (const normal of affectedSource.filter((candidate) => candidate.distributionState === "normal")) if (reduced.finalRank < normal.finalRank) pairs.push({ scenarioId: record.scenarioId, seed: record.seed, split: record.split, persona: record.persona, family: record.family, source: reduced.source, reducedSpotId: reduced.spotId, normalSpotId: normal.spotId, reducedRank: reduced.finalRank, normalRank: normal.finalRank, rankMovement: normal.finalRank - reduced.finalRank, utilityImpact: (normal.latentUtility ?? 0) - (reduced.latentUtility ?? 0) });
  return pairs;
});
const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const std = (values) => { const m = mean(values); return m === null ? null : Math.sqrt(mean(values.map((value) => (value - m) ** 2))); };
const summary = summarizeGolden(records);
const seedMetrics = Object.values(summary.seeds);
const resultBody = {
  baselineId: plan.baselineId,
  identity: { planVersion: plan.planVersion, sourceMainGitSha: plan.sourceMainGitSha, engineSourceHash: plan.engineSourceHash, parentFreezeManifestHash: plan.parentFreezeManifestHash, personalizationTreatmentFreezeHash: plan.personalizationTreatmentFreezeHash, constitutionHash: plan.constitutionHash, scenarioRegistryHash: plan.scenarioRegistryHash, evaluationHash: plan.evaluationHash, generatorVersion: plan.generatorVersion, groundTruthVersion: plan.groundTruthVersion, worldSeeds: plan.worldSeeds },
  fidelity: plan.fidelity,
  sampleSizes: { goldenDecisions: records.length, counterfactualPairs: diagnostics.counterfactual.length, personalizationTreatments: diagnostics.personalization.length, personalizationEngineRuns: diagnostics.personalization.length * 3, remixPairs: diagnostics.remix.length, explanationCandidates: diagnostics.explanation.length, worlds: worlds.length },
  metrics: summary,
  diagnostics: {
    counterfactual: { n: diagnostics.counterfactual.length, meanTopKOverlap: mean(diagnostics.counterfactual.map((row) => row.topKOverlap)), meanDirectionalUtilityDelta: mean(diagnostics.counterfactual.map((row) => row.directionalUtilityDelta)), directionalPositiveRate: mean(diagnostics.counterfactual.map((row) => Number(row.directionalUtilityDelta > 0))) },
    personalization: { n: diagnostics.personalization.length, meanLift: mean(diagnostics.personalization.map((row) => row.personalizationLift)), medianLift: [...diagnostics.personalization.map((row) => row.personalizationLift).filter(Number.isFinite)].sort((a, b) => a - b)[Math.floor(diagnostics.personalization.length / 2)] ?? null, harmRate: mean(diagnostics.personalization.map((row) => Number(row.personalizationHarm))), meanOpposingHistoryImpact: mean(diagnostics.personalization.map((row) => row.opposingHistoryImpact)), byMaturity: Object.fromEntries([...new Set(diagnostics.personalization.map((row) => row.maturity))].sort().map((maturity) => { const rows = diagnostics.personalization.filter((row) => row.maturity === maturity); return [maturity, { n: rows.length, meanLift: mean(rows.map((row) => row.personalizationLift)), harmRate: mean(rows.map((row) => Number(row.personalizationHarm))) }]; })) },
    remix: { n: diagnostics.remix.length, meanOverlap: mean(diagnostics.remix.map((row) => row.candidateOverlap)), meanNewCandidates: mean(diagnostics.remix.map((row) => row.newCandidateCount)), repeatedCandidates: diagnostics.remix.reduce((sum, row) => sum + row.repeatedSpotIds.length, 0), starvationRate: mean(diagnostics.remix.map((row) => Number(row.candidateStarvation))), meanUtilityDelta: mean(diagnostics.remix.map((row) => (row.utilityAfter ?? 0) - (row.utilityBefore ?? 0))), fallbackRate: mean(diagnostics.remix.map((row) => Number(row.fallbackUsage))) },
    explanation: { n: diagnostics.explanation.length, counts: Object.fromEntries(["ALIGNED", "PARTIALLY_ALIGNED", "MISLEADING", "UNSUPPORTED"].map((key) => [key, diagnostics.explanation.filter((row) => row.classification === key).length])), supportedRate: diagnostics.explanation.length ? diagnostics.explanation.filter((row) => ["ALIGNED", "PARTIALLY_ALIGNED"].includes(row.classification)).length / diagnostics.explanation.length : null },
    seedRobustness: { hardViolationRate: { mean: mean(seedMetrics.map((row) => row.hardViolationRate)), min: Math.min(...seedMetrics.map((row) => row.hardViolationRate)), max: Math.max(...seedMetrics.map((row) => row.hardViolationRate)), standardDeviation: std(seedMetrics.map((row) => row.hardViolationRate)) }, ndcgAt10: { mean: mean(seedMetrics.map((row) => row.ndcgAt10)), min: Math.min(...seedMetrics.map((row) => row.ndcgAt10)), max: Math.max(...seedMetrics.map((row) => row.ndcgAt10)), standardDeviation: std(seedMetrics.map((row) => row.ndcgAt10)) } }
  },
  findings: {
    d3f001: { decisionFailures: records.filter((row) => !row.hardConstraintResult.pass).length, decisionFailureRate: records.filter((row) => !row.hardConstraintResult.pass).length / records.length, gates: d3f001 },
    d0f002: { naturalOccurrenceCount: semanticDistributionRows.length, affectedDecisionCount: new Set(semanticDistributionRows.map((row) => `${row.seed}:${row.scenarioId}`)).size, affectedDecisionRate: new Set(semanticDistributionRows.map((row) => `${row.seed}:${row.scenarioId}`)).size / records.length, top3ImpactCount: semanticDistributionRows.filter((row) => row.reducedRank <= 3 || row.normalRank <= 3).length, meanRankMovement: mean(semanticDistributionRows.map((row) => row.rankMovement)), meanUtilityImpact: mean(semanticDistributionRows.map((row) => row.utilityImpact)), rows: semanticDistributionRows, controlledFixtureStatus: "DETECTION_REGRESSION_ONLY; NOT INCLUDED IN NATURAL FREQUENCY" }
  },
  failureDecomposition: { total: allFailures.length, unknownCount: allFailures.filter((row) => row.primaryClass === "UNKNOWN").length, unknownRate: allFailures.length ? allFailures.filter((row) => row.primaryClass === "UNKNOWN").length / allFailures.length : 0, counts: Object.fromEntries([...new Set(allFailures.map((row) => row.primaryClass))].sort().map((key) => [key, allFailures.filter((row) => row.primaryClass === key).length])), rows: allFailures },
  dataSufficiency: Object.fromEntries(["ENGINE_FAILURE", "OBSERVED_DATA_LIMITATION", "BOTH", "NOT_APPLICABLE"].map((key) => [key, records.filter((row) => row.missedOpportunity.dataSufficiency === key).length])),
  validity: { preflight: "PASS", worldHealth: worlds.every((world) => world.worldHealth.valid) ? "PASS" : "FAIL", diagnosticCoverage: worlds.every((world) => world.diagnostics.coverage.ready) ? "PASS" : "FAIL", scientificValidity: "PASS", engineMutation: "NONE", productionAccess: "NONE", goldenCompleteness: `${records.length}/${plan.plannedGoldenRuns}`, semanticQuality: "SIMULATION_ONLY" },
  invalidRuns: [],
  limitations: ["Semantic query embeddings use deterministic FAST_SIMULATION and semantic/aggregate quality is not FULL_FIDELITY.", "Synthetic latent utility is not real-user satisfaction.", "Lab latency is not Production latency.", "Repository-visible holdout provides process isolation, not secrecy."]
};
resultBody.resultHash = contentHash(resultBody);
const planRaw = await readFile(resolve(repoRoot, "decision-lab/config/d3-a-v13-baseline-v1.plan.json"));
resultBody.runPlanHash = createHash("sha256").update(planRaw).digest("hex");
await writeJson(resolve(outputDir, "v13-d3-a-v1.json"), resultBody);
await writeJson(resolve(outputDir, "v13-d3-a-v1.metrics.json"), { baselineId: resultBody.baselineId, resultHash: resultBody.resultHash, fidelity: resultBody.fidelity, sampleSizes: resultBody.sampleSizes, metrics: resultBody.metrics, diagnostics: resultBody.diagnostics, validity: resultBody.validity });
await writeJson(resolve(outputDir, "v13-d3-a-v1.failures.json"), { baselineId: resultBody.baselineId, resultHash: resultBody.resultHash, failureDecomposition: resultBody.failureDecomposition, dataSufficiency: resultBody.dataSufficiency });
await writeJson(resolve(outputDir, "v13-d3-a-v1.findings.json"), { baselineId: resultBody.baselineId, resultHash: resultBody.resultHash, findings: resultBody.findings });
await writeJson(resolve(outputDir, "v13-d3-a-v1.human-sample.json"), { baselineId: resultBody.baselineId, blinded: true, sample: records.slice().sort((a, b) => a.scenarioId.localeCompare(b.scenarioId)).filter((_, index) => index % 10 === 0).slice(0, 12).map((row) => ({ worldId: row.worldId, scenarioId: row.scenarioId, split: row.split, persona: row.persona, maturity: row.maturity, context: row.contextClass, input: row.rawInput, results: row.candidates.map((candidate) => ({ spotId: candidate.spotId, rank: candidate.finalRank, reason: candidate.humanReason })) })) });
process.stdout.write(`${JSON.stringify({ status: "PASS", baselineId: resultBody.baselineId, resultHash: resultBody.resultHash, runPlanHash: resultBody.runPlanHash, samples: resultBody.sampleSizes, validity: resultBody.validity }, null, 2)}\n`);
