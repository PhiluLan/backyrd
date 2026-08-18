import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  N5_CONTRACT_HASH, N5_RELEVANCE_CONTRACT_HASH, N5_SUFFICIENCY_CONTRACT_HASH,
  N5_SUPPRESSION_CONTRACT_HASH, N5_VERSIONS
} from "./n5-relevant-user-projection.mjs";
import { N2_MEMORY_CONTRACT_HASH } from "./n2-memory-user-intelligence.mjs";
import { N3_CONTRACT_HASH } from "./n3-moment-intelligence.mjs";
import { N4_CONTRACT_HASH } from "./n4-spot-intelligence.mjs";

const root = new URL("../", import.meta.url);
const urls = {
  engine: new URL("src/n5-relevant-user-projection.mjs", root),
  validation: new URL("src/n5-validation.mjs", root),
  tests: new URL("test/n5-relevant-user-projection.test.mjs", root),
  freezeTest: new URL("test/n5-freeze.test.mjs", root),
  contract: new URL("config/n5-relevant-user-projection-validation-v1.json", root),
  result: new URL("baselines/n5-relevant-user-projection-v1.json", root),
  freeze: new URL("config/n5-relevant-user-projection-v1.freeze.json", root)
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (url) => sha256(await readFile(url));

export async function actualN5FreezeIdentity({ includeResult = true } = {}) {
  const result = includeResult ? JSON.parse(await readFile(urls.result, "utf8")) : null;
  return {
    freezeVersion: "backyrd-n5-relevant-user-projection-freeze-v1",
    frozenBeforeOfficialRun: true,
    versions: N5_VERSIONS,
    projectionContractHash: N5_CONTRACT_HASH,
    relevanceContractHash: N5_RELEVANCE_CONTRACT_HASH,
    sufficiencyContractHash: N5_SUFFICIENCY_CONTRACT_HASH,
    suppressionContractHash: N5_SUPPRESSION_CONTRACT_HASH,
    protectedN2MemoryContractHash: N2_MEMORY_CONTRACT_HASH,
    protectedN3MomentContractHash: N3_CONTRACT_HASH,
    protectedN4SpotContractHash: N4_CONTRACT_HASH,
    engineSourceHash: await fileHash(urls.engine),
    validationSourceHash: await fileHash(urls.validation),
    acceptanceTestHash: await fileHash(urls.tests),
    freezeAcceptanceTestHash: await fileHash(urls.freezeTest),
    validationContractFileHash: await fileHash(urls.contract),
    officialResultHash: result?.resultHash ?? null
  };
}

export async function validateN5Freeze({ preflight = false } = {}) {
  const frozen = JSON.parse(await readFile(urls.freeze, "utf8"));
  const actual = await actualN5FreezeIdentity({ includeResult: !preflight });
  const keys = Object.keys(actual).filter((key) => !preflight || key !== "officialResultHash");
  const reasons = keys.filter((key) => JSON.stringify(frozen[key]) !== JSON.stringify(actual[key])).map((key) => `HASH_MISMATCH:${key}`);
  if (preflight && frozen.officialResultHash !== null) reasons.push("PREFLIGHT_RESULT_HASH_MUST_BE_NULL");
  return { valid: reasons.length === 0, mode: preflight ? "PRE_OFFICIAL_RUN" : "SEALED_RESULT", reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN5Freeze({ preflight: process.argv.includes("--preflight") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
