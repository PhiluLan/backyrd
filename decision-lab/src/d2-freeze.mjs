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

const recertificationPath = resolve(repoRoot, "decision-lab/config/decision-v13-production-recertification-v22.json");
const requiredRecertificationInvariants = Object.freeze({
  hardEligibilityBeforeRanking: "PASS",
  distributionEligibilityBeforeFusion: "PASS",
  explicitNegationsAreHardExclusions: "PASS",
  ambiguousNegationsRemainNonExcluding: "PASS",
  boundedBaselLocationConstraintsUseCanonicalGeoEvidence: "PASS",
  priceUnknownNeverQualifiesAsMatch: "PASS",
  verifiedExactConstraintsReturnAtMostAvailableMatches: "PASS",
  zeroVerifiedMatchesReturnsHonestEmpty: "PASS",
  openNowAndTimeUseCanonicalSpotHours: "PASS",
  missingOpeningHoursRemainUnknown: "PASS",
  visibleImpressionsPersistBeforeContinuation: "PASS",
  continuationNeverRepeatsVisibleCandidates: "PASS",
  factualTupleRemainsDeterministicAuthority: "PASS",
  reasonsRequireConfirmedCandidateFacts: "PASS",
  reasonsNeverPromoteUnknownToMatch: "PASS",
  offeringPurposeIsNotUserTaste: "PASS",
  d2HardGateConstitution: "UNCHANGED",
  moodSemantics: "UNCHANGED",
  tasteTrustN4Semantics: "UNCHANGED",
  offeringPurposeSemantics: "EXTENDED_ONLY_FOR_GERMAN_BREAKFAST_INFLECTION",
  generalRankingArchitecture: "UNCHANGED",
  explicitNearReferenceNeverIgnored: "PASS",
  baselStationReferenceDisambiguation: "PASS",
  dynamicLandmarkResolutionIsServerOnlyAndBounded: "PASS",
  unresolvedOrAmbiguousReferenceReturnsHonestEmpty: "PASS",
  nearEligibilityUsesExistingSpotCoordinates: "PASS",
  outOfRadiusCandidatesCannotFillResults: "PASS",
  locationReasonRequiresAppliedCoordinateEvidence: "PASS",
  defaultNearRadiusAdminConfigVersioned: "PASS",
  invalidOrMissingLocationConfigFailsClosed: "PASS",
  adminNearRadiusRangeIsBounded: "PASS",
  adminLocationMutationIsServiceOnly: "PASS",
  adminLocationMutationIsValidatedAndAudited: "PASS",
  explicitUserDistanceRemainsAuthoritative: "PASS",
  dynamicReferenceResolutionPreserved: "PASS",
  manualSpotLandmarkTaggingRequired: "NO",
  canonicalMainOnlyDeployment: "PASS",
  sourceAwareEdgeDeployment: "PASS",
  transitiveDependenciesBound: "PASS",
  migrationDeploymentFailClosed: "PASS",
  identityOnlyMergeCausesRuntimeDeploy: "NO",
  productionDecisionVersionPreservedAcrossControlMerges: "PASS",
  canonicalMigrationRecoveryAudited: "PASS",
  exactPendingMigrationScopeReverified: "PASS"
});

export async function validateEngineRecertification(contractOverride = null) {
  const contract = contractOverride ?? await readJson(recertificationPath);
  const protectedSemanticSourceSetHash = await hashFiles(absolute(contract.protectedSemanticSourceSet.paths));
  const certificationEvidenceSetHash = await hashFiles(absolute(contract.certificationEvidenceSet.paths));
  const engineSourceHash = await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]);
  const productionEntrypointSource = await readFile(resolve(repoRoot, contract.production.entrypointPath), "utf8").catch(() => null);
  const productionEntrypointSha256 = productionEntrypointSource === null ? null : createHash("sha256").update(productionEntrypointSource).digest("hex");
  const reasons = [
    ...(contract.version === "decision-v13-production-recertification-v22" ? [] : ["RECERTIFICATION_VERSION_INVALID"]),
    ...(contract.status === "AUTHORIZED" ? [] : ["RECERTIFICATION_NOT_AUTHORIZED"]),
    ...(contract.authorization?.previousEngineSourceHash === "cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000" ? [] : ["PREVIOUS_BASELINE_IDENTITY_MISMATCH"]),
    ...(contract.authorization?.previousRecertificationVersion === "decision-v13-production-recertification-v21" && contract.authorization?.previousRecertificationHash === "d3a4911cc583f76f1ef03591b72dda060e326d32ba586c0b740da200fe9ec1bc" ? [] : ["PREVIOUS_RECERTIFICATION_IDENTITY_MISMATCH"]),
    ...(contract.authorization?.baseCommit === "832933a78e19be74404be0d1c35c467b23b94852" ? [] : ["AUTHORIZED_BASE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.authorizedSourceCommit === "7351604805a713a5b4221d39360e3e0ec2ef83f1" ? [] : ["AUTHORIZED_SOURCE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.authorizedSemanticSourceCommit === "e1043603cba0f6880d74a19d52701510dfc97d48" ? [] : ["AUTHORIZED_SEMANTIC_SOURCE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.changeClass === "GATE7_FINAL_PRODUCTION_ACCEPTANCE" ? [] : ["AUTHORIZED_CHANGE_CLASS_MISMATCH"]),
    ...(contract.protectedSemanticSourceSet.hash === protectedSemanticSourceSetHash ? [] : ["PROTECTED_SEMANTIC_SOURCE_SET_MISMATCH"]),
    ...(contract.certificationEvidenceSet.hash === certificationEvidenceSetHash ? [] : ["CERTIFICATION_EVIDENCE_SET_MISMATCH"]),
    ...(engineSourceHash === contract.authorization?.authorizedEngineSourceHash ? [] : ["AUTHORIZED_ENGINE_SOURCE_MISMATCH"]),
    ...(contract.production?.supabaseProjectRef === "hjgcrrzfjchzqoegcywn" &&
      contract.production?.functionSlug === "decision-v13" &&
      contract.production?.activeVersion === 124 &&
      contract.production?.verifyJwt === true &&
      contract.production?.bundleHash === "a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13" &&
      contract.production?.entrypointPath === "supabase/functions/decision-v13/index.deploy.ts" &&
      contract.production?.entrypointSource === "import \"./live-index.ts\";\n" &&
      contract.production?.entrypointSha256 === "4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299" &&
      contract.production?.deployedFileCount === 41 &&
      contract.production?.repositoryMatchedFileCount === 41 &&
      contract.production?.sourceIdentity === "CANONICAL_MAIN_C1FCB4A_PRODUCTION_V124_41_OF_41_BYTE_MATCHED" &&
      contract.production?.deploymentSourceSetHash === "a265e8559d707d8641fc8ea937303bb2cdf521cf86fd3569ff8fff4c17f8c6af" &&
      contract.production?.deploymentConfigHash === "56771eeee30d34f03eaab5a52b161d39d3a2d18e7982343623514e1fade112eb" &&
      contract.production?.eszipBodySha256 === "a17f9dabdab92a61baf15045e7434d1290291e694c94a9c49b9f64a2c16d681d" &&
      contract.production?.eszipEvidenceHash === "e653c2bb322b9ed574d390ac30272651515ceaa45f66db4e65a2f7a5b7d085bc" &&
      contract.production?.deploymentControlMainSha === "c1fcb4ad76e21b52c0d064192e129abe6f554e8e" &&
      contract.production?.supabaseCliVersion === "2.98.2" ? [] : ["PRODUCTION_IDENTITY_NOT_CERTIFIED"]),
    ...(productionEntrypointSource === contract.production?.entrypointSource && productionEntrypointSha256 === contract.production?.entrypointSha256 ? [] : ["PRODUCTION_ENTRYPOINT_REPOSITORY_MISMATCH"]),
    ...Object.entries(requiredRecertificationInvariants).filter(([key, value]) => contract.invariants?.[key] !== value).map(([key]) => `SEMANTIC_INVARIANT_NOT_CERTIFIED:${key}`)
  ];
  const identity = {
    version: contract.version,
    authorizationCommit: contract.authorization.baseCommit,
    authorizedSourceCommit: contract.authorization.authorizedSourceCommit,
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
    productionDeploymentSourceSetHash: contract.production.deploymentSourceSetHash,
    productionDeploymentConfigHash: contract.production.deploymentConfigHash,
    productionEszipBodySha256: contract.production.eszipBodySha256,
    productionEszipEvidenceHash: contract.production.eszipEvidenceHash,
    deploymentControlMainSha: contract.production.deploymentControlMainSha,
    supabaseCliVersion: contract.production.supabaseCliVersion,
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
    sourceGitSha: recertification.valid ? recertification.identity.authorizedSourceCommit : "c324e71e2e4f2e4b6815289d29f681690edbaaac",
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
      ? { freezeManifestHash: "1659a05bd4557a6e87a7fa66b2d0e44271baf21818541722feec63120f22b74e", reason: "GATE7_FINAL_PRODUCTION_ACCEPTANCE" }
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
