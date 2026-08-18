import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { N6A3_VERSIONS } from "./n6a3-atomic-checkpointing.mjs";
import { buildCanonicalN6A3PilotDefinition } from "./n6a3-pilot-contract.mjs";
import { repoRoot } from "./io.mjs";

const files = {
  engine: "decision-lab/src/n6a3-atomic-checkpointing.mjs",
  pilotContract: "decision-lab/src/n6a3-pilot-contract.mjs",
  runner: "decision-lab/src/n6a3-pilot-runner.mjs",
  liveExecutor: "decision-lab/src/n6a3-live-executor.mjs",
  tests: "decision-lab/test/n6a3-atomic-checkpointing.test.mjs",
  config: "decision-lab/config/n6a3-atomic-checkpointing-v1.json",
  freeze: "decision-lab/config/n6a3-atomic-checkpointing-v1.freeze.json"
};
const hashFile = async (path) => createHash("sha256").update(await readFile(resolve(repoRoot, path))).digest("hex");

export async function currentN6A3FreezeIdentity() {
  const definition = await buildCanonicalN6A3PilotDefinition();
  return {
    freezeVersion: "backyrd-n6a3-atomic-checkpointing-freeze-v1", frozenBeforeNewPilot: true, versions: N6A3_VERSIONS,
    protectedDecisionBuddyIdentityHash: definition.experimentIdentity.identityHash,
    engineSourceHash: await hashFile(files.engine), pilotContractSourceHash: await hashFile(files.pilotContract),
    runnerSourceHash: await hashFile(files.runner), liveExecutorSourceHash: await hashFile(files.liveExecutor), acceptanceTestHash: await hashFile(files.tests), configHash: await hashFile(files.config),
    externalAiCalls: 0, externalAiCostUsd: 0, officialNewPilotResultHash: null
  };
}

export async function validateN6A3Freeze() {
  const actual = await currentN6A3FreezeIdentity();
  let frozen; try { frozen = JSON.parse(await readFile(resolve(repoRoot, files.freeze), "utf8")); } catch { return { valid: false, reasons: ["N6A3_FREEZE_MISSING"], frozen: null, actual }; }
  const reasons = Object.keys(actual).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(frozen[key])).map((key) => `HASH_MISMATCH:${key}`);
  return { valid: reasons.length === 0, reasons, frozen, actual };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv.includes("--write")) {
    const identity = await currentN6A3FreezeIdentity(); await writeFile(resolve(repoRoot, files.freeze), `${JSON.stringify(identity, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ written: true, identity }, null, 2)}\n`);
  } else {
    const result = await validateN6A3Freeze(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 1;
  }
}
