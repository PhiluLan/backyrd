import { contentHash } from "./canonical-json.mjs";

export const TASTE_ENGINE_VERSIONS = Object.freeze({
  tasteSpace: "backyrd-taste-space-v1",
  evidenceModel: "backyrd-taste-evidence-v1",
  learningEngine: "backyrd-taste-learning-v1",
  confidenceModel: "backyrd-taste-confidence-v1",
  decayModel: "backyrd-taste-decay-v1",
  projectionContract: "backyrd-current-taste-projection-v1"
});

const concepts = {
  vibe: ["cozy", "relaxed", "romantic", "lively", "quiet", "social", "inspiring", "playful", "elegant", "authentic", "urban"],
  energy: ["calm", "balanced", "energetic"],
  social_style: ["solo_friendly", "conversation_friendly", "group_friendly", "family_friendly", "romantic_friendly"],
  occasion: ["work_friendly", "celebration_friendly", "morning_friendly", "afternoon_friendly", "evening_friendly"],
  price: ["budget", "balanced_price", "premium"],
  discovery: ["mainstream", "hidden_gem", "novel"],
  character: ["design_led", "authentic_character", "distinctive"],
  environment: ["indoor", "outdoor"],
  place_type: ["cafe", "bar", "restaurant", "nightlife", "culture", "outing", "activity", "experience", "hotel", "other"]
};

export const TASTE_SPACE = Object.freeze(Object.entries(concepts).flatMap(([family, values]) =>
  values.map((key) => Object.freeze({ key: `${family}.${key}`, family, label: key.replaceAll("_", " ") }))
));
const conceptKeys = new Set(TASTE_SPACE.map(({ key }) => key));

export const CANONICAL_CONTEXT_KEYS = Object.freeze([
  "audience.solo", "audience.date", "audience.friends", "audience.family", "audience.work",
  "time.morning", "time.afternoon", "time.evening", "time.weekend", "time.weekday"
]);
const contextKeys = new Set(CANONICAL_CONTEXT_KEYS);

// Values reuse the existing canonical ML strengths where their product meaning is
// already proven. New names are semantic aliases for the same evidence tiers.
export const EVIDENCE_MODEL = Object.freeze({
  decision_shown: { direction: 0, strength: 0, family: "exposure", decay: "transient", qualified: false },
  spot_tapped: { direction: 1, strength: 0.08, family: "interaction", decay: "transient", qualified: true },
  search_result_opened: { direction: 1, strength: 0.10, family: "interaction", decay: "transient", qualified: true },
  spot_opened: { direction: 1, strength: 0.14, family: "interaction", decay: "behavioral", qualified: true },
  exact_mood_feedback: { direction: 1, strength: 0.22, family: "explicit", decay: "behavioral", qualified: true },
  liked: { direction: 1, strength: 0.22, family: "explicit", decay: "behavioral", qualified: true },
  disliked: { direction: -1, strength: 0.22, family: "explicit_negative", decay: "behavioral", qualified: true },
  saved: { direction: 1, strength: 0.38, family: "commitment", decay: "stable", qualified: true },
  save_removed: { direction: 0, strength: 0, family: "state_change", decay: "transient", qualified: false },
  navigation_intent: { direction: 1, strength: 0.38, family: "commitment", decay: "stable", qualified: true },
  reservation_intent: { direction: 1, strength: 0.48, family: "commitment", decay: "stable", qualified: true },
  verified_visit: { direction: 1, strength: 0.48, family: "outcome", decay: "stable", qualified: true },
  positive_post_visit: { direction: 1, strength: 0.48, family: "outcome", decay: "stable", qualified: true },
  negative_post_visit: { direction: -1, strength: 0.38, family: "explicit_negative", decay: "behavioral", qualified: true },
  onboarding_preference: { direction: 1, strength: 0.14, family: "onboarding", decay: "onboarding", qualified: true },
  not_there: { direction: 0, strength: 0, family: "correction", decay: "transient", qualified: false }
});

export const DECAY_HALF_LIFE_DAYS = Object.freeze({ transient: 30, contextual: 60, onboarding: 120, behavioral: 180, stable: 365 });
const SCOPE_WEIGHT = Object.freeze({ GLOBAL: 1, PLACE_TYPE: 0.65, CONTEXT: 0.5 });

export const TASTE_ENGINE_CONTRACT = Object.freeze({
  versions: TASTE_ENGINE_VERSIONS,
  tasteSpace: TASTE_SPACE,
  contexts: CANONICAL_CONTEXT_KEYS,
  evidenceModel: EVIDENCE_MODEL,
  decayHalfLifeDays: DECAY_HALF_LIFE_DAYS,
  projectionScopeWeights: SCOPE_WEIGHT,
  authorityOrder: ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "USER_HARD_CONSTRAINTS", "EXPLICIT_CURRENT_INTENT", "CURRENT_CONTEXT", "LONG_TERM_TASTE", "MATCHING_CONTEXT_HISTORY"],
  latentTruthRuntimeInput: false,
  productionIntegration: "NOT_STARTED"
});
export const TASTE_SPACE_HASH = contentHash(TASTE_SPACE);
export const EVIDENCE_MODEL_HASH = contentHash(EVIDENCE_MODEL);
export const TASTE_ENGINE_CONTRACT_HASH = contentHash(TASTE_ENGINE_CONTRACT);

function clamp(value, low = -1, high = 1) { return Math.max(low, Math.min(high, value)); }
function iso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("invalid_occurred_at");
  return date.toISOString();
}
function daysBetween(a, b) { return Math.max(0, (new Date(b).valueOf() - new Date(a).valueOf()) / 86_400_000); }
function decayFactor(decayClass, occurredAt, asOf, contextual = false) {
  const halfLife = contextual ? DECAY_HALF_LIFE_DAYS.contextual : DECAY_HALF_LIFE_DAYS[decayClass];
  return 2 ** (-daysBetween(occurredAt, asOf) / halfLife);
}
function scopeKey(scope) { return `${scope.kind}:${scope.key}`; }
function rowKey(scope, concept) { return `${scopeKey(scope)}:${concept}`; }

export function validateTasteEvidence(input) {
  if (!input || typeof input !== "object") throw new Error("invalid_evidence");
  if (!input.id || !input.userId) throw new Error("evidence_identity_required");
  const contract = EVIDENCE_MODEL[input.eventType];
  if (!contract) throw new Error(`unsupported_taste_event:${input.eventType}`);
  const occurredAt = iso(input.occurredAt);
  const evidenceConcepts = [...new Set(input.concepts ?? [])];
  if (contract.qualified && evidenceConcepts.length === 0) throw new Error("qualified_evidence_requires_concepts");
  if (evidenceConcepts.some((key) => !conceptKeys.has(key))) throw new Error("unknown_taste_concept");
  const contexts = [...new Set(input.contexts ?? [])];
  if (contexts.some((key) => !contextKeys.has(key))) throw new Error("unknown_context_key");
  const audiences = contexts.filter((key) => key.startsWith("audience."));
  const dayparts = contexts.filter((key) => ["time.morning", "time.afternoon", "time.evening"].includes(key));
  const calendar = contexts.filter((key) => ["time.weekend", "time.weekday"].includes(key));
  if (audiences.length > 1 || dayparts.length > 1 || calendar.length > 1) throw new Error("context_scope_explosion");
  if (input.consent !== "granted") throw new Error("personalization_consent_required");
  return Object.freeze({
    id: String(input.id), userId: String(input.userId), eventType: input.eventType, occurredAt,
    spotId: input.spotId ? String(input.spotId) : null,
    sessionId: input.sessionId ? String(input.sessionId) : null,
    placeType: input.placeType ?? null, contexts, concepts: evidenceConcepts,
    sourceFamily: contract.family, direction: contract.direction, strength: contract.strength,
    decayClass: contract.decay, qualified: contract.qualified,
    evidenceModelVersion: TASTE_ENGINE_VERSIONS.evidenceModel
  });
}

function scopesForEvidence(evidence) {
  const scopes = [{ kind: "GLOBAL", key: "global" }];
  if (evidence.placeType) {
    const key = `place_type.${evidence.placeType}`;
    if (!conceptKeys.has(key)) throw new Error("unknown_place_type");
    scopes.push({ kind: "PLACE_TYPE", key: evidence.placeType });
  }
  for (const key of evidence.contexts) scopes.push({ kind: "CONTEXT", key });
  return scopes;
}

function summarizeRow(samples, scope, concept, asOf) {
  let positiveEvidence = 0; let negativeEvidence = 0;
  let latestDecay = 0;
  const spots = new Set(); const sessions = new Set(); const families = new Set();
  for (const sample of samples) {
    const decayed = sample.strength * decayFactor(sample.decayClass, sample.occurredAt, asOf, scope.kind === "CONTEXT");
    if (sample.direction > 0) positiveEvidence += decayed;
    if (sample.direction < 0) negativeEvidence += decayed;
    latestDecay = Math.max(latestDecay, decayFactor(sample.decayClass, sample.occurredAt, asOf, scope.kind === "CONTEXT"));
    if (sample.spotId) spots.add(sample.spotId);
    if (sample.sessionId) sessions.add(sample.sessionId);
    families.add(sample.sourceFamily);
  }
  const support = positiveEvidence + negativeEvidence;
  const affinity = support === 0 ? 0 : clamp((positiveEvidence - negativeEvidence) / (support + 0.75));
  const consistency = support === 0 ? 0 : 0.15 + 0.85 * Math.abs(positiveEvidence - negativeEvidence) / support;
  const diversity = Math.min(1, 0.55 + 0.15 * Math.min(3, spots.size) / 3 + 0.15 * Math.min(3, sessions.size) / 3 + 0.15 * Math.min(3, families.size) / 3);
  let confidence = clamp((1 - Math.exp(-support / 1.5)) * consistency * diversity * (0.6 + 0.4 * latestDecay), 0, 1);
  if (families.size === 1 && families.has("onboarding")) confidence = Math.min(confidence, 0.35);
  const times = samples.map(({ occurredAt }) => occurredAt).sort();
  return Object.freeze({
    concept, family: concept.split(".")[0], scope, affinity, confidence,
    positiveEvidence, negativeEvidence,
    positiveEventCount: samples.filter(({ direction }) => direction > 0).length,
    negativeEventCount: samples.filter(({ direction }) => direction < 0).length,
    distinctSpotCount: spots.size, distinctSessionCount: sessions.size,
    sourceFamilies: [...families].sort(), firstEvidenceAt: times[0], lastUpdatedAt: times.at(-1),
    decayState: latestDecay >= 0.75 ? "CURRENT" : latestDecay >= 0.35 ? "AGING" : "STALE",
    engineVersion: TASTE_ENGINE_VERSIONS.learningEngine
  });
}

export function buildUserTasteMap(inputs, { asOf = new Date().toISOString() } = {}) {
  const normalizedAsOf = iso(asOf);
  const evidenceById = new Map();
  for (const input of inputs) {
    const evidence = validateTasteEvidence(input);
    if (new Date(evidence.occurredAt).valueOf() > new Date(normalizedAsOf).valueOf()) throw new Error("future_evidence_not_allowed");
    const existing = evidenceById.get(evidence.id);
    if (existing && contentHash(existing) !== contentHash(evidence)) throw new Error("evidence_id_conflict");
    evidenceById.set(evidence.id, evidence);
  }
  const samples = new Map();
  for (const evidence of evidenceById.values()) {
    if (!evidence.qualified || evidence.direction === 0) continue;
    for (const scope of scopesForEvidence(evidence)) for (const concept of evidence.concepts) {
      const key = rowKey(scope, concept);
      if (!samples.has(key)) samples.set(key, { scope, concept, rows: [] });
      samples.get(key).rows.push(evidence);
    }
  }
  const rows = [...samples.values()].map(({ rows, scope, concept }) => summarizeRow(rows, scope, concept, normalizedAsOf))
    .sort((a, b) => scopeKey(a.scope).localeCompare(scopeKey(b.scope)) || a.concept.localeCompare(b.concept));
  const userIds = new Set([...evidenceById.values()].map(({ userId }) => userId));
  if (userIds.size > 1) throw new Error("mixed_user_evidence");
  const map = {
    userId: [...userIds][0] ?? null, asOf: normalizedAsOf, rows,
    processedEvidenceIds: [...evidenceById.keys()].sort(),
    unknownConcepts: TASTE_SPACE.map(({ key }) => key).filter((key) => !rows.some(({ concept }) => concept === key)),
    versions: TASTE_ENGINE_VERSIONS
  };
  return Object.freeze({ ...map, mapHash: contentHash(map) });
}

export function projectCurrentTaste(tasteMap, { placeType = null, contexts = [], explicitIntent = [] } = {}) {
  if (contexts.some((key) => !contextKeys.has(key))) throw new Error("unknown_context_key");
  const contributions = new Map();
  for (const row of tasteMap.rows) {
    const active = row.scope.kind === "GLOBAL" || (row.scope.kind === "PLACE_TYPE" && row.scope.key === placeType) || (row.scope.kind === "CONTEXT" && contexts.includes(row.scope.key));
    if (!active) continue;
    const weighted = row.affinity * row.confidence * SCOPE_WEIGHT[row.scope.kind];
    const current = contributions.get(row.concept) ?? { value: 0, weight: 0, evidence: [] };
    current.value += weighted; current.weight += row.confidence * SCOPE_WEIGHT[row.scope.kind]; current.evidence.push({ scope: row.scope, affinity: row.affinity, confidence: row.confidence });
    contributions.set(row.concept, current);
  }
  const intentByConcept = new Map(explicitIntent.map((item) => {
    if (!conceptKeys.has(item.concept) || ![-1, 1].includes(item.direction)) throw new Error("invalid_explicit_intent");
    return [item.concept, item.direction];
  }));
  const rows = [...new Set([...contributions.keys(), ...intentByConcept.keys()])].sort().map((concept) => {
    const history = contributions.get(concept) ?? { value: 0, weight: 0, evidence: [] };
    const historyAffinity = history.weight > 0 ? clamp(history.value) : 0;
    const intentDirection = intentByConcept.get(concept) ?? 0;
    const affinity = intentDirection === 0 ? historyAffinity : intentDirection > 0 ? Math.max(0.75, historyAffinity) : Math.min(-0.75, historyAffinity);
    return { concept, affinity, historyAffinity, confidence: clamp(history.weight), authority: intentDirection === 0 ? "HISTORY" : "EXPLICIT_CURRENT_INTENT", evidence: history.evidence };
  });
  const projection = { userId: tasteMap.userId, placeType, contexts: [...contexts].sort(), rows, versions: TASTE_ENGINE_VERSIONS, hardConstraints: "OUTSIDE_TASTE_AND_AUTHORITATIVE" };
  return Object.freeze({ ...projection, projectionHash: contentHash(projection) });
}

export function validateTasteEngineScientificBoundary(value) {
  const serialized = JSON.stringify(value);
  return !/(latent|ground[_-]?truth|oracle|expected[_-]?utility|true[_-]?preference)/i.test(serialized);
}
