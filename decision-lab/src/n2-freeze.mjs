import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildN2AcceptanceResult } from "./n2-acceptance.mjs";
import {
  N2_EVIDENCE_MAPPING_HASH, N2_MEMORY_CONTRACT_HASH,
  N2_RETENTION_CONTRACT_HASH, N2_VERSIONS
} from "./n2-memory-user-intelligence.mjs";
import { TASTE_ENGINE_CONTRACT_HASH } from "./taste-engine.mjs";

const base = new URL("../", import.meta.url);
const sourceUrl = new URL("src/n2-memory-user-intelligence.mjs", base);
const acceptanceUrl = new URL("src/n2-acceptance.mjs", base);
const migrationUrl = new URL("../supabase/migrations/20260817193000_create_memory_user_intelligence_v1.sql", base);
const freezeUrl = new URL("config/n2-memory-user-intelligence-v1.freeze.json", base);
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function validateN2Freeze() {
  const frozen = JSON.parse(await readFile(freezeUrl, "utf8"));
  const actual = {
    freezeVersion: "backyrd-n2-memory-user-intelligence-freeze-v1",
    versions: N2_VERSIONS,
    memoryContractHash: N2_MEMORY_CONTRACT_HASH,
    evidenceMappingHash: N2_EVIDENCE_MAPPING_HASH,
    retentionContractHash: N2_RETENTION_CONTRACT_HASH,
    tasteEngineContractHash: TASTE_ENGINE_CONTRACT_HASH,
    sourceHash: hash(await readFile(sourceUrl)),
    acceptanceSourceHash: hash(await readFile(acceptanceUrl)),
    migrationHash: hash(await readFile(migrationUrl)),
    acceptanceResultHash: buildN2AcceptanceResult().resultHash
  };
  const reasons = Object.entries(actual).filter(([key, value]) => JSON.stringify(frozen[key]) !== JSON.stringify(value)).map(([key]) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN2Freeze();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
