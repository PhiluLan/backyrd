import assert from "node:assert/strict";
import test from "node:test";
import {
  PHILIPPS_CASA_CLAIMS, buildWorldKnowledgeSnapshot, createClaim, deriveKnowledge, effectiveVenueHours, hashBody,
  parseClaim, parseDerivedKnowledge, parseResolutionResult, parseWorldKnowledgeSnapshot, resolveWorldKnowledge, resolutionRequest, snapshotInput,
} from "../dist/index.js";

const draft = {
  claimId: "boundary:claim", attributeKey: "operation.takeaway", scope: { spotId: "boundary-spot", area: "SPOT" }, knowledgeState: "KNOWN_TRUE", value: true,
  actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: null, provenanceSessionId: null, verificationState: "UNVERIFIED",
  observedAt: "2026-01-10T12:00:00.000Z", validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null,
};

const rehashClaim = (value) => { const { contentHash: _contentHash, ...body } = value; return { ...body, contentHash: hashBody(body, []) }; };
const rehashResolution = (value) => { const { resultHash: _resultHash, ...body } = value; return { ...body, resultHash: hashBody(body, []) }; };
const rehashSnapshot = (value) => { const { snapshotHash: _snapshotHash, ...body } = value; return { ...body, snapshotHash: hashBody(body, []) }; };

test("createClaim validates every direct runtime field", () => {
  for (const mutation of [
    { claimId: "invalid id" }, { attributeKey: "unknown.key" }, { scope: { spotId: "bad id", area: "SPOT" } }, { scope: { spotId: "boundary-spot", area: "bad area" } },
    { knowledgeState: "KNOWN_TRUE", value: false }, { knowledgeState: "UNKNOWN", value: true }, { actorType: "ROOT" }, { sourceType: "SCRAPED_MAGIC" },
    { sourceReferenceId: "private:unbound" }, { provenanceSessionId: "invalid session" },
    { verificationState: "TRUSTED" }, { observedAt: "yesterday" }, { validFrom: "2026-02-01T00:00:00.000Z", validUntil: "2026-01-01T00:00:00.000Z" },
    { stance: "AGREES" }, { visibility: "SECRET" }, { supersedesClaimId: "boundary:claim" },
  ]) assert.throws(() => createClaim({ ...draft, ...mutation }), /\$|unknown_attribute_key/);
  assert.throws(() => createClaim({ ...draft, unexpected: true }), /unknown field/);
});

test("self-hashed claims and resolutions cannot authorize invalid semantics", () => {
  const valid = createClaim(draft);
  const invalidCategory = rehashClaim({ ...valid, claimId: "boundary:category", attributeKey: "classification.primary_category", knowledgeState: "KNOWN_VALUE", value: "SERVICES_SPECIAL_EXPERIENCES" });
  assert.equal(invalidCategory.contentHash.length, 64); assert.throws(() => parseClaim(invalidCategory), /expected one of/);

  const resolution = structuredClone(resolveWorldKnowledge(resolutionRequest([valid]))); resolution.resolved[0].value = false; resolution.resolved[0].resolution = "KNOWN_FALSE";
  const { resolutionHash: _resolutionHash, ...entryBody } = resolution.resolved[0]; resolution.resolved[0].resolutionHash = hashBody(entryBody, []); const forged = rehashResolution(resolution);
  assert.equal(forged.resultHash.length, 64); assert.throws(() => parseResolutionResult(forged), /deterministic resolution/);
  const orphanCorrection = createClaim({ ...draft, claimId: "boundary:correction", supersedesClaimId: "boundary:missing" }); assert.throws(() => resolveWorldKnowledge(resolutionRequest([orphanCorrection])), /superseded claim not found/);
});

test("structural snapshot fields use their registry types even with a valid snapshot hash", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const base = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution));
  const mutations = [
    (spot) => { spot.classification.primaryCategory = "SERVICES_SPECIAL_EXPERIENCES"; }, (spot) => { spot.classification.placeTypes = ["UNKNOWN_PLACE"]; },
    (spot) => { spot.publicContact.website = "javascript:alert(1)"; }, (spot) => { spot.publicContact.phone = "123"; }, (spot) => { spot.location.countryCode = "Switzerland"; },
    (spot) => { spot.location.timezone = "Zurich"; }, (spot) => { spot.location.latitude = 123; },
  ];
  for (const mutate of mutations) { const forged = structuredClone(base); mutate(forged.spot); assert.throws(() => parseWorldKnowledgeSnapshot(rehashSnapshot(forged)), /expected|invalid|minimum|maximum|structural/); }
});

test("derived and capability payloads reject self-hashed trust elevation and unknown outputs", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(PHILIPPS_CASA_CLAIMS)); const derived = structuredClone(deriveKnowledge(resolution).find((item) => item.status === "DERIVED")); derived.weakestTrust = "VERIFIED"; const { derivedHash: _derivedHash, ...derivedBody } = derived; derived.derivedHash = hashBody(derivedBody, []);
  assert.throws(() => parseDerivedKnowledge(derived), /aggregates/);
  const invalidOutput = structuredClone(deriveKnowledge(resolution).find((item) => item.status === "DERIVED")); invalidOutput.result = "true"; const { derivedHash: _invalidHash, ...invalidBody } = invalidOutput; invalidOutput.derivedHash = hashBody(invalidBody, []); assert.throws(() => parseDerivedKnowledge(invalidOutput), /expected boolean/);
  const invalidReason = structuredClone(deriveKnowledge(resolution).find((item) => item.status === "DERIVED")); invalidReason.reasonCodes = ["UNREGISTERED_REASON"]; const { derivedHash: _reasonHash, ...reasonBody } = invalidReason; invalidReason.derivedHash = hashBody(reasonBody, []); assert.throws(() => parseDerivedKnowledge(invalidReason), /expected one of/);

  const snapshot = buildWorldKnowledgeSnapshot(snapshotInput("synthetic-spot-philipps-casa", resolution)); const wrongValue = structuredClone(snapshot); wrongValue.capabilities[0].value = "true"; assert.throws(() => parseWorldKnowledgeSnapshot(rehashSnapshot(wrongValue)), /preserve its registered derived proof/);
  const unknownOutput = structuredClone(snapshot); unknownOutput.capabilities[0].key = "capability.unregistered"; assert.throws(() => parseWorldKnowledgeSnapshot(rehashSnapshot(unknownOutput)), /unknown capability rule output/);
  const readyWithoutPolicy = structuredClone(snapshot); const opening = readyWithoutPolicy.readiness.find((item) => item.useCase === "OPENING_HOURS_ELIGIBILITY"); opening.state = "READY"; opening.reasonCodes = ["OPENING_HOURS_PRESENT"]; assert.throws(() => parseWorldKnowledgeSnapshot(rehashSnapshot(readyWithoutPolicy)), /source policy/);
});

test("public temporal constructor validates direct runtime schedules", () => {
  assert.throws(() => effectiveVenueHours("2026-02-31", null, null), /calendar date/);
  assert.throws(() => effectiveVenueHours("2026-01-15", [{ day: "FUNDAY", intervals: [] }], null), /expected one of/);
});
