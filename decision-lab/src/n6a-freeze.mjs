import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot } from "./io.mjs";
import { N3_CONTRACT_HASH } from "./n3-moment-intelligence.mjs";
import { N4_CONTRACT_HASH } from "./n4-spot-intelligence.mjs";
import { N5_CONTRACT_HASH } from "./n5-relevant-user-projection.mjs";
import { N6A_CONTRACT_HASH, N6A_VERSIONS } from "./n6a-ai-decision-buddy.mjs";

const files = {
  engine: "decision-lab/src/n6a-ai-decision-buddy.mjs", scenarios: "decision-lab/src/n6a-scenarios.mjs",
  evaluator: "decision-lab/src/n6a-evaluator.mjs", runner: "decision-lab/src/n6a-runner.mjs",
  tests: "decision-lab/test/n6a-ai-decision-buddy.test.mjs", experiment: "decision-lab/config/n6a-ai-decision-buddy-v1.json",
  validation: "decision-lab/config/n6a-validation-contract-v1.json", freeze: "decision-lab/config/n6a-ai-decision-buddy-v1.freeze.json"
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (file) => sha(await readFile(resolve(repoRoot, file)));

export async function currentN6AFreezeIdentity() {
  return {
    freezeVersion: "backyrd-n6a-ai-decision-buddy-freeze-v1", frozenBeforeExternalRun: true, versions: N6A_VERSIONS,
    n6aContractHash: N6A_CONTRACT_HASH, protectedN3ContractHash: N3_CONTRACT_HASH, protectedN4ContractHash: N4_CONTRACT_HASH, protectedN5ContractHash: N5_CONTRACT_HASH,
    engineSourceHash: await fileHash(files.engine), scenarioSourceHash: await fileHash(files.scenarios), evaluatorSourceHash: await fileHash(files.evaluator), runnerSourceHash: await fileHash(files.runner),
    acceptanceTestHash: await fileHash(files.tests), experimentContractFileHash: await fileHash(files.experiment), validationContractFileHash: await fileHash(files.validation), officialResultHash: null
  };
}
export async function validateN6AFreeze() {
  const frozen = JSON.parse(await readFile(resolve(repoRoot, files.freeze), "utf8")); const actual = await currentN6AFreezeIdentity();
  const reasons = Object.keys(actual).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(frozen[key])).map((key) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, reasons, frozen, actual };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await validateN6AFreeze(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 1;
}
