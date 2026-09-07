import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { validateD21Freeze } from "./d2-freeze.mjs";
import { validatePersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { hashFiles, readJson, repoRoot } from "./io.mjs";

export const D37_EXPECTED = Object.freeze({
  parentFreezeManifestHash: "d7e8f4a8ed29f32d9732931e43be0f23e129bf7eecc3c47b4a5793fc73b28a3b",
  personalizationTreatmentFreezeHash: "2b85e20599c5d8183b2d89d20c56b0d251008a644ae0b1290713af88a127481e",
  engineSourceHash: "cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000"
});

export async function d31Preflight() {
  const parent = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.freeze.json"));
  const treatment = await readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json"));
  const coverage = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
  const parentValidation = await validateD21Freeze(parent);
  const treatmentValidation = await validatePersonalizationTreatmentFreeze(treatment);
  const engineSourceHash = await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]);
  const identities = { parentFreezeManifestHash: parent.freezeManifestHash, personalizationTreatmentFreezeHash: treatment.freezeManifestHash, engineSourceHash };
  const mismatches = Object.entries(D37_EXPECTED).filter(([key, value]) => identities[key] !== value).map(([key, expected]) => ({ key, expected, actual: identities[key] }));
  const reasons = [
    ...parentValidation.reasons.map((reason) => `PARENT:${reason}`),
    ...treatmentValidation.reasons.map((reason) => `TREATMENT:${reason}`),
    ...mismatches.map(({ key }) => `IDENTITY_MISMATCH:${key}`),
    ...(parent.scientificValidity === "PASS" && treatment.scientificValidity === "PASS" ? [] : ["SCIENTIFIC_VALIDITY_NOT_PASS"]),
    ...(coverage.parentFreezeManifestHash === D37_EXPECTED.parentFreezeManifestHash ? [] : ["COVERAGE_PARENT_FREEZE_MISMATCH"]),
    ...(coverage.personalizationTreatmentFreezeHash === D37_EXPECTED.personalizationTreatmentFreezeHash ? [] : ["COVERAGE_TREATMENT_FREEZE_MISMATCH"]),
    ...(coverage.engineSourceHash === D37_EXPECTED.engineSourceHash ? [] : ["COVERAGE_ENGINE_MISMATCH"]),
    ...(coverage.executionPath === "CANONICAL_V13_AUTHENTICATED" ? [] : ["NON_CANONICAL_EXECUTION_PATH"])
  ];
  const body = { version: "d3.1-readiness-preflight-v1", status: reasons.length ? "FAIL" : "PASS", reasons, identities, parentFreezeValid: parentValidation.valid, treatmentFreezeValid: treatmentValidation.valid, scientificValidity: reasons.includes("SCIENTIFIC_VALIDITY_NOT_PASS") ? "FAIL" : "PASS", engineMutation: engineSourceHash === D37_EXPECTED.engineSourceHash ? "NONE" : "DETECTED", coverageContractHash: contentHash(coverage), productionAccess: "NONE" };
  return { ...body, preflightHash: contentHash(body) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await d31Preflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
