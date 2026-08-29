import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios, splitRegistry, validateSplitIntegrity } from "./golden-scenarios.mjs";
import { frameworkGuards } from "./hard-gate-acceptance.mjs";
import { HARD_GATE_REGISTRY, hardGateCoverage } from "./hard-gates.mjs";
import { hashFiles, readJson, repoRoot } from "./io.mjs";

export const D2_V1_IDENTITIES = Object.freeze({
  constitutionHash: "3ff5a5cc54014abdbd51a5a65a4d8110c10b215fbd27828625457f2269f57bbd",
  scenarioRegistryHash: "2e3c9151021d647cb5a58b913970e62bc26580746f88ac63bf47b9c56f75b22c",
  engineSourceHash: "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba"
});

const evaluationFiles = ["decision-lab/src/contracts.mjs", "decision-lab/src/evaluator.mjs", "decision-lab/src/hard-gates.mjs"];
const acceptanceFiles = ["decision-lab/src/acceptance.mjs", "decision-lab/src/hard-gate-acceptance.mjs"];
const absolute = (paths) => paths.map((path) => resolve(repoRoot, path));

const recertificationPath = resolve(repoRoot, "decision-lab/config/decision-v13-production-recertification-v5.json");
const requiredRecertificationInvariants = Object.freeze({
  hardEligibilityBeforeRanking: "PASS",
  distributionEligibilityBeforeFusion: "PASS",
  offeringPurposeRecallAddsNoScore: "PASS",
  factualTupleRemainsDeterministicAuthority: "PASS",
  reasonsRequireConfirmedCandidateFacts: "PASS",
  offeringPurposeIsNotUserTaste: "PASS",
  legacyQueriesWithoutOfferingPurposeIntent: "SEMANTICALLY_UNCHANGED",
  d2HardGateConstitution: "UNCHANGED"
});

export async function validateEngineRecertification(contractOverride = null) {
  const contract = contractOverride ?? await readJson(recertificationPath);
  const protectedSemanticSourceSetHash = await hashFiles(absolute(contract.protectedSemanticSourceSet.paths));
  const certificationEvidenceSetHash = await hashFiles(absolute(contract.certificationEvidenceSet.paths));
  const engineSourceHash = await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]);
  const productionEntrypointSource = await readFile(resolve(repoRoot, contract.production.entrypointPath), "utf8").catch(() => null);
  const productionEntrypointSha256 = productionEntrypointSource === null ? null : createHash("sha256").update(productionEntrypointSource).digest("hex");
  const reasons = [
    ...(contract.version === "decision-v13-production-recertification-v5" ? [] : ["RECERTIFICATION_VERSION_INVALID"]),
    ...(contract.status === "AUTHORIZED" ? [] : ["RECERTIFICATION_NOT_AUTHORIZED"]),
    ...(contract.authorization?.previousEngineSourceHash === "28e178dee7192cb303b07574f31f1e86f58bc80048b23ba00bf032ca02c2bfc4" ? [] : ["PREVIOUS_BASELINE_IDENTITY_MISMATCH"]),
    ...(contract.authorization?.previousRecertificationVersion === "decision-v13-production-recertification-v4" && contract.authorization?.previousRecertificationHash === "da9e54e14b790079ee6b6d0162359f231a64104fbab11b2bd19aeaa29469c4b9" ? [] : ["PREVIOUS_RECERTIFICATION_IDENTITY_MISMATCH"]),
    ...(contract.authorization?.changeCommit === "5b213e157f4ca78349359cd8efd6d42dc8f434be" ? [] : ["AUTHORIZED_CHANGE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.parentCommit === "196c111810833528a04e795e73168bb256ba91fb" && contract.authorization?.sourceCommit === "6fc06e8ab822fd1a73b5b6f4c3cb0f0f10826dc7" ? [] : ["AUTHORIZED_CHANGE_PARENT_MISMATCH"]),
    ...(contract.protectedSemanticSourceSet.hash === protectedSemanticSourceSetHash ? [] : ["PROTECTED_SEMANTIC_SOURCE_SET_MISMATCH"]),
    ...(contract.certificationEvidenceSet.hash === certificationEvidenceSetHash ? [] : ["CERTIFICATION_EVIDENCE_SET_MISMATCH"]),
    ...(engineSourceHash === "28e178dee7192cb303b07574f31f1e86f58bc80048b23ba00bf032ca02c2bfc4" ? [] : ["AUTHORIZED_ENGINE_SOURCE_MISMATCH"]),
    ...(contract.production?.supabaseProjectRef === "hjgcrrzfjchzqoegcywn" &&
      contract.production?.functionSlug === "decision-v13" &&
      contract.production?.activeVersion === 75 &&
      contract.production?.verifyJwt === true &&
      contract.production?.bundleHash === "b4ba1661c7507c278bcd6bd9b2dba51575991e95cf19ecc7dcedad743a47ab5f" &&
      contract.production?.entrypointPath === "supabase/functions/decision-v13/index.deploy.ts" &&
      contract.production?.entrypointSource === "import \"./live-index.ts\";\n" &&
      contract.production?.entrypointSha256 === "4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299" &&
      contract.production?.deployedFileCount === 38 &&
      contract.production?.repositoryMatchedFileCount === 38 &&
      contract.production?.sourceIdentity === "EXACT_REPOSITORY_SOURCE_SET_INCLUDING_PINNED_ENTRYPOINT" ? [] : ["PRODUCTION_IDENTITY_NOT_CERTIFIED"]),
    ...(productionEntrypointSource === contract.production?.entrypointSource && productionEntrypointSha256 === contract.production?.entrypointSha256 ? [] : ["PRODUCTION_ENTRYPOINT_REPOSITORY_MISMATCH"]),
    ...Object.entries(requiredRecertificationInvariants).filter(([key, value]) => contract.invariants?.[key] !== value).map(([key]) => `SEMANTIC_INVARIANT_NOT_CERTIFIED:${key}`)
  ];
  const identity = {
    version: contract.version,
    authorizationCommit: contract.authorization.changeCommit,
    authorizationHash: contentHash(contract.authorization),
    engineSourceHash,
    protectedSemanticSourceSetHash,
    certificationEvidenceSetHash,
    productionProjectRef: contract.production.supabaseProjectRef,
    productionFunctionSlug: contract.production.functionSlug,
    productionFunctionVersion: contract.production.activeVersion,
    productionBundleHash: contract.production.bundleHash,
    productionEntrypointPath: contract.production.entrypointPath,
    productionEntrypointSourceHash: contentHash(contract.production.entrypointSource),
    productionEntrypointSha256: contract.production.entrypointSha256,
    productionDeployedFileCount: contract.production.deployedFileCount,
    productionRepositoryMatchedFileCount: contract.production.repositoryMatchedFileCount,
    productionSourceIdentity: contract.production.sourceIdentity,
    invariantCount: Object.keys(requiredRecertificationInvariants).length,
    invariantsHash: contentHash(contract.invariants)
  };
  return { valid: reasons.length === 0, reasons, contract, identity, recertificationHash: contentHash(identity) };
}

export async function computeD21Identity() {
  const constitution = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.json"));
  const config = await readJson(resolve(repoRoot, "decision-lab/config/smoke-v1.json"));
  const engineSourceHash = await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]);
  const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, { gitSha: "D2_1_FREEZE", migrationHash: "D2_1_FREEZE", engineSourceHash });
  const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion);
  const registry = splitRegistry(scenarios);
  const integrity = validateSplitIntegrity(scenarios, constitution.minimums);
  const guards = frameworkGuards(constitution);
  const evaluationHash = await hashFiles(absolute(evaluationFiles));
  const frameworkAcceptanceHash = await hashFiles(absolute(acceptanceFiles));
  const hardGateRegistryHash = contentHash(HARD_GATE_REGISTRY.map(({ evaluate: _evaluate, applicable: _applicable, ...gate }) => gate));
  const recertification = await validateEngineRecertification();
  const engineAuthorized = engineSourceHash === D2_V1_IDENTITIES.engineSourceHash || recertification.valid;
  const semantic = {
    d2Version: "2.1",
    constitutionVersion: constitution.constitutionVersion,
    constitutionHash: contentHash(constitution),
    scenarioRegistryVersion: constitution.scenarioVersion,
    scenarioRegistryHash: registry.hash,
    evaluationVersion: constitution.evaluationVersion,
    evaluationHash,
    gateVersion: constitution.gateVersion,
    hardGateRegistryHash,
    frameworkAcceptanceVersion: constitution.frameworkAcceptanceVersion,
    frameworkAcceptanceHash,
    resultSchemaVersion: constitution.resultSchemaVersion,
    generatorVersion: config.generatorVersion,
    groundTruthVersion: constitution.groundTruthVersion,
    engineSourceHash,
    sourceGitSha: recertification.valid ? recertification.identity.authorizationCommit : "c324e71e2e4f2e4b6815289d29f681690edbaaac",
    engineRecertificationVersion: recertification.valid ? recertification.identity.version : null,
    engineRecertificationHash: recertification.valid ? recertification.recertificationHash : null,
    protectedSemanticSourceSetHash: recertification.valid ? recertification.identity.protectedSemanticSourceSetHash : null,
    productionFunctionVersion: recertification.valid ? recertification.identity.productionFunctionVersion : null,
    productionBundleHash: recertification.valid ? recertification.identity.productionBundleHash : null,
    hardGateCount: HARD_GATE_REGISTRY.length,
    hardGateCoverage: hardGateCoverage(constitution),
    adversarial: guards.adversarial.summary,
    scientificValidity: "PASS",
    engineMutation: engineSourceHash === D2_V1_IDENTITIES.engineSourceHash ? "NONE" : recertification.valid ? "AUTHORIZED_RECERTIFICATION" : "DETECTED",
    d3Readiness: integrity.valid && guards.pass && engineAuthorized ? "READY" : "NOT_READY"
  };
  return {
    ...semantic,
    freezeManifestHash: contentHash(semantic),
    frozen: semantic.d3Readiness === "READY",
    frozenAt: recertification.valid ? recertification.contract.authorization.approvedAt : "2026-08-12T19:00:00.000Z",
    supersedes: recertification.valid
      ? { freezeManifestHash: "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf", reason: "AUTHORIZED_PRODUCTION_ENGINE_RECERTIFICATION" }
      : { constitutionVersion: "decision-quality-v1", reason: "D3-CONSTITUTION-ISSUE-001" },
    integrity
  };
}

export async function validateD21Freeze(manifest) {
  const actual = await computeD21Identity();
  const keys = ["constitutionHash", "scenarioRegistryHash", "evaluationHash", "hardGateRegistryHash", "frameworkAcceptanceHash", "resultSchemaVersion", "engineSourceHash", "engineRecertificationVersion", "engineRecertificationHash", "protectedSemanticSourceSetHash", "productionFunctionVersion", "productionBundleHash", "freezeManifestHash"];
  const mismatches = keys.filter((key) => manifest[key] !== actual[key]).map((key) => ({ key, expected: manifest[key], actual: actual[key] }));
  const reasons = [...mismatches.map((entry) => `HASH_MISMATCH:${entry.key}`)];
  if (!actual.hardGateCoverage.pass) reasons.push("HARD_GATE_COVERAGE_INCOMPLETE");
  if (actual.adversarial.falsePasses !== 0 || actual.adversarial.falseFails !== 0 || actual.adversarial.notEvaluatedLeakage !== 0) reasons.push("ADVERSARIAL_ACCEPTANCE_FAILED");
  if (!new Set(["NONE", "AUTHORIZED_RECERTIFICATION"]).has(actual.engineMutation)) reasons.push("ENGINE_MUTATION_DETECTED");
  return { valid: reasons.length === 0, reasons, mismatches, actual };
}
