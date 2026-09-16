import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDarkRuntimePrivacyExport,
  buildDarkRuntimeSyntheticState,
  contentHash,
  createDarkRuntimeRepositoryTrust,
  createSyntheticDarkRuntimeAuthority,
  DARK_RUNTIME_FLAGS,
  DARK_RUNTIME_NO_WRITE_PROOF,
  DARK_RUNTIME_RELEASE,
  DARK_RUNTIME_RETENTION_DECISION_TEMPLATE,
  DARK_RUNTIME_RETENTION_DECISION_TEMPLATE_HASH,
  DARK_RUNTIME_TRUST_ANCHOR,
  deriveDarkRuntimeMetrics,
  evaluateDarkRuntimeCommand,
  updateDarkRuntimeSyntheticState,
  verifyDarkRuntimeAuthority,
  verifyDarkRuntimeReplay,
  verifyDarkRuntimeSyntheticState,
  withDarkRuntimeCommandHash,
  withDarkRuntimeSyntheticEventHash,
} from "../dist/index.js";

const userId = "synthetic-user-week1";
const subjectBindingHash = contentHash("synthetic-subject-week1");
const consent = Object.freeze({
  contractVersion: "backyrd.user-intelligence.consent-envelope@1.0",
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "synthetic-consent-v1",
  policyVersion: "synthetic-policy-v1",
  uxVersion: "synthetic-ux-v1",
  effectiveAt: "2026-09-16T08:00:00.000Z",
  captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
});
const orchestrator = createSyntheticDarkRuntimeAuthority({ authorityRecordId: "week1-orchestrator", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", boundUserId: userId, subjectBindingHash, consent, allowedActions: ["PREVIEW_EVENT_INGESTION", "PREVIEW_FULL_REBUILD", "PREVIEW_INCREMENTAL_UPDATE", "PLAN_CONSENT_WITHDRAWAL", "PLAN_FULL_RESET", "PLAN_ACCOUNT_ERASURE"] });
const legal = createSyntheticDarkRuntimeAuthority({ authorityRecordId: "week1-legal", authorityKind: "PRIVACY_LEGAL_PROCESS", boundUserId: userId, subjectBindingHash, consent, allowedActions: ["PREVIEW_PRIVACY_EXPORT"] });
const trust = createDarkRuntimeRepositoryTrust([orchestrator, legal]);

function event(eventId, eventType, overrides = {}) {
  const input = { contractVersion: "backyrd.user-intelligence.dark-runtime-synthetic-event@week1-1", eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType, journeyId: `journey-${eventId}`, occurredAt: "2026-09-16T09:00:00.000Z", ingestedAt: "2026-09-16T09:00:01.000Z", authority: "SYNTHETIC_SERVER_FIXTURE", rawPersonalDataIncluded: false, productionAuthorized: false, ...overrides };
  return withDarkRuntimeSyntheticEventHash(input);
}
function command(action, authorityRecordId = "week1-orchestrator", overrides = {}) {
  return withDarkRuntimeCommandHash({ commandId: `command-${action.toLowerCase()}`, action, userId, subjectBindingHash, consent, authorityRecordId, requestedAt: "2026-09-16T12:00:00.000Z", clientSelectedPolicy: false, productionWriteRequested: false, ...overrides });
}

test("dark release and kill switch keep every activation path disabled", () => {
  assert.deepEqual(DARK_RUNTIME_FLAGS, { eventIngestionEnabled: false, runtimeActivated: false, learningAuthorized: false, productionWritesAuthorized: false, projectionWritesAuthorized: false, rankingAuthorized: false, eligibilityAuthorized: false, shadowTrafficAuthorized: false, killSwitch: "FORCED_OFF" });
  assert.equal(DARK_RUNTIME_RELEASE.releaseHash, DARK_RUNTIME_TRUST_ANCHOR.acceptedReleaseHash);
});

test("event ingestion adapter fails closed without attempting a write", () => {
  const receipt = evaluateDarkRuntimeCommand(command("PREVIEW_EVENT_INGESTION"), trust);
  assert.equal(receipt.outcome, "BLOCKED_DISABLED"); assert.equal(receipt.persistentWritesAttempted, 0); assert.equal(receipt.persistentWritesCompleted, 0); assert.equal(receipt.personalPayloadReturned, false);
});

test("client policy selection or a write request is rejected even after rehash", () => {
  for (const forgedField of [{ clientSelectedPolicy: true }, { productionWriteRequested: true }]) {
    const base = { ...command("PREVIEW_FULL_REBUILD"), ...forgedField }; delete base.commandHash;
    assert.throws(() => evaluateDarkRuntimeCommand({ ...base, commandHash: contentHash(base) }, trust));
  }
});

test("replacement release, trust anchor and authority fail closed", () => {
  const forgedRelease = structuredClone(DARK_RUNTIME_RELEASE); forgedRelease.flags.runtimeActivated = true;
  const fakeTrust = { ...trust, getRelease: () => forgedRelease, getTrustAnchor: () => ({ ...DARK_RUNTIME_TRUST_ANCHOR, acceptedReleaseHash: contentHash(forgedRelease) }) };
  assert.throws(() => verifyDarkRuntimeAuthority({ authorityRecordId: orchestrator.authorityRecordId, userId, subjectBindingHash, consent, action: "PREVIEW_FULL_REBUILD", trust: fakeTrust }));
});

test("foreign user, subject or consent cannot reuse authority", () => {
  assert.throws(() => verifyDarkRuntimeAuthority({ authorityRecordId: orchestrator.authorityRecordId, userId: "foreign-user", subjectBindingHash, consent, action: "PREVIEW_FULL_REBUILD", trust }));
  assert.throws(() => verifyDarkRuntimeAuthority({ authorityRecordId: orchestrator.authorityRecordId, userId, subjectBindingHash: contentHash("foreign"), consent, action: "PREVIEW_FULL_REBUILD", trust }));
  assert.throws(() => verifyDarkRuntimeAuthority({ authorityRecordId: orchestrator.authorityRecordId, userId, subjectBindingHash, consent: { ...consent, consentVersion: "other" }, action: "PREVIEW_FULL_REBUILD", trust }));
});

test("non-granted consent blocks synthetic personal processing", () => {
  const denied = { ...consent, state: "DENIED", allowedProcessing: ["EXPORT", "ERASURE"], lifecycleEffect: "PURGE_PERSONALIZATION" };
  const record = createSyntheticDarkRuntimeAuthority({ authorityRecordId: "denied-authority", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", boundUserId: userId, subjectBindingHash, consent: denied, allowedActions: ["PREVIEW_FULL_REBUILD"] });
  const deniedTrust = createDarkRuntimeRepositoryTrust([record]);
  assert.throws(() => evaluateDarkRuntimeCommand(command("PREVIEW_FULL_REBUILD", "denied-authority", { consent: denied }), deniedTrust));
});

test("full rebuild deduplicates exact delivery and never creates projection output", () => {
  const saved = event("saved-1", "SAVED", { spotId: "fixture-spot" });
  const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [saved, saved] });
  assert.equal(state.activeEvents.length, 1); assert.equal(state.productionProjectionItems, 0); assert.equal(state.productionWrites, 0); assert.equal(state.learningActivated, false);
});

test("semantic retry with another transport event id is deduplicated by idempotency key", () => {
  const first = event("search-delivery-1", "SEARCH", { idempotencyKey: "search-op-1", journeyId: "journey-search-operation" });
  const retry = event("search-delivery-2", "SEARCH", { idempotencyKey: "search-op-1", journeyId: "journey-search-operation", ingestedAt: "2026-09-16T09:00:03.000Z" });
  const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [first, retry] });
  assert.equal(state.activeEvents.length, 1);
});

test("idempotency key reuse for different semantics is rejected", () => {
  const first = event("save-1", "SAVED", { idempotencyKey: "operation-1", spotId: "spot-a" });
  const forged = event("save-2", "SAVED", { idempotencyKey: "operation-1", spotId: "spot-b" });
  assert.throws(() => buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [first, forged] }));
});

test("correction is append-only input and removes only the active target", () => {
  const saved = event("saved-target", "SAVED", { spotId: "fixture-spot" });
  const correction = event("correction-1", "CORRECTION", { targetEventId: saved.eventId, occurredAt: "2026-09-16T10:00:00.000Z", ingestedAt: "2026-09-16T10:00:01.000Z" });
  const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [saved, correction] });
  assert.deepEqual(state.activeEvents, []); assert.deepEqual(state.correctedEventIds, [saved.eventId]);
});

test("invalid correction and cross-user event fail closed", () => {
  const missing = event("correction-missing", "CORRECTION", { targetEventId: "missing-event" });
  assert.throws(() => buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [missing] }));
  const foreign = event("foreign-event", "SEARCH", { userId: "foreign-user" });
  assert.throws(() => buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [foreign] }));
});

test("genuine incremental reduction equals independent full replay", () => {
  const first = event("event-a", "SEARCH"); const second = event("event-b", "VISITED", { spotId: "fixture-spot", occurredAt: "2026-09-16T10:00:00.000Z", ingestedAt: "2026-09-16T10:00:01.000Z" });
  const previous = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [first] });
  const incremental = updateDarkRuntimeSyntheticState({ previous, userId, subjectBindingHash, lifecycle: "ACTIVE", delta: [second] });
  const full = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [second, first] });
  assert.equal(verifyDarkRuntimeReplay({ full, incremental }), true); assert.equal(full.stateHash, incremental.stateHash);
});

test("tampered previous state fails recursive verification after outer rehash", () => {
  const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [event("event-a", "SEARCH")] });
  const forged = structuredClone(state); forged.activeEvents[0].journeyId = "forged-journey"; forged.stateHash = contentHash(Object.fromEntries(Object.entries(forged).filter(([key]) => key !== "stateHash")));
  assert.throws(() => verifyDarkRuntimeSyntheticState(forged));
});

test("withdrawal, reset and erasure states contain no personal rebuild material", () => {
  for (const lifecycle of ["CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"]) {
    const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle, events: [event(`event-${lifecycle}`, "SEARCH")] });
    assert.equal(state.subjectBindingHash, null); assert.deepEqual(state.activeEvents, []); assert.deepEqual(state.correctedEventIds, []);
  }
});

test("lifecycle helpers only return canonical plans and never completion", () => {
  for (const action of ["PLAN_CONSENT_WITHDRAWAL", "PLAN_FULL_RESET", "PLAN_ACCOUNT_ERASURE"]) {
    const receipt = evaluateDarkRuntimeCommand(command(action), trust);
    assert.equal(receipt.outcome, "PLAN_ONLY"); assert.equal(receipt.completed, false); assert.ok(receipt.lifecyclePlanHash);
  }
});

test("account erasure plan is bound to the full canonical manifest", () => {
  const receipt = evaluateDarkRuntimeCommand(command("PLAN_ACCOUNT_ERASURE"), trust);
  assert.equal(receipt.persistentWritesCompleted, 0); assert.equal(receipt.reasonCode, "NO_STORE_EXECUTOR_PLAN_ONLY");
});

test("privacy export requires separate legal authority and is minimized", () => {
  const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [event("export-save", "SAVED", { spotId: "fixture-spot" })] });
  assert.throws(() => buildDarkRuntimePrivacyExport({ exportId: "export-invalid", command: command("PREVIEW_PRIVACY_EXPORT"), state, trust }));
  const exported = buildDarkRuntimePrivacyExport({ exportId: "export-valid", command: command("PREVIEW_PRIVACY_EXPORT", "week1-legal"), state, trust });
  assert.equal(exported.normalProductApiAccessible, false); assert.equal(exported.productionAuthorized, false); assert.deepEqual(exported.excludes, ["RAW_TEXT", "SECRETS", "TOKENS", "FOREIGN_USER_DATA", "PRECISE_LOCATION"]);
});

test("privacy export rejects foreign and suppressed state", () => {
  const suppressed = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACCOUNT_ERASURE", events: [] });
  assert.throws(() => buildDarkRuntimePrivacyExport({ exportId: "export-erased", command: command("PREVIEW_PRIVACY_EXPORT", "week1-legal"), state: suppressed, trust }));
});

test("retention template has no duration or fallback and needs a new release", () => {
  assert.equal(DARK_RUNTIME_RETENTION_DECISION_TEMPLATE.status, "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL");
  assert.ok(DARK_RUNTIME_RETENTION_DECISION_TEMPLATE.decisions.every(({ concreteDuration, activationReleaseRequired }) => concreteDuration === null && activationReleaseRequired));
  assert.match(DARK_RUNTIME_RETENTION_DECISION_TEMPLATE_HASH, /^[a-f0-9]{64}$/);
});

test("dark metrics prove no writes and expose operational unknowns honestly", () => {
  const delivered = [event("metric-a", "SEARCH"), event("metric-a", "SEARCH")];
  const state = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: delivered });
  const metrics = deriveDarkRuntimeMetrics({ deliveredEvents: delivered, state });
  assert.equal(metrics.deduplicatedEvents, 1); assert.equal(metrics.productionWrites, 0); assert.equal(metrics.noWriteProof, true); assert.equal(metrics.withdrawalLatency, "NOT_MEASURED_NO_RUNTIME");
});

test("static no-write proof has no persistence or product publisher dependency", () => {
  assert.equal(DARK_RUNTIME_NO_WRITE_PROOF.databaseClientDependency, false); assert.equal(DARK_RUNTIME_NO_WRITE_PROOF.persistencePortDependency, false); assert.equal(DARK_RUNTIME_NO_WRITE_PROOF.productEventConsumerRegistered, false); assert.equal(DARK_RUNTIME_NO_WRITE_PROOF.productionWritesPossible, false);
});

test("commercial fields and raw payloads are rejected at the strict event boundary", () => {
  const valid = event("strict-event", "SAVED", { spotId: "fixture-spot" });
  assert.throws(() => buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [{ ...valid, ownerTier: "PREMIUM" }] }));
  assert.throws(() => buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: [{ ...valid, rawSearchText: "private" }] }));
});
