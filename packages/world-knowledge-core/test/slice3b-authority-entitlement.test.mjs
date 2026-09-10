import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_ENTITLEMENT_POLICY, ACCEPTED_POLICY_VERSION, ENTITLEMENT_POLICY_VERSION,
  OWNER_BASIC_KEYS, OWNER_PRO_ONLY_KEYS, PRICE_LEVELS, REGISTRY_HASH, REGISTRY_VERSION,
  RETENTION_POLICY, RETENTION_POLICY_HASH, createConfirmationRecord, createEntitlementPolicyRelease,
  createHolidayReminder, createIdentityEvent, createServerVerifiedClaim, parseEntitlementPolicyRelease,
  CURRENT_REGISTRY_SHAPE, FOUNDATION_REGISTRY_SHAPE, SLICE3B_REGISTRY_APPROVAL_AUTHORITY,
  SLICE3B_REGISTRY_APPROVAL_RECORD, SLICE3B_REGISTRY_RELEASE, validateRegistryTransition,
} from "../dist/index.js";

const baseRequest = (overrides = {}) => ({
  claimId: "claim:owner:price", spotId: "spot:philipps-casa", attributeKey: "operation.price_level",
  area: "SPOT", knowledgeState: "KNOWN_VALUE", value: "MEDIUM", observedAt: "2026-09-10T18:00:00.000Z",
  validFrom: null, validUntil: null, visibility: "PUBLIC", supersedesClaimId: null, idempotencyKey: "owner-price-v1", ...overrides,
});
const context = (overrides = {}) => ({
  serverTime: "2026-09-10T18:00:01.000Z", actorId: "actor:owner", actorType: "VERIFIED_OWNER",
  ownedSpotIds: ["spot:philipps-casa"], entitlement: "BASIC", acceptedRegistryVersion: REGISTRY_VERSION,
  acceptedPolicyVersion: ACCEPTED_POLICY_VERSION, acceptedEntitlementPolicyVersion: ENTITLEMENT_POLICY_VERSION, ...overrides,
});

test("accepted entitlement is key-based, hash-bound and excludes subjective truth", () => {
  assert.equal(parseEntitlementPolicyRelease(ACCEPTED_ENTITLEMENT_POLICY).policyHash, ACCEPTED_ENTITLEMENT_POLICY.policyHash);
  assert.ok(OWNER_BASIC_KEYS.includes("contact.public_email"));
  assert.ok(OWNER_PRO_ONLY_KEYS.includes("accessibility.accessible_toilet"));
  assert.equal(ACCEPTED_ENTITLEMENT_POLICY.commercialInfluence, "AUTHORING_SCOPE_ONLY");
  assert.deepEqual(ACCEPTED_ENTITLEMENT_POLICY.excludedObjectiveKeys, ["research.subjective_fits"]);
  assert.throws(() => createEntitlementPolicyRelease({ ...ACCEPTED_ENTITLEMENT_POLICY, policyHash: undefined, proKeys: [...ACCEPTED_ENTITLEMENT_POLICY.proKeys, "unknown.key"] }), /unknown field|unknown attribute/);
});

test("registry 1.1 is an accepted additive transition over retained 1.0 history", () => {
  assert.equal(SLICE3B_REGISTRY_RELEASE.predecessorVersion, FOUNDATION_REGISTRY_SHAPE.version);
  assert.equal(SLICE3B_REGISTRY_RELEASE.registryVersion, CURRENT_REGISTRY_SHAPE.version);
  assert.doesNotThrow(() => validateRegistryTransition(FOUNDATION_REGISTRY_SHAPE, CURRENT_REGISTRY_SHAPE, SLICE3B_REGISTRY_RELEASE, { acceptedApprovalAuthorities: [SLICE3B_REGISTRY_APPROVAL_AUTHORITY], acceptedApprovalRecords: [SLICE3B_REGISTRY_APPROVAL_RECORD], history: [] }));
});

test("owner/admin authority is injected server-side and entitlement fails closed", () => {
  const owner = createServerVerifiedClaim(baseRequest(), context());
  assert.equal(owner.verificationMethod, "OWNER_CONFIRMED");
  assert.equal(owner.claim.verificationState, "VERIFIED");
  assert.equal(owner.claim.sourceType, "OWNER_ASSERTION");
  assert.throws(() => createServerVerifiedClaim({ ...baseRequest(), actorId: "client-forged" }, context()), /unknown field/);
  assert.throws(() => createServerVerifiedClaim(baseRequest(), context({ ownedSpotIds: [] })), /not bound/);
  assert.throws(() => createServerVerifiedClaim(baseRequest({ attributeKey: "accessibility.accessible_toilet", knowledgeState: "KNOWN_TRUE", value: true }), context()), /entitlement scope/);
  const pro = createServerVerifiedClaim(baseRequest({ claimId: "claim:owner:access", attributeKey: "accessibility.accessible_toilet", knowledgeState: "KNOWN_TRUE", value: true, idempotencyKey: "owner-access-v1" }), context({ entitlement: "PRO" }));
  assert.equal(pro.claim.value, true);
  const admin = createServerVerifiedClaim(baseRequest({ claimId: "claim:admin:access", attributeKey: "accessibility.accessible_toilet", knowledgeState: "UNKNOWN", value: null, idempotencyKey: "admin-access-v1" }), context({ actorId: "actor:admin", actorType: "ADMIN", ownedSpotIds: [], entitlement: "BASIC" }));
  assert.equal(admin.verificationMethod, "ADMIN_CONFIRMED");
  assert.equal(admin.claim.knowledgeState, "UNKNOWN");
});

test("subscription is absent from claim truth and identical facts are byte-identical", () => {
  const basic = createServerVerifiedClaim(baseRequest(), context({ entitlement: "BASIC" }));
  const pro = createServerVerifiedClaim(baseRequest(), context({ entitlement: "PRO" }));
  assert.deepEqual(pro, basic);
  assert.equal(JSON.stringify(pro).includes("subscription"), false);
  assert.equal(JSON.stringify(pro).includes("payment"), false);
  assert.equal(JSON.stringify(pro).includes("PRO"), false);
});

test("price levels are typed without currency conversion and public email is deliberate", () => {
  assert.deepEqual(PRICE_LEVELS, ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "PREMIUM"]);
  assert.throws(() => createServerVerifiedClaim(baseRequest({ value: "CHF_20_40" }), context()), /expected one of/);
  const email = createServerVerifiedClaim(baseRequest({ claimId: "claim:email", attributeKey: "contact.public_email", value: "hello@philipps-casa.example", idempotencyKey: "public-email-v1" }), context());
  assert.equal(email.claim.value, "hello@philipps-casa.example");
  assert.throws(() => createServerVerifiedClaim(baseRequest({ attributeKey: "contact.public_email", value: "owner-login", idempotencyKey: "bad-email" }), context()), /invalid format/);
});

test("current state expires, confirmation is append-only metadata", () => {
  assert.throws(() => createServerVerifiedClaim(baseRequest({ attributeKey: "state.current", knowledgeState: "KNOWN_VALUE", value: { kind: "OPEN", scope: "VENUE" }, idempotencyKey: "state-no-expiry" }), context()), /requires expiry/);
  const owner = createServerVerifiedClaim(baseRequest(), context());
  const confirmation = createConfirmationRecord({ recordId: "confirmation:1", claimId: owner.claim.claimId, claimHash: owner.claim.contentHash, spotId: owner.claim.scope.spotId, actorBindingId: "binding:owner", confirmedAt: "2026-12-10T18:00:00.000Z", confirmationDueAt: "2027-03-10T18:00:00.000Z", confirmedByActorType: "VERIFIED_OWNER", method: "OWNER_CONFIRMED", policyVersion: ACCEPTED_POLICY_VERSION, reconfirmationPolicyRef: "confirmation:quarterly-request-v1", idempotencyKey: "confirmation:owner:1", changesSemanticValue: false }, owner.claim);
  assert.equal(confirmation.claimHash, owner.claim.contentHash);
  assert.equal(confirmation.changesSemanticValue, false);
  assert.throws(() => createConfirmationRecord({ ...confirmation, recordHash: undefined, changesSemanticValue: true }, owner.claim), /unknown field|unchanged/);
});

test("identity mutation and holiday reminders require explicit authority and exact scope", () => {
  assert.throws(() => createIdentityEvent({ eventId: "identity:merge", eventType: "MERGE_CONFIRMED", subjectSpotId: "spot:a", relatedSpotId: "spot:b", externalNamespace: null, externalReferenceHash: null, authorityRecordId: "registry:approval", occurredAt: "2026-09-10T18:00:00.000Z", reasonCodes: ["DUPLICATE_CONFIRMED"] }), /IDENTITY_OPERATION_AUTHORITY_NOT_CONFIGURED/);
  const event = createIdentityEvent({ eventId: "identity:candidate", eventType: "DUPLICATE_SUSPECTED", subjectSpotId: "spot:a", relatedSpotId: "spot:b", externalNamespace: null, externalReferenceHash: null, authorityRecordId: null, occurredAt: "2026-09-10T18:00:00.000Z", reasonCodes: ["PROVIDER_REFERENCE_MATCH"] });
  assert.equal(event.eventType, "DUPLICATE_SUSPECTED");
  assert.throws(() => createIdentityEvent({ eventId: "identity:missing-pair", eventType: "MERGE_PROPOSED", subjectSpotId: "spot:a", relatedSpotId: null, externalNamespace: null, externalReferenceHash: null, authorityRecordId: null, occurredAt: "2026-09-10T18:00:00.000Z", reasonCodes: ["PAIR_REQUIRED"] }), /distinct pair/);
  assert.throws(() => createHolidayReminder({ workItemId: "holiday:1", spotId: "spot:a", holidayCalendarVersion: "ch-zh:1", countryCode: "CH", regionCode: "ZH", holidayDate: "2026-12-25", holidayKey: "christmas", askAt: "2026-12-19T00:00:00.000Z", state: "PLANNED" }), /seven days/);
});

test("retention inventory is hash-bound and deliberately awaits Legal activation", () => {
  assert.match(RETENTION_POLICY_HASH, /^[a-f0-9]{64}$/);
  assert.equal(RETENTION_POLICY.state, "REQUIRES_CTO_LEGAL_ACTIVATION");
  assert.ok(RETENTION_POLICY.classes.every((entry) => entry.duration === null));
  assert.deepEqual({ registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH }, { registryVersion: "backyrd.world-knowledge.registry@1.1", registryHash: "e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be" });
});
