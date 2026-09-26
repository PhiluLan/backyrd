import assert from "node:assert/strict";
import test from "node:test";
import { createWorldResearchBatch, parseWorldResearchBatch, planWorldResearchSpot, validateAuthoringSubmission, hashBody } from "../dist/index.js";

const spotId = "a1100000-0000-4000-8000-000000000001";
const makeBatch = () => createWorldResearchBatch({
  batchId: "b2200000-0000-4000-8000-000000000002",
  createdAt: "2026-09-26T12:00:00.000Z",
  spots: [{
    spotId,
    name: "Nomad Eatery & Bar",
    locality: "Basel",
    manifestHash: "a".repeat(64),
    existingValues: { "identity.name": { claimId: "c3300000-0000-4000-8000-000000000003", knowledgeState: "KNOWN_VALUE", value: "Nomad Eatery & Bar" } },
  }],
});

test("exports and validates a bounded Nomad research batch", () => {
  const document = makeBatch();
  document.research.spots[0].claims.push({
    attributeKey: "purpose.primary_visit",
    knowledgeState: "KNOWN_VALUE",
    value: "EAT_DRINK",
    source: {
      url: "https://nomad.ch/eatery",
      evidence: "The official venue page describes the Eatery and Bar offering.",
      observedAt: "2026-09-26T12:05:00.000Z",
      trust: "OFFICIAL_PRIMARY",
    },
  });
  document.research.spots[0].unresolved.push({ attributeKey: "capacity.seats_total", reason: "No reliable public capacity was found." });
  const parsed = parseWorldResearchBatch(document);
  assert.equal(parsed.validatedClaims.get(spotId)?.length, 1);
  assert.equal(parsed.validatedClaims.get(spotId)?.[0].value, "EAT_DRINK");
});

test("unresolved fields never become claims", () => {
  const document = makeBatch();
  document.research.spots[0].unresolved.push({ attributeKey: "operation.takeaway", reason: "The source does not state this." });
  assert.deepEqual(parseWorldResearchBatch(document).validatedClaims.get(spotId), []);
});

test("rejects tampered catalog and export binding", () => {
  const document = makeBatch();
  document.fieldCatalog[0].label = "tampered";
  assert.throws(() => parseWorldResearchBatch(document), /world_research_catalog_drift/);
});

test("rejects unsupported values, insecure sources and UNKNOWN claims", () => {
  for (const mutation of [
    { knowledgeState: "KNOWN_VALUE", value: "NOT_A_PURPOSE", url: "https://nomad.ch/eatery" },
    { knowledgeState: "KNOWN_VALUE", value: "EAT_DRINK", url: "http://nomad.ch/eatery" },
    { knowledgeState: "UNKNOWN", value: null, url: "https://nomad.ch/eatery" },
  ]) {
    const document = makeBatch();
    document.research.spots[0].claims.push({
      attributeKey: "purpose.primary_visit",
      knowledgeState: mutation.knowledgeState,
      value: mutation.value,
      source: { url: mutation.url, evidence: "Official public description.", observedAt: "2026-09-26T12:05:00.000Z", trust: "OFFICIAL_PRIMARY" },
    });
    assert.throws(() => parseWorldResearchBatch(document));
  }
});

test("refuses batches larger than ten spots", () => {
  const spots = Array.from({ length: 11 }, (_, index) => ({
    spotId: `a1100000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Spot ${index}`,
    locality: "Basel",
    manifestHash: "a".repeat(64),
    existingValues: {},
  }));
  assert.throws(() => createWorldResearchBatch({ batchId: "b2200000-0000-4000-8000-000000000002", createdAt: "2026-09-26T12:00:00.000Z", spots }), /world_research_export_input_invalid/);
});

const source = { url: "https://example.org/venue", evidence: "Official venue information.", observedAt: "2026-09-26T12:00:00Z", trust: "OFFICIAL_PRIMARY" };
const claim = (attributeKey, value) => ({ attributeKey, value, knowledgeState: "KNOWN_VALUE", source });
const current = (value, knowledgeState = "KNOWN_VALUE") => ({ value, knowledgeState, claimId: "c3300000-0000-4000-8000-000000000003" });
const plan = (claims, values = {}, confirmations = {}) => planWorldResearchSpot({ claims, current: values, confirmations, observedAt: source.observedAt });

test("every exported field has a value contract, examples pass canonical validation", () => {
  const doc = makeBatch();
  assert.equal(doc.contractVersion, "backyrd.world-research-batch@1.1");
  for (const field of doc.fieldCatalog) {
    assert.ok(field.valueSchema, field.attributeKey);
    assert.ok(field.valueRules.length, field.attributeKey);
    if (field.valueExample !== undefined) assert.equal(validateAuthoringSubmission(field.attributeKey, "KNOWN_VALUE", field.valueExample).ok, true, field.attributeKey);
  }
  assert.match(doc.fieldCatalog.find(f => f.attributeKey === "hours.regular").valueRules.join(" "), /24:00/);
});

test("old v1.0 documents remain hash-bound and accepted", () => {
  const doc = makeBatch(); doc.contractVersion = "backyrd.world-research-batch@1.0";
  doc.fieldCatalog = doc.fieldCatalog.map(({ attributeKey, valueType, label, help, allowedValues }) => ({ attributeKey, valueType, label, help, allowedValues }));
  const { contractVersion, purpose, batch, fieldCatalog } = doc;
  doc.exportHash = hashBody({ contractVersion, purpose, batch, fieldCatalog }, []);
  assert.doesNotThrow(() => parseWorldResearchBatch(doc));
  doc.fieldCatalog[0].valueSchema = {};
  assert.throws(() => parseWorldResearchBatch(doc), /catalog_drift/);
});

test("UNKNOWN category needs explicit review; dependent place types wait without failing writes", () => {
  const values = { "classification.primary_category": current(null, "UNKNOWN") };
  const claims = [claim("classification.place_types", ["RESTAURANT", "BAR"]), claim("classification.primary_category", "EAT")];
  const first = plan(claims, values);
  assert.equal(first.reviews.length, 1); assert.equal(first.blocked.length, 1); assert.equal(first.accepted.length, 0);
  const confirmed = plan(claims, values, { "classification.primary_category": values["classification.primary_category"].claimId });
  assert.equal(confirmed.blocked.length, 0); assert.equal(confirmed.reviews.length, 0);
  assert.equal(confirmed.accepted[0].attributeKey, "classification.primary_category");
  assert.equal(confirmed.accepted[0].supersedesClaimId, values["classification.primary_category"].claimId);
  assert.equal(confirmed.accepted.length, 2);
  assert.equal(plan(claims, values, { "classification.primary_category": "stale" }).accepted.length, 0);
});

test("incompatible place types stay blocked even after category confirmation", () => {
  assert.equal(plan([claim("classification.primary_category", "DRINKS"), claim("classification.place_types", ["RESTAURANT"])]).blocked.length, 1);
});

test("timezone derives only from confirmed CH; unknown and conflicting values require review", () => {
  assert.equal(plan([], { "location.locality": current("Basel") }).accepted.length, 0);
  assert.equal(plan([], { "location.country_code": current("US") }).accepted.length, 0);
  const ch = { "location.country_code": current("CH") };
  assert.equal(plan([], ch).accepted[0].value, "Europe/Zurich");
  assert.equal(plan([claim("location.country_code", "CH")], { "location.country_code": current("DE") }).derived.length, 0);
  assert.equal(plan([], { ...ch, "location.timezone": current(null, "UNKNOWN") }).reviews.length, 1);
  assert.equal(plan([], { ...ch, "location.timezone": current("Europe/London") }).accepted.length, 0);
});

test("Nomad schedule format supports midnight and distinct kitchen windows", () => {
  const doc = makeBatch();
  doc.research.spots[0].claims = [claim("hours.regular", [
    { day: "THURSDAY", intervals: [{ start: "06:30", end: "00:00" }] },
    { day: "SUNDAY", intervals: [{ start: "07:00", end: "23:00" }] },
  ]), claim("hours.kitchen", [{ day: "SUNDAY", intervals: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "22:00" }] }])];
  assert.equal(parseWorldResearchBatch(doc).validatedClaims.get(spotId).length, 2);
  doc.research.spots[0].claims[0].value[0].intervals[0].end = "24:00";
  assert.throws(() => parseWorldResearchBatch(doc), /value_invalid/);
});
