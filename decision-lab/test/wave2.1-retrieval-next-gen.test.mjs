import assert from "node:assert/strict";
import test from "node:test";
import { syntheticJwt } from "../src/d3.1-canonical-adapters.mjs";
import { buildRetrievalProjections, candidateUnionNextGen, classifyRetrievalMisses, oracleRecallAtKCapacity, retrievalNextGenManifest } from "../src/wave2.1-retrieval-next-gen.mjs";

const observed = (source, rows) => ({
  distributedV12: source === "personalized_v12" ? rows : [],
  structuredCandidates: source === "structured_category_v1" ? rows.map((row, index) => ({ ...row, evidence: { source, source_rank: index + 1, source_score: 1, evidence: ["structured"] } })) : [],
  lexicalCandidates: source === "lexical_v1" ? rows.map((row, index) => ({ ...row, evidence: { source, source_rank: index + 1, source_score: 1, evidence: ["lexical"] } })) : [],
  distributedSemantic: source === "semantic_v13" ? rows.map((row, index) => ({ ...row, similarity: 0.8 - index / 100 })) : [],
  retrievalUnion: rows,
});

test("query decomposition separates hard category, lexical, vibe and context without latent input", () => {
  const projections = buildRetrievalProjections({
    request: { query: "gemütliches Date, nicht teuer, Drinks danach", rawFreeText: "gemütliches Date, nicht teuer, Drinks danach", audience: ["date"], occasions: ["evening"] },
    structuredIntent: { hardConstraints: { requiredPlaceTypes: ["cafe"] }, softPreferences: { placeTypes: [] } },
  });
  assert.ok(projections.some((row) => row.id === "category" && row.query.includes("Café")));
  assert.ok(projections.some((row) => row.id === "vibe" && row.query.includes("gemütlich")));
  assert.ok(projections.some((row) => row.id === "occasion_context" && row.query.includes("date")));
  assert.equal(JSON.stringify(projections).includes("latent"), false);
});

test("query decomposition cannot read hidden scenario preferences or context", () => {
  const request = { query: "etwas passendes", rawFreeText: "etwas passendes", audience: ["solo"], occasions: ["afternoon"] };
  const structuredIntent = { hardConstraints: { requiredPlaceTypes: [] }, softPreferences: { placeTypes: [] } };
  const baseline = buildRetrievalProjections({ request, structuredIntent });
  const tampered = buildRetrievalProjections({
    request,
    structuredIntent,
    scenario: { context: { weather: "rain", indoorRequired: true }, softPreferences: { moods: { cozy: 1, quiet: 1 } } },
  });
  assert.deepEqual(tampered, baseline);
  assert.equal(JSON.stringify(tampered).includes("gemütlich"), false);
  assert.equal(JSON.stringify(tampered).includes("rain"), false);
});

test("RRF union deduplicates, preserves projection evidence and is deterministic", () => {
  const runs = [
    { projection: { id: "base" }, observed: observed("semantic_v13", [{ spot_id: "a" }, { spot_id: "b" }]) },
    { projection: { id: "vibe" }, observed: observed("semantic_v13", [{ spot_id: "b" }, { spot_id: "c" }]) },
    { projection: { id: "lexical_specificity" }, observed: observed("lexical_v1", [{ spot_id: "a" }]) },
  ];
  const first = candidateUnionNextGen(runs, { limit: 20 });
  const second = candidateUnionNextGen(runs, { limit: 20 });
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.map((row) => row.spot_id)).size, first.length);
  assert.ok(first.find((row) => row.spot_id === "a").evidence.some((row) => row.projection === "lexical_specificity"));
  assert.ok(first.find((row) => row.spot_id === "b").evidence.length > 1);
});

test("oracle capacity exposes an unreachable Recall@20 gate without changing it", () => {
  const truth = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`s${index}`, 0.7]));
  assert.deepEqual(oracleRecallAtKCapacity(truth, 20, 0.6), { relevant: 50, capacity: 0.4 });
});

test("root-cause attribution distinguishes query representation, source ordering and source gap", () => {
  const world = { spots: [
    { id: "query", category: "cafe", observed: { name: "Query", description: "rich", priceLevel: 2, lat: 1, lng: 1, moods: ["cozy"] } },
    { id: "deep", category: "cafe", observed: { name: "Deep", description: "rich", priceLevel: 2, lat: 1, lng: 1, moods: ["cozy"] } },
    { id: "gap", category: "cafe", observed: { name: "Gap", description: "rich", priceLevel: 2, lat: 1, lng: 1, moods: ["cozy"] } },
  ] };
  const deepRows = Array.from({ length: 25 }, (_, index) => ({ spot_id: index === 24 ? "deep" : `f${index}` }));
  const projectionRuns = [
    { projection: { id: "base" }, observed: observed("semantic_v13", deepRows) },
    { projection: { id: "vibe" }, observed: observed("semantic_v13", [{ spot_id: "query" }]) },
  ];
  const nextUnion = candidateUnionNextGen(projectionRuns, { limit: 100 });
  const rows = classifyRetrievalMisses({ world, truth: { query: 0.8, deep: 0.8, gap: 0.8 }, baseUnion: deepRows, nextUnion, projectionRuns, k: 1 });
  assert.equal(rows.find((row) => row.spotId === "query").primaryCause, "QUERY_REPRESENTATION_FAILURE");
  assert.equal(rows.find((row) => row.spotId === "deep").primaryCause, "SOURCE_ORDERING_FAILURE");
  assert.equal(rows.find((row) => row.spotId === "gap").primaryCause, "SOURCE_GAP");
});

test("manifest explicitly preserves scientific separation", () => {
  const manifest = retrievalNextGenManifest();
  assert.equal(manifest.latentTruthUse, "EVALUATION_ONLY");
  assert.equal(manifest.engineInputRule, "OBSERVED_DATA_ONLY");
});

test("synthetic Lab tokens tolerate local clock skew without changing lifetime", () => {
  const before = Math.floor(Date.now() / 1000);
  const [, encodedPayload] = syntheticJwt("00000000-0000-4000-8000-000000000001", "wave2.1-test-secret").split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.ok(payload.iat <= before - 29);
  assert.ok(payload.iat >= before - 31);
  assert.equal(payload.exp - payload.iat, 3600);
  assert.equal(payload.role, "authenticated");
});
