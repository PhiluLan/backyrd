import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";

const artifactUrl = new URL("../baselines/wave2.3-retrieval-rebuild-v1.json", import.meta.url);
const engineUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);

test("Wave 2.3 evidence is complete, sealed, scientifically valid and rejects the unpromoted stack", async () => {
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
  const sealed = structuredClone(artifact);
  delete sealed.resultHash;
  assert.equal(contentHash(sealed), artifact.resultHash);
  assert.deepEqual(artifact.sample, { seeds: 3, scenariosPerSeed: 42, decisions: 126, embeddingMode: "FULL_FIDELITY" });
  assert.equal(artifact.frozenIdentities.retrievalQualityFreeze, "6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947");
  assert.equal(artifact.sourceHashes.executionSource, createHash("sha256").update(await readFile(engineUrl)).digest("hex"));
  assert.equal(artifact.sourceHashes.engineMutation, "NONE");
  assert.deepEqual(artifact.integrity, {
    unresolved: 0, productFailures: 0, distributionFailures: 0, userConstraintFailures: 0,
    scientificValidity: "PASS", latentTruthInEngineInput: false,
    retrievalQualityContractMutation: "NONE", productionAccess: "NONE",
  });
  assert.equal(artifact.promotion.pass, false);
  assert.equal(artifact.promotion.verdict, "REJECT");
  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.architectureVerdict, "NOT_PROMOTED");
  assert.equal(artifact.semantic.decision, "KEEP");
  assert.ok(artifact.pairedLift.interval[0] > 0);
  assert.ok(artifact.comparison.wave2_3.topKCapacityCapture > artifact.comparison.wave2_2.topKCapacityCapture);
  assert.ok(artifact.comparison.wave2_3.fullPoolRecall > artifact.comparison.wave2_2.fullPoolRecall);
  assert.ok(artifact.externalUsage.externalCostPerDecisionUsd < 0.01);
  assert.ok(artifact.comparison.wave2_3.latencyMs.p95 < 750);
});
