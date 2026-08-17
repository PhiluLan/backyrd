import { contentHash } from "./canonical-json.mjs";
import {
  TASTE_ENGINE_CONTRACT_HASH,
  TASTE_ENGINE_VERSIONS,
  TASTE_SPACE,
  buildUserTasteMap
} from "./taste-engine.mjs";

export const N2_VERSIONS = Object.freeze({
  memoryEventContract: "backyrd-memory-event-contract-v1",
  evidenceMapping: "backyrd-memory-evidence-mapping-v1",
  userIntelligenceSchema: "backyrd-user-intelligence-schema-v1",
  behavioralPatternContract: "backyrd-behavioral-pattern-contract-v1",
  confidenceContract: "backyrd-user-intelligence-confidence-v1",
  retentionContract: "backyrd-memory-retention-v1"
});

export const RETENTION_CLASSES = Object.freeze({
  REQUEST_MINIMIZED: { maxAgeDays: 30, derivedAfterDays: 0 },
  EXPOSURE: { maxAgeDays: 90, derivedAfterDays: 0 },
  WEAK_INTERACTION: { maxAgeDays: 180, derivedAfterDays: 0 },
  DELIBERATE_INTENT: { maxAgeDays: 365, derivedAfterDays: 0 },
  OUTCOME: { maxAgeDays: 730, derivedAfterDays: 0 },
  EXPLICIT_FEEDBACK: { maxAgeDays: 730, derivedAfterDays: 0 },
  ONBOARDING: { maxAgeDays: 730, derivedAfterDays: 0 },
  CORRECTION: { maxAgeDays: 730, derivedAfterDays: 0 }
});

const event = (eventClass, evidenceFamily, retentionClass, options = {}) => Object.freeze({
  eventClass, evidenceFamily, retentionClass,
  tasteEventType: null, patternEligible: false, outcomeSupport: false,
  direction: 0, ...options
});

export const MEMORY_EVENT_REGISTRY = Object.freeze({
  decision_request: event("REQUEST", "request", "REQUEST_MINIMIZED"),
  structured_intent_recorded: event("REQUEST", "request", "REQUEST_MINIMIZED"),
  moment_signature_recorded: event("REQUEST", "moment", "REQUEST_MINIMIZED"),
  decision_results_shown: event("EXPOSURE", "exposure", "EXPOSURE", { tasteEventType: "decision_shown" }),
  candidate_exposed: event("EXPOSURE", "exposure", "EXPOSURE", { tasteEventType: "decision_shown" }),
  spot_tapped: event("WEAK_INTERACTION", "interaction", "WEAK_INTERACTION", { tasteEventType: "spot_tapped", direction: 1 }),
  search_result_opened: event("WEAK_INTERACTION", "interaction", "WEAK_INTERACTION", { tasteEventType: "search_result_opened", direction: 1 }),
  spot_opened: event("WEAK_INTERACTION", "interaction", "WEAK_INTERACTION", { tasteEventType: "spot_opened", direction: 1 }),
  saved: event("DELIBERATE_INTENT", "commitment", "DELIBERATE_INTENT", { tasteEventType: "saved", direction: 1, patternEligible: true }),
  save_removed: event("DELIBERATE_INTENT", "state_change", "DELIBERATE_INTENT", { tasteEventType: "save_removed" }),
  navigation_intent: event("DELIBERATE_INTENT", "commitment", "DELIBERATE_INTENT", { tasteEventType: "navigation_intent", direction: 1, patternEligible: true }),
  reservation_intent: event("DELIBERATE_INTENT", "commitment", "DELIBERATE_INTENT", { tasteEventType: "reservation_intent", direction: 1, patternEligible: true }),
  verified_visit: event("OUTCOME", "outcome", "OUTCOME", { tasteEventType: "verified_visit", direction: 1, patternEligible: true, outcomeSupport: true }),
  positive_post_visit: event("EXPLICIT_FEEDBACK", "outcome", "EXPLICIT_FEEDBACK", { tasteEventType: "positive_post_visit", direction: 1, patternEligible: true, outcomeSupport: true }),
  negative_post_visit: event("EXPLICIT_FEEDBACK", "explicit_negative", "EXPLICIT_FEEDBACK", { tasteEventType: "negative_post_visit", direction: -1, patternEligible: true, outcomeSupport: true }),
  exact_mood_feedback: event("EXPLICIT_FEEDBACK", "explicit", "EXPLICIT_FEEDBACK", { tasteEventType: "exact_mood_feedback", direction: 1, patternEligible: true, outcomeSupport: true }),
  explicit_positive: event("EXPLICIT_FEEDBACK", "explicit", "EXPLICIT_FEEDBACK", { tasteEventType: "liked", direction: 1, patternEligible: true, outcomeSupport: true }),
  explicit_negative: event("EXPLICIT_FEEDBACK", "explicit_negative", "EXPLICIT_FEEDBACK", { tasteEventType: "disliked", direction: -1, patternEligible: true, outcomeSupport: true }),
  not_there: event("CORRECTION", "correction", "CORRECTION", { tasteEventType: "not_there" }),
  remix_requested: event("REQUEST", "request", "REQUEST_MINIMIZED"),
  onboarding_preference: event("ONBOARDING", "onboarding", "ONBOARDING", { tasteEventType: "onboarding_preference", direction: 1 }),
  memory_correction: event("CORRECTION", "correction", "CORRECTION")
});

export const MOMENT_SIGNATURE_CONTRACT = Object.freeze({
  fields: ["audience", "daypart", "calendar", "occasion", "placeType", "friction", "distanceWillingness"],
  controlledValues: {
    audience: ["solo", "date", "friends", "family", "work", "other"],
    daypart: ["morning", "afternoon", "evening", "night"],
    calendar: ["weekday", "weekend"],
    placeType: ["cafe", "bar", "restaurant", "nightlife", "culture", "outing", "activity", "experience", "hotel", "other"],
    friction: ["low", "medium", "high"],
    distanceWillingness: ["near", "moderate", "far"]
  }
});
const MOMENT_KEYS = new Set(MOMENT_SIGNATURE_CONTRACT.fields);
const CONTEXT_VALUES = Object.fromEntries(Object.entries(MOMENT_SIGNATURE_CONTRACT.controlledValues).map(([key, values]) => [key, new Set(values)]));
const conceptKeys = new Set(TASTE_SPACE.map(({ key }) => key));
const FORBIDDEN_KEY = /(latent|ground[_-]?truth|oracle|expected[_-]?utility|fingerprint|contact|wifi|advertising[_-]?id|trust[_-]?score|moderation)/i;

export const N2_MEMORY_CONTRACT = Object.freeze({
  versions: N2_VERSIONS,
  consentPurpose: "personalized_recommendations",
  registry: MEMORY_EVENT_REGISTRY,
  retention: RETENTION_CLASSES,
  momentSignature: MOMENT_SIGNATURE_CONTRACT,
  immutableEvidence: true,
  correctionsAppendOnly: true,
  missingConsentMeaning: "NO_EVIDENCE",
  notThereMeaning: "CORRECTION_NOT_DISLIKE",
  cityIndependentUserTruth: true,
  relevantProjection: "N5_NOT_IMPLEMENTED",
  latentTruthRuntimeInput: false
});

export const N2_MEMORY_CONTRACT_HASH = contentHash(N2_MEMORY_CONTRACT);
export const N2_EVIDENCE_MAPPING_HASH = contentHash(MEMORY_EVENT_REGISTRY);
export const N2_RETENTION_CONTRACT_HASH = contentHash(RETENTION_CLASSES);

function iso(value, code) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(code);
  return date.toISOString();
}
function daysBetween(a, b) { return (new Date(b).valueOf() - new Date(a).valueOf()) / 86_400_000; }
function clamp(value, low = 0, high = 1) { return Math.max(low, Math.min(high, value)); }
function unique(values) { return [...new Set(values.filter(Boolean).map(String))].sort(); }

function assertNoForbiddenKeys(value, path = "event") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`forbidden_memory_field:${path}.${key}`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function normalizeMomentSignature(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_moment_signature");
  const unknown = Object.keys(input).filter((key) => !MOMENT_KEYS.has(key));
  if (unknown.length) throw new Error(`unsupported_moment_field:${unknown.sort().join(",")}`);
  const result = {};
  for (const key of [...MOMENT_KEYS].sort()) {
    if (input[key] == null || input[key] === "") continue;
    const value = String(input[key]).trim().toLowerCase();
    if (CONTEXT_VALUES[key] && !CONTEXT_VALUES[key].has(value)) throw new Error(`invalid_moment_value:${key}`);
    if (!/^[a-z0-9_-]{1,48}$/.test(value)) throw new Error(`invalid_moment_value:${key}`);
    result[key] = value;
  }
  return Object.freeze(result);
}

function contextKeys(signature) {
  const values = [];
  if (signature.audience && signature.audience !== "other") values.push(`audience.${signature.audience}`);
  if (["morning", "afternoon", "evening"].includes(signature.daypart)) values.push(`time.${signature.daypart}`);
  if (signature.calendar) values.push(`time.${signature.calendar}`);
  return values;
}

export function validateMemoryEvent(input, { asOf = new Date().toISOString(), allowExpired = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_memory_event");
  assertNoForbiddenKeys(input);
  const contract = MEMORY_EVENT_REGISTRY[input.eventType];
  if (!contract) throw new Error(`unsupported_memory_event:${input.eventType}`);
  if (!input.id || !input.userId || !input.idempotencyKey) throw new Error("memory_identity_required");
  if (input.contractVersion !== N2_VERSIONS.memoryEventContract) throw new Error("memory_contract_version_mismatch");
  if (input.consentPurpose !== N2_MEMORY_CONTRACT.consentPurpose || input.consentState !== "granted") throw new Error("personalization_consent_required");
  const normalizedAsOf = iso(asOf, "invalid_as_of");
  const occurredAt = iso(input.occurredAt, "invalid_occurred_at");
  const observedAt = iso(input.observedAt ?? occurredAt, "invalid_observed_at");
  const ingestedAt = iso(input.ingestedAt ?? observedAt, "invalid_ingested_at");
  if (new Date(occurredAt) > new Date(normalizedAsOf) || new Date(observedAt) > new Date(normalizedAsOf) || new Date(ingestedAt) > new Date(normalizedAsOf)) throw new Error("future_memory_event_not_allowed");
  if (new Date(observedAt) < new Date(occurredAt)) throw new Error("observed_before_occurred");
  const retention = RETENTION_CLASSES[contract.retentionClass];
  if (!allowExpired && daysBetween(occurredAt, normalizedAsOf) > retention.maxAgeDays) throw new Error("stale_memory_event_outside_retention");
  const momentSignature = normalizeMomentSignature(input.momentSignature);
  const concepts = unique(input.spotEvidence?.concepts ?? []);
  const placeType = input.spotEvidence?.placeType ? String(input.spotEvidence.placeType).toLowerCase() : momentSignature.placeType ?? null;
  if (concepts.some((concept) => !conceptKeys.has(concept))) throw new Error("unknown_spot_evidence_concept");
  if (placeType && !CONTEXT_VALUES.placeType.has(placeType)) throw new Error("unknown_place_type");
  if (contract.tasteEventType && contract.direction !== 0 && concepts.length === 0) throw new Error("learning_event_requires_spot_evidence");
  const provenance = input.provenance ?? {};
  if (!provenance.source || !provenance.sourceEventId) throw new Error("memory_provenance_required");
  const normalized = {
    id: String(input.id), userId: String(input.userId), idempotencyKey: String(input.idempotencyKey),
    eventType: input.eventType, eventClass: contract.eventClass, evidenceFamily: contract.evidenceFamily,
    contractVersion: N2_VERSIONS.memoryEventContract, occurredAt, observedAt, ingestedAt,
    decisionId: input.decisionId ? String(input.decisionId) : null,
    sessionId: input.sessionId ? String(input.sessionId) : null,
    spotId: input.spotId ? String(input.spotId) : null,
    momentSignature, spotEvidence: { placeType, concepts },
    provenance: { source: String(provenance.source), sourceEventId: String(provenance.sourceEventId), sourceVersion: String(provenance.sourceVersion ?? "unknown") },
    consentPurpose: input.consentPurpose, consentState: input.consentState,
    exposure: input.exposure ? { rank: input.exposure.rank ?? null, propensity: input.exposure.propensity ?? null } : null,
    supersedesEventId: input.supersedesEventId ? String(input.supersedesEventId) : null,
    retentionClass: contract.retentionClass, expiresAt: new Date(new Date(occurredAt).valueOf() + retention.maxAgeDays * 86_400_000).toISOString(),
    direction: contract.direction, learningEligible: Boolean(contract.tasteEventType), patternEligible: contract.patternEligible,
    outcomeSupport: contract.outcomeSupport
  };
  if (normalized.exposure?.rank != null && (!Number.isInteger(normalized.exposure.rank) || normalized.exposure.rank < 1 || normalized.exposure.rank > 500)) throw new Error("invalid_exposure_rank");
  if (normalized.exposure?.propensity != null && (!(normalized.exposure.propensity > 0) || normalized.exposure.propensity > 1)) throw new Error("invalid_exposure_propensity");
  return Object.freeze({ ...normalized, eventHash: contentHash(normalized) });
}

export function ingestMemoryEvents(inputs, options = {}) {
  const byId = new Map(); const byIdempotency = new Map();
  for (const input of inputs) {
    const current = validateMemoryEvent(input, options);
    for (const [key, map] of [[current.id, byId], [current.idempotencyKey, byIdempotency]]) {
      const existing = map.get(key);
      if (existing && existing.eventHash !== current.eventHash) throw new Error("memory_idempotency_conflict");
      map.set(key, current);
    }
  }
  const userIds = new Set([...byId.values()].map(({ userId }) => userId));
  if (userIds.size > 1) throw new Error("cross_user_memory_batch");
  const superseded = new Set();
  for (const current of byId.values()) {
    if (!current.supersedesEventId) continue;
    const prior = byId.get(current.supersedesEventId);
    if (!prior) throw new Error("superseded_memory_event_missing");
    if (prior.userId !== current.userId) throw new Error("cross_user_memory_correction");
    if (new Date(current.occurredAt) < new Date(prior.occurredAt)) throw new Error("correction_before_original");
    superseded.add(prior.id);
  }
  const events = [...byId.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const activeEvents = events.filter(({ id }) => !superseded.has(id));
  const ledger = { userId: [...userIds][0] ?? null, events, activeEvents, supersededEventIds: [...superseded].sort(), versions: N2_VERSIONS };
  return Object.freeze({ ...ledger, ledgerHash: contentHash(ledger) });
}

export function memoryToTasteEvidence(ledger) {
  return ledger.activeEvents.flatMap((entry) => {
    const mapping = MEMORY_EVENT_REGISTRY[entry.eventType];
    if (!mapping.tasteEventType) return [];
    return [{
      id: entry.id, userId: entry.userId, eventType: mapping.tasteEventType,
      concepts: entry.spotEvidence.concepts, consent: "granted", occurredAt: entry.occurredAt,
      spotId: entry.spotId, sessionId: entry.sessionId, placeType: entry.spotEvidence.placeType,
      contexts: contextKeys(entry.momentSignature)
    }];
  });
}

function patternKey(signature) {
  const dimensions = ["audience", "daypart", "calendar", "occasion", "placeType", "friction", "distanceWillingness"]
    .filter((key) => signature[key]).map((key) => `${key}=${signature[key]}`);
  return dimensions.length >= 2 ? dimensions.join("|") : null;
}

export function deriveBehavioralPatterns(ledger, { asOf = new Date().toISOString() } = {}) {
  const grouped = new Map();
  for (const entry of ledger.activeEvents.filter(({ patternEligible }) => patternEligible)) {
    const key = patternKey(entry.momentSignature);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }
  return [...grouped.entries()].map(([key, entries]) => {
    const sessions = new Set(entries.map(({ sessionId }) => sessionId).filter(Boolean));
    const spots = new Set(entries.map(({ spotId }) => spotId).filter(Boolean));
    const outcomes = entries.filter(({ outcomeSupport }) => outcomeSupport);
    const positive = entries.filter(({ direction }) => direction > 0).length;
    const negative = entries.filter(({ direction }) => direction < 0).length;
    const first = entries[0].occurredAt; const last = entries.at(-1).occurredAt;
    const spanDays = Math.max(0, daysBetween(first, last));
    const consistency = entries.length ? Math.abs(positive - negative) / entries.length : 0;
    const support = Math.min(1, sessions.size / 5) * 0.35 + Math.min(1, spots.size / 4) * 0.2 + Math.min(1, outcomes.length / 3) * 0.3 + Math.min(1, spanDays / 30) * 0.15;
    const recency = 2 ** (-Math.max(0, daysBetween(last, asOf)) / 180);
    const confidence = clamp(support * (0.65 + 0.35 * consistency) * (0.7 + 0.3 * recency));
    const enoughIndependence = sessions.size >= 3 && spots.size >= 2 && outcomes.length >= 2 && spanDays >= 7;
    const pattern = {
      patternKey: key, contextSignature: entries[0].momentSignature,
      state: enoughIndependence && confidence >= 0.55 ? "KNOWN" : "UNKNOWN",
      confidence, evidenceCount: entries.length, independentSessionCount: sessions.size,
      independentSpotCount: spots.size, outcomeSupportCount: outcomes.length,
      positiveCount: positive, negativeCount: negative, contradictionRate: entries.length ? Math.min(positive, negative) / entries.length : 0,
      firstEvidenceAt: first, lastEvidenceAt: last,
      recencyState: recency >= 0.75 ? "CURRENT" : recency >= 0.35 ? "AGING" : "STALE",
      evidenceIds: entries.map(({ id }) => id).sort(), version: N2_VERSIONS.behavioralPatternContract
    };
    return Object.freeze({ ...pattern, patternHash: contentHash(pattern) });
  }).sort((a, b) => a.patternKey.localeCompare(b.patternKey));
}

function buildTimeline(ledger, tasteMap, patterns) {
  const eventRows = ledger.events.map((entry) => ({
    occurredAt: entry.occurredAt, kind: "MEMORY", id: entry.id, eventType: entry.eventType,
    eventClass: entry.eventClass, status: ledger.supersededEventIds.includes(entry.id) ? "SUPERSEDED" : "ACTIVE",
    source: entry.provenance.source
  }));
  const beliefRows = tasteMap.rows.map((row) => ({ occurredAt: row.lastUpdatedAt, kind: "BELIEF", concept: row.concept, scope: row.scope, affinity: row.affinity, confidence: row.confidence }));
  const patternRows = patterns.filter(({ state }) => state === "KNOWN").map((row) => ({ occurredAt: row.lastEvidenceAt, kind: "PATTERN", patternKey: row.patternKey, confidence: row.confidence }));
  return [...eventRows, ...beliefRows, ...patternRows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.kind.localeCompare(b.kind));
}

export function buildUserIntelligence(inputs, { asOf = new Date().toISOString(), consentState = "granted", queryCity = null } = {}) {
  if (consentState !== "granted") {
    const empty = { userId: inputs[0]?.userId ?? null, knowledgeState: "UNKNOWN", consentState, tasteMap: null, patterns: [], contradictions: [], timeline: [], queryCity, versions: N2_VERSIONS };
    return Object.freeze({ ...empty, intelligenceHash: contentHash(empty) });
  }
  const ledger = ingestMemoryEvents(inputs, { asOf });
  const tasteMap = buildUserTasteMap(memoryToTasteEvidence(ledger), { asOf });
  const patterns = deriveBehavioralPatterns(ledger, { asOf });
  const contradictions = tasteMap.rows.filter(({ positiveEventCount, negativeEventCount }) => positiveEventCount > 0 && negativeEventCount > 0)
    .map(({ concept, scope, confidence, positiveEventCount, negativeEventCount }) => ({ concept, scope, confidence, positiveEventCount, negativeEventCount }));
  const qualified = ledger.activeEvents.filter(({ direction }) => direction !== 0).length;
  const independentSessions = new Set(ledger.activeEvents.map(({ sessionId }) => sessionId).filter(Boolean)).size;
  const knowledgeState = qualified === 0 ? "COLD" : qualified < 5 ? "EARLY" : independentSessions < 10 ? "DEVELOPING" : independentSessions < 30 ? "MATURE" : "LONG_TERM";
  const profile = {
    userId: ledger.userId, asOf: iso(asOf, "invalid_as_of"), queryCity,
    knowledgeState, memorySummary: {
      eventCount: ledger.events.length, activeEventCount: ledger.activeEvents.length,
      qualifiedEventCount: qualified, independentSessionCount: independentSessions,
      eventFamilies: unique(ledger.activeEvents.map(({ evidenceFamily }) => evidenceFamily))
    },
    tasteMap, patterns, contradictions, timeline: buildTimeline(ledger, tasteMap, patterns),
    graph: {
      user: ledger.userId,
      tasteConcepts: unique(tasteMap.rows.map(({ concept }) => concept)),
      placeTypes: unique(tasteMap.rows.filter(({ scope }) => scope.kind === "PLACE_TYPE").map(({ scope }) => scope.key)),
      contexts: unique(tasteMap.rows.filter(({ scope }) => scope.kind === "CONTEXT").map(({ scope }) => scope.key)),
      occasionPatterns: patterns.filter(({ state }) => state === "KNOWN").map(({ patternKey }) => patternKey),
      evidenceIds: ledger.activeEvents.map(({ id }) => id),
      outcomeIds: ledger.activeEvents.filter(({ outcomeSupport }) => outcomeSupport).map(({ id }) => id)
    },
    versions: N2_VERSIONS,
    tasteEngine: { versions: TASTE_ENGINE_VERSIONS, contractHash: TASTE_ENGINE_CONTRACT_HASH, integration: "UNCHANGED_ADAPTER" },
    boundaries: { relevantUserProjection: "N5_NOT_IMPLEMENTED", currentMoment: "N3_NOT_IMPLEMENTED", cityIndependentTruth: true }
  };
  return Object.freeze({ ...profile, intelligenceHash: contentHash(profile) });
}

export function queryUserIntelligence(profile, { concepts = [], placeType = null, contexts = [], includeTimeline = false, timelineLimit = 50 } = {}) {
  if (!profile || profile.consentState === "withdrawn") return { knowledgeState: "UNKNOWN", tasteRows: [], patterns: [], timeline: [], versions: N2_VERSIONS };
  const requested = new Set(concepts);
  const tasteRows = profile.tasteMap.rows.filter((row) => (!requested.size || requested.has(row.concept)) &&
    (row.scope.kind === "GLOBAL" || (row.scope.kind === "PLACE_TYPE" && row.scope.key === placeType) || (row.scope.kind === "CONTEXT" && contexts.includes(row.scope.key))));
  return {
    userId: profile.userId, knowledgeState: profile.knowledgeState, tasteRows,
    patterns: profile.patterns.filter(({ state }) => state === "KNOWN"),
    contradictions: profile.contradictions,
    timeline: includeTimeline ? profile.timeline.slice(-Math.max(0, Math.min(200, timelineLimit))) : [],
    versions: profile.versions, boundary: "N5_MUST_SELECT_RELEVANCE"
  };
}

export function validateN2ScientificBoundary(value) {
  return !FORBIDDEN_KEY.test(JSON.stringify(value));
}
