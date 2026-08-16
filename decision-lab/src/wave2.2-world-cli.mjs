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
if (!configOption || !outputOption) throw new Error("--config and --output are required");

const preflight = await d31Preflight();
if (preflight.status !== "PASS") throw new Error(`Wave 2.2 preflight failed: ${preflight.reasons.join(",")}`);
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_DB_URL"]) if (!process.env[key]) throw new Error(`${key} missing`);
const config = await readJson(resolve(repoRoot, configOption));
if (config.embeddingMode !== "FULL_FIDELITY") throw new Error("Wave 2.2 requires FULL_FIDELITY");
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const coverageContract = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
const retrievalContract = await readJson(resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json"));
const sourceUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);
const expectedSourceHash = createHash("sha256").update(await readFile(sourceUrl)).digest("hex");
const metadata = { gitSha: process.env.DECISION_LAB_SOURCE_MAIN_SHA, migrationHash: process.env.DECISION_LAB_MIGRATION_HASH, engineSourceHash: preflight.identities.engineSourceHash };
const run = await runD3AWorld({
  config, metadata, constitution, coverageContract, env: process.env,
  engine: {
    sourceUrl, expectedSourceHash, baselineId: "backyrd-wave2.2-retrieval-breakthrough-v1", goldenOnly: true,
    requestOverrides: { semanticLimit: 60, structuredLimit: 50, lexicalLimit: 30 },
    retrievalNextGen: true, retrievalNextGenLimits: { structured: 60, lexical: 40, semantic: 60, union: 100 },
    retrievalBreakthrough: true, retrievalBreakthroughLimits: { union: retrievalContract.thresholds.candidatePoolMeanMaximum },
  },
});
const result = {
  version: "wave2.2-retrieval-breakthrough-arm-v1",
  sourceHash: expectedSourceHash,
  semanticQualityValidity: "FULL_FIDELITY",
  preflight,
  retrievalContractFreeze: "6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947",
  config,
  records: run.records,
  externalUsage: run.externalUsage,
  productionAccess: "NONE",
};
await writeJson(resolve(repoRoot, outputOption), result);
process.stdout.write(`${JSON.stringify({ status: "PASS", seed: config.seed, scenarios: result.records.length, hardViolations: result.records.filter((row) => !row.hardConstraintResult.pass).length }, null, 2)}\n`);
