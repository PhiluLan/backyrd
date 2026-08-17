import assert from "node:assert/strict";
import test from "node:test";
import { buildObservedSpotSignals, retrievalRebuildManifest, retrievalShortlist, specializedRecallSources } from "../src/wave2.3-retrieval-rebuild.mjs";

const catalog = [
  { spot_id: "open", name: "Open Cozy Cafe", category_name: "cafe", place_type: "cafe", price_level: 2, is_open_now: true, document_text: "cozy quiet", availability: { category: "KNOWN", document: "KNOWN", price: "KNOWN", location: "KNOWN", opening_hours: "KNOWN" } },
  { spot_id: "closed", name: "Closed Cozy Cafe", category_name: "cafe", place_type: "cafe", price_level: 2, is_open_now: false, document_text: "cozy quiet", availability: { category: "KNOWN", document: "KNOWN", price: "KNOWN", location: "KNOWN", opening_hours: "KNOWN" } },
  { spot_id: "unknown", name: "Unknown Bar", category_name: "bar", place_type: "bar", price_level: null, is_open_now: null, document_text: null, availability: { category: "KNOWN", document: "UNKNOWN", price: "UNKNOWN", location: "KNOWN", opening_hours: "UNKNOWN" } },
];

test("observed quality signals accept only Product-observable rows and are deterministic", () => {
  const input = {
    spots: catalog.map((row) => ({ id: row.spot_id })),
    reviews: [{ spotId: "open", text: "Würde wiederkommen.", moods: ["cozy"] }],
    interactions: [{ spotId: "open", type: "like" }, { spotId: "closed", type: "dislike" }],
  };
  const first = buildObservedSpotSignals(input);
  const second = buildObservedSpotSignals(structuredClone(input));
  assert.deepEqual(first, second);
  assert.ok(first.open.action_quality > first.closed.action_quality);
  assert.equal(Object.hasOwn(first.open, "utility"), false);
  assert.equal(Object.hasOwn(first.open, "latent"), false);
});

test("specialized sources separate category, lexical, vibe, availability and quality evidence", () => {
  const observedSpotSignals = buildObservedSpotSignals({ spots: catalog.map((row) => ({ id: row.spot_id })), reviews: [{ spotId: "open", text: "Würde wiederkommen.", moods: ["cozy"] }] });
  const sources = specializedRecallSources({ catalogResult: catalog, request: { query: "cozy cafe", rawFreeText: "cozy cafe", preferredPlaceTypes: ["cafe"] }, structuredIntent: { hardConstraints: { requiredPlaceTypes: [] }, softPreferences: { placeTypes: ["cafe"] } }, observedSpotSignals });
  const names = sources.map((rows) => rows[0].source);
  assert.ok(names.includes("availability_v1"));
  assert.ok(names.includes("category_entity_v1"));
  assert.ok(names.includes("vibe_review_v1"));
  assert.ok(names.includes("observed_quality_v1"));
});

test("shortlisting is deterministic, deduplicated, budgeted and preserves evidence", () => {
  const specializedSources = specializedRecallSources({ catalogResult: catalog, request: { query: "cozy cafe", rawFreeText: "cozy cafe" }, structuredIntent: { hardConstraints: { requiredPlaceTypes: [] }, softPreferences: { placeTypes: [] } }, observedSpotSignals: {} });
  const input = { projectionRuns: [], specializedSources, budget: 2, shortlistK: 1 };
  const first = retrievalShortlist(input);
  const second = retrievalShortlist(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.equal(new Set(first.map((row) => row.spot_id)).size, 2);
  assert.equal(first[0].shortlist, true);
  assert.ok(first[0].evidence.length > 0);
});

test("closed high lexical evidence cannot outrank equivalent open evidence in availability-aware shortlist", () => {
  const specializedSources = specializedRecallSources({ catalogResult: catalog.slice(0, 2), request: { query: "cozy cafe", rawFreeText: "cozy cafe" }, structuredIntent: { hardConstraints: { requiredPlaceTypes: [] }, softPreferences: { placeTypes: ["cafe"] } }, observedSpotSignals: {} });
  const rows = retrievalShortlist({ projectionRuns: [], specializedSources, budget: 2, shortlistK: 2, availabilityAware: true, qualityAware: false });
  assert.equal(rows[0].spot_id, "open");
  assert.equal(rows[1].spot_id, "closed");
});

test("manifest explicitly prohibits latent and evaluator inputs", () => {
  const manifest = retrievalRebuildManifest();
  assert.equal(manifest.latentTruthUse, "EVALUATION_ONLY");
  assert.ok(manifest.prohibitedInputs.includes("ground_truth_utility"));
  assert.equal(manifest.promotionK, 20);
  assert.equal(manifest.candidateBudget, 80);
});
