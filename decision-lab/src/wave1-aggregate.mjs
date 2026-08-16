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
const outputPath = resolve(repoRoot, option("output"));
const seeds = ["backyrd-d1-basel-v1-2026", "backyrd-d1-basel-v1-2026-2", "backyrd-d1-basel-v1-2026-3"];
const worlds = await Promise.all(seeds.map((seed) => readJson(resolve(inputDir, `${seed}.json`))));
const records = worlds.flatMap((world) => world.records);
if (records.length !== 126) throw new Error(`Wave 1 completeness failed: ${records.length}/126`);
if (worlds.some((world) => world.diagnostics.coverage.verdict !== "READY")) throw new Error("Wave 1 diagnostic coverage incomplete");
const sourceHashes = new Set(worlds.map((world) => world.engine.sourceHash));
if (sourceHashes.size !== 1) throw new Error("Wave 1 mixed Engine source hashes");
const baseline = await readJson(resolve(repoRoot, "decision-lab/baselines/v13-d3-a-v1.json"));
const summary = summarizeGolden(records);
const gateRows = records.flatMap((record) => record.hardConstraintResult.results.filter((gate) => gate.applicable).map((gate) => ({ scenarioId: record.scenarioId, seed: record.seed, family: record.family, ...gate })));
const gate = (id) => { const rows = gateRows.filter((row) => row.gateId === id); const failed = rows.filter((row) => row.status === "FAIL"); const unknown = rows.filter((row) => row.status === "NOT_EVALUATED"); return { applicable: rows.length, failed: failed.length, notEvaluated: unknown.length, pass: failed.length === 0 && unknown.length === 0 }; };
const noResults = records.filter((record) => record.finalTopK.length === 0).length;
const starvation = records.filter((record) => record.finalTopK.length < 10).length;
const mean = (rows) => rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
const eligibilityRows = records.map((record) => record.observedEngine?.hardConstraintEligibility ?? null).filter(Boolean);
const result = {
  version: "wave1-comparison-v1",
  engine: { version: worlds[0].engine.version, sourceHash: worlds[0].engine.sourceHash, parentV13SourceHash: worlds[0].engine.parentV13SourceHash },
  frozenIdentities: { d2_1: worlds[0].preflight.identities.parentFreezeManifestHash, d2_2: worlds[0].preflight.identities.personalizationTreatmentFreezeHash },
  sampleSizes: { seeds: 3, goldenDecisions: records.length, scenariosPerSeed: 42 },
  fidelity: { semantic: "FAST_SIMULATION", aggregate: "STRUCTURALLY_VALIDATED", production: "NONE" },
  hardGates: {
    productEligibility: gate("PRODUCT_ELIGIBILITY"), distributionEligibility: gate("DISTRIBUTION_ELIGIBILITY"),
    hardCategory: gate("HARD_CATEGORY"), categoryExclusion: gate("CATEGORY_EXCLUSION"), openNow: gate("OPEN_NOW"),
  },
  d3f001: { beforeDecisionFailures: baseline.findings.d3f001.decisionFailures, afterDecisionFailures: records.filter((record) => record.hardConstraintResult.results.some((row) => ["HARD_CATEGORY", "CATEGORY_EXCLUSION", "OPEN_NOW"].includes(row.gateId) && row.status === "FAIL")).length },
  metrics: {
    v13: { ndcgAt10: baseline.metrics.overall.ndcgAt10, recallAt10: baseline.metrics.overall.recallAt10, precisionAt10: baseline.metrics.overall.precisionAt10, noResultRate: baseline.metrics.overall.noResultRate, hardViolationRate: baseline.metrics.overall.hardViolationRate },
    wave1: { ndcgAt10: summary.overall.ndcgAt10, recallAt10: summary.overall.recallAt10, precisionAt10: summary.overall.precisionAt10, noResultRate: noResults / records.length, starvationRate: starvation / records.length, hardViolationRate: summary.overall.hardViolationRate, top1Utility: summary.overall.top1Utility, eligibleRegretTop1: summary.overall.eligibleRegretTop1 },
  },
  eligibility: { reports: eligibilityRows.length, meanBefore: mean(eligibilityRows.map((row) => row.candidateCountBefore)), meanAfter: mean(eligibilityRows.map((row) => row.candidateCountAfter)), excluded: eligibilityRows.reduce((sum, row) => sum + row.excludedCount, 0), unknownEvidence: eligibilityRows.reduce((sum, row) => sum + row.unknownEvidenceCount, 0) },
  scientificValidity: worlds.every((world) => world.preflight.scientificValidity === "PASS") ? "PASS" : "FAIL",
  parentV13Mutation: worlds.every((world) => world.engine.parentV13SourceHash === "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba") ? "NONE" : "DETECTED",
  productionAccess: "NONE",
};
result.promotion = {
  d3f001Zero: result.d3f001.afterDecisionFailures === 0,
  productEligibility: result.hardGates.productEligibility.pass,
  distributionEligibility: result.hardGates.distributionEligibility.pass,
  allWave1HardGates: result.hardGates.hardCategory.pass && result.hardGates.categoryExclusion.pass && result.hardGates.openNow.pass,
  harmfulRetrievalCollapse: result.metrics.wave1.recallAt10 < result.metrics.v13.recallAt10 * 0.5 || result.metrics.wave1.noResultRate > 0.25,
};
result.verdict = Object.values(result.promotion).slice(0, 4).every(Boolean) && !result.promotion.harmfulRetrievalCollapse ? "PASS" : "FAIL";
result.sourceArtifactHash = createHash("sha256").update(await readFile(new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url))).digest("hex");
result.resultHash = contentHash(result);
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ verdict: result.verdict, resultHash: result.resultHash, d3f001: result.d3f001, hardGates: result.hardGates, metrics: result.metrics }, null, 2)}\n`);
