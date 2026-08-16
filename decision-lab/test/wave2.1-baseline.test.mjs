import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";

const artifactUrl = new URL("../baselines/wave2.1-retrieval-next-gen-v1.json", import.meta.url);

test("Wave 2.1 evidence is complete, sealed, scientifically valid and honest about promotion", async () => {
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
  const sealed = structuredClone(artifact);
  delete sealed.resultHash;
  assert.equal(contentHash(sealed), artifact.resultHash);
  assert.deepEqual(artifact.sampleSizes, { modes: 2, seeds: 3, scenariosPerSeed: 42, decisionsPerMode: 126, totalDecisions: 252 });
  assert.equal(artifact.frozenIdentities.d2_1, "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf");
  assert.equal(artifact.frozenIdentities.d2_2, "9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053");
  assert.equal(artifact.sourceHashes.v13, "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba");
  assert.equal(artifact.integrity.scientificValidity, "PASS");
  assert.equal(artifact.integrity.latentTruthInEngineInput, false);
  assert.equal(artifact.integrity.rankingMutation, "NONE");
  assert.equal(artifact.integrity.productionAccess, "NONE");
  assert.equal(artifact.integrity.productFailures, 0);
  assert.equal(artifact.integrity.distributionFailures, 0);
  assert.equal(artifact.integrity.userConstraintFailures, 0);
  assert.equal(artifact.retrievalQuality, "IMPROVED");
  assert.equal(artifact.promotion.improvesAllSeeds, true);
  assert.equal(artifact.promotion.lockedHoldoutImproves, true);
  assert.equal(artifact.promotion.goodOrBetterRecallAt20Floor, false);
  assert.equal(artifact.promotion.oracleCapacitySupportsFloor, false);
  assert.equal(artifact.promotion.fullPoolDoesNotRegress, false);
  assert.equal(artifact.architectureVerdict, "NOT_PROMOTED");
  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.semantic.decision, "HARDEN");
  assert.ok(artifact.externalUsage.estimatedCostUsd > 0);
  assert.ok(artifact.externalUsage.estimatedCostUsd < artifact.externalUsage.capUsd);
});
