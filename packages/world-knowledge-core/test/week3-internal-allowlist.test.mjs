import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_SOURCE_POLICY,
  REGISTRY_HASH,
  REGISTRY_VERSION,
  RESOLUTION_CONTRACT_VERSION,
  WORLD_INTERNAL_KNOWLEDGE_STATES,
  WORLD_KNOWLEDGE_PORT_VERSION,
  buildWorldKnowledgeSnapshot,
  canonicalJson,
  createClaim,
  createVerificationExecutionAuthority,
  createVerificationProcessContract,
  createVerificationRecord,
  createWorldDarkReader,
  createWorldInternalAllowlistEntry,
  createWorldInternalAllowlistReader,
  createWorldInternalAllowlistRelease,
  createWorldInternalReadRequest,
  createWorldPostDeployEvidence,
  hashBody,
  parseBuildWorldKnowledgeInput,
  parseWorldInternalAllowlistRelease,
  parseWorldInternalReadRequest,
  parseWorldPostDeployEvidence,
  resolveWorldKnowledge,
} from "../dist/index.js";

const MAIN = "b98b3870f60e9495c10f3c23f006fb9b3213d63e";
const TREE = "e59939dc43c51139dcaf0928b9725e8b98b0a1cc";
const ARTIFACT = "a".repeat(64);
const MIGRATIONS = "8a642e025701cb02a769fcdf7fda4390f955bad08478a2690ae512a6c197d066";
const SPOT = "synthetic-spot-philipps-casa";
const NOW = "2026-09-17T12:00:00.000Z";

function makeSnapshot() {
  const claim = createClaim({
    claimId: "claim:week3:laptop", attributeKey: "operation.laptop_policy", scope: { spotId: SPOT, area: "SPOT" },
    knowledgeState: "KNOWN_TRUE", value: true, actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION",
    sourceReferenceId: "source:synthetic-week3", provenanceSessionId: "session:synthetic-week3", verificationState: "VERIFIED",
    observedAt: "2026-09-17T10:00:00.000Z", validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null,
  });
  const process = createVerificationProcessContract({
    processId: "process:admin-confirmed", processVersion: "1.0", policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
    policyHash: ACCEPTED_SOURCE_POLICY.policyHash, attributeKeys: ["operation.laptop_policy"], allowedVerifierRoles: ["SERVER_CONFIRMED_ADMIN"],
    requiredAuthorityClass: "SERVER_BOUND_ADMIN_WRITE", requiredSourceTypes: ["ADMIN_OBSERVATION"],
    freshnessPolicyRef: "freshness:durable-until-contradicted", allowedResults: ["VERIFIED"], maxFutureClockSkewSeconds: 60,
  }, ACCEPTED_SOURCE_POLICY);
  const authority = createVerificationExecutionAuthority({
    authorityId: "authority:synthetic-week3-admin", processId: process.processId, processVersion: process.processVersion,
    processHash: process.processHash, verifierRole: "SERVER_CONFIRMED_ADMIN", authorityClass: "SERVER_BOUND_ADMIN_WRITE",
    validFrom: "2026-09-17T09:00:00.000Z", validUntil: "2026-09-17T13:00:00.000Z",
  }, process, ACCEPTED_SOURCE_POLICY);
  const verificationContext = { processes: [process], authorities: [authority], serverTime: "2026-09-17T10:01:00.000Z" };
  const verification = createVerificationRecord({
    recordId: "verification:week3:laptop", policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, policyHash: ACCEPTED_SOURCE_POLICY.policyHash,
    claimId: claim.claimId, claimHash: claim.contentHash, attributeKey: claim.attributeKey, spotId: SPOT,
    processId: process.processId, processVersion: process.processVersion, processHash: process.processHash,
    executionAuthorityId: authority.authorityId, executionAuthorityHash: authority.authorityHash, verifierRole: authority.verifierRole,
    sourceReferenceIds: ["source:synthetic-week3"], result: "VERIFIED", checkedAt: "2026-09-17T10:00:30.000Z",
    reverificationPolicyRef: "freshness:durable-until-contradicted", reasonCodes: ["SYNTHETIC_SERVER_CONFIRMATION"],
  }, claim, ACCEPTED_SOURCE_POLICY, verificationContext);
  const resolution = resolveWorldKnowledge({ contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: NOW, claims: [claim], sourcePolicy: ACCEPTED_SOURCE_POLICY, verificationRecords: [verification] }, [ACCEPTED_SOURCE_POLICY], verificationContext);
  return buildWorldKnowledgeSnapshot(parseBuildWorldKnowledgeInput({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId: SPOT, resolution }, [ACCEPTED_SOURCE_POLICY], verificationContext), [ACCEPTED_SOURCE_POLICY], verificationContext);
}

function fixture(overrides = {}) {
  const snapshot = makeSnapshot();
  const entry = createWorldInternalAllowlistEntry({
    entryId: "allowlist:week3:one", subjectPseudonym: "synthetic-internal:reader-one", purpose: "INTERNAL_WORLD_READ_REHEARSAL",
    environment: "PROD_LIKE_TEST", releaseVersion: "week3-release-1", spotId: SPOT,
    allowedAttributeKeys: ["operation.laptop_policy"], validFrom: "2026-09-17T00:00:00.000Z", validUntil: "2026-09-18T00:00:00.000Z", status: "ENABLED_TEST_ONLY",
    ...overrides.entry,
  });
  const release = createWorldInternalAllowlistRelease({
    releaseVersion: "week3-release-1", canonicalMainSha: MAIN, canonicalTreeSha: TREE, releaseArtifactHash: ARTIFACT,
    migrationBundleHash: MIGRATIONS, authorityStatus: "SYNTHETIC_TEST_AUTHORITY", expirationPolicy: "ENTRY_VALID_UNTIL",
    retentionPolicy: "NOT_CONFIGURED", entries: [entry], ...overrides.release,
  });
  const request = createWorldInternalReadRequest({
    requestId: "request:week3:one", releaseVersion: release.releaseVersion, releaseHash: release.releaseHash,
    entryId: entry.entryId, entryHash: entry.entryHash, subjectPseudonym: entry.subjectPseudonym,
    purpose: entry.purpose, environment: entry.environment, spotId: SPOT, requestedAttributeKeys: ["operation.laptop_policy"],
    ...overrides.request,
  });
  return { snapshot, entry, release, request };
}

function enabledDark(snapshot, counter) {
  return createWorldDarkReader({
    configuration: { WORLD_PRODUCT_READ: "true", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "PROD_LIKE_TEST" },
    loadSnapshot: async () => { counter.loads += 1; return snapshot; },
  });
}

test("default OFF rejects before any canonical reader load", async () => {
  const { snapshot, release, request } = fixture();
  const counter = { loads: 0 };
  const darkReader = createWorldDarkReader({
    loadSnapshot: async () => { counter.loads += 1; return snapshot; },
  });
  const reader = createWorldInternalAllowlistReader({ darkReader, acceptedRelease: release, now: () => NOW });
  await assert.rejects(() => reader.read(request), /world_internal_reader_off:PRODUCT_READ_DISABLED/);
  assert.equal(counter.loads, 0);
});

test("closed allowlist produces a minimal, pseudonymous and deterministic projection", async () => {
  const { snapshot, release, request } = fixture(); const counter = { loads: 0 };
  const reader = createWorldInternalAllowlistReader({ darkReader: enabledDark(snapshot, counter), acceptedRelease: release, now: () => NOW });
  const first = await reader.read(request); const second = await reader.read(request);
  assert.equal(counter.loads, 1); assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(first.knowledge.map(({ kind, key, value }) => ({ kind, key, value })), [{ kind: "OPERATIONAL_RULE", key: "operation.laptop_policy", value: true }]);
  assert.deepEqual(first.statePartitions.map((item) => item.state), WORLD_INTERNAL_KNOWLEDGE_STATES);
  assert.equal(JSON.stringify(first).includes(SPOT), false);
  for (const forbidden of ["publicContact", "claimReferences", "actor", "subscription", "payment", "email"]) assert.equal(JSON.stringify(first).includes(forbidden), false, forbidden);
});

test("all binding failures happen before the canonical reader is invoked", async () => {
  const base = fixture();
  for (const change of [
    { purpose: "WRONG" }, { environment: "LOCAL_TEST" }, { spotId: "synthetic-week3-other" },
    { requestedAttributeKeys: ["operation.price_level"] }, { releaseVersion: "other-release" }, { entryId: "allowlist:other" },
  ]) {
    const counter = { loads: 0 }; const reader = createWorldInternalAllowlistReader({ darkReader: enabledDark(base.snapshot, counter), acceptedRelease: base.release, now: () => NOW });
    const forged = { ...base.request, ...change };
    forged.requestHash = hashBody(Object.fromEntries(Object.entries(forged).filter(([key]) => key !== "requestHash")), []);
    await assert.rejects(() => reader.read(forged)); assert.equal(counter.loads, 0, JSON.stringify(change));
  }
});

test("strict parsers reject unknown, incomplete, duplicated, unconfigured and rehashed tampering", () => {
  const { entry, release, request } = fixture();
  assert.throws(() => parseWorldInternalReadRequest({ ...request, surprise: true }), /unknown field/);
  assert.throws(() => parseWorldInternalReadRequest({ ...request, entryHash: "0".repeat(64) }), /request hash mismatch/);
  const duplicateBody = { ...release, releaseHash: undefined, entries: [entry, entry] };
  duplicateBody.releaseHash = hashBody(Object.fromEntries(Object.entries(duplicateBody).filter(([key]) => key !== "releaseHash")), []);
  assert.throws(() => parseWorldInternalAllowlistRelease(duplicateBody), /sorted|duplicate/);
  assert.throws(() => createWorldInternalAllowlistRelease({ releaseVersion: entry.releaseVersion, canonicalMainSha: MAIN, canonicalTreeSha: TREE, releaseArtifactHash: ARTIFACT, migrationBundleHash: MIGRATIONS, authorityStatus: "NOT_CONFIGURED", expirationPolicy: "ENTRY_VALID_UNTIL", retentionPolicy: "NOT_CONFIGURED", entries: [entry] }), /unconfigured authority/);
  assert.throws(() => createWorldInternalAllowlistEntry({ entryId: "allowlist:real", subjectPseudonym: "person@example.com", purpose: "INTERNAL_WORLD_READ_REHEARSAL", environment: "LOCAL_TEST", releaseVersion: "r", spotId: SPOT, allowedAttributeKeys: ["operation.laptop_policy"], validFrom: NOW, validUntil: null, status: "ENABLED_TEST_ONLY" }), /invalid format/);
  assert.throws(() => createWorldInternalAllowlistEntry({ entryId: "allowlist:contact", subjectPseudonym: "synthetic-internal:contact-test", purpose: "INTERNAL_WORLD_READ_REHEARSAL", environment: "LOCAL_TEST", releaseVersion: "r", spotId: SPOT, allowedAttributeKeys: ["contact.public_email"], validFrom: NOW, validUntil: null, status: "ENABLED_TEST_ONLY" }), /outside the minimized/);
});

test("expiry and NOT_CONFIGURED fail closed with zero loads", async () => {
  const expired = fixture(); const expiredCounter = { loads: 0 };
  const expiredReader = createWorldInternalAllowlistReader({ darkReader: enabledDark(expired.snapshot, expiredCounter), acceptedRelease: expired.release, now: () => "2026-09-18T00:00:00.000Z" });
  await assert.rejects(() => expiredReader.read(expired.request), /entry_inactive/); assert.equal(expiredCounter.loads, 0);
  const empty = createWorldInternalAllowlistRelease({ releaseVersion: "week3-empty", canonicalMainSha: MAIN, canonicalTreeSha: TREE, releaseArtifactHash: ARTIFACT, migrationBundleHash: MIGRATIONS, authorityStatus: "NOT_CONFIGURED", expirationPolicy: "NOT_CONFIGURED", retentionPolicy: "NOT_CONFIGURED", entries: [] });
  const emptyCounter = { loads: 0 }; const emptyReader = createWorldInternalAllowlistReader({ darkReader: enabledDark(expired.snapshot, emptyCounter), acceptedRelease: empty, now: () => NOW });
  await assert.rejects(() => emptyReader.read(expired.request), /release_mismatch/); assert.equal(emptyCounter.loads, 0);
});

test("same request id cannot change semantics and emergency OFF is permanent for the instance", async () => {
  const { snapshot, release, request } = fixture(); const counter = { loads: 0 };
  const reader = createWorldInternalAllowlistReader({ darkReader: enabledDark(snapshot, counter), acceptedRelease: release, now: () => NOW });
  await reader.read(request);
  const changed = createWorldInternalReadRequest({ ...Object.fromEntries(Object.entries(request).filter(([key]) => key !== "contractVersion" && key !== "requestHash")), requestedAttributeKeys: ["operation.laptop_policy"] });
  const forgedChanged = { ...changed, spotId: "synthetic-week3-other" };
  forgedChanged.requestHash = hashBody(Object.fromEntries(Object.entries(forgedChanged).filter(([key]) => key !== "requestHash")), []);
  await assert.rejects(() => reader.read(forgedChanged), /idempotency_conflict/); assert.equal(counter.loads, 1);
  reader.engageEmergencyOff(); assert.equal(reader.emergencyOff, true);
  await assert.rejects(() => reader.read(request), /emergency_off/); assert.equal(counter.loads, 1);
});

test("post-deploy evidence is immutable, hash-bound and never authorizes execution", () => {
  const { release } = fixture();
  const evidence = createWorldPostDeployEvidence({ mainSha: MAIN, treeSha: TREE, releaseArtifactHash: ARTIFACT, migrationBundleHash: MIGRATIONS, allowlistHash: release.releaseHash });
  assert.equal(evidence.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"); assert.equal(evidence.executionAuthorized, false);
  assert.deepEqual(parseWorldPostDeployEvidence(evidence), evidence);
  const forged = { ...evidence, status: "EXECUTED", evidenceHash: undefined };
  forged.evidenceHash = hashBody(Object.fromEntries(Object.entries(forged).filter(([key]) => key !== "evidenceHash")), []);
  assert.throws(() => parseWorldPostDeployEvidence(forged), /expected one of/);
});
