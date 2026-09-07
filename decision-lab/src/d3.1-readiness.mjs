import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { validateD21Freeze } from "./d2-freeze.mjs";
import { validatePersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { hashFiles, readJson, repoRoot } from "./io.mjs";

export const D38_EXPECTED = Object.freeze({
  parentFreezeManifestHash: "c1aa313cfcf4941cdc5c385cbf93aea75fb6898da146a0b7e34539fb233af3f2",
  personalizationTreatmentFreezeHash: "06a696f43071fe75300c69187d675e0b62e57a2e2447c930412903a54bcb34e6",
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
  const mismatches = Object.entries(D38_EXPECTED).filter(([key, value]) => identities[key] !== value).map(([key, expected]) => ({ key, expected, actual: identities[key] }));
  const reasons = [
    ...parentValidation.reasons.map((reason) => `PARENT:${reason}`),
    ...treatmentValidation.reasons.map((reason) => `TREATMENT:${reason}`),
    ...mismatches.map(({ key }) => `IDENTITY_MISMATCH:${key}`),
    ...(parent.scientificValidity === "PASS" && treatment.scientificValidity === "PASS" ? [] : ["SCIENTIFIC_VALIDITY_NOT_PASS"]),
    ...(coverage.parentFreezeManifestHash === D38_EXPECTED.parentFreezeManifestHash ? [] : ["COVERAGE_PARENT_FREEZE_MISMATCH"]),
    ...(coverage.personalizationTreatmentFreezeHash === D38_EXPECTED.personalizationTreatmentFreezeHash ? [] : ["COVERAGE_TREATMENT_FREEZE_MISMATCH"]),
    ...(coverage.engineSourceHash === D38_EXPECTED.engineSourceHash ? [] : ["COVERAGE_ENGINE_MISMATCH"]),
    ...(coverage.executionPath === "CANONICAL_V13_AUTHENTICATED" ? [] : ["NON_CANONICAL_EXECUTION_PATH"])
  ];
  const body = { version: "d3.1-readiness-preflight-v1", status: reasons.length ? "FAIL" : "PASS", reasons, identities, parentFreezeValid: parentValidation.valid, treatmentFreezeValid: treatmentValidation.valid, scientificValidity: reasons.includes("SCIENTIFIC_VALIDITY_NOT_PASS") ? "FAIL" : "PASS", engineMutation: engineSourceHash === D38_EXPECTED.engineSourceHash ? "NONE" : "DETECTED", coverageContractHash: contentHash(coverage), productionAccess: "NONE" };
  return { ...body, preflightHash: contentHash(body) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await d31Preflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
