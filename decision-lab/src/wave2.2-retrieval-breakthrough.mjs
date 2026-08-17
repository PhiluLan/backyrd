import { contentHash } from "./canonical-json.mjs";
import { observedCandidates } from "./wave2.1-retrieval-next-gen.mjs";

export const RETRIEVAL_BREAKTHROUGH_VERSION = "retrieval-breakthrough-v1";
export const RETRIEVAL_EVIDENCE_AGGREGATION_VERSION = "retrieval-evidence-aggregation-v1";

const SOURCE_WEIGHT = Object.freeze({
  catalog_attribute_v1: 1.1,
  lexical_v1: 1,
  structured_category_v1: 0.95,
  personalized_v12: 0.9,
  semantic_v13: 0.78,
  distribution_fallback: 0.2,
});

const GENERIC = new Set(["and", "basel", "der", "die", "ein", "eine", "etwas", "for", "fur", "für", "good", "idee", "in", "mit", "oder", "passend", "place", "spot", "the", "und", "why"]);
const MOOD_ALIASES = Object.freeze({
  cozy: ["cozy", "cosy", "gemutlich", "gemuetlich"], quiet: ["quiet", "ruhig", "leise"],
  lively: ["lively", "lebhaft", "laut"], romantic: ["romantic", "romantisch", "date"],
  urban: ["urban", "stadtlich"], inspiring: ["inspiring", "inspirierend", "besonders", "ungewohnlich"],
  chic: ["chic", "schick", "elegant", "stilvoll"], playful: ["playful", "spielerisch", "familienfreundlich"],
});

const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const unique = (values) => [...new Set(values.filter(Boolean))];
const terms = (value) => unique(normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !GENERIC.has(term)));
const catalogRows = (catalogResult) => Array.isArray(catalogResult?.rows) ? catalogResult.rows : Array.isArray(catalogResult) ? catalogResult : [];

function intentEvidence(request, structuredIntent) {
  const query = normalize(request.rawFreeText ?? request.query);
  const queryTerms = terms(query);
  const moods = Object.entries(MOOD_ALIASES).filter(([, aliases]) => aliases.some((alias) => queryTerms.some((term) => term.startsWith(alias)))).map(([mood]) => mood);
  const categories = unique([
    ...(structuredIntent?.hardConstraints?.requiredPlaceTypes ?? []),
    ...(structuredIntent?.softPreferences?.placeTypes ?? []),
    ...(request.preferredPlaceTypes ?? []),
  ]).map(normalize);
  return { query, queryTerms, moods, categories, cheap: /(?:nicht teuer|cheap|budget|gunstig)/.test(query) };
}

function documentMoods(documentText) {
  const document = normalize(documentText);
  return Object.entries(MOOD_ALIASES).filter(([, aliases]) => aliases.some((alias) => document.includes(alias))).map(([mood]) => mood);
}

export function catalogAttributeRetrieval({ catalogResult, request, structuredIntent, limit = 80 }) {
  const intent = intentEvidence(request, structuredIntent);
  return catalogRows(catalogResult).map((spot) => {
    const searchable = normalize(`${spot.name ?? ""} ${spot.category_name ?? ""} ${spot.place_type ?? ""} ${spot.document_text ?? ""}`);
    const matchedTerms = intent.queryTerms.filter((term) => searchable.includes(term));
    const moods = documentMoods(spot.document_text);
    const matchedMoods = intent.moods.filter((mood) => moods.includes(mood));
    const categoryMatch = intent.categories.includes(normalize(spot.place_type)) || intent.categories.some((category) => normalize(spot.category_name).includes(category));
    const priceFit = intent.cheap && Number.isFinite(Number(spot.price_level)) ? Math.max(0, (4 - Number(spot.price_level)) / 3) : 0;
    const availability = Object.values(spot.availability ?? {});
    const completeness = availability.length ? availability.filter((value) => value === "KNOWN").length / availability.length : 0;
    const exactName = intent.query === normalize(spot.name);
    const directed = exactName || categoryMatch || matchedTerms.length > 0 || matchedMoods.length > 0 || priceFit > 0;
    const score = exactName * 3 + Number(categoryMatch) * 1.2 + matchedMoods.length * 0.8 + matchedTerms.length * 0.25 + priceFit * 0.35 + completeness * (directed ? 0.08 : 0.02);
    const evidence = [
      ...(exactName ? ["exact_name"] : []), ...(categoryMatch ? [`category:${spot.place_type}`] : []),
      ...matchedMoods.map((mood) => `mood:${mood}`), ...matchedTerms.map((term) => `term:${term}`),
      ...(priceFit > 0 ? [`price_fit:${priceFit.toFixed(3)}`] : []), `completeness:${completeness.toFixed(2)}`,
      directed ? "directed" : "coverage_backstop",
    ];
    return { spot_id: spot.spot_id, source: "catalog_attribute_v1", projection: "observed_attributes", source_score: score, evidence, directed };
  }).sort((a, b) => b.source_score - a.source_score || Number(b.directed) - Number(a.directed) || a.spot_id.localeCompare(b.spot_id))
    .slice(0, limit).map((row, index) => ({ ...row, source_rank: index + 1 }));
}

function rankCalibration(rank, size) {
  if (size <= 1) return 1;
  return 1 - (rank - 1) / size;
}

function candidateEvidence(projectionRuns, catalog) {
  const rows = projectionRuns.flatMap((run) => observedCandidates(run.observed, run.projection.id));
  rows.push(...catalog);
  const sizes = new Map();
  for (const row of rows) {
    const key = `${row.source}:${row.projection}`;
    sizes.set(key, Math.max(sizes.get(key) ?? 0, row.source_rank));
  }
  return rows.map((row) => {
    const size = sizes.get(`${row.source}:${row.projection}`) ?? row.source_rank;
    return { ...row, calibrated_rank: rankCalibration(row.source_rank, size), source_weight: SOURCE_WEIGHT[row.source] ?? 0.5 };
  });
}

export function aggregateRetrievalEvidence({ projectionRuns, catalogResult, request, structuredIntent, poolLimit = 80 }) {
  const catalog = catalogAttributeRetrieval({ catalogResult, request, structuredIntent, limit: poolLimit });
  const rows = candidateEvidence(projectionRuns, catalog);
  const bySpot = new Map();
  for (const evidence of rows) {
    const row = bySpot.get(evidence.spot_id) ?? { spot_id: evidence.spot_id, evidence: [] };
    row.evidence.push(evidence);
    bySpot.set(evidence.spot_id, row);
  }
  return [...bySpot.values()].map((row) => {
    const strongestBySource = [...new Set(row.evidence.map((item) => item.source))].map((source) => row.evidence.filter((item) => item.source === source)
      .sort((a, b) => b.calibrated_rank * b.source_weight - a.calibrated_rank * a.source_weight || a.source_rank - b.source_rank)[0]);
    const strengths = strongestBySource.map((item) => item.calibrated_rank * item.source_weight).sort((a, b) => b - a);
    const directed = row.evidence.some((item) => item.source === "catalog_attribute_v1" && item.directed);
    const sourceOverlap = strongestBySource.length;
    const score = (strengths[0] ?? 0) + (strengths[1] ?? 0) * 0.22 + (strengths[2] ?? 0) * 0.08 + Math.min(0.16, Math.max(0, sourceOverlap - 1) * 0.08) + Number(directed) * 0.06;
    return { ...row, retrieval_score: Number(score.toFixed(9)), source_overlap: sourceOverlap, directed_attribute_evidence: directed };
  }).sort((a, b) => b.retrieval_score - a.retrieval_score || b.source_overlap - a.source_overlap || Number(b.directed_attribute_evidence) - Number(a.directed_attribute_evidence) || a.spot_id.localeCompare(b.spot_id))
    .slice(0, poolLimit).map((row, index) => ({ ...row, union_rank: index + 1 }));
}

export function retrievalBreakthroughExperiments({ projectionRuns, catalogResult, request, structuredIntent, poolLimit = 80 }) {
  const full = aggregateRetrievalEvidence({ projectionRuns, catalogResult, request, structuredIntent, poolLimit });
  const withoutCatalog = aggregateRetrievalEvidence({ projectionRuns, catalogResult: [], request, structuredIntent, poolLimit });
  const catalogOnly = catalogAttributeRetrieval({ catalogResult, request, structuredIntent, limit: poolLimit }).map((row, index) => ({ ...row, retrieval_score: row.source_score, evidence: [row], union_rank: index + 1 }));
  return { H0_WAVE2_1: null, H1_CATALOG_COVERAGE: catalogOnly, H2_CALIBRATED_EXISTING: withoutCatalog, H3_EVIDENCE_AGGREGATION: full };
}

export function retrievalBreakthroughManifest() {
  const manifest = {
    version: RETRIEVAL_BREAKTHROUGH_VERSION,
    evidenceAggregationVersion: RETRIEVAL_EVIDENCE_AGGREGATION_VERSION,
    sourceWeights: SOURCE_WEIGHT,
    candidateBudget: 80,
    promotionK: 20,
    latentTruthUse: "EVALUATION_ONLY",
    engineInputRule: "OBSERVED_REQUEST_AND_SPOT_INTELLIGENCE_ONLY",
  };
  return { ...manifest, hash: contentHash(manifest) };
}
