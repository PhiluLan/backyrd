import assert from "node:assert/strict";
import test from "node:test";
import { createWorldResearchBatch, parseWorldResearchBatch } from "../dist/index.js";

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
