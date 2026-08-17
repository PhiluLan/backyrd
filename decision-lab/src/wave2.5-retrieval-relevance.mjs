import { contentHash } from "./canonical-json.mjs";

export const RETRIEVAL_RELEVANCE_VERSION = "retrieval-relevance-v1";

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const unique = (values) => [...new Set(values.filter(Boolean))];
const rowsOf = (catalog) => Array.isArray(catalog?.rows) ? catalog.rows : Array.isArray(catalog) ? catalog : [];

const GENERIC = new Set([
  "and", "basel", "der", "die", "ein", "eine", "etwas", "for", "fur", "good", "idee", "in", "mit",
  "oder", "passend", "place", "spot", "the", "und", "warum", "why",
]);
const MOODS = Object.freeze({
  cozy: ["cozy", "cosy", "gemutlich", "gemuetlich", "warm"],
  quiet: ["quiet", "ruhig", "leise"],
  lively: ["lively", "lebhaft", "laut"],
  romantic: ["romantic", "romantisch", "date"],
  inspiring: ["inspiring", "inspirierend", "besonders", "ungewohnlich"],
  playful: ["playful", "spielerisch", "verspielt"],
  elegant: ["elegant", "schick", "chic", "stilvoll"],
  social: ["social", "gesellig", "friends", "freunde"],
  adventurous: ["adventurous", "abenteuerlich", "entdecken"],
  relaxed: ["relaxed", "entspannt", "unkompliziert"],
  authentic: ["authentic", "authentisch"],
  urban: ["urban", "stadtlich"],
});
const AUDIENCE_MOODS = Object.freeze({
  date: ["romantic", "cozy"], couple: ["romantic", "cozy"], friends: ["social", "lively", "playful"],
  family: ["playful", "cozy", "relaxed"], kids: ["playful", "relaxed"], solo: ["quiet", "inspiring", "relaxed"],
});
const OCCASION_MOODS = Object.freeze({
  morning: ["quiet", "cozy", "relaxed"], afternoon: ["relaxed", "inspiring"], evening: ["cozy", "romantic", "social"],
  night: ["lively", "social", "urban"], sunday: ["quiet", "cozy", "relaxed"], weekend: ["social", "playful", "adventurous"],
  indoor: ["cozy", "inspiring"], outdoor: ["adventurous", "relaxed"],
});
const OPPOSITE = Object.freeze({ quiet: "lively", lively: "quiet", cozy: "lively", relaxed: "lively", elegant: "playful" });

const terms = (value) => unique(normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !GENERIC.has(term)));
const moodsFrom = (value) => {
  const text = normalize(value);
  return Object.entries(MOODS).filter(([, aliases]) => aliases.some((alias) => text.includes(normalize(alias)))).map(([mood]) => mood);
};

export function queryRelevanceIntent({ request, structuredIntent }) {
  const query = normalize(request.rawFreeText ?? request.query);
  const audience = unique(request.audience ?? []).map(normalize);
  const occasions = unique(request.occasions ?? []).map(normalize);
  const audienceMoods = unique(audience.flatMap((value) => AUDIENCE_MOODS[value] ?? []));
  const occasionMoods = unique(occasions.flatMap((value) => OCCASION_MOODS[value] ?? []));
  return {
    query,
    terms: terms(query),
    requiredCategories: unique(structuredIntent?.hardConstraints?.requiredPlaceTypes ?? []).map(normalize),
    preferredCategories: unique([...(structuredIntent?.softPreferences?.placeTypes ?? []), ...(request.preferredPlaceTypes ?? [])]).map(normalize),
    excludedCategories: unique(structuredIntent?.hardConstraints?.excludedPlaceTypes ?? []).map(normalize),
    explicitMoods: moodsFrom(query),
    audience,
    audienceMoods,
    occasions,
    occasionMoods,
    cheap: /(?:nicht teuer|cheap|budget|gunstig|preiswert)/.test(query),
  };
}

function candidateRepresentation(catalogRow, observedSignal) {
  const text = normalize(`${catalogRow.name ?? ""} ${catalogRow.category_name ?? ""} ${catalogRow.place_type ?? ""} ${catalogRow.document_text ?? ""}`);
  const reviewMoods = Object.keys(observedSignal?.review_moods ?? {}).filter((mood) => Number(observedSignal.review_moods[mood]) > 0).map(normalize);
  const hasPrice = catalogRow.price_level !== null && catalogRow.price_level !== undefined && catalogRow.price_level !== "";
  return {
    category: normalize(catalogRow.place_type ?? catalogRow.category_name),
    text,
    terms: terms(text),
    moods: unique([...moodsFrom(text), ...reviewMoods]),
    price: hasPrice && Number.isFinite(Number(catalogRow.price_level)) ? Number(catalogRow.price_level) : null,
    availability: catalogRow.availability ?? {},
  };
}

function setSignal(signals, key, weight, value, status, evidence) {
  signals.push({ key, weight, value: clamp(value), status, evidence });
}

function structuredSignals(intent, spot) {
  const signals = [];
  const targetCategories = unique([...intent.requiredCategories, ...intent.preferredCategories]);
  if (targetCategories.length) {
    const known = Boolean(spot.category);
    setSignal(signals, "category", 0.28, known ? Number(targetCategories.includes(spot.category)) : 0.5, known ? "KNOWN" : "UNKNOWN", { expected: targetCategories, observed: spot.category || null });
  }
  if (intent.terms.length) {
    const known = Boolean(spot.text);
    const matched = known ? intent.terms.filter((term) => spot.text.includes(term)) : [];
    setSignal(signals, "lexical", 0.22, known ? matched.length / intent.terms.length : 0.5, known ? "KNOWN" : "UNKNOWN", { expected: intent.terms, matched });
  }
  if (intent.explicitMoods.length) {
    const known = spot.moods.length > 0;
    const matched = intent.explicitMoods.filter((mood) => spot.moods.includes(mood));
    const contradicted = intent.explicitMoods.filter((mood) => spot.moods.includes(OPPOSITE[mood]));
    const value = known ? clamp((matched.length - contradicted.length * 0.5) / intent.explicitMoods.length) : 0.5;
    setSignal(signals, "explicit_mood", 0.24, value, known ? "KNOWN" : "UNKNOWN", { expected: intent.explicitMoods, matched, contradicted });
  }
  if (intent.audienceMoods.length) {
    const known = spot.moods.length > 0;
    const matched = intent.audienceMoods.filter((mood) => spot.moods.includes(mood));
    setSignal(signals, "audience", 0.14, known ? matched.length / intent.audienceMoods.length : 0.5, known ? "KNOWN" : "UNKNOWN", { audience: intent.audience, expectedMoods: intent.audienceMoods, matched });
  }
  if (intent.occasionMoods.length) {
    const known = spot.moods.length > 0;
    const matched = intent.occasionMoods.filter((mood) => spot.moods.includes(mood));
    setSignal(signals, "occasion", 0.08, known ? matched.length / intent.occasionMoods.length : 0.5, known ? "KNOWN" : "UNKNOWN", { occasions: intent.occasions, expectedMoods: intent.occasionMoods, matched });
  }
  if (intent.cheap) {
    const known = spot.price !== null;
    setSignal(signals, "price", 0.06, known ? clamp((4 - spot.price) / 3) : 0.5, known ? "KNOWN" : "UNKNOWN", { expected: "LOW_PRICE", observed: spot.price });
  }
  return signals;
}

function retrievalEvidenceScore(candidate) {
  let structured = 0;
  let lexical = 0;
  let vibe = 0;
  let semantic = 0;
  for (const evidence of candidate.evidence ?? []) {
    const calibrated = Number(evidence.calibrated_score_v2);
    const value = Number.isFinite(calibrated) ? calibrated : 0.5;
    if (["structured_category_v1", "category_entity_v1", "price_attribute_v1"].includes(evidence.source)) structured = Math.max(structured, value);
    if (["lexical_v1", "lexical_entity_v2"].includes(evidence.source)) lexical = Math.max(lexical, value);
    if (evidence.source === "vibe_review_v1") vibe = Math.max(vibe, value);
    if (evidence.source === "semantic_v13") semantic = Math.max(semantic, value * 0.55);
  }
  return { score: Math.max(structured, lexical, vibe, semantic), structured, lexical, vibe, semantic };
}

function scoreSignals(signals) {
  if (!signals.length) return { score: 0.5, activeWeight: 0, unknownWeight: 0 };
  const activeWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  return {
    score: signals.reduce((sum, signal) => sum + signal.weight * signal.value, 0) / activeWeight,
    activeWeight,
    unknownWeight: signals.filter((signal) => signal.status === "UNKNOWN").reduce((sum, signal) => sum + signal.weight, 0),
  };
}

function rankCandidates({ candidates, catalogById, observedSpotSignals, intent, method, shortlistK }) {
  return candidates.map((candidate, index) => {
    const catalog = catalogById.get(candidate.spot_id);
    if (!catalog) throw new Error(`Wave 2.5 missing eligible Spot Intelligence for ${candidate.spot_id}`);
    const spot = candidateRepresentation(catalog, observedSpotSignals[candidate.spot_id]);
    const signals = structuredSignals(intent, spot);
    const deterministic = scoreSignals(signals);
    const retrieval = retrievalEvidenceScore(candidate);
    const score = method === "DETERMINISTIC_PLUS_RETRIEVAL"
      ? deterministic.score * 0.86 + retrieval.score * 0.14
      : deterministic.score;
    return {
      ...candidate,
      pre_relevance_rank: candidate.union_rank ?? index + 1,
      relevance_method: method,
      query_intent_evidence: intent,
      spot_relevance_evidence: { category: spot.category || null, moods: spot.moods, price: spot.price, availability: spot.availability },
      relevance_evidence: { signals, deterministic, retrieval },
      relevance_score: Number(score.toFixed(9)),
    };
  }).sort((left, right) => right.relevance_score - left.relevance_score
    || right.relevance_evidence.deterministic.activeWeight - left.relevance_evidence.deterministic.activeWeight
    || left.pre_relevance_rank - right.pre_relevance_rank
    || left.spot_id.localeCompare(right.spot_id))
    .map((candidate, index) => ({
      ...candidate,
      retrieval_score: candidate.relevance_score,
      union_rank: index + 1,
      post_relevance_rank: index + 1,
      shortlist: index < shortlistK,
      top20_decision: index < shortlistK ? "INCLUDED_BY_QUERY_RELEVANCE" : "EXCLUDED_BELOW_RELEVANCE_CUTOFF",
    }));
}

export function retrievalRelevanceExperiments({ request, structuredIntent, catalogResult, observedSpotSignals = {}, wave24Candidates = [], shortlistK = 20 }) {
  const intent = queryRelevanceIntent({ request, structuredIntent });
  const catalogById = new Map(rowsOf(catalogResult).map((row) => [row.spot_id, row]));
  const expected = new Set(wave24Candidates.map((candidate) => candidate.spot_id));
  if (expected.size !== wave24Candidates.length) throw new Error("Wave 2.5 input candidate union must be deduplicated");
  const structured = rankCandidates({ candidates: wave24Candidates, catalogById, observedSpotSignals, intent, method: "DETERMINISTIC_STRUCTURED", shortlistK });
  const hybrid = rankCandidates({ candidates: wave24Candidates, catalogById, observedSpotSignals, intent, method: "DETERMINISTIC_PLUS_RETRIEVAL", shortlistK });
  for (const rows of [structured, hybrid]) {
    if (rows.length !== expected.size || rows.some((row) => !expected.has(row.spot_id))) throw new Error("Wave 2.5 must preserve the exact Wave 2.4 candidate union");
  }
  return { H0_WAVE2_4: wave24Candidates, H1_DETERMINISTIC_STRUCTURED: structured, H2_STRUCTURED_PLUS_RETRIEVAL: hybrid };
}

export function retrievalRelevanceManifest() {
  const body = {
    version: RETRIEVAL_RELEVANCE_VERSION,
    promotionK: 20,
    candidateBudget: 80,
    runtimeInputs: ["current_query", "structured_intent", "current_audience", "current_occasion", "eligible_spot_intelligence", "observed_review_moods", "retrieval_evidence"],
    prohibitedInputs: ["user_history", "personalization_state", "latent_user_truth", "latent_spot_truth", "ground_truth_utility", "golden_scenario_labels", "locked_holdout_labels", "future_outcomes"],
    unknownPolicy: "NEUTRAL_NOT_NEGATIVE",
    learnedArm: { status: "NOT_SCIENTIFICALLY_EXECUTABLE", reason: "No dedicated training partition exists outside Development, Regression and Locked Holdout in the frozen Lab contract." },
    aiArm: { status: "NOT_OPERATIONALLY_JUSTIFIED", reason: "No frozen query-candidate relevance label/prompt contract; candidate-scale calls would add non-determinism, latency and cost before deterministic evidence is exhausted." },
    hardConstraintAuthority: "UNCHANGED_OUTSIDE_RELEVANCE",
    latentTruthUse: "EVALUATION_ONLY",
  };
  return { ...body, hash: contentHash(body) };
}
