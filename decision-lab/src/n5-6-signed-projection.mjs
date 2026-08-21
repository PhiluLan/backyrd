import { contentHash } from "./canonical-json.mjs";
import { N5_6_CONTRACT_HASH, N5_6_VERSIONS } from "./n5-6-canonical-user-intelligence.mjs";

export const N5_6_PROJECTION_CONTRACT = Object.freeze({
  version: N5_6_VERSIONS.projection,
  hierarchy: ["MATCHING_CONTEXT", "MATCHING_PLACE_TYPE", "GLOBAL"],
  maximum: { positiveTaste: 6, negativeTaste: 3, behavioral: 2, patterns: 2, suppressionAudit: 40 },
  minimumConfidence: 0.22,
  moreSpecificScopeReplacesGlobalConcept: true,
  explicitCurrentIntentAuthoritative: true,
  signedPolarityRequired: true,
  currentIntentDuplicationSuppressed: true,
  candidateIndependent: true,
  noRanking: true,
  noLlm: true
});
export const N5_6_PROJECTION_CONTRACT_HASH = contentHash(N5_6_PROJECTION_CONTRACT);

const deepFreeze = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); };
const unique = (values) => [...new Set(values.filter(Boolean))];
const field = (moment, key) => moment.fields?.[key]?.value;

const MOMENT_CONCEPTS = Object.freeze({
  cozy: ["vibe.cozy"], quiet: ["vibe.quiet", "energy.calm"], relaxed: ["vibe.relaxed", "energy.calm"], lively: ["vibe.lively", "energy.energetic"], social: ["vibe.social"], romantic: ["vibe.romantic", "social_style.romantic_friendly"], elegant: ["vibe.elegant", "character.design_led"], authentic: ["vibe.authentic", "character.authentic_character"], exploratory: ["discovery.novel", "discovery.hidden_gem"],
  budget: ["price.budget"], balanced: ["price.balanced_price"], premium: ["price.premium"],
  solo: ["social_style.solo_friendly"], date: ["social_style.romantic_friendly", "social_style.conversation_friendly"], friends: ["social_style.group_friendly", "vibe.social"], family: ["social_style.family_friendly"], family_with_kids: ["social_style.family_friendly"], work: ["occasion.work_friendly", "social_style.conversation_friendly"],
  drink: ["place_type.bar"], food: ["place_type.restaurant"], activity: ["place_type.activity"], culture: ["place_type.culture"], walk: ["environment.outdoor"],
  bar: ["place_type.bar"], restaurant: ["place_type.restaurant"], cafe: ["place_type.cafe"], activity_place: ["place_type.activity"]
});

function momentState(currentMoment, currentIntent = {}) {
  const social = field(currentMoment, "social_context");
  const vibe = Array.isArray(field(currentMoment, "vibe")) ? field(currentMoment, "vibe") : [];
  const activities = Array.isArray(field(currentMoment, "activity_intent")) ? field(currentMoment, "activity_intent") : [];
  const budget = field(currentMoment, "budget_orientation");
  const placeTypes = unique([...(currentIntent.requiredPlaceTypes ?? []), ...(currentIntent.preferredPlaceTypes ?? []), ...activities.map((item) => item === "drink" ? "bar" : item === "food" ? "restaurant" : item === "activity" ? "activity" : null)]);
  const contexts = unique([social ? `audience.${social === "family_with_kids" ? "family" : social}` : null, field(currentMoment, "daypart") ? `time.${field(currentMoment, "daypart")}` : null, field(currentMoment, "calendar") ? `time.${field(currentMoment, "calendar")}` : null]);
  const explicitConcepts = new Map();
  for (const key of [...vibe, budget, social, ...activities]) for (const concept of MOMENT_CONCEPTS[key] ?? []) explicitConcepts.set(concept, 1);
  for (const row of currentIntent.conceptDirections ?? []) explicitConcepts.set(row.concept, Math.sign(row.direction));
  return { social, vibe, activities, budget, placeTypes, contexts, explicitConcepts };
}

function relevance(node, state) {
  if (node.scope.kind === "CONTEXT" && state.contexts.includes(node.scope.key)) return 1;
  if (node.scope.kind === "PLACE_TYPE" && state.placeTypes.includes(node.scope.key)) return 0.88;
  if (node.scope.kind !== "GLOBAL") return 0;
  if (state.explicitConcepts.has(node.concept)) return 0.78;
  const family = node.concept.split(".")[0];
  if (["vibe", "energy", "price", "discovery", "character", "social_style"].includes(family)) return state.activities.includes("broad") ? 0.45 : 0.56;
  return 0.28;
}

function matchPattern(pattern, state) {
  const signature = pattern.contextSignature ?? {};
  const checks = [];
  if (signature.audience) checks.push(state.contexts.includes(`audience.${signature.audience}`));
  if (signature.daypart) checks.push(state.contexts.includes(`time.${signature.daypart}`));
  if (signature.calendar) checks.push(state.contexts.includes(`time.${signature.calendar}`));
  if (signature.placeType && state.placeTypes.length) checks.push(state.placeTypes.includes(signature.placeType));
  return checks.length >= 2 && checks.every(Boolean);
}

export function buildSignedRelevantUserProjection({ userCard, currentMoment, currentIntent = {} }) {
  if (!userCard || userCard.version !== "backyrd-n5-6-user-card-v1") throw new Error("n56_user_card_version_mismatch");
  if (userCard.userId !== currentMoment.userId) throw new Error("n56_cross_user_projection_forbidden");
  const state = momentState(currentMoment, currentIntent);
  const candidates = userCard.nodes.map((node) => ({ ...node, relevance: relevance(node, state) })).filter(({ relevance, confidence, polarity }) => relevance > 0 && confidence >= N5_6_PROJECTION_CONTRACT.minimumConfidence && polarity !== "UNKNOWN");
  const selectedByConcept = new Map(); const suppressed = [];
  const scopeRank = { CONTEXT: 3, PLACE_TYPE: 2, GLOBAL: 1 };
  for (const node of candidates.sort((a, b) => scopeRank[b.scope.kind] - scopeRank[a.scope.kind] || b.relevance * b.confidence * Math.abs(b.affinity) - a.relevance * a.confidence * Math.abs(a.affinity))) {
    const existing = selectedByConcept.get(node.concept);
    if (existing) { suppressed.push({ type: "TASTE", nodeKey: node.nodeKey, concept: node.concept, reasonCode: "LESS_SPECIFIC_DUPLICATE_SCOPE" }); continue; }
    const explicitDirection = state.explicitConcepts.get(node.concept);
    if (explicitDirection && Math.sign(node.affinity) !== explicitDirection) { suppressed.push({ type: "TASTE", nodeKey: node.nodeKey, concept: node.concept, reasonCode: "EXPLICIT_CURRENT_INTENT_OVERRIDE" }); continue; }
    if (explicitDirection && Math.sign(node.affinity) === explicitDirection) { suppressed.push({ type: "TASTE", nodeKey: node.nodeKey, concept: node.concept, reasonCode: "DUPLICATES_EXPLICIT_CURRENT_INTENT" }); continue; }
    selectedByConcept.set(node.concept, { nodeKey: node.nodeKey, concept: node.concept, sourceLayer: node.scope.kind, scope: node.scope, affinity: node.affinity, polarity: node.polarity, confidence: node.confidence, relevance: node.relevance, trend: node.trend, evidenceDepth: node.evidenceDepth, evidenceRefs: node.evidenceRefs, reasonCodes: [node.scope.kind === "CONTEXT" ? "MATCHING_CONTEXT_TASTE" : node.scope.kind === "PLACE_TYPE" ? "MATCHING_PLACE_TYPE_TASTE" : "RELEVANT_GLOBAL_TASTE"] });
  }
  const all = [...selectedByConcept.values()].sort((a, b) => b.relevance * b.confidence * Math.abs(b.affinity) - a.relevance * a.confidence * Math.abs(a.affinity) || a.concept.localeCompare(b.concept));
  const positives = all.filter(({ affinity }) => affinity > 0); const negatives = all.filter(({ affinity }) => affinity < 0);
  for (const row of positives.slice(N5_6_PROJECTION_CONTRACT.maximum.positiveTaste)) suppressed.push({ type: "TASTE", nodeKey: row.nodeKey, concept: row.concept, reasonCode: "POSITIVE_PROJECTION_BUDGET" });
  for (const row of negatives.slice(N5_6_PROJECTION_CONTRACT.maximum.negativeTaste)) suppressed.push({ type: "TASTE", nodeKey: row.nodeKey, concept: row.concept, reasonCode: "NEGATIVE_PROJECTION_BUDGET" });
  const projected = [...positives.slice(0, N5_6_PROJECTION_CONTRACT.maximum.positiveTaste), ...negatives.slice(0, N5_6_PROJECTION_CONTRACT.maximum.negativeTaste)];
  for (const node of userCard.nodes) if (!candidates.some(({ nodeKey }) => nodeKey === node.nodeKey) && !suppressed.some(({ nodeKey }) => nodeKey === node.nodeKey)) suppressed.push({ type: "TASTE", nodeKey: node.nodeKey, concept: node.concept, reasonCode: node.confidence < N5_6_PROJECTION_CONTRACT.minimumConfidence ? "LOW_CONFIDENCE" : "NOT_RELEVANT_TO_CURRENT_MOMENT" });
  const patterns = userCard.occasionPatterns.filter((pattern) => matchPattern(pattern, state)).slice(0, N5_6_PROJECTION_CONTRACT.maximum.patterns).map((pattern) => ({ ...pattern, relevance: 0.9, reasonCodes: ["MATCHING_RECURRING_OCCASION"] }));
  for (const pattern of userCard.occasionPatterns.filter((row) => !patterns.some(({ patternKey }) => row.patternKey === patternKey))) suppressed.push({ type: "PATTERN", key: pattern.patternKey, reasonCode: "WRONG_CONTEXT_PATTERN" });
  const weighted = projected.reduce((sum, row) => sum + row.confidence * row.relevance * Math.abs(row.affinity), 0) + patterns.reduce((sum, row) => sum + row.confidence * row.relevance * 0.6, 0);
  const score = Math.min(1, (1 - Math.exp(-weighted / 1.8)) * (0.7 + 0.3 * currentMoment.overallConfidence));
  const suppressionPriority = { EXPLICIT_CURRENT_INTENT_OVERRIDE: 0, DUPLICATES_EXPLICIT_CURRENT_INTENT: 1, WRONG_CONTEXT_PATTERN: 2, LESS_SPECIFIC_DUPLICATE_SCOPE: 3, NEGATIVE_PROJECTION_BUDGET: 4, POSITIVE_PROJECTION_BUDGET: 5, LOW_CONFIDENCE: 6, NOT_RELEVANT_TO_CURRENT_MOMENT: 7 };
  const auditedSuppression = [...suppressed].sort((a, b) => (suppressionPriority[a.reasonCode] ?? 99) - (suppressionPriority[b.reasonCode] ?? 99) || String(a.nodeKey ?? a.key).localeCompare(String(b.nodeKey ?? b.key))).slice(0, N5_6_PROJECTION_CONTRACT.maximum.suppressionAudit);
  const body = { version: N5_6_VERSIONS.projection, contractHash: N5_6_PROJECTION_CONTRACT_HASH, parentContractHash: N5_6_CONTRACT_HASH, decisionId: currentMoment.decisionId, userId: userCard.userId, currentMomentHash: currentMoment.momentHash, userCardHash: userCard.userCardHash, applicableContexts: state.contexts, applicablePlaceTypes: state.placeTypes, positiveTaste: projected.filter(({ affinity }) => affinity > 0), negativeTaste: projected.filter(({ affinity }) => affinity < 0), behavioralPreferences: userCard.behavioralPreferences.slice(0, N5_6_PROJECTION_CONTRACT.maximum.behavioral), occasionPatterns: patterns, knowledgeSufficiency: { score: Number(score.toFixed(6)), level: score >= 0.72 ? "HIGH" : score >= 0.42 ? "MEDIUM" : "LOW", projectedTasteCount: projected.length, positiveCount: projected.filter(({ affinity }) => affinity > 0).length, negativeCount: projected.filter(({ affinity }) => affinity < 0).length, patternCount: patterns.length }, suppressionAudit: auditedSuppression, suppressionSummary: { total: suppressed.length, currentIntentDuplicates: suppressed.filter(({ reasonCode }) => reasonCode === "DUPLICATES_EXPLICIT_CURRENT_INTENT").length, contextMismatches: suppressed.filter(({ reasonCode }) => ["NOT_RELEVANT_TO_CURRENT_MOMENT", "WRONG_CONTEXT_PATTERN"].includes(reasonCode)).length }, uncertainties: unique([projected.length === 0 ? "NO_RELEVANT_TASTE" : null, patterns.length === 0 ? "NO_MATCHING_OCCASION_PATTERN" : null, score < 0.42 ? "LOW_USER_KNOWLEDGE_FOR_THIS_MOMENT" : null]), authority: { currentIntent: "AUTHORITATIVE", currentMoment: "N3_AUTHORITATIVE", history: "CONDITIONAL_ONLY" }, boundaries: { ranking: "NONE", n6: "NOT_AUTHORIZED", rawHistoryIncluded: false, candidateIndependent: true, productionIntegration: "NOT_STARTED" } };
  return deepFreeze({ ...body, projectionHash: contentHash(body) });
}
