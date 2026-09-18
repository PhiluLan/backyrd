import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CONTRACT_VERSIONS,
  PRODUCTION_PROJECTION_ARTIFACT_HASH,
  PRODUCTION_PROJECTION_PORT_FLAGS,
  PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF,
  PRODUCTION_PROJECTION_PORT_RELEASE,
  PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR,
  PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
  PRODUCTION_PROJECTION_SOURCE_SET_HASH,
  ProductionProjectionPortError,
  buildRelevantUserProjection,
  canonicalJson,
  contentHash,
  createFounderLivePrivateUuidProvider,
  createProductionRelevantUserProjectionPort,
} from "../dist/index.js";

const now = "2026-09-18T12:00:00.000Z";
const generatedUuid = (label) => {
  const hash = contentHash(label);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const users = [generatedUuid("projection-member-one"), generatedUuid("projection-member-two")];
const subject = (userId) => contentHash({ userId, scope: "founder-live" });
const sessionHash = (userId) => contentHash({ userId, session: "production-port" });
const authHash = (userId) => contentHash({ userId, auth: "server" });
const consent = (overrides = {}) => ({
  contractVersion: CONTRACT_VERSIONS.consentEnvelope,
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "projection-consent-1",
  policyVersion: "projection-policy-1",
  uxVersion: "projection-ux-1",
  effectiveAt: "2026-09-18T08:00:00.000Z",
  captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
  ...overrides,
});
const request = (userId = users[0], overrides = {}) => ({
  contractVersion: CONTRACT_VERSIONS.projectionRequest,
  requestId: "production-projection-request-1",
  actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash: subject(userId), authenticationContextHash: authHash(userId), boundBy: "SERVER" },
  decisionId: "production-projection-decision-1",
  snapshot: null,
  context: { contextContractVersion: "production-minimized-context-1", contextHash: contentHash("context"), placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: [], budgets: { maxItems: 8, maxBytes: 4096 }, projectionPolicyVersion: "product-policy-read-only-1", killSwitch: false,
  ...overrides,
});
const session = (userId = users[0], overrides = {}) => ({
  contractVersion: CONTRACT_VERSIONS.founderLiveUuidServerSession,
  authUserId: userId,
  sessionBindingHash: sessionHash(userId),
  authenticationContextHash: authHash(userId),
  issuer: "SUPABASE_AUTH_SERVER",
  authenticationMethod: "SERVER_VERIFIED_JWT",
  authenticated: true,
  anonymous: false,
  blocked: false,
  deleted: false,
  issuedAt: "2026-09-18T10:00:00.000Z",
  expiresAt: "2026-09-18T14:00:00.000Z",
  verifiedAt: now,
  ...overrides,
});
const makeRecord = (userId, index) => {
  const body = {
    contractVersion: CONTRACT_VERSIONS.founderLiveUuidPrivateRecord,
    recordId: `production-private-record-${index}`,
    authUserId: userId,
    status: "ACTIVE",
    purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION",
    consentHash: contentHash(consent()),
    consentState: "GRANTED",
    lifecycle: "ACTIVE",
    acceptedSessionBindingHash: sessionHash(userId),
    subjectBindingHash: subject(userId),
    cohortVersion: "FOUNDER_LIVE_TWO_MEMBER_COHORT_V1",
    validFrom: "2026-09-18T00:00:00.000Z",
    validUntil: "2027-09-18T00:00:00.000Z",
    issuer: "BACKYRD_PRIVATE_IDENTITY_AUTHORITY",
  };
  return { ...body, recordHash: contentHash(body) };
};
const records = users.map((userId, index) => makeRecord(userId, index + 1));
const privateEnvelopeBody = {
  contractVersion: CONTRACT_VERSIONS.founderLiveUuidPrivateStoreEnvelope,
  providerId: "BACKYRD_PRIVATE_FOUNDER_UUID_STORE",
  cohortVersion: "FOUNDER_LIVE_TWO_MEMBER_COHORT_V1",
  configuredMemberCount: 2,
  records,
  productionAuthorized: false,
  runtimeActivated: false,
};
const privateEnvelope = { ...privateEnvelopeBody, envelopeHash: contentHash(privateEnvelopeBody) };
const privateProvider = () => createFounderLivePrivateUuidProvider(() => canonicalJson(privateEnvelope));
const uuidTrust = () => ({
  verifiedAt: now,
  getRelease: (id) => id === "backyrd-founder-live-uuid-authority-closure-1" ? (globalThis.__uuidRelease) : null,
  getTrustAnchor: (id) => id === "backyrd-founder-live-uuid-authority-anchor-1" ? (globalThis.__uuidAnchor) : null,
  acceptsPrivateProviderEnvelopeHash: (hash) => hash === privateEnvelope.envelopeHash,
  acceptsPrivateRecordHash: (hash) => records.some((record) => record.recordHash === hash),
  acceptsPrivacyLegalAuthorityHash: () => false,
});

// Imported lazily through the same public package so the test never duplicates release truth.
const api = await import("../dist/index.js");
globalThis.__uuidRelease = api.FOUNDER_LIVE_UUID_AUTHORITY_RELEASE;
globalThis.__uuidAnchor = api.FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR;

function harness(overrides = {}) {
  let state = { consent: consent(), lifecycle: "ACTIVE" };
  let sessionValue = session();
  let acceptedEnvelopeHash = null;
  let readCount = 0;
  const releaseTrust = {
    verifiedAt: now,
    getRelease: (id) => id === PRODUCTION_PROJECTION_PORT_RELEASE.releaseId ? PRODUCTION_PROJECTION_PORT_RELEASE : null,
    getTrustAnchor: (id) => id === PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR.anchorId ? PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR : null,
    acceptsProjectionEnvelopeHash: (hash) => hash === acceptedEnvelopeHash,
    ...overrides.releaseTrust,
  };
  const projectionProvider = {
    contractVersion: "backyrd.user-intelligence.authorized-projection-read-provider@1.0",
    async readAuthorizedProjection(input) {
      readCount += 1;
      if (overrides.missingProjection) return null;
      const req = request();
      const projection = buildRelevantUserProjection({
        request: req,
        consent: state.consent,
        manifest: { manifestId: "production-projection-manifest", manifestHash: contentHash("production-projection-manifest") },
        snapshot: null,
        content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } },
        identity: { projectionId: "production-projection-value-1" },
        clock: { now },
      });
      const body = {
        contractVersion: CONTRACT_VERSIONS.productionProjectionEnvelope,
        purpose: "FOUNDER_LIVE_RELEVANT_USER_PROJECTION",
        requestHash: input.requestHash,
        subjectBindingHash: subject(users[0]),
        consentHash: contentHash(state.consent),
        lifecycle: "ACTIVE",
        projectBindingHash: PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
        releaseHash: PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash,
        sourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
        artifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH,
        projection,
        issuedAt: "2026-09-18T11:00:00.000Z",
        validUntil: "2026-09-18T13:00:00.000Z",
        issuer: "BACKYRD_USER_INTELLIGENCE_PROJECTION_AUTHORITY",
        ...overrides.envelope,
      };
      const envelope = { ...body, envelopeHash: contentHash(body) };
      acceptedEnvelopeHash = overrides.rejectEnvelope ? null : envelope.envelopeHash;
      return overrides.mutateAfterHash ? { ...envelope, subjectBindingHash: contentHash("forged") } : envelope;
    },
  };
  const input = {
    projectRef: "hjgcrrzfjchzqoegcywn",
    host: "hjgcrrzfjchzqoegcywn.supabase.co",
    mode: "PROD_LIKE_TEST",
    sessionProvider: { contractVersion: "backyrd.user-intelligence.server-session-provider@1.0", readVerifiedSession: async () => sessionValue },
    consentLifecycleProvider: { contractVersion: "backyrd.user-intelligence.consent-lifecycle-provider@1.0", readForAuthenticatedUser: async () => state },
    projectionProvider,
    privateUuidProvider: privateProvider(),
    uuidTrust: uuidTrust(),
    releaseTrust,
    ...overrides.input,
  };
  return {
    port: createProductionRelevantUserProjectionPort(input),
    setState: (value) => { state = value; },
    setSession: (value) => { sessionValue = value; },
    reads: () => readCount,
    input,
  };
}

test("canonical server port returns only an externally accepted minimized projection", async () => {
  const { port, reads } = harness();
  const projection = await port.project(request());
  assert.equal(port.contractVersion, "backyrd.user-intelligence.decision-projection-port@1.0");
  assert.equal(projection.contractVersion, CONTRACT_VERSIONS.projection);
  assert.equal(reads(), 1);
  const serialized = JSON.stringify(projection);
  for (const forbidden of [...users, '"rawEvents":', '"reviewText":', '"email":', '"retention":', '"ownerTier":', '"payment":']) assert.equal(serialized.includes(forbidden), false);
  assert.deepEqual(projection.boundaries, { rawEventsIncluded: false, reviewTextIncluded: false, rawLocationIncluded: false, privateSocialDataIncluded: false, eligibilityAuthority: false, rankingAuthority: false });
});

test("missing projection is honest and never replaced by empty or synthetic truth", async () => {
  const { port } = harness({ missingProjection: true });
  await assert.rejects(port.project(request()), (error) => error instanceof ProductionProjectionPortError && error.code === "PROJECTION_MISSING");
});

test("session identity comes only from the verified server session", async () => {
  const h = harness();
  await assert.rejects(h.port.project(request(users[1])), /SESSION_DENIED/);
  h.setSession({ ...session(), email: "forbidden" });
  await assert.rejects(h.port.project(request()), /SESSION_DENIED/);
  h.setSession(session(users[0], { expiresAt: now }));
  await assert.rejects(h.port.project(request()), /SESSION_DENIED/);
  await assert.rejects(h.port.project(request(users[0], { killSwitch: true })), /SESSION_DENIED/);
  for (const revoked of [{ blocked: true }, { deleted: true }, { anonymous: true }]) {
    h.setSession(session(users[0], revoked));
    await assert.rejects(h.port.project(request()), /SESSION_DENIED/);
  }
});

test("consent withdrawal reset erasure and missing state recheck fail closed before reads", async () => {
  for (const state of [
    null,
    { consent: consent({ state: "WITHDRAWN", allowedProcessing: [], lifecycleEffect: "PURGE_PERSONALIZATION" }), lifecycle: "CONSENT_WITHDRAWN" },
    { consent: consent(), lifecycle: "FULL_RESET" },
    { consent: consent(), lifecycle: "ACCOUNT_ERASURE" },
  ]) {
    const h = harness();
    h.setState(state);
    await assert.rejects(h.port.project(request()), /CONSENT_OR_LIFECYCLE_DENIED/);
    assert.equal(h.reads(), 0);
  }
});

test("project host release artifact source set and purpose are exact bindings", () => {
  for (const input of [
    { projectRef: "other-project", host: "hjgcrrzfjchzqoegcywn.supabase.co" },
    { projectRef: "hjgcrrzfjchzqoegcywn", host: "other.example.invalid" },
  ]) assert.throws(() => harness({ input }).port, /CONFIGURATION_DENIED/);
  assert.equal(PRODUCTION_PROJECTION_PORT_RELEASE.artifactHash, PRODUCTION_PROJECTION_ARTIFACT_HASH);
  assert.equal(PRODUCTION_PROJECTION_PORT_RELEASE.sourceSetHash, PRODUCTION_PROJECTION_SOURCE_SET_HASH);
  assert.equal(PRODUCTION_PROJECTION_PORT_RELEASE.purpose, "FOUNDER_LIVE_RELEVANT_USER_PROJECTION");
});

test("replacement release trust root and validity drift fail before a read", () => {
  const replacementRelease = { ...PRODUCTION_PROJECTION_PORT_RELEASE, releaseHash: contentHash("replacement") };
  assert.throws(() => harness({ releaseTrust: { getRelease: () => replacementRelease } }), /CONFIGURATION_DENIED/);
  const replacementAnchor = { ...PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR, anchorHash: contentHash("replacement") };
  assert.throws(() => harness({ releaseTrust: { getTrustAnchor: () => replacementAnchor } }), /CONFIGURATION_DENIED/);
  assert.throws(() => harness({ releaseTrust: { verifiedAt: "2031-01-01T00:00:00.000Z" } }), /CONFIGURATION_DENIED/);
});

test("tampered rehashed untrusted and cross-subject envelopes fail closed", async () => {
  for (const options of [
    { mutateAfterHash: true },
    { rejectEnvelope: true },
    { envelope: { subjectBindingHash: subject(users[1]) } },
    { envelope: { artifactHash: contentHash("replacement-artifact") } },
    { envelope: { sourceSetHash: contentHash("replacement-source-set") } },
    { envelope: { rawEvidence: [] } },
    { envelope: { validUntil: now } },
  ]) await assert.rejects(harness(options).port.project(request()), /PROJECTION_AUTHORITY_DENIED/);
});

test("multi-instance restart concurrency and replay stay deterministic", async () => {
  const first = harness();
  const second = harness();
  const [a, b, c] = await Promise.all([first.port.project(request()), first.port.project(request()), second.port.project(request())]);
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(canonicalJson(a), canonicalJson(c));
  assert.equal(a.projectionHash, b.projectionHash);
  assert.equal(a.projectionHash, c.projectionHash);
});

test("revocation takes effect on the next read without process-local cache", async () => {
  const h = harness();
  await h.port.project(request());
  h.setState({ consent: consent({ state: "WITHDRAWN", allowedProcessing: [], lifecycleEffect: "PURGE_PERSONALIZATION" }), lifecycle: "CONSENT_WITHDRAWN" });
  await assert.rejects(h.port.project(request()), /CONSENT_OR_LIFECYCLE_DENIED/);
  assert.equal(h.reads(), 1);
});

test("no-write and activation flags remain closed", () => {
  for (const value of Object.values(PRODUCTION_PROJECTION_PORT_FLAGS)) assert.equal(value, false);
  assert.equal(PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF.portMethod, "READ_ONLY");
  assert.equal(PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF.persistenceAuthorized, false);
  assert.equal(PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF.executionAuthorized, false);
});

test("source and checked-in evidence contain no concrete UUID email or secret", () => {
  const source = readFileSync(new URL("../src/production-relevant-user-projection.ts", import.meta.url), "utf8");
  const evidenceSource = readFileSync(new URL("../../../delivery/user-intelligence/founder-live-production-projection-release.json", import.meta.url), "utf8");
  const evidence = JSON.parse(evidenceSource);
  const { reportHash, ...body } = evidence;
  assert.equal(contentHash(body), reportHash);
  assert.equal(evidence.releaseHash, PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash);
  assert.equal(evidence.trustAnchorHash, PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR.anchorHash);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(source), false);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(evidenceSource), false);
  assert.equal(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(source), false);
  assert.equal(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(evidenceSource), false);
  assert.doesNotMatch(source, /service[_-]?role|authorization\s*:/i);
});
