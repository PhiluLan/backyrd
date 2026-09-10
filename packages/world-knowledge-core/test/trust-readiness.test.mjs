import assert from "node:assert/strict";
import test from "node:test";
import {
  PHILIPPS_CASA_CLAIMS, SPECIAL_HOURS_CLAIMS, appendClaim, buildWorldKnowledgeSnapshot, createClaim, hashBody, parseWorldKnowledgeSnapshot, resolveWorldKnowledge, resolutionRequest, snapshotInput,
} from "../dist/index.js";

const draft = (id, key, value, overrides = {}) => ({ claimId: id, attributeKey: key, scope: { spotId: "trust-spot", area: "SPOT" }, knowledgeState: value === true ? "KNOWN_TRUE" : value === false ? "KNOWN_FALSE" : "KNOWN_VALUE", value, actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: null, provenanceSessionId: "session:automatic-name", verificationState: "UNVERIFIED", observedAt: "2026-01-10T12:00:00.000Z", validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null, ...overrides });

test("actor role and session provenance do not elevate trust", () => {
  const admin = createClaim(draft("trust:admin", "operation.takeaway", true)); const owner = createClaim(draft("trust:owner", "operation.takeaway", true, { actorType: "VERIFIED_OWNER", sourceType: "OWNER_ASSERTION" }));
  assert.equal(resolveWorldKnowledge(resolutionRequest([admin, owner])).resolved[0].trust, "ASSERTED");
  const referenced = createClaim(draft("trust:referenced", "operation.takeaway", true, { sourceReferenceId: "source:official" })); assert.equal(resolveWorldKnowledge(resolutionRequest([referenced])).resolved[0].trust, "REFERENCED");
  const verified = createClaim(draft("trust:verified", "operation.takeaway", true, { sourceReferenceId: "source:official", verificationState: "VERIFIED" })); assert.equal(resolveWorldKnowledge(resolutionRequest([verified])).resolved[0].trust, "VERIFIED");
  assert.throws(() => createClaim(draft("trust:fake-reference", "operation.takeaway", true, { sourceReferenceId: "session:automatic-name" })), /source namespace/);
  assert.throws(() => createClaim(draft("trust:unbound-verification", "operation.takeaway", true, { verificationState: "VERIFIED" })), /verification source/);
  assert.throws(() => createClaim(draft("trust:ai", "operation.takeaway", true, { sourceType: "AI_INFERENCE", verificationState: "VERIFIED" })), /AI inference/);
});

test("a category correction preserves EAT history while resolving DRINKS", () => {
  const prior = createClaim(draft("category:prior", "classification.primary_category", "EAT")); const correction = createClaim(draft("category:correction", "classification.primary_category", "DRINKS", { supersedesClaimId: prior.claimId })); const history = appendClaim([prior], correction);
  const result = resolveWorldKnowledge(resolutionRequest(history)); assert.equal(result.history.length, 2); assert.equal(result.resolved[0].value, "DRINKS"); assert.equal(result.conflicts.length, 0);
});

test("valid current state is emitted and expired current state is not", () => {
  const current = createClaim(draft("state:valid", "state.current", { kind: "AREA_CLOSED", scope: "AREA:TERRACE" }, { scope: { spotId: "trust-spot", area: "AREA:TERRACE" }, validFrom: "2026-01-15T10:00:00.000Z", validUntil: "2026-01-15T18:00:00.000Z" }));
  const activeResolution = resolveWorldKnowledge(resolutionRequest([current])); const active = buildWorldKnowledgeSnapshot(snapshotInput("trust-spot", activeResolution)); assert.equal(active.currentStates.length, 1);
  const expiredResolution = resolveWorldKnowledge(resolutionRequest([current], "2026-01-16T12:00:00.000Z")); const expired = buildWorldKnowledgeSnapshot(snapshotInput("trust-spot", expiredResolution)); assert.equal(expired.currentStates.length, 0); assert.ok(expired.exclusions.some((item) => item.code === "EXPIRED_CURRENT_STATES"));
});

test("regular, special, and kitchen schedules remain separate port rules", () => {
  const kitchen = createClaim(draft("hours:copy:kitchen", "hours.kitchen", [{ day: "THURSDAY", intervals: [{ start: "12:00", end: "17:00" }] }], { scope: { spotId: "synthetic-spot-special-hours", area: "SPOT" }, sourceReferenceId: "source:official", sourceType: "OFFICIAL_SOURCE" }));
  const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-special-hours", resolveWorldKnowledge(resolutionRequest([...SPECIAL_HOURS_CLAIMS, kitchen])))); const keys = snapshot.operationalRules.map((item) => item.key);
  assert.ok(keys.includes("hours.regular")); assert.ok(keys.includes("hours.special")); assert.ok(keys.includes("hours.kitchen"));
  const openingReadiness = snapshot.readiness.find((item) => item.useCase === "OPENING_HOURS_ELIGIBILITY"); assert.equal(openingReadiness.state, "PARTIAL"); assert.ok(openingReadiness.reasonCodes.includes("SOURCE_POLICY_NOT_CONFIGURED"));
});

test("strict port validation rejects recomputed nested unknown fields", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution)); const tampered = structuredClone(snapshot); tampered.spot.identity.ownerTier = "PRO"; const { snapshotHash: _snapshotHash, ...body } = tampered; tampered.snapshotHash = hashBody(body, []);
  assert.throws(() => parseWorldKnowledgeSnapshot(tampered), /unknown field/);
  assert.throws(() => buildWorldKnowledgeSnapshot(snapshotInput("another-spot", resolution)), /claim scope/);
});

test("referenced and verified facts cannot become READY without a source policy", () => {
  const evidence = { sourceReferenceId: "source:verified", sourceType: "OFFICIAL_SOURCE", verificationState: "VERIFIED" };
  const claims = [
    createClaim(draft("policy:name", "identity.name", "Policy Spot", evidence)), createClaim(draft("policy:address", "location.address_line1", "Testweg 1", evidence)), createClaim(draft("policy:locality", "location.locality", "Basel", evidence)), createClaim(draft("policy:lat", "location.latitude", 47.55, evidence)), createClaim(draft("policy:lon", "location.longitude", 7.59, evidence)), createClaim(draft("policy:zone", "location.timezone", "Europe/Zurich", evidence)), createClaim(draft("policy:category", "classification.primary_category", "EAT", evidence)), createClaim(draft("policy:types", "classification.place_types", ["RESTAURANT"], evidence)),
    createClaim(draft("policy:hours", "hours.regular", [{ day: "THURSDAY", intervals: [{ start: "10:00", end: "22:00" }] }], evidence)), createClaim(draft("policy:price", "operation.price_range", { currency: "CHF", min: 20, max: 50 }, evidence)),
    createClaim(draft("policy:takeaway", "operation.takeaway", true, evidence)), createClaim(draft("policy:reservation", "rule.reservation", { mode: "RECOMMENDED", minimumPartySize: 8, days: [], fromTime: null, toTime: null }, evidence)), createClaim(draft("policy:food", "rule.external_food", { policy: "NOT_ALLOWED", exceptions: [] }, evidence)), createClaim(draft("policy:drink", "rule.external_drink", { policy: "NOT_ALLOWED", exceptions: [] }, evidence)),
    ...["step_free_entrance", "wheelchair_paths", "accessible_seating", "accessible_toilet"].map((name) => createClaim(draft(`policy:${name}`, `accessibility.${name}`, true, evidence))),
  ];
  const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("trust-spot", resolveWorldKnowledge(resolutionRequest(claims))));
  for (const useCase of ["DISCOVERY", "OPENING_HOURS_ELIGIBILITY", "PRICE", "HARD_CONSTRAINTS", "ACCESSIBILITY", "TRUST_FRESHNESS"]) { const row = snapshot.readiness.find((item) => item.useCase === useCase); assert.notEqual(row.state, "READY"); assert.ok(row.reasonCodes.includes("SOURCE_POLICY_NOT_CONFIGURED")); }
});
