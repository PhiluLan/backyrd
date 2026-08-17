import assert from "node:assert/strict";
import test from "node:test";
import { orderingMissReason, retrievalShortlistingExperiments, retrievalShortlistingManifest } from "../src/wave2.4-retrieval-shortlisting.mjs";

const spot = (id, source, score, evidence = []) => ({ spot_id: id, source, source_rank: 1, source_score: score, evidence });
const input = (projectionRows) => ({
  projectionRuns: [{ projection: { id: "base" }, observed: {
    distributedV12: projectionRows.filter((row) => row.source === "personalized_v12").map((row) => ({ spot_id: row.spot_id, evidence: row })),
    distributedSemantic: projectionRows.filter((row) => row.source === "semantic_v13").map((row) => ({ spot_id: row.spot_id, evidence: row })),
    structuredCandidates: projectionRows.filter((row) => row.source === "structured_category_v1").map((row) => ({ spot_id: row.spot_id, evidence: row })),
    lexicalCandidates: projectionRows.filter((row) => row.source === "lexical_v1").map((row) => ({ spot_id: row.spot_id, evidence: row })),
    retrievalUnion: projectionRows,
  } }],
  catalogResult: { rows: [] }, request: { query: "quiet cafe" }, structuredIntent: {}, observedSpotSignals: {},
  wave23Candidates: projectionRows.map((row, index) => ({ spot_id: row.spot_id, evidence: [row], union_rank: index + 1 })), budget: 20, shortlistK: 2,
});

test("tie-safe calibration does not turn a constant source score into perfect confidence", () => {
  const rows = [spot("a", "semantic_v13", 0.7), spot("b", "semantic_v13", 0.7), spot("c", "semantic_v13", 0.7)];
  const result = retrievalShortlistingExperiments(input(rows)).H1_TIE_SAFE_CALIBRATION;
  assert.ok(result.every((candidate) => candidate.evidence[0].calibrated_score_v2 === 0.5));
  assert.ok(result.every((candidate) => candidate.evidence[0].score_is_tied));
});

test("independent source families provide bounded corroboration without duplicate-source inflation", () => {
  const rows = [
    spot("multi", "semantic_v13", 0.8),
    spot("multi", "structured_category_v1", 0.8, ["category:cafe"]),
    spot("single", "semantic_v13", 0.8),
  ];
  const result = retrievalShortlistingExperiments(input(rows)).H2_FAMILY_CORROBORATION;
  const multi = result.find((candidate) => candidate.spot_id === "multi");
  const single = result.find((candidate) => candidate.spot_id === "single");
  assert.ok(multi.retrieval_score > single.retrieval_score);
  assert.equal(multi.evidence_model.independent_family_count, 2);
  assert.equal(single.evidence_model.independent_family_count, 1);
});

test("shortlist preserves evidence, before/after ranks, budget and deterministic inclusion reason", () => {
  const rows = [spot("a", "personalized_v12", 0.9), spot("b", "semantic_v13", 0.8), spot("c", "lexical_v1", 0.7)];
  const first = retrievalShortlistingExperiments(input(rows)).H2_FAMILY_CORROBORATION;
  const second = retrievalShortlistingExperiments(input(rows)).H2_FAMILY_CORROBORATION;
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(first.filter((candidate) => candidate.shortlist).length, 2);
  assert.ok(first.every((candidate) => candidate.pre_shortlist_rank && candidate.post_shortlist_rank));
  assert.equal(first[2].top20_decision, "EXCLUDED_SCORE_BELOW_CUTOFF");
});

test("miss classification separates absent, tied, corroborated, structured and semantic-only evidence", () => {
  assert.equal(orderingMissReason(null), "COVERAGE_MISS");
  assert.equal(orderingMissReason({ evidence_model: { independent_family_count: 0, tied_source_count: 0, source_count: 0 } }), "EVIDENCE_MISSING_IN_SHORTLIST");
  assert.equal(orderingMissReason({ evidence_model: { independent_family_count: 1, tied_source_count: 1, source_count: 1 } }), "SOURCE_SCORE_TIE_CALIBRATION");
  assert.equal(orderingMissReason({ evidence_model: { independent_family_count: 3, tied_source_count: 0, source_count: 4 } }), "MULTI_SOURCE_EVIDENCE_UNDERESTIMATED");
  assert.equal(orderingMissReason({ evidence_model: { independent_family_count: 1, tied_source_count: 0, source_count: 2, structured: 0.6 } }), "STRUCTURED_EVIDENCE_UNDERESTIMATED");
  assert.equal(orderingMissReason({ evidence_model: { independent_family_count: 1, tied_source_count: 0, source_count: 2, structured: 0, semantic: 0.4, directed: 0 } }), "SEMANTIC_EVIDENCE_ONLY");
});

test("manifest explicitly prohibits evaluator, latent and holdout-label inputs", () => {
  const manifest = retrievalShortlistingManifest();
  assert.equal(manifest.latentTruthUse, "EVALUATION_ONLY");
  assert.ok(manifest.prohibitedInputs.includes("ground_truth_utility"));
  assert.ok(manifest.prohibitedInputs.includes("locked_holdout_labels"));
  assert.ok(manifest.rejectedMechanisms.includes("fixed_source_quotas"));
});
