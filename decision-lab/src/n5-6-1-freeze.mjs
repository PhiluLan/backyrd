import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { contentHash } from "./canonical-json.mjs";
import { buildN5_6_1SealedArtifact } from "./n5-6-1-validation.mjs";

const root = new URL("../../", import.meta.url);
const paths = Object.freeze({
  projection: "decision-lab/src/n5-6-1-moment-aware-projection.mjs",
  world: "decision-lab/src/n5-6-1-world.mjs",
  validation: "decision-lab/src/n5-6-1-validation.mjs",
  freezer: "decision-lab/src/n5-6-1-freeze.mjs",
  test: "decision-lab/test/n5-6-1-moment-aware-projection.test.mjs",
  contract: "decision-lab/config/n5-6-1-validation-contract-v1.json",
  baseline: "decision-lab/baselines/n5-6-1-moment-aware-projection-v1.json",
  freeze: "decision-lab/config/n5-6-1-moment-aware-projection-v1.freeze.json"
});
const sha = async (path) => createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

export async function buildN5_6_1Freeze() {
  const files = {};
  for (const key of ["projection", "world", "validation", "freezer", "test", "contract"]) files[key] = { path: paths[key], sha256: await sha(paths[key]) };
  const artifact = await buildN5_6_1SealedArtifact();
  const body = {
    freezeVersion: "backyrd-n5-6-1-moment-aware-projection-freeze-v1",
    frozenBeforeOfficialMeasurement: true,
    files,
    contractHash: artifact.contractHash,
    parentN56WorldHash: artifact.identities.parentN56WorldHash,
    worldHash: artifact.identities.worldHash,
    projectionContractHash: artifact.identities.projectionContractHash,
    sufficiencyContractHash: artifact.identities.sufficiencyContractHash,
    conceptMetadataHash: artifact.identities.conceptMetadataHash,
    resultHash: artifact.resultHash,
    scientificValidity: artifact.scientificValidity,
    humanReviewRequired: true,
    automaticN6Authorization: false,
    externalDecisionAiCalls: 0,
    externalDecisionAiCostUsd: 0,
    production: "UNCHANGED"
  };
  return { ...body, freezeHash: contentHash(body) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const artifact = await buildN5_6_1SealedArtifact();
  const freeze = await buildN5_6_1Freeze();
  if (process.argv.includes("--write")) {
    await writeFile(new URL(paths.baseline, root), `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(new URL(paths.freeze, root), `${JSON.stringify(freeze, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(freeze, null, 2)}\n`);
}
