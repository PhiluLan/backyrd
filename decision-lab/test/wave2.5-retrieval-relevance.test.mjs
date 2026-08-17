import assert from "node:assert/strict";
import test from "node:test";
import { queryRelevanceIntent, retrievalRelevanceExperiments, retrievalRelevanceManifest } from "../src/wave2.5-retrieval-relevance.mjs";

const evidence = (source, score = 0.5) => ({ source, projection: "base", source_rank: 1, source_score: score, calibrated_score_v2: score, evidence: [] });
const catalog = (rows) => ({ rows: rows.map((row) => ({ availability: { category: "KNOWN", document: "KNOWN", price: "KNOWN" }, ...row })) });
const intent = { hardConstraints: { requiredPlaceTypes: [], excludedPlaceTypes: [], openNow: false }, softPreferences: { placeTypes: [] } };

test("query contract extracts current category, mood, audience, occasion and price without user history", () => {
  const result = queryRelevanceIntent({
    request: { query: "gemütliches günstiges Date", audience: ["date"], occasions: ["evening"], preferredPlaceTypes: ["cafe"] },
    structuredIntent: intent,
  });
  assert.deepEqual(result.preferredCategories, ["cafe"]);
  assert.deepEqual(result.explicitMoods.sort(), ["cozy", "romantic"]);
  assert.equal(result.cheap, true);
  assert.deepEqual(result.audienceMoods, ["romantic", "cozy"]);
  assert.deepEqual(result.occasionMoods, ["cozy", "romantic", "social"]);
  assert.equal(Object.hasOwn(result, "userHistory"), false);
});

test("deterministic relevance promotes query-fit over globally strong but irrelevant evidence", () => {
  const candidates = [
    { spot_id: "loud", union_rank: 1, evidence: [evidence("observed_quality_v1", 1), evidence("semantic_v13", 0.9)] },
    { spot_id: "cozy", union_rank: 2, evidence: [evidence("lexical_entity_v2", 0.7)] },
  ];
  const experiments = retrievalRelevanceExperiments({
    request: { query: "gemütliches Date", audience: ["date"], occasions: ["evening"], preferredPlaceTypes: [] }, structuredIntent: intent,
    catalogResult: catalog([
      { spot_id: "loud", place_type: "bar", name: "Loud", category_name: "Bar", document_text: "laut lebhaft urban", price_level: 3 },
      { spot_id: "cozy", place_type: "cafe", name: "Cozy", category_name: "Café", document_text: "gemütlich romantisch warm", price_level: 2 },
    ]), wave24Candidates: candidates, shortlistK: 1,
  });
  assert.equal(experiments.H1_DETERMINISTIC_STRUCTURED[0].spot_id, "cozy");
  assert.equal(experiments.H1_DETERMINISTIC_STRUCTURED[0].top20_decision, "INCLUDED_BY_QUERY_RELEVANCE");
  assert.equal(experiments.H1_DETERMINISTIC_STRUCTURED[1].pre_relevance_rank, 1);
});

test("unknown Spot data is neutral rather than negative", () => {
  const candidates = [{ spot_id: "unknown", union_rank: 1, evidence: [] }];
  const result = retrievalRelevanceExperiments({
    request: { query: "nicht teuer", audience: [], occasions: [], preferredPlaceTypes: [] }, structuredIntent: intent,
    catalogResult: catalog([{ spot_id: "unknown", place_type: null, name: null, category_name: null, document_text: null, price_level: null }]),
    wave24Candidates: candidates,
  }).H1_DETERMINISTIC_STRUCTURED[0];
  const price = result.relevance_evidence.signals.find((signal) => signal.key === "price");
  assert.equal(price.status, "UNKNOWN");
  assert.equal(price.value, 0.5);
});

test("candidate identity, evidence, ranks and deterministic output remain stable", () => {
  const input = {
    request: { query: "ruhig", audience: ["solo"], occasions: ["afternoon"], preferredPlaceTypes: [] }, structuredIntent: intent,
    catalogResult: catalog([
      { spot_id: "a", place_type: "cafe", name: "A", category_name: "Café", document_text: "ruhig inspirierend", price_level: 2 },
      { spot_id: "b", place_type: "bar", name: "B", category_name: "Bar", document_text: "laut lebhaft", price_level: 2 },
    ]),
    wave24Candidates: [{ spot_id: "a", union_rank: 2, evidence: [evidence("semantic_v13", 0.5)] }, { spot_id: "b", union_rank: 1, evidence: [evidence("semantic_v13", 0.8)] }],
    shortlistK: 1,
  };
  const first = retrievalRelevanceExperiments(input);
  const second = retrievalRelevanceExperiments(input);
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.H2_STRUCTURED_PLUS_RETRIEVAL.map((row) => row.spot_id)), new Set(["a", "b"]));
  assert.ok(first.H2_STRUCTURED_PLUS_RETRIEVAL.every((row) => Array.isArray(row.evidence)));
});

test("manifest prevents personalization, latent labels, learned leakage and uncontrolled AI", () => {
  const manifest = retrievalRelevanceManifest();
  assert.ok(manifest.prohibitedInputs.includes("user_history"));
  assert.ok(manifest.prohibitedInputs.includes("ground_truth_utility"));
  assert.equal(manifest.learnedArm.status, "NOT_SCIENTIFICALLY_EXECUTABLE");
  assert.equal(manifest.aiArm.status, "NOT_OPERATIONALLY_JUSTIFIED");
  assert.equal(manifest.latentTruthUse, "EVALUATION_ONLY");
});
