import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_VERSIONS,
  DARK_PROJECTION_NO_WRITE_PROOF,
  DARK_PROJECTION_RETENTION_TEMPLATE,
  DARK_PROJECTION_RUNTIME_FLAGS,
  DARK_PROJECTION_RUNTIME_RELEASE,
  DARK_PROJECTION_RUNTIME_TRUST_ANCHOR,
  DARK_RUNTIME_NO_WRITE_PROOF,
  DARK_RUNTIME_RELEASE,
  buildDarkProjectionPrivacyExport,
  canonicalJson,
  contentHash,
  createDarkProjectionRepositoryTrust,
  createSyntheticDarkProjectionAuthority,
  deriveDarkProjectionMetrics,
  rehearseDarkProjectionLifecycle,
  resolveDarkProjectionRuntimeMode,
  rebuildDarkProjectionState,
  runDarkProjectionRuntime,
  incrementDarkProjectionState,
  verifyDarkProjectionHandoff,
  verifyDarkProjectionParity,
  verifyDarkProjectionState,
  withDarkProjectionEventHash,
} from "../dist/index.js";

const userId = "synthetic-week2-user";
const subjectBindingHash = contentHash(userId);
const zero = "0".repeat(64);
const now = "2026-09-16T12:00:00.000Z";
const consent = {
  contractVersion: CONTRACT_VERSIONS.consentEnvelope,
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "week2-consent-1",
  policyVersion: "week2-consent-policy-1",
  uxVersion: "week2-consent-ux-1",
  effectiveAt: "2026-09-16T08:00:00.000Z",
  captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
};
const authority = createSyntheticDarkProjectionAuthority({
  authorityRecordId: "week2-orchestrator", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR",
  userId, subjectBindingHash, consent, allowedActions: ["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD"],
});
const legal = createSyntheticDarkProjectionAuthority({
  authorityRecordId: "week2-legal", authorityKind: "PRIVACY_LEGAL_PROCESS",
  userId, subjectBindingHash, consent, allowedActions: ["LEGAL_EXPORT"],
});
const trust = createDarkProjectionRepositoryTrust([authority, legal]);
const request = {
  contractVersion: CONTRACT_VERSIONS.projectionRequest,
  requestId: "week2-request-1",
  actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash, authenticationContextHash: zero, boundBy: "SERVER" },
  decisionId: "week2-decision-1", snapshot: null,
  context: { contextContractVersion: "week2-context-1", contextHash: contentHash("morning-solo"), placeTypes: ["cafe"], domainKeys: ["morning", "solo"], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: ["direct-spot-state"], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "week2-read-only-1", killSwitch: false,
};

function event(eventId, eventType, overrides = {}) {
  return withDarkProjectionEventHash({
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeEvent,
    eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType,
    journeyId: `journey-${eventId}`, occurredAt: "2026-09-16T09:00:00.000Z", observedAt: "2026-09-16T09:00:01.000Z", ingestedAt: "2026-09-16T09:00:02.000Z",
    authorityRecordId: authority.authorityRecordId, authorityRecordHash: authority.authorityHash,
    serverResolutionHash: contentHash(`resolution-${eventId}`), minimizedContextHash: contentHash("morning-solo"),
    rawTextIncluded: false, preciseLocationIncluded: false, commercialDataIncluded: false, productionAuthorized: false,
    ...overrides,
  });
}

const run = (events, overrides = {}) => runDarkProjectionRuntime({ configuration: "LOCAL_SYNTHETIC_TEST", authorityRecordId: authority.authorityRecordId, consent, lifecycle: "ACTIVE", request, events, trust, now, ...overrides });
const rebuild = (events) => rebuildDarkProjectionState({ authorityRecordId: authority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events, trust });

test("Week-1 release and no-write identities remain unchanged", () => {
  assert.equal(DARK_RUNTIME_RELEASE.releaseHash, "b9ae392e3f50540bdbe36456e5342d5bd089d0953dd86b9f4b2b2ba6359db417");
  assert.equal(DARK_RUNTIME_NO_WRITE_PROOF.proofHash, "309408760ce36bcc344d7a9ea6966eb655d647193c91a71764bec9e58d5618f3");
});

test("production defaults are forced off and unknown configuration fails closed", () => {
  assert.deepEqual(DARK_PROJECTION_RUNTIME_FLAGS, { USER_LEARNING_RUNTIME: false, eventIngestionEnabled: false, projectionRuntimeActivated: false, persistentWritesAuthorized: false, networkCallsAuthorized: false, rankingAuthorized: false, eligibilityAuthorized: false, shadowTrafficAuthorized: false, killSwitch: "FORCED_OFF" });
  for (const value of [undefined, null, true, "ON", "enabled", {}, 1]) assert.equal(resolveDarkProjectionRuntimeMode(value), "OFF");
  assert.equal(resolveDarkProjectionRuntimeMode("LOCAL_SYNTHETIC_TEST"), "LOCAL_SYNTHETIC_TEST");
});

test("OFF performs zero ingestion, projection, persistence and network work", () => {
  const malicious = { rawSearchText: "must never be parsed" };
  const result = runDarkProjectionRuntime({ configuration: "UNKNOWN", authorityRecordId: "missing", consent, lifecycle: "ACTIVE", request, events: [malicious], trust: { getRelease() { throw new Error("must not read"); } }, now });
  assert.equal(result.outcome, "OFF"); assert.equal(result.state, null); assert.equal(result.projection, null); assert.equal(result.handoff, null);
  assert.deepEqual(result.counters, { ingestionReads: 0, projectedItems: 0, persistentWrites: 0, networkCalls: 0 });
});

test("request kill switch suppresses before event ingestion", () => {
  const result = run([{ rawSearchText: "must not be parsed" }], { request: { ...request, killSwitch: true } });
  assert.equal(result.reasonCode, "KILL_SWITCH"); assert.equal(result.state, null); assert.equal(result.projection, null); assert.equal(result.counters.ingestionReads, 0);
});

test("release is independently anchored and cannot be self-replaced", () => {
  assert.equal(DARK_PROJECTION_RUNTIME_TRUST_ANCHOR.acceptedReleaseHash, DARK_PROJECTION_RUNTIME_RELEASE.releaseHash);
  const forged = structuredClone(DARK_PROJECTION_RUNTIME_RELEASE); forged.flags.projectionRuntimeActivated = true;
  const fake = { ...trust, getRelease: () => forged, getTrustAnchor: () => ({ ...DARK_PROJECTION_RUNTIME_TRUST_ANCHOR, acceptedReleaseHash: contentHash(forged) }) };
  assert.throws(() => run([], { trust: fake }));
});

test("foreign user, subject, consent and lifecycle bindings fail closed", () => {
  assert.throws(() => run([], { request: { ...request, actor: { ...request.actor, userId: "foreign" } } }));
  assert.throws(() => run([], { request: { ...request, actor: { ...request.actor, subjectBindingHash: contentHash("foreign") } } }));
  assert.throws(() => run([], { consent: { ...consent, consentVersion: "other" } }));
  assert.throws(() => run([], { lifecycle: "FULL_RESET" }));
});

test("save creates only a minimized direct planning state", () => {
  const result = run([event("save-1", "SAVED", { spotId: "fixture-cafe" })]);
  assert.equal(result.outcome, "PROJECTED_LOCAL_ONLY"); assert.equal(result.projection.taste.length, 0); assert.equal(result.projection.practical.length, 0);
  assert.deepEqual(result.projection.directSpot.map(({ state }) => state), ["PLANNING_STATE_SAVED"]);
  assert.equal(result.projection.boundaries.rankingAuthority, false); assert.equal(result.projection.boundaries.eligibilityAuthority, false);
});

test("save removal ends planning state without negative evidence", () => {
  const result = run([
    event("save-1", "SAVED", { spotId: "fixture-cafe" }),
    event("remove-1", "SAVE_REMOVED", { spotId: "fixture-cafe", occurredAt: "2026-09-16T10:00:00.000Z", observedAt: "2026-09-16T10:00:01.000Z", ingestedAt: "2026-09-16T10:00:02.000Z" }),
  ]);
  assert.equal(result.projection.status, "NEUTRAL"); assert.deepEqual(result.projection.directSpot, []); assert.deepEqual(result.projection.taste, []);
});

test("familiarity appears only after three independent visit journeys", () => {
  const visits = [1, 2, 3].map((n) => event(`visit-${n}`, "VISITED", { spotId: "fixture-cafe", journeyId: `independent-${n}` }));
  assert.deepEqual(run(visits.slice(0, 1)).projection.directSpot, []);
  assert.deepEqual(run(visits.slice(0, 2)).projection.directSpot, []);
  assert.deepEqual(run(visits).projection.directSpot.map(({ state }) => state), ["FAMILIARITY_THREE_INDEPENDENT_VISITS"]);
  const sameJourney = visits.map((entry, index) => event(`same-visit-${index}`, "VISITED", { spotId: "fixture-cafe", journeyId: "same-journey" }));
  assert.deepEqual(run(sameJourney).projection.directSpot, []);
});

test("search, skip and dwell cannot enter taste, sufficiency or handoff", () => {
  const result = run([event("search-1", "SEARCH"), event("skip-1", "QUICK_SKIP", { spotId: "fixture-cafe" }), event("dwell-1", "DWELL", { spotId: "fixture-cafe" })]);
  assert.equal(result.projection.status, "NEUTRAL"); assert.deepEqual(result.projection.taste, []); assert.deepEqual(result.projection.practical, []); assert.deepEqual(result.projection.directSpot, []);
  assert.equal(result.handoff.minimalityProof.dwellIncluded, false); assert.equal(JSON.stringify(result.handoff).includes("search-1"), false);
});

test("handoff is canonical, purpose-bound, minimized and hash-bound", () => {
  const result = run([event("save-1", "SAVED", { spotId: "fixture-cafe" })]);
  assert.doesNotThrow(() => verifyDarkProjectionHandoff(result.handoff, result.projection, consent));
  assert.deepEqual(result.handoff.minimalityProof, { rawEventsIncluded: false, evidenceIncluded: false, rawTextIncluded: false, dwellIncluded: false, preciseLocationIncluded: false, commercialDataIncluded: false });
  assert.throws(() => verifyDarkProjectionHandoff({ ...result.handoff, projectionContractVersion: "unknown" }, result.projection, consent));
  assert.throws(() => verifyDarkProjectionHandoff({ ...result.handoff, projectionHash: zero, handoffHash: contentHash({ ...result.handoff, projectionHash: zero }) }, result.projection, consent));
});

test("duplicate delivery and semantic retry are deduplicated", () => {
  const resolution = contentHash("save-operation-resolution");
  const first = event("save-delivery-1", "SAVED", { spotId: "fixture-cafe", idempotencyKey: "save-operation", journeyId: "save-operation-journey", serverResolutionHash: resolution });
  const retry = event("save-delivery-2", "SAVED", { spotId: "fixture-cafe", idempotencyKey: "save-operation", journeyId: "save-operation-journey", serverResolutionHash: resolution, ingestedAt: "2026-09-16T11:00:00.000Z" });
  const state = rebuild([first, first, retry]);
  assert.equal(state.ledger.length, 1); assert.equal(state.activeEventIds.length, 1);
});

test("idempotency and event-id content collisions fail closed", () => {
  const a = event("a", "SAVED", { spotId: "spot-a", idempotencyKey: "operation" });
  const b = event("b", "SAVED", { spotId: "spot-b", idempotencyKey: "operation" });
  assert.throws(() => rebuild([a, b]));
  const reused = event("a", "SAVED", { spotId: "spot-b", idempotencyKey: "other" });
  assert.throws(() => rebuild([a, reused]));
});

test("late and out-of-order input replays deterministically", () => {
  const older = event("older", "SAVED", { spotId: "fixture-cafe" });
  const later = event("later", "SAVE_REMOVED", { spotId: "fixture-cafe", occurredAt: "2026-09-16T10:00:00.000Z", observedAt: "2026-09-16T10:00:01.000Z", ingestedAt: "2026-09-16T11:00:00.000Z" });
  assert.equal(rebuild([older, later]).stateHash, rebuild([later, older]).stateHash);
});

test("correction remains in append-only ledger and removes active influence", () => {
  const saved = event("saved-target", "SAVED", { spotId: "fixture-cafe" });
  const correction = event("correction-1", "CORRECTION", { targetEventId: saved.eventId, occurredAt: "2026-09-16T10:00:00.000Z", observedAt: "2026-09-16T10:00:01.000Z", ingestedAt: "2026-09-16T10:00:02.000Z" });
  const state = rebuild([saved, correction]);
  assert.equal(state.ledger.length, 2); assert.deepEqual(state.activeEventIds, []); assert.deepEqual(state.correctedEventIds, [saved.eventId]);
  assert.equal(run([saved, correction]).projection.status, "NEUTRAL");
});

test("correction can target historical incremental ledger and parity is byte-identical", () => {
  const saved = event("saved-target", "SAVED", { spotId: "fixture-cafe" });
  const correction = event("correction-1", "CORRECTION", { targetEventId: saved.eventId, occurredAt: "2026-09-16T10:00:00.000Z", observedAt: "2026-09-16T10:00:01.000Z", ingestedAt: "2026-09-16T10:00:02.000Z" });
  const previous = rebuild([saved]);
  const incremental = incrementDarkProjectionState({ authorityRecordId: authority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", previous, delta: [correction], trust });
  const full = rebuild([correction, saved]);
  assert.equal(verifyDarkProjectionParity(full, incremental, authority), true); assert.equal(canonicalJson(full), canonicalJson(incremental));
});

test("tampered nested event fails after complete outer rehash", () => {
  const state = rebuild([event("save-1", "SAVED", { spotId: "fixture-cafe" })]);
  const forged = structuredClone(state); forged.ledger[0].spotId = "forged";
  const outer = { ...forged }; delete outer.stateHash; forged.stateHash = contentHash(outer);
  assert.throws(() => verifyDarkProjectionState(forged, authority));
});

test("raw, commercial and foreign event data are rejected at runtime boundary", () => {
  const valid = event("save-1", "SAVED", { spotId: "fixture-cafe" });
  for (const extra of [{ rawSearchText: "secret" }, { ownerTier: "PREMIUM" }, { payment: true }, { advertising: true }]) assert.throws(() => run([{ ...valid, ...extra }]));
  assert.throws(() => run([{ ...valid, userId: "foreign", eventHash: contentHash({ ...valid, userId: "foreign" }) }]));
});

test("No Consent, withdrawal, reset and erasure return no personal projection or input", () => {
  const cases = [
    { lifecycle: "NO_CONSENT", nextConsent: { ...consent, state: "DENIED", allowedProcessing: ["EXPORT", "ERASURE"], lifecycleEffect: "PURGE_PERSONALIZATION", consentVersion: "denied" } },
    { lifecycle: "CONSENT_WITHDRAWN", nextConsent: { ...consent, state: "WITHDRAWN", allowedProcessing: ["EXPORT", "ERASURE"], lifecycleEffect: "PURGE_PERSONALIZATION", consentVersion: "withdrawn" } },
    { lifecycle: "FULL_RESET", nextConsent: consent },
    { lifecycle: "ACCOUNT_ERASURE", nextConsent: consent },
  ];
  for (const { lifecycle, nextConsent } of cases) {
    const record = createSyntheticDarkProjectionAuthority({ authorityRecordId: `authority-${lifecycle}`, authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", userId, subjectBindingHash, consent: nextConsent, lifecycle, allowedActions: ["LOCAL_PROJECT"] });
    const result = runDarkProjectionRuntime({ configuration: "LOCAL_SYNTHETIC_TEST", authorityRecordId: record.authorityRecordId, consent: nextConsent, lifecycle, request, events: [event(`event-${lifecycle}`, "SEARCH")], trust: createDarkProjectionRepositoryTrust([record]), now });
    assert.equal(result.projection, null); assert.equal(result.handoff, null); assert.equal(result.state.userId, null); assert.equal(result.state.subjectBindingHash, null); assert.deepEqual(result.state.ledger, []);
  }
});

test("privacy export requires separate legal authority and never enters product handoff", () => {
  const state = rebuild([event("save-1", "SAVED", { spotId: "fixture-cafe" })]);
  assert.throws(() => buildDarkProjectionPrivacyExport({ exportId: "export-1", state, consent, authorityRecordId: authority.authorityRecordId, sourceAuthority: authority, trust }));
  const exported = buildDarkProjectionPrivacyExport({ exportId: "export-1", state, consent, authorityRecordId: legal.authorityRecordId, sourceAuthority: authority, trust });
  assert.equal(exported.normalProductApiAccessible, false); assert.equal(exported.productionAuthorized, false); assert.equal(JSON.stringify(run([event("save-1", "SAVED", { spotId: "fixture-cafe" })]).handoff).includes(exported.exportHash), false);
  const fakeSource = { ...authority, authorityRecordId: "fake-source" };
  assert.throws(() => buildDarkProjectionPrivacyExport({ exportId: "export-forged", state, consent, authorityRecordId: legal.authorityRecordId, sourceAuthority: fakeSource, trust }));
});

test("retention decision package has no invented durations or defaults", () => {
  assert.equal(DARK_PROJECTION_RETENTION_TEMPLATE.status, "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL");
  assert.ok(DARK_PROJECTION_RETENTION_TEMPLATE.classes.every(({ duration }) => duration === null));
  assert.deepEqual(DARK_PROJECTION_RETENTION_TEMPLATE.requiredApprovals, ["FOUNDER", "CTO", "LEGAL"]);
});

test("technical metrics contain no preference inference and prove zero writes", () => {
  const result = run([event("save-1", "SAVED", { spotId: "fixture-cafe" })]);
  const metrics = deriveDarkProjectionMetrics(result);
  assert.equal(metrics.persistentWrites, 0); assert.equal(metrics.networkCalls, 0); assert.equal(metrics.noWriteProofHash, DARK_PROJECTION_NO_WRITE_PROOF.proofHash);
  assert.equal("tasteAccuracy" in metrics, false); assert.equal("engagement" in metrics, false);
});

test("lifecycle rehearsal never claims physical completion without executor evidence", () => {
  const result = run([event("save-1", "SAVED", { spotId: "fixture-cafe" })]);
  const rehearsal = rehearseDarkProjectionLifecycle({ activeResult: result });
  assert.ok(rehearsal.suppressed.every(({ personalState, projection, completionClaimed }) => !personalState && projection === null && !completionClaimed));
});

test("no-write proof excludes database, persistence, network and production consumers", () => {
  assert.equal(DARK_PROJECTION_NO_WRITE_PROOF.databaseClientDependency, false); assert.equal(DARK_PROJECTION_NO_WRITE_PROOF.persistencePortDependency, false);
  assert.equal(DARK_PROJECTION_NO_WRITE_PROOF.networkClientDependency, false); assert.equal(DARK_PROJECTION_NO_WRITE_PROOF.productionWritesPossible, false);
  assert.equal(DARK_PROJECTION_NO_WRITE_PROOF.productEventConsumerRegistered, undefined);
});

test("raw ingestion reducer is not part of the public package API", async () => {
  const publicApi = await import("../dist/index.js");
  assert.equal(publicApi.buildDarkProjectionState, undefined);
  assert.equal(publicApi.updateDarkProjectionState, undefined);
  assert.equal(typeof publicApi.rebuildDarkProjectionState, "function");
  assert.equal(typeof publicApi.incrementDarkProjectionState, "function");
});
