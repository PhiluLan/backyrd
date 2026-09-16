import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT_HANDOFF_VERSION, REGISTRY_HASH, REGISTRY_VERSION, UNCONFIGURED_SOURCE_POLICY,
  buildWorldKnowledgeSnapshot, createClaim, createWorldKnowledgeContextHandoff, hashBody,
  parseWorldKnowledgeContextHandoff, resolveWorldKnowledge, resolutionRequest, snapshotInput,
} from "../dist/index.js";

const observedAt = "2026-09-15T10:00:00.000Z";
const conditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };
const claim = (claimId, attributeKey, value) => createClaim({
  claimId, attributeKey, scope: { spotId: "spot:context", area: "SPOT" }, knowledgeState: "KNOWN_VALUE", value,
  actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: "source:admin-context", provenanceSessionId: "session:context",
  verificationState: "UNVERIFIED", observedAt, validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null,
});

test("contextual statements are typed, conditional and distinct from user intent", () => {
  const claims = [
    claim("claim:purpose", "purpose.primary_visit", "NATURE_ANIMAL_EXPERIENCE"),
    claim("claim:onsite", "offering.onsite", [{ kind: "CAFE", relationship: "EMBEDDED_FACILITY", area: "Eingang" }]),
    claim("claim:visit", "context.visit_situations", [{ situation: "FAMILY", conditions: { ...conditions, dayparts: ["AFTERNOON"], ageContext: "MIXED_AGES", accompaniment: "ADULT" } }]),
    claim("claim:atmosphere", "context.atmosphere", [{ atmosphere: "QUIET", conditions: { ...conditions, dayparts: ["MORNING"], area: "Aussenbereich" } }]),
    claim("claim:daypart", "context.typical_dayparts", [{ daypart: "AFTERNOON", conditions: { days: ["SATURDAY", "SUNDAY"], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]),
  ];
  const resolution = resolveWorldKnowledge(resolutionRequest(claims));
  const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("spot:context", resolution));
  const handoff = createWorldKnowledgeContextHandoff(snapshot, [UNCONFIGURED_SOURCE_POLICY], "2026-09-15T11:00:00.000Z");
  assert.equal(handoff.contractVersion, CONTEXT_HANDOFF_VERSION);
  assert.equal(handoff.registryVersion, REGISTRY_VERSION); assert.equal(handoff.registryHash, REGISTRY_HASH);
  assert.equal(handoff.primaryVisitPurpose.value, "NATURE_ANIMAL_EXPERIENCE");
  assert.equal(handoff.onsiteOfferings.value[0].relationship, "EMBEDDED_FACILITY");
  assert.deepEqual(handoff.absentKeys, []); assert.deepEqual(handoff.explicitUnknowns, []);
  assert.equal(JSON.stringify(handoff).includes("userIntent"), false);
  assert.equal(parseWorldKnowledgeContextHandoff(handoff).handoffHash, handoff.handoffHash);
});

test("embedded hotel, shop and children area remain additional offerings", () => {
  const value = ["HOTEL", "SHOP", "KIDS_PLAY_AREA"].map((kind) => ({ kind, relationship: "EMBEDDED_FACILITY", area: null }));
  const contextualClaim = claim("claim:embedded-kinds", "offering.onsite", value);
  assert.deepEqual(contextualClaim.value.map((item) => item.kind), ["HOTEL", "KIDS_PLAY_AREA", "SHOP"]);
  assert.equal(contextualClaim.attributeKey, "offering.onsite");
});

test("context handoff and contextual values fail closed after semantic rehashing", () => {
  assert.throws(() => claim("claim:nearby", "offering.onsite", [{ kind: "CAFE", relationship: "NEARBY", area: null }]), /expected one of/);
  assert.throws(() => claim("claim:unknown-mood", "context.atmosphere", [{ atmosphere: "TRENDY", conditions }]), /expected one of/);
  const resolution = resolveWorldKnowledge(resolutionRequest([])); const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("spot:empty-context", resolution));
  const handoff = createWorldKnowledgeContextHandoff(snapshot, [UNCONFIGURED_SOURCE_POLICY], "2026-09-15T11:00:00.000Z");
  const forged = { ...handoff, contractVersion: "backyrd.world-knowledge.context-handoff@9.0" }; const { handoffHash: _hash, ...body } = forged; forged.handoffHash = hashBody(body, []);
  assert.throws(() => parseWorldKnowledgeContextHandoff(forged), /unknown context handoff version/);
  assert.deepEqual(handoff.absentKeys, ["purpose.primary_visit", "offering.onsite", "context.visit_situations", "context.atmosphere", "context.typical_dayparts"]);
});

test("context handoff represents UNKNOWN exactly once and rejects overlap", () => {
  const unknown = createClaim({
    claimId: "claim:unknown-atmosphere", attributeKey: "context.atmosphere", scope: { spotId: "spot:unknown-context", area: "SPOT" }, knowledgeState: "UNKNOWN", value: null,
    actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: "source:unknown-context", provenanceSessionId: "session:unknown-context",
    verificationState: "UNVERIFIED", observedAt, validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null,
  });
  const resolution = resolveWorldKnowledge(resolutionRequest([unknown]));
  const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("spot:unknown-context", resolution));
  const handoff = createWorldKnowledgeContextHandoff(snapshot, [UNCONFIGURED_SOURCE_POLICY], "2026-09-15T11:00:00.000Z");
  assert.equal(handoff.atmosphere, null);
  assert.deepEqual(handoff.explicitUnknowns, ["context.atmosphere"]);
  assert.equal(handoff.absentKeys.includes("context.atmosphere"), false);
  assert.equal(parseWorldKnowledgeContextHandoff(handoff).handoffHash, handoff.handoffHash);

  const forged = structuredClone(handoff);
  forged.absentKeys.push("context.atmosphere");
  const { handoffHash: _hash, ...body } = forged;
  forged.handoffHash = hashBody(body, []);
  assert.throws(() => parseWorldKnowledgeContextHandoff(forged), /knowledge state overlap/);
});
