import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";

const artifactUrl = new URL("../baselines/wave2-retrieval-spot-intelligence-v1.json", import.meta.url);
const candidateUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);

test("Wave 2 baseline is complete, sealed, scientifically valid, and honest about promotion", async () => {
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
  const sealed = structuredClone(artifact);
  delete sealed.resultHash;

  assert.equal(contentHash(sealed), artifact.resultHash);
  assert.deepEqual(artifact.sampleSizes, {
    modes: 2,
    engines: 2,
    seeds: 3,
    scenariosPerSeed: 42,
    decisionsPerArm: 126,
    totalDecisions: 504,
  });
  assert.equal(artifact.frozenIdentities.d2_1, "6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf");
  assert.equal(artifact.frozenIdentities.d2_2, "9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053");
  assert.equal(artifact.sourceHashes.v13, "a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba");
  assert.equal(artifact.integrity.scientificValidity, "PASS");
  assert.equal(artifact.integrity.productionAccess, "NONE");
  assert.equal(artifact.integrity.productFailures, 0);
  assert.equal(artifact.integrity.distributionFailures, 0);
  assert.equal(artifact.integrity.userConstraintFailures, 0);

  assert.equal(artifact.retrievalQuality, "IMPROVED");
  assert.equal(artifact.promotion.fastImprovesAllSeeds, true);
  assert.equal(artifact.promotion.fullImprovesAllSeeds, true);
  assert.equal(artifact.promotion.fastHoldoutImproves, true);
  assert.equal(artifact.promotion.fullHoldoutImproves, true);
  assert.equal(artifact.promotion.fullRecallFloor, false);
  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.semantic.classification, "HARDEN");
  assert.equal(artifact.externalUsage.model, "text-embedding-3-small");
  assert.equal(artifact.externalUsage.dimensions, 1536);
  assert.ok(artifact.externalUsage.estimatedCostUsd > 0);
  assert.ok(artifact.externalUsage.estimatedCostUsd < 3);

  const candidateHash = createHash("sha256").update(await readFile(candidateUrl)).digest("hex");
  assert.equal(candidateHash, artifact.sourceArtifactHash);
  assert.equal(candidateHash, artifact.sourceHashes.wave2);
});
