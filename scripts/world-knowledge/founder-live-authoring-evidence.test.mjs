import assert from "node:assert/strict";
import test from "node:test";
import { buildFounderLiveAuthoringEvidence } from "./build-founder-live-authoring-evidence.mjs";

test("Founder live authoring evidence binds the canonical contracts and unchanged migration bundle", () => {
  const report = buildFounderLiveAuthoringEvidence();
  assert.equal(report.persistence.migrationCount, 9);
  assert.equal(report.persistence.migrationBundleHash, "8a642e025701cb02a769fcdf7fda4390f955bad08478a2690ae512a6c197d066");
  assert.equal(report.contracts.registryVersion, "backyrd.world-knowledge.registry@2.1");
  assert.equal(report.contracts.readerVersion, "backyrd.world-knowledge.reader-port@1.0");
  assert.deepEqual(report.authoringFlow.postWriteSequence, ["APPEND_CLAIM", "VERIFY_SERVER_AUTHORITY", "CANONICAL_REBUILD", "VALIDATED_READER", "UI_RELOAD"]);
  assert.equal(report.authoringFlow.manualFileHandoffRequired, false);
});

test("Founder live authoring remains fail-closed and Production unauthorized", () => {
  const report = buildFounderLiveAuthoringEvidence();
  assert.equal(report.runtime.default, "OFF");
  assert.equal(report.runtime.killSwitch, "ENGAGED");
  assert.deepEqual(report.runtime.allowedEnvironments, ["LOCAL_TEST", "PROD_LIKE_TEST"]);
  assert.deepEqual([report.runtime.productionConnections, report.runtime.productionQueries, report.runtime.productionWrites, report.runtime.productOutputs], [0, 0, 0, 0]);
  assert.equal(report.runtime.mobileWiring, "NONE");
  assert.equal(report.runtime.decisionWiring, "NONE");
  assert.equal(report.releaseCandidate.executionAuthorized, false);
  assert.equal(report.releaseCandidate.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY");
});

test("Founder live evidence is byte deterministic for one Git identity", () => {
  assert.deepEqual(buildFounderLiveAuthoringEvidence(), buildFounderLiveAuthoringEvidence());
});
