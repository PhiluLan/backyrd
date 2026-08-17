import { contentHash } from "./canonical-json.mjs";
import { TASTE_SPACE } from "./taste-engine.mjs";

export const N4_VERSIONS = Object.freeze({
  schema: "backyrd-spot-intelligence-schema-v1",
  evidence: "backyrd-spot-evidence-contract-v1",
  provenance: "backyrd-spot-provenance-contract-v1",
  confidence: "backyrd-spot-confidence-contract-v1",
  owner: "backyrd-owner-intelligence-contract-v1",
  commercialBoundary: "backyrd-owner-free-premium-boundary-v1",
  contextual: "backyrd-contextual-spot-intelligence-v1",
  serialization: "backyrd-relevant-spot-intelligence-boundary-v1",
  validation: "backyrd-spot-validation-contract-v1"
});

export const SPOT_FACT_DIMENSIONS = Object.freeze({
  category: { values: null, required: true },
  place_type: { values: TASTE_SPACE.filter(({ family }) => family === "place_type").map(({ key }) => key.slice(11)), required: true },
  city: { values: null, required: true },
  price_level: { values: [1, 2, 3, 4, 5], required: false },
  accessibility: { values: ["unknown", "partial", "accessible"], required: false },
  environment: { values: ["indoor", "outdoor", "both"], required: false },
  reservation_character: { values: ["walk_in", "recommended", "required"], required: false },
  duration_character: { values: ["short", "medium", "long", "open_ended"], required: false }
});

export const SPOT_CONCEPT_KEYS = Object.freeze([
  ...TASTE_SPACE.map(({ key }) => key),
  "planning.low_friction", "planning.high_commitment",
  "occasion.kids_friendly", "occasion.group_friendly",
  "context.night_friendly", "context.weekday_friendly", "context.weekend_friendly"
]);
const conceptKeys = new Set(SPOT_CONCEPT_KEYS);
const factKeys = new Set(Object.keys(SPOT_FACT_DIMENSIONS));

export const CONTEXT_KEYS = Object.freeze([
  "global", "audience.solo", "audience.date", "audience.friends", "audience.family", "audience.work",
  "time.morning", "time.afternoon", "time.evening", "time.night", "time.weekday", "time.weekend"
]);
const contextKeys = new Set(CONTEXT_KEYS);

export const SOURCE_POLICY = Object.freeze({
  canonical_spot_data: { reliability: 0.98, allowedKinds: ["FACT"] },
  backyrd_derived: { reliability: 0.76, allowedKinds: ["INTERPRETATION"] },
  owner_provided: { reliability: 0.54, verifiedReliability: 0.64, allowedKinds: ["FACT", "INTERPRETATION"] },
  community_derived: { reliability: 0.72, allowedKinds: ["INTERPRETATION"] },
  outcome_derived: { reliability: 0.88, allowedKinds: ["INTERPRETATION"] },
  external_imported: { reliability: 0.60, allowedKinds: ["FACT", "INTERPRETATION"] },
  ai_derived: { reliability: 0.50, allowedKinds: ["INTERPRETATION"] }
});

export const OWNER_FIELD_BOUNDARY = Object.freeze({
  FREE: ["category", "place_type", "city", "price_level", "accessibility", "environment", "reservation_character", "duration_character"],
  PREMIUM: SPOT_CONCEPT_KEYS,
  prohibitedDecisionFeatures: ["owner_tier", "premium", "payment_status", "ranking_bonus", "utility_bonus", "distribution_priority", "personalization_bonus"]
});

const incompatible = Object.freeze([
  ["vibe.quiet", "vibe.lively"], ["energy.calm", "energy.energetic"],
  ["price.budget", "price.premium"], ["discovery.mainstream", "discovery.hidden_gem"],
  ["planning.low_friction", "planning.high_commitment"]
]);
const forbiddenKeys = /latent|ground[_-]?truth|oracle|expected[_-]?utility|trust[_-]?score|moderation|private[_-]?user|payment|ranking[_-]?bonus|distribution[_-]?priority/i;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function clamp(value, low = 0, high = 1) { return Math.max(low, Math.min(high, value)); }
function iso(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error("invalid_evidence_time");
  return parsed.toISOString();
}
function daysBetween(a, b) { return Math.max(0, (new Date(b) - new Date(a)) / 86_400_000); }
function freshnessFactor(observedAt, asOf, validityDays) { return 2 ** (-daysBetween(observedAt, asOf) / validityDays); }
function normalizedContext(input = {}) {
  const keys = Object.entries(input).filter(([, value]) => value != null).map(([key, value]) => `${key}.${value}`);
  if (keys.length > 2 || keys.some((key) => !contextKeys.has(key))) throw new Error("invalid_context_signature");
  return keys.sort();
}

export const N4_CONTRACT = deepFreeze({
  versions: N4_VERSIONS,
  facts: SPOT_FACT_DIMENSIONS,
  concepts: SPOT_CONCEPT_KEYS,
  contexts: CONTEXT_KEYS,
  sourcePolicy: SOURCE_POLICY,
  ownerBoundary: OWNER_FIELD_BOUNDARY,
  incompatible,
  principles: {
    factsAndInterpretationsSeparated: true,
    ownerClaimsAreEvidence: true,
    missingIsUnknown: true,
    completenessIsNotRank: true,
    paymentIsNotDecisionInput: true,
    productionIntegration: "NOT_STARTED"
  }
});
export const N4_CONTRACT_HASH = contentHash(N4_CONTRACT);
export const N4_SCHEMA_HASH = contentHash({ facts: SPOT_FACT_DIMENSIONS, concepts: SPOT_CONCEPT_KEYS, contexts: CONTEXT_KEYS });
export const N4_EVIDENCE_CONTRACT_HASH = contentHash({ sourcePolicy: SOURCE_POLICY, forbiddenKeys: forbiddenKeys.source });
export const N4_OWNER_CONTRACT_HASH = contentHash(OWNER_FIELD_BOUNDARY);

export function validateSpotEvidence(input, { asOf = "2026-08-17T12:00:00.000Z" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_spot_evidence");
  if (forbiddenKeys.test(JSON.stringify(input))) throw new Error("forbidden_spot_evidence_field");
  const source = SOURCE_POLICY[input.sourceFamily];
  if (!source) throw new Error("unsupported_source_family");
  if (!source.allowedKinds.includes(input.kind)) throw new Error("source_kind_not_allowed");
  if (!input.id || !input.spotId || !input.dimension) throw new Error("spot_evidence_identity_required");
  const observedAt = iso(input.observedAt);
  const validFrom = iso(input.validFrom ?? observedAt);
  const validUntil = input.validUntil == null ? null : iso(input.validUntil);
  if (new Date(observedAt) > new Date(asOf) || new Date(validFrom) > new Date(asOf)) throw new Error("future_spot_evidence_not_allowed");
  if (validUntil && validUntil < validFrom) throw new Error("invalid_validity_window");
  const context = normalizedContext(input.context);
  let value = input.value;
  if (input.kind === "FACT") {
    if (!factKeys.has(input.dimension)) throw new Error("unknown_fact_dimension");
    const allowed = SPOT_FACT_DIMENSIONS[input.dimension].values;
    if (allowed && !allowed.includes(value)) throw new Error("invalid_fact_value");
    if (typeof value === "string") value = value.trim();
    if (value === "") throw new Error("empty_fact_value");
  } else {
    if (!conceptKeys.has(input.dimension)) throw new Error("unknown_spot_concept");
    value = Number(value);
    if (!Number.isFinite(value) || value < -1 || value > 1 || value === 0) throw new Error("invalid_interpretation_value");
  }
  if (input.sourceFamily === "owner_provided") {
    if (!input.ownerId) throw new Error("owner_identity_required");
    const tier = input.ownerTier ?? "FREE";
    if (!Object.hasOwn(OWNER_FIELD_BOUNDARY, tier)) throw new Error("invalid_owner_tier");
    const allowed = OWNER_FIELD_BOUNDARY[tier];
    if (!allowed.includes(input.dimension)) throw new Error("owner_field_not_entitled");
  }
  const sourceId = String(input.sourceId ?? input.id);
  const model = input.sourceFamily === "ai_derived" ? input.model : null;
  if (input.sourceFamily === "ai_derived" && (!model?.name || !model?.version || !input.sourceInputHash)) throw new Error("ai_provenance_required");
  return deepFreeze({
    id: String(input.id), spotId: String(input.spotId), kind: input.kind, dimension: input.dimension, value,
    context, sourceFamily: input.sourceFamily, sourceId, ownerId: input.ownerId ? String(input.ownerId) : null,
    ownerVerified: input.ownerVerified === true, observedAt, validFrom, validUntil,
    validityDays: Math.max(1, Math.min(730, Number(input.validityDays ?? (input.kind === "FACT" ? 365 : 180)))),
    independentSubject: String(input.independentSubject ?? sourceId), provenance: deepFreeze({
      sourceFamily: input.sourceFamily, sourceId, sourceInputHash: input.sourceInputHash ?? null, model: model ?? null
    }), contractVersion: N4_VERSIONS.evidence
  });
}

function sourceReliability(row) {
  const policy = SOURCE_POLICY[row.sourceFamily];
  return row.sourceFamily === "owner_provided" && row.ownerVerified ? policy.verifiedReliability : policy.reliability;
}
function matchesContext(row, contextKeysForLookup) {
  return row.context.length === 0 || row.context.every((key) => contextKeysForLookup.has(key));
}
function contradictionKeys(rows) {
  const positive = new Set(rows.filter(({ value }) => value >= 0.55).map(({ dimension }) => dimension));
  return incompatible.filter(([a, b]) => positive.has(a) && positive.has(b)).flat();
}

export function buildSpotIntelligence(inputs, { spotId, asOf = "2026-08-17T12:00:00.000Z", context = {} } = {}) {
  const contextSet = new Set(normalizedContext(context));
  const byIdentity = new Map();
  for (const input of inputs) {
    const row = validateSpotEvidence(input, { asOf });
    if (row.spotId !== spotId) throw new Error("cross_spot_evidence_not_allowed");
    const existing = byIdentity.get(row.id);
    if (existing && contentHash(existing) !== contentHash(row)) throw new Error("spot_evidence_id_conflict");
    byIdentity.set(row.id, row);
  }
  const rows = [...byIdentity.values()].filter((row) => !row.validUntil || row.validUntil >= asOf).filter((row) => matchesContext(row, contextSet));
  const dimensions = new Map();
  for (const row of rows) {
    if (!dimensions.has(row.dimension)) dimensions.set(row.dimension, []);
    dimensions.get(row.dimension).push(row);
  }
  const contradictions = [];
  const interpretedRows = rows.filter(({ kind }) => kind === "INTERPRETATION");
  const contradictoryDimensions = new Set(contradictionKeys(interpretedRows));
  for (const [a, b] of incompatible) if (contradictoryDimensions.has(a) && contradictoryDimensions.has(b)) contradictions.push({ type: "INCOMPATIBLE_CLAIMS", dimensions: [a, b] });
  const facts = {}; const concepts = {};
  for (const [dimension, samples] of dimensions) {
    if (samples[0].kind === "FACT") {
      const weighted = samples.map((row) => ({ row, weight: sourceReliability(row) * freshnessFactor(row.observedAt, asOf, row.validityDays) }))
        .sort((a, b) => b.weight - a.weight || a.row.id.localeCompare(b.row.id));
      const winner = weighted[0];
      const conflicts = weighted.filter(({ row }) => row.value !== winner.row.value);
      const confidence = clamp(winner.weight * (conflicts.length ? 0.68 : 1));
      facts[dimension] = { value: winner.row.value, confidence, state: confidence >= 0.45 ? "KNOWN" : "UNKNOWN", evidenceIds: weighted.map(({ row }) => row.id), provenance: weighted.map(({ row }) => row.provenance) };
      if (conflicts.length) contradictions.push({ type: "FACT_CONFLICT", dimensions: [dimension], evidenceIds: conflicts.map(({ row }) => row.id) });
      continue;
    }
    const unique = new Map();
    for (const row of samples) {
      const key = `${row.sourceFamily}:${row.independentSubject}`;
      const score = sourceReliability(row) * freshnessFactor(row.observedAt, asOf, row.validityDays);
      if (!unique.has(key) || unique.get(key).score < score) unique.set(key, { row, score });
    }
    const weighted = [...unique.values()];
    const positive = weighted.filter(({ row }) => row.value > 0).reduce((sum, { row, score }) => sum + row.value * score, 0);
    const negative = weighted.filter(({ row }) => row.value < 0).reduce((sum, { row, score }) => sum + Math.abs(row.value) * score, 0);
    const support = positive + negative;
    const consistency = support ? Math.abs(positive - negative) / support : 0;
    const diversity = Math.min(1, weighted.length / 3);
    const contradictionPenalty = contradictoryDimensions.has(dimension) ? 0.45 : 1;
    const strength = support ? clamp((positive - negative) / Math.max(1, support), -1, 1) : 0;
    const confidence = clamp((1 - Math.exp(-support / 1.5)) * (0.45 + 0.35 * diversity + 0.20 * consistency) * contradictionPenalty);
    concepts[dimension] = { value: strength, confidence, state: confidence >= 0.25 ? "KNOWN" : "UNKNOWN", evidenceIds: weighted.map(({ row }) => row.id).sort(), provenance: weighted.map(({ row }) => row.provenance), contextual: samples.some(({ context }) => context.length > 0) };
  }
  const completenessDenominator = factKeys.size + SPOT_CONCEPT_KEYS.length;
  const knownCount = Object.values(facts).filter(({ state }) => state === "KNOWN").length + Object.values(concepts).filter(({ state }) => state === "KNOWN").length;
  const confidenceValues = [...Object.values(facts), ...Object.values(concepts)].filter(({ state }) => state === "KNOWN").map(({ confidence }) => confidence);
  const profile = {
    spotId, facts, concepts, unknownFacts: [...factKeys].filter((key) => !facts[key] || facts[key].state === "UNKNOWN"),
    unknownConcepts: SPOT_CONCEPT_KEYS.filter((key) => !concepts[key] || concepts[key].state === "UNKNOWN"),
    contradictions, completeness: knownCount / completenessDenominator,
    intelligenceConfidence: confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : 0,
    context: [...contextSet], evidenceCount: rows.length, calculatedAt: iso(asOf), schemaVersion: N4_VERSIONS.schema
  };
  return deepFreeze(profile);
}

export function serializeRelevantSpotIntelligence(profile, { conceptLimit = 12 } = {}) {
  if (!profile || profile.schemaVersion !== N4_VERSIONS.schema) throw new Error("spot_intelligence_version_mismatch");
  const concepts = Object.entries(profile.concepts).filter(([, row]) => row.state === "KNOWN")
    .sort((a, b) => Math.abs(b[1].value) * b[1].confidence - Math.abs(a[1].value) * a[1].confidence || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, Math.min(20, conceptLimit))).map(([concept, row]) => ({ concept, value: row.value, confidence: row.confidence, evidenceFamilies: [...new Set(row.provenance.map(({ sourceFamily }) => sourceFamily))].sort() }));
  return deepFreeze({
    spotId: profile.spotId,
    facts: Object.fromEntries(Object.entries(profile.facts).filter(([, row]) => row.state === "KNOWN").map(([key, row]) => [key, { value: row.value, confidence: row.confidence }])),
    concepts, contradictions: profile.contradictions.map(({ type, dimensions }) => ({ type, dimensions })),
    intelligenceConfidence: profile.intelligenceConfidence, evidenceSufficiency: profile.completeness >= 0.45 ? "RICH" : profile.completeness >= 0.15 ? "PARTIAL" : "SPARSE",
    version: N4_VERSIONS.serialization
  });
}

export function ownerClaimAudit(input) {
  const row = validateSpotEvidence({ ...input, kind: "INTERPRETATION", sourceFamily: "owner_provided" });
  return deepFreeze({ spotId: row.spotId, ownerId: row.ownerId, dimension: row.dimension, context: row.context, status: "PENDING_EVIDENCE", claimHash: contentHash(row), version: N4_VERSIONS.owner });
}
