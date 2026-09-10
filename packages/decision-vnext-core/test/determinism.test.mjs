import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  contentHash,
  createSyntheticExecution,
  decisionResultBytes,
  generateSyntheticWorld,
  replayPhase1Decision,
  runPhase1Decision,
  validateCandidatePool,
  validateDecisionResultIntegrity,
} from "../dist/index.js";
import { config, execution, request, world } from "./helpers.mjs";

test("same seed is byte-identical and a different seed changes world identity", () => {
  const left = generateSyntheticWorld(config);
  const right = generateSyntheticWorld({ ...config });
  const changed = generateSyntheticWorld({ ...config, seed: config.seed + 1, worldVersion: "backyrd-vnext-synthetic-world-test-seed-2-v1" });
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(left.worldHash, right.worldHash);
  assert.notEqual(left.worldHash, changed.worldHash);
});

test("canonical hash sorts object keys, preserves array order, normalizes unicode and negative zero", () => {
  assert.equal(contentHash({ b: 2, a: 1 }), contentHash({ a: 1, b: 2 }));
  assert.notEqual(contentHash({ values: [1, 2] }), contentHash({ values: [2, 1] }));
  assert.equal(contentHash({ text: "e\u0301", value: -0 }), contentHash({ value: 0, text: "é" }));
  assert.throws(() => canonicalJson({ missing: undefined }), /canonical_undefined/);
});

test("same decision is byte-identical and replay is manifest-bound", () => {
  const syntheticWorld = world();
  const requestValue = request();
  const executionValue = execution(undefined, syntheticWorld);
  const args = { request: requestValue, execution: executionValue, world: syntheticWorld, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36, resultLimit: 3 };
  const left = runPhase1Decision(args);
  const right = runPhase1Decision(args);
  assert.deepEqual(decisionResultBytes(left), decisionResultBytes(right));
  assert.equal(left.resultHash, right.resultHash);
  validateDecisionResultIntegrity(left);
  const record = { request: requestValue, execution: executionValue, baseline: args.baseline, candidatePoolSize: 36, resultLimit: 3, expectedResultHash: left.resultHash, expectedManifestHash: executionValue.engineManifest.manifestHash };
  assert.equal(replayPhase1Decision(record, syntheticWorld).resultHash, left.resultHash);
  assert.throws(() => replayPhase1Decision({ ...record, expectedManifestHash: "0".repeat(64) }, syntheticWorld), /replay_manifest_mismatch/);
});

test("relevant request changes identity and pool mutation is detected", () => {
  const syntheticWorld = world();
  const executionValue = execution(undefined, syntheticWorld);
  const base = runPhase1Decision({ request: request(), execution: executionValue, world: syntheticWorld, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36 });
  const changedRequest = { ...request(), moodKeys: ["fixture.mood.lively"] };
  const changedExecution = createSyntheticExecution({ request: changedRequest, world: syntheticWorld, baseline: "baseline-a-open-distance-popularity", sourceSha: executionValue.engineManifest.sourceSha, authorizedLocationScope: changedRequest.location, candidatePoolSize: 36 });
  const changed = runPhase1Decision({ request: changedRequest, execution: changedExecution, world: syntheticWorld, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36 });
  assert.notEqual(base.requestHash, changed.requestHash);
  assert.notEqual(base.resultHash, changed.resultHash);
  const tampered = structuredClone(base.candidatePool);
  tampered.candidates.reverse();
  assert.throws(() => validateCandidatePool(tampered), /candidatePoolHash_mismatch|candidate_pool_position_invalid/);
});
