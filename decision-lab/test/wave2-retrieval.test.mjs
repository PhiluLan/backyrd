import assert from "node:assert/strict";
import test from "node:test";
import { loadCanonicalDecisionHandler } from "../src/canonical-engine.mjs";

const sourceUrl = new URL("../../supabase/functions/decision-wave2/index.ts", import.meta.url);
const env = { DECISION_LAB_SUPABASE_URL: "http://127.0.0.1:54321", DECISION_LAB_SERVICE_ROLE_KEY: "synthetic" };
let loaded;
test.before(async () => { loaded = await loadCanonicalDecisionHandler({ env, embeddingMode: "FAST_SIMULATION", sourceUrl }); });
test.after(() => loaded.restore());

const intent = (overrides = {}) => ({
  version: "decision-intent-v1",
  hardConstraints: { requiredPlaceTypes: [], excludedPlaceTypes: [], openNow: false, ...overrides.hardConstraints },
  softPreferences: { placeTypes: [], ...overrides.softPreferences },
  extraction: { mode: "deterministic_v1", confidence: "high", unknown: [], evidence: [] },
});

const spot = (id, placeType, extras = {}) => ({
  version: "spot-intelligence-v1", spot_id: id, name: extras.name ?? `Spot ${id}`, city: "Synthetic Basel",
  status: extras.status ?? "approved", category_name: placeType, place_type: placeType,
  price_level: extras.price ?? 2, lat: 47.55, lng: 7.59, is_open_now: extras.open ?? true,
  document_text: extras.document ?? `${placeType} cozy quiet`, document_version: "decision-lab-observed-v1",
  document_updated_at: "2026-08-11T12:00:00Z",
  availability: { category: "KNOWN", document: extras.document === null ? "UNKNOWN" : "KNOWN", price: "KNOWN", location: "KNOWN", opening_hours: extras.open === null ? "UNKNOWN" : "KNOWN" },
});

const distribution = (...rows) => new Map(rows.map(([id, eligible]) => [id, { entity_id: id, eligible, distribution_priority: eligible ? 100 : 0 }]));

test("structured source retrieves the eligible category and keeps sparse observed data visible", () => {
  const { structuredRetrievalV1 } = loaded.exports;
  const rows = [spot("cafe-sparse", "cafe", { document: null }), spot("bar", "bar")];
  const result = structuredRetrievalV1(rows, intent({ hardConstraints: { requiredPlaceTypes: ["cafe"] } }), 50);
  assert.deepEqual(result.map((row) => row.spot_id), ["cafe-sparse"]);
  assert.equal(result[0].evidence.source, "structured_category_v1");
  assert.match(result[0].evidence.evidence.join(" "), /completeness/);
});

test("lexical source preserves token evidence and deterministic source rank", () => {
  const { lexicalRetrievalV1 } = loaded.exports;
  const rows = [spot("b", "culture", { name: "Basel Kunsthalle", document: "inspirierend ungewöhnlich kunst" }), spot("a", "cafe", { document: "quiet coffee" })];
  const first = lexicalRetrievalV1(rows, "ungewöhnlich inspirierend entdecken", 10);
  const second = lexicalRetrievalV1(rows, "ungewöhnlich inspirierend entdecken", 10);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((row) => row.spot_id), ["b"]);
  assert.equal(first[0].evidence.source_rank, 1);
  assert.ok(first[0].evidence.evidence.some((item) => item.includes("inspirierend")));
});

test("canonical union deduplicates Spot IDs and preserves every source evidence row", () => {
  const { candidateUnionV1 } = loaded.exports;
  const base = { spot_id: "same", name: "Same", city: "Synthetic Basel", category_name: "cafe", is_open_now: true, document_text: "cozy" };
  const union = candidateUnionV1([
    [{ ...base, evidence: { source: "structured_category_v1", source_rank: 2, source_score: 0.8, evidence: ["category:cafe"] } }],
    [{ ...base, evidence: { source: "lexical_v1", source_rank: 1, source_score: 1, evidence: ["token:cozy"] } }],
  ]);
  assert.equal(union.length, 1);
  assert.deepEqual(union[0].evidence_list.map((row) => row.source), ["structured_category_v1", "lexical_v1"]);
});

test("Product, Distribution and Wave 1 hard constraints protect every retrieval source", () => {
  const { eligibleSpotIntelligence } = loaded.exports;
  const rows = [
    spot("valid", "cafe"), spot("pending", "cafe", { status: "pending" }),
    spot("quarantined", "cafe"), spot("bar", "bar"), spot("closed", "cafe", { open: false }),
  ];
  const result = eligibleSpotIntelligence(rows, intent({ hardConstraints: { requiredPlaceTypes: ["cafe"], excludedPlaceTypes: ["bar"], openNow: true } }), distribution(["valid", true], ["pending", true], ["quarantined", false], ["bar", true], ["closed", true]));
  assert.deepEqual(result.eligible.map((row) => row.spot_id), ["valid"]);
  assert.deepEqual(result.exclusions.map((row) => row.constraint), ["HARD_CATEGORY", "OPEN_NOW"]);
});

test("source limits are exact and an empty/degraded source cannot erase another source", () => {
  const { structuredRetrievalV1, candidateUnionV1 } = loaded.exports;
  const rows = Array.from({ length: 20 }, (_, index) => spot(String(index).padStart(2, "0"), "cafe"));
  const limited = structuredRetrievalV1(rows, intent(), 7);
  assert.equal(limited.length, 7);
  assert.equal(candidateUnionV1([[], limited]).length, 7);
});

test("Spot Intelligence field roles are explicit and missing evidence is not negative evidence", () => {
  const contract = loaded.module.SPOT_INTELLIGENCE_FIELD_CONTRACT_V1;
  assert.equal(contract.status, "REQUIRED_FOR_ELIGIBILITY");
  assert.equal(contract.category, "REQUIRED_FOR_RETRIEVAL");
  assert.equal(contract.ml_document, "VALUABLE_FOR_RETRIEVAL");
  assert.equal(contract.occasion_context, "UNKNOWN_LOW_CONFIDENCE");
  const sparse = spot("sparse", "cafe", { document: null, price: null, open: null });
  const rows = loaded.exports.structuredRetrievalV1([sparse], intent({ softPreferences: { placeTypes: ["cafe"] } }), 10);
  assert.equal(rows.length, 1);
  assert.match(rows[0].evidence.evidence.join(" "), /completeness:/);
});
