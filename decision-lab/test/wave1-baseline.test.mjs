import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";

const artifactUrl = new URL("../baselines/wave1-intent-constraints-v1.json", import.meta.url);
const candidateUrl = new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url);

test("Wave 1 frozen comparison is complete, sealed, and promotion-safe", async () => {
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
  const sealed = structuredClone(artifact);
  delete sealed.resultHash;

  assert.equal(contentHash(sealed), artifact.resultHash);
  assert.equal(artifact.version, "wave1-comparison-v1");
  assert.equal(artifact.sampleSizes.seeds, 3);
  assert.equal(artifact.sampleSizes.goldenDecisions, 126);
  assert.equal(artifact.fidelity.semantic, "FAST_SIMULATION");
  assert.equal(artifact.productionAccess, "NONE");
  assert.equal(artifact.parentV13Mutation, "NONE");
  assert.equal(artifact.scientificValidity, "PASS");
  assert.equal(artifact.d3f001.beforeDecisionFailures, 21);
  assert.equal(artifact.d3f001.afterDecisionFailures, 0);
  assert.equal(artifact.metrics.wave1.hardViolationRate, 0);
  assert.equal(artifact.hardGates.productEligibility.pass, true);
  assert.equal(artifact.hardGates.distributionEligibility.pass, true);
  assert.equal(artifact.hardGates.hardCategory.pass, true);
  assert.equal(artifact.hardGates.categoryExclusion.pass, true);
  assert.equal(artifact.hardGates.openNow.pass, true);
  assert.equal(artifact.promotion.harmfulRetrievalCollapse, false);
  assert.equal(artifact.verdict, "PASS");

  const { createHash } = await import("node:crypto");
  const candidateHash = createHash("sha256").update(await readFile(candidateUrl)).digest("hex");
  assert.equal(candidateHash, artifact.sourceArtifactHash);
  assert.equal(candidateHash, artifact.engine.sourceHash);
});
