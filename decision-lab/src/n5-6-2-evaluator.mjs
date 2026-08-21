import { performance } from "node:perf_hooks";
import { contentHash } from "./canonical-json.mjs";
import { buildCurrentMoment } from "./n3-moment-intelligence.mjs";
import { N5_6_CONTRACT_HASH, buildCanonicalUserCard, buildCanonicalUserCardIncrementally, verifyUserCardRebuild } from "./n5-6-canonical-user-intelligence.mjs";
import { N5_6_1_PROJECTION_CONTRACT_HASH, N5_6_1_SUFFICIENCY_CONTRACT_HASH, buildMomentAwareRelevantUserProjection } from "./n5-6-1-moment-aware-projection.mjs";
import { N5_6_2_AS_OF, N5_6_2_SEEDS, buildN5_6_2World } from "./n5-6-2-realistic-user-world.mjs";
import { TASTE_SPACE } from "./taste-engine.mjs";

export const N5_6_2_LEARNABLE_TRUTH_VERSION = "backyrd-n5-6-2-learnable-truth-v1";
export const N5_6_2_EVALUATOR_VERSION = "backyrd-n5-6-2-evaluator-v1";
const round = (value) => Number(value.toFixed(6));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const percentile = (values, p) => {
  if (!values.length) return 0;
  const rows = [...values].sort((a, b) => a - b); const at = (rows.length - 1) * p; const low = Math.floor(at); const high = Math.ceil(at);
  return round(rows[low] + (rows[high] - rows[low]) * (at - low));
};
const setDistance = (a, b) => {
  const left = new Set(a); const right = new Set(b); const union = new Set([...left, ...right]);
  return union.size ? 1 - [...left].filter((item) => right.has(item)).length / union.size : 0;
};
const nodeKey = (scope, concept) => `${scope.kind}:${scope.key}:${concept}`;
const sign = (value) => value > 0 ? 1 : value < 0 ? -1 : 0;

export const N5_6_2_LEARNABLE_TRUTH_CONTRACT = Object.freeze({
  version: N5_6_2_LEARNABLE_TRUTH_VERSION,
  independentFromEngineOutput: true,
  observableInputsOnly: ["session outcome", "explicit feedback presence", "commitment provenance", "chosen spot intelligence", "session", "spot", "moment scope"],
  latentTruthUsedOnlyForActionGeneration: true,
  outcomeWeights: { strong_positive: 1, positive: .72, neutral: 0, negative: -.72, strong_negative: -1, unknown: 0 },
  boundedImplicitCommitmentWeight: .13,
  attributionDilution: "ONE_OVER_SQRT_OBSERVABLE_CONCEPTS",
  minimumAttributionConfidence: .35,
  learnableBoundary: { absoluteNetSupport: .34, independentSessions: 2, independentSpots: 2, knownOutcomes: 1 },
  negativeBoundary: { absoluteNegativeSupport: .5, independentNegativeSessions: 2, independentNegativeSpots: 2 },
  strongSingleNegativeNeverDurableAlone: true,
  engineThresholdsNotImported: true
});
export const N5_6_2_LEARNABLE_TRUTH_CONTRACT_HASH = contentHash(N5_6_2_LEARNABLE_TRUTH_CONTRACT);

const MOMENTS = Object.freeze([
  { key: "FAMILY_SUNDAY", query: "Mit den Kindern am Sonntag entspannt etwas machen", explicit: { social_context: "family_with_kids", activity_intent: ["activity"], vibe: ["cozy"], planning_tolerance: "low" }, at: "2026-08-16T13:00:00.000Z", city: "Basel", intent: { preferredPlaceTypes: ["activity"] } },
  { key: "SOLO_AFTERWORK", query: "Alleine nach Feierabend unkompliziert etwas trinken", explicit: { social_context: "solo", occasion: "afterwork", activity_intent: ["drink"], planning_tolerance: "low" }, at: "2026-08-18T17:30:00.000Z", city: "Basel", intent: { requiredPlaceTypes: ["bar"] } },
  { key: "FRIENDS_FRIDAY", query: "Mit Freunden am Freitag etwas trinken", explicit: { social_context: "friends", activity_intent: ["drink"], vibe: ["social"] }, at: "2026-08-14T21:00:00.000Z", city: "Basel", intent: { requiredPlaceTypes: ["bar"] } },
  { key: "DATE_EVENING", query: "Date am Abend, gemütlich essen", explicit: { social_context: "date", activity_intent: ["food"], vibe: ["cozy"] }, at: "2026-08-15T19:00:00.000Z", city: "Basel", intent: { preferredPlaceTypes: ["restaurant"] } },
  { key: "COPENHAGEN_SOLO", query: "Gerade in Kopenhagen, alleine entspannt etwas trinken", explicit: { social_context: "solo", activity_intent: ["drink"], vibe: ["relaxed"] }, at: "2026-08-18T18:00:00.000Z", city: "Copenhagen", timeZone: "Europe/Copenhagen", intent: { preferredPlaceTypes: ["bar"] } },
  { key: "BROAD_UNKNOWN", query: "Was soll ich machen?", explicit: { activity_intent: ["broad"] }, at: "2026-08-18T12:00:00.000Z", city: "Basel", intent: { activityBroad: true } },
  { key: "RESTAURANT_DINNER", query: "Heute Abend essen gehen", explicit: { activity_intent: ["food"] }, at: "2026-08-18T19:00:00.000Z", city: "Basel", intent: { requiredPlaceTypes: ["restaurant"] } },
  { key: "CAFE_AFTERNOON", query: "Nachmittags einen Kaffee", explicit: { activity_intent: ["food"], vibe: ["relaxed"] }, at: "2026-08-18T15:00:00.000Z", city: "Basel", intent: { requiredPlaceTypes: ["cafe"] } },
  { key: "CULTURE_MUSEUM", query: "Heute etwas Kultur oder ein Museum", explicit: { activity_intent: ["culture"], vibe: ["inspiring"] }, at: "2026-08-18T14:00:00.000Z", city: "Basel", intent: { preferredPlaceTypes: ["culture"] } },
  { key: "TRAVEL_BROAD_UNKNOWN", query: "Neu in Berlin, was machen?", explicit: { activity_intent: ["broad"] }, at: "2026-08-18T12:00:00.000Z", city: "Berlin", timeZone: "Europe/Berlin", intent: { activityBroad: true } }
]);

function buildMoment(userId, definition) {
  return buildCurrentMoment({
    decisionId: `n562:${userId}:${definition.key}`, userId,
    request: { requestId: `n562-request:${userId}:${definition.key}`, query: definition.query }, explicit: definition.explicit,
    context: { now: definition.at, timeZone: definition.timeZone ?? "Europe/Zurich", location: { city: definition.city, source: "explicit_selected", id: `city:${definition.city}` } },
    memoryPatterns: [], memoryConsentState: "granted", observedAt: definition.at
  }).currentMoment;
}

function spotIntelligence(world) {
  return Object.fromEntries(world.spots.map((spot) => [spot.id, { spotId: spot.id, concepts: spot.concepts, provenance: "N5_6_2_SYNTHETIC_N4_COMPATIBLE" }]));
}

function observationFor(session, spot) {
  // Evaluator knowledge is bounded by Product observability: the hidden
  // synthetic satisfaction draw is available only when explicit feedback was
  // actually emitted. A verified visit without feedback remains intent, not
  // satisfaction.
  const known = session.explicitFeedback ? N5_6_2_LEARNABLE_TRUTH_CONTRACT.outcomeWeights[session.outcome] ?? 0 : 0;
  const implicit = known === 0 && ["DECISION_COMMIT", "SEARCH_RESERVE", "REPEAT_FAVORITE", "DIRECT_MAP"].includes(session.sessionType) && !session.noise && !session.compromise && !session.logistics
    ? N5_6_2_LEARNABLE_TRUTH_CONTRACT.boundedImplicitCommitmentWeight : 0;
  const direction = known || implicit;
  const concepts = Object.entries(spot.concepts).filter(([, evidence]) => evidence.confidence >= N5_6_2_LEARNABLE_TRUTH_CONTRACT.minimumAttributionConfidence);
  const dilution = 1 / Math.sqrt(Math.max(1, concepts.length));
  return concepts.map(([concept, evidence]) => ({ concept, direction: direction * evidence.confidence * dilution, rawDirection: sign(direction), attributionConfidence: evidence.confidence }));
}

function learnableTruthFor(user, world) {
  const spots = new Map(world.spots.map((spot) => [spot.id, spot]));
  const groups = new Map();
  const add = (scope, observation, session) => {
    const key = nodeKey(scope, observation.concept);
    if (!groups.has(key)) groups.set(key, { key, scope, concept: observation.concept, positive: 0, negative: 0, sessions: new Set(), spots: new Set(), outcomes: new Set(), positiveSessions: new Set(), negativeSessions: new Set(), positiveSpots: new Set(), negativeSpots: new Set(), first: null, last: null });
    const row = groups.get(key); const magnitude = Math.abs(observation.direction);
    if (observation.direction > 0) { row.positive += magnitude; row.positiveSessions.add(session.sessionId); row.positiveSpots.add(session.chosenSpotId); }
    if (observation.direction < 0) { row.negative += magnitude; row.negativeSessions.add(session.sessionId); row.negativeSpots.add(session.chosenSpotId); }
    if (observation.direction !== 0) { row.sessions.add(session.sessionId); row.spots.add(session.chosenSpotId); }
    if (session.explicitFeedback) row.outcomes.add(session.sessionId);
    row.first = !row.first || session.occurredAt < row.first ? session.occurredAt : row.first;
    row.last = !row.last || session.occurredAt > row.last ? session.occurredAt : row.last;
  };
  for (const session of user.sessions) {
    const spot = spots.get(session.chosenSpotId); if (!spot) continue;
    for (const observation of observationFor(session, spot)) {
      add({ kind: "GLOBAL", key: "global" }, observation, session);
      add({ kind: "PLACE_TYPE", key: session.placeType }, observation, session);
      if (session.audience !== "other") add({ kind: "CONTEXT", key: `audience.${session.audience}` }, observation, session);
    }
  }
  const rows = [...groups.values()].map((row) => {
    const net = row.positive - row.negative; const support = row.positive + row.negative;
    const baseLearnable = Math.abs(net) >= N5_6_2_LEARNABLE_TRUTH_CONTRACT.learnableBoundary.absoluteNetSupport && row.sessions.size >= 2 && row.spots.size >= 2 && row.outcomes.size >= 1;
    const negativeLearnable = net < 0 && row.negative >= N5_6_2_LEARNABLE_TRUTH_CONTRACT.negativeBoundary.absoluteNegativeSupport && row.negativeSessions.size >= 2 && row.negativeSpots.size >= 2;
    const learnable = net < 0 ? baseLearnable && negativeLearnable : baseLearnable;
    const confidence = clamp((1 - Math.exp(-support / .75)) * (.45 + .35 * Math.min(1, row.sessions.size / 5) + .2 * Math.min(1, row.spots.size / 4)) * (1 - .4 * (support ? Math.min(row.positive, row.negative) / support : 0)));
    return { key: row.key, scope: row.scope, concept: row.concept, expectedPolarity: learnable ? (net > 0 ? "POSITIVE" : "NEGATIVE") : "UNKNOWN", learnable, netSupport: round(net), positiveSupport: round(row.positive), negativeSupport: round(row.negative), evaluatorConfidence: round(confidence), independentSessions: row.sessions.size, independentSpots: row.spots.size, knownOutcomes: row.outcomes.size, contradictions: row.positive > 0 && row.negative > 0, firstEvidenceAt: row.first, lastEvidenceAt: row.last };
  }).sort((a, b) => a.key.localeCompare(b.key));
  return { version: N5_6_2_LEARNABLE_TRUTH_VERSION, userId: user.id, observableNodeExpectations: rows, learnableHash: contentHash(rows) };
}

function snapshotNorth(user, world, intelligence) {
  const first = new Date(user.events[0].occurredAt).valueOf();
  const definitions = [["WEEK_1", 7], ["MONTH_1", 30], ["MONTH_3", 90], ["MONTH_6", 180], ["YEAR_1", 365], ["YEAR_2", 730], ["YEAR_3", 1095]];
  return definitions.map(([stage, days]) => {
    const cutoff = new Date(Math.min(new Date(N5_6_2_AS_OF).valueOf(), first + days * 86_400_000)).toISOString();
    const events = user.events.filter(({ occurredAt }) => occurredAt <= cutoff);
    const built = buildCanonicalUserCard(events, { asOf: cutoff, spotIntelligence: intelligence });
    const nodes = built.userCard.nodes;
    const body = { stage, cutoff, eventCount: events.length, sessionCount: new Set(events.map(({ sessionId }) => sessionId).filter(Boolean)).size, spotCount: new Set(events.map(({ spotId }) => spotId).filter(Boolean)).size, outcomeCount: built.userCard.maturity.outcomeChains, maturity: built.userCard.maturity, knownNodes: nodes.filter(({ polarity }) => polarity !== "UNKNOWN").length, highConfidenceNodes: nodes.filter(({ confidence }) => confidence >= .8).length, mediumConfidenceNodes: nodes.filter(({ confidence }) => confidence >= .4 && confidence < .8).length, lowConfidenceNodes: nodes.filter(({ confidence }) => confidence < .4).length, negativeNodes: nodes.filter(({ polarity }) => polarity === "NEGATIVE").length, unknownAreas: built.userCard.uncertainty.unknownConceptCount, contextSlices: new Set(nodes.filter(({ scope }) => scope.kind === "CONTEXT").map(({ scope }) => scope.key)).size, placeTypeSlices: new Set(nodes.filter(({ scope }) => scope.kind === "PLACE_TYPE").map(({ scope }) => scope.key)).size, patterns: built.userCard.occasionPatterns.length, contradictions: built.userCard.contradictions.length, driftingNodes: nodes.filter(({ trend }) => trend !== "STABLE").length, userCardHash: built.userCard.userCardHash };
    return { ...body, snapshotHash: contentHash(body) };
  });
}

function projectionRows(profile) {
  return MOMENTS.map((definition) => {
    const currentMoment = buildMoment(profile.user.id, definition);
    const projection = buildMomentAwareRelevantUserProjection({ userCard: profile.userCard, currentMoment, currentIntent: definition.intent });
    return { userId: profile.user.id, momentKey: definition.key, city: definition.city, currentIntent: definition.intent, currentMoment, projection };
  });
}

function ablationsFor(user, intelligence, fullCard) {
  const arms = {
    WITHOUT_EXPLICIT_FEEDBACK: (event) => !["positive_post_visit", "negative_post_visit", "explicit_positive", "explicit_negative", "exact_mood_feedback"].includes(event.eventType),
    WITHOUT_CONFIRMED_VISITS: (event) => event.eventType !== "verified_visit",
    WITHOUT_SAVES: (event) => event.eventType !== "saved",
    WITHOUT_NAVIGATION: (event) => event.eventType !== "navigation_intent",
    WITHOUT_ONBOARDING: (event) => event.eventType !== "onboarding_preference"
  };
  const known = (card) => new Set(card.nodes.filter(({ polarity }) => polarity !== "UNKNOWN").map(({ nodeKey }) => nodeKey));
  const full = known(fullCard);
  return Object.entries(arms).map(([arm, keep]) => {
    const events = user.events.filter(keep);
    const card = buildCanonicalUserCard(events, { asOf: N5_6_2_AS_OF, spotIntelligence: intelligence }).userCard;
    const rows = known(card); const retained = [...full].filter((key) => rows.has(key)).length / Math.max(1, full.size);
    return { arm, eventCount: events.length, knownNodes: rows.size, retainedKnownNodeRate: round(retained), maturity: card.maturity, userCardHash: card.userCardHash };
  });
}

function diagnostics(world) {
  const sessions = world.users.flatMap(({ sessions }) => sessions);
  const outcomes = sessions.reduce((map, row) => ({ ...map, [row.outcome]: (map[row.outcome] ?? 0) + 1 }), {});
  const types = sessions.reduce((map, row) => ({ ...map, [row.sessionType]: (map[row.sessionType] ?? 0) + 1 }), {});
  const audiences = sessions.reduce((map, row) => ({ ...map, [row.audience]: (map[row.audience] ?? 0) + 1 }), {});
  const places = sessions.reduce((map, row) => ({ ...map, [row.placeType]: (map[row.placeType] ?? 0) + 1 }), {});
  const bundles = world.spots.map((spot) => Object.keys(spot.concepts).sort().join("|"));
  const bundleCounts = bundles.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map());
  const pair = new Map(); const conceptCount = new Map();
  for (const spot of world.spots) {
    const concepts = Object.keys(spot.concepts).filter((key) => spot.concepts[key].confidence >= .35);
    for (const concept of concepts) conceptCount.set(concept, (conceptCount.get(concept) ?? 0) + 1);
    for (let a = 0; a < concepts.length; a += 1) for (let b = a + 1; b < concepts.length; b += 1) {
      const key = [concepts[a], concepts[b]].sort().join("|"); pair.set(key, (pair.get(key) ?? 0) + 1);
    }
  }
  const strongestPairs = [...pair].map(([key, count]) => { const [a, b] = key.split("|"); return { concepts: [a, b], count, conditionalRate: round(count / Math.max(1, Math.min(conceptCount.get(a), conceptCount.get(b)))) }; }).sort((a, b) => b.conditionalRate - a.conditionalRate || b.count - a.count).slice(0, 12);
  const total = sessions.length;
  const explicit = sessions.filter(({ explicitFeedback }) => explicitFeedback).length;
  const times = world.users.map((user) => {
    const rows = user.sessions.map(({ occurredAt }) => new Date(occurredAt).valueOf()).sort((a, b) => a - b);
    const gaps = rows.slice(1).map((value, index) => (value - rows[index]) / 86_400_000);
    return { userId: user.id, min: round(Math.min(...gaps, 0)), median: percentile(gaps, .5), max: round(Math.max(...gaps, 0)), zeroUseGapOver30Days: gaps.filter((gap) => gap >= 30).length };
  });
  return {
    population: world.users.length, sessions: total, events: world.users.reduce((sum, user) => sum + user.events.length, 0), sessionTypes: types, outcomes, audiences, placeTypes: places,
    missingOutcomeRate: round((outcomes.unknown ?? 0) / total), explicitFeedbackRate: round(explicit / total), implicitEvidenceRate: round(1 - explicit / total),
    noiseRate: round(sessions.filter(({ noise }) => noise).length / total), compromiseRate: round(sessions.filter(({ compromise }) => compromise).length / total), logisticsRate: round(sessions.filter(({ logistics }) => logistics).length / total), travelRate: round(sessions.filter(({ travel }) => travel).length / total),
    repeatRate: round(sessions.filter(({ knownSpotRepeat }) => knownSpotRepeat).length / total), exactSpotBundleShare: round(Math.max(...bundleCounts.values()) / world.spots.length), strongestConceptPairs: strongestPairs,
    spotCount: world.spots.length, spotPlaceTypes: Object.fromEntries(Object.keys(places).map((key) => [key, world.spots.filter(({ placeType }) => placeType === key).length])), spotConceptCount: { min: Math.min(...world.spots.map((spot) => Object.keys(spot.concepts).length)), median: percentile(world.spots.map((spot) => Object.keys(spot.concepts).length), .5), max: Math.max(...world.spots.map((spot) => Object.keys(spot.concepts).length)) }, usageGaps: times
  };
}

function confidenceDistribution(profiles) {
  const rows = profiles.flatMap(({ userCard }) => userCard.nodes.map(({ confidence, scope }) => ({ confidence, scope: scope.kind })));
  const values = rows.map(({ confidence }) => confidence);
  const distribution = (input) => ({ min: percentile(input, 0), p10: percentile(input, .1), p25: percentile(input, .25), median: percentile(input, .5), p75: percentile(input, .75), p90: percentile(input, .9), p95: percentile(input, .95), max: percentile(input, 1) });
  return { all: distribution(values), byScope: Object.fromEntries(["GLOBAL", "PLACE_TYPE", "CONTEXT"].map((scope) => [scope, distribution(rows.filter((row) => row.scope === scope).map(({ confidence }) => confidence))])), nearMaximumShare: round(values.filter((value) => value > .99).length / Math.max(1, values.length)), interquartileRange: round(percentile(values, .75) - percentile(values, .25)) };
}

function evaluateLearning(world, profiles, learnableTruth) {
  let tp = 0; let fp = 0; let fn = 0; let negativeTp = 0; let negativeFp = 0; let negativeFn = 0; let contextTp = 0; let contextTotal = 0; let placeTp = 0; let placeTotal = 0;
  let unknownCorrect = 0; let unknownTotal = 0; let highWrong = 0; let highTotal = 0; const brier = []; const calibration = []; const falsePreferences = []; const missedPreferences = [];
  for (const profile of profiles) {
    const expectedRows = learnableTruth.find(({ userId }) => userId === profile.user.id).observableNodeExpectations;
    const expected = new Map(expectedRows.map((row) => [row.key, row]));
    const learned = new Map(profile.userCard.nodes.map((row) => [row.nodeKey, row]));
    for (const row of profile.userCard.nodes) {
      const truth = expected.get(row.nodeKey); const known = row.polarity === "POSITIVE" || row.polarity === "NEGATIVE";
      if (!known) continue;
      const correct = Boolean(truth?.learnable && truth.expectedPolarity === row.polarity);
      if (correct) tp += 1; else { fp += 1; falsePreferences.push({ userId: profile.user.id, nodeKey: row.nodeKey, learnedPolarity: row.polarity, confidence: row.confidence, classification: !truth?.learnable ? "WEAK_EVIDENCE_PROMOTION" : row.scope.kind === "GLOBAL" ? "OVERGENERALIZED_GLOBAL" : row.scope.kind === "CONTEXT" ? "WRONG_CONTEXT_TRANSFER" : "WRONG_PLACE_TYPE_TRANSFER" }); }
      if (row.polarity === "NEGATIVE") { if (correct) negativeTp += 1; else negativeFp += 1; }
      if (row.scope.kind === "CONTEXT") { contextTotal += 1; if (correct) contextTp += 1; }
      if (row.scope.kind === "PLACE_TYPE") { placeTotal += 1; if (correct) placeTp += 1; }
      const target = correct ? 1 : 0; brier.push((row.confidence - target) ** 2); calibration.push({ confidence: row.confidence, target });
      if (row.confidence >= .8) { highTotal += 1; if (!correct) highWrong += 1; }
    }
    for (const truth of expectedRows.filter(({ learnable }) => learnable)) {
      const row = learned.get(truth.key); const correct = row && row.polarity === truth.expectedPolarity;
      if (!correct) { fn += 1; missedPreferences.push({ userId: profile.user.id, nodeKey: truth.key, expectedPolarity: truth.expectedPolarity, classification: row?.polarity === "UNKNOWN" ? "OVER_CONSERVATIVE_CONFIDENCE" : row ? "ATTRIBUTION_DILUTION" : "INSUFFICIENT_ACCUMULATION" }); }
      if (truth.expectedPolarity === "NEGATIVE" && !correct) negativeFn += 1;
    }
    for (const truth of expectedRows.filter(({ learnable }) => !learnable)) {
      unknownTotal += 1; const row = learned.get(truth.key); if (!row || row.polarity === "UNKNOWN") unknownCorrect += 1;
    }
  }
  const bins = Array.from({ length: 5 }, (_, index) => calibration.filter(({ confidence }) => Math.min(4, Math.floor(confidence * 5)) === index));
  const ece = bins.reduce((sum, rows) => sum + rows.length / Math.max(1, calibration.length) * Math.abs(average(rows.map(({ confidence }) => confidence)) - average(rows.map(({ target }) => target))), 0);
  return {
    metrics: {
      signedPreferencePrecision: round(tp / Math.max(1, tp + fp)), signedPreferenceRecall: round(tp / Math.max(1, tp + fn)),
      negativePreferencePrecision: round(negativeTp / Math.max(1, negativeTp + negativeFp)), negativePreferenceRecall: round(negativeTp / Math.max(1, negativeTp + negativeFn)),
      falsePreferenceControl: round(1 - fp / Math.max(1, tp + fp)), contextAccuracy: round(contextTp / Math.max(1, contextTotal)), placeTypeAccuracy: round(placeTp / Math.max(1, placeTotal)),
      unknownHonesty: round(unknownCorrect / Math.max(1, unknownTotal)), highConfidenceErrorControl: round(1 - highWrong / Math.max(1, highTotal)), highConfidenceErrorRate: round(highWrong / Math.max(1, highTotal)),
      confidenceCalibrationScore: round(1 - average(brier)), confidenceBrier: round(average(brier)), confidenceEce: round(ece), learnableTruthAccuracy: round((tp + unknownCorrect) / Math.max(1, tp + fp + fn + unknownTotal))
    },
    counts: { truePositive: tp, falsePositive: fp, falseNegative: fn, negativeTruePositive: negativeTp, negativeFalsePositive: negativeFp, negativeFalseNegative: negativeFn, highConfidenceNodes: highTotal, highConfidenceWrong: highWrong },
    falsePreferences, missedPreferences
  };
}

function robustness(world, profiles, intelligence) {
  const byUser = new Map(profiles.map((row) => [row.user.id, row]));
  const noiseChecks = []; const incremental = []; const replay = []; const attribution = []; const exposure = [];
  for (const user of world.users) {
    const full = byUser.get(user.id).userCard;
    const withoutNoise = buildCanonicalUserCard(user.events.filter((event) => !event.provenance.source.includes("low_value")), { asOf: N5_6_2_AS_OF, spotIntelligence: intelligence }).userCard;
    const fullKnown = full.nodes.filter(({ polarity }) => polarity !== "UNKNOWN").map(({ nodeKey, polarity }) => `${nodeKey}:${polarity}`);
    const quietKnown = withoutNoise.nodes.filter(({ polarity }) => polarity !== "UNKNOWN").map(({ nodeKey, polarity }) => `${nodeKey}:${polarity}`);
    noiseChecks.push(setDistance(fullKnown, quietKnown) <= .05);
    const middle = Math.ceil(user.events.length / 2);
    incremental.push(buildCanonicalUserCardIncrementally([user.events.slice(0, middle), user.events.slice(middle)], { asOf: N5_6_2_AS_OF, spotIntelligence: intelligence }).userCard.userCardHash === full.userCardHash);
    replay.push(verifyUserCardRebuild(user.events, { asOf: N5_6_2_AS_OF, spotIntelligence: intelligence }).pass);
    for (const node of full.nodes) for (const ref of node.evidenceRefs) {
      const event = user.events.find(({ id }) => id === ref.eventId); attribution.push(Boolean(event?.spotEvidence.concepts.includes(node.concept)));
      exposure.push(!["decision_results_shown", "candidate_exposed"].includes(event?.eventType));
    }
  }
  return { noiseResistance: round(noiseChecks.filter(Boolean).length / noiseChecks.length), incrementalFullEquivalence: incremental.every(Boolean) ? 1 : 0, replayDeterminism: replay.every(Boolean) ? 1 : 0, conceptAttribution: round(attribution.filter(Boolean).length / Math.max(1, attribution.length)), exposureBiasControl: round(exposure.filter(Boolean).length / Math.max(1, exposure.length)), sessionIndependence: profiles.every(({ userCard }) => userCard.nodes.every(({ evidenceDepth }) => evidenceDepth.independentSessions <= userCard.memorySummary.independentSessions)) ? 1 : 0 };
}

function projectionMetrics(profiles, projections) {
  const contextLeak = projections.every(({ projection }) => projection.taste.every((row) => row.scope.kind !== "CONTEXT" || projection.moment.applicableContexts.includes(row.scope.key))) ? 1 : 0;
  const placeLeak = projections.every(({ projection }) => projection.taste.every((row) => row.scope.kind !== "PLACE_TYPE" || projection.moment.applicablePlaceTypes.includes(row.scope.key))) ? 1 : 0;
  const broad = projections.filter(({ momentKey }) => ["BROAD_UNKNOWN", "TRAVEL_BROAD_UNKNOWN"].includes(momentKey));
  const unsupported = projections.filter(({ projection }) => projection.knowledgeSufficiency.contextKnowledge === 0 && projection.moment.socialContext);
  const ratios = projections.map(({ userId, projection }) => projection.taste.length / Math.max(1, profiles.find(({ user }) => user.id === userId).userCard.nodes.length));
  const same = [];
  for (const profile of profiles.filter(({ userCard }) => ["KNOWN", "WELL_KNOWN", "DEEP"].includes(userCard.maturity.state))) {
    const rows = projections.filter(({ userId, momentKey }) => userId === profile.user.id && ["FAMILY_SUNDAY", "SOLO_AFTERWORK", "FRIENDS_FRIDAY", "DATE_EVENING"].includes(momentKey));
    for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1) same.push(setDistance(rows[a].projection.taste.map(({ concept, polarity }) => `${concept}:${polarity}`), rows[b].projection.taste.map(({ concept, polarity }) => `${concept}:${polarity}`)));
  }
  const different = [];
  for (const key of ["FRIENDS_FRIDAY", "DATE_EVENING"]) {
    const rows = projections.filter(({ momentKey, userId }) => momentKey === key && ["KNOWN", "WELL_KNOWN", "DEEP"].includes(profiles.find(({ user }) => user.id === userId).userCard.maturity.state));
    for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1) different.push(setDistance(rows[a].projection.taste.map(({ concept, polarity }) => `${concept}:${polarity}`), rows[b].projection.taste.map(({ concept, polarity }) => `${concept}:${polarity}`)));
  }
  return { contextLeakageControl: contextLeak, placeTypeLeakageControl: placeLeak, currentIntentAuthority: projections.every(({ projection }) => projection.authority.currentIntent === "AUTHORITATIVE") ? 1 : 0, profileDumpControl: round(ratios.filter((ratio) => ratio <= .2).length / ratios.length), broadMomentUncertainty: broad.every(({ projection }) => ["LOW", "UNKNOWN"].includes(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level)) ? 1 : 0, unsupportedContextHonesty: round(unsupported.filter(({ projection }) => ["LOW", "PARTIAL", "UNKNOWN"].includes(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level)).length / Math.max(1, unsupported.length)), crossCityPortability: projections.filter(({ city }) => city !== "Basel").every(({ projection }) => !JSON.stringify(projection).includes(":spot:")) ? 1 : 0, sameUserDifferentMoment: round(average(same)), differentUsersSameMoment: round(average(different)), coldDevelopingCalibration: round(projections.filter(({ userId }) => ["n562-user-cold", "n562-user-developing", "n562-user-heavy-new", "n562-user-long-light"].includes(userId)).filter(({ projection }) => projection.knowledgeSufficiency.finalPersonalizationSufficiency.level !== "HIGH").length / Math.max(1, projections.filter(({ userId }) => ["n562-user-cold", "n562-user-developing", "n562-user-heavy-new", "n562-user-long-light"].includes(userId)).length)) };
}

function futureInventory(profiles, projections) {
  const keys = ["FRIENDS_FRIDAY", "DATE_EVENING", "BROAD_UNKNOWN"];
  return profiles.flatMap((profile) => keys.map((momentKey) => {
    const row = projections.find(({ userId, momentKey: key }) => userId === profile.user.id && key === momentKey);
    const independent = row.projection.taste.filter(({ signalType }) => signalType === "INDEPENDENT_PERSONALIZATION_SIGNAL");
    const negatives = independent.filter(({ polarity }) => polarity === "NEGATIVE");
    const sufficiency = row.projection.knowledgeSufficiency.finalPersonalizationSufficiency.level;
    const opportunity = independent.length >= 3 && ["PARTIAL", "HIGH"].includes(sufficiency) ? "HIGH" : independent.length >= 1 ? "MEDIUM" : "LOW";
    return { scenarioId: `n562-future:${profile.user.id}:${momentKey}`, userId: profile.user.id, lifecycle: profile.userCard.maturity.state, momentKey, knowledgeSufficiency: sufficiency, independentPersonalizationSignals: independent.map(({ concept, polarity, confidence, scope }) => ({ concept, polarity, confidence, scope })), relevantNegatives: negatives.map(({ concept }) => concept), driftRelevant: independent.some(({ trend }) => trend !== "STABLE"), noveltyRepeatRelevant: independent.some(({ concept }) => concept.startsWith("discovery.")), crossCity: row.city !== "Basel", opportunity };
  }));
}

export function buildN5_6_2SeedTreatment(seed) {
  const started = performance.now(); const world = buildN5_6_2World(seed); const intelligence = spotIntelligence(world);
  const profiles = world.users.map((user) => {
    const built = buildCanonicalUserCard(user.events, { asOf: N5_6_2_AS_OF, spotIntelligence: intelligence });
    return { user: { id: user.id, cohort: user.cohort, homeCity: user.homeCity, accountMonths: user.accountMonths }, userCard: built.userCard, evidenceChains: built.evidenceChains, changeLedger: built.changeLedger };
  });
  const learnableTruth = world.users.map((user) => learnableTruthFor(user, world));
  const projections = profiles.flatMap(projectionRows);
  const learning = evaluateLearning(world, profiles, learnableTruth);
  const robust = robustness(world, profiles, intelligence);
  const projection = projectionMetrics(profiles, projections);
  const confidence = confidenceDistribution(profiles);
  const northUser = world.users.find(({ id }) => id === "NORTH_STAR_REALISTIC_01");
  const northProfile = profiles.find(({ user }) => user.id === northUser.id);
  const snapshots = snapshotNorth(northUser, world, intelligence);
  const ablations = ablationsFor(northUser, intelligence, northProfile.userCard);
  const futureScenarios = futureInventory(profiles, projections);
  const driftUsers = world.evaluatorOnly.filter(({ drift }) => drift);
  const driftAdaptation = round(driftUsers.filter(({ id, drift }) => {
    const node = profiles.find(({ user }) => user.id === id).userCard.nodes.find(({ nodeKey }) => nodeKey === `GLOBAL:global:${drift.concept}`);
    return node && (drift.end < drift.start ? node.trend === "FADING_OR_REVERSING" : node.trend === "RISING");
  }).length / Math.max(1, driftUsers.length));
  const temporaryPhaseResilience = round(world.evaluatorOnly.filter(({ temporaryPhase }) => temporaryPhase).filter(({ id, temporaryPhase }) => {
    const node = profiles.find(({ user }) => user.id === id).userCard.nodes.find(({ nodeKey }) => nodeKey === `GLOBAL:global:${temporaryPhase.concept}`);
    return !node || node.confidence < .8 || node.trend === "FADING_OR_REVERSING";
  }).length / Math.max(1, world.evaluatorOnly.filter(({ temporaryPhase }) => temporaryPhase).length));
  const contradictionUsers = profiles.filter(({ user }) => user.cohort === "LONG_TERM");
  const contradictionRobustness = round(contradictionUsers.filter(({ userCard }) => userCard.contradictions.length > 0).length / contradictionUsers.length);
  const maturity = { coldSparsity: profiles.filter(({ user }) => ["COLD", "LIGHT"].includes(user.cohort)).every(({ userCard }) => ["COLD", "EARLY", "DEVELOPING"].includes(userCard.maturity.state)) ? 1 : 0, earlyConservatism: snapshots[0].maturity.state !== "WELL_KNOWN" && snapshots[0].maturity.state !== "DEEP" ? 1 : 0, developingPartialKnowledge: round(profiles.filter(({ user }) => user.cohort === "DEVELOPING").filter(({ userCard }) => ["DEVELOPING", "KNOWN", "WELL_KNOWN"].includes(userCard.maturity.state)).length / Math.max(1, profiles.filter(({ user }) => user.cohort === "DEVELOPING").length)), evidenceBasedMaturity: profiles.every(({ user, userCard }) => user.accountMonths < 6 || userCard.maturity.state !== "DEEP" || userCard.maturity.outcomeChains >= 45) ? 1 : 0, knowledgeGapsAtDepth: profiles.filter(({ userCard }) => ["WELL_KNOWN", "DEEP"].includes(userCard.maturity.state)).every(({ userCard }) => userCard.uncertainty.unknownConceptCount > 0) ? 1 : 0, temporaryPhaseResilience };
  const metrics = { ...learning.metrics, ...robust, ...projection, ...maturity, contradictionRobustness, driftAdaptation };
  const body = { seed, worldHash: world.worldHash, profilesHash: contentHash(profiles.map(({ userCard }) => userCard.userCardHash)), learnableTruthHash: contentHash(learnableTruth), projectionsHash: contentHash(projections.map(({ projection }) => projection.projectionHash)), metrics };
  return { ...body, world, profiles, learnableTruth, projections, diagnostics: diagnostics(world), confidence, learning, snapshots, ablations, futureScenarios, durationMs: round(performance.now() - started), treatmentHash: contentHash(body) };
}

export function buildN5_6_2Treatments() { return N5_6_2_SEEDS.map(buildN5_6_2SeedTreatment); }

export const N5_6_2_EVALUATOR_IDENTITIES = Object.freeze({ evaluatorVersion: N5_6_2_EVALUATOR_VERSION, learnableTruthContractHash: N5_6_2_LEARNABLE_TRUTH_CONTRACT_HASH, engineContractHash: N5_6_CONTRACT_HASH, projectionContractHash: N5_6_1_PROJECTION_CONTRACT_HASH, sufficiencyContractHash: N5_6_1_SUFFICIENCY_CONTRACT_HASH, tasteConceptCount: TASTE_SPACE.length });
