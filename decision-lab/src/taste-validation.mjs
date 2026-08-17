import { contentHash } from "./canonical-json.mjs";
import { buildUserTasteMap, projectCurrentTaste, TASTE_SPACE } from "./taste-engine.mjs";

export const VALIDATION_RUNTIME_VERSION = "backyrd-taste-validation-runtime-v1";
const conceptKeys = TASTE_SPACE.map(({ key }) => key);
const mean = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};
const sign = (value, epsilon = 0.05) => value > epsilon ? 1 : value < -epsilon ? -1 : 0;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export const ARCHETYPES = Object.freeze([
  { id: "hidden-gem-explorer", truth: { "discovery.hidden_gem": 0.95, "discovery.novel": 0.8, "discovery.mainstream": -0.75, "character.distinctive": 0.7 } },
  { id: "cozy-quiet-lover", truth: { "vibe.cozy": 0.95, "vibe.quiet": 0.85, "energy.calm": 0.8, "vibe.lively": -0.75 } },
  { id: "lively-social", truth: { "vibe.lively": 0.95, "vibe.social": 0.9, "energy.energetic": 0.85, "vibe.quiet": -0.75 } },
  { id: "premium-design", truth: { "price.premium": 0.85, "character.design_led": 0.95, "vibe.elegant": 0.8, "price.budget": -0.7 } },
  { id: "budget-casual", truth: { "price.budget": 0.95, "vibe.relaxed": 0.8, "character.authentic_character": 0.75, "price.premium": -0.8 } },
  { id: "family-oriented", truth: { "social_style.family_friendly": 0.95, "vibe.relaxed": 0.75, "energy.calm": 0.65, "energy.energetic": -0.55 } },
  { id: "mainstream-convenience", truth: { "discovery.mainstream": 0.9, "price.balanced_price": 0.75, "vibe.relaxed": 0.6, "discovery.hidden_gem": -0.65 } },
  { id: "novelty-seeker", truth: { "discovery.novel": 0.95, "character.distinctive": 0.85, "vibe.inspiring": 0.75, "discovery.mainstream": -0.6 } },
  { id: "habitual-familiarity", truth: { "discovery.mainstream": 0.75, "vibe.relaxed": 0.8, "price.balanced_price": 0.65, "discovery.novel": -0.75 } },
  { id: "mixed-complex", truth: { "vibe.cozy": 0.75, "vibe.social": 0.7, "discovery.hidden_gem": 0.8, "price.balanced_price": 0.65, "vibe.elegant": -0.55 } }
]);

export const PLACE_TYPE_TRUTH = Object.freeze({
  cafe: { "vibe.quiet": 0.9, "vibe.cozy": 0.85, "character.design_led": 0.65 },
  bar: { "vibe.lively": 0.9, "vibe.social": 0.85, "discovery.hidden_gem": 0.7 },
  restaurant: { "vibe.relaxed": 0.75, "character.authentic_character": 0.9, "price.balanced_price": 0.65 }
});

export const CONTEXT_TRUTH = Object.freeze({
  family: { contexts: ["audience.family", "time.weekend", "time.afternoon"], placeType: "activity", truth: { "social_style.family_friendly": 0.95, "vibe.relaxed": 0.75, "energy.calm": 0.7, "energy.energetic": -0.6 } },
  friends: { contexts: ["audience.friends", "time.weekend", "time.evening"], placeType: "bar", truth: { "vibe.social": 0.95, "vibe.lively": 0.9, "energy.energetic": 0.8, "vibe.quiet": -0.65 } },
  date: { contexts: ["audience.date", "time.weekday", "time.evening"], placeType: "restaurant", truth: { "vibe.romantic": 0.9, "character.design_led": 0.75, "social_style.conversation_friendly": 0.9, "energy.energetic": -0.45 } }
});

const eventTypes = ["spot_tapped", "spot_opened", "saved", "navigation_intent", "verified_visit", "positive_post_visit"];
const negativeTypes = ["disliked", "negative_post_visit"];
const occurredAt = (index, total, start = Date.UTC(2025, 0, 1, 12)) => new Date(start + Math.floor(index * 365 / Math.max(1, total)) * 86_400_000).toISOString();
const weightedChoice = (random, entries) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = random() * total;
  for (const entry of entries) { cursor -= entry[1]; if (cursor <= 0) return entry[0]; }
  return entries.at(-1)[0];
};

function observedEvent({ id, userId, eventType, concepts, at, placeType = "cafe", contexts = [], spotId, sessionId }) {
  return { id, userId, eventType, concepts, consent: "granted", occurredAt: at, placeType, contexts, spotId, sessionId };
}

export function simulateLifecycle({ archetype, seed, count }) {
  const random = seededRandom(seed);
  const userId = `lab-${archetype.id}-${seed}`;
  const positive = Object.entries(archetype.truth).filter(([, value]) => value > 0);
  const negative = Object.entries(archetype.truth).filter(([, value]) => value < 0).map(([key, value]) => [key, -value]);
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const negativeEvent = negative.length && random() < 0.13;
    const source = negativeEvent ? negative : positive;
    const concept = weightedChoice(random, source);
    const eventType = negativeEvent ? negativeTypes[index % negativeTypes.length] : eventTypes[index % eventTypes.length];
    const concepts = [concept];
    if (!negativeEvent && random() < 0.12) {
      const neutral = conceptKeys.filter((key) => !(key in archetype.truth));
      concepts.push(neutral[Math.floor(random() * neutral.length)]);
    }
    events.push(observedEvent({
      id: `${userId}-e${index}`, userId, eventType, concepts, at: occurredAt(index, count),
      placeType: ["cafe", "bar", "restaurant"][index % 3], spotId: `${userId}-spot-${index % Math.max(3, Math.ceil(count / 5))}`,
      sessionId: `${userId}-session-${Math.floor(index / 3)}`
    }));
  }
  return events;
}

export function evaluateTasteMap(tasteMap, truth) {
  const global = new Map(tasteMap.rows.filter(({ scope }) => scope.kind === "GLOBAL").map((row) => [row.concept, row]));
  const declared = Object.entries(truth);
  const rows = declared.map(([concept, trueAffinity]) => {
    const learned = global.get(concept);
    const learnedAffinity = learned?.affinity ?? 0;
    return { concept, trueAffinity, learnedAffinity, confidence: learned?.confidence ?? 0, correctDirection: sign(learnedAffinity) === sign(trueAffinity) };
  });
  const neutralLearned = [...global.values()].filter(({ concept, affinity }) => !(concept in truth) && Math.abs(affinity) >= 0.15);
  const opposite = rows.filter(({ learnedAffinity, trueAffinity }) => sign(learnedAffinity) !== 0 && sign(learnedAffinity) !== sign(trueAffinity));
  const learnedNegative = [...global.values()].filter(({ affinity }) => affinity <= -0.15);
  const falseLearnedNegative = learnedNegative.filter(({ concept }) => !(concept in truth) || truth[concept] >= 0);
  const positives = rows.filter(({ trueAffinity }) => trueAffinity > 0).sort((a, b) => b.trueAffinity - a.trueAffinity).slice(0, 3);
  const learnedTop = new Set([...global.values()].filter(({ affinity }) => affinity > 0).sort((a, b) => b.affinity - a.affinity).slice(0, 3).map(({ concept }) => concept));
  return {
    directionAccuracy: mean(rows.map(({ correctDirection }) => Number(correctDirection))),
    affinityAccuracy: mean(rows.map(({ trueAffinity, learnedAffinity }) => 1 - Math.abs(trueAffinity - learnedAffinity) / 2)),
    topPreferenceRecall: positives.length ? positives.filter(({ concept }) => learnedTop.has(concept)).length / positives.length : null,
    falsePreferenceRate: (neutralLearned.length + opposite.length) / Math.max(1, global.size),
    falsePreferenceConcepts: [...new Set([...neutralLearned.map(({ concept }) => concept), ...opposite.map(({ concept }) => concept)])].sort(),
    falseNegativePreferenceRate: falseLearnedNegative.length / Math.max(1, learnedNegative.length),
    negativeDirectionAccuracy: mean(rows.filter(({ trueAffinity }) => trueAffinity < 0).map(({ correctDirection }) => Number(correctDirection))),
    rows
  };
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length); let cursor = 0;
  while (cursor < sorted.length) {
    let end = cursor + 1; while (end < sorted.length && sorted[end].value === sorted[cursor].value) end += 1;
    const rank = (cursor + end - 1) / 2 + 1;
    for (let i = cursor; i < end; i += 1) result[sorted[i].index] = rank;
    cursor = end;
  }
  return result;
}

export function spearman(rows) {
  if (rows.length < 2) return null;
  const x = ranks(rows.map(({ trueAffinity }) => trueAffinity));
  const y = ranks(rows.map(({ learnedAffinity }) => learnedAffinity));
  const mx = mean(x); const my = mean(y);
  const numerator = x.reduce((sum, value, index) => sum + (value - mx) * (y[index] - my), 0);
  const denominator = Math.sqrt(x.reduce((sum, value) => sum + (value - mx) ** 2, 0) * y.reduce((sum, value) => sum + (value - my) ** 2, 0));
  return denominator === 0 ? 0 : numerator / denominator;
}

export function confidenceCalibration(samples, bins = 5) {
  const populated = [];
  for (let index = 0; index < bins; index += 1) {
    const low = index / bins; const high = (index + 1) / bins;
    const rows = samples.filter(({ confidence }) => confidence >= low && (index === bins - 1 ? confidence <= high : confidence < high));
    if (rows.length) populated.push({ low, high, count: rows.length, confidence: mean(rows.map(({ confidence }) => confidence)), accuracy: mean(rows.map(({ correctDirection }) => Number(correctDirection))) });
  }
  const total = samples.length;
  return { bins: populated, ece: total ? populated.reduce((sum, row) => sum + row.count / total * Math.abs(row.confidence - row.accuracy), 0) : null,
    highConfidenceAccuracy: mean(samples.filter(({ confidence }) => confidence >= 0.6).map(({ correctDirection }) => Number(correctDirection))) };
}

export function buildScopedHistory({ seed, repetitions = 12 }) {
  const random = seededRandom(seed); const userId = `scoped-${seed}`; const events = []; let index = 0;
  const addTruth = (truth, placeType, contexts) => {
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const entries = Object.entries(truth); const [concept, value] = entries[repeat % entries.length];
      events.push(observedEvent({ id: `${userId}-s${index}`, userId, eventType: value < 0 ? negativeTypes[index % 2] : eventTypes[2 + index % 4], concepts: [concept],
        at: occurredAt(index, repetitions * 6), placeType, contexts, spotId: `${userId}-spot-${index}`, sessionId: `${userId}-session-${Math.floor(index / 2)}` }));
      index += 1; random();
    }
  };
  for (const [placeType, truth] of Object.entries(PLACE_TYPE_TRUTH)) addTruth(truth, placeType, []);
  for (const context of Object.values(CONTEXT_TRUTH)) addTruth(context.truth, context.placeType, context.contexts);
  return events;
}

export function evaluateProjection(projection, truth) {
  const learned = new Map(projection.rows.map((row) => [row.concept, row.affinity]));
  return mean(Object.entries(truth).map(([concept, value]) => Number(sign(learned.get(concept) ?? 0) === sign(value))));
}

export function evaluateScopedTaste(map) {
  const contexts = Object.fromEntries(Object.entries(CONTEXT_TRUTH).map(([name, value]) => {
    const projection = projectCurrentTaste(map, { placeType: value.placeType, contexts: value.contexts });
    return [name, { accuracy: evaluateProjection(projection, value.truth), projection }];
  }));
  const placeTypes = Object.fromEntries(Object.entries(PLACE_TYPE_TRUTH).map(([name, truth]) => {
    const projection = projectCurrentTaste(map, { placeType: name });
    return [name, { accuracy: evaluateProjection(projection, truth), projection }];
  }));
  return { contextualDirectionAccuracy: mean(Object.values(contexts).map(({ accuracy }) => accuracy)), placeTypeDirectionAccuracy: mean(Object.values(placeTypes).map(({ accuracy }) => accuracy)), contexts, placeTypes };
}

export function runSafetyDiagnostics({ asOf = "2026-01-01T12:00:00.000Z" } = {}) {
  const base = (id, type, concepts, options = {}) => observedEvent({ id, userId: "safety-user", eventType: type, concepts, at: options.at ?? "2025-12-20T12:00:00.000Z", placeType: options.placeType ?? "cafe", contexts: options.contexts ?? [], spotId: options.spotId ?? `spot-${id}`, sessionId: options.sessionId ?? `session-${id}` });
  const shown = buildUserTasteMap([base("shown", "decision_shown", []), base("not-there", "not_there", [])], { asOf });
  const oneTap = buildUserTasteMap([base("tap", "spot_tapped", ["vibe.cozy"])], { asOf });
  const oneOffAffinity = Math.abs(oneTap.rows.find(({ concept, scope }) => concept === "vibe.cozy" && scope.kind === "GLOBAL")?.affinity ?? 0);
  const duplicate = base("duplicate", "saved", ["vibe.cozy"]); const once = buildUserTasteMap([duplicate], { asOf }); const replay = buildUserTasteMap(Array(50).fill(duplicate), { asOf });
  let consentRejected = false; try { buildUserTasteMap([{ ...base("consent", "liked", ["vibe.cozy"]), consent: "missing" }], { asOf }); } catch (error) { consentRejected = /consent/.test(String(error)); }
  const intentHistory = buildUserTasteMap([base("quiet1", "saved", ["vibe.quiet"]), base("quiet2", "positive_post_visit", ["vibe.quiet"])], { asOf });
  const intent = projectCurrentTaste(intentHistory, { explicitIntent: [{ concept: "vibe.quiet", direction: -1 }, { concept: "vibe.lively", direction: 1 }] });
  const authority = intent.rows.every((row) => !["vibe.quiet", "vibe.lively"].includes(row.concept) || row.authority === "EXPLICIT_CURRENT_INTENT")
    && intent.rows.find(({ concept }) => concept === "vibe.quiet").affinity <= -0.75 && intent.rows.find(({ concept }) => concept === "vibe.lively").affinity >= 0.75;
  return { exposureRows: shown.rows.length, oneOffAffinity, idempotentReplay: once.mapHash === replay.mapHash, consentRejected, currentIntentAuthority: authority };
}

export function runNoiseDiagnostic({ seed, count = 50, asOf = "2026-01-01T12:00:00.000Z" }) {
  const random = seededRandom(seed); const concepts = conceptKeys.filter((key) => !key.startsWith("place_type."));
  const events = Array.from({ length: count }, (_, index) => observedEvent({ id: `noise-${seed}-${index}`, userId: `noise-${seed}`, eventType: index % 2 ? "spot_tapped" : "spot_opened",
    concepts: [concepts[Math.floor(random() * concepts.length)]], at: new Date(Date.UTC(2025, 9, 1 + index, 12)).toISOString(), placeType: "cafe", spotId: `noise-spot-${index % 7}`, sessionId: `noise-session-${Math.floor(index / 5)}` }));
  const map = buildUserTasteMap(events, { asOf });
  return { learnedRows: map.rows.filter(({ scope }) => scope.kind === "GLOBAL").length, falsePreferenceRate: map.rows.filter(({ scope, affinity }) => scope.kind === "GLOBAL" && Math.abs(affinity) >= 0.15).length / Math.max(1, conceptKeys.length), maxAffinity: Math.max(0, ...map.rows.map(({ affinity }) => Math.abs(affinity))) };
}

export function evaluatePromotion(metrics, contract) {
  const t = contract.thresholds;
  const gates = {
    diagnosticCoverage: metrics.coverage?.pass === true,
    directionAccuracy: metrics.overall.directionAccuracy >= t.directionAccuracyOverallMinimum && metrics.mature.directionAccuracy >= t.directionAccuracyMatureMinimum,
    affinityAccuracy: metrics.overall.affinityAccuracy >= t.affinityAccuracyOverallMinimum,
    rankCorrelation: metrics.mature.rankCorrelation >= t.rankCorrelationMatureMinimum,
    topPreferenceRecall: metrics.mature.topPreferenceRecall >= t.topPreferenceRecallMatureMinimum,
    falsePreference: metrics.overall.falsePreferenceRate <= t.falsePreferenceRateMaximum,
    negativeLearning: metrics.overall.negativeDirectionAccuracy >= t.negativeDirectionAccuracyMinimum,
    falseNegativeLearning: metrics.overall.falseNegativePreferenceRate <= t.falseNegativePreferenceRateMaximum,
    confidenceCalibration: metrics.confidence.ece <= t.confidenceEceMaximum && metrics.confidence.highConfidenceAccuracy >= t.highConfidenceDirectionAccuracyMinimum,
    contextualTaste: metrics.scoped.contextualDirectionAccuracy >= t.contextualDirectionAccuracyMinimum,
    contextualAdaptation: metrics.scoped.contextualAdaptation >= t.contextualAdaptationMinimum,
    globalRetention: metrics.scoped.globalRetention >= t.globalRetentionMinimum,
    placeTypeTaste: metrics.scoped.placeTypeDirectionAccuracy >= t.placeTypeDirectionAccuracyMinimum,
    currentIntentAuthority: Number(metrics.safety.currentIntentAuthority) >= t.currentIntentAuthorityMinimum,
    driftAdaptation: metrics.drift.directionAccuracy >= t.driftDirectionAccuracyMinimum && metrics.drift.adaptationEvents <= t.driftAdaptationEventsMaximum,
    noiseResistance: metrics.noise.falsePreferenceRate <= t.noiseFalsePreferenceRateMaximum,
    oneOffBounded: metrics.safety.oneOffAffinity <= t.oneOffAbsoluteAffinityMaximum,
    onboardingCorrection: metrics.onboarding.correctionEvents <= t.onboardingCorrectionEventsMaximum && metrics.onboarding.corrected,
    consentPrivacy: Number(metrics.safety.consentRejected) >= t.consentBoundaryMinimum,
    idempotency: Number(metrics.safety.idempotentReplay) >= t.idempotencyMinimum,
    exposureNeutral: metrics.safety.exposureRows === 0
  };
  return { gates, pass: Object.values(gates).every(Boolean), verdict: Object.values(gates).every(Boolean) ? "PASS" : "FAIL" };
}

export function evaluateDiagnosticCoverage(arms, contract) {
  const required = contract.coverageRequirements?.mandatoryArms ?? [];
  const minimum = contract.coverageRequirements?.minimumMeasurementsPerArm ?? 1;
  const rows = required.map((id) => {
    const arm = arms[id];
    const measurements = arm?.measurements ?? 0;
    const executable = arm?.executable === true;
    return { id, present: arm !== undefined, executable, measurements, pass: arm !== undefined && executable && measurements >= minimum };
  });
  const unexpected = Object.keys(arms).filter((id) => !required.includes(id)).sort();
  const missing = rows.filter(({ pass }) => !pass).map(({ id }) => id);
  return { required: required.length, executable: rows.filter(({ pass }) => pass).length, missing, unexpected, rows, coverage: required.length ? rows.filter(({ pass }) => pass).length / required.length : 0,
    pass: contract.coverageRequirements?.failClosed === true && required.length > 0 && missing.length === 0 };
}

export function sealValidationResult(body) { return Object.freeze({ ...body, resultHash: contentHash(body) }); }
