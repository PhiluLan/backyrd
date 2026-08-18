import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot } from "./io.mjs";
import { N6A1_CONTRACT_HASH, N6A1_VERSIONS } from "./n6a1-reason-evidence-integrity.mjs";
import { N3_CONTRACT_HASH } from "./n3-moment-intelligence.mjs";
import { N4_CONTRACT_HASH } from "./n4-spot-intelligence.mjs";
import { N5_CONTRACT_HASH } from "./n5-relevant-user-projection.mjs";

const files = {
  engine: "decision-lab/src/n6a1-reason-evidence-integrity.mjs",
  forensics: "decision-lab/src/n6a1-forensics.mjs",
  tests: "decision-lab/test/n6a1-reason-evidence-integrity.test.mjs",
  experiment: "decision-lab/config/n6a1-reason-evidence-integrity-v1.json",
  validation: "decision-lab/config/n6a1-reason-evidence-validation-contract-v1.json",
  result: "decision-lab/baselines/n6a1-reason-evidence-forensics-v1.json",
  smoke: "decision-lab/baselines/n6a-ai-decision-buddy-smoke-v1.json",
  freeze: "decision-lab/config/n6a1-reason-evidence-integrity-v1.freeze.json"
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (file) => sha(await readFile(resolve(repoRoot, file)));

export async function currentN6A1FreezeIdentity() {
  return {
    freezeVersion: "backyrd-n6a6-sol-transport-timeout-freeze-v1",
    frozenBeforeFutureSmoke: true,
    versions: N6A1_VERSIONS,
    n6a1ContractHash: N6A1_CONTRACT_HASH,
    protectedN3ContractHash: N3_CONTRACT_HASH,
    protectedN4ContractHash: N4_CONTRACT_HASH,
    protectedN5ContractHash: N5_CONTRACT_HASH,
    engineSourceHash: await fileHash(files.engine),
    forensicsSourceHash: await fileHash(files.forensics),
    acceptanceTestHash: await fileHash(files.tests),
    experimentContractFileHash: await fileHash(files.experiment),
    validationContractFileHash: await fileHash(files.validation),
    forensicResultFileHash: await fileHash(files.result),
    historicalSmokeFileHash: await fileHash(files.smoke),
    officialResultHash: null
  };
}

export async function validateN6A1Freeze() {
  const frozen = JSON.parse(await readFile(resolve(repoRoot, files.freeze), "utf8"));
  const actual = await currentN6A1FreezeIdentity();
  const reasons = Object.keys(actual).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(frozen[key])).map((key) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN6A1Freeze();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
