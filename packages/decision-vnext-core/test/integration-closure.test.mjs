import test from "node:test";
import assert from "node:assert/strict";
import { REGISTRY_HASH, REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, parseWorldKnowledgeSnapshot } from "@backyrd/world-knowledge-core";
import { parseRelevantUserProjection } from "@backyrd/user-intelligence-vnext-core";
import { CandidatePoolSnapshotSchema, DecisionExecutionEnvelopeSchema, SyntheticUserProjectionReader, SyntheticWorldKnowledgeReader, adaptWorldKnowledgeSnapshot, createSyntheticExecution, readCanonicalWorld, readRelevantUserProjection, runPhase1Decision } from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

test("Decision consumes canonical World snapshots and preserves not-configured intent readiness", async () => {
  const synthetic = world(); const reader = new SyntheticWorldKnowledgeReader(synthetic); const snapshot = await readCanonicalWorld(reader, synthetic.spots[0].id);
  assert.equal(parseWorldKnowledgeSnapshot(snapshot).contractVersion, WORLD_KNOWLEDGE_PORT_VERSION);
  assert.equal(snapshot.registryVersion, REGISTRY_VERSION); assert.equal(snapshot.registryHash, REGISTRY_HASH);
  assert.ok(snapshot.readiness.find((row) => row.useCase === "INTENT_MATCHING")?.reasonCodes.includes("CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED"));
  const candidate = adaptWorldKnowledgeSnapshot(snapshot, synthetic.spots[0].retrieval);
  assert.equal(candidate.worldReference.snapshotHash, snapshot.snapshotHash);
  assert.equal("worldKnowledge" in candidate, false, "Decision must not copy the canonical World domain contract");
  assert.equal("commercialProbe" in candidate, false);
});

test("canonical User projection port is privacy-neutral and has no eligibility authority", async () => {
  const synthetic = world(); const envelope = execution(undefined, synthetic); const context = envelope.contextBinding;
  const port = new SyntheticUserProjectionReader("NO_CONSENT");
  const projection = await port.project({ contractVersion: "backyrd.user-intelligence.projection-request@1.0", requestId: envelope.serverRequestId, actor: { kind: "AUTHENTICATED_USER", userId: "synthetic-user", subjectBindingHash: envelope.authenticatedActor.subjectBindingHash, authenticationContextHash: "0".repeat(64), boundBy: "SERVER" }, decisionId: envelope.decisionId, snapshot: null, context: { contextContractVersion: context.contractVersion, contextHash: context.hash, placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false }, requestedDomains: [], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "phase1-projection-policy-not-configured", killSwitch: false });
  assert.equal(parseRelevantUserProjection(projection).neutralReason, "NO_CONSENT"); assert.equal(projection.boundaries.eligibilityAuthority, false); assert.deepEqual(projection.taste, []);
});

test("missing World and User degradation modes are explicit and subject-bound", async () => {
  const synthetic = world(); const envelope = execution(undefined, synthetic);
  await assert.rejects(() => readCanonicalWorld(new SyntheticWorldKnowledgeReader(synthetic), "syn-spot-missing"), /world_snapshot_missing/);
  const baseRequest = { contractVersion: "backyrd.user-intelligence.projection-request@1.0", requestId: envelope.serverRequestId, actor: { kind: "AUTHENTICATED_USER", userId: "synthetic-user", subjectBindingHash: envelope.authenticatedActor.subjectBindingHash, authenticationContextHash: "0".repeat(64), boundBy: "SERVER" }, decisionId: envelope.decisionId, snapshot: null, context: { contextContractVersion: envelope.contextBinding.contractVersion, contextHash: envelope.contextBinding.hash, placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false }, requestedDomains: [], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "phase1-projection-policy-not-configured", killSwitch: false };
  const missing = await readRelevantUserProjection(new SyntheticUserProjectionReader("MISSING_SNAPSHOT"), baseRequest); assert.equal(missing.neutralReason, "MISSING_SNAPSHOT");
  const killed = await readRelevantUserProjection(new SyntheticUserProjectionReader("KILL_SWITCH"), { ...baseRequest, killSwitch: true }); assert.equal(killed.neutralReason, "KILL_SWITCH");
  const fixed = { contractVersion: "backyrd.user-intelligence.decision-projection-port@1.0", project: async () => missing };
  await assert.rejects(() => readRelevantUserProjection(fixed, { ...baseRequest, actor: { ...baseRequest.actor, subjectBindingHash: "1".repeat(64) } }), /projection does not match server request binding/);
});

test("context, world, user and candidate-pool bindings fail closed", () => {
  const synthetic = world(); const envelope = execution(undefined, synthetic); const base = { request: request(), world: synthetic, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36 };
  for (const changed of [
    { ...envelope, contextBinding: { ...envelope.contextBinding, hash: "0".repeat(64) } },
    { ...envelope, worldBinding: { ...envelope.worldBinding, registryHash: "0".repeat(64) } },
    { ...envelope, userBinding: { ...envelope.userBinding, subjectBindingHash: "0".repeat(64) } },
    { ...envelope, candidatePoolBinding: { ...envelope.candidatePoolBinding, hash: "0".repeat(64) } },
  ]) assert.throws(() => runPhase1Decision({ ...base, execution: changed }), /envelopeHash_mismatch|execution_binding_mismatch/);
});

test("context flip and subject flip change authoritative identities without mutating World", () => {
  const synthetic = world(); const before = synthetic.worldHash; const first = execution(undefined, synthetic);
  const flippedRequest = { ...request(), location: { kind: "city", city: "Fixture Zurich" } };
  const second = createSyntheticExecution({ request: flippedRequest, world: synthetic, baseline: "baseline-a-open-distance-popularity", sourceSha: "phase1-test-source", candidatePoolSize: 36 });
  assert.notEqual(first.contextBinding.hash, second.contextBinding.hash);
  const userBound = createSyntheticExecution({ request: request(), world: synthetic, baseline: "baseline-a-open-distance-popularity", sourceSha: "phase1-test-source", candidatePoolSize: 36, actor: { kind: "user", userId: "syn-user-0001", subjectBindingHash: synthetic.users[0].subjectBindingHash } });
  assert.notEqual(first.userBinding.subjectBindingHash, userBound.userBinding.subjectBindingHash); assert.equal(synthetic.worldHash, before);
});

test("unknown manifest and duplicated privileged client bindings are rejected", () => {
  const synthetic = world(); const envelope = execution(undefined, synthetic);
  assert.throws(() => DecisionExecutionEnvelopeSchema.parse({ ...envelope, contractVersion: "unknown" }), /expected|unknown contract version/);
  assert.throws(() => CandidatePoolSnapshotSchema.parse({ contractVersion: "unknown" }), /expected|required field/);
  assert.throws(() => createSyntheticExecution({ request: { ...request(), worldSnapshot: synthetic.spots[0].snapshot }, world: synthetic, baseline: "baseline-a-open-distance-popularity", sourceSha: "phase1-test-source" }), /unknown field/);
});
