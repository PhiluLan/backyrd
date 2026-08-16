import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRetrievalEvidence, catalogAttributeRetrieval, retrievalBreakthroughManifest } from "../src/wave2.2-retrieval-breakthrough.mjs";

const catalog = (id, document, placeType = "cafe", price = 2) => ({ spot_id: id, name: id, category_name: placeType, place_type: placeType, price_level: price, document_text: document, availability: { category: "KNOWN", document: "KNOWN", price: "KNOWN", location: "KNOWN", opening_hours: "KNOWN" } });
const intent = { hardConstraints: { requiredPlaceTypes: [], excludedPlaceTypes: [], openNow: false }, softPreferences: { placeTypes: [], moods: [] } };

test("catalog attributes provide directed mood evidence without latent truth", () => {
  const rows = catalogAttributeRetrieval({ catalogResult: { rows: [catalog("quiet", "Moods: quiet cozy"), catalog("loud", "Moods: lively")] }, request: { query: "ruhig und gemütlich" }, structuredIntent: intent, limit: 20 });
  assert.equal(rows[0].spot_id, "quiet");
  assert.ok(rows[0].evidence.includes("mood:quiet"));
  assert.ok(rows[0].evidence.includes("mood:cozy"));
  assert.equal(JSON.stringify(rows).includes("utility"), false);
});

test("evidence aggregation caps repeated projections and rewards independent source overlap", () => {
  const observed = (sourceRows) => ({ structuredCandidates: sourceRows, lexicalCandidates: [], distributedSemantic: [], distributedV12: [], retrievalUnion: [] });
  const candidate = (id, rank) => ({ spot_id: id, evidence: { source: "structured_category_v1", source_rank: rank, source_score: 1, evidence: ["category:cafe"] } });
  const projections = [
    { projection: { id: "base" }, observed: observed([candidate("repeated", 1), candidate("overlap", 2)]) },
    { projection: { id: "vibe" }, observed: observed([candidate("repeated", 1)]) },
    { projection: { id: "semantic_concept" }, observed: { structuredCandidates: [], lexicalCandidates: [], distributedSemantic: [{ spot_id: "overlap", similarity: 0.8 }], distributedV12: [], retrievalUnion: [] } },
  ];
  const rows = aggregateRetrievalEvidence({ projectionRuns: projections, catalogResult: [], request: { query: "cafe" }, structuredIntent: intent, poolLimit: 20 });
  assert.equal(rows[0].spot_id, "overlap");
  assert.equal(rows[0].source_overlap, 2);
  assert.equal(rows.find((row) => row.spot_id === "repeated").source_overlap, 1);
});

test("candidate budget and deterministic ordering are enforced", () => {
  const catalogRows = Array.from({ length: 100 }, (_, index) => catalog(`spot-${String(index).padStart(3, "0")}`, "Moods: quiet"));
  const input = { projectionRuns: [], catalogResult: { rows: catalogRows }, request: { query: "ruhig" }, structuredIntent: intent, poolLimit: 80 };
  assert.deepEqual(aggregateRetrievalEvidence(input), aggregateRetrievalEvidence(input));
  assert.equal(aggregateRetrievalEvidence(input).length, 80);
  assert.equal(retrievalBreakthroughManifest().latentTruthUse, "EVALUATION_ONLY");
});
