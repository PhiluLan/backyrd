import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  EVIDENCE_MODEL_HASH, TASTE_ENGINE_CONTRACT_HASH,
  TASTE_ENGINE_VERSIONS, TASTE_SPACE_HASH
} from "./taste-engine.mjs";

const freezeUrl = new URL("../config/taste-engine-v1.1.freeze.json", import.meta.url);
const sourceUrl = new URL("./taste-engine.mjs", import.meta.url);
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function validateTasteEngineFreeze() {
  const frozen = JSON.parse(await readFile(freezeUrl, "utf8"));
  const actual = {
    freezeVersion: "backyrd-taste-engine-freeze-v1.1",
    versions: TASTE_ENGINE_VERSIONS,
    tasteSpaceHash: TASTE_SPACE_HASH,
    evidenceModelHash: EVIDENCE_MODEL_HASH,
    contractHash: TASTE_ENGINE_CONTRACT_HASH,
    sourceHash: hash(await readFile(sourceUrl))
  };
  const reasons = Object.entries(actual).filter(([key, value]) => JSON.stringify(frozen[key]) !== JSON.stringify(value)).map(([key]) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateTasteEngineFreeze();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
