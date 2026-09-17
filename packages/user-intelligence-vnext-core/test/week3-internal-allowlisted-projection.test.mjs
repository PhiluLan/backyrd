import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_VERSIONS,
  INTERNAL_PROJECTION_ALLOWLIST_POLICY,
  INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH,
  INTERNAL_PROJECTION_FLAGS,
  INTERNAL_PROJECTION_NO_WRITE_PROOF,
  INTERNAL_PROJECTION_RELEASE,
  INTERNAL_PROJECTION_RETENTION_TEMPLATE,
  INTERNAL_PROJECTION_TRUST_ANCHOR,
  buildDarkProjectionPrivacyExport,
  buildInternalProjectionPostDeployEvidence,
  canonicalJson,
  consumeInternalAllowlistedProjection,
  contentHash,
  createDarkProjectionRepositoryTrust,
  createInternalProjectionInvocation,
  createInternalProjectionRepositoryTrust,
  createSyntheticDarkProjectionAuthority,
  createSyntheticInternalProjectionAllowlist,
  incrementDarkProjectionState,
  rebuildDarkProjectionState,
  rehearseInternalAllowlistedProjection,
  resolveInternalProjectionRuntimeMode,
  verifyDarkProjectionParity,
  verifyInternalProjectionAllowlist,
  verifyInternalProjectionPostDeployEvidence,
  withDarkProjectionEventHash,
} from "../dist/index.js";

const userId = "synthetic-internal-week3-user";
const subjectBindingHash = contentHash(userId);
const now = "2026-09-17T12:00:00.000Z";
const consent = {
  contractVersion: CONTRACT_VERSIONS.consentEnvelope,
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "week3-consent-1",
  policyVersion: "week3-consent-policy-1",
  uxVersion: "week3-consent-ux-1",
  effectiveAt: "2026-09-17T08:00:00.000Z",
  captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
};
const request = {
  contractVersion: CONTRACT_VERSIONS.projectionRequest,
  requestId: "week3-request-1",
  actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash, authenticationContextHash: "0".repeat(64), boundBy: "SERVER" },
  decisionId: "week3-decision-1",
  snapshot: null,
  context: { contextContractVersion: "week3-context-1", contextHash: contentHash("morning-solo"), placeTypes: ["cafe"], domainKeys: ["morning", "solo"], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: ["direct-spot-state"], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "week3-internal-read-only-1", killSwitch: false,
};
const darkAuthority = createSyntheticDarkProjectionAuthority({ authorityRecordId: "week3-dark-authority", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", userId, subjectBindingHash, consent, allowedActions: ["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD"] });
const legalAuthority = createSyntheticDarkProjectionAuthority({ authorityRecordId: "week3-legal-authority", authorityKind: "PRIVACY_LEGAL_PROCESS", userId, subjectBindingHash, consent, allowedActions: ["LEGAL_EXPORT"] });
const darkTrust = createDarkProjectionRepositoryTrust([darkAuthority, legalAuthority]);

function event(eventId, eventType, overrides = {}) {
  return withDarkProjectionEventHash({
    contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeEvent,
    eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType,
    journeyId: `journey-${eventId}`, occurredAt: "2026-09-17T09:00:00.000Z", observedAt: "2026-09-17T09:00:01.000Z", ingestedAt: "2026-09-17T09:00:02.000Z",
    authorityRecordId: darkAuthority.authorityRecordId, authorityRecordHash: darkAuthority.authorityHash,
    serverResolutionHash: contentHash(`resolution-${eventId}`), minimizedContextHash: contentHash("morning-solo"),
    rawTextIncluded: false, preciseLocationIncluded: false, commercialDataIncluded: false, productionAuthorized: false,
    ...overrides,
  });
}

const events = [event("save-1", "SAVED", { spotId: "fixture-cafe" }), ...[1, 2, 3].map((n) => event(`visit-${n}`, "VISITED", { spotId: "fixture-cafe", journeyId: `independent-${n}` }))];

function fixture(overrides = {}) {
  const environment = overrides.environment ?? "LOCAL_TEST";
  const lifecycle = overrides.lifecycle ?? "ACTIVE";
  const currentConsent = overrides.consent ?? consent;
  const currentRequest = overrides.request ?? request;
  const provisional = createInternalProjectionInvocation({ invocationId: "week3-invocation", allowlistRecordId: "week3-allowlist", request: currentRequest, consent: currentConsent, environment });
  const allowlist = createSyntheticInternalProjectionAllowlist({ recordId: "week3-allowlist", pseudonymousSubjectId: "synthetic-internal-subject-1", userId: currentRequest.actor.userId, subjectBindingHash: currentRequest.actor.subjectBindingHash, requestHash: provisional.requestHash, consent: currentConsent, lifecycle, environment, status: overrides.status, validFrom: overrides.validFrom, validUntil: overrides.validUntil });
  const internalTrust = createInternalProjectionRepositoryTrust([allowlist], overrides.verifiedAt ?? now);
  return { configuration: environment, invocation: provisional, request: currentRequest, consent: currentConsent, lifecycle, events: overrides.events ?? events, internalTrust, darkProjectionAuthorityRecordId: darkAuthority.authorityRecordId, darkProjectionTrust: darkTrust, now };
}

test("production flags are all false and kill switch is forced off", () => {
  for (const [name, value] of Object.entries(INTERNAL_PROJECTION_FLAGS)) assert.equal(value, name === "killSwitch" ? "FORCED_OFF" : false);
});

test("missing and unknown configuration is OFF", () => {
  for (const value of [undefined, null, true, false, "ON", "PRODUCTION", {}, 1]) assert.equal(resolveInternalProjectionRuntimeMode(value), "OFF");
  assert.equal(resolveInternalProjectionRuntimeMode("LOCAL_TEST"), "LOCAL_TEST");
  assert.equal(resolveInternalProjectionRuntimeMode("PROD_LIKE_TEST"), "PROD_LIKE_TEST");
});

test("OFF does not read authority, events or produce a projection", () => {
  const input = fixture();
  const projection = consumeInternalAllowlistedProjection({ ...input, configuration: undefined, events: [{ rawText: "never parsed" }], internalTrust: { verifiedAt: now, getRelease() { throw new Error("must not read"); } } });
  assert.equal(projection, null);
});

test("allowlisted LOCAL_TEST subject receives only canonical minimized projection", () => {
  const projection = consumeInternalAllowlistedProjection(fixture());
  assert.ok(projection); assert.equal(projection.contractVersion, CONTRACT_VERSIONS.projection);
  assert.equal(projection.boundaries.rankingAuthority, false); assert.equal(projection.boundaries.eligibilityAuthority, false);
  assert.deepEqual(projection.taste, []); assert.deepEqual(projection.practical, []);
  const json = JSON.stringify(projection); for (const forbidden of ["\"ledger\"", "\"rawEvents\"", "\"rawText\"", "\"reviewText\"", "\"preciseLocation\"", "\"ownerTier\"", "\"payment\"", "\"advertising\""]) assert.equal(json.includes(forbidden), false);
});

test("PROD_LIKE_TEST is synthetic and produces the same deterministic projection", () => {
  const local = consumeInternalAllowlistedProjection(fixture());
  const prodLike = consumeInternalAllowlistedProjection(fixture({ environment: "PROD_LIKE_TEST" }));
  assert.equal(local.projectionHash, prodLike.projectionHash);
});

test("denied, NOT_CONFIGURED and expired allowlist fail closed", () => {
  const missing = fixture(); missing.internalTrust = createInternalProjectionRepositoryTrust([]);
  assert.throws(() => consumeInternalAllowlistedProjection(missing));
  assert.throws(() => consumeInternalAllowlistedProjection(fixture({ status: "NOT_CONFIGURED" })));
  assert.throws(() => consumeInternalAllowlistedProjection(fixture({ status: "EXPIRED" })));
  assert.throws(() => consumeInternalAllowlistedProjection(fixture({ validUntil: "2026-09-17T11:00:00.000Z" })));
});

test("purpose, environment, request, consent and release manipulation fail closed", () => {
  for (const change of [
    (i) => ({ ...i, purpose: "OTHER" }),
    (i) => ({ ...i, environment: "PROD_LIKE_TEST" }),
    (i) => ({ ...i, requestHash: contentHash("other") }),
    (i) => ({ ...i, consentHash: contentHash("other") }),
    (i) => ({ ...i, releaseHash: contentHash("other") }),
  ]) {
    const input = fixture(); const changed = change(input.invocation); const body = { ...changed }; delete body.invocationHash; input.invocation = { ...body, invocationHash: contentHash(body) };
    assert.throws(() => consumeInternalAllowlistedProjection(input));
  }
});

test("tampered allowlist and replacement trust root fail after complete rehash", () => {
  const input = fixture(); const original = input.internalTrust.getAllowlistRecord("week3-allowlist");
  const changed = { ...original, subjectBindingHash: contentHash("foreign") }; delete changed.recordHash; changed.recordHash = contentHash(changed);
  input.internalTrust = { ...input.internalTrust, getAllowlistRecord: () => changed };
  assert.throws(() => consumeInternalAllowlistedProjection(input));
  const replacedRelease = { ...INTERNAL_PROJECTION_RELEASE, releaseId: "replacement" };
  const fake = fixture(); fake.internalTrust = { ...fake.internalTrust, getRelease: () => replacedRelease, getTrustAnchor: () => ({ ...INTERNAL_PROJECTION_TRUST_ANCHOR, acceptedReleaseId: "replacement" }) };
  assert.throws(() => consumeInternalAllowlistedProjection(fake));
});

test("foreign user and subject fail closed", () => {
  assert.throws(() => consumeInternalAllowlistedProjection(fixture({ request: { ...request, actor: { ...request.actor, userId: "synthetic-internal-foreign" } } })));
  assert.throws(() => consumeInternalAllowlistedProjection(fixture({ request: { ...request, actor: { ...request.actor, subjectBindingHash: contentHash("foreign") } } })));
  assert.throws(() => createSyntheticInternalProjectionAllowlist({ recordId: "real", pseudonymousSubjectId: "real-person", userId: "real-user", subjectBindingHash, requestHash: contentHash("r"), consent, environment: "LOCAL_TEST" }));
});

test("no consent withdrawal reset and erasure dominate before personal processing", () => {
  const denied = { ...consent, state: "DENIED", consentVersion: "denied", allowedProcessing: ["EXPORT", "ERASURE"], lifecycleEffect: "PURGE_PERSONALIZATION" };
  assert.equal(consumeInternalAllowlistedProjection(fixture({ consent: denied })), null);
  for (const lifecycle of ["CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"]) assert.equal(consumeInternalAllowlistedProjection(fixture({ lifecycle })), null);
});

test("request kill switch dominates and produces no projection", () => {
  assert.equal(consumeInternalAllowlistedProjection(fixture({ request: { ...request, killSwitch: true }, events: [{ rawText: "not parsed" }] })), null);
});

test("OFF to test-on to emergency-off rehearsal has no cache state or writes", () => {
  const proof = rehearseInternalAllowlistedProjection(fixture());
  assert.equal(proof.offProjectionHash, null); assert.ok(proof.testOnProjectionHash); assert.equal(proof.emergencyOffProjectionHash, null); assert.equal(proof.postKillSwitchProjectionHash, null);
  assert.equal(proof.cacheEntriesAfterEmergencyOff, 0); assert.equal(proof.persistentWrites, 0); assert.equal(proof.networkCalls, 0); assert.equal(proof.productOutputs, 0);
});

test("correction removes only the corrected active event", () => {
  const corrected = event("correction-save", "CORRECTION", { targetEventId: "save-1", occurredAt: "2026-09-17T10:00:00.000Z", observedAt: "2026-09-17T10:00:01.000Z", ingestedAt: "2026-09-17T10:00:02.000Z" });
  const projection = consumeInternalAllowlistedProjection(fixture({ events: [events[0], corrected] }));
  assert.equal(projection.status, "NEUTRAL"); assert.deepEqual(projection.directSpot, []);
});

test("full and genuine incremental state remain byte-identical with dedupe and late delivery", () => {
  const fullEvents = [events[2], events[0], events[1], events[3], events[0]];
  const full = rebuildDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events: fullEvents, trust: darkTrust });
  const first = rebuildDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events: [events[0], events[1]], trust: darkTrust });
  const incremental = incrementDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", previous: first, delta: [events[3], events[2], events[0]], trust: darkTrust });
  assert.equal(canonicalJson(full), canonicalJson(incremental)); assert.equal(verifyDarkProjectionParity(full, incremental, darkAuthority), true);
});

test("deterministic replay is byte-identical", () => {
  const first = consumeInternalAllowlistedProjection(fixture()); const second = consumeInternalAllowlistedProjection(fixture());
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test("privacy export remains behind separate legal authority", () => {
  const state = rebuildDarkProjectionState({ authorityRecordId: darkAuthority.authorityRecordId, userId, subjectBindingHash, consent, lifecycle: "ACTIVE", events, trust: darkTrust });
  assert.throws(() => buildDarkProjectionPrivacyExport({ exportId: "week3-export", state, consent, authorityRecordId: darkAuthority.authorityRecordId, sourceAuthority: darkAuthority, trust: darkTrust }));
  const legal = buildDarkProjectionPrivacyExport({ exportId: "week3-export", state, consent, authorityRecordId: legalAuthority.authorityRecordId, sourceAuthority: darkAuthority, trust: darkTrust });
  assert.equal(legal.normalProductApiAccessible, false); assert.equal(JSON.stringify(consumeInternalAllowlistedProjection(fixture())).includes(legal.exportHash), false);
});

test("retention remains NOT_CONFIGURED with no duration fallback", () => {
  assert.equal(INTERNAL_PROJECTION_RETENTION_TEMPLATE.status, "NOT_CONFIGURED_PENDING_FOUNDER_CTO_LEGAL");
  assert.ok(INTERNAL_PROJECTION_RETENTION_TEMPLATE.classes.every((entry) => entry.duration === null));
  assert.deepEqual(INTERNAL_PROJECTION_RETENTION_TEMPLATE.requiredApprovals, ["FOUNDER", "CTO", "LEGAL"]);
});

test("no-write proof closes persistence network product output and privacy bridge", () => {
  assert.equal(INTERNAL_PROJECTION_NO_WRITE_PROOF.databaseClientDependency, false); assert.equal(INTERNAL_PROJECTION_NO_WRITE_PROOF.persistencePortDependency, false);
  assert.equal(INTERNAL_PROJECTION_NO_WRITE_PROOF.networkClientDependency, false); assert.equal(INTERNAL_PROJECTION_NO_WRITE_PROOF.productConsumerRegistered, false);
  assert.equal(INTERNAL_PROJECTION_NO_WRITE_PROOF.writebackPortRegistered, false); assert.equal(INTERNAL_PROJECTION_NO_WRITE_PROOF.privacyExportReachableFromRuntime, false);
});

test("post-deploy evidence is hash-bound and honestly not executed", () => {
  const evidence = buildInternalProjectionPostDeployEvidence(consent);
  assert.equal(evidence.canonicalMainSha, "1d689e38f12edee2821cc4f4e3d5bc5ee8ccf48b"); assert.equal(evidence.artifactManifestHash, INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH);
  assert.equal(evidence.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"); assert.equal(evidence.deploymentExecuted, false); assert.equal(evidence.executionAuthorized, false);
  assert.doesNotThrow(() => verifyInternalProjectionPostDeployEvidence(evidence, consent));
  const changed = { ...evidence, artifactManifestHash: contentHash("other") }; delete changed.evidenceHash; changed.evidenceHash = contentHash(changed);
  assert.throws(() => verifyInternalProjectionPostDeployEvidence(changed, consent));
});

test("release binds Week-2, allowlist, no-write and canonical base", () => {
  assert.equal(INTERNAL_PROJECTION_RELEASE.week2ReleaseHash.length, 64); assert.equal(INTERNAL_PROJECTION_RELEASE.allowlistPolicyHash, INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash);
  assert.equal(INTERNAL_PROJECTION_TRUST_ANCHOR.acceptedReleaseHash, INTERNAL_PROJECTION_RELEASE.releaseHash);
  assert.equal(INTERNAL_PROJECTION_RELEASE.canonicalBaseSha, "1d689e38f12edee2821cc4f4e3d5bc5ee8ccf48b");
});

test("allowlist verifier accepts exact complete binding", () => {
  const input = fixture();
  const record = verifyInternalProjectionAllowlist({ invocation: input.invocation, request: input.request, consent: input.consent, lifecycle: input.lifecycle, trust: input.internalTrust });
  assert.equal(record.status, "ACTIVE"); assert.equal(record.productionAuthorized, false);
});

test("allowlist, trust and invocation runtime schemas reject unknown commercial fields", () => {
  const input = fixture(); const record = input.internalTrust.getAllowlistRecord("week3-allowlist");
  assert.throws(() => verifyInternalProjectionAllowlist({ invocation: { ...input.invocation, ownerTier: "premium" }, request, consent, lifecycle: "ACTIVE", trust: input.internalTrust }));
  const body = { ...record, payment: true };
  assert.throws(() => verifyInternalProjectionAllowlist({ invocation: input.invocation, request, consent, lifecycle: "ACTIVE", trust: { ...input.internalTrust, getAllowlistRecord: () => body } }));
});

test("runtime consumer cannot expose legal export, state, event or handoff APIs", () => {
  const projection = consumeInternalAllowlistedProjection(fixture());
  assert.deepEqual(Object.keys(projection).sort(), ["boundaries", "budgets", "contractVersion", "decisionId", "directSpot", "domainSufficiency", "knowledgeLevel", "manifest", "neutralReason", "practical", "projectionHash", "projectionId", "snapshot", "status", "subjectBindingHash", "suppression", "taste", "technicalMetadata"].sort());
});

test("public API exports no stateful Week-3 ingestion or writeback port", async () => {
  const api = await import("../dist/index.js");
  assert.equal(api.persistInternalProjection, undefined); assert.equal(api.writeBackInternalProjection, undefined); assert.equal(api.ingestProductionUserEvent, undefined);
  assert.equal(typeof api.consumeInternalAllowlistedProjection, "function");
});
