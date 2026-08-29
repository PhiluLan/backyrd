import assert from "node:assert/strict";
import test from "node:test";
import { validateGate2Snapshot } from "./gate2-corpus-assertions.mjs";

const passing = () => ({
  contract_version: "BASEL_LAUNCH_CORPUS_V1",
  universe: { launch_product_spots: 2, discovery_ready: 2, decision_ready: 2, detail_ready: 2, reason_ready: 2 },
  coverage: { opening_hours_any: 2, canonical_web_image: 1, effective_description: 2, n4_three_dimensions: 2, canonical_fact_any: 2, ml_document: 2, embedding: 2, stale_embedding: 0 },
  integrity: { product_visible_test_fixture: 0, broken_identity: 0, invalid_critical_coordinates: 0, broken_category_references: 0, google_place_duplicate_groups: [], normalized_identity_duplicate_groups: [], invalid_canonical_facts: [], offering_hierarchy_conflicts: [], n4_dimensions_registry: 60, pending_or_processing_embedding_jobs: 0 },
  core_intents: [{ intent: "coffee_morning", ready: true, factually_informed: 2, strong_confidence: 2 }],
  manifest: { product_spot_ids_sha256: "baseline" },
});

test("unchanged certified snapshot passes", () => {
  const snapshot = passing();
  assert.equal(validateGate2Snapshot(snapshot, structuredClone(snapshot)).verdict, "PASS");
});

for (const [name, mutate, expected] of [
  ["fixture enters Product", (s) => { s.integrity.product_visible_test_fixture = 1; }, "TEST/FIXTURE"],
  ["identity breaks", (s) => { s.integrity.broken_identity = 1; }, "identities"],
  ["coordinate breaks", (s) => { s.integrity.invalid_critical_coordinates = 1; }, "coordinates"],
  ["category reference breaks", (s) => { s.integrity.broken_category_references = 1; }, "category"],
  ["definite duplicate enters", (s) => { s.integrity.google_place_duplicate_groups = [["a", "b"]]; }, "duplicate"],
  ["canonical fact becomes invalid", (s) => { s.integrity.invalid_canonical_facts = [{}]; }, "canonical facts"],
  ["N4 registry changes", (s) => { s.integrity.n4_dimensions_registry = 59; }, "N4"],
  ["embedding becomes stale", (s) => { s.coverage.stale_embedding = 1; }, "embeddings"],
  ["launch Spot is archived", (s) => { s.manifest.product_spot_ids_sha256 = "changed"; s.universe.launch_product_spots = 1; s.universe.discovery_ready = 1; }, "membership"],
  ["hours disappear", (s) => { s.coverage.opening_hours_any = 1; }, "opening-hours"],
  ["critical facts are superseded", (s) => { s.coverage.canonical_fact_any = 1; }, "canonical-fact"],
  ["core intent depth drops", (s) => { s.core_intents[0].factually_informed = 1; }, "factual depth"],
]) {
  test(`${name} fails closed`, () => {
    const baseline = passing();
    const snapshot = structuredClone(baseline);
    mutate(snapshot);
    const result = validateGate2Snapshot(snapshot, baseline);
    assert.equal(result.verdict, "FAIL");
    assert.match(result.failures.join("\n"), new RegExp(expected, "i"));
  });
}
