import { contentHash } from "./canonical-json.mjs";

export const RETRIEVAL_NEXT_GEN_VERSION = "retrieval-next-gen-v1";
export const CANDIDATE_UNION_VERSION = "retrieval-next-gen-rrf-v1";

const SOURCE_WEIGHT = Object.freeze({
  structured_category_v1: 1.15,
  lexical_v1: 1.25,
  personalized_v12: 1,
  semantic_v13: 0.85,
  distribution_fallback: 0.4,
});

const PROJECTION_WEIGHT = Object.freeze({
  base: 1,
  base_limit_probe: 0,
  category: 1.2,
  lexical_specificity: 1.2,
  vibe: 1.15,
  occasion_context: 0.9,
  semantic_concept: 1.05,
});

const LABELS = Object.freeze({
  cafe: "Café", bar: "Bar", restaurant: "Restaurant", nightlife: "Nachtleben",
  culture: "Kultur", outing: "Ausflug", activity: "Aktivität", experience: "Erlebnis", hotel: "Hotel",
});

const MOOD_LABELS = Object.freeze({
  cozy: "gemütlich", quiet: "ruhig", lively: "lebhaft", romantic: "romantisch",
  inspiring: "inspirierend", playful: "verspielt", elegant: "elegant", social: "gesellig",
  adventurous: "abenteuerlich", relaxed: "entspannt", authentic: "authentisch", urban: "urban",
});

const MOOD_ALIASES = Object.freeze({
  cozy: ["cozy", "cosy", "gemutlich", "gemütlich"],
  quiet: ["quiet", "ruhig", "leise"],
  lively: ["lively", "lebhaft", "laut"],
  romantic: ["romantic", "romantisch"],
  inspiring: ["inspiring", "inspirierend"],
  playful: ["playful", "verspielt"],
  elegant: ["elegant", "schick"],
  social: ["social", "gesellig"],
  adventurous: ["adventurous", "abenteuerlich"],
  relaxed: ["relaxed", "entspannt"],
  authentic: ["authentic", "authentisch"],
  urban: ["urban"],
});

const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const unique = (values) => [...new Set(values.filter(Boolean))];
const ids = (rows) => (rows ?? []).map((row) => row.spot_id ?? row.id).filter(Boolean);

const GENERIC = new Set(["a", "an", "and", "basel", "der", "die", "ein", "eine", "etwas", "für", "fur", "good", "in", "idee", "mit", "oder", "passend", "place", "spot", "the", "und", "warum"]);

function significantTerms(value) {
  return unique(normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !GENERIC.has(term)));
}

function observedMoodTerms(request, structuredIntent) {
  const text = normalize(`${request.rawFreeText ?? request.query ?? ""} ${(structuredIntent?.softPreferences?.moods ?? []).join(" ")}`);
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  return Object.entries(MOOD_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => tokens.some((token) => token.startsWith(normalize(alias)))))
    .map(([key]) => MOOD_LABELS[key] ?? key);
}

export function buildRetrievalProjections({ request, structuredIntent }) {
  const required = structuredIntent?.hardConstraints?.requiredPlaceTypes ?? [];
  const preferred = structuredIntent?.softPreferences?.placeTypes ?? request.preferredPlaceTypes ?? [];
  const categories = unique([...required, ...preferred]).map((key) => LABELS[key] ?? key);
  const terms = significantTerms(request.rawFreeText ?? request.query);
  const moods = observedMoodTerms(request, structuredIntent);
  const contextTerms = unique([
    ...(request.audience ?? []),
    ...(request.occasions ?? []),
  ]);
  const projections = [
    { id: "base", purpose: "original request", query: request.query },
    { id: "base_limit_probe", purpose: "same-query candidate-limit diagnosis only", query: request.query },
    categories.length ? { id: "category", purpose: "category/activity recall", query: categories.join(" ") } : null,
    terms.length ? { id: "lexical_specificity", purpose: "explicit lexical evidence", query: terms.join(" ") } : null,
    moods.length ? { id: "vibe", purpose: "observed vibe recall", query: moods.join(" ") } : null,
    contextTerms.length ? { id: "occasion_context", purpose: "occasion/context recall", query: contextTerms.join(" ") } : null,
    unique([...terms, ...moods, ...categories]).length
      ? { id: "semantic_concept", purpose: "focused semantic recall", query: unique([...terms, ...moods, ...categories]).join(" ") }
      : null,
  ].filter(Boolean);
  const deduped = [];
  const seen = new Set();
  for (const projection of projections) {
    const key = normalize(projection.query);
    if (!key || (projection.id !== "base_limit_probe" && seen.has(key))) continue;
    seen.add(key);
    deduped.push({ ...projection, hash: contentHash({ id: projection.id, query: projection.query }) });
  }
  return deduped;
}

export function observedCandidates(observed, projectionId) {
  const rows = [];
  const add = (candidates, source) => {
    for (const [index, candidate] of (candidates ?? []).entries()) {
      const evidence = candidate.evidence ?? { source, source_rank: index + 1, source_score: candidate.similarity ?? candidate.final_score ?? null, evidence: [] };
      rows.push({
        spot_id: candidate.spot_id,
        source,
        projection: projectionId,
        source_rank: evidence.source_rank ?? index + 1,
        source_score: evidence.source_score ?? null,
        evidence: evidence.evidence ?? [],
      });
    }
  };
  if (projectionId === "base") add(observed.distributedV12, "personalized_v12");
  add(observed.structuredCandidates, "structured_category_v1");
  add(observed.lexicalCandidates, "lexical_v1");
  add(observed.distributedSemantic, "semantic_v13");
  if (projectionId === "base") {
    const fallbackIds = new Set(ids(observed.retrievalUnion).filter((id) => !ids(observed.distributedV12).includes(id) && !ids(observed.distributedSemantic).includes(id) && !ids(observed.structuredCandidates).includes(id) && !ids(observed.lexicalCandidates).includes(id)));
    for (const [index, spotId] of [...fallbackIds].entries()) rows.push({ spot_id: spotId, source: "distribution_fallback", projection: projectionId, source_rank: index + 1, source_score: null, evidence: ["distribution_safe_catalog"] });
  }
  return rows;
}

export function candidateUnionNextGen(projectionRuns, { limit = 100, rrfK = 20 } = {}) {
  const bySpot = new Map();
  for (const run of projectionRuns) {
    for (const evidence of observedCandidates(run.observed, run.projection.id)) {
      const key = `${evidence.source}:${evidence.projection}`;
      const row = bySpot.get(evidence.spot_id) ?? { spot_id: evidence.spot_id, retrieval_score: 0, evidence: [], source_keys: new Set() };
      if (row.source_keys.has(key)) continue;
      row.source_keys.add(key);
      const sourceWeight = SOURCE_WEIGHT[evidence.source] ?? 0.5;
      const projectionWeight = PROJECTION_WEIGHT[evidence.projection] ?? 0.5;
      if (projectionWeight <= 0) continue;
      const contribution = sourceWeight * projectionWeight / (rrfK + evidence.source_rank);
      row.retrieval_score += contribution;
      row.evidence.push({ ...evidence, rrf_contribution: contribution });
      bySpot.set(evidence.spot_id, row);
    }
  }
  return [...bySpot.values()]
    .map((row) => ({ ...row, source_keys: [...row.source_keys].sort(), retrieval_score: Number(row.retrieval_score.toFixed(9)) }))
    .sort((a, b) => b.retrieval_score - a.retrieval_score || b.evidence.length - a.evidence.length || a.spot_id.localeCompare(b.spot_id))
    .slice(0, limit)
    .map((row, index) => ({ ...row, union_rank: index + 1 }));
}

export function oracleRecallAtKCapacity(truth, k = 20, threshold = 0.6) {
  const relevant = Object.values(truth).filter((value) => value >= threshold).length;
  return { relevant, capacity: relevant ? Math.min(k, relevant) / relevant : 1 };
}

function evidenceCount(spot) {
  return [spot?.category, spot?.observed?.name, spot?.observed?.description, spot?.observed?.priceLevel, spot?.observed?.lat, spot?.observed?.lng, ...(spot?.observed?.moods ?? [])]
    .filter((value) => value !== null && value !== undefined && value !== "").length;
}

export function classifyRetrievalMisses({ world, truth, baseUnion, nextUnion, projectionRuns, threshold = 0.6, k = 20 }) {
  const baseRank = new Map(baseUnion.map((row, index) => [row.spot_id ?? row.id, index + 1]));
  const nextRank = new Map(nextUnion.map((row, index) => [row.spot_id ?? row.id, index + 1]));
  const projectionEvidence = new Map();
  for (const run of projectionRuns) for (const row of observedCandidates(run.observed, run.projection.id)) {
    const prior = projectionEvidence.get(row.spot_id) ?? [];
    prior.push(row);
    projectionEvidence.set(row.spot_id, prior);
  }
  return Object.entries(truth).filter(([, utility]) => utility >= threshold).map(([spotId, utility]) => {
    const spot = world.spots.find((item) => item.id === spotId);
    const evidence = projectionEvidence.get(spotId) ?? [];
    let primaryCause = "OTHER_UNKNOWN";
    if ((baseRank.get(spotId) ?? Infinity) > k) {
      if (evidence.some((row) => row.projection === "base_limit_probe") && !baseRank.has(spotId)) primaryCause = "CANDIDATE_LIMIT_FAILURE";
      else if (evidence.some((row) => !["base", "base_limit_probe"].includes(row.projection)) && !baseRank.has(spotId)) primaryCause = "QUERY_REPRESENTATION_FAILURE";
      else if (evidence.length && Math.min(...evidence.map((row) => row.source_rank)) > k) primaryCause = "SOURCE_ORDERING_FAILURE";
      else if (evidence.length && !baseRank.has(spotId)) primaryCause = "COVERAGE_FAILURE";
      else if (!evidence.length && evidenceCount(spot) <= 4) primaryCause = "SPOT_REPRESENTATION_FAILURE";
      else if (!evidence.length && evidenceCount(spot) > 4) primaryCause = "SOURCE_GAP";
      else if (!evidence.length) primaryCause = "COVERAGE_FAILURE";
      else primaryCause = "SOURCE_ORDERING_FAILURE";
    } else primaryCause = "RETRIEVED_AT_20";
    return { spotId, utility, primaryCause, baseRank: baseRank.get(spotId) ?? null, nextGenRank: nextRank.get(spotId) ?? null, category: spot?.category ?? null, density: spot?.density ?? null, observedEvidenceCount: evidenceCount(spot), evidence };
  });
}

export function retrievalNextGenManifest() {
  return {
    version: RETRIEVAL_NEXT_GEN_VERSION,
    unionVersion: CANDIDATE_UNION_VERSION,
    sourceWeights: SOURCE_WEIGHT,
    projectionWeights: PROJECTION_WEIGHT,
    latentTruthUse: "EVALUATION_ONLY",
    engineInputRule: "OBSERVED_DATA_ONLY",
  };
}
