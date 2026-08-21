import { contentHash } from "./canonical-json.mjs";
import { TASTE_SPACE } from "./taste-engine.mjs";
import { buildCanonicalUserCard, buildEvidenceChains } from "./n5-6-canonical-user-intelligence.mjs";
import { N5_6_4_ENGINE_OPTIONS } from "./n5-6-4-experience-satisfaction.mjs";

export const N5_7_OUTCOME_OBSERVATION_CONTRACT = Object.freeze({
  version: "backyrd-n5-7-outcome-observation-v1",
  satisfactionEvents: ["positive_post_visit", "negative_post_visit", "explicit_positive", "explicit_negative"],
  visitWithoutOutcome: "EXPERIENCE_ONLY",
  weakIntentRole: "EXCLUDED_FROM_COMPARATIVE_SATISFACTION",
  fields: ["user", "spot", "timestamp", "session", "journey", "outcomeSign", "outcomeStrength", "context", "placeType", "city", "spotConcepts", "provenance", "independence"]
});
export const N5_7_PREFERENCE_INFERENCE_CONTRACT = Object.freeze({
  version: "backyrd-n5-7-comparative-preference-inference-v1",
  principle: "CONCEPT_PRESENCE_MUST_DISCRIMINATE_OUTCOMES_RELATIVE_TO_CONCEPT_ABSENCE",
  knowledgeStates: ["UNKNOWN", "HYPOTHESIS_POSITIVE", "HYPOTHESIS_NEGATIVE", "POSITIVE", "NEGATIVE", "MIXED", "CONTEXT_DEPENDENT"],
  scopes: ["GLOBAL", "PLACE_TYPE", "CONTEXT"],
  smoothing: { betaPriorPositive: .5, betaPriorNegative: .5 },
  hypothesisRequirements: { presentIndependentSessions: 1, absoluteDiscrimination: .15 },
  durableRequirements: { presentIndependentSessions: 2, presentDistinctSpots: 2, absentIndependentSessions: 2, outcomeVariation: true, absoluteDiscrimination: .22, minimumIdentifiability: .55 },
  globalRequirements: { minimumContextOrPlaceTypeDiversity: 2 },
  correlation: { perfectOrNearPerfectJaccard: .95, highJaccard: .8, perfectIdentifiabilityCap: .35, highIdentifiabilityCap: .65 },
  baseRateAware: true,
  noAtomicConceptClaim: true,
  noLlm: true,
  unchanged: ["N2_MEMORY", "VISIT_NOT_SATISFACTION", "ED001", "N4", "RECENCY_DRIFT", "N5_6_1_PROJECTION", "WORLD", "GROUND_TRUTH"]
});
export const N5_7_CONTRACT_HASH = contentHash({ observations: N5_7_OUTCOME_OBSERVATION_CONTRACT, inference: N5_7_PREFERENCE_INFERENCE_CONTRACT });
const concepts = TASTE_SPACE.map(({ key }) => key);
const round = (x) => Number(x.toFixed(6));
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const unique = (xs) => [...new Set(xs.filter(Boolean))].sort();
const signFor = (type) => ["positive_post_visit", "explicit_positive"].includes(type) ? 1 : ["negative_post_visit", "explicit_negative"].includes(type) ? -1 : 0;
const strengthFor = (type) => ["positive_post_visit", "explicit_positive"].includes(type) ? .48 : ["negative_post_visit", "explicit_negative"].includes(type) ? .38 : 0;
const scopesFor = (o) => [{ kind: "GLOBAL", key: "global" }, { kind: "PLACE_TYPE", key: o.placeType }, ...(o.context.audience && o.context.audience !== "other" ? [{ kind: "CONTEXT", key: `audience.${o.context.audience}` }] : []), ...(o.context.daypart ? [{ kind: "CONTEXT", key: `time.${o.context.daypart}` }] : []), ...(o.context.calendar ? [{ kind: "CONTEXT", key: `time.${o.context.calendar}` }] : [])];
const scopeKey = (s) => `${s.kind}:${s.key}`;

export function buildN5_7OutcomeObservations(inputs, { asOf, spotIntelligence = {} } = {}) {
  const chains = buildEvidenceChains(inputs, { asOf, spotIntelligence, ...N5_6_4_ENGINE_OPTIONS });
  const events = new Map(inputs.map((event) => [event.id, event]));
  const selectedIds = new Set(chains.flatMap(({ samples }) => samples.filter(({ eventId }) => signFor(events.get(eventId)?.eventType)).map(({ eventId }) => eventId)));
  return [...selectedIds].map((id) => {
    const event = events.get(id); const n4 = spotIntelligence[event.spotId]?.concepts ?? {};
    const spotConcepts = event.spotEvidence.concepts.filter((concept) => n4[concept]?.confidence >= .35).map((concept) => ({ concept, confidence: n4[concept].confidence })).sort((a, b) => a.concept.localeCompare(b.concept));
    const body = { version: N5_7_OUTCOME_OBSERVATION_CONTRACT.version, observationId: id, userId: event.userId, spotId: event.spotId, occurredAt: event.occurredAt, sessionId: event.sessionId, decisionId: event.decisionId, journeyKey: [event.userId, event.sessionId, event.decisionId, event.spotId].join("|"), outcomeSign: signFor(event.eventType), outcomeStrength: strengthFor(event.eventType), context: event.momentSignature, placeType: event.spotEvidence.placeType, city: event.momentSignature.city ?? null, spotConcepts, provenance: event.provenance, independence: { sessionId: event.sessionId, spotId: event.spotId } };
    return { ...body, observationHash: contentHash(body) };
  }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.observationId.localeCompare(b.observationId));
}

function propensity(rows, concept, present) {
  let positive = 0, negative = 0;
  for (const row of rows) {
    const found = row.spotConcepts.find((x) => x.concept === concept);
    if (Boolean(found) !== present) continue;
    const weight = row.outcomeStrength * (found?.confidence ?? 1);
    if (row.outcomeSign > 0) positive += weight; else negative += weight;
  }
  return { positive, negative, signedRate: (positive - negative) / (positive + negative + 1) };
}
function jaccard(rows, left, right) {
  let intersection = 0, union = 0;
  for (const row of rows) { const a = row.spotConcepts.some((x) => x.concept === left), b = row.spotConcepts.some((x) => x.concept === right); if (a || b) union += 1; if (a && b) intersection += 1; }
  return union ? intersection / union : 0;
}
function inferenceFor(rows, concept, scope, asOf) {
  const present = rows.filter((row) => row.spotConcepts.some((x) => x.concept === concept));
  if (!present.length) return null;
  const absent = rows.filter((row) => !row.spotConcepts.some((x) => x.concept === concept));
  const p = propensity(rows, concept, true), a = propensity(rows, concept, false);
  const discrimination = clamp(p.signedRate - a.signedRate);
  const presentSessions = new Set(present.map((x) => x.sessionId)).size, presentSpots = new Set(present.map((x) => x.spotId)).size, absentSessions = new Set(absent.map((x) => x.sessionId)).size;
  const signs = new Set(rows.map((x) => x.outcomeSign));
  const maxCorrelation = Math.max(0, ...concepts.filter((x) => x !== concept).map((other) => jaccard(rows, concept, other)));
  const identifiability = maxCorrelation >= .95 ? .35 : maxCorrelation >= .8 ? .65 : 1;
  const scopeDiversity = scope.kind === "GLOBAL" ? Math.max(new Set(present.map((x) => x.placeType)).size, new Set(present.map((x) => x.context.audience)).size) : 2;
  const durable = presentSessions >= 2 && presentSpots >= 2 && absentSessions >= 2 && signs.size >= 2 && Math.abs(discrimination) >= .22 && identifiability >= .55 && scopeDiversity >= 2;
  const hypothesis = !durable && presentSessions >= 1 && Math.abs(discrimination) >= .15;
  const mixed = !durable && !hypothesis && present.some((x) => x.outcomeSign > 0) && present.some((x) => x.outcomeSign < 0);
  const knowledgeState = durable ? discrimination > 0 ? "POSITIVE" : "NEGATIVE" : hypothesis ? discrimination > 0 ? "HYPOTHESIS_POSITIVE" : "HYPOTHESIS_NEGATIVE" : mixed ? "MIXED" : "UNKNOWN";
  const breadth = Math.min(1, presentSessions / 5) * .4 + Math.min(1, presentSpots / 4) * .25 + Math.min(1, absentSessions / 5) * .2 + (signs.size >= 2 ? .15 : 0);
  const confidence = round(clamp((.12 + .7 * breadth * Math.min(1, Math.abs(discrimination) / .35)) * identifiability, 0, 1));
  const polarity = durable ? (discrimination > 0 ? "POSITIVE" : "NEGATIVE") : mixed ? "MIXED" : "UNKNOWN";
  const first = present[0].occurredAt, last = present.at(-1).occurredAt;
  const recentRows = rows.filter((x) => (new Date(asOf) - new Date(x.occurredAt)) / 86_400_000 <= 180);
  const recent = recentRows.length ? clamp(propensity(recentRows, concept, true).signedRate - propensity(recentRows, concept, false).signedRate) : discrimination;
  const trend = Math.abs(recent - discrimination) < .08 ? "STABLE" : recent > discrimination ? "RISING" : "FADING_OR_REVERSING";
  return { concept, scope, affinity: round(discrimination), confidence, polarity, knowledgeState, positiveEvidence: round(p.positive), negativeEvidence: round(p.negative), recentAffinity: round(recent), longTermAffinity: round(discrimination), trend, evidenceDepth: { chains: present.length, independentSessions: presentSessions, independentSpots: presentSpots, outcomes: present.length, sourceFamilies: ["explicit_comparative_outcome"] }, contradictions: present.some((x) => x.outcomeSign > 0) && present.some((x) => x.outcomeSign < 0) ? [{ kind: "COMPARATIVE_OUTCOME_CONFLICT", positive: round(p.positive), negative: round(p.negative) }] : [], comparativeEvidence: { presentPositive: round(p.positive), presentNegative: round(p.negative), absentPositive: round(a.positive), absentNegative: round(a.negative), absentIndependentSessions: absentSessions, discrimination: round(discrimination), maximumConceptJaccard: round(maxCorrelation), identifiability: round(identifiability), scopeDiversity, firstEvidenceAt: first, lastEvidenceAt: last }, evidenceRefs: present.map(({ observationId }) => ({ eventId: observationId, observationId })), provenance: unique(present.map(({ provenance }) => `${provenance.source}:${provenance.sourceVersion}`)) };
}

export function buildN5_7UserCard(inputs, { asOf, spotIntelligence = {} } = {}) {
  const base = buildCanonicalUserCard(inputs, { asOf, spotIntelligence, ...N5_6_4_ENGINE_OPTIONS });
  const observations = buildN5_7OutcomeObservations(inputs, { asOf, spotIntelligence });
  const scopes = new Map();
  for (const observation of observations) for (const scope of scopesFor(observation)) { const key = scopeKey(scope); if (!scopes.has(key)) scopes.set(key, { scope, rows: [] }); scopes.get(key).rows.push(observation); }
  const nodes = [];
  for (const { scope, rows } of scopes.values()) for (const concept of concepts) { const node = inferenceFor(rows, concept, scope, asOf); if (node) nodes.push({ nodeKey: `${scope.kind}:${scope.key}:${concept}`, ...node }); }
  nodes.sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  const durable = nodes.filter(({ knowledgeState }) => ["POSITIVE", "NEGATIVE"].includes(knowledgeState));
  const sessions = new Set(observations.map((x) => x.sessionId)).size;
  const maturity = { ...base.userCard.maturity, sessions, outcomeChains: observations.length, confidentNodes: durable.filter((x) => x.confidence >= .62 && x.evidenceDepth.independentSessions >= 3).length };
  const ledger = nodes.map((node) => { const body = { version: "backyrd-n5-7-comparative-change-ledger-v1", userId: base.userCard.userId, nodeKey: node.nodeKey, before: null, after: { knowledgeState: node.knowledgeState, affinity: node.affinity, confidence: node.confidence, polarity: node.polarity }, reasonCode: node.knowledgeState.startsWith("HYPOTHESIS") ? "COMPARATIVE_HYPOTHESIS_CREATED" : node.knowledgeState === "UNKNOWN" ? "IDENTIFIABILITY_REMAINS_UNKNOWN" : "COMPARATIVE_PREFERENCE_INFERRED", comparativeEvidence: node.comparativeEvidence, occurredAt: node.comparativeEvidence.lastEvidenceAt, explanation: `${node.concept} is ${node.knowledgeState.toLowerCase().replaceAll("_", " ")} from outcome discrimination across ${node.evidenceDepth.independentSessions} independent sessions and ${node.evidenceDepth.independentSpots} spots.` }; return { ...body, changeId: contentHash(body) }; });
  const cardBody = { ...base.userCard, maturity, nodes, contradictions: nodes.filter((x) => x.contradictions.length).map(({ nodeKey, concept, scope, confidence, contradictions }) => ({ nodeKey, concept, scope, confidence, contradictions })), uncertainty: { ...base.userCard.uncertainty, unknownConceptCount: TASTE_SPACE.length - new Set(durable.filter((x) => x.scope.kind === "GLOBAL").map((x) => x.concept)).size }, comparativeSummary: { observations: observations.length, durablePositive: nodes.filter((x) => x.knowledgeState === "POSITIVE").length, durableNegative: nodes.filter((x) => x.knowledgeState === "NEGATIVE").length, hypotheses: nodes.filter((x) => x.knowledgeState.startsWith("HYPOTHESIS")).length, mixed: nodes.filter((x) => x.knowledgeState === "MIXED").length, unknown: nodes.filter((x) => x.knowledgeState === "UNKNOWN").length }, boundaries: { ...base.userCard.boundaries, preferenceInference: N5_7_PREFERENCE_INFERENCE_CONTRACT.version }, userCardHash: undefined };
  delete cardBody.userCardHash; const userCard = { ...cardBody, userCardHash: contentHash(cardBody) };
  return { userCard, evidenceChains: base.evidenceChains, outcomeObservations: observations, changeLedger: ledger, identities: { ...base.identities, n57ContractHash: N5_7_CONTRACT_HASH } };
}
export function verifyN5_7UserCardRebuild(events, options) { const a = buildN5_7UserCard(events, options), b = buildN5_7UserCard([...events].reverse(), options); return { pass: a.userCard.userCardHash === b.userCard.userCardHash && contentHash(a.changeLedger) === contentHash(b.changeLedger), directHash: a.userCard.userCardHash, replayHash: b.userCard.userCardHash }; }
export function buildN5_7UserCardIncrementally(batches, options) { const events = new Map(); for (const batch of batches) for (const event of batch) { const prior = events.get(event.id); if (prior && contentHash(prior) !== contentHash(event)) throw new Error(`n57_incremental_event_conflict:${event.id}`); events.set(event.id, event); } return buildN5_7UserCard([...events.values()], options); }
