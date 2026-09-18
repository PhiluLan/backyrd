import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CONTRACT_VERSIONS, FOUNDER_LIVE_UUID_AUTHORITY_RELEASE, FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR,
  FOUNDER_LIVE_UUID_FLAGS, FOUNDER_LIVE_UUID_NO_WRITE_PROOF, FOUNDER_LIVE_UUID_RETENTION_TEMPLATE,
  authorizeFounderLivePrivacyLegalAction, authorizeFounderLiveUuidSession, buildRelevantUserProjection,
  canonicalJson, contentHash, createFounderLivePrivateUuidProvider, createFounderLiveUuidProjectionHandoff,
} from "../dist/index.js";

const now = "2026-09-18T12:00:00.000Z";
const generatedUuid = (label) => {
  const hash = contentHash(label);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const users = [generatedUuid("private-member-alpha"), generatedUuid("private-member-beta")];
const subject = (userId) => contentHash({ userId, scope: "founder-live" });
const consent = {
  contractVersion: CONTRACT_VERSIONS.consentEnvelope, purpose: "PERSONALIZED_RECOMMENDATIONS", state: "GRANTED",
  consentVersion: "private-consent-1", policyVersion: "private-policy-1", uxVersion: "private-ux-1",
  effectiveAt: "2026-09-18T08:00:00.000Z", captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"], lifecycleEffect: "ALLOW",
};
const sessionHash = (userId) => contentHash({ userId, session: "server" });
const makeRecord = (userId, index, overrides = {}) => {
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveUuidPrivateRecord, recordId: `private-record-${index}`, authUserId: userId,
    status: "ACTIVE", purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION", consentHash: contentHash(consent), consentState: "GRANTED",
    lifecycle: "ACTIVE", acceptedSessionBindingHash: sessionHash(userId), subjectBindingHash: subject(userId),
    cohortVersion: "FOUNDER_LIVE_TWO_MEMBER_COHORT_V1", validFrom: "2026-09-18T00:00:00.000Z", validUntil: "2027-09-18T00:00:00.000Z",
    issuer: "BACKYRD_PRIVATE_IDENTITY_AUTHORITY", ...overrides,
  };
  return { ...body, recordHash: contentHash(body) };
};
const records = users.map((userId, index) => makeRecord(userId, index + 1));
const envelopeBody = {
  contractVersion: CONTRACT_VERSIONS.founderLiveUuidPrivateStoreEnvelope, providerId: "BACKYRD_PRIVATE_FOUNDER_UUID_STORE",
  cohortVersion: "FOUNDER_LIVE_TWO_MEMBER_COHORT_V1", configuredMemberCount: 2, records,
  productionAuthorized: false, runtimeActivated: false,
};
const envelope = { ...envelopeBody, envelopeHash: contentHash(envelopeBody) };
const provider = () => createFounderLivePrivateUuidProvider(() => canonicalJson(envelope));
const trust = (overrides = {}) => ({
  verifiedAt: now,
  getRelease: (id) => id === FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseId ? FOUNDER_LIVE_UUID_AUTHORITY_RELEASE : null,
  getTrustAnchor: (id) => id === FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR.anchorId ? FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR : null,
  acceptsPrivateProviderEnvelopeHash: (hash) => hash === envelope.envelopeHash,
  acceptsPrivateRecordHash: (hash) => records.some((item) => item.recordHash === hash),
  acceptsPrivacyLegalAuthorityHash: () => false, ...overrides,
});
const request = (userId) => ({
  contractVersion: CONTRACT_VERSIONS.projectionRequest, requestId: "private-request-1",
  actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash: subject(userId), authenticationContextHash: contentHash({ userId, auth: "server" }), boundBy: "SERVER" },
  decisionId: "private-decision-1", snapshot: null,
  context: { contextContractVersion: "private-context-1", contextHash: contentHash("context"), placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: [], budgets: { maxItems: 8, maxBytes: 4096 }, projectionPolicyVersion: "private-read-only-1", killSwitch: false,
});
const session = (userId, overrides = {}) => ({
  contractVersion: CONTRACT_VERSIONS.founderLiveUuidServerSession, authUserId: userId, sessionBindingHash: sessionHash(userId),
  authenticationContextHash: contentHash({ userId, auth: "server" }), issuer: "SUPABASE_AUTH_SERVER", authenticationMethod: "SERVER_VERIFIED_JWT",
  authenticated: true, anonymous: false, blocked: false, deleted: false, issuedAt: "2026-09-18T10:00:00.000Z",
  expiresAt: "2026-09-18T14:00:00.000Z", verifiedAt: now, ...overrides,
});
const authorize = (userId = users[0], overrides = {}) => authorizeFounderLiveUuidSession({
  mode: "PROD_LIKE_TEST", session: session(userId), request: request(userId), consent, lifecycle: "ACTIVE", provider: provider(), trust: trust(), ...overrides,
});

test("release binds exactly two private UUID members without publishing identifiers", () => {
  assert.equal(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.expectedMemberCount, 2);
  assert.equal(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.identifiersPersistedInRepository, false);
  assert.equal(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.emailAuthorityAccepted, false);
  assert.equal(FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.userMetadataAuthorityAccepted, false);
  for (const [key, value] of Object.entries(FOUNDER_LIVE_UUID_FLAGS)) assert.equal(value, key === "killSwitch" ? "FORCED_OFF" : false);
});

test("both private members receive only read-only capabilities without identifiers", () => {
  for (const userId of users) {
    const result = authorize(userId);
    assert.equal(result.status, "AUTHORIZED_READ_ONLY");
    assert.equal(result.projectionReadAuthorized, true);
    for (const key of ["learningAuthorized", "persistenceAuthorized", "writebackAuthorized", "rankingAuthorized", "eligibilityAuthorized", "shadowTrafficAuthorized", "productionAuthorized"]) assert.equal(result[key], false);
    assert.equal(JSON.stringify(result).includes(userId), false);
  }
});

test("unknown spoofed blocked deleted expired and anonymous sessions fail closed", () => {
  assert.equal(authorize(generatedUuid("unknown-member")).status, "DENIED");
  assert.equal(authorize(users[0], { request: request(users[1]) }).status, "DENIED");
  assert.equal(authorize(users[0], { session: session(users[0], { blocked: true }) }).status, "DENIED");
  assert.equal(authorize(users[0], { session: session(users[0], { deleted: true }) }).status, "DENIED");
  assert.equal(authorize(users[0], { session: session(users[0], { expiresAt: now }) }).status, "DENIED");
  assert.equal(authorize(users[0], { session: { ...session(users[0]), anonymous: true } }).status, "DENIED");
});

test("email and user metadata claims cannot cross the strict server boundary", () => {
  assert.equal(authorize(users[0], { session: { ...session(users[0]), email: "redacted" } }).status, "DENIED");
  assert.equal(authorize(users[0], { session: { ...session(users[0]), user_metadata: { role: "founder" } } }).status, "DENIED");
});

test("duplicate records and rehashed replacement authority fail closed", () => {
  const duplicateBody = { ...envelopeBody, records: [records[0], records[0]] };
  assert.throws(() => createFounderLivePrivateUuidProvider(() => canonicalJson({ ...duplicateBody, envelopeHash: contentHash(duplicateBody) })), /unique/);
  const forged = makeRecord(users[0], 1, { subjectBindingHash: contentHash("forged") });
  const forgedBody = { ...envelopeBody, records: [forged, records[1]] };
  const forgedEnvelope = { ...forgedBody, envelopeHash: contentHash(forgedBody) };
  const forgedProvider = createFounderLivePrivateUuidProvider(() => canonicalJson(forgedEnvelope));
  assert.equal(authorize(users[0], { provider: forgedProvider }).status, "DENIED");
  assert.equal(authorize(users[0], { provider: forgedProvider, trust: trust({ acceptsPrivateProviderEnvelopeHash: () => true }) }).status, "DENIED");
});

test("consent lifecycle and emergency OFF dominate before projection", () => {
  assert.equal(authorize(users[0], { consent: { ...consent, state: "WITHDRAWN", lifecycleEffect: "PURGE_PERSONALIZATION" } }).status, "DENIED");
  for (const lifecycle of ["CONSENT_WITHDRAWN", "FULL_RESET", "ACCOUNT_ERASURE"]) assert.equal(authorize(users[0], { lifecycle }).status, "DENIED");
  assert.equal(authorize(users[0], { mode: "EMERGENCY_OFF" }).status, "DENIED");
  assert.equal(authorize(users[0], { mode: "PRODUCTION" }).status, "DENIED");
});

test("provider restart is deterministic and exposes no enumeration", () => {
  assert.deepEqual(authorize(users[0], { provider: provider() }), authorize(users[0], { provider: provider() }));
  assert.equal("records" in provider(), false);
});

test("canonical projection handoff remains minimized and authority-free", () => {
  const projection = buildRelevantUserProjection({
    request: request(users[0]), consent, manifest: { manifestId: "private-manifest", manifestHash: contentHash("private-manifest") }, snapshot: null,
    content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } },
    identity: { projectionId: "private-neutral-projection" }, clock: { now },
  });
  const handoff = createFounderLiveUuidProjectionHandoff({ capability: authorize(), request: request(users[0]), projection });
  assert.equal(handoff.readOnly, true);
  assert.equal(handoff.projection.status, "NEUTRAL");
  const serialized = JSON.stringify(handoff);
  for (const forbidden of [...users, "ownerTier", "payment", "advertising", "user_metadata"]) assert.equal(serialized.includes(forbidden), false);
  assert.equal(handoff.projection.boundaries.rawEventsIncluded, false);
  assert.equal(handoff.projection.boundaries.reviewTextIncluded, false);
});

test("privacy legal authority remains separate from projection authority", () => {
  const body = { contractVersion: CONTRACT_VERSIONS.founderLiveUuidPrivacyLegalAuthority, authorityRecordId: "privacy-record", subjectBindingHash: subject(users[0]), action: "ACCOUNT_ERASURE", issuer: "BACKYRD_PRIVACY_LEGAL_AUTHORITY", validFrom: "2026-09-18T00:00:00.000Z", validUntil: "2027-09-18T00:00:00.000Z" };
  const authority = { ...body, authorityHash: contentHash(body) };
  assert.throws(() => authorizeFounderLivePrivacyLegalAction({ authority, subjectBindingHash: subject(users[0]), action: "ACCOUNT_ERASURE", trust: trust() }), /denied/);
  assert.equal(authorizeFounderLivePrivacyLegalAction({ authority, subjectBindingHash: subject(users[0]), action: "ACCOUNT_ERASURE", trust: trust({ acceptsPrivacyLegalAuthorityHash: (hash) => hash === authority.authorityHash }) }).action, "ACCOUNT_ERASURE");
});

test("no-write and retention boundaries remain closed", () => {
  assert.equal(FOUNDER_LIVE_UUID_NO_WRITE_PROOF.executionAuthorized, false);
  assert.equal(FOUNDER_LIVE_UUID_NO_WRITE_PROOF.networkClientDependency, false);
  assert.equal(FOUNDER_LIVE_UUID_RETENTION_TEMPLATE.status, "NOT_CONFIGURED");
  assert.equal(FOUNDER_LIVE_UUID_RETENTION_TEMPLATE.concreteDurations, null);
  assert.equal(FOUNDER_LIVE_UUID_RETENTION_TEMPLATE.erasureEffect, "DELETE_ALL_PERSONAL_STORES");
});

test("test source contains no concrete UUID or email address", () => {
  const source = readFileSync(new URL(import.meta.url), "utf8");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(source), false);
  assert.equal(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(source), false);
});
