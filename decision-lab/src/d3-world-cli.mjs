#!/usr/bin/env node
import { resolve } from "node:path";
import { d3Preflight } from "./d3-preflight.mjs";
import { readJson, writeJson, repoRoot } from "./io.mjs";
import { runWorld, summarize } from "./d3-runner.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const configPath = resolve(repoRoot, option("config", "decision-lab/config/world-v1.json"));
const outputPath = resolve(repoRoot, option("output"));
if (!outputPath) throw new Error("--output is required");
const preflight = await d3Preflight();
if (preflight.status !== "PASS") throw new Error(`D3 preflight failed: ${preflight.reasons.join(",")}`);
const config = await readJson(configPath);
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const metadata = { gitSha: preflight.snapshot.gitSha, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.snapshot.v13SourceHash };
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const run = await runWorld({ config, metadata, constitution, env: process.env });
const result = { preflight, config, worldManifest: run.worldManifest, worldHealth: run.worldHealth, records: run.records, aggregate: summarize(run.records) };
await writeJson(outputPath, result);
const hardViolations = run.records.filter((record) => !record.hardConstraintResult.pass).length;
process.stdout.write(`${JSON.stringify({ status: hardViolations ? "P0_STOP" : "PASS", seed: config.seed, worldHash: run.worldManifest.worldHash, scenarios: run.records.length, hardViolations, output: outputPath }, null, 2)}\n`);
if (hardViolations) process.exitCode = 42;
