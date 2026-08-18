import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { N4_CONTRACT_HASH, N4_EVIDENCE_CONTRACT_HASH, N4_OWNER_CONTRACT_HASH, N4_SCHEMA_HASH, N4_VERSIONS } from "./n4-spot-intelligence.mjs";
import { N2_MEMORY_CONTRACT_HASH } from "./n2-memory-user-intelligence.mjs";
import { N3_CONTRACT_HASH } from "./n3-moment-intelligence.mjs";

const root = new URL("../", import.meta.url);
const urls = {
  engine: new URL("src/n4-spot-intelligence.mjs", root), validation: new URL("src/n4-validation.mjs", root),
  tests: new URL("test/n4-spot-intelligence.test.mjs", root), contract: new URL("config/n4-spot-validation-contract-v1.json", root),
  freezeTest: new URL("test/n4-freeze.test.mjs", root),
  migration: new URL("../supabase/migrations/20260817201500_create_spot_intelligence_v1.sql", root),
  databaseTests: new URL("../supabase/tests/decision_n4_spot_intelligence.sql", root),
  result: new URL("baselines/n4-spot-intelligence-v1.json", root), freeze: new URL("config/n4-spot-intelligence-v1.freeze.json", root)
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (url) => sha256(await readFile(url));

export async function actualN4FreezeIdentity({ includeResult = true } = {}) {
  const result = includeResult ? JSON.parse(await readFile(urls.result, "utf8")) : null;
  return {
    freezeVersion: "backyrd-n4-spot-intelligence-freeze-v1", frozenBeforeOfficialRun: true,
    versions: N4_VERSIONS, spotIntelligenceContractHash: N4_CONTRACT_HASH, schemaHash: N4_SCHEMA_HASH,
    evidenceContractHash: N4_EVIDENCE_CONTRACT_HASH, ownerContractHash: N4_OWNER_CONTRACT_HASH,
    protectedN2MemoryContractHash: N2_MEMORY_CONTRACT_HASH, protectedN3MomentContractHash: N3_CONTRACT_HASH,
    engineSourceHash: await fileHash(urls.engine), validationSourceHash: await fileHash(urls.validation),
    acceptanceTestHash: await fileHash(urls.tests), freezeAcceptanceTestHash: await fileHash(urls.freezeTest), validationContractFileHash: await fileHash(urls.contract),
    additiveMigrationHash: await fileHash(urls.migration), databaseAcceptanceTestHash: await fileHash(urls.databaseTests),
    officialResultHash: result?.resultHash ?? null
  };
}

export async function validateN4Freeze({ preflight = false } = {}) {
  const frozen = JSON.parse(await readFile(urls.freeze, "utf8"));
  const actual = await actualN4FreezeIdentity({ includeResult: !preflight });
  const keys = Object.keys(actual).filter((key) => !preflight || key !== "officialResultHash");
  const reasons = keys.filter((key) => JSON.stringify(frozen[key]) !== JSON.stringify(actual[key])).map((key) => `HASH_MISMATCH:${key}`);
  if (preflight && frozen.officialResultHash !== null) reasons.push("PREFLIGHT_RESULT_HASH_MUST_BE_NULL");
  return { valid: reasons.length === 0, mode: preflight ? "PRE_OFFICIAL_RUN" : "SEALED_RESULT", reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN4Freeze({ preflight: process.argv.includes("--preflight") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
