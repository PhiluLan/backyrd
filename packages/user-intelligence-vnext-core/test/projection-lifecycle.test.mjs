import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelevantUserProjection, COLD_SNAPSHOT, GRANTED_CONSENT, NO_CONSENT, planLifecycleImpact,
  canonicalBytes, contentHash, parseRelevantUserProjection, projectionHashBody,
  RelevantUserProjectionSchema, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_MANIFEST,
  SYNTHETIC_NOW, SYNTHETIC_PROJECTION_REQUEST, USER_INTELLIGENCE_LIFECYCLE_MANIFEST,
  validateLifecycleManifest, parseLifecycleCommand, REQUIRED_LIFECYCLE_STORES,
} from "../dist/index.js";

const manifestRef = { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash };
const base = { request: SYNTHETIC_PROJECTION_REQUEST, consent: GRANTED_CONSENT, manifest: manifestRef, snapshot: COLD_SNAPSHOT, identity: { projectionId: "projection-1" }, clock: { now: SYNTHETIC_NOW } };
const coldContent = { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } };
const activeContent = { ...coldContent, knowledgeLevel: "PARTIAL", taste: [{ concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" }, scope: { kind: "PLACE_TYPE", reference: "cafe" }, affinity: 0.4, confidence: 0.5, reason: { code: "PLACE_TYPE_MATCH", subjectRef: "taste-node-1", policyRef: "synthetic-projection-policy-v0" } }] };

test("cold and no-consent projections are empty, explained and authority-free", () => {
  const cold = buildRelevantUserProjection({ ...base, content: coldContent });
  const denied = buildRelevantUserProjection({ ...base, consent: NO_CONSENT, content: activeContent, identity: { projectionId: "projection-2" } });
  const deniedWithZeroItems = buildRelevantUserProjection({ ...base, consent: NO_CONSENT, request: { ...SYNTHETIC_PROJECTION_REQUEST, budgets: { maxItems: 0, maxBytes: 4096 } }, content: activeContent, identity: { projectionId: "projection-3" } });
  assert.equal(cold.status, "NEUTRAL"); assert.equal(cold.neutralReason, "COLD_START");
  assert.equal(denied.status, "NEUTRAL"); assert.equal(denied.neutralReason, "NO_CONSENT");
  assert.equal(deniedWithZeroItems.neutralReason, "NO_CONSENT");
  for (const projection of [cold, denied]) {
    assert.equal(projection.taste.length, 0);
    assert.deepEqual(projection.boundaries, { rawEventsIncluded: false, reviewTextIncluded: false, rawLocationIncluded: false, privateSocialDataIncluded: false, eligibilityAuthority: false, rankingAuthority: false });
  }
  assert.equal(denied.snapshot, null);
  assert.equal("userId" in denied, false);
  assert.deepEqual(denied.domainSufficiency, []);
  assert.deepEqual(denied.suppression, { total: 0, byReason: [] });
  const leakedWithoutHash = { ...denied, snapshot: { snapshotId: COLD_SNAPSHOT.snapshotId, snapshotHash: COLD_SNAPSHOT.snapshotHash } };
  delete leakedWithoutHash.projectionHash;
  const leakedMeasured = { ...leakedWithoutHash, budgets: { ...leakedWithoutHash.budgets, canonicalPayloadBytes: canonicalBytes(projectionHashBody(leakedWithoutHash)) } };
  assert.throws(() => parseRelevantUserProjection({ ...leakedMeasured, projectionHash: contentHash(projectionHashBody(leakedMeasured)) }), /privacy-neutral/);
});

test("withdrawn, missing-snapshot and kill-switch projections have no personal snapshot reference", () => {
  const withdrawn = { ...NO_CONSENT, state: "WITHDRAWN", lifecycleEffect: "PURGE_PERSONALIZATION" };
  const denied = { ...NO_CONSENT, state: "DENIED", lifecycleEffect: "PURGE_PERSONALIZATION" };
  const cases = [
    buildRelevantUserProjection({ ...base, consent: withdrawn, content: activeContent, identity: { projectionId: "projection-withdrawn" } }),
    buildRelevantUserProjection({ ...base, consent: denied, content: activeContent, identity: { projectionId: "projection-denied" } }),
    buildRelevantUserProjection({ ...base, snapshot: null, content: activeContent, identity: { projectionId: "projection-missing" } }),
    buildRelevantUserProjection({ ...base, request: { ...SYNTHETIC_PROJECTION_REQUEST, killSwitch: true }, content: activeContent, identity: { projectionId: "projection-kill" } }),
  ];
  for (const projection of cases) {
    assert.equal(projection.snapshot, null);
    assert.equal(projection.taste.length + projection.practical.length + projection.directSpot.length + projection.domainSufficiency.length, 0);
    assert.deepEqual(projection.suppression, { total: 0, byReason: [] });
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
  assert.throws(() => buildRelevantUserProjection({ ...base, consent: NO_CONSENT, content: activeContent, ownerTier: "premium" }), /unknown field/);
});

test("lifecycle manifest and completed account erasure require deletion of every personal store", () => {
  assert.equal(validateLifecycleManifest().stores.length, 13);
  const incomplete = { ...USER_INTELLIGENCE_LIFECYCLE_MANIFEST, stores: USER_INTELLIGENCE_LIFECYCLE_MANIFEST.stores.filter((row) => row.store !== "snapshots") };
  assert.throws(() => validateLifecycleManifest(incomplete), /missing lifecycle policy for snapshots/);
  const erasure = planLifecycleImpact("ACCOUNT_ERASURE");
  assert.equal(erasure.filter((row) => row.store !== "technical_audit_manifests" && row.effect !== "DELETE").length, 0);
  assert.equal(erasure.find((row) => row.store === "technical_audit_manifests").effect, "RETAIN_NON_PERSONAL");
  assert.equal(erasure.find((row) => row.store === "projections").effect, "DELETE");
  assert.equal(planLifecycleImpact("RETENTION_EXPIRY").find((row) => row.store === "canonical_memory_events").effect, "DELETE");
});

test("account erasure cannot report completed while a personal store is only invalidated", () => {
  const personal = REQUIRED_LIFECYCLE_STORES.filter((store) => store !== "technical_audit_manifests");
  const command = {
    contractVersion: "backyrd.user-intelligence.lifecycle-command@1.0", commandId: "erasure-1", action: "ACCOUNT_ERASURE", userId: "synthetic-user-a",
    authority: { contractVersion: "backyrd.user-intelligence.user-event-authority@1.0", kind: "ADMINISTRATIVE_LIFECYCLE_ACTION", boundUserId: "synthetic-user-a", binding: "SERVER_BOUND", assertedBy: "lifecycle-service", sourceTrust: "PRIVILEGED_LIFECYCLE" },
    idempotencyKey: "erasure-key", scope: { domains: [], eventIds: [], allPersonalization: true }, targetStores: personal,
    expectedEffect: "PURGE_AND_DELETE", completion: "COMPLETED", failureCode: null,
    storeResults: personal.map((store) => ({ store, effect: "DELETED", completion: "COMPLETED" })), auditId: "audit-erasure", requestedAt: SYNTHETIC_NOW,
  };
  assert.equal(parseLifecycleCommand(command).completion, "COMPLETED");
  assert.throws(() => parseLifecycleCommand({ ...command, storeResults: command.storeResults.map((row) => row.store === "projections" ? { ...row, effect: "INVALIDATED" } : row) }), /prove deletion of projections/);
});

test("validated projection boundary rejects commercial status fields", () => {
  for (const field of ["ownerTier", "payment", "advertising", "sponsorship", "commercialSpotState"]) {
    assert.throws(() => buildRelevantUserProjection({ ...base, content: activeContent, identity: { projectionId: `projection-${field}` }, [field]: true }), /unknown field/);
  }
  assert.doesNotThrow(() => buildRelevantUserProjection({ ...base, content: activeContent, identity: { projectionId: "projection-real-user-experience" } }));
});

test("snapshot and projection cannot cross user authority", () => {
  assert.throws(() => buildRelevantUserProjection({ ...base, request: { ...SYNTHETIC_PROJECTION_REQUEST, actor: { ...SYNTHETIC_PROJECTION_REQUEST.actor, userId: "synthetic-user-b" } }, content: activeContent }), /cross_user/);
});
