import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot } from "./io.mjs";
import { validatePersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { validateTasteEngineFreeze } from "./taste-engine-freeze.mjs";
import { validateTasteValidationFreeze } from "./taste-validation-freeze.mjs";

const sha = async (path) => createHash("sha256").update(await readFile(resolve(repoRoot, path))).digest("hex");

export async function currentWave3CIdentity() {
  const [contract, d22, tasteEngine, tasteTreatment] = await Promise.all([
    readJson(resolve(repoRoot, "decision-lab/config/wave3c-personalized-decision-v1.json")),
    readJson(resolve(repoRoot, "decision-lab/config/personalization-treatment-v1.freeze.json")),
    validateTasteEngineFreeze(), validateTasteValidationFreeze(),
  ]);
  const d22Validation = await validatePersonalizationTreatmentFreeze(d22);
  return {
    freezeVersion: "backyrd-wave3c-personalized-decision-freeze-v1",
    contractVersion: contract.version,
    contractHash: contentHash(contract),
    personalizedFitSourceHash: await sha("decision-lab/src/wave3c-personalized-fit.mjs"),
    worldRunnerSourceHash: await sha("decision-lab/src/wave3c-world-cli.mjs"),
    aggregateRunnerSourceHash: await sha("decision-lab/src/wave3c-aggregate.mjs"),
    officialScriptHash: await sha("scripts/decision/run-wave3c-personalized-decision.sh"),
    tasteEngineFreezeHash: contentHash(tasteEngine.frozen),
    tasteTreatmentFreezeHash: tasteTreatment.freezeHash,
    personalizationTreatmentFreezeHash: d22.freezeManifestHash,
    parentValidity: tasteEngine.valid && tasteTreatment.valid && d22Validation.valid ? "PASS" : "FAIL",
  };
}

export async function validateWave3CFreeze() {
  const frozen = await readJson(resolve(repoRoot, "decision-lab/config/wave3c-personalized-decision-v1.freeze.json"));
  const actual = await currentWave3CIdentity();
  const reasons = Object.entries(actual).filter(([key, value]) => JSON.stringify(frozen[key]) !== JSON.stringify(value)).map(([key]) => `HASH_MISMATCH:${key}`);
  if (actual.parentValidity !== "PASS") reasons.push("PARENT_FREEZE_INVALID");
  return { valid: reasons.length === 0, reasons, frozen, actual, freezeHash: contentHash(frozen) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const command = process.argv[2] ?? "compute";
  if (command === "compute") process.stdout.write(`${JSON.stringify(await currentWave3CIdentity(), null, 2)}\n`);
  else if (command === "validate") { const result = await validateWave3CFreeze(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 1; }
  else throw new Error(`Unknown Wave 3C freeze command: ${command}`);
}
