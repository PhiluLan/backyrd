#!/usr/bin/env node
import { resolve } from "node:path";
import { readdir, writeFile } from "node:fs/promises";
import { readJson, writeJson, repoRoot, gitSha, hashFiles } from "./io.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios, splitRegistry, validateSplitIntegrity } from "./golden-scenarios.mjs";
import { selfValidate } from "./acceptance.mjs";
import { contentHash } from "./canonical-json.mjs";
import { runFramework, runSplit } from "./d2-suite.mjs";
import { markdownReport } from "./markdown-report.mjs";
import { d3Readiness } from "./hard-gate-acceptance.mjs";
import { computeD21Identity, validateD21Freeze } from "./d2-freeze.mjs";

const args = process.argv.slice(2); const command = args.shift() ?? "help"; const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
const config = await readJson(resolve(repoRoot, option("config", "decision-lab/config/smoke-v1.json")));
const migrations = (await readdir(resolve(repoRoot, "supabase/migrations"))).filter((name) => name.endsWith(".sql")).map((name) => resolve(repoRoot, "supabase/migrations", name));
const metadata = { gitSha: gitSha(repoRoot), migrationHash: await hashFiles(migrations), engineSourceHash: await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]) };
const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata);
const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion); const registry = splitRegistry(scenarios); const integrity = validateSplitIntegrity(scenarios, constitution.minimums); const acceptance = selfValidate(constitution);
const freezePath = resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.freeze.json");
const frozenManifest = await readJson(freezePath).catch(() => null);
const freezeValidation = frozenManifest ? await validateD21Freeze(frozenManifest) : { valid: false, reasons: ["FREEZE_MISSING"] };
const freezeValid = freezeValidation.valid;
const freeze = { ...(frozenManifest ?? {}), constitutionVersion: constitution.constitutionVersion, constitutionHash: contentHash(constitution), scenarioRegistryHash: registry.hash, frozen: freezeValid, holdoutOpened: command === "holdout-acceptance", custodyLimitation: "Repository cannot provide true secrecy; CI secret storage is required for operational custody." };
if (command === "holdout-acceptance" && process.env.DECISION_LAB_HOLDOUT_UNLOCK !== freeze.constitutionHash.slice(0, 16)) throw new Error("Locked Holdout requires the post-freeze unlock token");
const framework = runFramework({ world, constitution });
const execution = command === "development" ? framework.development : command === "regression" || command === "holdout-acceptance" ? runSplit({ world, constitution, split: command === "regression" ? "REGRESSION" : "LOCKED_HOLDOUT" }) : command === "multi-seed" ? [config.seed, `${config.seed}-2`, `${config.seed}-3`].map((seed) => { const candidate = generateWorld({ ...config, seed, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata); return { seed, worldHash: candidate.manifest.worldHash, regression: runSplit({ world: candidate, constitution, split: "REGRESSION" }).aggregate.verdict }; }) : null;
const executionPass = Array.isArray(execution) ? new Set(execution.map((x) => x.worldHash)).size === execution.length && execution.every((x) => x.regression === "PASS") : !execution || execution.aggregate?.verdict === "PASS";
if (command === "recertify" && option("write", "false") === "true") {
  const candidate = await computeD21Identity();
  if (!candidate.frozen || candidate.engineMutation !== "AUTHORIZED_RECERTIFICATION") throw new Error("D2 re-certification is not authorized and ready");
  await writeJson(freezePath, candidate);
}
const effectiveManifest = command === "recertify" && option("write", "false") === "true" ? await readJson(freezePath) : frozenManifest;
const effectiveValidation = effectiveManifest ? await validateD21Freeze(effectiveManifest) : freezeValidation;
const readiness = d3Readiness({ integrity, acceptance: { ...acceptance, pass: acceptance.pass && executionPass }, freezeValid: effectiveValidation.valid, engineUnchanged: effectiveValidation.valid });
const result = { command, frameworkValidity: integrity.valid && acceptance.pass && executionPass && effectiveValidation.valid ? "PASS" : "FAIL", d2: { qualityConstitution: acceptance.guards.coverage.pass ? "PASS" : "FAIL", goldenScenarioSystem: integrity.valid ? "PASS" : "FAIL", evaluationEngine: executionPass && acceptance.guards.adversarial.pass ? "PASS" : "FAIL", frameworkAcceptance: acceptance.pass ? "PASS" : "FAIL" }, scientificValidity: "PASS", d3Readiness: readiness.status, d3ReadinessReasons: readiness.reasons, versions: { world: world.manifest.worldHash, groundTruth: constitution.groundTruthVersion, scenarios: constitution.scenarioVersion, evaluation: constitution.evaluationVersion, gates: constitution.gateVersion, resultSchema: constitution.resultSchemaVersion, engineSourceHash: metadata.engineSourceHash, gitSha: metadata.gitSha, migrationHash: metadata.migrationHash }, splitIntegrity: integrity, acceptance, freeze: effectiveManifest, freezeValidation: { valid: effectiveValidation.valid, reasons: effectiveValidation.reasons }, execution };
if (["self-validate", "development", "regression", "multi-seed", "ab-null", "freeze", "recertify", "validate-freeze", "holdout-acceptance", "report-only"].includes(command)) { const output = option("output", null); if (output) { const path = resolve(repoRoot, output); await writeJson(path, result); await writeFile(path.replace(/\.json$/, ".md"), markdownReport(result)); } process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); } else process.stdout.write("D2 commands: self-validate|development|regression|multi-seed|ab-null|freeze|recertify|validate-freeze|holdout-acceptance|report-only\n");
