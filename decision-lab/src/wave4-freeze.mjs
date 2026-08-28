import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot } from "./io.mjs";
import { validateHistoricalPersonalizationTreatmentFreeze } from "./personalization-treatment-freeze.mjs";
import { validateTasteEngineFreeze } from "./taste-engine-freeze.mjs";
import { validateTasteValidationFreeze } from "./taste-validation-freeze.mjs";
import { validateWave3CFreeze } from "./wave3c-freeze.mjs";

const sha = async (path) => createHash("sha256").update(await readFile(resolve(repoRoot, path))).digest("hex");

export async function currentWave4Identity() {
  const [contract, d22, tasteEngine, tasteTreatment, wave3c] = await Promise.all([
    readJson(resolve(repoRoot, "decision-lab/config/wave4-contextual-utility-fusion-v1.json")),
    readJson(resolve(repoRoot, "decision-lab/config/archive/personalization-treatment-v1.freeze.2026-08-12.json")),
    validateTasteEngineFreeze(), validateTasteValidationFreeze(), validateWave3CFreeze(),
  ]);
  const d22Validation = validateHistoricalPersonalizationTreatmentFreeze(d22);
  return {
    freezeVersion: "backyrd-wave4-contextual-utility-fusion-freeze-v1",
    contractVersion: contract.version,
    contractHash: contentHash(contract),
    utilityFusionSourceHash: await sha("decision-lab/src/wave4-contextual-utility-fusion.mjs"),
    worldRunnerSourceHash: await sha("decision-lab/src/wave4-world-cli.mjs"),
    aggregateRunnerSourceHash: await sha("decision-lab/src/wave4-aggregate.mjs"),
    officialScriptHash: await sha("scripts/decision/run-wave4-contextual-utility-fusion.sh"),
    d42ArchitectureDocumentHash: await sha("docs/decision/D4.2_ARCHITECTURE_BOUNDARY_REVIEW.md"),
    tasteEngineFreezeHash: contentHash(tasteEngine.frozen),
    tasteTreatmentFreezeHash: tasteTreatment.freezeHash,
    personalizationTreatmentFreezeHash: d22.freezeManifestHash,
    wave3cControlFreezeHash: wave3c.freezeHash,
    parentValidity: tasteEngine.valid && tasteTreatment.valid && d22Validation.valid && wave3c.valid ? "PASS" : "FAIL",
  };
}

export async function validateWave4Freeze() {
  const frozen = await readJson(resolve(repoRoot, "decision-lab/config/wave4-contextual-utility-fusion-v1.freeze.json"));
  const actual = await currentWave4Identity();
  const reasons = Object.entries(actual).filter(([key, value]) => JSON.stringify(frozen[key]) !== JSON.stringify(value)).map(([key]) => `HASH_MISMATCH:${key}`);
  if (actual.parentValidity !== "PASS") reasons.push("PARENT_FREEZE_INVALID");
  return { valid: reasons.length === 0, reasons, frozen, actual, freezeHash: contentHash(frozen) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const command = process.argv[2] ?? "compute";
  if (command === "compute") process.stdout.write(`${JSON.stringify(await currentWave4Identity(), null, 2)}\n`);
  else if (command === "validate") { const result = await validateWave4Freeze(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 1; }
  else throw new Error(`Unknown Wave 4 freeze command:${command}`);
}
