import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot } from "./io.mjs";
import { N6A1_CONTRACT_HASH } from "./n6a1-reason-evidence-integrity.mjs";
import { N6A2_CONTRACT_HASH, N6A2_VERSIONS } from "./n6a2-reason-authorization.mjs";

const files = { engine: "decision-lab/src/n6a2-reason-authorization.mjs", replay: "decision-lab/src/n6a2-offline-replay.mjs", tests: "decision-lab/test/n6a2-reason-authorization.test.mjs", config: "decision-lab/config/n6a2-reason-authorization-v1.json", sourceSmoke: "decision-lab/baselines/n6a1-new-smoke-result-v1.json", replayResult: "decision-lab/baselines/n6a2-authorization-offline-replay-v1.json", freeze: "decision-lab/config/n6a2-reason-authorization-v1.freeze.json" };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = async (file) => sha(await readFile(resolve(repoRoot, file)));
export async function currentN6A2FreezeIdentity() {
  return { freezeVersion: "backyrd-n6a2-reason-authorization-freeze-v1", frozenBeforeNextSmoke: true, versions: N6A2_VERSIONS, n6a1ContractHash: N6A1_CONTRACT_HASH, n6a2ContractHash: N6A2_CONTRACT_HASH, engineSourceHash: await fileHash(files.engine), replaySourceHash: await fileHash(files.replay), acceptanceTestHash: await fileHash(files.tests), configHash: await fileHash(files.config), sourceSmokeHash: await fileHash(files.sourceSmoke), replayResultHash: await fileHash(files.replayResult), officialResultHash: null };
}
export async function validateN6A2Freeze() {
  const frozen = JSON.parse(await readFile(resolve(repoRoot, files.freeze), "utf8")); const actual = await currentN6A2FreezeIdentity();
  const reasons = Object.keys(actual).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(frozen[key])).map((key) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, reasons, frozen, actual };
}
if (process.argv[1] === new URL(import.meta.url).pathname) { const result = await validateN6A2Freeze(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 1; }
