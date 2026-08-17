#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { runD3AWorld } from "./d3-a-runner.mjs";
import { retrievalScenarioMetrics, summarizeRetrievalScenarios } from "./retrieval-quality-contract.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const configOption = option("config");
const outputOption = option("output");
if (!configOption || !outputOption) throw new Error("--config and --output are required");

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`Wave 2.3 preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const config = await readJson(resolve(repoRoot, configOption));
if (!["FULL_FIDELITY", "FAST_SIMULATION"].includes(config.embeddingMode)) throw new Error("Unsupported Wave 2.3 embedding mode");
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const coverageContract = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
const retrievalContract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const sourceUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);
const expectedSourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const run = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: {
    sourceUrl, expectedSourceHash, baselineId: "backyrd-wave2.3-retrieval-rebuild-v1", goldenOnly: true,
    requestOverrides: { semanticLimit: 60, structuredLimit: 50, lexicalLimit: 30 },
    retrievalNextGen: true, retrievalNextGenLimits: { structured: 60, lexical: 40, semantic: 60, union: 100 },
    retrievalProjectionIds: [],
    retrievalBreakthrough: true, retrievalBreakthroughLimits: { union: retrievalContract.thresholds.candidatePoolMeanMaximum },
    retrievalRebuild: true, retrievalRebuildLimits: { union: retrievalContract.thresholds.candidatePoolMeanMaximum, shortlist: retrievalContract.promotionK },
  },
});
const result = {
  version: "wave2.3-retrieval-rebuild-arm-v1",
  sourceHash: expectedSourceHash,
  semanticQualityValidity: config.embeddingMode === "FULL_FIDELITY" ? "FULL_FIDELITY" : "SIMULATION_ONLY",
  preflight,
  retrievalContractFreeze: "6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947",
  config,
  records: run.records,
  externalUsage: run.externalUsage,
  productionAccess: "NONE",
};
await writeJson(resolve(repoRoot, outputOption), result);
const diagnosticSummary = (experiment) => summarizeRetrievalScenarios(result.records.map((record) => {
  const candidates = experiment === "H0_WAVE2_2" ? record.retrievalBreakthrough.finalUnion : record.retrievalRebuild.experiments[experiment];
  return { metrics: retrievalScenarioMetrics({ candidateIds: candidates.map((row) => row.spot_id), eligibleUtilityById: record.retrievalContractEvidence.eligibleUtilityById, relevanceThreshold: retrievalContract.relevanceThreshold, k: retrievalContract.promotionK }), latencyMs: experiment === "H0_WAVE2_2" ? record.latencyMs : record.retrievalRebuild.latencyMs, resultCount: record.finalTopK.length, hardViolation: !record.hardConstraintResult.pass };
}));
process.stdout.write(`${JSON.stringify({ status: "PASS", seed: config.seed, mode: config.embeddingMode, scenarios: result.records.length, hardViolations: result.records.filter((row) => !row.hardConstraintResult.pass).length, experiments: Object.fromEntries(["H0_WAVE2_2", "H1_SPECIALIZED_RECALL", "H2_AVAILABILITY_SHORTLIST", "H3_OBSERVED_QUALITY"].map((experiment) => [experiment, diagnosticSummary(experiment)])) }, null, 2)}\n`);
