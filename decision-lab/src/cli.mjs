#!/usr/bin/env node
import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { generateWorld } from "./generator.mjs";
import { validateWorld } from "./health.mjs";
import { gitSha, hashFiles, readJson, repoRoot, writeJson } from "./io.mjs";
import { counterfactualPairs, scenarioLibrary } from "./scenarios.mjs";
import { humanInspection, labHealth } from "./report.mjs";
import { assertSafeEnvironment } from "./safety.mjs";
import { productSeedSql } from "./product-sql.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const command = args.shift() ?? "help";
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const configPath = resolve(repoRoot, option("config", "decision-lab/config/smoke-v1.json"));
const outputRoot = resolve(repoRoot, option("output", "decision-lab/.generated"));

async function metadata() {
  const migrationDir = resolve(repoRoot, "supabase/migrations");
  const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).map((name) => resolve(migrationDir, name));
  return { gitSha: gitSha(repoRoot), migrationHash: await hashFiles(migrations), engineSourceHash: await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]) };
}

async function build(config) {
  const world = generateWorld(config, await metadata());
  const health = validateWorld(world);
  if (!health.valid) throw new Error(`World Health failed: ${JSON.stringify(health.failures)}`);
  const scenarios = scenarioLibrary(world);
  const counterfactuals = counterfactualPairs(scenarios);
  const root = resolve(outputRoot, world.manifest.worldId);
  await writeJson(resolve(root, "manifest.json"), world.manifest);
  await writeJson(resolve(root, "world.json"), world);
  await writeJson(resolve(root, "world-health.json"), health);
  await writeJson(resolve(root, "scenarios.json"), scenarios);
  await writeJson(resolve(root, "counterfactuals.json"), counterfactuals);
  await writeJson(resolve(root, "human-inspection.json"), humanInspection(world, scenarios));
  await writeJson(resolve(root, "lab-health.json"), labHealth(health, { scenarioCount: scenarios.length }));
  return { root, world, health, scenarios, counterfactuals };
}

if (["generate", "validate", "seed", "history", "embeddings", "run", "counterfactual", "export", "sql"].includes(command)) {
  const config = await readJson(configPath);
  const result = await build(config);
  let sqlPath = null;
  if (command === "sql" || command === "seed") {
    sqlPath = resolve(result.root, "product-seed.sql");
    await mkdir(dirname(sqlPath), { recursive: true });
    await writeFile(sqlPath, productSeedSql(result.world, { includeEmbeddings: true }));
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command, mode: config.embeddingMode, output: result.root, sqlPath, manifest: result.world.manifest, health: result.health.summary, note: command === "validate" ? "Pure generator/world-health validation; no database mutation." : command === "seed" || command === "sql" ? "Generated a local-only SQL seed using canonical Product tables plus isolated decision_lab truth tables; apply only after safety guards pass." : "World artifacts generated. Database operations require explicit safe local environment." }, null, 2)}\n`);
} else if (["create", "reset", "destroy"].includes(command)) {
  assertSafeEnvironment(process.env, repoRoot);
  if (command === "reset" || command === "destroy") await rm(outputRoot, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ ok: true, command, safety: "local-only", note: command === "create" ? "Use the disposable Supabase orchestration script documented in D1 operations." : "Generated Decision Lab artifacts removed; database lifecycle remains owned by disposable Supabase orchestration." })}\n`);
} else {
  process.stdout.write(`Backyrd Decision Lab V1\n\nCommands: generate|validate|create|seed|sql|history|embeddings|run|counterfactual|export|reset|destroy\nOptions: --config <json> --output <directory>\n\nDatabase lifecycle commands require DECISION_LAB_ALLOW_LOCAL=1 and DECISION_LAB_DB_URL pointing to localhost.\n`);
}
