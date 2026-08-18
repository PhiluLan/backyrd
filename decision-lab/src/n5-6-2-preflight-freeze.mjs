import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { buildN5_6_2EnginePreflight } from "./n5-6-2-engine-preflight.mjs";

const root = new URL("../../", import.meta.url);
const paths = Object.freeze({
  world: "decision-lab/src/n5-6-2-realistic-user-world.mjs",
  evaluator: "decision-lab/src/n5-6-2-evaluator.mjs",
  preflight: "decision-lab/src/n5-6-2-engine-preflight.mjs",
  freezer: "decision-lab/src/n5-6-2-preflight-freeze.mjs",
  test: "decision-lab/test/n5-6-2-realistic-user-world.test.mjs",
  contract: "decision-lab/config/n5-6-2-validation-contract-v1.json",
  baseline: "decision-lab/baselines/n5-6-2-engine-defect-preflight-v1.json",
  freeze: "decision-lab/config/n5-6-2-engine-defect-preflight-v1.freeze.json"
});
const sha = async (path) => createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

export async function buildN5_6_2PreflightFreeze() {
  const files = {};
  for (const key of ["world", "evaluator", "preflight", "freezer", "test", "contract"]) files[key] = { path: paths[key], sha256: await sha(paths[key]) };
  const artifact = await buildN5_6_2EnginePreflight();
  const body = {
    freezeVersion: "backyrd-n5-6-2-engine-defect-preflight-freeze-v1",
    identityType: "PREFLIGHT_STOP_EVIDENCE_NOT_OFFICIAL_WORLD_FREEZE",
    files,
    contractHash: artifact.contractHash,
    engineContractHash: artifact.identities.engineContractHash,
    projectionContractHash: artifact.identities.projectionContractHash,
    worldHashes: artifact.identities.worldHashes,
    defectId: artifact.defectId,
    defectProven: artifact.defectProven,
    resultHash: artifact.resultHash,
    officialMeasurementStarted: false,
    officialQualityVerdictProduced: false,
    externalDecisionAiCalls: 0,
    production: "UNCHANGED"
  };
  return { ...body, freezeHash: contentHash(body) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const freeze = await buildN5_6_2PreflightFreeze();
  if (process.argv.includes("--write")) await writeFile(new URL(paths.freeze, root), `${JSON.stringify(freeze, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(freeze, null, 2)}\n`);
}
