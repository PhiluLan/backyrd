import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { canonicalJson, contentHash } from "../dist/index.js";
import {
  createFounderLiveRuntimeCapabilityController,
  FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION,
} from "../dist/founder-live-runtime-capability.js";

const H = (value) => contentHash(value);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const now = "2026-09-18T16:00:00.000Z";
const memberDigests = [H("founder-a"), H("founder-b")];
const memberDigestSetHash = H({ namespace: "backyrd.founder-live.member-digest-set@1.0", memberDigests: [...memberDigests].sort() });
const expected = Object.freeze({
  projectRef: "synthetic-project-ref",
  canonicalMainSha: "3".repeat(40), canonicalTreeSha: "b".repeat(40),
  releaseHash: H("release"), artifactHash: H("artifact"), sourceSetHash: H("source-set"),
  productionPlanHash: H("plan"), policyHash: H("policy"),
  authorityGeneration: 7, authorityNonce: "synthetic-nonce-7", killSwitchGeneration: 11,
});
const rootBody = Object.freeze({
  contractVersion: "backyrd.decision-vnext.founder-live-runtime-trust-root@1.0",
  trustRootId: "synthetic-runtime-root-1", keyId: "synthetic-ed25519-key-1", algorithm: "Ed25519",
  scope: "FOUNDER_LIVE_PRODUCTION_RUNTIME", publicKeySpkiPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  validFrom: "2026-09-18T00:00:00.000Z", validUntil: "2026-09-19T00:00:00.000Z", status: "ACTIVE",
});
const root = Object.freeze({ ...rootBody, trustRootHash: H(rootBody) });
const signed = (body, hashField) => Object.freeze({ ...body, [hashField]: H(body), signature: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString("base64") });
const authorityBody = Object.freeze({
  contractVersion: "backyrd.decision-vnext.founder-live-runtime-authority@1.1",
  authorityId: "synthetic-runtime-authority-1", mode: "PRODUCTION_FOUNDER_READ_ONLY", purpose: "FOUNDER_DECISION_EVALUATION",
  ...expected,
  expectedMemberCount: 2, memberDigestSetHash,
  validFrom: "2026-09-18T15:00:00.000Z", validUntil: "2026-09-18T17:00:00.000Z",
  issuer: "BACKYRD_FOUNDER_LIVE_RUNTIME_AUTHORITY", readOnlyScope: true, learningAuthorized: false,
  writebackAuthorized: false, rankingAuthorized: false, eligibilityAuthorized: false, shadowTrafficAuthorized: false,
  genericProductionAuthority: false, keyId: root.keyId,
});
const authority = signed(authorityBody, "authorityHash");
const kill = (state = "DISENGAGED_FOR_EXACT_RELEASE", overrides = {}) => signed({
  contractVersion: "backyrd.decision-vnext.founder-live-kill-switch@1.0", recordId: "synthetic-kill-switch-11",
  projectRef: expected.projectRef, authorityHash: authority.authorityHash, authorityGeneration: 7, killSwitchGeneration: 11,
  state, observedAt: "2026-09-18T15:59:55.000Z", validUntil: "2026-09-18T16:00:05.000Z",
  issuer: "BACKYRD_FOUNDER_LIVE_EMERGENCY_AUTHORITY", keyId: root.keyId, ...overrides,
}, "recordHash");

function fixture() {
  const state = { root, authority, kill: kill(), memberDigests, now };
  const controller = createFounderLiveRuntimeCapabilityController({
    provisioning: {
      acceptedTrustRootHash: root.trustRootHash,
      loadTrustRoot: () => state.root,
      loadAuthorityRecord: () => state.authority,
      loadKillSwitchRecord: () => state.kill,
      loadMemberDigests: () => state.memberDigests,
    },
    expected,
    now: () => state.now,
  });
  return { state, controller };
}

test("exact externally anchored records mint an in-process executable capability", () => {
  const { controller } = fixture();
  const capability = controller.mint();
  assert.equal(capability.contractVersion, FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION);
  assert.equal(capability.status, "VERIFIED_EXECUTABLE");
  assert.equal(capability.memberDigestSetHash, memberDigestSetHash);
  for (const key of ["projectRef", "canonicalMainSha", "canonicalTreeSha", "releaseHash", "artifactHash", "sourceSetHash", "productionPlanHash", "policyHash"]) assert.equal(capability[key], expected[key]);
  controller.verifyBoundary(capability);
});

test("only a verified capability crosses guarded runtime boundaries", async () => {
  const { controller } = fixture(); const capability = controller.mint();
  const calls = [];
  for (const boundary of ["REQUEST_START", "AUTH", "ALLOWLIST", "RATE_LIMIT", "BODY_PARSE", "LOCATION_AUTHORITY", "RETRIEVAL", "USER_READ", "WORLD_READ", "EVALUATION", "IDEMPOTENCY", "EXPERT_RESPONSE", "FINAL_OUTPUT"]) {
    await controller.runBoundary(capability, boundary, () => { calls.push(boundary); return boundary; });
  }
  assert.deepEqual(calls, ["REQUEST_START", "AUTH", "ALLOWLIST", "RATE_LIMIT", "BODY_PARSE", "LOCATION_AUTHORITY", "RETRIEVAL", "USER_READ", "WORLD_READ", "EVALUATION", "IDEMPOTENCY", "EXPERT_RESPONSE", "FINAL_OUTPUT"]);
  let forbiddenCalls = 0;
  await assert.rejects(() => controller.runBoundary({ ...capability }, "AUTH", () => { forbiddenCalls += 1; }), /capability_untrusted/);
  assert.equal(forbiddenCalls, 0);
});

test("casts, object spread, structured clone and serialization cannot mint or carry capability authority", () => {
  const { controller } = fixture();
  const capability = controller.mint();
  for (const forged of [
    { ...capability },
    structuredClone(capability),
    JSON.parse(JSON.stringify(capability)),
    { contractVersion: FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION, status: "VERIFIED_EXECUTABLE", authorityHash: capability.authorityHash, authorityGeneration: 7, killSwitchGeneration: 11, memberDigestSetHash },
  ]) assert.throws(() => controller.verifyBoundary(forged), /capability_untrusted/);
});

test("every identity drift and membership drift fails closed even after minting", () => {
  for (const key of ["projectRef", "canonicalMainSha", "canonicalTreeSha", "releaseHash", "artifactHash", "sourceSetHash", "productionPlanHash", "policyHash"]) {
    const { state, controller } = fixture(); const capability = controller.mint();
    const replacement = key.endsWith("Sha") ? "9".repeat(40) : key === "projectRef" ? "other-project" : "9".repeat(64);
    state.authority = signed({ ...authorityBody, [key]: replacement }, "authorityHash");
    assert.throws(() => controller.verifyBoundary(capability));
  }
  for (const badMembers of [[memberDigests[0]], [memberDigests[0], memberDigests[0]], [memberDigests[0], H("third")], ["not-a-digest", memberDigests[1]]]) {
    const { state, controller } = fixture(); const capability = controller.mint(); state.memberDigests = badMembers;
    assert.throws(() => controller.verifyBoundary(capability));
  }
});

test("emergency OFF, stale records, revocation and generation changes abort warm and in-flight capabilities", () => {
  const { state, controller } = fixture(); const capability = controller.mint();
  state.kill = kill("ENGAGED"); assert.throws(() => controller.verifyBoundary(capability), /kill_switch_engaged/);
  state.kill = kill(); controller.verifyBoundary(capability);
  state.now = "2026-09-18T16:01:00.000Z"; assert.throws(() => controller.verifyBoundary(capability), /stale/);
  state.now = now; state.root = { ...root, status: "REVOKED", trustRootHash: H({ ...rootBody, status: "REVOKED" }) }; assert.throws(() => controller.verifyBoundary(capability));
  state.root = root; state.authority = signed({ ...authorityBody, authorityGeneration: 8 }, "authorityHash"); assert.throws(() => controller.verifyBoundary(capability));
});

test("mid-flight emergency OFF prevents every later guarded operation", async () => {
  const { state, controller } = fixture(); const capability = controller.mint(); let reads = 0;
  await controller.runBoundary(capability, "AUTH", () => { reads += 1; });
  state.kill = kill("ENGAGED");
  await assert.rejects(() => controller.runBoundary(capability, "USER_READ", () => { reads += 1; }), /kill_switch_engaged/);
  await assert.rejects(() => controller.runBoundary(capability, "WORLD_READ", () => { reads += 1; }), /kill_switch_engaged/);
  await assert.rejects(() => controller.runBoundary(capability, "EVALUATION", () => { reads += 1; }), /kill_switch_engaged/);
  assert.equal(reads, 1);
});

test("a replacement key and its self-signed records cannot replace the externally accepted root", () => {
  const { publicKey: otherPublic } = generateKeyPairSync("ed25519");
  const otherBody = { ...rootBody, keyId: "replacement-key", publicKeySpkiPem: otherPublic.export({ type: "spki", format: "pem" }).toString() };
  const { state, controller } = fixture(); state.root = { ...otherBody, trustRootHash: H(otherBody) };
  assert.throws(() => controller.mint(), /externally accepted/);
});

test("independent controllers model restart and multi-instance verification without sharing capabilities", () => {
  const first = fixture(); const second = fixture();
  const firstCapability = first.controller.mint(); const secondCapability = second.controller.mint();
  first.controller.verifyBoundary(firstCapability); second.controller.verifyBoundary(secondCapability);
  assert.throws(() => second.controller.verifyBoundary(firstCapability), /capability_untrusted/);
  assert.throws(() => first.controller.verifyBoundary(secondCapability), /capability_untrusted/);
});
