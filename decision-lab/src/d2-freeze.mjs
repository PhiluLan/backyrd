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

const recertificationPath = resolve(repoRoot, "decision-lab/config/decision-v13-production-recertification-v18.json");
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
    ...(contract.version === "decision-v13-production-recertification-v18" ? [] : ["RECERTIFICATION_VERSION_INVALID"]),
    ...(contract.status === "AUTHORIZED" ? [] : ["RECERTIFICATION_NOT_AUTHORIZED"]),
    ...(contract.authorization?.previousEngineSourceHash === "c80c275b5f09adf0e3081dc10763a06846f81333097fd2a9ead6e8dfb8d7987a" ? [] : ["PREVIOUS_BASELINE_IDENTITY_MISMATCH"]),
    ...(contract.authorization?.previousRecertificationVersion === "decision-v13-production-recertification-v17" && contract.authorization?.previousRecertificationHash === "b1bcfaf240d21cfe1269273f5deb1f2be8479a461acb2eb2ace1589ddf4f5909" ? [] : ["PREVIOUS_RECERTIFICATION_IDENTITY_MISMATCH"]),
    ...(contract.authorization?.baseCommit === "47858625ab1436c56626b2117573cc0976b460a5" ? [] : ["AUTHORIZED_BASE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.authorizedSourceCommit === "2324c2db65129515d481f99aa7c8d2b3f18fa29b" ? [] : ["AUTHORIZED_SOURCE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.authorizedSemanticSourceCommit === "f91dd269039bba0138a655d0f4050699ccb5f0f4" ? [] : ["AUTHORIZED_SEMANTIC_SOURCE_COMMIT_MISMATCH"]),
    ...(contract.authorization?.changeClass === "GATE6_PRODUCTION_CLOSURE_RECERTIFICATION" ? [] : ["AUTHORIZED_CHANGE_CLASS_MISMATCH"]),
    ...(contract.protectedSemanticSourceSet.hash === protectedSemanticSourceSetHash ? [] : ["PROTECTED_SEMANTIC_SOURCE_SET_MISMATCH"]),
    ...(contract.certificationEvidenceSet.hash === certificationEvidenceSetHash ? [] : ["CERTIFICATION_EVIDENCE_SET_MISMATCH"]),
    ...(engineSourceHash === contract.authorization?.authorizedEngineSourceHash ? [] : ["AUTHORIZED_ENGINE_SOURCE_MISMATCH"]),
    ...(contract.production?.supabaseProjectRef === "hjgcrrzfjchzqoegcywn" &&
      contract.production?.functionSlug === "decision-v13" &&
      contract.production?.activeVersion === 123 &&
      contract.production?.verifyJwt === true &&
      contract.production?.bundleHash === "edbccf870a30c850cde97c59444b9a2f8d6e9d212dda257a86adb1fbf4fc088a" &&
      contract.production?.entrypointPath === "supabase/functions/decision-v13/index.deploy.ts" &&
      contract.production?.entrypointSource === "import \"./live-index.ts\";\n" &&
      contract.production?.entrypointSha256 === "4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299" &&
      contract.production?.deployedFileCount === 40 &&
      contract.production?.repositoryMatchedFileCount === 40 &&
      contract.production?.sourceIdentity === "CANONICAL_MAIN_024D40C_PRODUCTION_V123_40_OF_40_BYTE_MATCHED" &&
      contract.production?.deploymentSourceSetHash === "79be8bac72b30b7a60b4396c3d3dd63ce8d2b2bc98b190cab356cb7f54e4c03b" &&
      contract.production?.deploymentConfigHash === "56771eeee30d34f03eaab5a52b161d39d3a2d18e7982343623514e1fade112eb" &&
      contract.production?.eszipBodySha256 === "397273eb242367acc34031ff05cbd91501e03328c98cf2341283c195feb34e58" &&
      contract.production?.eszipEvidenceHash === "7f8821b029da7e4c0930fdbdd8380bf3c1bb7f8a1c62544304616f6eb8d7ee72" &&
      contract.production?.deploymentControlMainSha === "024d40cb021f787e8eaf95ce69a3a0d9052e39bf" &&
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
      ? { freezeManifestHash: "105d63eb8f9e9c044031cfbe780d946874e910c242b32f2b873f0f29c715859b", reason: "GATE6_PRODUCTION_CLOSURE_RECERTIFICATION" }
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
