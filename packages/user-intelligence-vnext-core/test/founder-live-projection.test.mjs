import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_VERSIONS,
  FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH,
  FOUNDER_LIVE_NO_WRITE_PROOF,
  FOUNDER_LIVE_PIPELINE_TOPOLOGY,
  FOUNDER_LIVE_PROJECTION_FLAGS,
  FOUNDER_LIVE_PROJECTION_RELEASE,
  FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR,
  FOUNDER_LIVE_RETENTION_TEMPLATE,
  FOUNDER_LIVE_SUBJECT_SLOT,
  buildDarkProjectionPrivacyExport,
  buildFounderLivePostDeployEvidence,
  canonicalJson,
  consumeFounderLiveProjection,
  contentHash,
  createDarkProjectionRepositoryTrust,
  createFounderLiveProjectionInvocation,
  createFounderLiveRepositoryTrust,
  createSyntheticDarkProjectionAuthority,
  createSyntheticFounderLiveSubjectAuthority,
  incrementDarkProjectionState,
  rebuildDarkProjectionState,
  rehearseFounderLiveProjection,
  resolveFounderLiveRuntimeMode,
  verifyDarkProjectionParity,
  verifyFounderLivePostDeployEvidence,
  withDarkProjectionEventHash,
} from "../dist/index.js";

const userId = "synthetic-founder-live-user";
const subjectBindingHash = contentHash(userId);
const sessionBindingHash = contentHash("founder-live-session-1");
const now = "2026-09-17T12:00:00.000Z";
const consent = {
  contractVersion: CONTRACT_VERSIONS.consentEnvelope,
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "founder-live-consent-1",
  policyVersion: "founder-live-consent-policy-1",
  uxVersion: "founder-live-consent-ux-1",
  effectiveAt: "2026-09-17T08:00:00.000Z",
  captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
};
const request = {
  contractVersion: CONTRACT_VERSIONS.projectionRequest,
  requestId: "founder-live-request-1",
  actor: {
    kind: "AUTHENTICATED_USER",
    userId,
    subjectBindingHash,
    authenticationContextHash: contentHash("server-auth-context"),
    boundBy: "SERVER",
  },
  decisionId: "founder-live-decision-1",
  snapshot: null,
  context: {
    contextContractVersion: "founder-live-context-1",
    contextHash: contentHash("morning-solo"),
    placeTypes: ["cafe"],
    domainKeys: ["morning", "solo"],
    rawLocationIncluded: false,
    socialDetailsIncluded: false,
  },
  requestedDomains: ["direct-spot-state"],
  budgets: { maxItems: 16, maxBytes: 8192 },
  projectionPolicyVersion: "founder-live-read-only-1",
  killSwitch: false,
};
const darkAuthority = createSyntheticDarkProjectionAuthority({
  authorityRecordId: "founder-live-dark-authority",
  authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR",
  userId,
  subjectBindingHash,
  consent,
  allowedActions: ["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD"],
});
const legalAuthority = createSyntheticDarkProjectionAuthority({
  authorityRecordId: "founder-live-legal-authority",
  authorityKind: "PRIVACY_LEGAL_PROCESS",
  userId,
  subjectBindingHash,
  consent,
  allowedActions: ["LEGAL_EXPORT"],
});
const darkTrust = createDarkProjectionRepositoryTrust([darkAuthority, legalAuthority]);

function event(eventId, eventType, overrides = {}) {
  return withDarkProjectionEventHash({
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeEvent,
    eventId,
    idempotencyKey: `idem-${eventId}`,
    userId,
    subjectBindingHash,
    eventType,
    journeyId: `journey-${eventId}`,
    occurredAt: "2026-09-17T09:00:00.000Z",
    observedAt: "2026-09-17T09:00:01.000Z",
    ingestedAt: "2026-09-17T09:00:02.000Z",
    authorityRecordId: darkAuthority.authorityRecordId,
    authorityRecordHash: darkAuthority.authorityHash,
    serverResolutionHash: contentHash(`resolution-${eventId}`),
    minimizedContextHash: contentHash("morning-solo"),
    rawTextIncluded: false,
    preciseLocationIncluded: false,
    commercialDataIncluded: false,
    productionAuthorized: false,
    ...overrides,
  });
}

const events = [
  event("save-1", "SAVED", { spotId: "fixture-cafe" }),
  event("visit-1", "VISITED", { spotId: "fixture-cafe", journeyId: "independent-1" }),
  event("visit-2", "VISITED", { spotId: "fixture-cafe", journeyId: "independent-2" }),
  event("visit-3", "VISITED", { spotId: "fixture-cafe", journeyId: "independent-3" }),
];

function fixture(overrides = {}) {
  const environment = overrides.environment ?? "LOCAL_TEST";
  const lifecycle = overrides.lifecycle ?? "ACTIVE";
  const currentConsent = overrides.consent ?? consent;
  const currentRequest = overrides.request ?? request;
  const currentSession = overrides.currentSessionBindingHash ?? sessionBindingHash;
  const authorityRecordId = "founder-live-subject-authority";
  const invocation = createFounderLiveProjectionInvocation({
    invocationId: "founder-live-invocation",
    authorityRecordId,
    request: currentRequest,
    consent: currentConsent,
    environment,
    sessionBindingHash,
  });
  const authority = createSyntheticFounderLiveSubjectAuthority({
    authorityRecordId,
    pseudonymousSubjectId: "synthetic-founder-live-subject",
    userId: currentRequest.actor.userId,
    subjectBindingHash: currentRequest.actor.subjectBindingHash,
    sessionBindingHash,
    consent: currentConsent,
    requestHash: invocation.requestHash,
    environment,
    lifecycle,
  });
  return {
    configuration: Object.hasOwn(overrides, "configuration") ? overrides.configuration : environment,
    invocation: overrides.invocation ?? invocation,
    request: currentRequest,
    consent: currentConsent,
    lifecycle,
    currentSessionBindingHash: currentSession,
    syntheticEvents: overrides.events ?? events,
    trust: overrides.trust ?? createFounderLiveRepositoryTrust([authority], now),
    darkProjectionAuthorityRecordId: darkAuthority.authorityRecordId,
    darkProjectionTrust: darkTrust,
    now,
    ...(Object.hasOwn(overrides, "clientUserMetadata") ? { clientUserMetadata: overrides.clientUserMetadata } : {}),
  };
}

test("real founder slot is empty and requires a separate explicit release", () => {
  assert.equal(FOUNDER_LIVE_SUBJECT_SLOT.status, "NOT_CONFIGURED_PENDING_EXPLICIT_RELEASE");
  assert.equal(FOUNDER_LIVE_SUBJECT_SLOT.configuredMemberCount, 0);
  assert.equal(FOUNDER_LIVE_SUBJECT_SLOT.subjectIdentifierPresent, false);
  assert.equal(FOUNDER_LIVE_SUBJECT_SLOT.subjectIdentifierHash, null);
  assert.equal(FOUNDER_LIVE_SUBJECT_SLOT.clientUserMetadataAuthorityAccepted, false);
  assert.equal(FOUNDER_LIVE_PROJECTION_RELEASE.liveFounderSlotConfigured, false);
});

test("all shipped capabilities are off and kill switch is forced off", () => {
  for (const [name, value] of Object.entries(FOUNDER_LIVE_PROJECTION_FLAGS)) {
    assert.equal(value, name === "killSwitch" ? "FORCED_OFF" : false, name);
  }
  assert.equal(FOUNDER_LIVE_PROJECTION_RELEASE.productionAuthorized, false);
  assert.equal(FOUNDER_LIVE_PROJECTION_RELEASE.runtimeActivated, false);
});

test("only explicit synthetic test modes resolve on", () => {
  for (const value of [undefined, null, false, true, "PRODUCTION", "ON", {}, 1]) assert.equal(resolveFounderLiveRuntimeMode(value), "OFF");
  assert.equal(resolveFounderLiveRuntimeMode("LOCAL_TEST"), "LOCAL_TEST");
  assert.equal(resolveFounderLiveRuntimeMode("PROD_LIKE_TEST"), "PROD_LIKE_TEST");
  assert.equal(resolveFounderLiveRuntimeMode("EMERGENCY_OFF"), "EMERGENCY_OFF");
});

test("synthetic allowlisted subject receives only canonical minimized RelevantUserProjection", () => {
  const outcome = consumeFounderLiveProjection(fixture());
  assert.equal(outcome.status, "AVAILABLE");
  assert.equal(outcome.projection.contractVersion, CONTRACT_VERSIONS.projection);
  assert.equal(outcome.projection.boundaries.rankingAuthority, false);
  assert.equal(outcome.projection.boundaries.eligibilityAuthority, false);
  assert.equal(outcome.rankingAuthorized, false);
  assert.equal(outcome.eligibilityAuthorized, false);
  const json = JSON.stringify(outcome);
  for (const forbidden of ["\"rawEvents\":", "\"rawText\":", "\"reviewText\":", "\"preciseLocation\":", "\"ownerTier\":", "\"payment\":", "\"advertising\":", "\"user_metadata\":"]) assert.equal(json.includes(forbidden), false);
});

test("client user_metadata can never grant subject authority", () => {
  const outcome = consumeFounderLiveProjection(fixture({ clientUserMetadata: { founder: true, role: "founder" } }));
  assert.equal(outcome.status, "UNAVAILABLE");
  assert.equal(outcome.reasonCode, "AUTHORITY_DENIED");
  assert.equal(outcome.personalDataIncluded, false);
});

test("real or non-pseudonymous subjects cannot use the synthetic authority helper", () => {
  assert.throws(() => createSyntheticFounderLiveSubjectAuthority({
    authorityRecordId: "real-authority",
    pseudonymousSubjectId: "real-founder",
    userId: "real-user",
    subjectBindingHash,
    sessionBindingHash,
    consent,
    requestHash: contentHash("unused-real-request"),
    environment: "LOCAL_TEST",
  }));
});

test("consent withdrawal reset and erasure dominate before projection", () => {
  const denied = { ...consent, state: "DENIED", consentVersion: "denied", allowedProcessing: ["EXPORT", "ERASURE"], lifecycleEffect: "PURGE_PERSONALIZATION" };
  const noConsent = consumeFounderLiveProjection(fixture({ consent: denied }));
  assert.equal(noConsent.status, "UNAVAILABLE"); assert.equal(noConsent.reasonCode, "NO_CONSENT");
  for (const lifecycle of ["NO_CONSENT", "CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"]) {
    const outcome = consumeFounderLiveProjection(fixture({ lifecycle }));
    assert.equal(outcome.status, "UNAVAILABLE"); assert.equal(outcome.reasonCode, "LIFECYCLE_BLOCKED");
    assert.equal(JSON.stringify(outcome).includes(userId), false);
  }
});

test("session and subject switches fail closed with non-personal stable codes", () => {
  const session = consumeFounderLiveProjection(fixture({ currentSessionBindingHash: contentHash("new-session") }));
  assert.equal(session.status, "UNAVAILABLE"); assert.equal(session.reasonCode, "SESSION_CHANGED");
  const foreignRequest = { ...request, actor: { ...request.actor, userId: "synthetic-founder-foreign" } };
  const input = fixture(); input.request = foreignRequest;
  const foreign = consumeFounderLiveProjection(input);
  assert.equal(foreign.status, "UNAVAILABLE"); assert.equal(foreign.reasonCode, "AUTHORITY_DENIED");
  assert.equal(JSON.stringify(foreign).includes("foreign"), false);
});

test("request kill switch and emergency off prevent all projection work", () => {
  const killed = consumeFounderLiveProjection(fixture({ request: { ...request, killSwitch: true }, events: [{ rawText: "must-not-parse" }] }));
  assert.equal(killed.status, "UNAVAILABLE"); assert.equal(killed.reasonCode, "KILL_SWITCH");
  const emergency = consumeFounderLiveProjection(fixture({ configuration: "EMERGENCY_OFF", events: [{ rawText: "must-not-parse" }] }));
  assert.equal(emergency.status, "UNAVAILABLE"); assert.equal(emergency.reasonCode, "RUNTIME_OFF");
});

test("purpose release hash environment request and invocation manipulation fail closed", () => {
  for (const mutate of [
    (value) => ({ ...value, purpose: "OTHER" }),
    (value) => ({ ...value, releaseHash: contentHash("replacement") }),
    (value) => ({ ...value, environment: "PROD_LIKE_TEST" }),
    (value) => ({ ...value, requestHash: contentHash("replacement") }),
    (value) => ({ ...value, consentHash: contentHash("replacement") }),
    (value) => ({ ...value, productionAuthorized: true }),
  ]) {
    const input = fixture();
    const changed = mutate(input.invocation);
    delete changed.invocationHash;
    input.invocation = { ...changed, invocationHash: contentHash(changed) };
    const outcome = consumeFounderLiveProjection(input);
    assert.equal(outcome.status, "UNAVAILABLE"); assert.equal(outcome.reasonCode, "AUTHORITY_DENIED");
  }
});

test("client-selected projection policy cannot reuse an accepted server subject authority", () => {
  const input = fixture();
  const changedRequest = { ...request, projectionPolicyVersion: "client-selected-policy" };
  input.request = changedRequest;
  input.invocation = createFounderLiveProjectionInvocation({
    invocationId: "client-selected-policy-invocation",
    authorityRecordId: "founder-live-subject-authority",
    request: changedRequest,
    consent,
    environment: "LOCAL_TEST",
    sessionBindingHash,
  });
  const outcome = consumeFounderLiveProjection(input);
  assert.equal(outcome.status, "UNAVAILABLE");
  assert.equal(outcome.reasonCode, "AUTHORITY_DENIED");
});

test("foreign replacement release slot anchor and rehashed authority fail closed", () => {
  const input = fixture();
  const original = input.trust.getSubjectAuthority("founder-live-subject-authority");
  const changed = { ...original, subjectBindingHash: contentHash("foreign") };
  delete changed.authorityHash; changed.authorityHash = contentHash(changed);
  input.trust = { ...input.trust, getSubjectAuthority: () => changed };
  assert.equal(consumeFounderLiveProjection(input).status, "UNAVAILABLE");
  for (const key of ["getRelease", "getTrustAnchor", "getFounderSlot"]) {
    const replacement = fixture(); replacement.trust = { ...replacement.trust, [key]: () => ({ replacement: true }) };
    const outcome = consumeFounderLiveProjection(replacement);
    assert.equal(outcome.status, "UNAVAILABLE"); assert.equal(outcome.reasonCode, "AUTHORITY_DENIED");
  }
});

test("correction removes only its active target and replay remains deterministic", () => {
  const correction = event("correction-save", "CORRECTION", {
    targetEventId: "save-1",
    occurredAt: "2026-09-17T10:00:00.000Z",
    observedAt: "2026-09-17T10:00:01.000Z",
    ingestedAt: "2026-09-17T10:00:02.000Z",
  });
  const first = consumeFounderLiveProjection(fixture({ events: [events[0], correction] }));
  const second = consumeFounderLiveProjection(fixture({ events: [events[0], correction] }));
  assert.equal(first.status, "AVAILABLE"); assert.deepEqual(first.projection.directSpot, []);
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test("full and genuine incremental paths remain byte-identical with dedupe and late delivery", () => {
  const all = [events[2], events[0], events[1], events[3], events[0]];
  const full = rebuildDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events: all, trust: darkTrust });
  const initial = rebuildDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events: [events[0], events[1]], trust: darkTrust });
  const incremental = incrementDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", previous: initial, delta: [events[3], events[2], events[0]], trust: darkTrust });
  assert.equal(canonicalJson(full), canonicalJson(incremental));
  assert.equal(verifyDarkProjectionParity(full, incremental, darkAuthority), true);
});

test("privacy legal export remains unreachable from founder projection and needs separate authority", () => {
  const state = rebuildDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events, trust: darkTrust });
  assert.throws(() => buildDarkProjectionPrivacyExport({ exportId: "founder-export", state, consent, authorityRecordId: darkAuthority.authorityRecordId, sourceAuthority: darkAuthority, trust: darkTrust }));
  const legal = buildDarkProjectionPrivacyExport({ exportId: "founder-export", state, consent, authorityRecordId: legalAuthority.authorityRecordId, sourceAuthority: darkAuthority, trust: darkTrust });
  assert.equal(legal.normalProductApiAccessible, false);
  assert.equal(JSON.stringify(consumeFounderLiveProjection(fixture())).includes(legal.exportHash), false);
  assert.equal(FOUNDER_LIVE_NO_WRITE_PROOF.privacyExportReachableFromDecisionOrMobile, false);
});

test("pipeline is prepared but learning persistence writeback and raw Decision input remain disconnected", () => {
  assert.deepEqual(FOUNDER_LIVE_PIPELINE_TOPOLOGY.stages, ["MOBILE_EVENT", "CONSENT_PURPOSE_GATE", "APPEND_ONLY_EVIDENCE", "DEDUPE_CORRECTIONS", "FULL_INCREMENTAL_PROJECTION", "RELEVANT_USER_PROJECTION", "DECISION_CONSUMER"]);
  assert.equal(FOUNDER_LIVE_PIPELINE_TOPOLOGY.mobileEventAdapterRegistered, false);
  assert.equal(FOUNDER_LIVE_PIPELINE_TOPOLOGY.evidencePersistenceRegistered, false);
  assert.equal(FOUNDER_LIVE_PIPELINE_TOPOLOGY.decisionConsumesRawEvents, false);
  assert.equal(FOUNDER_LIVE_PIPELINE_TOPOLOGY.decisionPort, CONTRACT_VERSIONS.projection);
});

test("OFF to TEST-ON to emergency-OFF rehearsal proves zero writes network and product outputs", () => {
  const input = fixture(); delete input.configuration;
  const proof = rehearseFounderLiveProjection(input);
  assert.equal(proof.offReason, "RUNTIME_OFF"); assert.ok(proof.testOnProjectionHash);
  assert.equal(proof.emergencyOffReason, "RUNTIME_OFF"); assert.equal(proof.postEmergencyOffReason, "RUNTIME_OFF");
  assert.equal(proof.databaseWrites, 0); assert.equal(proof.networkCalls, 0);
  assert.equal(proof.persistenceWrites, 0); assert.equal(proof.productOutputs, 0); assert.equal(proof.cacheEntriesAfterEmergencyOff, 0);
});

test("retention has no duration and requires Founder CTO Legal approval", () => {
  assert.equal(FOUNDER_LIVE_RETENTION_TEMPLATE.status, "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL");
  assert.ok(FOUNDER_LIVE_RETENTION_TEMPLATE.classes.every((entry) => entry.duration === null));
  assert.deepEqual(FOUNDER_LIVE_RETENTION_TEMPLATE.requiredApprovals, ["FOUNDER", "CTO", "LEGAL"]);
});

test("post-deploy evidence remains not executed and recursively bound", () => {
  const evidence = buildFounderLivePostDeployEvidence();
  assert.equal(evidence.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY");
  assert.equal(evidence.deploymentExecuted, false); assert.equal(evidence.founderSubjectConfigured, false);
  assert.equal(evidence.executionAuthorized, false); assert.equal(evidence.artifactManifestHash, FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH);
  assert.doesNotThrow(() => verifyFounderLivePostDeployEvidence(evidence));
  const changed = { ...evidence, founderSubjectConfigured: true }; delete changed.evidenceHash; changed.evidenceHash = contentHash(changed);
  assert.throws(() => verifyFounderLivePostDeployEvidence(changed));
});

test("unavailable outcomes never reveal subject request authority or lifecycle details", () => {
  for (const input of [fixture({ configuration: null }), fixture({ currentSessionBindingHash: contentHash("changed") }), fixture({ lifecycle: "ACCOUNT_ERASURE" })]) {
    const outcome = consumeFounderLiveProjection(input);
    assert.equal(outcome.status, "UNAVAILABLE");
    const serialized = JSON.stringify(outcome);
    for (const forbidden of [userId, subjectBindingHash, sessionBindingHash, "ACCOUNT_ERASURE", "founder-live-subject-authority"]) assert.equal(serialized.includes(forbidden), false);
  }
});
