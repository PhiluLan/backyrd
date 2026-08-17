import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";

const artifactUrl = new URL("../baselines/wave2.2-retrieval-breakthrough-v1.json", import.meta.url);
const engineUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);

test("Wave 2.2 evidence is complete, sealed, scientifically valid and rejects the losing stack", async () => {
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
  const sealed = structuredClone(artifact);
  delete sealed.resultHash;

  assert.equal(contentHash(sealed), artifact.resultHash);
  assert.deepEqual(artifact.sample, { seeds: 3, scenariosPerSeed: 42, decisions: 126, embeddingMode: "FULL_FIDELITY" });
  assert.equal(artifact.frozenIdentities.retrievalQualityFreeze, "6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947");
  assert.equal(artifact.frozenIdentities.d2_1, "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf");
  assert.equal(artifact.frozenIdentities.d2_2, "9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053");
  assert.equal(artifact.sourceHashes.engineMutation, "NONE");
  assert.equal(artifact.sourceHashes.executionSource, createHash("sha256").update(await readFile(engineUrl)).digest("hex"));
  assert.deepEqual(artifact.integrity, {
    unresolved: 0,
    productFailures: 0,
    distributionFailures: 0,
    userConstraintFailures: 0,
    scientificValidity: "PASS",
    latentTruthInEngineInput: false,
    retrievalQualityContractMutation: "NONE",
    productionAccess: "NONE",
  });
  assert.equal(artifact.promotion.pass, false);
  assert.equal(artifact.promotion.verdict, "REJECT");
  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.architectureVerdict, "NOT_PROMOTED");
  assert.equal(artifact.semantic.decision, "HARDEN");
  assert.ok(artifact.externalUsage.externalCostPerDecisionUsd < 0.01);
  assert.ok(Object.values(artifact.sourceContribution).every((row) => Number.isInteger(row.uniqueUsefulCandidates)));
});
