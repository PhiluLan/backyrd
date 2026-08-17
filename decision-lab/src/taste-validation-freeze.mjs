import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { validateTasteEngineFreeze } from "./taste-engine-freeze.mjs";

const contractUrl = new URL("../config/taste-validation-contract-v1.1.json", import.meta.url);
const freezeUrl = new URL("../config/taste-validation-contract-v1.1-engine-v1.1.freeze.json", import.meta.url);
const runtimeUrl = new URL("./taste-validation.mjs", import.meta.url);
const runnerUrl = new URL("./taste-validation-run.mjs", import.meta.url);
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function currentTasteValidationIdentity() {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const engine = await validateTasteEngineFreeze();
  return {
    freezeVersion: "backyrd-taste-validation-freeze-v1.1-engine-v1.1",
    contractVersion: contract.version,
    contractHash: contentHash(contract),
    validationRuntimeSourceHash: hash(await readFile(runtimeUrl)),
    officialRunnerSourceHash: hash(await readFile(runnerUrl)),
    parentTasteEngineFreezeHash: contentHash(engine.frozen),
    parentTasteEngineValid: engine.valid
  };
}

export async function validateTasteValidationFreeze() {
  const frozen = JSON.parse(await readFile(freezeUrl, "utf8"));
  const actual = await currentTasteValidationIdentity();
  const reasons = Object.entries(actual).filter(([key, value]) => JSON.stringify(frozen[key]) !== JSON.stringify(value)).map(([key]) => `HASH_MISMATCH:${key}`);
  if (!actual.parentTasteEngineValid) reasons.push("PARENT_TASTE_ENGINE_FREEZE_INVALID");
  return { valid: reasons.length === 0, reasons, frozen, actual, freezeHash: contentHash(frozen) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateTasteValidationFreeze();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
