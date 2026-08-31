import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { validateD21Freeze } from "./d2-freeze.mjs";
import { validatePersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { hashFiles, readJson, repoRoot } from "./io.mjs";

export const D31_EXPECTED = Object.freeze({
  parentFreezeManifestHash: "37e1caf773f8aaf25b64bcc09a0480ba8be6c04426e6250a006edc5d4aa0f28a",
  personalizationTreatmentFreezeHash: "98f51f7c321d3f477af5c7b3d24dac02b1d1fc42a3e7f79625e9019bc2f6485e",
  engineSourceHash: "1fe82c39ad164fa811c2673cd46d8f451d7628c7ddabd1d8c595afd18a54c14f"
});

export async function d31Preflight() {
  const parent = await readJson(resolve(repoRoot, "decision-lab/config/decision-quality-v1.1.freeze.json"));
  const treatment = await readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json"));
  const coverage = await readJson(resolve(repoRoot, "decision-lab/config/d3.1-diagnostic-coverage-v1.json"));
  const parentValidation = await validateD21Freeze(parent);
  const treatmentValidation = await validatePersonalizationTreatmentFreeze(treatment);
  const engineSourceHash = await hashFiles([resolve(repoRoot, "supabase/functions/decision-v13/index.ts")]);
  const identities = { parentFreezeManifestHash: parent.freezeManifestHash, personalizationTreatmentFreezeHash: treatment.freezeManifestHash, engineSourceHash };
  const mismatches = Object.entries(D31_EXPECTED).filter(([key, value]) => identities[key] !== value).map(([key, expected]) => ({ key, expected, actual: identities[key] }));
  const reasons = [
    ...parentValidation.reasons.map((reason) => `PARENT:${reason}`),
    ...treatmentValidation.reasons.map((reason) => `TREATMENT:${reason}`),
    ...mismatches.map(({ key }) => `IDENTITY_MISMATCH:${key}`),
    ...(parent.scientificValidity === "PASS" && treatment.scientificValidity === "PASS" ? [] : ["SCIENTIFIC_VALIDITY_NOT_PASS"]),
    ...(coverage.parentFreezeManifestHash === D31_EXPECTED.parentFreezeManifestHash ? [] : ["COVERAGE_PARENT_FREEZE_MISMATCH"]),
    ...(coverage.personalizationTreatmentFreezeHash === D31_EXPECTED.personalizationTreatmentFreezeHash ? [] : ["COVERAGE_TREATMENT_FREEZE_MISMATCH"]),
    ...(coverage.engineSourceHash === D31_EXPECTED.engineSourceHash ? [] : ["COVERAGE_ENGINE_MISMATCH"]),
    ...(coverage.executionPath === "CANONICAL_V13_AUTHENTICATED" ? [] : ["NON_CANONICAL_EXECUTION_PATH"])
  ];
  const body = { version: "d3.1-readiness-preflight-v1", status: reasons.length ? "FAIL" : "PASS", reasons, identities, parentFreezeValid: parentValidation.valid, treatmentFreezeValid: treatmentValidation.valid, scientificValidity: reasons.includes("SCIENTIFIC_VALIDITY_NOT_PASS") ? "FAIL" : "PASS", engineMutation: engineSourceHash === D31_EXPECTED.engineSourceHash ? "NONE" : "DETECTED", coverageContractHash: contentHash(coverage), productionAccess: "NONE" };
  return { ...body, preflightHash: contentHash(body) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await d31Preflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}
