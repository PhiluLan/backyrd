import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_SOURCE_POLICY,
  REGISTRY_HASH,
  REGISTRY_VERSION,
  WORLD_KNOWLEDGE_PORT_VERSION,
  buildWorldKnowledgeSnapshot,
  createWorldDarkReader,
  parseBuildWorldKnowledgeInput,
  resolveWorldDarkReaderState,
  resolveWorldKnowledge,
  resolutionRequest,
} from "../dist/index.js";

const request = { ...resolutionRequest([]), sourcePolicy: ACCEPTED_SOURCE_POLICY };
const resolution = resolveWorldKnowledge(request, [ACCEPTED_SOURCE_POLICY]);
const snapshot = buildWorldKnowledgeSnapshot(parseBuildWorldKnowledgeInput({
  contractVersion: WORLD_KNOWLEDGE_PORT_VERSION,
  spotId: "synthetic-week2-dark-reader",
  resolution,
}, [ACCEPTED_SOURCE_POLICY]), [ACCEPTED_SOURCE_POLICY]);
const readInput = { spotId: snapshot.spot.spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH };

test("World Dark Reader defaults OFF with an engaged kill switch and performs zero loads", async () => {
  for (const configuration of [undefined, {}, { WORLD_PRODUCT_READ: "false" }, { WORLD_PRODUCT_READ: "unknown" }, { WORLD_PRODUCT_READ: "true" }]) {
    let loads = 0;
    const dark = createWorldDarkReader({ configuration, loadSnapshot: async () => { loads += 1; return snapshot; } });
    assert.equal(dark.state.enabled, false);
    assert.equal(dark.state.killSwitch, "ENGAGED");
    await assert.rejects(() => dark.reader.readSnapshot(readInput), /world_dark_reader_off/);
    assert.equal(loads, 0);
  }
});

test("kill switch remains independently fail-closed", async () => {
  let loads = 0;
  const dark = createWorldDarkReader({ configuration: { WORLD_PRODUCT_READ: "true", WORLD_PRODUCT_READ_KILL_SWITCH: "ENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "LOCAL_TEST" }, loadSnapshot: async () => { loads += 1; return snapshot; } });
  assert.equal(dark.state.reason, "KILL_SWITCH_ENGAGED");
  await assert.rejects(() => dark.reader.readSnapshot(readInput), /KILL_SWITCH_ENGAGED/);
  assert.equal(loads, 0);
});

test("test-ON delegates exactly one read-only Registry 2.1 request through the canonical port", async () => {
  let observed;
  const dark = createWorldDarkReader({ configuration: { WORLD_PRODUCT_READ: "true", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "PROD_LIKE_TEST" }, loadSnapshot: async (input) => { observed = input; return snapshot; } });
  assert.equal(dark.state.enabled, true);
  assert.equal(dark.state.readOnly, true);
  const result = await dark.reader.readSnapshot(readInput);
  assert.equal(result.snapshotHash, snapshot.snapshotHash);
  assert.deepEqual(observed, { spotId: snapshot.spot.spotId, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, accessMode: "READ_ONLY", environment: "PROD_LIKE_TEST" });
});

test("test-ON fails closed on contract, registry, hash, spot and snapshot tampering", async () => {
  const enabled = { WORLD_PRODUCT_READ: "true", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "LOCAL_TEST" };
  const dark = createWorldDarkReader({ configuration: enabled, loadSnapshot: async () => snapshot });
  await assert.rejects(() => dark.reader.readSnapshot({ ...readInput, registryHash: "0".repeat(64) }), /contract_identity_mismatch/);
  const forged = structuredClone(snapshot); forged.snapshotHash = "0".repeat(64);
  const forgedReader = createWorldDarkReader({ configuration: enabled, loadSnapshot: async () => forged });
  await assert.rejects(() => forgedReader.reader.readSnapshot(readInput), /snapshot hash mismatch/);
  const wrongSpot = createWorldDarkReader({ configuration: enabled, loadSnapshot: async () => snapshot });
  await assert.rejects(() => wrongSpot.reader.readSnapshot({ ...readInput, spotId: "synthetic-other" }), /spot_identity_mismatch/);
});

test("state parser never treats missing or unknown configuration as ON", () => {
  assert.equal(resolveWorldDarkReaderState({}).worldProductRead, false);
  assert.equal(resolveWorldDarkReaderState({ WORLD_PRODUCT_READ: "TRUE", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "PRODUCTION" }).enabled, false);
  assert.equal(resolveWorldDarkReaderState({ WORLD_PRODUCT_READ: "banana", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "LOCAL_TEST" }).reason, "CONFIGURATION_INVALID");
});
