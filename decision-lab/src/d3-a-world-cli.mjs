#!/usr/bin/env node
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
if (preflight.status !== "PASS") throw new Error(`D3-A preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const config = await readJson(configPath);
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const coverageContract = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const startedAt = new Date().toISOString();
const run = await runD3AWorld({ config, metadata, constitution, coverageContract, env: process.env });
const result = { runMode: "D3_A_FULL_DIAGNOSTIC", certifiableMeasurement: true, semanticQualityValidity: "SIMULATION_ONLY", preflight, config, startedAt, completedAt: new Date().toISOString(), ...run, aggregate: summarizeGolden(run.records) };
await writeJson(outputPath, result);
process.stdout.write(`${JSON.stringify({ status: "PASS", seed: config.seed, worldHash: run.worldManifest.worldHash, goldenScenarios: run.records.length, hardViolations: run.records.filter((row) => !row.hardConstraintResult.pass).length, coverage: run.diagnostics.coverage.verdict, output: outputPath }, null, 2)}\n`);
