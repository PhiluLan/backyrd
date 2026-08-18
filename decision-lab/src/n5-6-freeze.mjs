import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { contentHash } from "./canonical-json.mjs";
import { buildN5_6SealedArtifact } from "./n5-6-validation.mjs";

const root = new URL("../../", import.meta.url);
const paths = Object.freeze({
  engine: "decision-lab/src/n5-6-canonical-user-intelligence.mjs",
  projection: "decision-lab/src/n5-6-signed-projection.mjs",
  world: "decision-lab/src/n5-6-world.mjs",
  histories: "decision-lab/src/n5-6-product-like-histories.mjs",
  validation: "decision-lab/src/n5-6-validation.mjs",
  freezer: "decision-lab/src/n5-6-freeze.mjs",
  test: "decision-lab/test/n5-6-canonical-user-intelligence.test.mjs",
  contract: "decision-lab/config/n5-6-validation-contract-v1.json",
  baseline: "decision-lab/baselines/n5-6-canonical-user-intelligence-v1.json",
  freeze: "decision-lab/config/n5-6-canonical-user-intelligence-v1.freeze.json"
});
const sha = async (path) => createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");

export async function buildN5_6Freeze() {
  const files = {};
  for (const key of ["engine", "projection", "world", "histories", "validation", "freezer", "test", "contract"]) files[key] = { path: paths[key], sha256: await sha(paths[key]) };
  const artifact = await buildN5_6SealedArtifact();
  const body = { freezeVersion: "backyrd-n5-6-canonical-user-intelligence-freeze-v1", frozenBeforeOfficialMeasurement: true, files, contractHash: artifact.contractHash, n56ContractHash: artifact.identities.n56ContractHash, worldHash: artifact.identities.worldHash, resultHash: artifact.resultHash, scientificValidity: artifact.scientificValidity, humanReviewRequired: true, automaticN6Authorization: false, externalAiCalls: 0, production: "UNCHANGED" };
  return { ...body, freezeHash: contentHash(body) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const artifact = await buildN5_6SealedArtifact();
  const freeze = await buildN5_6Freeze();
  if (process.argv.includes("--write")) {
    await writeFile(new URL(paths.baseline, root), `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(new URL(paths.freeze, root), `${JSON.stringify(freeze, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(freeze, null, 2)}\n`);
}
