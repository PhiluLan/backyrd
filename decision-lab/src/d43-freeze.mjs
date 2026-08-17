#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot } from "./io.mjs";

const sha = async (path) => createHash("sha256").update(await readFile(resolve(repoRoot, path))).digest("hex");

export async function currentD43Identity() {
  const config = await readJson(resolve(repoRoot, "decision-lab/config/d4.3-ai-reranker-v1.json"));
  return {
    freezeVersion: "backyrd-d4.3-ai-reranker-post-stop-evidence-freeze-v1",
    freezeTiming: "POST_PILOT_STOP_EVIDENCE_ONLY_NOT_PRE_RUN_CERTIFICATION",
    experimentVersion: config.version,
    contractHash: contentHash(config),
    rerankerSourceHash: await sha("decision-lab/src/d43-ai-reranker.mjs"),
    dryRunSourceHash: await sha("decision-lab/src/d43-dry-run.mjs"),
    stageRunnerSourceHash: await sha("decision-lab/src/d43-stage-world-cli.mjs"),
    evaluatorSourceHash: await sha("decision-lab/src/d43-evaluate-stage.mjs"),
    stageScriptHash: await sha("scripts/decision/run-d4-3-smoke.sh"),
    wave4ParentResultHash: config.parentIdentities.wave4ResultHash,
    scientificStatus: "FAIL_MEASUREMENT_CONTRACT_AND_PRE_RUN_FREEZE",
    productionAccess: "NONE",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(`${JSON.stringify(await currentD43Identity(), null, 2)}\n`);
