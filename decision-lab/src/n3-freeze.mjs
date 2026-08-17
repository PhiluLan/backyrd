import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  N3_CONFIDENCE_CONTRACT_HASH,
  N3_CONTRACT_HASH,
  N3_HISTORY_SIGNATURE_CONTRACT_HASH,
  N3_INFERENCE_CONTRACT_HASH,
  N3_MOMENT_SCHEMA_HASH,
  N3_PROVENANCE_CONTRACT_HASH,
  N3_VERSIONS
} from "./n3-moment-intelligence.mjs";
import { N2_MEMORY_CONTRACT_HASH } from "./n2-memory-user-intelligence.mjs";

const root = new URL("../", import.meta.url);
const urls = {
  engine: new URL("src/n3-moment-intelligence.mjs", root),
  validation: new URL("src/n3-validation.mjs", root),
  tests: new URL("test/n3-moment-intelligence.test.mjs", root),
  contract: new URL("config/n3-moment-validation-contract-v1.json", root),
  result: new URL("baselines/n3-moment-intelligence-v1.json", root),
  freeze: new URL("config/n3-moment-intelligence-v1.freeze.json", root),
  structuredIntent: new URL("../supabase/functions/decision-wave1/index.ts", root)
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (url) => sha256(await readFile(url));

export async function actualN3FreezeIdentity({ includeResult = true } = {}) {
  const result = includeResult ? JSON.parse(await readFile(urls.result, "utf8")) : null;
  return {
    freezeVersion: "backyrd-n3-moment-intelligence-freeze-v1",
    frozenBeforeOfficialRun: true,
    versions: N3_VERSIONS,
    momentContractHash: N3_CONTRACT_HASH,
    momentSchemaHash: N3_MOMENT_SCHEMA_HASH,
    inferenceContractHash: N3_INFERENCE_CONTRACT_HASH,
    provenanceContractHash: N3_PROVENANCE_CONTRACT_HASH,
    confidenceContractHash: N3_CONFIDENCE_CONTRACT_HASH,
    historySignatureContractHash: N3_HISTORY_SIGNATURE_CONTRACT_HASH,
    protectedN2MemoryContractHash: N2_MEMORY_CONTRACT_HASH,
    engineSourceHash: await fileHash(urls.engine),
    validationSourceHash: await fileHash(urls.validation),
    acceptanceTestHash: await fileHash(urls.tests),
    validationContractFileHash: await fileHash(urls.contract),
    protectedStructuredIntentSourceHash: await fileHash(urls.structuredIntent),
    officialResultHash: result?.resultHash ?? null
  };
}

export async function validateN3Freeze({ preflight = false } = {}) {
  const frozen = JSON.parse(await readFile(urls.freeze, "utf8"));
  const actual = await actualN3FreezeIdentity({ includeResult: !preflight });
  const keys = Object.keys(actual).filter((key) => !preflight || key !== "officialResultHash");
  const reasons = keys.filter((key) => JSON.stringify(frozen[key]) !== JSON.stringify(actual[key])).map((key) => `HASH_MISMATCH:${key}`);
  if (preflight && frozen.officialResultHash !== null) reasons.push("PREFLIGHT_RESULT_HASH_MUST_BE_NULL");
  return { valid: reasons.length === 0, mode: preflight ? "PRE_OFFICIAL_RUN" : "SEALED_RESULT", reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN3Freeze({ preflight: process.argv.includes("--preflight") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
