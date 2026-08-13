import { resolve } from "node:path";
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] ?? "compute";
  const actual = await computePersonalizationTreatmentIdentity();
  if (command === "compute") process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
  else if (command === "validate") {
    const manifest = await readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json"));
    const result = await validatePersonalizationTreatmentFreeze(manifest);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
  } else throw new Error(`Unknown treatment freeze command: ${command}`);
}
