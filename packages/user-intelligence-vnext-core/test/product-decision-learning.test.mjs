import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_VERSIONS,
  PRODUCT_DECISION_EVENT_TYPES,
  PRODUCT_DECISION_LEARNING_ARTIFACT_HASH,
  PRODUCT_DECISION_LEARNING_RELEASE,
  PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH,
  PRODUCT_DECISION_LEARNING_TRUST_ANCHOR,
  ProductDecisionLearningInputSchema,
  canonicalJson,
  contentHash,
  createProductDecisionLearningWritePort,
  createProductRelevantUserProjectionPort,
} from "../dist/index.js";

const now = "2026-09-18T15:00:00.000Z";
const userId = "11111111-1111-4111-a111-111111111111";
const otherUser = "22222222-2222-4222-a222-222222222222";
const subjectBindingHash = contentHash({ userId, subject: "product" });
const authenticationContextHash = contentHash({ userId, auth: "product" });
const contextBindingHash = contentHash({ intent: "cafe", city: "Basel" });
const consent = (overrides = {}) => ({
  contractVersion: CONTRACT_VERSIONS.consentEnvelope,
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "product-consent-1",
  policyVersion: "product-consent-policy-1",
  uxVersion: "product-consent-ux-1",
  effectiveAt: "2026-09-18T12:00:00.000Z",
  captureContext: "SETTINGS",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
  ...overrides,
});
const event = (eventType, overrides = {}) => {
  const candidate = ["candidate_impression", "candidate_opened", "candidate_saved", "candidate_rejected", "explicit_feedback", "outcome_confirmed"].includes(eventType);
  return {
    contractVersion: CONTRACT_VERSIONS.productDecisionLearningInput,
    eventId: `event-${eventType}`,
    idempotencyKey: `key-${eventType}`,
    eventType,
    decisionId: "decision-1",
    sessionId: "session-1",
    candidateId: candidate ? "candidate-1" : null,
    spotId: candidate ? "spot-1" : null,
    contextBindingHash,
    occurredAt: "2026-09-18T14:59:00.000Z",
    feedback: eventType === "explicit_feedback" ? { response: "HAS_MATCHED", explicitlySelected: true } : null,
    targetEventId: eventType === "event_correction" ? "event-explicit_feedback" : null,
    ...overrides,
  };
};

function harness(overrides = {}) {
  let state = { consent: consent(), lifecycle: "ACTIVE" };
  let session = { authUserId: userId, subjectBindingHash, authenticationContextHash, authenticated: true, blocked: false, deleted: false, issuedAt: "2026-09-18T14:00:00.000Z", expiresAt: "2026-09-18T16:00:00.000Z", verifiedAt: now };
  let acceptedAuthorityHash = null;
  let appendCount = 0;
  let authorityCount = 0;
  let rateCount = 0;
  let runtimeAuthorityCount = 0;
  const records = new Map();
  const authorityProvider = {
    contractVersion: "backyrd.user-intelligence.product-decision-authority-provider@1.0",
    async resolve(input, authenticatedUserId) {
      authorityCount += 1;
      const body = {
        contractVersion: CONTRACT_VERSIONS.productDecisionLearningAuthority,
        authorityRecordId: `authority-${input.eventId}`,
        authority: "SERVER_DECISION_LEDGER",
        authUserId: authenticatedUserId,
        subjectBindingHash,
        authenticationContextHash,
        decisionId: input.decisionId,
        sessionId: input.sessionId,
        journeyId: "journey-1",
        candidateId: input.candidateId,
        spotId: input.spotId,
        contextBindingHash: input.contextBindingHash,
        explicitUserActionVerified: ["explicit_feedback", "outcome_confirmed", "event_correction"].includes(input.eventType),
        productStateVerified: input.eventType === "candidate_saved",
        outcomeVerified: input.eventType === "outcome_confirmed",
        targetEventId: input.targetEventId,
        targetRecordHash: input.eventType === "event_correction" ? contentHash("target-record") : null,
        eventOccurredAt: input.occurredAt,
        authorityPolicyVersion: PRODUCT_DECISION_LEARNING_RELEASE.authorityPolicyVersion,
        releaseHash: PRODUCT_DECISION_LEARNING_RELEASE.releaseHash,
        artifactHash: PRODUCT_DECISION_LEARNING_ARTIFACT_HASH,
        sourceSetHash: PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH,
        validFrom: "2026-09-18T14:00:00.000Z",
        validUntil: "2026-09-18T16:00:00.000Z",
        issuer: "BACKYRD_DECISION_EVENT_AUTHORITY",
      };
      const record = { ...body, ...overrides.authority, recordHash: contentHash({ ...body, ...overrides.authority }) };
      acceptedAuthorityHash = overrides.rejectAuthority ? null : record.recordHash;
      return overrides.mutateAuthorityAfterHash ? { ...record, authUserId: otherUser } : record;
    },
  };
  const repository = {
    contractVersion: "backyrd.user-intelligence.product-decision-learning-repository@1.0",
    async append(record) {
      appendCount += 1;
      const previous = records.get(record.idempotencyKey);
      if (previous && previous.recordHash !== record.recordHash) throw new Error("idempotency_conflict");
      if (previous) return { status: "REPLAYED", eventId: previous.eventId, recordHash: previous.recordHash };
      records.set(record.idempotencyKey, record);
      return { status: "PERSISTED", eventId: record.eventId, recordHash: record.recordHash };
    },
  };
  const runtimeBody = {
    contractVersion: "backyrd.user-intelligence.product-decision-runtime-authority@1.0",
    enabled: true,
    killSwitchEngaged: false,
    generation: 1,
    releaseHash: PRODUCT_DECISION_LEARNING_RELEASE.releaseHash,
    artifactHash: PRODUCT_DECISION_LEARNING_ARTIFACT_HASH,
    sourceSetHash: PRODUCT_DECISION_LEARNING_SOURCE_SET_HASH,
    validFrom: "2026-09-18T14:00:00.000Z",
    validUntil: "2026-09-18T16:00:00.000Z",
  };
  const runtimeAuthority = { ...runtimeBody, authorityHash: contentHash(runtimeBody), ...overrides.runtimeAuthority };
  const port = createProductDecisionLearningWritePort({
    mode: overrides.runtime ? "PRODUCT_RUNTIME" : "LOCAL_INTEGRATION_TEST",
    now: () => new Date(now),
    sessionProvider: { contractVersion: "backyrd.user-intelligence.product-session-provider@1.0", readVerifiedSession: async () => session },
    consentLifecycleProvider: { contractVersion: "backyrd.user-intelligence.product-consent-lifecycle-provider@1.0", readForAuthenticatedUser: async () => state },
    authorityProvider,
    repository,
    rateLimit: { contractVersion: "backyrd.user-intelligence.product-decision-learning-rate-limit@1.0", async consume() { rateCount += 1; return { allowed: !overrides.rateLimited }; } },
    trust: { verifiedAt: now, getRelease: (id) => id === PRODUCT_DECISION_LEARNING_RELEASE.releaseId ? PRODUCT_DECISION_LEARNING_RELEASE : null, getTrustAnchor: (id) => id === PRODUCT_DECISION_LEARNING_TRUST_ANCHOR.anchorId ? PRODUCT_DECISION_LEARNING_TRUST_ANCHOR : null, acceptsAuthorityRecordHash: (hash) => hash === acceptedAuthorityHash, acceptsRuntimeAuthorityHash: (hash) => !overrides.rejectRuntimeAuthority && hash === runtimeAuthority.authorityHash },
    ...(overrides.runtime ? { runtimeAuthority: { contractVersion: "backyrd.user-intelligence.product-decision-runtime-authority-provider@1.0", async read() { runtimeAuthorityCount += 1; return runtimeAuthority; } } } : {}),
  });
  return { port, records, setState: (value) => { state = value; }, setSession: (value) => { session = value; }, counts: () => ({ appendCount, authorityCount, rateCount }), runtimeAuthorityCount: () => runtimeAuthorityCount };
}

test("all versioned Product Decision events traverse the server-authorized port", async () => {
  const h = harness();
  for (const eventType of PRODUCT_DECISION_EVENT_TYPES) {
    const result = await h.port.record(event(eventType));
    assert.equal(result.persisted, true);
    assert.equal(result.status, "PERSISTED");
  }
  assert.equal(h.records.size, PRODUCT_DECISION_EVENT_TYPES.length);
  for (const record of h.records.values()) {
    assert.equal(record.userId, userId);
    assert.equal(record.boundaries.rawEvidenceIncluded, false);
    assert.equal(record.boundaries.rawTextIncluded, false);
    assert.equal(record.boundaries.worldMutationAuthorized, false);
    assert.equal(record.boundaries.clientRankingAuthorized, false);
    assert.equal(record.recordHash, contentHash(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordHash"))));
  }
});

test("no consent permits Decision but produces no persistent learning event", async () => {
  const h = harness();
  h.setState({ consent: consent({ state: "UNKNOWN", allowedProcessing: [], lifecycleEffect: "DO_NOT_PROCESS" }), lifecycle: "ACTIVE" });
  assert.deepEqual(await h.port.record(event("decision_requested")), { contractVersion: CONTRACT_VERSIONS.productDecisionLearningReceipt, status: "SUPPRESSED_NO_CONSENT", persisted: false, eventId: null, recordHash: null, neutralProjectionRequired: true });
  assert.deepEqual(h.counts(), { appendCount: 0, authorityCount: 0, rateCount: 0 });
});

test("withdrawal reset erasure and missing lifecycle suppress before authority and persistence", async () => {
  for (const lifecycle of ["CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"]) {
    const h = harness(); h.setState({ consent: consent(), lifecycle });
    const result = await h.port.record(event("candidate_opened"));
    assert.equal(result.status, "SUPPRESSED_LIFECYCLE"); assert.equal(result.persisted, false);
    assert.deepEqual(h.counts(), { appendCount: 0, authorityCount: 0, rateCount: 0 });
  }
  const h = harness(); h.setState(null);
  assert.equal((await h.port.record(event("candidate_opened"))).status, "SUPPRESSED_LIFECYCLE");
});

test("idempotency replays byte-identical canonical records and rejects conflicts", async () => {
  const h = harness(); const input = event("candidate_opened");
  assert.equal((await h.port.record(input)).status, "PERSISTED");
  assert.equal((await h.port.record(input)).status, "REPLAYED");
  await assert.rejects(h.port.record({ ...input, eventId: "changed-event" }), /idempotency_conflict/);
  assert.equal(h.records.size, 1);
});

test("client cannot provide user authority policy signal strength independence raw text or commercial fields", () => {
  const base = event("candidate_opened");
  for (const [key, value] of [["userId", userId], ["signalStrength", 1], ["independence", true], ["policyVersion", "client"], ["rawText", "private"], ["ownerTier", "paid"], ["advertising", true]]) assert.throws(() => ProductDecisionLearningInputSchema.parse({ ...base, [key]: value }));
});

test("cross-user and fully rehashed replacement authority fail against external trust", async () => {
  await assert.rejects(harness({ mutateAuthorityAfterHash: true }).port.record(event("candidate_opened")), /authority_denied/);
  await assert.rejects(harness({ rejectAuthority: true }).port.record(event("candidate_opened")), /authority_denied/);
  await assert.rejects(harness({ authority: { authorityRecordId: "replacement", authUserId: otherUser } }).port.record(event("candidate_opened")), /authority_denied/);
});

test("session Decision Context Candidate Spot and time mismatches fail closed", async () => {
  for (const authority of [
    { decisionId: "other-decision" }, { sessionId: "other-session" }, { candidateId: "other-candidate" },
    { spotId: "other-spot" }, { contextBindingHash: contentHash("other-context") },
    { eventOccurredAt: "2026-09-18T15:10:00.000Z" }, { authorityPolicyVersion: "unknown-policy" },
  ]) await assert.rejects(harness({ authority }).port.record(event("candidate_opened")), /authority_denied/);
});

test("Save Product State outcome and explicit feedback require their composite proofs", async () => {
  await assert.rejects(harness({ authority: { productStateVerified: false } }).port.record(event("candidate_saved")), /product_state_required/);
  await assert.rejects(harness({ authority: { explicitUserActionVerified: false } }).port.record(event("explicit_feedback")), /explicit_feedback_authority_required/);
  await assert.rejects(harness({ authority: { outcomeVerified: false } }).port.record(event("outcome_confirmed")), /outcome_authority_required/);
  await assert.rejects(harness().port.record(event("explicit_feedback", { feedback: null })), /explicit_feedback_authority_required/);
  const neutral = harness();
  await neutral.port.record(event("explicit_feedback", { feedback: { response: "CANNOT_ASSESS_OR_SKIPPED", explicitlySelected: true } }));
  assert.equal([...neutral.records.values()][0].semanticDisposition, "OBSERVATION_ONLY");
});

test("correction is append-only and binds the authoritative target record", async () => {
  const h = harness(); const result = await h.port.record(event("event_correction"));
  assert.equal(result.status, "PERSISTED");
  const record = [...h.records.values()][0];
  assert.equal(record.semanticDisposition, "CORRECTION");
  assert.equal(record.targetEventId, "event-explicit_feedback");
  assert.equal(record.targetRecordHash, contentHash("target-record"));
  await assert.rejects(harness({ authority: { targetEventId: "other-target" } }).port.record(event("event_correction")), /correction_authority_invalid/);
});

test("rate limit is server-side and fail-closed", async () => {
  const h = harness({ rateLimited: true });
  await assert.rejects(h.port.record(event("candidate_opened")), /rate_limited/);
  assert.deepEqual(h.counts(), { appendCount: 0, authorityCount: 0, rateCount: 1 });
});

test("PRODUCT_RUNTIME cannot be constructed from the non-activated source release", () => {
  const h = harness();
  assert.throws(() => createProductDecisionLearningWritePort({ mode: "PRODUCT_RUNTIME", now: () => new Date(now), sessionProvider: h.port, consentLifecycleProvider: h.port, authorityProvider: h.port, repository: h.port, rateLimit: h.port, trust: {} }), /runtime_not_authorized/);
  assert.equal(PRODUCT_DECISION_LEARNING_RELEASE.productionAuthorized, false);
  assert.equal(PRODUCT_DECISION_LEARNING_RELEASE.runtimeActivated, false);
});

test("PRODUCT_RUNTIME requires a fresh externally trusted exact-release authority at every write boundary", async () => {
  const h = harness({ runtime: true });
  assert.equal((await h.port.record(event("candidate_opened"))).status, "PERSISTED");
  assert.equal(h.runtimeAuthorityCount(), 3);
  assert.equal(PRODUCT_DECISION_LEARNING_RELEASE.productionAuthorized, false);
  assert.equal(PRODUCT_DECISION_LEARNING_RELEASE.runtimeActivated, false);

  for (const invalid of [
    { enabled: false },
    { killSwitchEngaged: true },
    { generation: 0 },
    { releaseHash: contentHash("wrong-release") },
    { validUntil: now },
  ]) {
    const denied = harness({ runtime: true, runtimeAuthority: invalid });
    await assert.rejects(denied.port.record(event("candidate_opened")), /runtime_not_authorized/);
    assert.deepEqual(denied.counts(), { appendCount: 0, authorityCount: 0, rateCount: 0 });
  }
  await assert.rejects(harness({ runtime: true, rejectRuntimeAuthority: true }).port.record(event("candidate_opened")), /runtime_not_authorized/);
});

const projectionRequest = (overrides = {}) => ({
  contractVersion: CONTRACT_VERSIONS.projectionRequest,
  requestId: "product-request-1",
  actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash, authenticationContextHash, boundBy: "SERVER" },
  decisionId: "decision-1", snapshot: null,
  context: { contextContractVersion: "product-context-1", contextHash: contextBindingHash, placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: [], budgets: { maxItems: 8, maxBytes: 4096 }, projectionPolicyVersion: "product-policy-1", killSwitch: false,
  ...overrides,
});

function projectionHarness(state) {
  let reads = 0;
  const port = createProductRelevantUserProjectionPort({
    now: () => new Date(now),
    sessionProvider: { contractVersion: "backyrd.user-intelligence.product-session-provider@1.0", readVerifiedSession: async () => ({ authUserId: userId, subjectBindingHash, authenticationContextHash, authenticated: true, blocked: false, deleted: false, issuedAt: "2026-09-18T14:00:00.000Z", expiresAt: "2026-09-18T16:00:00.000Z", verifiedAt: now }) },
    consentLifecycleProvider: { contractVersion: "backyrd.user-intelligence.product-consent-lifecycle-provider@1.0", readForAuthenticatedUser: async () => state },
    projectionProvider: { contractVersion: "backyrd.user-intelligence.product-projection-read-provider@1.0", async read() { reads += 1; throw new Error("unexpected_personal_read"); } },
    acceptsEnvelopeHash: () => false,
  });
  return { port, reads: () => reads };
}

test("all authenticated accounts receive a canonical neutral projection without Learning consent", async () => {
  const h = projectionHarness({ consent: consent({ state: "UNKNOWN", allowedProcessing: [], lifecycleEffect: "DO_NOT_PROCESS" }), lifecycle: "ACTIVE" });
  const projection = await h.port.project(projectionRequest());
  assert.equal(projection.status, "NEUTRAL"); assert.equal(projection.neutralReason, "NO_CONSENT"); assert.equal(projection.snapshot, null); assert.equal(h.reads(), 0);
  assert.equal(canonicalJson(projection).includes(userId), false);
  assert.deepEqual(projection.taste, []); assert.deepEqual(projection.directSpot, []); assert.equal(projection.boundaries.rankingAuthority, false); assert.equal(projection.boundaries.eligibilityAuthority, false);
});

test("withdrawal reset erasure and kill switch return privacy-neutral projections without personal reads", async () => {
  for (const lifecycle of ["CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"]) {
    const h = projectionHarness({ consent: consent(), lifecycle });
    const projection = await h.port.project(projectionRequest());
    assert.equal(projection.neutralReason, "NO_CONSENT"); assert.equal(h.reads(), 0); assert.equal(canonicalJson(projection).includes(userId), false);
  }
  const h = projectionHarness({ consent: consent(), lifecycle: "ACTIVE" });
  assert.equal((await h.port.project(projectionRequest({ killSwitch: true }))).neutralReason, "KILL_SWITCH"); assert.equal(h.reads(), 0);
});

test("neutral projection is deterministic and the Product port has no Founder UUID dependency", async () => {
  const first = projectionHarness({ consent: consent({ state: "UNKNOWN", allowedProcessing: [], lifecycleEffect: "DO_NOT_PROCESS" }), lifecycle: "ACTIVE" });
  const second = projectionHarness({ consent: consent({ state: "UNKNOWN", allowedProcessing: [], lifecycleEffect: "DO_NOT_PROCESS" }), lifecycle: "ACTIVE" });
  assert.equal(canonicalJson(await first.port.project(projectionRequest())), canonicalJson(await second.port.project(projectionRequest())));
  assert.equal(createProductRelevantUserProjectionPort.toString().includes("Uuid"), false);
  assert.equal(createProductRelevantUserProjectionPort.toString().includes("allowlist"), false);
});
