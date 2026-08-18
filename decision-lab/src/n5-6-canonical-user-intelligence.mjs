import { contentHash } from "./canonical-json.mjs";
import { EVIDENCE_MODEL, EVIDENCE_MODEL_HASH, TASTE_ENGINE_CONTRACT_HASH, TASTE_SPACE } from "./taste-engine.mjs";
import { MEMORY_EVENT_REGISTRY, N2_MEMORY_CONTRACT_HASH, validateMemoryEvent } from "./n2-memory-user-intelligence.mjs";

export const N5_6_VERSIONS = Object.freeze({
  evidence: "backyrd-n5-6-evidence-chain-v1",
  userCard: "backyrd-n5-6-user-card-v1",
  changeLedger: "backyrd-n5-6-change-ledger-v1",
  projection: "backyrd-n5-6-signed-projection-v1",
  maturity: "backyrd-n5-6-maturity-v1",
  validation: "backyrd-n5-6-validation-v1"
});

export const N5_6_EVIDENCE_CONTRACT = Object.freeze({
  version: N5_6_VERSIONS.evidence,
  frozenWave3B1EvidenceModelHash: EVIDENCE_MODEL_HASH,
  journeyKey: ["userId", "sessionId", "decisionId", "spotId"],
  strongestDispositionWinsPerJourneyConcept: true,
  repeatedSameSpotIsNotIndependent: true,
  exposureIsNotPreference: true,
  notThereIsNotDislike: true,
  currentRequestIsNotDurableTaste: true,
  attribution: {
    requiredConceptSource: "CANONICAL_SPOT_EVIDENCE",
    minimumConfidence: 0.35,
    defaultSyntheticN4Confidence: 0.82,
    maximumConceptsPerEvent: 8,
    dilution: "ONE_OVER_SQRT_CONCEPT_COUNT"
  },
  reliability: {
    exposure: 0,
    interaction: 0.35,
    onboarding: 0.45,
    commitment: 0.65,
    outcome: 0.82,
    explicit: 0.92,
    explicit_negative: 0.92,
    correction: 0,
    request: 0,
    moment: 0,
    state_change: 0
  },
  decayHalfLifeDays: { recent: 90, longTerm: 540 },
  consentRequired: true,
  latentTruthRuntimeInput: false
});

export const N5_6_USER_CARD_CONTRACT = Object.freeze({
  version: N5_6_VERSIONS.userCard,
  nodeScopes: ["GLOBAL", "PLACE_TYPE", "CONTEXT"],
  nodeFields: ["concept", "scope", "affinity", "confidence", "polarity", "positiveEvidence", "negativeEvidence", "recentAffinity", "longTermAffinity", "trend", "evidenceDepth", "provenance", "contradictions"],
  graphEdges: ["SUPPORTED_BY", "SCOPED_TO", "CONTRADICTS", "DERIVED_FROM", "SUPERSEDED_BY"],
  currentMomentExcluded: true,
  readModelNotProjection: true,
  deletableByUser: true,
  noCityInGlobalTruth: true
});

export const N5_6_CHANGE_LEDGER_CONTRACT = Object.freeze({
  version: N5_6_VERSIONS.changeLedger,
  appendOnly: true,
  immutable: true,
  fields: ["changeId", "userId", "nodeKey", "before", "after", "reasonCode", "evidenceChainId", "occurredAt", "provenance", "explanation"],
  reasons: ["NODE_CREATED", "EVIDENCE_ADDED", "CONTRADICTION_ADDED", "POLARITY_CHANGED", "CONFIDENCE_CHANGED", "DRIFT_UPDATED"]
});

export const N5_6_MATURITY_CONTRACT = Object.freeze({
  version: N5_6_VERSIONS.maturity,
  states: ["COLD", "EARLY", "DEVELOPING", "KNOWN", "WELL_KNOWN", "DEEP"],
  thresholds: {
    EARLY: { sessions: 1, outcomeChains: 0, confidentNodes: 0 },
    DEVELOPING: { sessions: 4, outcomeChains: 2, confidentNodes: 2 },
    KNOWN: { sessions: 12, outcomeChains: 8, confidentNodes: 4 },
    WELL_KNOWN: { sessions: 35, outcomeChains: 20, confidentNodes: 8 },
    DEEP: { sessions: 70, outcomeChains: 45, confidentNodes: 12 }
  },
  eventCountAloneNeverSufficient: true
});

export const N5_6_PRODUCT_EVENT_ADAPTERS = Object.freeze({
  decision_request: { canonicalEvent: "decision_request", learnsTaste: false },
  result_impression: { canonicalEvent: "decision_results_shown", learnsTaste: false },
  candidate_exposure: { canonicalEvent: "candidate_exposed", learnsTaste: false },
  spot_open: { canonicalEvent: "spot_opened", learnsTaste: true, strength: "WEAK" },
  save: { canonicalEvent: "saved", learnsTaste: true, strength: "DELIBERATE_INTENT" },
  navigation: { canonicalEvent: "navigation_intent", learnsTaste: true, strength: "DELIBERATE_INTENT" },
  reservation_intent: { canonicalEvent: "reservation_intent", learnsTaste: true, strength: "DELIBERATE_INTENT" },
  verified_visit: { canonicalEvent: "verified_visit", learnsTaste: true, strength: "OUTCOME_WITHOUT_SATISFACTION" },
  explicit_positive_feedback: { canonicalEvent: "positive_post_visit", learnsTaste: true, strength: "OUTCOME" },
  explicit_negative_feedback: { canonicalEvent: "negative_post_visit", learnsTaste: true, strength: "OUTCOME_NEGATIVE" },
  not_there: { canonicalEvent: "not_there", learnsTaste: false, meaning: "CORRECTION_NOT_DISLIKE" },
  onboarding_preference: { canonicalEvent: "onboarding_preference", learnsTaste: true, strength: "WEAK_PRIOR" },
  review: { canonicalEvent: null, status: "REQUIRES_EXPLICIT_PRODUCT_ADAPTER_BEFORE_ACTIVATION" },
  moment_feedback: { canonicalEvent: "exact_mood_feedback", learnsTaste: true, strength: "EXPLICIT" },
  remix: { canonicalEvent: "remix_requested", learnsTaste: false }
});

export const N5_6_CONTRACT = Object.freeze({
  versions: N5_6_VERSIONS,
  upstream: { n2: N2_MEMORY_CONTRACT_HASH, taste: TASTE_ENGINE_CONTRACT_HASH },
  evidence: N5_6_EVIDENCE_CONTRACT,
  userCard: N5_6_USER_CARD_CONTRACT,
  changeLedger: N5_6_CHANGE_LEDGER_CONTRACT,
  maturity: N5_6_MATURITY_CONTRACT,
  productEventAdapters: N5_6_PRODUCT_EVENT_ADAPTERS,
  authority: ["EXPLICIT_CURRENT_INTENT", "N3_CURRENT_MOMENT", "N5_6_RELEVANT_USER_PROJECTION", "LONG_TERM_USER_INTELLIGENCE"],
  externalAiCalls: 0,
  productionIntegration: "NOT_STARTED"
});

export const N5_6_CONTRACT_HASH = contentHash(N5_6_CONTRACT);
export const N5_6_EVIDENCE_CONTRACT_HASH = contentHash(N5_6_EVIDENCE_CONTRACT);
export const N5_6_USER_CARD_CONTRACT_HASH = contentHash(N5_6_USER_CARD_CONTRACT);
export const N5_6_CHANGE_LEDGER_CONTRACT_HASH = contentHash(N5_6_CHANGE_LEDGER_CONTRACT);

const conceptSet = new Set(TASTE_SPACE.map(({ key }) => key));
const clamp = (value, low = -1, high = 1) => Math.max(low, Math.min(high, value));
const round = (value) => Number(value.toFixed(6));
const days = (a, b) => Math.max(0, (new Date(b).valueOf() - new Date(a).valueOf()) / 86_400_000);
const decay = (occurredAt, asOf, halfLife) => 2 ** (-days(occurredAt, asOf) / halfLife);
const unique = (values) => [...new Set(values.filter(Boolean).map(String))].sort();
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const scopeKeys = (event) => {
  const values = [{ kind: "GLOBAL", key: "global" }];
  if (event.spotEvidence.placeType) values.push({ kind: "PLACE_TYPE", key: event.spotEvidence.placeType });
  const signature = event.momentSignature;
  if (signature.audience && signature.audience !== "other") values.push({ kind: "CONTEXT", key: `audience.${signature.audience}` });
  if (["morning", "afternoon", "evening"].includes(signature.daypart)) values.push({ kind: "CONTEXT", key: `time.${signature.daypart}` });
  if (signature.calendar) values.push({ kind: "CONTEXT", key: `time.${signature.calendar}` });
  return values;
};

const eventSignal = (event) => {
  const registry = MEMORY_EVENT_REGISTRY[event.eventType];
  if (!registry?.tasteEventType) return null;
  const base = EVIDENCE_MODEL[registry.tasteEventType];
  if (!base || !base.qualified || base.direction === 0) return null;
  return { direction: base.direction, strength: base.strength, family: base.family, decayClass: base.decay };
};

export function buildEvidenceChains(inputs, { asOf, spotIntelligence = {} } = {}) {
  const normalized = new Map();
  for (const input of inputs) {
    const event = validateMemoryEvent(input, { asOf, allowExpired: true });
    const existing = normalized.get(event.id);
    if (existing && existing.eventHash !== event.eventHash) throw new Error(`n56_event_identity_conflict:${event.id}`);
    normalized.set(event.id, event);
  }
  const groups = new Map();
  for (const event of normalized.values()) {
    const key = [event.userId, event.sessionId ?? "none", event.decisionId ?? "none", event.spotId ?? "none"].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const chains = [];
  for (const [journeyKey, events] of groups) {
    events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    const samples = new Map();
    for (const event of events) {
      const signal = eventSignal(event);
      if (!signal) continue;
      const concepts = event.spotEvidence.concepts.slice(0, N5_6_EVIDENCE_CONTRACT.attribution.maximumConceptsPerEvent);
      const dilution = 1 / Math.sqrt(Math.max(1, concepts.length));
      const n4 = event.spotId ? spotIntelligence[event.spotId] : null;
      for (const concept of concepts) {
        if (!conceptSet.has(concept)) throw new Error(`n56_unknown_concept:${concept}`);
        const attributionConfidence = Number(n4?.concepts?.[concept]?.confidence ?? N5_6_EVIDENCE_CONTRACT.attribution.defaultSyntheticN4Confidence);
        if (attributionConfidence < N5_6_EVIDENCE_CONTRACT.attribution.minimumConfidence) continue;
        for (const scope of scopeKeys(event)) {
          const key = `${scope.kind}:${scope.key}:${concept}`;
          const reliability = N5_6_EVIDENCE_CONTRACT.reliability[event.evidenceFamily] ?? 0;
          const magnitude = signal.strength * reliability * attributionConfidence * dilution;
          const row = { eventId: event.id, occurredAt: event.occurredAt, spotId: event.spotId, sessionId: event.sessionId, decisionId: event.decisionId, momentSignature: event.momentSignature, concept, scope, direction: signal.direction, magnitude, attributionConfidence, evidenceFamily: event.evidenceFamily, outcomeSupport: event.outcomeSupport, provenance: event.provenance };
          const prior = samples.get(key);
          if (!prior || magnitude > prior.magnitude || (magnitude === prior.magnitude && row.occurredAt > prior.occurredAt)) samples.set(key, row);
        }
      }
    }
    const selected = [...samples.values()].sort((a, b) => `${a.scope.kind}:${a.scope.key}:${a.concept}`.localeCompare(`${b.scope.kind}:${b.scope.key}:${b.concept}`));
    const chainBody = { version: N5_6_VERSIONS.evidence, journeyKey, userId: events[0].userId, sessionId: events[0].sessionId, decisionId: events[0].decisionId, spotId: events[0].spotId, occurredAt: events.at(-1).occurredAt, sourceEventIds: events.map(({ id }) => id), samples: selected };
    chains.push({ ...chainBody, chainId: contentHash(chainBody) });
  }
  return deepFreeze(chains.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.chainId.localeCompare(b.chainId)));
}

function summarizeNode(samples, asOf) {
  let positive = 0; let negative = 0; let recentPositive = 0; let recentNegative = 0;
  const sessions = new Set(); const spots = new Set(); const outcomes = new Set(); const families = new Set();
  for (const row of samples) {
    const long = row.magnitude * decay(row.occurredAt, asOf, N5_6_EVIDENCE_CONTRACT.decayHalfLifeDays.longTerm);
    const recent = row.magnitude * decay(row.occurredAt, asOf, N5_6_EVIDENCE_CONTRACT.decayHalfLifeDays.recent);
    if (row.direction > 0) { positive += long; recentPositive += recent; } else { negative += long; recentNegative += recent; }
    if (row.sessionId) sessions.add(row.sessionId); if (row.spotId) spots.add(row.spotId);
    if (row.outcomeSupport) outcomes.add(row.eventId); families.add(row.evidenceFamily);
  }
  const support = positive + negative;
  const recentSupport = recentPositive + recentNegative;
  const affinity = support ? clamp((positive - negative) / (support + 0.35)) : 0;
  const recentAffinity = recentSupport ? clamp((recentPositive - recentNegative) / (recentSupport + 0.2)) : 0;
  const independence = Math.min(1, sessions.size / 6) * 0.55 + Math.min(1, spots.size / 5) * 0.3 + Math.min(1, outcomes.size / 4) * 0.15;
  const conflictRatio = support ? Math.min(positive, negative) / support : 0;
  const confidence = clamp((1 - Math.exp(-support / 0.9)) * (0.45 + 0.55 * independence) * (1 - 0.45 * conflictRatio), 0, 1);
  const polarity = confidence < 0.22 ? "UNKNOWN" : affinity >= 0.1 ? "POSITIVE" : affinity <= -0.1 ? "NEGATIVE" : "MIXED";
  const delta = recentAffinity - affinity;
  const trend = Math.abs(delta) < 0.08 ? "STABLE" : delta > 0 ? "RISING" : "FADING_OR_REVERSING";
  return { affinity: round(affinity), confidence: round(confidence), polarity, positiveEvidence: round(positive), negativeEvidence: round(negative), recentAffinity: round(recentAffinity), longTermAffinity: round(affinity), trend, evidenceDepth: { chains: samples.length, independentSessions: sessions.size, independentSpots: spots.size, outcomes: outcomes.size, sourceFamilies: [...families].sort() }, contradictions: positive > 0 && negative > 0 ? [{ kind: "SIGNED_EVIDENCE_CONFLICT", positive: round(positive), negative: round(negative) }] : [] };
}

function createLedgerAccumulator() { return { at: null, positive: 0, negative: 0, recentPositive: 0, recentNegative: 0, sessions: new Set(), spots: new Set(), outcomes: new Set(), families: new Set(), count: 0 }; }
function updateLedgerAccumulator(state, row) {
  if (state.at) {
    const elapsed = days(state.at, row.occurredAt);
    const longDecay = 2 ** (-elapsed / N5_6_EVIDENCE_CONTRACT.decayHalfLifeDays.longTerm);
    const recentDecay = 2 ** (-elapsed / N5_6_EVIDENCE_CONTRACT.decayHalfLifeDays.recent);
    state.positive *= longDecay; state.negative *= longDecay; state.recentPositive *= recentDecay; state.recentNegative *= recentDecay;
  }
  if (row.direction > 0) { state.positive += row.magnitude; state.recentPositive += row.magnitude; } else { state.negative += row.magnitude; state.recentNegative += row.magnitude; }
  if (row.sessionId) state.sessions.add(row.sessionId); if (row.spotId) state.spots.add(row.spotId); if (row.outcomeSupport) state.outcomes.add(row.eventId); state.families.add(row.evidenceFamily); state.at = row.occurredAt; state.count += 1;
  const support = state.positive + state.negative; const recentSupport = state.recentPositive + state.recentNegative;
  const affinity = support ? clamp((state.positive - state.negative) / (support + 0.35)) : 0; const recentAffinity = recentSupport ? clamp((state.recentPositive - state.recentNegative) / (recentSupport + 0.2)) : 0;
  const independence = Math.min(1, state.sessions.size / 6) * 0.55 + Math.min(1, state.spots.size / 5) * 0.3 + Math.min(1, state.outcomes.size / 4) * 0.15;
  const conflictRatio = support ? Math.min(state.positive, state.negative) / support : 0; const confidence = clamp((1 - Math.exp(-support / 0.9)) * (0.45 + 0.55 * independence) * (1 - 0.45 * conflictRatio), 0, 1);
  const polarity = confidence < 0.22 ? "UNKNOWN" : affinity >= 0.1 ? "POSITIVE" : affinity <= -0.1 ? "NEGATIVE" : "MIXED"; const delta = recentAffinity - affinity;
  return { affinity: round(affinity), confidence: round(confidence), polarity, positiveEvidence: round(state.positive), negativeEvidence: round(state.negative), recentAffinity: round(recentAffinity), longTermAffinity: round(affinity), trend: Math.abs(delta) < 0.08 ? "STABLE" : delta > 0 ? "RISING" : "FADING_OR_REVERSING", evidenceDepth: { chains: state.count, independentSessions: state.sessions.size, independentSpots: state.spots.size, outcomes: state.outcomes.size, sourceFamilies: [...state.families].sort() }, contradictions: state.positive > 0 && state.negative > 0 ? [{ kind: "SIGNED_EVIDENCE_CONFLICT", positive: round(state.positive), negative: round(state.negative) }] : [] };
}

function deriveMaturity(chains, nodes) {
  const learningChains = chains.filter(({ samples }) => samples.length > 0);
  const sessions = new Set(learningChains.map(({ sessionId }) => sessionId).filter(Boolean)).size;
  const outcomeChains = learningChains.filter(({ samples }) => samples.some(({ outcomeSupport }) => outcomeSupport)).length;
  const confidentNodes = nodes.filter(({ confidence, evidenceDepth }) => confidence >= 0.62 && evidenceDepth.independentSessions >= 3).length;
  let state = "COLD";
  for (const candidate of ["EARLY", "DEVELOPING", "KNOWN", "WELL_KNOWN", "DEEP"]) {
    const threshold = N5_6_MATURITY_CONTRACT.thresholds[candidate];
    if (sessions >= threshold.sessions && outcomeChains >= threshold.outcomeChains && confidentNodes >= threshold.confidentNodes) state = candidate;
  }
  return { state, sessions, outcomeChains, confidentNodes };
}

function deriveBehavior(chains) {
  const learning = chains.filter(({ samples }) => samples.length);
  const sessions = new Set(learning.map(({ sessionId }) => sessionId).filter(Boolean)).size;
  const spots = new Set(learning.map(({ spotId }) => spotId).filter(Boolean)).size;
  const outcomes = learning.filter(({ samples }) => samples.some(({ outcomeSupport }) => outcomeSupport)).length;
  const exploration = sessions ? Math.min(1, spots / sessions) : 0;
  const confidence = round(Math.min(0.9, sessions / 30));
  if (!sessions) return [];
  return [
    { key: "behavior.exploration_tendency", value: round(exploration), confidence, evidence: { sessions, spots, outcomes }, polarity: exploration >= 0.7 ? "POSITIVE" : exploration <= 0.35 ? "NEGATIVE" : "MIXED", boundary: "DISTINCT_SPOT_RATE_NOT_HIDDEN_GEM" },
    { key: "behavior.repeat_tendency", value: round(1 - exploration), confidence, evidence: { sessions, spots, outcomes }, polarity: 1 - exploration >= 0.65 ? "POSITIVE" : 1 - exploration <= 0.3 ? "NEGATIVE" : "MIXED", boundary: "REPEAT_BEHAVIOR_NOT_FAMILIARITY_DESIRE" }
  ];
}

function derivePatterns(chains) {
  const groups = new Map();
  for (const chain of chains) {
    const sampleEvent = chain.samples.find(({ outcomeSupport }) => outcomeSupport);
    if (!sampleEvent) continue;
    const source = sampleEvent.momentSignature ?? {};
    const normalized = Object.fromEntries(["audience", "daypart", "calendar", "occasion", "placeType", "friction", "distanceWillingness"].filter((key) => source[key]).map((key) => [key, source[key]]));
    if (Object.keys(normalized).length < 2) continue;
    const signature = Object.entries(normalized).map(([key, value]) => `${key}.${value}`).join("|");
    if (!groups.has(signature)) groups.set(signature, { signature: normalized, sessions: new Set(), spots: new Set(), outcomes: 0, first: null, last: null });
    const group = groups.get(signature); if (chain.sessionId) group.sessions.add(chain.sessionId); if (chain.spotId) group.spots.add(chain.spotId); group.outcomes += 1; group.first = !group.first || chain.occurredAt < group.first ? chain.occurredAt : group.first; group.last = !group.last || chain.occurredAt > group.last ? chain.occurredAt : group.last;
  }
  return [...groups].filter(([, value]) => value.sessions.size >= 4 && value.spots.size >= 3).map(([signature, value]) => ({ patternKey: `occasion.${signature}`, contextSignature: value.signature, evidenceCount: value.outcomes, independentSessions: value.sessions.size, independentSpots: value.spots.size, timeSpanDays: round(days(value.first, value.last)), confidence: round(Math.min(0.92, 0.42 + value.sessions.size * 0.035)), firstEvidenceAt: value.first, lastEvidenceAt: value.last, recurrenceStrength: round(Math.min(1, value.sessions.size / 12)), state: "KNOWN" })).sort((a, b) => b.confidence - a.confidence || a.patternKey.localeCompare(b.patternKey));
}

function derivePracticalPreferences(chains) {
  const outcomeRows = chains.map(({ samples }) => samples.find(({ outcomeSupport }) => outcomeSupport)).filter(Boolean);
  const values = (key) => outcomeRows.map(({ momentSignature }) => momentSignature?.[key]).filter(Boolean);
  const summarize = (key, outputKey) => {
    const rows = values(key); if (rows.length < 6) return null;
    const counts = rows.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
    const [value, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    // Without comparative opportunity data this is descriptive behavior only,
    // never a durable preference claim.
    return { key: outputKey, observedValue: value, confidence: round(Math.min(0.6, count / rows.length)), evidenceCount: rows.length, interpretation: "OBSERVED_BEHAVIOR_NOT_CAUSAL_PREFERENCE", opportunityControlled: false };
  };
  return [summarize("distanceWillingness", "practical.observed_distance_willingness"), summarize("friction", "practical.observed_planning_friction")].filter(Boolean);
}

export function buildCanonicalUserCard(inputs, { asOf, spotIntelligence = {} } = {}) {
  if (!asOf) throw new Error("n56_as_of_required");
  const chains = buildEvidenceChains(inputs, { asOf, spotIntelligence });
  const users = unique(chains.map(({ userId }) => userId));
  if (users.length !== 1) throw new Error("n56_single_user_required");
  const grouped = new Map();
  for (const chain of chains) for (const sample of chain.samples) {
    const key = `${sample.scope.kind}:${sample.scope.key}:${sample.concept}`;
    if (!grouped.has(key)) grouped.set(key, { concept: sample.concept, scope: sample.scope, samples: [] });
    grouped.get(key).samples.push({ ...sample, chainId: chain.chainId });
  }
  const nodes = [...grouped].map(([nodeKey, group]) => ({ nodeKey, concept: group.concept, scope: group.scope, ...summarizeNode(group.samples, asOf), evidenceRefs: group.samples.map(({ eventId, chainId }) => ({ eventId, chainId })), provenance: unique(group.samples.map(({ provenance }) => `${provenance.source}:${provenance.sourceVersion}`)) })).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  const ledger = [];
  for (const node of nodes) {
    const evidence = grouped.get(node.nodeKey).samples.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    let before = null; const accumulator = createLedgerAccumulator();
    for (let index = 0; index < evidence.length; index += 1) {
      const after = updateLedgerAccumulator(accumulator, evidence[index]);
      const reasonCode = before == null ? "NODE_CREATED" : before.polarity !== after.polarity ? "POLARITY_CHANGED" : after.contradictions.length > (before.contradictions?.length ?? 0) ? "CONTRADICTION_ADDED" : before.trend !== after.trend ? "DRIFT_UPDATED" : Math.abs(after.confidence - before.confidence) >= 0.05 ? "CONFIDENCE_CHANGED" : "EVIDENCE_ADDED";
      const body = { version: N5_6_VERSIONS.changeLedger, userId: users[0], nodeKey: node.nodeKey, before, after, reasonCode, evidenceChainId: evidence[index].chainId, occurredAt: evidence[index].occurredAt, provenance: evidence[index].provenance, explanation: `${node.concept} ${reasonCode.toLowerCase().replaceAll("_", " ")} from ${evidence[index].evidenceFamily} evidence.` };
      ledger.push({ ...body, changeId: contentHash(body) }); before = after;
    }
  }
  const maturity = deriveMaturity(chains, nodes);
  const cardBody = { version: N5_6_VERSIONS.userCard, userId: users[0], asOf, maturity, memorySummary: { events: new Set(chains.flatMap(({ sourceEventIds }) => sourceEventIds)).size, evidenceChains: chains.length, independentSessions: maturity.sessions, independentSpots: new Set(chains.map(({ spotId }) => spotId).filter(Boolean)).size, outcomeChains: maturity.outcomeChains, firstEvidenceAt: chains[0]?.occurredAt ?? null, lastEvidenceAt: chains.at(-1)?.occurredAt ?? null }, nodes, behavioralPreferences: deriveBehavior(chains), practicalPreferences: derivePracticalPreferences(chains), occasionPatterns: derivePatterns(chains), contradictions: nodes.filter(({ contradictions }) => contradictions.length).map(({ nodeKey, concept, scope, confidence, contradictions }) => ({ nodeKey, concept, scope, confidence, contradictions })), uncertainty: { unknownConceptCount: TASTE_SPACE.length - new Set(nodes.filter(({ scope }) => scope.kind === "GLOBAL").map(({ concept }) => concept)).size, matureDoesNotMeanComplete: true, unavailableFamilies: ["causal_price_sensitivity", "causal_distance_preference", "weather_controlled_outdoor_preference"] }, evidenceChainIds: chains.map(({ chainId }) => chainId), boundaries: { currentMomentIncluded: false, ranking: "NONE", n6: "NOT_AUTHORIZED", rawHistoryIncluded: false, cityPortable: true, activeVocabularyBounded: TASTE_SPACE.length, combinationNodes: "DISABLED_V1", staleNodes: "RETAINED_WITH_DECAY_AND_TREND", productionIntegration: "NOT_STARTED" } };
  const userCard = { ...cardBody, userCardHash: contentHash(cardBody) };
  return deepFreeze({ userCard, evidenceChains: chains, changeLedger: ledger, identities: { contractHash: N5_6_CONTRACT_HASH, evidenceHash: N5_6_EVIDENCE_CONTRACT_HASH, userCardContractHash: N5_6_USER_CARD_CONTRACT_HASH, ledgerContractHash: N5_6_CHANGE_LEDGER_CONTRACT_HASH } });
}

export function verifyUserCardRebuild(events, options) {
  const direct = buildCanonicalUserCard(events, options);
  const replay = buildCanonicalUserCard([...events].reverse(), options);
  return { pass: direct.userCard.userCardHash === replay.userCard.userCardHash && contentHash(direct.changeLedger) === contentHash(replay.changeLedger), directHash: direct.userCard.userCardHash, replayHash: replay.userCard.userCardHash };
}

export function buildCanonicalUserCardIncrementally(batches, options) {
  const eventLedger = new Map(); const affectedJourneyKeys = new Set();
  for (const batch of batches) for (const event of batch) {
    const prior = eventLedger.get(event.id);
    if (prior && contentHash(prior) !== contentHash(event)) throw new Error(`n56_incremental_event_conflict:${event.id}`);
    eventLedger.set(event.id, event);
    affectedJourneyKeys.add([event.userId, event.sessionId ?? "none", event.decisionId ?? "none", event.spotId ?? "none"].join("|"));
  }
  const result = buildCanonicalUserCard([...eventLedger.values()], options);
  return deepFreeze({ ...result, incrementalAudit: { batches: batches.length, canonicalEvents: eventLedger.size, affectedJourneyKeys: affectedJourneyKeys.size, strategy: "AFFECTED_CHAINS_MARKED_WITH_DETERMINISTIC_REFERENCE_MATERIALIZATION", fullRebuildEquivalentHash: result.userCard.userCardHash } });
}
