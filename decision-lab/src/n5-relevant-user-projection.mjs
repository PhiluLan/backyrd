import { contentHash } from "./canonical-json.mjs";
import { N2_VERSIONS } from "./n2-memory-user-intelligence.mjs";
import { N3_VERSIONS } from "./n3-moment-intelligence.mjs";
import { TASTE_ENGINE_VERSIONS, TASTE_SPACE } from "./taste-engine.mjs";

export const N5_VERSIONS = Object.freeze({
  projection: "backyrd-relevant-user-projection-v1",
  relevance: "backyrd-user-knowledge-relevance-v1",
  sufficiency: "backyrd-decision-user-knowledge-sufficiency-v1",
  suppression: "backyrd-user-knowledge-suppression-v1",
  serialization: "backyrd-n6-user-knowledge-serialization-v1",
  validation: "backyrd-relevant-user-projection-validation-v1"
});

export const N5_LIMITS = Object.freeze({
  maxTasteConcepts: 12, maxPatterns: 3, maxRecentEvidence: 3,
  maxProvenanceFamiliesPerItem: 4, maxSuppressionAudit: 24,
  maxSerializedBytes: 12_000, maxEstimatedTokens: 3_000
});

export const N5_REASON_CODES = Object.freeze([
  "STRONG_KNOWN_PREFERENCE", "KNOWN_IN_THIS_CONTEXT", "KNOWN_IN_THIS_PLACE_TYPE",
  "RECURRING_OCCASION_PATTERN", "RECENT_RELEVANT_OUTCOME", "LOW_CONTEXT_KNOWLEDGE",
  "LOW_PLACE_TYPE_KNOWLEDGE", "CONFLICTING_HISTORY", "COLD_USER",
  "CURRENT_INTENT_OVERRIDES_HISTORY", "CURRENT_MOMENT_RELEVANCE", "GLOBAL_RELEVANT_FALLBACK",
  "IRRELEVANT_CONTEXT_SUPPRESSED", "IRRELEVANT_PLACE_TYPE_SUPPRESSED", "LOW_CONFIDENCE_SUPPRESSED",
  "STALE_EVIDENCE_SUPPRESSED", "MINIMUM_NECESSARY_USER_KNOWLEDGE",
  "NOT_RELEVANT_TO_CURRENT_DECISION"
]);

const conceptKeys = new Set(TASTE_SPACE.map(({ key }) => key));
const placeTypeKeys = new Set(TASTE_SPACE.filter(({ family }) => family === "place_type").map(({ key }) => key.slice(11)));
const forbiddenKey = /(latent|ground[_-]?truth|oracle|expected[_-]?utility|evaluation[_-]?label|spot[_-]?score|trust[_-]?score|moderation|fingerprint|contact|wifi|demographic|religion|sexuality|health|raw[_-]?history|prompt[_-]?injection)/i;

const MOMENT_CONCEPTS = Object.freeze({
  vibe: {
    cozy: ["vibe.cozy"], quiet: ["vibe.quiet", "social_style.conversation_friendly"], relaxed: ["energy.calm", "vibe.cozy"],
    lively: ["vibe.lively", "energy.energetic"], social: ["social_style.social"], romantic: ["social_style.romantic_friendly"],
    playful: ["vibe.playful"], elegant: ["character.design_led"], authentic: ["character.authentic_character"],
    inspiring: ["character.design_led"], exploratory: ["discovery.hidden_gem", "novelty.novel"]
  },
  social_context: {
    solo: ["social_style.solo_friendly"], date: ["social_style.romantic_friendly", "social_style.conversation_friendly"],
    friends: ["social_style.social", "social_style.group_friendly"], family: ["social_style.family_friendly"],
    family_with_kids: ["social_style.family_friendly"], work: ["social_style.work_friendly", "social_style.conversation_friendly"],
    group: ["social_style.group_friendly", "social_style.social"]
  },
  budget_orientation: { budget: ["price.budget"], premium: ["price.premium"] },
  novelty_appetite: { familiar: ["novelty.familiar"], novel: ["novelty.novel", "discovery.hidden_gem"] },
  environment: { indoor: ["environment.indoor"], outdoor: ["environment.outdoor"] },
  energy: { low: ["energy.calm"], high: ["energy.energetic"] },
  social_intensity: { low: ["social_style.conversation_friendly"], high: ["social_style.social", "energy.energetic"] }
});

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const unique = (values) => [...new Set(values.filter(Boolean))].sort();

function assertNoForbiddenKeys(value, path = "n5") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const canonicalBoundaryAssertion = path === "n5.currentMoment.boundaries" && key === "latentTruthRuntimeInput" && child === false;
    if (canonicalBoundaryAssertion) continue;
    if (forbiddenKey.test(key)) throw new Error(`forbidden_n5_input:${path}.${key}`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function normalizeIntent(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_current_intent");
  const allowed = new Set(["requiredPlaceTypes", "preferredPlaceTypes", "excludedPlaceTypes", "conceptDirections", "activityBroad"]);
  const unsupported = Object.keys(input).filter((key) => !allowed.has(key));
  if (unsupported.length) throw new Error(`unsupported_current_intent:${unsupported.sort().join(",")}`);
  const requiredPlaceTypes = unique(input.requiredPlaceTypes ?? []);
  const preferredPlaceTypes = unique(input.preferredPlaceTypes ?? []);
  const excludedPlaceTypes = unique(input.excludedPlaceTypes ?? []);
  if ([...requiredPlaceTypes, ...preferredPlaceTypes, ...excludedPlaceTypes].some((key) => !placeTypeKeys.has(key))) throw new Error("invalid_intent_place_type");
  const conceptDirections = (input.conceptDirections ?? []).map(({ concept, direction }) => {
    if (!conceptKeys.has(concept) || ![-1, 1].includes(direction)) throw new Error("invalid_intent_concept_direction");
    return { concept, direction };
  }).sort((a, b) => a.concept.localeCompare(b.concept));
  return deepFreeze({ requiredPlaceTypes, preferredPlaceTypes, excludedPlaceTypes, conceptDirections, activityBroad: input.activityBroad === true });
}

function validateInputs({ currentIntent, currentMoment, userIntelligence }) {
  assertNoForbiddenKeys({ currentIntent, currentMoment, userIntelligence });
  if (!currentMoment || currentMoment.version !== N3_VERSIONS.momentSchema) throw new Error("n3_moment_version_mismatch");
  if (!userIntelligence || userIntelligence.versions?.userIntelligenceSchema !== N2_VERSIONS.userIntelligenceSchema) throw new Error("n2_intelligence_version_mismatch");
  if (userIntelligence.consentState !== "granted") throw new Error("personalization_consent_required");
  if (currentMoment.userId && userIntelligence.userId && currentMoment.userId !== userIntelligence.userId) throw new Error("cross_user_projection");
  if (!userIntelligence.tasteMap?.rows || !Array.isArray(userIntelligence.patterns)) throw new Error("malformed_user_intelligence");
  if (userIntelligence.tasteMap.versions?.learningEngine !== TASTE_ENGINE_VERSIONS.learningEngine) throw new Error("taste_map_version_mismatch");
  if (userIntelligence.patterns.some(({ version }) => version !== N2_VERSIONS.behavioralPatternContract)) throw new Error("behavioral_pattern_version_mismatch");
  return normalizeIntent(currentIntent);
}

function momentValue(moment, dimension) { return moment.fields?.[dimension]?.value; }
function momentContexts(moment) {
  const social = momentValue(moment, "social_context");
  const daypart = momentValue(moment, "daypart");
  const calendar = momentValue(moment, "calendar");
  return unique([
    ["solo", "date", "friends", "family", "work"].includes(social) ? `audience.${social}` : social === "family_with_kids" ? "audience.family" : null,
    ["morning", "afternoon", "evening"].includes(daypart) ? `time.${daypart}` : null,
    ["weekday", "weekend"].includes(calendar) ? `time.${calendar}` : null
  ]);
}
function inferredPlaceTypes(intent, moment) {
  const explicit = unique([...intent.requiredPlaceTypes, ...intent.preferredPlaceTypes]);
  if (explicit.length || intent.activityBroad) return explicit;
  const activities = momentValue(moment, "activity_intent") ?? [];
  const mapped = activities.flatMap((item) => item === "food" ? ["restaurant"] : item === "drink" ? ["bar"] : ["culture", "outing", "activity", "experience"].includes(item) ? [item] : []);
  return unique(mapped);
}
function activeConcepts(intent, moment) {
  const map = new Map(intent.conceptDirections.map((row) => [row.concept, { direction: row.direction, authority: "EXPLICIT_CURRENT_INTENT", relevance: 1 }]));
  for (const [dimension, values] of Object.entries(MOMENT_CONCEPTS)) {
    const current = momentValue(moment, dimension);
    const candidates = Array.isArray(current) ? current : [current];
    for (const value of candidates) for (const concept of values[value] ?? []) if (!map.has(concept)) {
      const confidence = moment.fields[dimension]?.confidence ?? 0;
      map.set(concept, { direction: 0, authority: "CURRENT_MOMENT", relevance: clamp(0.45 + 0.45 * confidence) });
    }
  }
  const lowFriction = momentValue(moment, "planning_tolerance") === "low" || momentValue(moment, "spontaneity") === "spontaneous" || momentValue(moment, "duration") === "under_60m";
  return { map, lowFriction };
}

function rowApplicability(row, { concepts, contexts, placeTypes, intent, lowFriction }) {
  const intentRule = concepts.get(row.concept);
  if (intentRule?.direction && Math.sign(row.affinity) !== intentRule.direction) return { relevance: 0, reason: "CURRENT_INTENT_OVERRIDES_HISTORY", conflict: true };
  if (row.scope.kind === "CONTEXT" && !contexts.includes(row.scope.key)) return { relevance: 0, reason: "IRRELEVANT_CONTEXT_SUPPRESSED" };
  if (row.scope.kind === "PLACE_TYPE" && (!placeTypes.length || !placeTypes.includes(row.scope.key))) return { relevance: 0, reason: "IRRELEVANT_PLACE_TYPE_SUPPRESSED" };
  if (intent.excludedPlaceTypes.includes(row.scope.key)) return { relevance: 0, reason: "IRRELEVANT_PLACE_TYPE_SUPPRESSED" };
  if (row.decayState === "STALE") return { relevance: 0, reason: "STALE_EVIDENCE_SUPPRESSED" };
  if (row.confidence < 0.35) return { relevance: 0, reason: "LOW_CONFIDENCE_SUPPRESSED" };
  if (row.scope.kind === "GLOBAL" && !intentRule) return { relevance: 0, reason: "NOT_RELEVANT_TO_CURRENT_DECISION", fallbackCandidate: true };
  let relevance = intentRule?.relevance ?? 0.48;
  if (row.scope.kind === "CONTEXT") relevance = Math.max(relevance, 0.88);
  if (row.scope.kind === "PLACE_TYPE") relevance = Math.max(relevance, 0.76);
  if (row.scope.kind === "GLOBAL" && !intentRule) relevance = 0.46;
  if (lowFriction && ["discovery.hidden_gem", "novelty.novel", "character.design_led"].includes(row.concept)) relevance *= 0.35;
  return { relevance: clamp(relevance), reason: row.scope.kind === "CONTEXT" ? "KNOWN_IN_THIS_CONTEXT" : row.scope.kind === "PLACE_TYPE" ? "KNOWN_IN_THIS_PLACE_TYPE" : intentRule ? "CURRENT_MOMENT_RELEVANCE" : "GLOBAL_RELEVANT_FALLBACK" };
}

function selectTaste(profile, state) {
  const selectedByConcept = new Map(); const suppressed = []; const globalFallback = [];
  const priority = { CONTEXT: 3, PLACE_TYPE: 2, GLOBAL: 1 };
  for (const row of profile.tasteMap.rows) {
    const applicability = rowApplicability(row, state);
    if (applicability.relevance === 0) {
      if (applicability.fallbackCandidate) { globalFallback.push(row); continue; }
      suppressed.push({ type: "TASTE", key: row.concept, scope: row.scope, reasonCode: applicability.reason });
      continue;
    }
    const item = {
      concept: row.concept, affinity: row.affinity, confidence: row.confidence,
      relevance: applicability.relevance, sourceLayer: row.scope.kind, scope: row.scope,
      provenanceSummary: unique(row.sourceFamilies).slice(0, N5_LIMITS.maxProvenanceFamiliesPerItem),
      reasonCodes: unique([applicability.reason, row.confidence >= 0.72 ? "STRONG_KNOWN_PREFERENCE" : null]),
      lastUpdatedAt: row.lastUpdatedAt, evidenceSummary: { positive: row.positiveEventCount, negative: row.negativeEventCount, independentSpots: row.distinctSpotCount, independentSessions: row.distinctSessionCount }
    };
    const current = selectedByConcept.get(row.concept);
    if (!current || priority[item.sourceLayer] > priority[current.sourceLayer] || (priority[item.sourceLayer] === priority[current.sourceLayer] && item.confidence * item.relevance > current.confidence * current.relevance)) {
      if (current) suppressed.push({ type: "TASTE", key: current.concept, scope: current.scope, reasonCode: "MORE_SPECIFIC_LAYER_SELECTED" });
      selectedByConcept.set(row.concept, item);
    } else suppressed.push({ type: "TASTE", key: row.concept, scope: row.scope, reasonCode: "MORE_SPECIFIC_LAYER_SELECTED" });
  }
  if (state.intent.activityBroad || selectedByConcept.size === 0) {
    for (const row of globalFallback) selectedByConcept.set(row.concept, {
      concept: row.concept, affinity: row.affinity, confidence: row.confidence, relevance: 0.46,
      sourceLayer: row.scope.kind, scope: row.scope,
      provenanceSummary: unique(row.sourceFamilies).slice(0, N5_LIMITS.maxProvenanceFamiliesPerItem),
      reasonCodes: unique(["GLOBAL_RELEVANT_FALLBACK", row.confidence >= 0.72 ? "STRONG_KNOWN_PREFERENCE" : null]),
      lastUpdatedAt: row.lastUpdatedAt,
      evidenceSummary: { positive: row.positiveEventCount, negative: row.negativeEventCount, independentSpots: row.distinctSpotCount, independentSessions: row.distinctSessionCount }
    });
  } else for (const row of globalFallback) suppressed.push({ type: "TASTE", key: row.concept, scope: row.scope, reasonCode: "NOT_RELEVANT_TO_CURRENT_DECISION" });
  const selected = [...selectedByConcept.values()].sort((a, b) => b.relevance * b.confidence * Math.abs(b.affinity) - a.relevance * a.confidence * Math.abs(a.affinity) || a.concept.localeCompare(b.concept));
  for (const item of selected.slice(N5_LIMITS.maxTasteConcepts)) suppressed.push({ type: "TASTE", key: item.concept, scope: item.scope, reasonCode: "PROJECTION_BUDGET" });
  return { selected: selected.slice(0, N5_LIMITS.maxTasteConcepts), suppressed };
}

function patternSignature(moment, placeTypes) {
  const social = momentValue(moment, "social_context");
  return {
    audience: social === "family_with_kids" ? "family" : social,
    daypart: momentValue(moment, "daypart"), calendar: momentValue(moment, "calendar"), occasion: momentValue(moment, "occasion"),
    placeType: placeTypes.length === 1 ? placeTypes[0] : undefined,
    friction: momentValue(moment, "planning_tolerance"), distanceWillingness: momentValue(moment, "distance_willingness")
  };
}
function selectPatterns(profile, current) {
  const selected = []; const suppressed = [];
  for (const pattern of profile.patterns) {
    if (pattern.state !== "KNOWN" || pattern.recencyState === "STALE" || pattern.confidence < 0.55) { suppressed.push({ type: "PATTERN", key: pattern.patternKey, reasonCode: "STALE_OR_LOW_CONFIDENCE_PATTERN" }); continue; }
    const comparable = Object.entries(pattern.contextSignature).filter(([key]) => current[key] != null);
    const matching = comparable.filter(([key, value]) => current[key] === value).length;
    const contradictions = comparable.filter(([key, value]) => current[key] !== value).length;
    const similarity = comparable.length ? matching / comparable.length : 0;
    if (matching < 2 || contradictions > 0 || similarity < 0.6) { suppressed.push({ type: "PATTERN", key: pattern.patternKey, reasonCode: "WRONG_CONTEXT_PATTERN" }); continue; }
    selected.push({ patternKey: pattern.patternKey, contextSignature: pattern.contextSignature, confidence: pattern.confidence, relevance: clamp(similarity * pattern.confidence), applicability: similarity, outcomeSupportCount: pattern.outcomeSupportCount, provenanceSummary: ["N2_BEHAVIORAL_PATTERN"], reasonCodes: ["RECURRING_OCCASION_PATTERN"] });
  }
  selected.sort((a, b) => b.relevance - a.relevance || a.patternKey.localeCompare(b.patternKey));
  for (const item of selected.slice(N5_LIMITS.maxPatterns)) suppressed.push({ type: "PATTERN", key: item.patternKey, reasonCode: "PROJECTION_BUDGET" });
  return { selected: selected.slice(0, N5_LIMITS.maxPatterns), suppressed };
}

function recentSummaries(taste) {
  return taste.filter(({ lastUpdatedAt, relevance }) => relevance >= 0.65 && lastUpdatedAt)
    .sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.concept.localeCompare(b.concept))
    .slice(0, N5_LIMITS.maxRecentEvidence)
    .map((row) => ({ concept: row.concept, occurredAt: row.lastUpdatedAt, confidence: row.confidence, relevance: row.relevance, provenanceSummary: row.provenanceSummary, reasonCodes: [row.provenanceSummary.includes("outcome") ? "RECENT_RELEVANT_OUTCOME" : "CURRENT_MOMENT_RELEVANCE"] }));
}

function sufficiency({ taste, patterns, moment, placeTypes, contexts, contradictions }) {
  const tasteEvidence = taste.reduce((sum, row) => sum + row.confidence * row.relevance, 0);
  const patternEvidence = patterns.reduce((sum, row) => sum + row.confidence * row.relevance, 0);
  const specificity = (contexts.length ? 0.12 : 0) + (placeTypes.length ? 0.12 : 0);
  const contradictionPenalty = Math.min(0.25, contradictions.length * 0.08);
  const hasSpecificKnowledge = taste.some(({ sourceLayer }) => sourceLayer === "CONTEXT" || sourceLayer === "PLACE_TYPE") || patterns.length > 0;
  const scopePenalty = placeTypes.length && !hasSpecificKnowledge ? 0.45 : 1;
  const score = clamp(((1 - Math.exp(-(tasteEvidence + 0.8 * patternEvidence) / 2.2)) * 0.72 + specificity + 0.16 * moment.overallConfidence - contradictionPenalty) * scopePenalty);
  const level = score >= 0.72 ? "HIGH" : score >= 0.42 ? "MEDIUM" : "LOW";
  return { score: Number(score.toFixed(6)), level, relevantTasteCount: taste.length, relevantPatternCount: patterns.length, contextKnowledge: taste.some(({ sourceLayer }) => sourceLayer === "CONTEXT") ? "KNOWN" : "LOW_OR_UNKNOWN", placeTypeKnowledge: taste.some(({ sourceLayer }) => sourceLayer === "PLACE_TYPE") ? "KNOWN" : "LOW_OR_UNKNOWN", contradictionCount: contradictions.length };
}

export const N5_CONTRACT = deepFreeze({
  versions: N5_VERSIONS, limits: N5_LIMITS, reasonCodes: N5_REASON_CODES,
  authority: ["EXPLICIT_CURRENT_INTENT", "N3_CURRENT_MOMENT", "N2_CONTEXT_TASTE", "N2_PLACE_TYPE_TASTE", "N2_GLOBAL_TASTE"],
  principles: { minimumNecessary: true, candidateIndependent: true, noRanking: true, noLlm: true, noUserIntelligenceMutation: true, unknownIsValid: true, rawHistoryProhibited: true, latentTruthRuntimeInput: false, productionIntegration: "NOT_STARTED" }
});
export const N5_CONTRACT_HASH = contentHash(N5_CONTRACT);
export const N5_RELEVANCE_CONTRACT_HASH = contentHash({ hierarchy: N5_CONTRACT.authority, momentConcepts: MOMENT_CONCEPTS });
export const N5_SUFFICIENCY_CONTRACT_HASH = contentHash({ thresholds: { HIGH: 0.72, MEDIUM: 0.42, LOW: 0 }, inputs: ["relevant_evidence", "confidence", "context_match", "place_type_match", "contradictions", "moment_confidence"] });
export const N5_SUPPRESSION_CONTRACT_HASH = contentHash({ reasons: N5_REASON_CODES.filter((code) => code.includes("SUPPRESS") || code.includes("OVERRIDE")), auditLimit: N5_LIMITS.maxSuppressionAudit });

export function buildRelevantUserProjection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_n5_input");
  const unsupported = Object.keys(input).filter((key) => !["currentIntent", "currentMoment", "userIntelligence"].includes(key));
  if (unsupported.length) throw new Error(`unsupported_n5_input:${unsupported.sort().join(",")}`);
  const intent = validateInputs(input);
  const { currentMoment, userIntelligence } = input;
  const contexts = momentContexts(currentMoment); const placeTypes = inferredPlaceTypes(intent, currentMoment);
  const conceptState = activeConcepts(intent, currentMoment);
  const state = { concepts: conceptState.map, contexts, placeTypes, intent, lowFriction: conceptState.lowFriction };
  const tasteSelection = selectTaste(userIntelligence, state);
  const patternSelection = selectPatterns(userIntelligence, patternSignature(currentMoment, placeTypes));
  const contradictions = userIntelligence.contradictions.filter(({ concept }) => tasteSelection.selected.some((row) => row.concept === concept))
    .map(({ concept, scope, confidence }) => ({ concept, scope, confidence, reasonCode: "CONFLICTING_HISTORY" }));
  const recentRelevantEvidence = recentSummaries(tasteSelection.selected);
  const knowledgeSufficiency = sufficiency({ taste: tasteSelection.selected, patterns: patternSelection.selected, moment: currentMoment, placeTypes, contexts, contradictions });
  const suppressionAudit = [...tasteSelection.suppressed, ...patternSelection.suppressed].slice(0, N5_LIMITS.maxSuppressionAudit);
  const uncertainties = unique([
    userIntelligence.knowledgeState === "COLD" ? "COLD_USER" : null,
    knowledgeSufficiency.contextKnowledge !== "KNOWN" ? "LOW_CONTEXT_KNOWLEDGE" : null,
    placeTypes.length && knowledgeSufficiency.placeTypeKnowledge !== "KNOWN" ? "LOW_PLACE_TYPE_KNOWLEDGE" : null,
    contradictions.length ? "CONFLICTING_HISTORY" : null,
    knowledgeSufficiency.level === "LOW" ? "MINIMUM_NECESSARY_USER_KNOWLEDGE" : null
  ]);
  const body = {
    version: N5_VERSIONS.projection, decisionId: currentMoment.decisionId, userId: userIntelligence.userId,
    currentMomentHash: currentMoment.momentHash, userIntelligenceHash: userIntelligence.intelligenceHash,
    applicableContexts: contexts, applicablePlaceTypes: placeTypes,
    knowledgeSufficiency, relevantTaste: tasteSelection.selected,
    relevantPatterns: patternSelection.selected, recentRelevantEvidence, contradictions, uncertainties,
    suppressionSummary: { totalSuppressed: tasteSelection.suppressed.length + patternSelection.suppressed.length, audited: suppressionAudit },
    authority: { currentIntent: "AUTHORITATIVE", currentMoment: "N3_AUTHORITATIVE", history: "CONDITIONAL_ONLY" },
    boundaries: { candidateIndependent: true, ranking: "NOT_IMPLEMENTED", n6AiCall: "NOT_IMPLEMENTED", userIntelligenceMutation: "NONE", rawHistoryIncluded: false, productionIntegration: "NOT_STARTED" }
  };
  const projection = deepFreeze({ ...body, projectionHash: contentHash(body) });
  return deepFreeze({ projection, n6Projection: serializeRelevantUserProjectionForN6(projection), flightRecorder: { selectedTaste: projection.relevantTaste, selectedPatterns: projection.relevantPatterns, suppressed: suppressionAudit, uncertainties, knowledgeSufficiency, projectionHash: projection.projectionHash } });
}

export function serializeRelevantUserProjectionForN6(projection) {
  if (!projection || projection.version !== N5_VERSIONS.projection) throw new Error("n5_projection_version_mismatch");
  const compact = {
    version: N5_VERSIONS.serialization, sufficiency: projection.knowledgeSufficiency,
    relevantTaste: projection.relevantTaste.map(({ concept, affinity, confidence, relevance, sourceLayer, reasonCodes }) => ({ concept, affinity, confidence, relevance, sourceLayer, reasonCodes })),
    relevantPatterns: projection.relevantPatterns.map(({ contextSignature, confidence, relevance, reasonCodes }) => ({ contextSignature, confidence, relevance, reasonCodes })),
    recentRelevantEvidence: projection.recentRelevantEvidence,
    uncertainties: projection.uncertainties, contradictions: projection.contradictions,
    boundaries: { currentIntentAuthoritative: true, candidateIndependent: true, ranking: "NONE" }
  };
  const serializedBytes = Buffer.byteLength(JSON.stringify(compact));
  const estimatedTokens = Math.ceil(serializedBytes / 4);
  if (serializedBytes > N5_LIMITS.maxSerializedBytes || estimatedTokens > N5_LIMITS.maxEstimatedTokens) throw new Error("n5_projection_budget_exceeded");
  return deepFreeze({ ...compact, serializedBytes, estimatedTokens, serializationHash: contentHash(compact) });
}

export function validateN5ScientificBoundary(value) { return !forbiddenKey.test(JSON.stringify(value)); }
