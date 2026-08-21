import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { N2_MEMORY_CONTRACT_HASH } from "./n2-memory-user-intelligence.mjs";
import { N3_CONTRACT_HASH } from "./n3-moment-intelligence.mjs";
import { N5_CONTRACT_HASH } from "./n5-relevant-user-projection.mjs";
import { buildN5_5SealedArtifact } from "./n5-5-validation.mjs";

const root = new URL("../", import.meta.url);
const urls = {
  world: new URL("src/n5-5-longitudinal-user-world.mjs", root), validation: new URL("src/n5-5-validation.mjs", root),
  test: new URL("test/n5-5-longitudinal-user-world.test.mjs", root), contract: new URL("config/n5-5-validation-contract-v1.json", root),
  result: new URL("baselines/n5-5-longitudinal-user-intelligence-world-v1.json", root), freeze: new URL("config/n5-5-longitudinal-user-world-v1.freeze.json", root)
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = async (url) => sha256(await readFile(url));

export async function actualN5_5FreezeIdentity() {
  const sealed = await buildN5_5SealedArtifact();
  return {
    freezeVersion: "backyrd-n5-5-longitudinal-user-world-freeze-v1", frozenBeforeOfficialRun: true,
    worldVersion: "backyrd-n5-5-longitudinal-user-world-v1",
    worldSourceHash: await hashFile(urls.world), validationSourceHash: await hashFile(urls.validation), acceptanceTestHash: await hashFile(urls.test),
    validationContractHash: await hashFile(urls.contract), sealedResultFileHash: await hashFile(urls.result),
    n2MemoryContractHash: N2_MEMORY_CONTRACT_HASH, n3ContractHash: N3_CONTRACT_HASH, n5ContractHash: N5_CONTRACT_HASH,
    officialResultHash: sealed.artifactHash ? (JSON.parse(await readFile(urls.result, "utf8")).artifactHash === sealed.artifactHash ? "8a8171c59d3f88bb6c2191048931bedba6d2ed11c28e793f46311b8e91d4b7bd" : null) : null,
    sealedArtifactHash: sealed.artifactHash
  };
}

export async function validateN5_5Freeze() {
  const frozen = JSON.parse(await readFile(urls.freeze, "utf8"));
  const actual = await actualN5_5FreezeIdentity();
  const reasons = Object.keys(actual).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(frozen[key])).map((key) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, frozen, actual, reasons };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN5_5Freeze();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
