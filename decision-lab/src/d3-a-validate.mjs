#!/usr/bin/env node
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot } from "./io.mjs";
import { resolve } from "node:path";

const path = resolve(repoRoot, process.argv[2] ?? "decision-lab/baselines/v13-d3-a-v1.json");
const value = await readJson(path);
const expected = value.resultHash;
const body = structuredClone(value);
delete body.resultHash;
delete body.runPlanHash;
const checks = {
  baselineId: value.baselineId === "backyrd-decision-v13-baseline-d3-a-v1",
  engine: value.identity?.engineSourceHash === "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba",
  parentFreeze: value.identity?.parentFreezeManifestHash === "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf",
  treatmentFreeze: value.identity?.personalizationTreatmentFreezeHash === "9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053",
  scenarioCount: value.sampleSizes?.goldenDecisions === 126,
  splits: ["DEVELOPMENT", "REGRESSION", "LOCKED_HOLDOUT"].every((split) => value.metrics?.splits?.[split]?.n > 0),
  arms: ["counterfactualPairs", "personalizationTreatments", "remixPairs", "explanationCandidates"].every((key) => value.sampleSizes?.[key] > 0),
  failures: Array.isArray(value.failureDecomposition?.rows),
  resultHash: expected === contentHash(body),
  noProduction: value.validity?.productionAccess === "NONE",
  noSecrets: !/(service_role|OPENAI_API_KEY|JWT_SECRET|supabase\.co)/i.test(JSON.stringify(value))
};
const valid = Object.values(checks).every(Boolean);
process.stdout.write(`${JSON.stringify({ valid, checks, resultHash: expected }, null, 2)}\n`);
if (!valid) process.exitCode = 1;
