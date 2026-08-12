import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { validateD21Freeze } from "./d2-freeze.mjs";
import { hardGateCoverage, HARD_GATE_REGISTRY } from "./hard-gates.mjs";
import { readJson, repoRoot } from "./io.mjs";

export const D3_EXPECTED = Object.freeze({
  freezeManifestHash: "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf",
  constitutionHash: "cf0df61e94db56a480a1334b701fe1725d563c989225bdfd5158ba16e0a5fca1",
  scenarioRegistryHash: "4f3e4294c385e29c35ea7911557bfc5bc014115b28cb6f58a1a856706c971bef",
  evaluationHash: "c60fdb75dc6e7550bc106dfbc1fd648e4f39227eb6901ebc2775ef62a9feae76",
  hardGateRegistryHash: "2925d28d4eee37580fe3b6ddc6cb9c6adeb772c033122b63d749bab49f1230dc",
  frameworkAcceptanceHash: "a1280e3f9314d04f673c8590653506d3954eb005d127e5c3ebfcbaad8be3f3ba",
  engineSourceHash: "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba"
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (path) => sha256(await readFile(resolve(repoRoot, path)));
const sqlDefinitionHash = async (path, start, end) => {
  const source = await readFile(resolve(repoRoot, path), "utf8");
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`SQL definition start missing: ${start}`);
  const to = source.indexOf(end, from);
  if (to < 0) throw new Error(`SQL definition end missing: ${end}`);
  return sha256(source.slice(from, to));
};

export async function d3Preflight() {
  const freeze = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.freeze.json"));
  const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
  const plan = await readJson(resolve(repoRoot, "decision-lab/config/d3-v13-baseline-v1.plan.json"));
  const freezeValidation = await validateD21Freeze(freeze);
  const coverage = hardGateCoverage(constitution);
  const identities = {
    freezeManifestHash: freeze.freezeManifestHash,
    constitutionHash: contentHash(constitution),
    scenarioRegistryHash: freeze.scenarioRegistryHash,
    evaluationHash: freeze.evaluationHash,
    hardGateRegistryHash: freeze.hardGateRegistryHash,
    frameworkAcceptanceHash: freeze.frameworkAcceptanceHash,
    engineSourceHash: await fileHash("supabase/functions/decision-v13/index.ts")
  };
  const mismatches = Object.entries(D3_EXPECTED).filter(([key, expected]) => identities[key] !== expected).map(([key, expected]) => ({ key, expected, actual: identities[key] }));
  const baseMigration = "supabase/migrations/20260808120517_backyrd_canonical_baseline.sql";
  const snapshot = {
    gitSha: plan.sourceGitSha,
    v13SourceHash: identities.engineSourceHash,
    v13Version: plan.engine.version,
    v12DefinitionHash: await sqlDefinitionHash(baseMigration, 'CREATE OR REPLACE FUNCTION "public"."backyrd_get_decision_spots_v12"', 'ALTER FUNCTION "public"."backyrd_get_decision_spots_v12"'),
    v11DefinitionHash: await sqlDefinitionHash(baseMigration, 'CREATE OR REPLACE FUNCTION "public"."backyrd_get_decision_spots_v11"', 'ALTER FUNCTION "public"."backyrd_get_decision_spots_v11"'),
    semanticRetrievalDefinitionHash: await sqlDefinitionHash(baseMigration, 'CREATE OR REPLACE FUNCTION "public"."backyrd_match_spot_embeddings_v13"', 'ALTER FUNCTION "public"."backyrd_match_spot_embeddings_v13"'),
    productEligibilityDefinitionHash: await fileHash("supabase/migrations/20260811210000_enforce_decision_product_eligibility.sql"),
    distributionContractHash: await fileHash("supabase/migrations/20260810191712_add_distribution_policy_and_consumption.sql"),
    embeddingModel: plan.engine.embeddingModel,
    embeddingDimensions: plan.engine.embeddingDimensions,
    generatorVersion: plan.generatorVersion,
    groundTruthVersion: plan.groundTruthVersion,
    evaluationVersion: plan.evaluationVersion,
    constitutionHash: identities.constitutionHash,
    scenarioRegistryHash: identities.scenarioRegistryHash
  };
  const reasons = [
    ...freezeValidation.reasons,
    ...mismatches.map(({ key }) => `D3_IDENTITY_MISMATCH:${key}`),
    ...(coverage.pass && coverage.rows.length === 9 && HARD_GATE_REGISTRY.length === 9 ? [] : ["HARD_GATE_COVERAGE_INCOMPLETE"]),
    ...(freeze.scientificValidity === "PASS" ? [] : ["SCIENTIFIC_VALIDITY_NOT_PASS"]),
    ...(freeze.d3Readiness === "READY" ? [] : ["D2_1_D3_READINESS_NOT_READY"]),
    ...(plan.freezeManifestHash === D3_EXPECTED.freezeManifestHash ? [] : ["RUN_PLAN_FREEZE_MISMATCH"]),
    ...(plan.engine.sourceHash === D3_EXPECTED.engineSourceHash ? [] : ["RUN_PLAN_ENGINE_MISMATCH"])
  ];
  const result = {
    preflightVersion: "d3-preflight-v1",
    status: reasons.length ? "FAIL" : "PASS",
    reasons,
    identities,
    freezeValidation: { valid: freezeValidation.valid, reasons: freezeValidation.reasons },
    hardGateCoverage: { pass: coverage.pass, count: coverage.rows.length, rows: coverage.rows },
    scientificValidity: freeze.scientificValidity,
    engineMutation: identities.engineSourceHash === D3_EXPECTED.engineSourceHash ? "NONE" : "DETECTED",
    snapshot,
    planHash: contentHash(plan),
    productionAccess: "NONE"
  };
  result.preflightHash = contentHash(result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await d3Preflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
