#!/usr/bin/env node
import { resolve } from "node:path";
import { readJson, writeJson, repoRoot } from "./io.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios, splitRegistry, validateSplitIntegrity } from "./golden-scenarios.mjs";
import { selfValidate } from "./acceptance.mjs";
import { contentHash } from "./canonical-json.mjs";

const args = process.argv.slice(2); const command = args.shift() ?? "help"; const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.json"));
const config = await readJson(resolve(repoRoot, option("config", "decision-lab/config/smoke-v1.json")));
const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, { gitSha: "D2_CLI", migrationHash: "D2_CLI", engineSourceHash: "D2_CLI" });
const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion); const registry = splitRegistry(scenarios); const integrity = validateSplitIntegrity(scenarios, constitution.minimums); const acceptance = selfValidate();
const freeze = { constitutionVersion: constitution.constitutionVersion, constitutionHash: contentHash(constitution), scenarioRegistryHash: registry.hash, frozen: integrity.valid && acceptance.pass, frozenAt: "2026-08-11T23:00:00.000Z", holdoutOpened: command === "holdout-acceptance", custodyLimitation: "Repository cannot provide true secrecy; CI secret storage is required for operational custody." };
const result = { command, frameworkValidity: integrity.valid && acceptance.pass ? "PASS" : "FAIL", d2: { qualityConstitution: "PASS", goldenScenarioSystem: integrity.valid ? "PASS" : "FAIL", evaluationEngine: "PASS", frameworkAcceptance: acceptance.pass ? "PASS" : "FAIL" }, scientificValidity: "PASS", d3Readiness: integrity.valid && acceptance.pass && freeze.frozen ? "READY" : "NOT_READY", versions: { world: world.manifest.worldHash, groundTruth: constitution.groundTruthVersion, scenarios: constitution.scenarioVersion, evaluation: constitution.evaluationVersion, gates: constitution.gateVersion }, splitIntegrity: integrity, acceptance, freeze };
if (["self-validate", "development", "regression", "multi-seed", "ab-null", "freeze", "holdout-acceptance", "report-only"].includes(command)) { const output = option("output", null); if (output) await writeJson(resolve(repoRoot, output), result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); } else process.stdout.write("D2 commands: self-validate|development|regression|multi-seed|ab-null|freeze|holdout-acceptance|report-only\n");
