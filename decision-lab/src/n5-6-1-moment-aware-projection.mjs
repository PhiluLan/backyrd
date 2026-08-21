import { contentHash } from "./canonical-json.mjs";
import { TASTE_SPACE } from "./taste-engine.mjs";
import { N5_6_CONTRACT_HASH } from "./n5-6-canonical-user-intelligence.mjs";

export const N5_6_1_VERSIONS = Object.freeze({
  conceptCompatibility: "backyrd-n5-6-1-concept-compatibility-v1",
  projection: "backyrd-n5-6-1-moment-aware-projection-v1",
  sufficiency: "backyrd-n5-6-1-decision-sufficiency-v1",
  projectionAudit: "backyrd-n5-6-1-projection-audit-v1",
  validation: "backyrd-n5-6-1-validation-v1"
});

export const N5_6_1_PROJECTION_CONTRACT = Object.freeze({
  version: N5_6_1_VERSIONS.projection,
  principle: "MINIMUM_SUFFICIENT_USER_PROJECTION",
  hierarchy: ["EXACT_CONTEXT", "EXACT_PLACE_TYPE", "PORTABLE_GLOBAL", "UNKNOWN"],
  maximumTasteNodes: 8,
  maximumPerFamily: 2,
  minimumConfidence: 0.22,
  relevanceThreshold: { clearOrPartialMoment: 0.64, broadOrLowClarityMoment: 0.72 },
  broadMomentClarityBoundary: 0.36,
  capIsMaximumNotTarget: true,
  fixedPositiveNegativeQuota: false,
  candidateIndependent: true,
  currentIntentAuthoritative: true,
  noRanking: true,
  noLlm: true
});

export const N5_6_1_SUFFICIENCY_CONTRACT = Object.freeze({
  version: N5_6_1_VERSIONS.sufficiency,
  labels: ["UNKNOWN", "LOW", "PARTIAL", "HIGH"],
  thresholds: { high: 0.72, partial: 0.38 },
  developingMaximum: 0.68,
  earlyMaximum: 0.42,
  coldMaximum: 0.12,
  explicitSocialContextWithoutMatchingHistoryPenalty: 0.13,
  broadFallbackPenalty: 0.08,
  overallMaturityNeverSufficientAlone: true,
  projectionSizeNeverSufficientAlone: true,
  occasionPatternNotRequiredForHigh: true
});

const SOCIAL_COMPATIBILITY = Object.freeze({
  "social_style.solo_friendly": ["solo"],
  "social_style.group_friendly": ["friends", "group"],
  "social_style.family_friendly": ["family", "family_with_kids"],
  "social_style.romantic_friendly": ["date"],
  "occasion.work_friendly": ["work"]
});

const TIME_COMPATIBILITY = Object.freeze({
  "occasion.morning_friendly": ["morning"],
  "occasion.afternoon_friendly": ["afternoon"],
  "occasion.evening_friendly": ["evening", "night"]
});

const PORTABLE_FAMILIES = new Set(["discovery", "character", "price"]);
const CONDITIONALLY_PORTABLE = new Set([
  "vibe.authentic", "vibe.cozy", "vibe.relaxed", "vibe.quiet", "vibe.lively",
  "vibe.social", "vibe.romantic", "vibe.elegant", "energy.calm", "energy.balanced",
  "energy.energetic", "social_style.conversation_friendly", "environment.indoor", "environment.outdoor"
]);

export const N5_6_1_CONCEPT_METADATA = Object.freeze(Object.fromEntries(TASTE_SPACE.map(({ key, family }) => {
  const placeType = family === "place_type" ? key.split(".")[1] : null;
  const socialContexts = SOCIAL_COMPATIBILITY[key] ?? [];
  const dayparts = TIME_COMPATIBILITY[key] ?? [];
  const contextSensitive = socialContexts.length > 0 || dayparts.length > 0;
  return [key, Object.freeze({
    concept: key,
    family,
    portability: PORTABLE_FAMILIES.has(family) ? "BROADLY_PORTABLE" : CONDITIONALLY_PORTABLE.has(key) ? "CONDITIONALLY_PORTABLE" : "BOUND",
    contextSensitivity: contextSensitive ? "EXPLICIT" : family === "vibe" || family === "energy" ? "SEMANTIC" : "LOW",
    placeTypeSensitivity: placeType ? "EXACT" : "NONE",
    compatibleSocialContexts: socialContexts,
    compatibleDayparts: dayparts,
    compatiblePlaceTypes: placeType ? [placeType] : [],
    portableByDefault: PORTABLE_FAMILIES.has(family)
  })];
})));

export const N5_6_1_CONCEPT_METADATA_HASH = contentHash(N5_6_1_CONCEPT_METADATA);
export const N5_6_1_PROJECTION_CONTRACT_HASH = contentHash(N5_6_1_PROJECTION_CONTRACT);
export const N5_6_1_SUFFICIENCY_CONTRACT_HASH = contentHash(N5_6_1_SUFFICIENCY_CONTRACT);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};
const round = (value) => Number(value.toFixed(6));
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const unique = (values) => [...new Set(values.filter(Boolean))];
const field = (moment, key) => moment.fields?.[key]?.value;
const normalizedSocial = (value) => value === "family_with_kids" ? "family" : value;

const MOMENT_CONCEPTS = Object.freeze({
  cozy: ["vibe.cozy"], quiet: ["vibe.quiet", "energy.calm"], relaxed: ["vibe.relaxed", "energy.calm"],
  lively: ["vibe.lively", "energy.energetic"], social: ["vibe.social"], romantic: ["vibe.romantic", "social_style.romantic_friendly"],
  elegant: ["vibe.elegant", "character.design_led"], authentic: ["vibe.authentic", "character.authentic_character"],
  exploratory: ["discovery.hidden_gem", "discovery.novel"], budget: ["price.budget"], balanced: ["price.balanced_price"], premium: ["price.premium"],
  solo: ["social_style.solo_friendly"], date: ["social_style.romantic_friendly", "social_style.conversation_friendly"],
  friends: ["social_style.group_friendly", "vibe.social"], family: ["social_style.family_friendly"], family_with_kids: ["social_style.family_friendly"],
  work: ["occasion.work_friendly", "social_style.conversation_friendly"], walk: ["environment.outdoor"], culture: ["place_type.culture"],
  drink: ["place_type.bar"], food: ["place_type.restaurant"], activity: ["place_type.activity"]
});

function deriveMomentState(currentMoment, currentIntent = {}) {
  const socialRaw = field(currentMoment, "social_context");
  const social = normalizedSocial(socialRaw);
  const vibes = Array.isArray(field(currentMoment, "vibe")) ? field(currentMoment, "vibe") : [];
  const activities = Array.isArray(field(currentMoment, "activity_intent")) ? field(currentMoment, "activity_intent") : [];
  const explicitConcepts = new Map();
  for (const key of [...vibes, socialRaw, ...activities, field(currentMoment, "budget_orientation")]) {
    for (const concept of MOMENT_CONCEPTS[key] ?? []) explicitConcepts.set(concept, 1);
  }
  for (const row of currentIntent.conceptDirections ?? []) explicitConcepts.set(row.concept, Math.sign(row.direction));
  const activityPlaceTypes = activities.flatMap((item) => item === "drink" ? ["bar"] : item === "food" ? ["restaurant"] : item === "activity" ? ["activity"] : item === "culture" ? ["culture"] : []);
  const placeTypes = unique([...(currentIntent.requiredPlaceTypes ?? []), ...(currentIntent.preferredPlaceTypes ?? []), ...activityPlaceTypes]);
  const contexts = unique([
    social ? `audience.${social}` : null,
    field(currentMoment, "daypart") ? `time.${field(currentMoment, "daypart")}` : null,
    field(currentMoment, "calendar") ? `time.${field(currentMoment, "calendar")}` : null
  ]);
  const confidence = (key) => currentMoment.fields?.[key]?.confidence ?? 0;
  const known = (key) => field(currentMoment, key) !== undefined && field(currentMoment, key) !== null;
  const activityClarity = activities.length === 0 ? 0 : activities.includes("broad") ? 0.05 : 0.22 * confidence("activity_intent");
  const vibeClarity = vibes.length === 0 ? 0 : 0.16 * confidence("vibe");
  const clarity = clamp(
    (social ? 0.22 * confidence("social_context") : 0) + activityClarity + vibeClarity +
    (known("occasion") ? 0.12 * confidence("occasion") : 0) + (known("budget_orientation") ? 0.08 * confidence("budget_orientation") : 0) +
    (known("planning_tolerance") ? 0.05 * confidence("planning_tolerance") : 0) + (known("distance_willingness") ? 0.05 * confidence("distance_willingness") : 0) +
    (known("duration") ? 0.04 * confidence("duration") : 0) + (known("spontaneity") ? 0.03 * confidence("spontaneity") : 0) +
    (known("environment") ? 0.03 * confidence("environment") : 0)
  );
  return {
    social, socialRaw, vibes, activities, placeTypes, contexts, explicitConcepts,
    occasion: field(currentMoment, "occasion"), daypart: field(currentMoment, "daypart"), calendar: field(currentMoment, "calendar"),
    broad: activities.includes("broad") || clarity < N5_6_1_PROJECTION_CONTRACT.broadMomentClarityBoundary,
    clarity: round(clarity), momentConfidence: currentMoment.overallConfidence
  };
}

function scopeCompatibility(node, state) {
  if (node.scope.kind === "CONTEXT") {
    if (state.contexts.includes(node.scope.key)) return "DIRECT_MATCH";
    const [family] = node.scope.key.split(".");
    if ((family === "audience" && state.social) || (family === "time" && state.contexts.some((key) => key.startsWith("time.")))) return "CONFLICT";
    return "UNKNOWN";
  }
  if (node.scope.kind === "PLACE_TYPE") {
    if (state.placeTypes.includes(node.scope.key)) return "DIRECT_MATCH";
    return state.placeTypes.length ? "CONFLICT" : "UNKNOWN";
  }
  return "NEUTRAL";
}

export function assessMomentCompatibility(node, currentMoment, currentIntent = {}) {
  const state = deriveMomentState(currentMoment, currentIntent);
  const metadata = N5_6_1_CONCEPT_METADATA[node.concept];
  if (!metadata) return Object.freeze({ compatibility: "UNKNOWN", reasonCode: "MISSING_CONCEPT_METADATA" });
  const explicitDirection = state.explicitConcepts.get(node.concept);
  if (explicitDirection && Math.sign(node.affinity) !== explicitDirection) return Object.freeze({ compatibility: "CONFLICT", reasonCode: "CURRENT_INTENT_CONFLICT" });
  const scoped = scopeCompatibility(node, state);
  if (scoped === "CONFLICT") return Object.freeze({ compatibility: "CONFLICT", reasonCode: node.scope.kind === "PLACE_TYPE" ? "PLACE_TYPE_MISMATCH" : "CONTEXT_MISMATCH" });
  if (metadata.compatibleSocialContexts.length && !state.social) return Object.freeze({ compatibility: "UNKNOWN", reasonCode: "CONTEXT_UNKNOWN_FOR_CONTEXT_SENSITIVE_CONCEPT" });
  if (metadata.compatibleSocialContexts.length && state.social && !metadata.compatibleSocialContexts.includes(state.social)) return Object.freeze({ compatibility: "CONFLICT", reasonCode: "CONTEXT_MISMATCH" });
  if (metadata.compatibleDayparts.length && state.daypart && !metadata.compatibleDayparts.includes(state.daypart)) return Object.freeze({ compatibility: "CONFLICT", reasonCode: "CONTEXT_MISMATCH" });
  if (metadata.compatiblePlaceTypes.length && state.placeTypes.length && !metadata.compatiblePlaceTypes.some((key) => state.placeTypes.includes(key))) return Object.freeze({ compatibility: "CONFLICT", reasonCode: "PLACE_TYPE_MISMATCH" });
  if (explicitDirection) return Object.freeze({ compatibility: "DIRECT_MATCH", reasonCode: "CURRENT_INTENT_MATCH" });
  if (scoped === "DIRECT_MATCH" && state.broad && node.scope.kind === "CONTEXT" && node.scope.key.startsWith("time.")) return Object.freeze({ compatibility: "WEAKLY_RELEVANT", reasonCode: "TIME_ONLY_SUPPORT_IN_BROAD_MOMENT" });
  if (scoped === "DIRECT_MATCH") return Object.freeze({ compatibility: "DIRECT_MATCH", reasonCode: node.scope.kind === "CONTEXT" ? "MATCHING_CONTEXT" : "MATCHING_PLACE_TYPE" });
  if (node.scope.kind !== "GLOBAL") return Object.freeze({ compatibility: "UNKNOWN", reasonCode: "SCOPE_NOT_APPLICABLE" });
  if (metadata.portableByDefault) return Object.freeze({ compatibility: "COMPATIBLE", reasonCode: "PORTABLE_GLOBAL" });
  if (metadata.portability === "CONDITIONALLY_PORTABLE" && semanticRelevance(node, state) >= 0.6) return Object.freeze({ compatibility: "WEAKLY_RELEVANT", reasonCode: "SEMANTICALLY_COMPATIBLE_GLOBAL" });
  return Object.freeze({ compatibility: "UNKNOWN", reasonCode: "GLOBAL_FALLBACK_NOT_JUSTIFIED" });
}

function semanticRelevance(node, state) {
  if (state.explicitConcepts.has(node.concept)) return 1;
  const metadata = N5_6_1_CONCEPT_METADATA[node.concept];
  if (metadata.compatibleSocialContexts.includes(state.social)) return 0.92;
  if (metadata.compatibleDayparts.includes(state.daypart)) return 0.86;
  if (metadata.compatiblePlaceTypes.some((key) => state.placeTypes.includes(key))) return 0.92;
  if (node.scope.kind === "CONTEXT" && state.contexts.includes(node.scope.key)) return 0.88;
  if (node.scope.kind === "PLACE_TYPE" && state.placeTypes.includes(node.scope.key)) return 0.86;
  if (metadata.family === "discovery") return state.vibes.includes("exploratory") ? 0.9 : state.broad ? 0.62 : 0.74;
  if (metadata.family === "character") return state.broad ? 0.56 : 0.7;
  if (metadata.family === "price") return fieldValueKnown(state, "budget") ? 0.8 : state.broad ? 0.48 : 0.62;
  if (metadata.family === "vibe" || metadata.family === "energy") return state.vibes.length ? 0.58 : 0.44;
  if (node.concept === "social_style.conversation_friendly" && ["solo", "friends", "date", "work"].includes(state.social)) return 0.68;
  if (metadata.family === "environment" && state.activities.includes("walk")) return 0.82;
  return 0.36;
}

function fieldValueKnown(state, key) {
  if (key === "budget") return state.explicitConcepts.has("price.budget") || state.explicitConcepts.has("price.balanced_price") || state.explicitConcepts.has("price.premium");
  return false;
}

function evidenceQuality(node) {
  const depth = node.evidenceDepth;
  const independent = Math.min(1, Math.log1p((depth.independentSessions ?? 0) + (depth.independentSpots ?? 0)) / Math.log(13));
  const outcomes = Math.min(1, Math.log1p(depth.outcomes ?? 0) / Math.log(7));
  return round(0.65 * independent + 0.35 * outcomes);
}

function nodeRelevance(node, state, compatibility) {
  const compatibilityValue = { DIRECT_MATCH: 0.36, COMPATIBLE: 0.27, WEAKLY_RELEVANT: 0.18, NEUTRAL: 0.12, UNKNOWN: 0, CONFLICT: 0 }[compatibility] ?? 0;
  const scopeValue = node.scope.kind === "CONTEXT" ? (node.scope.key.startsWith("audience.") ? 0.2 : 0.1) : { PLACE_TYPE: 0.17, GLOBAL: 0.1 }[node.scope.kind] ?? 0;
  const semantic = semanticRelevance(node, state);
  const fallbackPenalty = node.scope.kind === "GLOBAL" ? 0.05 : 0;
  const broadPenalty = state.broad && !state.explicitConcepts.has(node.concept) ? 0.15 : 0;
  const contradictionPenalty = node.contradictions?.length ? 0.06 : 0;
  return round(clamp(compatibilityValue + 0.3 * semantic + scopeValue + 0.08 * node.confidence + 0.06 * evidenceQuality(node) - fallbackPenalty - broadPenalty - contradictionPenalty));
}

function matchPattern(pattern, state) {
  const signature = pattern.contextSignature ?? {};
  const checks = [];
  if (signature.audience) checks.push(state.contexts.includes(`audience.${signature.audience}`));
  if (signature.daypart) checks.push(state.contexts.includes(`time.${signature.daypart}`));
  if (signature.calendar) checks.push(state.contexts.includes(`time.${signature.calendar}`));
  if (signature.placeType) checks.push(state.placeTypes.includes(signature.placeType));
  if (signature.occasion) checks.push(state.occasion === signature.occasion);
  return checks.length >= 2 && checks.every(Boolean);
}

const maturityScore = (state) => ({ COLD: 0.05, EARLY: 0.24, DEVELOPING: 0.52, KNOWN: 0.7, WELL_KNOWN: 0.86, DEEP: 1 }[state] ?? 0);

function knowledgeForScope(rows, kind, key = null) {
  const scoped = rows.filter((row) => row.scope.kind === kind && (!key || row.scope.key === key));
  if (!scoped.length) return 0;
  return round(Math.max(...scoped.map((row) => row.confidence * evidenceQuality(row))));
}

function buildSufficiency({ userCard, state, selected, applicable, patterns }) {
  const contextKnowledge = state.social ? knowledgeForScope(applicable, "CONTEXT", `audience.${state.social}`) : 0;
  const temporalKnowledge = Math.max(knowledgeForScope(applicable, "CONTEXT", `time.${state.daypart}`), knowledgeForScope(applicable, "CONTEXT", `time.${state.calendar}`));
  const placeKnowledge = state.placeTypes.length ? Math.max(...state.placeTypes.map((key) => knowledgeForScope(applicable, "PLACE_TYPE", key))) : 0;
  const globalRows = selected.filter((row) => row.scope.kind === "GLOBAL");
  const globalFallbackStrength = globalRows.length ? round(globalRows.reduce((sum, row) => sum + row.confidence * row.relevance, 0) / globalRows.length) : 0;
  const occasionSupport = patterns.length ? Math.max(...patterns.map(({ confidence }) => confidence)) : 0;
  const evidenceDepth = selected.length ? round(selected.reduce((sum, row) => sum + evidenceQuality(row), 0) / selected.length) : 0;
  const projectionConfidence = selected.length ? round(selected.reduce((sum, row) => sum + row.confidence * row.relevance, 0) / selected.length) : 0;
  const relevantBreadth = Math.min(1, selected.length / 4);
  const contradictionPenalty = selected.length ? round(selected.filter((row) => row.contradictions?.length).length / selected.length * 0.08) : 0;
  const fallbackDepth = selected.length ? round(selected.reduce((sum, row) => sum + row.fallbackLevel, 0) / selected.length) : 3;
  const fallbackPenalty = selected.length ? round((fallbackDepth / 2) * N5_6_1_SUFFICIENCY_CONTRACT.broadFallbackPenalty) : 0.12;
  const hasExplicitSocial = Boolean(state.social);
  const missingContextPenalty = hasExplicitSocial && contextKnowledge === 0 ? N5_6_1_SUFFICIENCY_CONTRACT.explicitSocialContextWithoutMatchingHistoryPenalty : 0;
  const exactSupport = Math.max(contextKnowledge, occasionSupport * 0.88);
  const placeSupport = placeKnowledge * (hasExplicitSocial && contextKnowledge === 0 ? 0.48 : 0.72);
  const portableSupport = Math.min(0.34, globalFallbackStrength * 0.38);
  const applicableKnowledge = Math.max(exactSupport, placeSupport, portableSupport);
  let score = (0.55 + 0.45 * state.clarity) * (0.5 * applicableKnowledge + 0.22 * projectionConfidence + 0.18 * evidenceDepth + 0.1 * relevantBreadth) - contradictionPenalty - fallbackPenalty - missingContextPenalty;
  const maturity = userCard.maturity.state;
  score *= 0.65 + 0.35 * maturityScore(maturity);
  if (maturity === "COLD") score = Math.min(score, N5_6_1_SUFFICIENCY_CONTRACT.coldMaximum);
  if (maturity === "EARLY") score = Math.min(score, N5_6_1_SUFFICIENCY_CONTRACT.earlyMaximum);
  if (maturity === "DEVELOPING") score = Math.min(score, N5_6_1_SUFFICIENCY_CONTRACT.developingMaximum);
  score = round(clamp(score));
  const level = selected.length === 0 ? (maturity === "COLD" ? "UNKNOWN" : "LOW") : score >= N5_6_1_SUFFICIENCY_CONTRACT.thresholds.high ? "HIGH" : score >= N5_6_1_SUFFICIENCY_CONTRACT.thresholds.partial ? "PARTIAL" : "LOW";
  const reasonCodes = unique([
    level === "HIGH" && contextKnowledge > 0 ? "HIGH_CONTEXT_SUPPORT" : null,
    level === "HIGH" && occasionSupport > 0 ? "MATCHING_OCCASION_SUPPORT" : null,
    level === "PARTIAL" && globalRows.length ? "PARTIAL_GLOBAL_FALLBACK" : null,
    level === "PARTIAL" && contextKnowledge > 0 ? "PARTIAL_CONTEXT_SUPPORT" : null,
    level === "PARTIAL" && contextKnowledge === 0 && placeKnowledge > 0 ? "PARTIAL_PLACE_TYPE_BACKOFF" : null,
    contextKnowledge === 0 && state.social ? "LOW_CONTEXT_HISTORY" : null,
    placeKnowledge === 0 && state.placeTypes.length ? "PLACE_TYPE_UNKNOWN" : null,
    state.broad ? "LOW_MOMENT_CLARITY" : null,
    selected.length === 0 ? "NO_APPLICABLE_USER_EVIDENCE" : null,
    maturity === "COLD" ? "COLD_USER_NO_DURABLE_KNOWLEDGE" : null
  ]);
  return {
    version: N5_6_1_VERSIONS.sufficiency,
    overallUserKnowledge: round(maturityScore(maturity)), overallUserMaturity: maturity,
    momentClarity: state.clarity, contextKnowledge, temporalKnowledge, placeTypeKnowledge: placeKnowledge,
    globalFallbackStrength, occasionSupport: round(occasionSupport), relevantEvidenceDepth: evidenceDepth,
    contradictionPenalty, fallbackPenalty, fallbackDepth, projectionConfidence, relevantSignedPreferenceBreadth: selected.length,
    finalPersonalizationSufficiency: { score, level, reasonCodes }
  };
}

export function buildMomentAwareRelevantUserProjection({ userCard, currentMoment, currentIntent = {} }) {
  if (!userCard || userCard.version !== "backyrd-n5-6-user-card-v1") throw new Error("n561_user_card_version_mismatch");
  if (!currentMoment || userCard.userId !== currentMoment.userId) throw new Error("n561_cross_user_projection_forbidden");
  const state = deriveMomentState(currentMoment, currentIntent);
  const threshold = state.broad ? N5_6_1_PROJECTION_CONTRACT.relevanceThreshold.broadOrLowClarityMoment : N5_6_1_PROJECTION_CONTRACT.relevanceThreshold.clearOrPartialMoment;
  const considered = [];
  for (const node of userCard.nodes) {
    const assessment = assessMomentCompatibility(node, currentMoment, currentIntent);
    const relevance = nodeRelevance(node, state, assessment.compatibility);
    const explicitDirection = state.explicitConcepts.get(node.concept);
    let disposition = "ELIGIBLE";
    let reasonCode = assessment.reasonCode;
    if (assessment.compatibility === "CONFLICT") disposition = "SUPPRESSED";
    else if (node.polarity === "UNKNOWN") { disposition = "SUPPRESSED"; reasonCode = "INSUFFICIENT_SUPPORT"; }
    else if (node.confidence < N5_6_1_PROJECTION_CONTRACT.minimumConfidence) { disposition = "SUPPRESSED"; reasonCode = "LOW_CONFIDENCE"; }
    else if (relevance < threshold) { disposition = "SUPPRESSED"; reasonCode = assessment.reasonCode === "GLOBAL_FALLBACK_NOT_JUSTIFIED" ? assessment.reasonCode : "LOW_RELEVANCE"; }
    const corroborative = Boolean(explicitDirection && Math.sign(node.affinity) === explicitDirection);
    if (corroborative && disposition === "ELIGIBLE" && !(node.confidence >= 0.75 && node.evidenceDepth.independentSessions >= 3)) { disposition = "SUPPRESSED"; reasonCode = "REDUNDANT_WITH_CURRENT_INTENT"; }
    considered.push({
      ...node, compatibility: assessment.compatibility, compatibilityReasonCode: assessment.reasonCode,
      relevance, fallbackLevel: node.scope.kind === "CONTEXT" ? 0 : node.scope.kind === "PLACE_TYPE" ? 1 : 2,
      signalType: corroborative ? "CORROBORATIVE" : "INDEPENDENT_PERSONALIZATION_SIGNAL", disposition, reasonCode
    });
  }
  const eligible = considered.filter(({ disposition }) => disposition === "ELIGIBLE")
    .sort((a, b) => {
      const priority = (row) => row.scope.kind === "CONTEXT" && row.scope.key === `audience.${state.social}` ? 4
        : row.scope.kind === "PLACE_TYPE" && state.placeTypes.includes(row.scope.key) ? 3
          : row.scope.kind === "CONTEXT" && state.contexts.includes(row.scope.key) && !state.broad ? 2
            : row.scope.kind === "GLOBAL" ? 1 : 0;
      return priority(b) - priority(a) || b.relevance * b.confidence * Math.abs(b.affinity) - a.relevance * a.confidence * Math.abs(a.affinity) || a.nodeKey.localeCompare(b.nodeKey);
    });
  const selected = [];
  const selectedConcepts = new Set();
  const familySelections = new Map();
  for (const row of eligible) {
    if (selectedConcepts.has(row.concept)) { row.disposition = "SUPPRESSED"; row.reasonCode = "REDUNDANT_WITH_STRONGER_NODE"; continue; }
    const family = row.concept.split(".")[0];
    const familyRows = familySelections.get(family) ?? [];
    const samePolarityAlreadySelected = familyRows.some(({ polarity }) => polarity === row.polarity);
    if (familyRows.length >= N5_6_1_PROJECTION_CONTRACT.maximumPerFamily || samePolarityAlreadySelected) { row.disposition = "SUPPRESSED"; row.reasonCode = "REDUNDANT_WITH_STRONGER_NODE"; continue; }
    if (selected.length >= N5_6_1_PROJECTION_CONTRACT.maximumTasteNodes) { row.disposition = "SUPPRESSED"; row.reasonCode = "OUTSIDE_PROJECTION_CAP"; continue; }
    row.disposition = "SELECTED";
    selected.push(row); selectedConcepts.add(row.concept); familySelections.set(family, [...familyRows, row]);
  }
  const projected = selected.map((row) => ({
    nodeKey: row.nodeKey, concept: row.concept, scope: row.scope, sourceLayer: row.scope.kind,
    affinity: row.affinity, polarity: row.polarity, confidence: row.confidence, relevance: row.relevance,
    compatibility: row.compatibility, fallbackLevel: row.fallbackLevel, signalType: row.signalType,
    trend: row.trend, evidenceDepth: row.evidenceDepth, evidenceRefs: row.evidenceRefs,
    contradictions: row.contradictions,
    reasonCodes: unique([
      row.scope.kind === "CONTEXT" ? "MATCHING_CONTEXT_TASTE" : row.scope.kind === "PLACE_TYPE" ? "MATCHING_PLACE_TYPE_TASTE" : "PORTABLE_GLOBAL_TASTE",
      row.signalType === "CORROBORATIVE" ? "CURRENT_INTENT_CORROBORATION" : "INDEPENDENT_USER_SIGNAL",
      row.affinity < 0 ? "RELEVANT_NEGATIVE_AVOIDANCE" : null
    ])
  }));
  const patterns = userCard.occasionPatterns.filter((pattern) => matchPattern(pattern, state)).map((pattern) => ({ ...pattern, relevance: 0.92, reasonCodes: ["MATCHING_OCCASION_SUPPORT"] }));
  const patternAudits = userCard.occasionPatterns.map((pattern) => ({ type: "PATTERN", key: pattern.patternKey, disposition: patterns.some(({ patternKey }) => patternKey === pattern.patternKey) ? "SELECTED" : "SUPPRESSED", reasonCode: patterns.some(({ patternKey }) => patternKey === pattern.patternKey) ? "MATCHING_OCCASION_SUPPORT" : "CONTEXT_MISMATCH" }));
  const sufficiency = buildSufficiency({ userCard, state, selected: projected, applicable: eligible, patterns });
  const suppressed = considered.filter(({ disposition }) => disposition === "SUPPRESSED").map(({ nodeKey, concept, scope, confidence, relevance, compatibility, fallbackLevel, reasonCode }) => ({ type: "TASTE", nodeKey, concept, scope, confidence, relevance, compatibility, fallbackLevel, disposition: "SUPPRESSED", reasonCode }));
  const suppressionByReason = Object.fromEntries([...new Set([...suppressed, ...patternAudits.filter(({ disposition }) => disposition === "SUPPRESSED")].map(({ reasonCode }) => reasonCode))].sort().map((reason) => [reason, [...suppressed, ...patternAudits].filter(({ disposition, reasonCode }) => disposition === "SUPPRESSED" && reasonCode === reason).length]));
  const uncertainties = unique([
    ...sufficiency.finalPersonalizationSufficiency.reasonCodes,
    state.broad ? "USER_KNOWN_MOMENT_RELEVANCE_UNCLEAR" : null,
    sufficiency.contextKnowledge === 0 && state.social ? "NO_MATCHING_CONTEXT_TASTE" : null,
    projected.length === 0 ? "NO_RELEVANT_USER_TASTE" : null
  ]);
  const audit = {
    version: N5_6_1_VERSIONS.projectionAudit,
    fullUserCardNodeCount: userCard.nodes.length,
    consideredCount: considered.length,
    eligibleCount: eligible.length,
    selectedCount: projected.length,
    suppressedCount: suppressed.length,
    suppressionByReason,
    nodes: considered.map(({ nodeKey, concept, scope, affinity, polarity, confidence, relevance, compatibility, fallbackLevel, signalType, disposition, reasonCode }) => ({ nodeKey, concept, scope, affinity, polarity, confidence, relevance, compatibility, fallbackLevel, signalType, disposition, reasonCode })),
    patterns: patternAudits
  };
  const body = {
    version: N5_6_1_VERSIONS.projection,
    contractHash: N5_6_1_PROJECTION_CONTRACT_HASH,
    sufficiencyContractHash: N5_6_1_SUFFICIENCY_CONTRACT_HASH,
    conceptMetadataHash: N5_6_1_CONCEPT_METADATA_HASH,
    parentContractHash: N5_6_CONTRACT_HASH,
    decisionId: currentMoment.decisionId, userId: userCard.userId,
    currentMomentHash: currentMoment.momentHash, userCardHash: userCard.userCardHash,
    moment: { clarity: state.clarity, broad: state.broad, socialContext: state.social, applicableContexts: state.contexts, applicablePlaceTypes: state.placeTypes },
    taste: projected, positiveTaste: projected.filter(({ affinity }) => affinity > 0), negativeTaste: projected.filter(({ affinity }) => affinity < 0),
    occasionPatterns: patterns, knowledgeSufficiency: sufficiency,
    uncertainties, projectionAudit: audit,
    authority: { currentIntent: "AUTHORITATIVE", currentMoment: "N3_AUTHORITATIVE", history: "CONDITIONAL_ONLY" },
    boundaries: { ranking: "NONE", n6: "NOT_AUTHORIZED", rawHistoryIncluded: false, candidateIndependent: true, productionIntegration: "NOT_STARTED", externalDecisionAiCalls: 0 }
  };
  return deepFreeze({ ...body, projectionHash: contentHash(body) });
}

export function validateConceptMetadataCompleteness() {
  const expected = new Set(TASTE_SPACE.map(({ key }) => key));
  const actual = new Set(Object.keys(N5_6_1_CONCEPT_METADATA));
  return expected.size === actual.size && [...expected].every((key) => actual.has(key));
}
