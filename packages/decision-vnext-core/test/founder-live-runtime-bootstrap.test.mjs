import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalJson, contentHash, FOUNDER_LIVE_KILL_SWITCH_VERSION, FOUNDER_LIVE_PRODUCTION_MODE,
  FOUNDER_LIVE_RUNTIME_AUTHORITY_VERSION, FOUNDER_LIVE_RUNTIME_TRUST_ROOT_VERSION,
  inspectFounderLiveKillSwitch, inspectFounderLiveRuntimeAuthority,
} from "../dist/index.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeySpkiPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const now = "2026-09-18T16:00:00.000Z";
const H = (value) => contentHash(value);
const hash64 = (label) => H(label);
const expected = Object.freeze({
  projectRef: "synthetic-project-ref", canonicalMainSha: "3".repeat(40), canonicalTreeSha: "b".repeat(40),
  releaseHash: hash64("release"), artifactHash: hash64("artifact"), sourceSetHash: hash64("source-set"),
  productionPlanHash: hash64("plan"), policyHash: hash64("policy"),
});
const rootBody = Object.freeze({
  contractVersion: FOUNDER_LIVE_RUNTIME_TRUST_ROOT_VERSION, trustRootId: "synthetic-runtime-root-1", keyId: "synthetic-ed25519-key-1",
  algorithm: "Ed25519", scope: "FOUNDER_LIVE_PRODUCTION_RUNTIME", publicKeySpkiPem,
  validFrom: "2026-09-18T00:00:00.000Z", validUntil: "2026-09-19T00:00:00.000Z", status: "ACTIVE",
});
const trustRoot = Object.freeze({ ...rootBody, trustRootHash: H(rootBody) });
const signed = (body, hashField) => ({ ...body, [hashField]: H(body), signature: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString("base64") });
const authorityBody = Object.freeze({
  contractVersion: FOUNDER_LIVE_RUNTIME_AUTHORITY_VERSION, authorityId: "synthetic-runtime-authority-1", mode: FOUNDER_LIVE_PRODUCTION_MODE,
  purpose: "FOUNDER_DECISION_EVALUATION", ...expected, authorityGeneration: 7, authorityNonce: "synthetic-nonce-7", killSwitchGeneration: 11,
  expectedMemberCount: 2, validFrom: "2026-09-18T15:00:00.000Z", validUntil: "2026-09-18T17:00:00.000Z",
  issuer: "BACKYRD_FOUNDER_LIVE_RUNTIME_AUTHORITY", readOnlyScope: true, learningAuthorized: false, writebackAuthorized: false,
  rankingAuthorized: false, eligibilityAuthorized: false, shadowTrafficAuthorized: false, genericProductionAuthority: false, keyId: rootBody.keyId,
});
const authorityRecord = Object.freeze(signed(authorityBody, "authorityHash"));
const authority = () => inspectFounderLiveRuntimeAuthority({ record: authorityRecord, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, expected, now });
const killBody = (state = "ENGAGED") => Object.freeze({
  contractVersion: FOUNDER_LIVE_KILL_SWITCH_VERSION, recordId: "synthetic-kill-switch-11", projectRef: expected.projectRef,
  authorityHash: authorityRecord.authorityHash, authorityGeneration: 7, killSwitchGeneration: 11, state,
  observedAt: "2026-09-18T15:59:55.000Z", validUntil: "2026-09-18T16:00:05.000Z",
  issuer: "BACKYRD_FOUNDER_LIVE_EMERGENCY_AUTHORITY", keyId: rootBody.keyId,
});
test("sealed runtime authority is structurally verified but never becomes execution authority", () => {
  const inspected = authority();
  assert.deepEqual(inspected, { status: "VERIFIED_NON_EXECUTABLE", authorityHash: authorityRecord.authorityHash, authorityGeneration: 7, killSwitchGeneration: 11, projectRef: expected.projectRef, executionAuthorized: false });
  assert.equal("capabilityHash" in inspected, false);
});

test("wrong project, main, tree, release, artifact, source-set, plan and policy fail closed", () => {
  for (const key of Object.keys(expected)) {
    const forgedExpected = { ...expected, [key]: key.endsWith("Sha") ? "9".repeat(40) : key === "projectRef" ? "other-project" : "9".repeat(64) };
    assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: authorityRecord, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, expected: forgedExpected, now }), new RegExp(key));
  }
});

test("missing, malformed, expired, self-selected and tampered authority fails closed", () => {
  assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: null, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, expected, now }));
  assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: { ...authorityRecord, signature: "A".repeat(88) }, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, expected, now }), /signature/);
  assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: authorityRecord, trustRoot, acceptedTrustRootHash: "0".repeat(64), expected, now }), /externally accepted/);
  assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: authorityRecord, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, expected, now: "2026-09-20T00:00:00.000Z" }), /validity/);
  const unprovisionedBody = { ...rootBody, status: "NOT_PROVISIONED" }; const unprovisioned = { ...unprovisionedBody, trustRootHash: H(unprovisionedBody) };
  assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: authorityRecord, trustRoot: unprovisioned, acceptedTrustRootHash: unprovisioned.trustRootHash, expected, now }), /not externally accepted/);
});

test("fresh kill-switch records remain non-executable and stale or unrelated records fail", () => {
  const inspectedAuthority = authority(); const engaged = signed(killBody(), "recordHash");
  assert.deepEqual(inspectFounderLiveKillSwitch({ record: engaged, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, authority: inspectedAuthority, now }), { state: "ENGAGED", recordHash: engaged.recordHash, executionAuthorized: false });
  const disengaged = signed(killBody("DISENGAGED_FOR_EXACT_RELEASE"), "recordHash");
  assert.equal(inspectFounderLiveKillSwitch({ record: disengaged, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, authority: inspectedAuthority, now }).executionAuthorized, false);
  const unrelated = signed({ ...killBody(), authorityGeneration: 8 }, "recordHash");
  assert.throws(() => inspectFounderLiveKillSwitch({ record: unrelated, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, authority: inspectedAuthority, now }), /unrelated/);
  assert.throws(() => inspectFounderLiveKillSwitch({ record: engaged, trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, authority: inspectedAuthority, now: "2026-09-18T16:01:00.000Z" }), /stale/);
});

test("schema rejects production relabeling and all authority widening", () => {
  for (const mutation of [
    { mode: "PROD_LIKE_TEST" }, { expectedMemberCount: 3 }, { learningAuthorized: true }, { writebackAuthorized: true },
    { rankingAuthorized: true }, { eligibilityAuthorized: true }, { shadowTrafficAuthorized: true }, { genericProductionAuthority: true },
  ]) assert.throws(() => inspectFounderLiveRuntimeAuthority({ record: signed({ ...authorityBody, ...mutation }, "authorityHash"), trustRoot, acceptedTrustRootHash: trustRoot.trustRootHash, expected, now }));
});
