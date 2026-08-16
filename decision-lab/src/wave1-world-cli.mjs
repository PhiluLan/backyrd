#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { runD3AWorld, summarizeGolden } from "./d3-a-runner.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const configPath = resolve(repoRoot, option("config"));
const outputPath = resolve(repoRoot, option("output"));
if (!configPath || !outputPath) throw new Error("--config and --output are required");

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`Wave 1 preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const config = await readJson(configPath);
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const coverageContract = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
const sourceUrl = new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url);
const expectedSourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const run = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: { sourceUrl, expectedSourceHash, baselineId: "backyrd-decision-wave1-intent-constraints-v1", wave1: true },
});
const result = {
  runMode: "WAVE1_INTENT_CONSTRAINTS_CANDIDATE",
  certifiableMeasurement: true,
  semanticQualityValidity: "SIMULATION_ONLY",
  preflight,
  engine: { version: "decision-wave1-intent-constraints-v1", sourceHash: expectedSourceHash, parentV13SourceHash: preflight.identities.engineSourceHash },
  config,
  ...run,
  aggregate: summarizeGolden(run.records),
};
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ status: "PASS", seed: config.seed, goldenScenarios: run.records.length, hardViolations: run.records.filter((row) => !row.hardConstraintResult.pass).length, output: outputPath }, null, 2)}\n`);
