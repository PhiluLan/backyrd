import { contentHash } from "./canonical-json.mjs";
import { observedCandidates } from "./wave2.1-retrieval-next-gen.mjs";

export const RETRIEVAL_REBUILD_VERSION = "retrieval-rebuild-v1";
export const RETRIEVAL_SHORTLIST_VERSION = "retrieval-shortlist-v1";

const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const unique = (values) => [...new Set(values.filter(Boolean))];
const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const catalogRows = (catalog) => Array.isArray(catalog?.rows) ? catalog.rows : Array.isArray(catalog) ? catalog : [];

const GENERIC = new Set(["and", "basel", "der", "die", "ein", "eine", "etwas", "for", "fur", "für", "good", "idee", "in", "mit", "oder", "passend", "place", "spot", "the", "und", "why"]);
const MOOD_ALIASES = Object.freeze({
  cozy: ["cozy", "cosy", "gemutlich", "gemuetlich"], quiet: ["quiet", "ruhig", "leise"],
  lively: ["lively", "lebhaft", "laut"], romantic: ["romantic", "romantisch", "date"],
  inspiring: ["inspiring", "inspirierend", "besonders", "ungewohnlich"], playful: ["playful", "spielerisch"],
  elegant: ["elegant", "schick", "stilvoll"], social: ["social", "gesellig", "friends", "freunde"],
  adventurous: ["adventurous", "abenteuerlich", "entdecken"], relaxed: ["relaxed", "entspannt"],
  authentic: ["authentic", "authentisch"], urban: ["urban", "stadtlich"],
});

const terms = (value) => unique(normalize(value).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !GENERIC.has(term)));
const moodTerms = (value) => {
  const tokens = terms(value);
  return Object.entries(MOOD_ALIASES).filter(([, aliases]) => aliases.some((alias) => tokens.some((token) => token.startsWith(alias)))).map(([mood]) => mood);
};

function observedIntent(request, structuredIntent) {
  const query = normalize(request.rawFreeText ?? request.query);
  return {
    query,
    queryTerms: terms(query),
    moods: moodTerms(query),
    categories: unique([
      ...(structuredIntent?.hardConstraints?.requiredPlaceTypes ?? []),
      ...(structuredIntent?.softPreferences?.placeTypes ?? []),
      ...(request.preferredPlaceTypes ?? []),
    ]).map(normalize),
    audience: unique(request.audience ?? []).map(normalize),
    occasions: unique(request.occasions ?? []).map(normalize),
    cheap: /(?:nicht teuer|cheap|budget|gunstig)/.test(query),
  };
}

function betaMean(positive, total, priorMean = 0.5, priorStrength = 6) {
  return (positive + priorMean * priorStrength) / (total + priorStrength);
}

/**
 * Builds only from Product-observable events and Reviews. No user/spot latent
 * fields, utilities, evaluator labels, scenarios, or ranks are accepted.
 */
export function buildObservedSpotSignals({ spots, reviews = [], interactions = [] }) {
  const knownIds = new Set(spots.map((spot) => spot.id));
  const bySpot = new Map(spots.map((spot) => [spot.id, {
    spot_id: spot.id, review_count: 0, positive_review_count: 0, negative_review_count: 0,
    review_moods: new Map(), event_count: 0, positive_action_weight: 0, negative_action_weight: 0,
  }]));
  for (const review of reviews) {
    if (!knownIds.has(review.spotId)) continue;
    const row = bySpot.get(review.spotId);
    row.review_count += 1;
    const text = normalize(review.text);
    row.positive_review_count += Number(/wurde wiederkommen|wuerde wiederkommen/.test(text));
    row.negative_review_count += Number(/nicht ganz mein moment/.test(text));
    for (const mood of review.moods ?? []) row.review_moods.set(normalize(mood), (row.review_moods.get(normalize(mood)) ?? 0) + 1);
  }
  const actionWeight = { open: 0.35, like: 1, save: 0.8, was_here: 0.9, dislike: -1, decision_impression: 0 };
  for (const event of interactions) {
    if (!knownIds.has(event.spotId)) continue;
    const row = bySpot.get(event.spotId);
    row.event_count += 1;
    const weight = actionWeight[event.type] ?? 0;
    if (weight >= 0) row.positive_action_weight += weight;
    else row.negative_action_weight += Math.abs(weight);
  }
  return Object.fromEntries([...bySpot].map(([spotId, row]) => {
    const reviewQuality = betaMean(row.positive_review_count, row.review_count, 0.5, 5);
    const actionQuality = betaMean(row.positive_action_weight, row.event_count, 0.18, 12);
    const negativeRate = betaMean(row.negative_action_weight + row.negative_review_count, row.event_count + row.review_count, 0.05, 12);
    return [spotId, {
      spot_id: spotId,
      review_count: row.review_count,
      event_count: row.event_count,
      review_quality: Number(reviewQuality.toFixed(6)),
      action_quality: Number(actionQuality.toFixed(6)),
      negative_rate: Number(negativeRate.toFixed(6)),
      review_moods: Object.fromEntries([...row.review_moods].sort()),
    }];
  }));
}

function addSource(rows, source, projection, scoreFor, evidenceFor, filter = () => true) {
  return rows.filter(filter).map((spot) => ({ spot, score: scoreFor(spot) }))
    .sort((a, b) => b.score - a.score || a.spot.spot_id.localeCompare(b.spot.spot_id))
    .map(({ spot, score }, index) => ({
      spot_id: spot.spot_id, source, projection, source_rank: index + 1,
      source_score: Number(score.toFixed(9)), evidence: evidenceFor(spot),
    }));
}

export function specializedRecallSources({ catalogResult, request, structuredIntent, observedSpotSignals = {} }) {
  const catalog = catalogRows(catalogResult);
  const intent = observedIntent(request, structuredIntent);
  const enriched = catalog.map((spot) => {
    const document = normalize(spot.document_text);
    const searchable = normalize(`${spot.name ?? ""} ${spot.category_name ?? ""} ${spot.place_type ?? ""} ${spot.document_text ?? ""}`);
    const matchedTerms = intent.queryTerms.filter((term) => searchable.includes(term));
    const documentMoods = Object.entries(MOOD_ALIASES).filter(([, aliases]) => aliases.some((alias) => document.includes(alias))).map(([mood]) => mood);
    const observed = observedSpotSignals[spot.spot_id] ?? { review_count: 0, event_count: 0, review_quality: 0.5, action_quality: 0.18, negative_rate: 0.05, review_moods: {} };
    const matchedMoods = intent.moods.filter((mood) => documentMoods.includes(mood) || Number(observed.review_moods?.[mood] ?? 0) > 0);
    const categoryMatch = intent.categories.includes(normalize(spot.place_type)) || intent.categories.some((category) => normalize(spot.category_name).includes(category));
    const exactName = intent.query === normalize(spot.name);
    const priceFit = intent.cheap && Number.isFinite(Number(spot.price_level)) ? Math.max(0, (4 - Number(spot.price_level)) / 3) : 0;
    const known = Object.values(spot.availability ?? {}).filter((value) => value === "KNOWN").length;
    const total = Object.values(spot.availability ?? {}).length;
    const completeness = total ? known / total : 0;
    return { ...spot, intent, observed, matchedTerms, matchedMoods, categoryMatch, exactName, priceFit, completeness };
  });
  const sources = [];
  sources.push(addSource(enriched, "availability_v1", "current_moment", (spot) => spot.is_open_now === true ? 1 : spot.is_open_now === null ? 0.45 : 0,
    (spot) => [`open:${spot.is_open_now === null ? "unknown" : spot.is_open_now}`]));
  sources.push(addSource(enriched, "category_entity_v1", "category_entity", (spot) => Number(spot.exactName) * 3 + Number(spot.categoryMatch) + spot.completeness * 0.05,
    (spot) => [...(spot.exactName ? ["exact_name"] : []), ...(spot.categoryMatch ? [`category:${spot.place_type}`] : [])],
    (spot) => spot.exactName || spot.categoryMatch));
  sources.push(addSource(enriched, "lexical_entity_v2", "lexical_entity", (spot) => Number(spot.exactName) * 3 + spot.matchedTerms.length / Math.max(1, spot.intent.queryTerms.length),
    (spot) => [...(spot.exactName ? ["exact_name"] : []), ...spot.matchedTerms.map((term) => `term:${term}`)],
    (spot) => spot.exactName || spot.matchedTerms.length > 0));
  sources.push(addSource(enriched, "vibe_review_v1", "vibe", (spot) => spot.matchedMoods.length + Math.min(0.25, Object.values(spot.observed.review_moods ?? {}).reduce((sum, count) => sum + count, 0) / 40),
    (spot) => spot.matchedMoods.map((mood) => `mood:${mood}`), (spot) => spot.matchedMoods.length > 0));
  sources.push(addSource(enriched, "observed_quality_v1", "quality_evidence", (spot) =>
    spot.observed.action_quality * 0.52 + spot.observed.review_quality * 0.34 - spot.observed.negative_rate * 0.24 + Math.min(0.1, Math.log1p(spot.observed.event_count + spot.observed.review_count) / 60),
    (spot) => [`action_quality:${spot.observed.action_quality}`, `review_quality:${spot.observed.review_quality}`, `negative_rate:${spot.observed.negative_rate}`]));
  sources.push(addSource(enriched, "price_attribute_v1", "price", (spot) => spot.priceFit,
    (spot) => [`price_fit:${spot.priceFit.toFixed(3)}`], (spot) => spot.priceFit > 0));
  return sources.filter((source) => source.length > 0);
}

const SOURCE_WEIGHT = Object.freeze({
  availability_v1: 1.2, category_entity_v1: 1.35, lexical_entity_v2: 1.25,
  vibe_review_v1: 1.05, observed_quality_v1: 1.1, price_attribute_v1: 0.7,
  personalized_v12: 1.05, semantic_v13: 0.72, structured_category_v1: 0.85,
  lexical_v1: 0.8, distribution_fallback: 0.1,
});

function normalizedRank(rank, size) {
  if (size <= 1) return 1;
  return 1 - (rank - 1) / size;
}

export function retrievalShortlist({ projectionRuns, specializedSources, budget = 80, shortlistK = 20, availabilityAware = true, qualityAware = true }) {
  const evidenceRows = projectionRuns.flatMap((run) => observedCandidates(run.observed, run.projection.id));
  evidenceRows.push(...specializedSources.flat());
  const sizes = new Map();
  const scoreRanges = new Map();
  for (const row of evidenceRows) {
    const key = `${row.source}:${row.projection}`;
    sizes.set(key, Math.max(sizes.get(key) ?? 0, row.source_rank));
    if (Number.isFinite(Number(row.source_score))) {
      const range = scoreRanges.get(key) ?? { minimum: Number(row.source_score), maximum: Number(row.source_score) };
      range.minimum = Math.min(range.minimum, Number(row.source_score));
      range.maximum = Math.max(range.maximum, Number(row.source_score));
      scoreRanges.set(key, range);
    }
  }
  const bySpot = new Map();
  for (const evidence of evidenceRows) {
    const row = bySpot.get(evidence.spot_id) ?? { spot_id: evidence.spot_id, evidence: [] };
    const key = `${evidence.source}:${evidence.projection}`;
    const range = scoreRanges.get(key);
    const score = Number(evidence.source_score);
    const calibratedScore = Number.isFinite(score) && range
      ? range.maximum === range.minimum ? 1 : (score - range.minimum) / (range.maximum - range.minimum)
      : normalizedRank(evidence.source_rank, sizes.get(key) ?? evidence.source_rank);
    row.evidence.push({ ...evidence, calibrated_rank: normalizedRank(evidence.source_rank, sizes.get(key) ?? evidence.source_rank), calibrated_score: calibratedScore });
    bySpot.set(evidence.spot_id, row);
  }
  const scored = [...bySpot.values()].map((row) => {
    const strongest = new Map();
    for (const evidence of row.evidence) {
      const strength = evidence.calibrated_score * (SOURCE_WEIGHT[evidence.source] ?? 0.4);
      if (!strongest.has(evidence.source) || strength > strongest.get(evidence.source).strength) strongest.set(evidence.source, { evidence, strength });
    }
    const ordered = [...strongest.values()].sort((a, b) => b.strength - a.strength);
    const availability = strongest.get("availability_v1")?.evidence;
    const observedQuality = strongest.get("observed_quality_v1")?.evidence;
    const openValue = availability?.evidence?.[0] === "open:true" ? 1 : availability?.evidence?.[0] === "open:unknown" ? 0.35 : 0;
    const qualityValue = observedQuality?.calibrated_score ?? 0;
    const directed = ["category_entity_v1", "lexical_entity_v2", "vibe_review_v1", "price_attribute_v1"].filter((source) => strongest.has(source)).length;
    const independent = ordered.filter(({ evidence }) => !["availability_v1", "observed_quality_v1"].includes(evidence.source));
    const score = qualityAware
      ? qualityValue * 0.52 + (independent[0]?.strength ?? 0) * 0.25 + (independent[1]?.strength ?? 0) * 0.08
        + Math.min(0.08, Math.max(0, independent.length - 1) * 0.025) + Math.min(0.07, directed * 0.02)
      : (independent[0]?.strength ?? 0) * 0.52 + (independent[1]?.strength ?? 0) * 0.18
        + Math.min(0.12, Math.max(0, independent.length - 1) * 0.04) + (availabilityAware ? openValue * 0.26 : 0)
        + Math.min(0.08, directed * 0.025);
    return { ...row, retrieval_score: Number(score.toFixed(9)), source_overlap: strongest.size, open_evidence: openValue, availability_preferred: availabilityAware, observed_quality_evidence: qualityValue, directed_evidence_count: directed };
  }).sort((a, b) => (availabilityAware ? b.open_evidence - a.open_evidence : 0) || b.retrieval_score - a.retrieval_score || b.source_overlap - a.source_overlap || a.spot_id.localeCompare(b.spot_id));

  // The first 20 positions are the explicit retrieval shortlist. Remaining
  // positions preserve high-recall evidence for downstream diagnostics without
  // changing the promotion K or exceeding the frozen candidate budget.
  const shortlist = scored.slice(0, shortlistK);
  const shortlistIds = new Set(shortlist.map((row) => row.spot_id));
  const remainder = scored.filter((row) => !shortlistIds.has(row.spot_id)).slice(0, Math.max(0, budget - shortlist.length));
  return [...shortlist, ...remainder].map((row, index) => ({ ...row, union_rank: index + 1, shortlist: index < shortlistK }));
}

export function retrievalRebuildExperiments(input) {
  const specialized = specializedRecallSources(input);
  return {
    H1_SPECIALIZED_RECALL: retrievalShortlist({ ...input, specializedSources: specialized, availabilityAware: false, qualityAware: false }),
    H2_AVAILABILITY_SHORTLIST: retrievalShortlist({ ...input, specializedSources: specialized, availabilityAware: true, qualityAware: false }),
    H3_OBSERVED_QUALITY: retrievalShortlist({ ...input, specializedSources: specialized, availabilityAware: true, qualityAware: true }),
  };
}

export function retrievalRebuildManifest() {
  const body = {
    version: RETRIEVAL_REBUILD_VERSION,
    shortlistVersion: RETRIEVAL_SHORTLIST_VERSION,
    promotionK: 20,
    candidateBudget: 80,
    sources: Object.keys(SOURCE_WEIGHT),
    sourceWeights: SOURCE_WEIGHT,
    latentTruthUse: "EVALUATION_ONLY",
    runtimeInputs: ["structured_intent", "current_context", "eligible_spot_intelligence", "reviews", "product_actions", "existing_retrieval_evidence"],
    prohibitedInputs: ["latent_user_truth", "latent_spot_truth", "ground_truth_utility", "evaluator_labels"],
  };
  return { ...body, hash: contentHash(body) };
}
