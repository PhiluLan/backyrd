import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_ENTITLEMENT_POLICY,
  ACCEPTED_SOURCE_POLICY,
  AUTHORING_CATALOG_HASH,
  AUTHORING_FIELDS,
  AUTHORING_STEPS,
  FOUNDER_EVALUATION_SCOPE,
  OWNER_BASIC_KEYS,
  OWNER_PRO_ONLY_KEYS,
  PRIMARY_CATEGORIES,
  REGISTRY_HASH,
  REGISTRY_VERSION,
  WORLD_KNOWLEDGE_PORT_VERSION,
  buildWorldKnowledgeSnapshot,
  createFounderWorldKnowledgeReader,
  createFounderWorldCohortManifest,
  parseBuildWorldKnowledgeInput,
  resolveWorldKnowledge,
  resolutionRequest,
} from "../dist/index.js";

test("guided German catalog covers canonical fields without creating false tasks", () => {
  assert.equal(AUTHORING_STEPS.length, 9);
  assert.match(AUTHORING_CATALOG_HASH, /^[0-9a-f]{64}$/);
  assert.equal(AUTHORING_FIELDS.every((field) => field.optional), true);
  assert.equal(new Set(AUTHORING_FIELDS.map((field) => field.attributeKey)).size, AUTHORING_FIELDS.length);
  assert.equal(AUTHORING_FIELDS.some((field) => field.attributeKey === "operation.price_range"), false);
  assert.equal(AUTHORING_FIELDS.some((field) => field.attributeKey === "research.subjective_fits"), false);
  assert.equal(AUTHORING_FIELDS.find((field) => field.attributeKey === "classification.primary_category")?.allowedValues.length, PRIMARY_CATEGORIES.length);
});

test("Founder reader is isolated, fail-closed and returns only a validated canonical snapshot", async () => {
  const request = { ...resolutionRequest([]), sourcePolicy: ACCEPTED_SOURCE_POLICY };
  const resolution = resolveWorldKnowledge(request, [ACCEPTED_SOURCE_POLICY]);
  const snapshotInput = parseBuildWorldKnowledgeInput({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId: "synthetic-spot-founder-reader", resolution }, [ACCEPTED_SOURCE_POLICY]);
  const snapshot = buildWorldKnowledgeSnapshot(snapshotInput, [ACCEPTED_SOURCE_POLICY]);
  let observed;
  const reader = createFounderWorldKnowledgeReader(async (input) => { observed = input; return snapshot; });
  const result = await reader.readSnapshot({ spotId: snapshot.spot.spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH });
  assert.equal(result.snapshotHash, snapshot.snapshotHash);
  assert.equal(observed.scope, FOUNDER_EVALUATION_SCOPE);
  await assert.rejects(() => reader.readSnapshot({ spotId: "spot:wrong", contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH }), /spot_identity_mismatch/);
  await assert.rejects(() => reader.readSnapshot({ spotId: snapshot.spot.spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: "0".repeat(64) }), /contract_identity_mismatch/);
});

test("Basic, Pro and Admin presentation exactly reflect accepted entitlement keys", () => {
  const byKey = new Map(AUTHORING_FIELDS.map((field) => [field.attributeKey, field]));
  for (const key of OWNER_BASIC_KEYS) {
    if (!byKey.has(key) || key === "operation.price_range") continue;
    assert.ok(byKey.get(key).roles.includes("OWNER_BASIC"), key);
  }
  for (const key of OWNER_PRO_ONLY_KEYS) {
    if (!byKey.has(key)) continue;
    assert.equal(byKey.get(key).roles.includes("OWNER_BASIC"), false, key);
    assert.ok(byKey.get(key).roles.includes("OWNER_PRO"), key);
    assert.ok(byKey.get(key).roles.includes("ADMIN"), key);
  }
  assert.equal(ACCEPTED_ENTITLEMENT_POLICY.commercialInfluence, "AUTHORING_SCOPE_ONLY");
});

test("cohort manifest refuses empty, oversized and duplicate cohorts", () => {
  assert.throws(() => createFounderWorldCohortManifest({ cohortId: "founder:empty", frozenAt: "2026-09-11T12:00:00.000Z", exports: [] }), /1_to_40/);
  const fake = { spotId: "spot:a", manifestHash: "a".repeat(64), registryVersion: "backyrd.world-knowledge.registry@1.1", policyVersion: "backyrd.world-knowledge.source-policy@3b.1", policyHash: "x", snapshot: { snapshotHash: "b".repeat(64) } };
  assert.throws(() => createFounderWorldCohortManifest({ cohortId: "founder:duplicate", frozenAt: "2026-09-11T12:00:00.000Z", exports: [fake, fake] }), /duplicate_spot/);
  assert.equal(FOUNDER_EVALUATION_SCOPE, "FOUNDER_EVALUATION_ONLY");
});
