#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { d31Preflight } from "./d3.1-readiness.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { runD3AWorld } from "./d3-a-runner.mjs";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const configOption = option("config");
const outputOption = option("output");
const engineName = option("engine");
if (!configOption || !outputOption || !["v13", "wave1", "wave2", "wave2.1"].includes(engineName)) throw new Error("--config, --output and --engine v13|wave1|wave2|wave2.1 are required");

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`D4.1 preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);

const config = await readJson(resolve(repoRoot, configOption));
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const coverageContract = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
const sourceName = engineName === "wave2.1" ? "wave2" : engineName;
const sourceUrl = new URL(`../../supabase/functions/decision-${sourceName}/index.ts`, import.meta.url);
const expectedSourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const run = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: {
    sourceUrl,
    expectedSourceHash,
    baselineId: `backyrd-d4-1-historical-${engineName}`,
    goldenOnly: true,
    ...(["wave2", "wave2.1"].includes(engineName) ? { requestOverrides: { semanticLimit: 60, structuredLimit: 50, lexicalLimit: 30 } } : {}),
    ...(engineName === "wave2.1" ? { retrievalNextGen: true, retrievalNextGenLimits: { structured: 60, lexical: 40, semantic: 60, union: 100 } } : {}),
  },
});
const result = {
  version: "d4.1-historical-diagnostic-arm-v1",
  engine: engineName,
  executionSource: sourceName,
  sourceHash: expectedSourceHash,
  semanticQualityValidity: "FULL_FIDELITY",
  preflight,
  config,
  records: run.records,
  externalUsage: run.externalUsage,
  productionAccess: "NONE",
};
await writeJson(resolve(repoRoot, outputOption), result);
process.stdout.write(`${JSON.stringify({ status: "PASS", engine: engineName, seed: config.seed, scenarios: result.records.length, hardViolations: result.records.filter((row) => !row.hardConstraintResult.pass).length }, null, 2)}\n`);
