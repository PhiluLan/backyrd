import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUserConceptCompatible, bindClientObservation, bindVerifiedProductState, CanonicalUserEventSchema, ContractValidationError,
  contentHash,
  GRANTED_CONSENT, parseCanonicalUserEvent, parseEvidenceChain, parseUserIntelligenceManifest,
  parseUserIntelligenceSnapshot, SYNTHETIC_CONCEPT_IDS, SYNTHETIC_CONCEPT_REGISTRY_VERSION,
  parseConsentEnvelope, parseLifecycleCommand, parseUserEventAuthority,
  SYNTHETIC_EVENTS, SYNTHETIC_MANIFEST, COLD_SNAPSHOT, CONTRADICTORY_EVIDENCE_CHAIN,
  REQUIRED_LIFECYCLE_STORES, validateTemporalIntegrity, withEventHash,
} from "../dist/index.js";

const temporalPolicy = { contractVersion: "backyrd.user-intelligence.temporal-policy@1.0", policyVersion: "synthetic-temporal-policy-v1", maxFutureSkewMs: 1_000, delayedEventPolicy: "ALLOW_WITHIN_BOUND", maxDelayMs: 86_400_000, observationOrderExceptionEventTypes: [] };
const serverBinding = (overrides = {}) => ({
  authenticatedUserId: "synthetic-user-a", authenticatedActorId: "actor-a", producer: "test-endpoint", sourceRecordId: "source-1", eventId: "bound-event-1",
  consent: GRANTED_CONSENT, retentionClass: "synthetic-tbd", idempotencyKey: "bound-key-1",
  references: { spotId: "spot-1" }, journey: { resolution: "SERVER_RESOLVED", journeyId: "server-journey-1", resolutionPolicyVersion: "journey-policy-v1", independenceEligible: true },
  referencePolicyVersion: "reference-policy-v1",
  referenceBinding: { authority: "SERVER_PRODUCT_TRUTH", boundUserId: "synthetic-user-a", resolutionRecordHash: "0".repeat(64) },
  temporal: { occurredAt: "2026-01-15T12:00:00.000Z", observedAt: "2026-01-15T12:00:00.000Z", ingestedAt: "2026-01-15T12:00:00.000Z", serverNow: "2026-01-15T12:00:00.000Z", timeAuthority: "SERVER_CLOCK", policy: temporalPolicy },
  ...overrides,
});

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
    idempotencyKey: "command-key-1", scope: { domains: [], eventIds: [], allPersonalization: true }, targetStores: REQUIRED_LIFECYCLE_STORES.filter((store) => store !== "technical_audit_manifests"),
    expectedEffect: "PURGE_AND_DELETE", completion: "PENDING", failureCode: null, storeResults: [], auditId: "audit-1", requestedAt: "2026-01-15T12:00:00.000Z",
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
  const missing = structuredClone(SYNTHETIC_EVENTS.open); delete missing.journey;
  assert.throws(() => CanonicalUserEventSchema.parse(missing), ContractValidationError);
  assert.throws(() => CanonicalUserEventSchema.parse({ ...SYNTHETIC_EVENTS.open, contractVersion: "backyrd.user-intelligence.canonical-user-event@2.0" }), ContractValidationError);
  assert.throws(() => CanonicalUserEventSchema.parse({ ...SYNTHETIC_EVENTS.open, authority: { ...SYNTHETIC_EVENTS.open.authority, ownerTier: "paid" } }), ContractValidationError);
  assert.throws(() => parseCanonicalUserEvent({ ...SYNTHETIC_EVENTS.open, eventHash: "f".repeat(64) }), /hash mismatch/);
});

test("client input cannot bind identity or declare a verified outcome", () => {
  const server = serverBinding();
  const base = { clientEventId: "client-1", eventType: "SPOT_OPENED", clientOccurredAt: "2026-01-15T12:00:00.000Z", observedTarget: { spotId: "spot-1" } };
  assert.equal(bindClientObservation(base, server).userId, "synthetic-user-a");
  assert.equal(bindClientObservation({ ...base, eventType: "NAVIGATION_INTENT" }, server).source.provenance, "USER_DECLARED");
  assert.throws(() => bindClientObservation({ ...base, userId: "synthetic-user-b" }, server), /unknown field/);
  assert.throws(() => bindClientObservation({ ...base, eventType: "VERIFIED_VISIT" }, server), /expected one of/);
  assert.throws(() => parseCanonicalUserEvent(SYNTHETIC_EVENTS.open, "synthetic-user-b"), /identity is not bound/);
});

test("server authority binds journey and product references fail closed", () => {
  const base = { clientEventId: "client-1", eventType: "SPOT_OPENED", clientOccurredAt: "2026-01-15T12:00:00.000Z", observedTarget: { spotId: "spot-1" } };
  const bound = bindClientObservation(base, serverBinding());
  assert.equal(bound.journey.journeyId, "server-journey-1");
  for (const journeyId of ["forged-journey-a", "forged-journey-b"]) assert.throws(() => bindClientObservation({ ...base, journeyId }, serverBinding()), /unknown field/);
  assert.throws(() => bindClientObservation({ ...base, observedTarget: { spotId: "foreign-spot" } }, serverBinding()), /does not match/);
  assert.throws(() => bindClientObservation({ ...base, eventType: "CANDIDATE_EXPOSED", observedTarget: { spotId: "spot-1", decisionId: "foreign-decision", candidateId: "candidate-1" } }, serverBinding({ references: { spotId: "spot-1", decisionId: "decision-1", candidateId: "candidate-1" } })), /does not match/);
  const first = bindClientObservation({ ...base, localCorrelationId: "local-a" }, serverBinding({ eventId: "bound-a", idempotencyKey: "key-a" }));
  const second = bindClientObservation({ ...base, localCorrelationId: "local-b" }, serverBinding({ eventId: "bound-b", idempotencyKey: "key-b" }));
  assert.deepEqual(first.journey, second.journey);
  assert.equal(first.journey.independenceEligible, true);
  assert.throws(() => bindClientObservation(base, serverBinding({ references: {}, journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: "journey-policy-v1", independenceEligible: false } })), /spotId|server-resolved journey/);
  assert.throws(() => bindClientObservation(base, serverBinding({ referenceBinding: { authority: "SERVER_PRODUCT_TRUTH", boundUserId: "synthetic-user-b", resolutionRecordHash: "0".repeat(64) } })), /another user/);
  assert.notEqual(bound.eventHash, bindClientObservation({ ...base, observedTarget: { spotId: "spot-2" } }, serverBinding({ references: { spotId: "spot-2" } })).eventHash);
});

test("product-state assertions require the verified adapter and authoritative record", () => {
  const client = { clientEventId: "client-1", eventType: "SAVED", clientOccurredAt: "2026-01-15T12:00:00.000Z", observedTarget: { spotId: "spot-1" } };
  assert.throws(() => bindClientObservation(client, serverBinding()), /expected one of/);
  assert.throws(() => bindClientObservation({ ...client, eventType: "RESERVATION_INTENT" }, serverBinding()), /expected one of/);
  assert.throws(() => bindVerifiedProductState({ eventType: "SAVED", productStateRecordId: "foreign-record" }, serverBinding()), /not the authoritative/);
  assert.equal(bindVerifiedProductState({ eventType: "SAVED", productStateRecordId: "source-1" }, serverBinding()).authority.kind, "SERVER_VERIFIED_PRODUCT_STATE");
});

test("event reference matrix rejects missing and contradictory references", () => {
  const mutate = (event, change) => { const body = { ...structuredClone(event), ...change }; delete body.eventHash; return withEventHash(body); };
  assert.throws(() => parseCanonicalUserEvent(mutate(SYNTHETIC_EVENTS.visit, { references: {} })), /spotId/);
  assert.throws(() => parseCanonicalUserEvent(mutate(SYNTHETIC_EVENTS.standardReview, { references: {} })), /spotId/);
  assert.throws(() => parseCanonicalUserEvent(mutate(SYNTHETIC_EVENTS.positive, { references: {}, journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: "journey-policy-v1", independenceEligible: false } })), /experience target/);
  assert.throws(() => parseCanonicalUserEvent(mutate(SYNTHETIC_EVENTS.correction, { references: { spotId: "spot-1" } })), /forbids/);
  assert.throws(() => parseCanonicalUserEvent(mutate(SYNTHETIC_EVENTS.correction, { supersedesEventId: "event-negative" })), /must be identical/);
  assert.throws(() => parseCanonicalUserEvent(mutate(SYNTHETIC_EVENTS.save, { payload: { kind: "INTENT", action: "RESERVATION" } })), /inconsistent intent/);
});

test("temporal integrity is injected, deterministic and explicit for offline events", () => {
  const valid = { eventType: "SPOT_OPENED", occurredAt: "2026-01-15T11:00:00.000Z", observedAt: "2026-01-15T11:00:01.000Z", ingestedAt: "2026-01-15T12:00:00.000Z", serverNow: "2026-01-15T12:00:00.000Z", timeAuthority: "CLIENT_REPORTED_ACCEPTED_OFFLINE", policy: temporalPolicy };
  assert.doesNotThrow(() => validateTemporalIntegrity(valid));
  assert.doesNotThrow(() => validateTemporalIntegrity(structuredClone(valid)));
  assert.throws(() => validateTemporalIntegrity({ ...valid, occurredAt: "2026-01-15T12:00:02.000Z" }), /future-skew/);
  assert.throws(() => validateTemporalIntegrity({ ...valid, observedAt: "2026-01-15T10:59:59.000Z" }), /precedes occurrence/);
  assert.throws(() => validateTemporalIntegrity({ ...valid, ingestedAt: "2026-01-15T10:59:59.000Z" }), /ingestion precedes/);
  assert.throws(() => validateTemporalIntegrity({ ...valid, policy: { ...temporalPolicy, delayedEventPolicy: "REJECT" } }), /not allowed/);
  assert.doesNotThrow(() => validateTemporalIntegrity({ ...valid, eventType: "DOCUMENTED_IMPORT", observedAt: "2026-01-15T10:59:59.000Z", policy: { ...temporalPolicy, observationOrderExceptionEventTypes: ["DOCUMENTED_IMPORT"] } }));
});

test("opaque concepts require exact registry and known identifiers", () => {
  const ref = { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" };
  assert.equal(assertUserConceptCompatible(ref, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_CONCEPT_IDS).conceptId, "vibe.quiet");
  assert.throws(() => assertUserConceptCompatible({ ...ref, registryVersion: "unknown@2.0" }, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_CONCEPT_IDS), /incompatible registry/);
  assert.throws(() => assertUserConceptCompatible({ ...ref, conceptId: "Vibe.Quiet" }, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_CONCEPT_IDS), /unknown concept/);
});
