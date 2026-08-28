import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { generateWorld } from "./generator.mjs";
import { hashFiles, readJson, repoRoot } from "./io.mjs";
import { buildPersonalizationTreatment, PERSONALIZATION_COMPONENTS, validateTreatment } from "./personalization-treatment.mjs";

const parentPath = resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.freeze.json");
const contractPath = resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.json");
const generatorPath = resolve(repoRoot, "decision-lab/src/personalization-treatment.mjs");

export async function computePersonalizationTreatmentIdentity() {
  const parent = await readJson(parentPath);
  const contract = await readJson(contractPath);
  const smoke = await readJson(resolve(repoRoot, "decision-lab/config/smoke-v1.json"));
  const maturities = ["cold", "onboarding", "sparse", "developing", "mature", "power"];
  const worlds = [smoke.seed, `${smoke.seed}-2`, `${smoke.seed}-3`].map((seed) => generateWorld({ ...smoke, seed, scenarioSetVersion: parent.scenarioRegistryVersion, evaluationVersion: parent.evaluationVersion }, { gitSha: parent.sourceGitSha, migrationHash: "D2_2_TREATMENT_VALIDATION", engineSourceHash: parent.engineSourceHash }));
  const cases = worlds.flatMap((world) => maturities.map((maturity) => {
    const source = world.users.find((user) => user.maturity === maturity);
    if (!source) return { seed: world.manifest.seed, maturity, status: "MISSING" };
    const bundle = buildPersonalizationTreatment(world, { userId: source.id, currentRequest: { city: "Synthetic Basel", query: "treatment validation" }, currentContext: { audience: "date", timeBucket: "evening" } });
    const result = validateTreatment(bundle);
    return { seed: world.manifest.seed, maturity, status: result.pass ? "PASS" : "FAIL", treatmentHash: bundle.treatmentHash, validationHash: result.validationHash, checks: result.checks };
  }));
  const validationEvidence = { cases };
  const validation = {
    pass: cases.every((item) => item.status === "PASS"),
    caseCount: cases.length,
    maturityCoverage: maturities,
    seedCount: worlds.length,
    evidenceHash: contentHash(validationEvidence)
  };
  validation.validationHash = contentHash(validation);
  const semantic = {
    d2Version: "2.2",
    contractVersion: contract.contractVersion,
    contractHash: contentHash(contract),
    treatmentGeneratorVersion: contract.treatmentGeneratorVersion,
    treatmentGeneratorHash: await hashFiles([generatorPath]),
    scientificValidationHash: validation.evidenceHash,
    scientificValidity: validation.pass ? "PASS" : "FAIL",
    parentFreezeManifestHash: parent.freezeManifestHash,
    parentFreezePreserved: parent.freezeManifestHash === contract.parentFreezeManifestHash,
    engineSourceHash: parent.engineSourceHash,
    engineMutation: parent.engineSourceHash === contract.engineSourceHash ? "NONE" : "DETECTED",
    componentInventoryHash: contentHash(PERSONALIZATION_COMPONENTS),
    d31Readiness: validation.pass && parent.freezeManifestHash === contract.parentFreezeManifestHash && parent.engineSourceHash === contract.engineSourceHash ? "READY" : "NOT_READY"
  };
  return { ...semantic, freezeManifestHash: contentHash(semantic), frozen: semantic.d31Readiness === "READY", validation, fixtureTreatmentHash: contentHash(cases.map(({ treatmentHash }) => treatmentHash)) };
}

export async function validatePersonalizationTreatmentFreeze(manifest) {
  const actual = await computePersonalizationTreatmentIdentity();
  const keys = ["contractHash", "treatmentGeneratorHash", "scientificValidationHash", "parentFreezeManifestHash", "engineSourceHash", "componentInventoryHash", "freezeManifestHash"];
  const mismatches = keys.filter((key) => manifest[key] !== actual[key]).map((key) => ({ key, expected: manifest[key], actual: actual[key] }));
  const reasons = mismatches.map(({ key }) => `HASH_MISMATCH:${key}`);
  if (!actual.validation.pass) reasons.push("TREATMENT_ADVERSARIAL_VALIDATION_FAILED");
  if (!actual.parentFreezePreserved) reasons.push("D2_1_PARENT_FREEZE_CHANGED");
  if (actual.engineMutation !== "NONE") reasons.push("ENGINE_MUTATION_DETECTED");
  return { valid: reasons.length === 0, reasons, mismatches, actual };
}

export function validateHistoricalPersonalizationTreatmentFreeze(manifest) {
  const expectedContentHash = "732b2c1d3b4db6d79647c5f98e8e1018009d3e3a86415a4bf86cb566695a2160";
  const reasons = [
    ...(contentHash(manifest) === expectedContentHash ? [] : ["HISTORICAL_FREEZE_CONTENT_MISMATCH"]),
    ...(manifest.freezeManifestHash === "9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053" ? [] : ["HISTORICAL_FREEZE_IDENTITY_MISMATCH"]),
    ...(manifest.parentFreezeManifestHash === "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf" ? [] : ["HISTORICAL_PARENT_IDENTITY_MISMATCH"]),
    ...(manifest.engineSourceHash === "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba" ? [] : ["HISTORICAL_ENGINE_IDENTITY_MISMATCH"]),
    ...(manifest.scientificValidity === "PASS" && manifest.frozen === true ? [] : ["HISTORICAL_FREEZE_NOT_CERTIFIED"])
  ];
  return { valid: reasons.length === 0, reasons, manifest, contentHash: contentHash(manifest) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "compute";
  const actual = await computePersonalizationTreatmentIdentity();
  if (command === "compute") process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
  else if (command === "validate") {
    const manifest = await readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json"));
    const result = await validatePersonalizationTreatmentFreeze(manifest);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
  } else if (command === "recertify") {
    const parent = await readJson(parentPath);
    if (parent.engineMutation !== "AUTHORIZED_RECERTIFICATION" || actual.d31Readiness !== "READY") throw new Error("D2.2 parent is not an authorized, ready re-certification");
    await writeFile(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json"), `${JSON.stringify(actual, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
  } else throw new Error(`Unknown treatment freeze command: ${command}`);
}
