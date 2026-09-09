import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUserConceptCompatible, bindClientObservation, CanonicalUserEventSchema, ContractValidationError,
  contentHash,
  GRANTED_CONSENT, parseCanonicalUserEvent, parseEvidenceChain, parseUserIntelligenceManifest,
  parseUserIntelligenceSnapshot, SYNTHETIC_CONCEPT_IDS, SYNTHETIC_CONCEPT_REGISTRY_VERSION,
  parseConsentEnvelope, parseLifecycleCommand, parseUserEventAuthority,
  SYNTHETIC_EVENTS, SYNTHETIC_MANIFEST, COLD_SNAPSHOT, CONTRADICTORY_EVIDENCE_CHAIN,
} from "../dist/index.js";

test("valid synthetic contracts are accepted with bound identities and hashes", () => {
  assert.equal(parseCanonicalUserEvent(SYNTHETIC_EVENTS.visit, "synthetic-user-a").eventType, "VERIFIED_VISIT");
  assert.equal(parseEvidenceChain(CONTRADICTORY_EVIDENCE_CHAIN, "synthetic-user-a").conflicts.length, 2);
  assert.equal(parseUserIntelligenceManifest(SYNTHETIC_MANIFEST).manifestId, "synthetic-manifest-1");
  assert.equal(parseUserIntelligenceSnapshot(COLD_SNAPSHOT, "synthetic-user-a").tasteNodes.length, 0);
});

test("authority, consent and lifecycle commands enforce semantic consistency", () => {
  assert.throws(() => parseUserEventAuthority({ ...SYNTHETIC_EVENTS.open.authority, kind: "AUTHENTICATED_USER_ACTION" }), /inconsistent/);
  assert.throws(() => parseConsentEnvelope({ ...GRANTED_CONSENT, state: "WITHDRAWN", allowedProcessing: ["EXPORT"], lifecycleEffect: "ALLOW" }), /must purge/);
  const command = {
    contractVersion: "backyrd.user-intelligence.lifecycle-command@1.0", commandId: "command-1", action: "ACCOUNT_ERASURE", userId: "synthetic-user-a",
    authority: { contractVersion: "backyrd.user-intelligence.user-event-authority@1.0", kind: "ADMINISTRATIVE_LIFECYCLE_ACTION", boundUserId: "synthetic-user-a", binding: "SERVER_BOUND", assertedBy: "lifecycle-service", sourceTrust: "PRIVILEGED_LIFECYCLE" },
    idempotencyKey: "command-key-1", scope: { domains: [], eventIds: [], allPersonalization: true }, targetStores: ["canonical_memory_events", "snapshots", "projections"],
    expectedEffect: "PURGE_AND_INVALIDATE", completion: "PENDING", failureCode: null, auditId: "audit-1", requestedAt: "2026-01-15T12:00:00.000Z",
  };
  assert.equal(parseLifecycleCommand(command, "synthetic-user-a").action, "ACCOUNT_ERASURE");
  assert.throws(() => parseLifecycleCommand({ ...command, targetStores: ["unknown_store"] }), /expected one of/);
  assert.throws(() => parseLifecycleCommand({ ...command, userId: "synthetic-user-b" }), /identity mismatch/);
});

test("no-consent evidence chains cannot retain personalization evidence", () => {
  const emptySegments = Object.fromEntries(Object.entries(CONTRADICTORY_EVIDENCE_CHAIN.segments).map(([key, value]) => [key, key === "tasteAttribution" ? [] : { ...value, references: [], state: "UNKNOWN" }]));
  const noConsentBody = { ...CONTRADICTORY_EVIDENCE_CHAIN, processingAuthorization: { consentState: "UNKNOWN", consentVersion: "synthetic-consent-v1", personalizationEvidenceAllowed: false }, segments: emptySegments, conflicts: [] };
  delete noConsentBody.chainHash;
  const valid = { ...noConsentBody, chainHash: contentHash(noConsentBody) };
  assert.equal(parseEvidenceChain(valid).segments.tasteAttribution.length, 0);
  const forbiddenBody = { ...noConsentBody, segments: CONTRADICTORY_EVIDENCE_CHAIN.segments };
  const forbidden = { ...forbiddenBody, chainHash: contentHash(forbiddenBody) };
  assert.throws(() => parseEvidenceChain(forbidden), /no-consent chain/);
});

test("missing fields, unknown versions, extra authority fields and bad hashes fail closed", () => {
  const missing = structuredClone(SYNTHETIC_EVENTS.open); delete missing.journeyId;
  assert.throws(() => CanonicalUserEventSchema.parse(missing), ContractValidationError);
  assert.throws(() => CanonicalUserEventSchema.parse({ ...SYNTHETIC_EVENTS.open, contractVersion: "backyrd.user-intelligence.canonical-user-event@2.0" }), ContractValidationError);
  assert.throws(() => CanonicalUserEventSchema.parse({ ...SYNTHETIC_EVENTS.open, authority: { ...SYNTHETIC_EVENTS.open.authority, ownerTier: "paid" } }), ContractValidationError);
  assert.throws(() => parseCanonicalUserEvent({ ...SYNTHETIC_EVENTS.open, eventHash: "f".repeat(64) }), /hash mismatch/);
});

test("client input cannot bind identity or declare a verified outcome", () => {
  const server = { authenticatedUserId: "synthetic-user-a", authenticatedActorId: "actor-a", producer: "test-endpoint", sourceRecordId: "source-1", eventId: "bound-event-1", ingestedAt: "2026-01-15T12:00:00.000Z", consent: GRANTED_CONSENT, retentionClass: "synthetic-tbd", idempotencyKey: "bound-key-1" };
  const base = { clientEventId: "client-1", eventType: "SPOT_OPENED", occurredAt: "2026-01-15T12:00:00.000Z", observedAt: "2026-01-15T12:00:00.000Z", journeyId: "journey-1", references: { spotId: "spot-1" } };
  assert.equal(bindClientObservation(base, server).userId, "synthetic-user-a");
  assert.throws(() => bindClientObservation({ ...base, userId: "synthetic-user-b" }, server), /unknown field/);
  assert.throws(() => bindClientObservation({ ...base, eventType: "VERIFIED_VISIT" }, server), /expected one of/);
  assert.throws(() => parseCanonicalUserEvent(SYNTHETIC_EVENTS.open, "synthetic-user-b"), /identity is not bound/);
});

test("opaque concepts require exact registry and known identifiers", () => {
  const ref = { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" };
  assert.equal(assertUserConceptCompatible(ref, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_CONCEPT_IDS).conceptId, "vibe.quiet");
  assert.throws(() => assertUserConceptCompatible({ ...ref, registryVersion: "unknown@2.0" }, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_CONCEPT_IDS), /incompatible registry/);
  assert.throws(() => assertUserConceptCompatible({ ...ref, conceptId: "Vibe.Quiet" }, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_CONCEPT_IDS), /unknown concept/);
});
