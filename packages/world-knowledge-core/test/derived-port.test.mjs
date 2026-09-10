import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_CONTEXT, PARTIAL_ACCESSIBILITY_CLAIMS, PHILIPPS_CASA_CLAIMS, RULE_REGISTRY_VERSION, SYNTHETIC_AS_OF,
  buildWorldKnowledgeSnapshot, canonicalJson, createClaim, deriveKnowledge, parseDerivedKnowledge, parseWorldKnowledgeSnapshot, resolveWorldKnowledge, resolutionRequest, snapshotInput,
} from "../dist/index.js";

const make = (id, key, value, options = {}) => createClaim({ claimId: id, attributeKey: key, scope: { spotId: "derived-spot", area: "SPOT" }, knowledgeState: value === true ? "KNOWN_TRUE" : "KNOWN_VALUE", value, actorType: "ADMIN", sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:test", provenanceSessionId: null, verificationState: "UNVERIFIED", observedAt: "2026-01-10T12:00:00.000Z", validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "PUBLIC", supersedesClaimId: null, ...options });

test("five conservative rules disclose inputs, constraints and missing prerequisites", () => {
  const base = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const derived = deriveKnowledge(base); assert.equal(derived.length, 5); assert.ok(derived.every((item) => item.ruleRegistryVersion === RULE_REGISTRY_VERSION && item.derivedHash.length === 64));
  assert.equal(derived.find((item) => item.outputKey === "capability.outdoor_infrastructure").status, "DERIVED");
  const work = derived.find((item) => item.outputKey === "capability.work_infrastructure"); assert.equal(work.status, "NOT_DERIVED"); assert.ok(work.missingPrerequisites.includes("amenity.features:WORK_TABLES")); assert.doesNotThrow(() => derived.forEach(parseDerivedKnowledge));
});

test("work, group and step-free derivations require every concrete prerequisite", () => {
  const claims = [
    make("d:amenities", "amenity.features", ["HIGH_CHAIR", "POWER_OUTLETS", "STROLLER_SPACE", "WIFI", "WORK_TABLES"]), make("d:laptop", "operation.laptop_policy", true), make("d:stay", "operation.stay_policy", "ALLOWED"),
    make("d:total", "capacity.seats_total", 80), make("d:group", "capacity.group_size_supported", { min: 2, max: 20 }), make("d:reservation", "rule.reservation", { mode: "RECOMMENDED", minimumPartySize: 8, days: [], fromTime: null, toTime: null }),
    ...["step_free_entrance", "wheelchair_paths", "accessible_seating", "accessible_toilet"].map((name) => make(`d:${name}`, `accessibility.${name}`, true)),
    make("d:age", "rule.age_access", { policy: "ALL_AGES", minimumAge: null, appliesFromTime: null }),
  ];
  const derived = deriveKnowledge(resolveWorldKnowledge(resolutionRequest(claims))); const statuses = Object.fromEntries(derived.map((item) => [item.outputKey, item.status]));
  assert.equal(statuses["capability.work_infrastructure"], "DERIVED"); assert.equal(statuses["capability.supported_group_range"], "DERIVED"); assert.equal(statuses["capability.family_infrastructure"], "DERIVED"); assert.equal(statuses["capability.step_free_visit_path"], "DERIVED");
  const family = derived.find((item) => item.outputKey === "capability.family_infrastructure"); assert.equal(family.weakestTrust, "ASSERTED"); assert.equal(family.limitingFreshness, "CURRENT"); assert.ok(family.factRefs.every((ref) => ref.claimHashes.length === ref.claimRefs.length && ref.trust === "ASSERTED" && ref.freshness === "CURRENT"));
});

test("family infrastructure requires equipment, access and no contradictory age rule", () => {
  const base = [make("family:amenities", "amenity.features", ["HIGH_CHAIR", "STROLLER_SPACE"]), make("family:entrance", "accessibility.step_free_entrance", true), make("family:paths", "accessibility.wheelchair_paths", true)];
  const missingAge = deriveKnowledge(resolveWorldKnowledge(resolutionRequest(base))).find((item) => item.outputKey === "capability.family_infrastructure"); assert.equal(missingAge.status, "NOT_DERIVED"); assert.ok(missingAge.reasonCodes.includes("FAMILY_AGE_RULE_MISSING"));
  const restricted = deriveKnowledge(resolveWorldKnowledge(resolutionRequest([...base, make("family:age", "rule.age_access", { policy: "MINIMUM_AGE", minimumAge: 18, appliesFromTime: "20:00" })]))).find((item) => item.outputKey === "capability.family_infrastructure"); assert.equal(restricted.status, "NOT_DERIVED"); assert.ok(restricted.reasonCodes.includes("FAMILY_AGE_RULE_CONFLICT"));
});

test("port is deterministic, validated and strips non-world and private context", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const first = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution, COMMERCIAL_CONTEXT)); const second = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution, COMMERCIAL_CONTEXT));
  assert.equal(canonicalJson(first), canonicalJson(second)); assert.equal(first.snapshotHash, second.snapshotHash); assert.doesNotThrow(() => parseWorldKnowledgeSnapshot(first));
  const serialized = canonicalJson(first); for (const forbidden of ["\"PRO\"", "\"PAID\"", "\"CAMPAIGN\"", "\"FEATURED\"", "private moderation note", "private.invalid", "untrusted model output", "intent.afterwork", "vibe.cozy"]) assert.ok(!serialized.includes(forbidden), forbidden);
  assert.equal(first.currentStates.length, 0); assert.ok(first.exclusions.some((item) => item.code === "CURRENT_STATE_WITHOUT_EXPIRY")); assert.ok(first.exclusions.some((item) => item.code === "ASSERTED_OPENING_HOURS")); assert.equal(first.operationalRules.some((item) => item.key === "hours.regular"), true);
  const outdoor = first.capabilities.find((item) => item.key === "capability.outdoor_infrastructure"); assert.equal(outdoor.weakestTrust, "ASSERTED"); assert.equal(outdoor.limitingFreshness, "CURRENT"); assert.ok(outdoor.basisClaimHashes.length > 0);
  assert.throws(() => parseWorldKnowledgeSnapshot({ ...first, contractVersion: "backyrd.world-knowledge.port@2.0" }), /unknown/); assert.throws(() => parseWorldKnowledgeSnapshot({ ...first, ruleRegistryVersion: "unknown" }), /unknown/);
});

test("partial accessibility never derives a complete step-free visit path", () => {
  const result = deriveKnowledge(resolveWorldKnowledge(resolutionRequest(PARTIAL_ACCESSIBILITY_CLAIMS))); const path = result.find((item) => item.outputKey === "capability.step_free_visit_path"); assert.equal(path.status, "NOT_DERIVED"); assert.ok(path.missingPrerequisites.length >= 3);
});
