import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelevantUserProjection, COLD_SNAPSHOT, GRANTED_CONSENT, NO_CONSENT, planLifecycleImpact,
  RelevantUserProjectionSchema, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_MANIFEST,
  SYNTHETIC_NOW, SYNTHETIC_PROJECTION_REQUEST, USER_INTELLIGENCE_LIFECYCLE_MANIFEST,
  validateLifecycleManifest,
} from "../dist/index.js";

const base = { request: SYNTHETIC_PROJECTION_REQUEST, consent: GRANTED_CONSENT, manifest: SYNTHETIC_MANIFEST, snapshot: COLD_SNAPSHOT, identity: { projectionId: "projection-1" }, clock: { now: SYNTHETIC_NOW } };
const coldContent = { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } };
const activeContent = { ...coldContent, knowledgeLevel: "PARTIAL", taste: [{ concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" }, scope: { kind: "PLACE_TYPE", reference: "cafe" }, affinity: 0.4, confidence: 0.5, reason: { code: "PLACE_TYPE_MATCH", subjectRef: "taste-node-1", policyRef: "synthetic-projection-policy-v0" } }] };

test("cold and no-consent projections are empty, explained and authority-free", () => {
  const cold = buildRelevantUserProjection({ ...base, content: coldContent });
  const denied = buildRelevantUserProjection({ ...base, consent: NO_CONSENT, content: activeContent, identity: { projectionId: "projection-2" } });
  assert.equal(cold.status, "NEUTRAL"); assert.equal(cold.neutralReason, "COLD_START");
  assert.equal(denied.status, "NEUTRAL"); assert.equal(denied.neutralReason, "NO_CONSENT");
  for (const projection of [cold, denied]) {
    assert.equal(projection.taste.length, 0);
    assert.deepEqual(projection.boundaries, { rawEventsIncluded: false, reviewTextIncluded: false, rawLocationIncluded: false, privateSocialDataIncluded: false, eligibilityAuthority: false, rankingAuthority: false });
  }
});

test("active projection honors hard item and byte budgets", () => {
  const active = buildRelevantUserProjection({ ...base, content: activeContent, identity: { projectionId: "projection-active" } });
  assert.equal(active.status, "ACTIVE"); assert.equal(active.budgets.actualItems, 1);
  assert.ok(active.budgets.canonicalPayloadBytes <= active.budgets.maxBytes);
  const itemLimited = buildRelevantUserProjection({ ...base, request: { ...SYNTHETIC_PROJECTION_REQUEST, budgets: { maxItems: 0, maxBytes: 4096 } }, content: activeContent, identity: { projectionId: "projection-item-limited" } });
  assert.equal(itemLimited.neutralReason, "ITEM_BUDGET"); assert.equal(itemLimited.taste.length, 0);
  const byteLimited = buildRelevantUserProjection({ ...base, request: { ...SYNTHETIC_PROJECTION_REQUEST, budgets: { maxItems: 8, maxBytes: 1000 } }, content: activeContent, identity: { projectionId: "projection-byte-limited" } });
  assert.equal(byteLimited.neutralReason, "BYTE_BUDGET");
});

test("projection strict schema rejects raw, ranking and commercial fields", () => {
  const active = buildRelevantUserProjection({ ...base, content: activeContent, identity: { projectionId: "projection-strict" } });
  assert.throws(() => RelevantUserProjectionSchema.parse({ ...active, rawEvents: [] }), /unknown field/);
  assert.throws(() => RelevantUserProjectionSchema.parse({ ...active, finalRankingScore: 1 }), /unknown field/);
  assert.throws(() => RelevantUserProjectionSchema.parse({ ...active, ownerTier: "premium" }), /unknown field/);
  assert.throws(() => RelevantUserProjectionSchema.parse({ ...active, reviewText: "private" }), /unknown field/);
});

test("lifecycle manifest is complete and erasure invalidates or deletes every personal store", () => {
  assert.equal(validateLifecycleManifest().stores.length, 13);
  const incomplete = { ...USER_INTELLIGENCE_LIFECYCLE_MANIFEST, stores: USER_INTELLIGENCE_LIFECYCLE_MANIFEST.stores.filter((row) => row.store !== "snapshots") };
  assert.throws(() => validateLifecycleManifest(incomplete), /missing lifecycle policy for snapshots/);
  const erasure = planLifecycleImpact("ACCOUNT_ERASURE");
  assert.equal(erasure.filter((row) => !["DELETE", "INVALIDATE", "RETAIN_NON_PERSONAL"].includes(row.effect)).length, 0);
  assert.equal(erasure.find((row) => row.store === "technical_audit_manifests").effect, "RETAIN_NON_PERSONAL");
  assert.equal(erasure.find((row) => row.store === "projections").effect, "INVALIDATE");
  assert.equal(planLifecycleImpact("RETENTION_EXPIRY").find((row) => row.store === "canonical_memory_events").effect, "DELETE");
});

test("commercial spot state has no input channel and cannot change a projection", () => {
  const first = buildRelevantUserProjection({ ...base, content: activeContent, identity: { projectionId: "projection-commercial-neutrality" }, commercialSpotState: { ownerTier: "free", advertising: false } });
  const second = buildRelevantUserProjection({ ...base, content: activeContent, identity: { projectionId: "projection-commercial-neutrality" }, commercialSpotState: { ownerTier: "paid", advertising: true } });
  assert.equal(first.projectionHash, second.projectionHash);
});

test("snapshot and projection cannot cross user authority", () => {
  assert.throws(() => buildRelevantUserProjection({ ...base, request: { ...SYNTHETIC_PROJECTION_REQUEST, actor: { ...SYNTHETIC_PROJECTION_REQUEST.actor, userId: "synthetic-user-b" } }, content: activeContent }), /cross_user/);
});
