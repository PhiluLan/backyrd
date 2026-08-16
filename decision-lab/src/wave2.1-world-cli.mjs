#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { runD3AWorld, summarizeGolden } from "./d3-a-runner.mjs";
import { retrievalNextGenManifest } from "./wave2.1-retrieval-next-gen.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const configOption = option("config");
const outputOption = option("output");
const engineName = option("engine") ?? "wave2.1";
if (!configOption || !outputOption) throw new Error("--config and --output are required");
if (!["wave2", "wave2.1"].includes(engineName)) throw new Error("--engine must be wave2 or wave2.1");

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`Wave 2.1 preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);

const configPath = resolve(repoRoot, configOption);
const outputPath = resolve(repoRoot, outputOption);
const config = await readJson(configPath);
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const coverageContract = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
const sourceUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);
const expectedSourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const isNextGen = engineName === "wave2.1";
const run = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: {
    sourceUrl,
    expectedSourceHash,
    baselineId: `backyrd-${engineName}-retrieval-comparison-v1`,
    goldenOnly: true,
    requestOverrides: { semanticLimit: 60, structuredLimit: 50, lexicalLimit: 30 },
    ...(isNextGen ? { retrievalNextGen: true, retrievalNextGenLimits: { structured: 60, lexical: 40, semantic: 60, union: 100 } } : {}),
  },
});

const result = {
  runMode: `${engineName.toUpperCase()}_RETRIEVAL_NEXT_GEN_COMPARISON`,
  certifiableMeasurement: true,
  semanticQualityValidity: config.embeddingMode === "FULL_FIDELITY" ? "FULL_FIDELITY" : "SIMULATION_ONLY",
  preflight,
  engine: {
    version: isNextGen ? "retrieval-next-gen-v1" : "decision-wave2-retrieval-spot-intelligence-v1",
    executionSource: "decision-wave2-retrieval-spot-intelligence-v1",
    sourceHash: expectedSourceHash,
    retrievalManifest: isNextGen ? retrievalNextGenManifest() : null,
    parentWave1SourceHash: "5d65a4db6e8a8baf6bce872d967d5350e55ec5f4470191ff4490540dac0b20b8",
    parentV13SourceHash: preflight.identities.engineSourceHash,
  },
  config,
  ...run,
  aggregate: summarizeGolden(run.records),
};
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ status: "PASS", engine: engineName, seed: config.seed, mode: config.embeddingMode, goldenScenarios: run.records.length, hardViolations: run.records.filter((row) => !row.hardConstraintResult.pass).length, output: outputPath }, null, 2)}\n`);
