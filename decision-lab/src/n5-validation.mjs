import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { N2_VERSIONS } from "./n2-memory-user-intelligence.mjs";
import { buildCurrentMoment } from "./n3-moment-intelligence.mjs";
import { TASTE_ENGINE_VERSIONS, TASTE_SPACE } from "./taste-engine.mjs";
import { N5_CONTRACT_HASH, N5_LIMITS, buildRelevantUserProjection, validateN5ScientificBoundary } from "./n5-relevant-user-projection.mjs";

const root = new URL("../", import.meta.url);
const contractUrl = new URL("config/n5-relevant-user-projection-validation-v1.json", root);
const baselineUrl = new URL("baselines/n5-relevant-user-projection-v1.json", root);
const NOW = "2026-08-18T12:00:00.000Z";
const clamp = (value) => Math.max(0, Math.min(1, value));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

function taste(concept, scope = { kind: "GLOBAL", key: "global" }, options = {}) {
  return {
    concept, family: concept.split(".")[0], scope, affinity: options.affinity ?? 0.72, confidence: options.confidence ?? 0.82,
    positiveEvidence: 1.8, negativeEvidence: options.negativeEvidence ?? 0, positiveEventCount: options.positiveEventCount ?? 6,
    negativeEventCount: options.negativeEventCount ?? 0, distinctSpotCount: 4, distinctSessionCount: 5,
    sourceFamilies: options.sourceFamilies ?? ["outcome"], firstEvidenceAt: "2026-01-01T12:00:00.000Z",
    lastUpdatedAt: options.lastUpdatedAt ?? "2026-08-10T12:00:00.000Z", decayState: options.decayState ?? "CURRENT",
    engineVersion: TASTE_ENGINE_VERSIONS.learningEngine
  };
}
function pattern(key, signature, options = {}) {
  return {
    patternKey: key, contextSignature: signature, state: options.state ?? "KNOWN", confidence: options.confidence ?? 0.82,
    outcomeSupportCount: 4, recencyState: options.recencyState ?? "CURRENT", version: N2_VERSIONS.behavioralPatternContract
  };
}
function profile(userId = "user-n5", options = {}) {
  const rows = options.rows ?? [
    taste("vibe.cozy"), taste("character.authentic_character"), taste("discovery.hidden_gem"), taste("novelty.novel"),
    taste("social_style.family_friendly", { kind: "CONTEXT", key: "audience.family" }),
    taste("vibe.lively", { kind: "CONTEXT", key: "audience.friends" }), taste("social_style.social", { kind: "CONTEXT", key: "audience.friends" }),
    taste("social_style.romantic_friendly", { kind: "CONTEXT", key: "audience.date" }),
    taste("price.budget", { kind: "PLACE_TYPE", key: "bar" }), taste("character.design_led", { kind: "PLACE_TYPE", key: "restaurant" }),
    taste("vibe.quiet", { kind: "CONTEXT", key: "audience.work" })
  ];
  const body = {
    userId, asOf: NOW, queryCity: options.queryCity ?? "Basel", knowledgeState: options.knowledgeState ?? "MATURE", consentState: "granted",
    memorySummary: { eventCount: options.eventCount ?? 1000, activeEventCount: options.eventCount ?? 1000, qualifiedEventCount: 80, independentSessionCount: 35, eventFamilies: ["outcome"] },
    tasteMap: { userId, asOf: NOW, rows, unknownConcepts: TASTE_SPACE.map(({ key }) => key).filter((key) => !rows.some((row) => row.concept === key)), versions: TASTE_ENGINE_VERSIONS },
    patterns: options.patterns ?? [
      pattern("family-weekend", { audience: "family", daypart: "afternoon", calendar: "weekend", placeType: "activity" }),
      pattern("friends-friday", { audience: "friends", daypart: "night", calendar: "weekday", placeType: "bar" }),
      pattern("solo-afterwork", { audience: "solo", daypart: "evening", calendar: "weekday", occasion: "afterwork", placeType: "bar" })
    ],
    contradictions: options.contradictions ?? [], timeline: options.timeline ?? [], graph: {}, versions: N2_VERSIONS,
    boundaries: { relevantUserProjection: "N5_NOT_IMPLEMENTED", cityIndependentTruth: true }
  };
  return Object.freeze({ ...body, intelligenceHash: contentHash(body) });
}
function coldProfile(userId = "user-n5") { return profile(userId, { knowledgeState: "COLD", eventCount: 0, rows: [], patterns: [] }); }
function moment(userId, query, explicit, now = "2026-08-16T13:00:00.000Z", city = "Basel") {
  return buildCurrentMoment({
    decisionId: `decision-${contentHash({ userId, query, now }).slice(0, 10)}`, userId,
    request: { requestId: `request-${userId}`, query }, explicit,
    context: { now, timeZone: "Europe/Zurich", location: { city, source: "explicit_selected", id: `city-${city}` } },
    memoryPatterns: [], memoryConsentState: "granted", observedAt: now
  }).currentMoment;
}
function project(userIntelligence, currentMoment, currentIntent = {}) {
  return buildRelevantUserProjection({ userIntelligence, currentMoment, currentIntent }).projection;
}

function scenario(name, seed) {
  const userId = `user-${seed}`; const base = profile(userId);
  if (name === "FAMILY_SUNDAY") {
    const result = project(base, moment(userId, "Mit Kids gemütlich", { social_context: "family_with_kids", vibe: ["cozy"] }), { preferredPlaceTypes: ["activity"] });
    return { name, result, expectedRelevant: ["social_style.family_friendly", "vibe.cozy"], expectedSuppressed: ["vibe.lively", "social_style.romantic_friendly", "vibe.quiet"], sufficiency: ["MEDIUM", "HIGH"] };
  }
  if (name === "FRIENDS_FRIDAY") {
    const result = project(base, moment(userId, "Mit Freunden laut und lebendig", { social_context: "friends", vibe: ["lively", "social"] }, "2026-08-14T21:30:00.000Z"), { requiredPlaceTypes: ["bar"], conceptDirections: [{ concept: "vibe.lively", direction: 1 }] });
    return { name, result, expectedRelevant: ["vibe.lively", "social_style.social", "price.budget"], expectedSuppressed: ["social_style.family_friendly", "social_style.romantic_friendly", "vibe.quiet"], sufficiency: ["HIGH"] };
  }
  if (name === "DATE_BUDGET") {
    const result = project(base, moment(userId, "Date gemütlich low budget", { social_context: "date", vibe: ["romantic", "cozy"], budget_orientation: "budget" }, "2026-08-15T18:30:00.000Z"), { preferredPlaceTypes: ["bar"], conceptDirections: [{ concept: "price.budget", direction: 1 }] });
    return { name, result, expectedRelevant: ["social_style.romantic_friendly", "vibe.cozy", "price.budget"], expectedSuppressed: ["social_style.family_friendly", "vibe.lively", "vibe.quiet"], sufficiency: ["HIGH"] };
  }
  if (name === "MATCHING_OCCASION_PATTERN") {
    const result = project(base, moment(userId, "Alleine nach Feierabend etwas trinken", { social_context: "solo", occasion: "afterwork", activity_intent: ["drink"] }, "2026-08-18T17:30:00.000Z"), { requiredPlaceTypes: ["bar"] });
    return { name, result, expectedRelevant: ["price.budget"], expectedSuppressed: ["social_style.family_friendly", "vibe.lively"], expectedPattern: "solo-afterwork", sufficiency: ["HIGH", "MEDIUM"] };
  }
  if (name === "CURRENT_INTENT_CONFLICT") {
    const rows = [...base.tasteMap.rows, taste("vibe.quiet")]; const result = project(profile(userId, { rows }), moment(userId, "Heute laut und lebendig", { social_context: "friends", vibe: ["lively"] }, "2026-08-14T21:30:00.000Z"), { requiredPlaceTypes: ["bar"], conceptDirections: [{ concept: "vibe.lively", direction: 1 }, { concept: "vibe.quiet", direction: -1 }] });
    return { name, result, expectedRelevant: ["vibe.lively", "social_style.social", "price.budget"], expectedSuppressed: ["vibe.quiet"], intentConflict: "vibe.quiet", sufficiency: ["HIGH"] };
  }
  if (name === "CROSS_CITY") {
    const cph = moment(userId, "Gerade angekommen, zwei Stunden rumlaufen und entspannt trinken", { social_context: "solo", activity_intent: ["walk", "drink"], vibe: ["relaxed"], duration: "one_to_two_hours" }, "2026-08-18T12:00:00.000Z", "Copenhagen");
    const result = project(base, cph, { preferredPlaceTypes: ["bar"] });
    return { name, result, expectedRelevant: ["vibe.cozy", "price.budget"], expectedSuppressed: ["social_style.family_friendly", "vibe.lively"], crossCity: true, sufficiency: ["MEDIUM", "HIGH"] };
  }
  if (name === "FIRST_CULTURE_REQUEST") {
    const sparse = profile(userId, { rows: [taste("character.authentic_character"), taste("discovery.hidden_gem")] });
    const result = project(sparse, moment(userId, "Erster Opernbesuch", { activity_intent: ["culture"] }), { requiredPlaceTypes: ["culture"] });
    return { name, result, expectedRelevant: ["character.authentic_character", "discovery.hidden_gem"], expectedSuppressed: [], sufficiency: ["LOW"], unknownHere: true };
  }
  if (name === "BROAD_MULTI_CATEGORY") {
    const result = project(base, moment(userId, "Irgendwas cooles", { activity_intent: ["broad"] }), { activityBroad: true });
    return { name, result, expectedRelevant: ["character.authentic_character", "discovery.hidden_gem", "novelty.novel", "vibe.cozy"], expectedSuppressed: ["price.budget", "character.design_led", "vibe.lively"], sufficiency: ["MEDIUM", "LOW"] };
  }
  if (name === "HUGE_MATURE_PROFILE") {
    const irrelevant = Array.from({ length: 120 }, (_, index) => taste(index % 2 ? "vibe.lively" : "vibe.quiet", { kind: "CONTEXT", key: index % 2 ? "audience.friends" : "audience.work" }, { lastUpdatedAt: `2026-07-${String(index % 28 + 1).padStart(2, "0")}T12:00:00.000Z` }));
    const huge = profile(userId, { eventCount: 10000, rows: [...base.tasteMap.rows, ...irrelevant] });
    const result = project(huge, moment(userId, "Mit Kids gemütlich", { social_context: "family_with_kids", vibe: ["cozy"] }), { preferredPlaceTypes: ["activity"] });
    return { name, result, expectedRelevant: ["social_style.family_friendly", "vibe.cozy"], expectedSuppressed: ["vibe.lively", "vibe.quiet"], sufficiency: ["MEDIUM", "HIGH"] };
  }
  if (name === "DIFFERENT_USER_SAME_MOMENT") {
    const hidden = profile(`${userId}-a`, { rows: [taste("discovery.hidden_gem"), taste("character.authentic_character")] });
    const mainstream = profile(`${userId}-b`, { rows: [taste("discovery.mainstream"), taste("convenience.easy_access")] });
    const a = project(hidden, moment(`${userId}-a`, "Gemütlich etwas trinken", { vibe: ["cozy"], activity_intent: ["drink"] }), { preferredPlaceTypes: ["bar"] });
    const b = project(mainstream, moment(`${userId}-b`, "Gemütlich etwas trinken", { vibe: ["cozy"], activity_intent: ["drink"] }), { preferredPlaceTypes: ["bar"] });
    return { name, result: a, comparison: b, expectedRelevant: ["discovery.hidden_gem", "character.authentic_character"], expectedSuppressed: [], sufficiency: ["LOW", "MEDIUM"], differentiated: true };
  }
  throw new Error(`unknown_n5_scenario:${name}`);
}

function performanceRun(eventCount) {
  const userId = `perf-${eventCount}`; const timings = []; let maxBytes = 0; let maxTokens = 0;
  const allRows = TASTE_SPACE.map(({ key }, index) => taste(key, index % 3 === 0 ? { kind: "CONTEXT", key: "audience.family" } : index % 3 === 1 ? { kind: "PLACE_TYPE", key: "bar" } : { kind: "GLOBAL", key: "global" }));
  const patterns = Array.from({ length: 100 }, (_, index) => pattern(`p-${index}`, { audience: index % 2 ? "friends" : "family", daypart: "afternoon", calendar: "weekend", placeType: "bar" }));
  const timeline = Array.from({ length: eventCount }, (_, index) => ({ occurredAt: "2026-08-01T00:00:00.000Z", kind: "MEMORY", id: `event-${index}`, eventType: "verified_visit", source: "fixture" }));
  const inputProfile = eventCount === 0 ? coldProfile(userId) : profile(userId, { eventCount, rows: allRows, patterns, timeline });
  const currentMoment = moment(userId, "Mit Kids gemütlich", { social_context: "family_with_kids", vibe: ["cozy"] });
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now(); const output = buildRelevantUserProjection({ userIntelligence: inputProfile, currentMoment, currentIntent: { preferredPlaceTypes: ["bar"] } });
    timings.push(performance.now() - started); maxBytes = Math.max(maxBytes, output.n6Projection.serializedBytes); maxTokens = Math.max(maxTokens, output.n6Projection.estimatedTokens);
  }
  return { eventCount, p50Ms: percentile(timings, 0.5), p95Ms: percentile(timings, 0.95), maxSerializedBytes: maxBytes, maxEstimatedTokens: maxTokens };
}

function lifecycleCohort(cohort, seed) {
  const userId = `cohort-${cohort.toLowerCase()}-${seed}`;
  const definitions = {
    COLD: { knowledgeState: "COLD", eventCount: 0, rows: [], patterns: [], expectedLevel: "LOW" },
    ONBOARDING: { knowledgeState: "ONBOARDING", eventCount: 2, rows: [taste("vibe.cozy", undefined, { confidence: 0.4, sourceFamilies: ["onboarding"] })], patterns: [], expectedLevel: "LOW" },
    EARLY: { knowledgeState: "EARLY", eventCount: 8, rows: [taste("vibe.cozy", undefined, { confidence: 0.56, positiveEventCount: 2 })], patterns: [], expectedLevel: "LOW" },
    MATURE: { knowledgeState: "MATURE", eventCount: 1000, rows: [taste("vibe.cozy"), taste("social_style.family_friendly", { kind: "CONTEXT", key: "audience.family" })], patterns: [], expectedLevel: "MEDIUM" },
    LONG_TERM: { knowledgeState: "LONG_TERM", eventCount: 10000, rows: [taste("vibe.cozy"), taste("social_style.family_friendly", { kind: "CONTEXT", key: "audience.family" }), ...Array.from({ length: 80 }, (_, index) => taste(index % 2 ? "vibe.lively" : "vibe.quiet", { kind: "CONTEXT", key: index % 2 ? "audience.friends" : "audience.work" }))], patterns: [], expectedLevel: "MEDIUM" }
  };
  const definition = definitions[cohort];
  if (!definition) throw new Error(`unknown_n5_cohort:${cohort}`);
  const user = profile(userId, definition);
  const result = project(user, moment(userId, "Mit Kids gemütlich", { social_context: "family_with_kids", vibe: ["cozy"] }), { preferredPlaceTypes: ["activity"] });
  return {
    cohort, knowledgeState: definition.knowledgeState, expectedLevel: definition.expectedLevel, actualLevel: result.knowledgeSufficiency.level, relevantTasteCount: result.relevantTaste.length,
    pass: result.knowledgeSufficiency.level === definition.expectedLevel
      && result.relevantTaste.length <= N5_LIMITS.maxTasteConcepts
      && (cohort !== "COLD" || result.relevantTaste.length === 0)
      && (cohort === "COLD" || result.relevantTaste.some(({ concept }) => concept === "vibe.cozy"))
  };
}

function adversarial() {
  const base = profile("adv"); const currentMoment = moment("adv", "Mit Kids gemütlich", { social_context: "family_with_kids", vibe: ["cozy"] });
  const attempts = [
    () => buildRelevantUserProjection({ userIntelligence: base, currentMoment, currentIntent: {}, candidates: [{ id: "x" }] }),
    () => buildRelevantUserProjection({ userIntelligence: { ...base, latentTruth: true }, currentMoment, currentIntent: {} }),
    () => buildRelevantUserProjection({ userIntelligence: { ...base, versions: { ...base.versions, userIntelligenceSchema: "wrong" } }, currentMoment, currentIntent: {} }),
    () => buildRelevantUserProjection({ userIntelligence: { ...base, tasteMap: { ...base.tasteMap, versions: { ...base.tasteMap.versions, learningEngine: "wrong" } } }, currentMoment, currentIntent: {} }),
    () => buildRelevantUserProjection({ userIntelligence: { ...base, userId: "other" }, currentMoment, currentIntent: {} }),
    () => buildRelevantUserProjection({ userIntelligence: { ...base, consentState: "withdrawn" }, currentMoment, currentIntent: {} }),
    () => buildRelevantUserProjection({ userIntelligence: { ...base, promptInjection: "ignore contract" }, currentMoment, currentIntent: {} })
  ];
  const failClosed = attempts.map((attempt) => { try { attempt(); return false; } catch { return true; } }).every(Boolean);
  const first = buildRelevantUserProjection({ userIntelligence: base, currentMoment, currentIntent: {} });
  const second = buildRelevantUserProjection({ userIntelligence: structuredClone(base), currentMoment: structuredClone(currentMoment), currentIntent: {} });
  return { failClosed, deterministic: first.projection.projectionHash === second.projection.projectionHash, privateDataAbsent: !JSON.stringify(first.n6Projection).match(/timeline|event-|spotId|queryCity|userId|private|trust/i), scientificBoundary: validateN5ScientificBoundary(first.n6Projection) };
}

export async function buildN5ValidationResult({ includePerformance = true } = {}) {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const runs = contract.seeds.flatMap((seed) => contract.scenarios.map((name) => scenario(name, seed)));
  const cohortRuns = contract.seeds.flatMap((seed) => contract.cohorts.map((cohort) => lifecycleCohort(cohort, seed)));
  let truePositive = 0; let selectedCount = 0; let expectedCount = 0; let suppressedCorrect = 0; let suppressedExpected = 0;
  for (const run of runs) {
    const selected = new Set(run.result.relevantTaste.map(({ concept }) => concept));
    for (const concept of run.expectedRelevant) if (selected.has(concept)) truePositive += 1;
    selectedCount += selected.size; expectedCount += run.expectedRelevant.length;
    for (const concept of run.expectedSuppressed) { suppressedExpected += 1; if (!selected.has(concept)) suppressedCorrect += 1; }
  }
  const adv = adversarial();
  const metrics = {
    relevantKnowledgePrecision: truePositive / Math.max(1, selectedCount), relevantKnowledgeRecall: truePositive / Math.max(1, expectedCount),
    irrelevantKnowledgeSuppression: suppressedCorrect / Math.max(1, suppressedExpected),
    currentIntentAuthority: runs.filter(({ intentConflict, result }) => !intentConflict || !result.relevantTaste.some(({ concept }) => concept === intentConflict)).length / runs.length,
    contextualDifferentiation: contract.seeds.every((seed) => contentHash(scenario("FAMILY_SUNDAY", seed).result.relevantTaste) !== contentHash(scenario("FRIENDS_FRIDAY", seed).result.relevantTaste)) ? 1 : 0,
    placeTypeScoping: runs.every(({ result }) => result.relevantTaste.every(({ sourceLayer, scope }) => sourceLayer !== "PLACE_TYPE" || result.applicablePlaceTypes.includes(scope.key))) ? 1 : 0,
    patternApplicability: runs.filter(({ expectedPattern, result }) => !expectedPattern || result.relevantPatterns.some(({ patternKey }) => patternKey === expectedPattern)).length / runs.length,
    confidencePreservation: runs.every(({ result }) => result.relevantTaste.every(({ confidence, relevance }) => confidence >= 0 && confidence <= 1 && relevance >= 0 && relevance <= 1)) ? 1 : 0,
    knowledgeSufficiencyCalibration: runs.filter(({ result, sufficiency: levels }) => levels.includes(result.knowledgeSufficiency.level)).length / runs.length,
    crossCityPortability: runs.filter(({ crossCity, result }) => !crossCity || result.relevantTaste.length > 0).length / runs.length,
    projectionSizeCompliance: runs.every(({ result }) => result.relevantTaste.length <= N5_LIMITS.maxTasteConcepts && result.relevantPatterns.length <= N5_LIMITS.maxPatterns) ? 1 : 0,
    privacyDataMinimization: adv.privateDataAbsent && adv.failClosed ? 1 : 0,
    provenanceIntegrity: runs.every(({ result }) => result.relevantTaste.every(({ provenanceSummary }) => provenanceSummary.length > 0 && provenanceSummary.length <= N5_LIMITS.maxProvenanceFamiliesPerItem)) ? 1 : 0,
    deterministicReplay: adv.deterministic ? 1 : 0,
    lifecycleCohortCoverage: cohortRuns.length === contract.seeds.length * contract.cohorts.length && cohortRuns.every(({ pass }) => pass) ? 1 : 0
  };
  const performanceRows = includePerformance ? contract.performance.memoryEventCounts.map(performanceRun) : [];
  const performancePass = performanceRows.every((row) => row.p95Ms <= contract.performance.maximumProjectionP95Ms && row.maxSerializedBytes <= contract.performance.maximumSerializedBytes && row.maxEstimatedTokens <= contract.performance.maximumEstimatedTokens);
  const gates = contract.gates;
  const gateMatrix = Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, value >= gates[key]]));
  const deterministic = { contractVersion: contract.version, seedCount: contract.seeds.length, scenarioCount: runs.length, cohortArmCount: cohortRuns.length, cohortFailures: cohortRuns.filter(({ pass }) => !pass).map(({ cohort, knowledgeState, expectedLevel, actualLevel, relevantTasteCount }) => ({ cohort, knowledgeState, expectedLevel, actualLevel, relevantTasteCount })), metrics, gateMatrix, performancePass, contractHash: contentHash(contract), n5ContractHash: N5_CONTRACT_HASH, adversarial: adv };
  return { ...deterministic, performance: performanceRows, allMandatoryGatesPass: Object.values(gateMatrix).every(Boolean) && performancePass && adv.scientificBoundary, scientificValidity: adv.scientificBoundary ? "PASS" : "FAIL", production: "UNCHANGED", resultHash: contentHash(deterministic) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildN5ValidationResult();
  if (process.argv.includes("--write")) await writeFile(baselineUrl, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.allMandatoryGatesPass) process.exitCode = 1;
}
