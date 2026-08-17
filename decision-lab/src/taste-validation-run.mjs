import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, contentHash } from "./canonical-json.mjs";
import { buildUserTasteMap, projectCurrentTaste, validateTasteEngineScientificBoundary } from "./taste-engine.mjs";
import { validateTasteEngineFreeze } from "./taste-engine-freeze.mjs";
import {
  ARCHETYPES, CONTEXT_TRUTH, PLACE_TYPE_TRUTH, buildScopedHistory, confidenceCalibration,
  evaluateDiagnosticCoverage, evaluatePromotion, evaluateScopedTaste, evaluateTasteMap, runNoiseDiagnostic,
  runSafetyDiagnostics, sealValidationResult, simulateLifecycle, spearman, VALIDATION_RUNTIME_VERSION
} from "./taste-validation.mjs";
import { validateTasteValidationFreeze } from "./taste-validation-freeze.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(here, "../config/taste-validation-contract-v1.1.json");
const defaultOutput = resolve(here, "../baselines/wave3b-taste-validation-v1.1.json");
const AS_OF = "2026-01-01T12:00:00.000Z";
const mean = (values) => { const finite = values.filter(Number.isFinite); return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null; };
const averageMetrics = (rows) => ({
  directionAccuracy: mean(rows.map((row) => row.directionAccuracy)),
  affinityAccuracy: mean(rows.map((row) => row.affinityAccuracy)),
  rankCorrelation: mean(rows.map((row) => row.rankCorrelation)),
  topPreferenceRecall: mean(rows.map((row) => row.topPreferenceRecall)),
  falsePreferenceRate: mean(rows.map((row) => row.falsePreferenceRate)),
  falseNegativePreferenceRate: mean(rows.map((row) => row.falseNegativePreferenceRate)),
  negativeDirectionAccuracy: mean(rows.map((row) => row.negativeDirectionAccuracy))
});

const event = ({ id, userId, type, concepts, at, placeType = "cafe", contexts = [], spotId = id, sessionId = id, consent = "granted" }) => ({
  id, userId, eventType: type, concepts, consent, occurredAt: at, placeType, contexts, spotId, sessionId
});

function driftDiagnostic(seed) {
  const userId = `drift-${seed}`; const old = [];
  for (let index = 0; index < 30; index += 1) old.push(event({ id: `${userId}-old-${index}`, userId, type: index % 2 ? "saved" : "verified_visit", concepts: ["vibe.lively"], at: new Date(Date.UTC(2024, index % 12, 1, 12)).toISOString(), spotId: `old-${index % 8}`, sessionId: `old-session-${index}` }));
  let adaptationEvents = null; let finalEvaluation = null;
  for (let count = 5; count <= 100; count += 5) {
    const recent = Array.from({ length: count }, (_, index) => event({ id: `${userId}-new-${index}`, userId, type: index % 3 === 0 ? "negative_post_visit" : "positive_post_visit",
      concepts: [index % 3 === 0 ? "vibe.lively" : "vibe.cozy"], at: new Date(Date.UTC(2025, 8, 1 + Math.floor(index / 4), 12)).toISOString(), spotId: `new-${index % 12}`, sessionId: `new-session-${Math.floor(index / 2)}` }));
    const map = buildUserTasteMap([...old, ...recent], { asOf: AS_OF });
    finalEvaluation = evaluateTasteMap(map, { "vibe.lively": -0.8, "vibe.cozy": 0.9 });
    if (adaptationEvents === null && finalEvaluation.directionAccuracy === 1) adaptationEvents = count;
  }
  return { directionAccuracy: finalEvaluation.directionAccuracy, affinityAccuracy: finalEvaluation.affinityAccuracy, adaptationEvents: adaptationEvents ?? 101 };
}

function onboardingDiagnostic(seed) {
  const userId = `onboarding-${seed}`;
  const onboarding = event({ id: `${userId}-onboarding`, userId, type: "onboarding_preference", concepts: ["price.premium"], at: "2025-01-01T12:00:00.000Z" });
  let correctionEvents = null; let final = null;
  for (let count = 5; count <= 50; count += 5) {
    const behavior = Array.from({ length: count }, (_, index) => event({ id: `${userId}-behavior-${index}`, userId, type: index % 2 ? "positive_post_visit" : "negative_post_visit",
      concepts: [index % 2 ? "price.budget" : "price.premium"], at: new Date(Date.UTC(2025, 6, 1 + index, 12)).toISOString(), spotId: `onboarding-spot-${index}`, sessionId: `onboarding-session-${index}` }));
    const map = buildUserTasteMap([onboarding, ...behavior], { asOf: AS_OF });
    final = evaluateTasteMap(map, { "price.premium": -0.85, "price.budget": 0.9 });
    if (correctionEvents === null && final.directionAccuracy === 1) correctionEvents = count;
  }
  return { corrected: final.directionAccuracy === 1, correctionEvents: correctionEvents ?? 51, residualAffinityError: 1 - final.affinityAccuracy };
}

function temporaryInterestDiagnostic(seed) {
  const userId = `temporary-${seed}`;
  const events = Array.from({ length: 14 }, (_, index) => event({ id: `${userId}-${index}`, userId, type: "spot_opened", concepts: ["occasion.morning_friendly"],
    at: new Date(Date.UTC(2025, 0, 1 + index, 12)).toISOString(), spotId: `brunch-${index % 4}`, sessionId: `brunch-session-${index}` }));
  const immediate = buildUserTasteMap(events, { asOf: "2025-01-15T12:00:00.000Z" });
  const later = buildUserTasteMap(events, { asOf: AS_OF });
  const affinity = (map) => map.rows.find(({ concept, scope }) => concept === "occasion.morning_friendly" && scope.kind === "GLOBAL")?.affinity ?? 0;
  return { immediateAffinity: affinity(immediate), oneYearAffinity: affinity(later), decayed: affinity(later) < affinity(immediate) };
}

function adversarialPairDiagnostic() {
  const shared = (userId) => Array.from({ length: 10 }, (_, index) => event({ id: `${userId}-shared-${index}`, userId, type: "verified_visit", concepts: ["vibe.cozy", "price.budget"], at: new Date(Date.UTC(2025, index, 1, 12)).toISOString(), spotId: `shared-${index % 5}`, sessionId: `${userId}-${index}` }));
  const indistinguishableA = buildUserTasteMap(shared("pair-a"), { asOf: AS_OF });
  const indistinguishableB = buildUserTasteMap(shared("pair-b"), { asOf: AS_OF });
  const rows = (map) => map.rows.filter(({ scope }) => scope.kind === "GLOBAL").map(({ concept, affinity, confidence }) => ({ concept, affinity, confidence }));
  const beforeDistinguishable = contentHash(rows(indistinguishableA)) !== contentHash(rows(indistinguishableB));
  const clarifiedA = buildUserTasteMap([...shared("pair-a"), event({ id: "pair-a-explicit", userId: "pair-a", type: "exact_mood_feedback", concepts: ["vibe.cozy"], at: "2025-12-01T12:00:00.000Z" })], { asOf: AS_OF });
  const clarifiedB = buildUserTasteMap([...shared("pair-b"), event({ id: "pair-b-explicit", userId: "pair-b", type: "exact_mood_feedback", concepts: ["price.budget"], at: "2025-12-01T12:00:00.000Z" })], { asOf: AS_OF });
  return { beforeDistinguishable, afterAdditionalEvidenceDistinguishable: contentHash(rows(clarifiedA)) !== contentHash(rows(clarifiedB)), limitation: "OBSERVABILITY_LIMIT" };
}

const globalRow = (map, concept) => map.rows.find((row) => row.scope.kind === "GLOBAL" && row.concept === concept);

function mandatoryCoverageDiagnostics() {
  const asOf = AS_OF;
  const onboardingUser = "coverage-onboarding";
  const onboardingMap = buildUserTasteMap([event({ id: "coverage-onboarding-1", userId: onboardingUser, type: "onboarding_preference", concepts: ["vibe.cozy"], at: "2025-06-01T12:00:00.000Z" })], { asOf });

  const signalMap = (id, type, count = 1, options = {}) => buildUserTasteMap(Array.from({ length: count }, (_, index) => event({
    id: `${id}-${index}`, userId: id, type, concepts: options.concepts ?? ["vibe.cozy"], at: new Date(Date.UTC(2025, 6, 1 + index, 12)).toISOString(),
    spotId: options.sameSpot ? `${id}-same-spot` : `${id}-spot-${index}`, sessionId: options.sameSession ? `${id}-same-session` : `${id}-session-${index}`, placeType: options.placeType ?? "cafe"
  })), { asOf });
  const tap = signalMap("coverage-tap", "spot_tapped");
  const reservation = signalMap("coverage-reservation", "reservation_intent");
  const mood = signalMap("coverage-mood", "exact_mood_feedback");
  const review = signalMap("coverage-review", "positive_post_visit");
  const repeated = signalMap("coverage-repeated", "liked", 5, { sameSpot: true, sameSession: true });
  const independent = signalMap("coverage-independent", "liked", 5);

  let withdrawalRejected = false;
  try { buildUserTasteMap([event({ id: "coverage-withdrawn", userId: "coverage-withdrawn", type: "liked", concepts: ["vibe.cozy"], at: "2025-07-01T12:00:00.000Z", consent: "withdrawn" })], { asOf }); }
  catch (error) { withdrawalRejected = /consent/.test(String(error)); }
  const postWithdrawal = buildUserTasteMap([], { asOf });
  const fullHistory = signalMap("coverage-complete", "verified_visit", 8);
  const sparseHistory = signalMap("coverage-sparse", "verified_visit", 2);

  const temporaryArm = (id, concept, type = "spot_opened", placeType = "cafe") => {
    const userId = `coverage-${id}`;
    const stable = Array.from({ length: 12 }, (_, index) => event({ id: `${userId}-stable-${index}`, userId, type: "saved", concepts: ["vibe.cozy"], at: new Date(Date.UTC(2024, index, 1, 12)).toISOString(), spotId: `${userId}-stable-${index}`, sessionId: `${userId}-stable-session-${index}` }));
    const temporary = Array.from({ length: 14 }, (_, index) => event({ id: `${userId}-temp-${index}`, userId, type, concepts: [concept], at: new Date(Date.UTC(2025, 9, 1 + index, 12)).toISOString(), placeType, spotId: `${userId}-temp-${index % 4}`, sessionId: `${userId}-temp-session-${index}` }));
    const immediate = buildUserTasteMap([...stable, ...temporary], { asOf });
    const aged = buildUserTasteMap([...stable, ...temporary], { asOf: "2027-01-01T12:00:00.000Z" });
    return { immediateAffinity: globalRow(immediate, concept)?.affinity ?? 0, agedAffinity: globalRow(aged, concept)?.affinity ?? 0, decayed: Math.abs(globalRow(aged, concept)?.affinity ?? 0) < Math.abs(globalRow(immediate, concept)?.affinity ?? 0) };
  };

  const tourist = temporaryArm("tourist", "price.premium");
  const festival = temporaryArm("festival", "energy.energetic");
  const business = temporaryArm("business", "character.design_led");
  const categoryPhase = temporaryArm("category", "place_type.bar", "spot_opened", "bar");
  const massCategory = signalMap("coverage-mass-category", "spot_tapped", 50, { concepts: ["place_type.bar"], sameSpot: true, sameSession: true, placeType: "bar" });
  const weak = signalMap("coverage-weak", "spot_tapped", 20);
  const strong = signalMap("coverage-strong", "positive_post_visit", 3);

  return {
    ONBOARDING_ONLY: { measurements: 1, executable: Boolean(globalRow(onboardingMap, "vibe.cozy")), evidence: { affinity: globalRow(onboardingMap, "vibe.cozy")?.affinity ?? null, confidence: globalRow(onboardingMap, "vibe.cozy")?.confidence ?? null } },
    SIGNAL_RESERVATION: { measurements: 2, executable: Boolean(globalRow(tap, "vibe.cozy") && globalRow(reservation, "vibe.cozy")), evidence: { tapAffinity: globalRow(tap, "vibe.cozy")?.affinity, reservationAffinity: globalRow(reservation, "vibe.cozy")?.affinity } },
    SIGNAL_REVIEW_MOOD: { measurements: 2, executable: Boolean(globalRow(mood, "vibe.cozy") && globalRow(review, "vibe.cozy")), evidence: { moodAffinity: globalRow(mood, "vibe.cozy")?.affinity, reviewAffinity: globalRow(review, "vibe.cozy")?.affinity } },
    REPEATED_BEHAVIOUR: { measurements: 2, executable: Boolean(globalRow(repeated, "vibe.cozy") && globalRow(independent, "vibe.cozy")), evidence: { repeatedConfidence: globalRow(repeated, "vibe.cozy")?.confidence, independentConfidence: globalRow(independent, "vibe.cozy")?.confidence } },
    CONSENT_WITHDRAWAL: { measurements: 2, executable: withdrawalRejected && postWithdrawal.rows.length === 0, evidence: { withdrawalRejected, postWithdrawalRows: postWithdrawal.rows.length } },
    INCOMPLETE_HISTORY: { measurements: 2, executable: Boolean(globalRow(fullHistory, "vibe.cozy") && globalRow(sparseHistory, "vibe.cozy")), evidence: { sparseConfidence: globalRow(sparseHistory, "vibe.cozy")?.confidence, fullConfidence: globalRow(fullHistory, "vibe.cozy")?.confidence } },
    TOURIST_WEEK: { measurements: 2, executable: tourist.decayed, evidence: tourist },
    FESTIVAL_WEEKEND: { measurements: 2, executable: festival.decayed, evidence: festival },
    BUSINESS_TRIP: { measurements: 2, executable: business.decayed, evidence: business },
    TEMPORARY_CATEGORY_PHASE: { measurements: 2, executable: categoryPhase.decayed, evidence: categoryPhase },
    MASS_SAME_CATEGORY: { measurements: 1, executable: Boolean(globalRow(massCategory, "place_type.bar")), evidence: { affinity: globalRow(massCategory, "place_type.bar")?.affinity, confidence: globalRow(massCategory, "place_type.bar")?.confidence } },
    WEAK_VS_STRONG_EVIDENCE: { measurements: 2, executable: Boolean(globalRow(weak, "vibe.cozy") && globalRow(strong, "vibe.cozy")), evidence: { weakAffinity: globalRow(weak, "vibe.cozy")?.affinity, strongAffinity: globalRow(strong, "vibe.cozy")?.affinity, weakConfidence: globalRow(weak, "vibe.cozy")?.confidence, strongConfidence: globalRow(strong, "vibe.cozy")?.confidence } }
  };
}

function lifecycleFailureBreakdowns(lifecycle, onboardingEvidence) {
  const cohortFor = (checkpoint) => checkpoint === 0 ? "NEW_USER" : checkpoint <= 10 ? "EARLY_USER" : checkpoint <= 50 ? "DEVELOPING_USER" : checkpoint === 100 ? "MATURE_USER" : "LONG_TERM_USER";
  const cohortRows = new Map(); const conceptRows = new Map();
  for (const record of lifecycle) {
    const cohort = cohortFor(record.checkpoint);
    if (!cohortRows.has(cohort)) cohortRows.set(cohort, { measurements: 0, directionFailures: 0, falsePreferenceOccurrences: 0, severity: "P1" });
    const cohortRow = cohortRows.get(cohort); cohortRow.measurements += 1; cohortRow.directionFailures += record.rows.filter(({ correctDirection }) => !correctDirection).length; cohortRow.falsePreferenceOccurrences += record.falsePreferenceConcepts.length;
    for (const row of record.rows) {
      if (!conceptRows.has(row.concept)) conceptRows.set(row.concept, { measurements: 0, directionFailures: 0, falsePreferenceOccurrences: 0, affectedCohorts: new Set(), severity: "P1" });
      const concept = conceptRows.get(row.concept); concept.measurements += 1; concept.directionFailures += Number(!row.correctDirection); if (!row.correctDirection) concept.affectedCohorts.add(cohort);
    }
    for (const conceptName of record.falsePreferenceConcepts) {
      if (!conceptRows.has(conceptName)) conceptRows.set(conceptName, { measurements: 0, directionFailures: 0, falsePreferenceOccurrences: 0, affectedCohorts: new Set(), severity: "P1" });
      const concept = conceptRows.get(conceptName); concept.falsePreferenceOccurrences += 1; concept.affectedCohorts.add(cohort);
    }
  }
  cohortRows.set("ONBOARDING_ONLY", { measurements: onboardingEvidence ? 1 : 0, directionFailures: 0, falsePreferenceOccurrences: 0, severity: "P1" });
  return {
    byCohort: Object.fromEntries([...cohortRows.entries()].sort(([a], [b]) => a.localeCompare(b))),
    byConcept: Object.fromEntries([...conceptRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, { ...value, affectedCohorts: [...value.affectedCohorts].sort() }])),
  };
}

function scopedDiagnostics(seeds) {
  const rows = seeds.map((seed) => {
    const events = buildScopedHistory({ seed });
    if (!validateTasteEngineScientificBoundary(events)) throw new Error("latent_truth_leaked_into_scoped_engine_input");
    return evaluateScopedTaste(buildUserTasteMap(events, { asOf: AS_OF }));
  });
  const first = rows[0];
  const friends = first.contexts.friends.projection;
  const family = first.contexts.family.projection;
  const concepts = new Set([...friends.rows.map(({ concept }) => concept), ...family.rows.map(({ concept }) => concept)]);
  const difference = mean([...concepts].map((concept) => Math.abs((friends.rows.find((row) => row.concept === concept)?.affinity ?? 0) - (family.rows.find((row) => row.concept === concept)?.affinity ?? 0))));
  const globalRows = first.contexts.friends.projection.rows.filter(({ evidence }) => evidence.some(({ scope }) => scope.kind === "GLOBAL"));
  const globalRetention = mean(globalRows.map(({ affinity, historyAffinity }) => Number(Math.sign(affinity) === Math.sign(historyAffinity))));
  return { contextualDirectionAccuracy: mean(rows.map(({ contextualDirectionAccuracy }) => contextualDirectionAccuracy)), placeTypeDirectionAccuracy: mean(rows.map(({ placeTypeDirectionAccuracy }) => placeTypeDirectionAccuracy)),
    contextualAdaptation: difference, globalRetention, sameUserDifferentContext: friends.projectionHash !== family.projectionHash };
}

function failureDecomposition(metrics, promotion, breakdowns) {
  const mapping = {
    diagnosticCoverage: "OTHER_UNKNOWN",
    directionAccuracy: "SIGNAL_WEIGHT", affinityAccuracy: "SIGNAL_WEIGHT", rankCorrelation: "CONCEPT_MAPPING", topPreferenceRecall: "CONCEPT_MAPPING",
    falsePreference: "SIGNAL_WEIGHT", negativeLearning: "NEGATIVE_LEARNING", falseNegativeLearning: "NEGATIVE_LEARNING", confidenceCalibration: "CONFIDENCE", contextualTaste: "CONTEXT",
    contextualAdaptation: "CONTEXT", globalRetention: "CONTEXT",
    placeTypeTaste: "PLACE_TYPE", currentIntentAuthority: "INTENT_CONFLICT", driftAdaptation: "DRIFT", noiseResistance: "SIGNAL_WEIGHT",
    oneOffBounded: "SIGNAL_WEIGHT", onboardingCorrection: "ONBOARDING_BIAS", consentPrivacy: "OTHER_UNKNOWN", idempotency: "OTHER_UNKNOWN", exposureNeutral: "OTHER_UNKNOWN"
  };
  const failed = Object.entries(promotion.gates).filter(([, pass]) => !pass).map(([gate]) => ({ gate, class: mapping[gate], severity: ["consentPrivacy", "idempotency", "currentIntentAuthority"].includes(gate) ? "P0" : "P1", rootCauseConfidence: "HIGH" }));
  const counts = Object.fromEntries([...new Set(failed.map(({ class: value }) => value))].sort().map((value) => [value, failed.filter(({ class: item }) => item === value).length]));
  if (!metrics.adversarialPairs.beforeDistinguishable) counts.OBSERVABILITY_LIMIT = (counts.OBSERVABILITY_LIMIT ?? 0) + 1;
  return { failures: failed, counts, affectedCohorts: failed.length ? ["EARLY_USER", "DEVELOPING_USER", "MATURE_USER", "LONG_TERM_USER"] : [], unknownCount: failed.filter(({ class: value }) => value === "OTHER_UNKNOWN").length, ...breakdowns };
}

export async function runOfficialTasteValidation() {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const [engineFreeze, validationFreeze] = await Promise.all([validateTasteEngineFreeze(), validateTasteValidationFreeze()]);
  if (!engineFreeze.valid) throw new Error(`invalid_taste_engine_freeze:${engineFreeze.reasons.join(",")}`);
  if (!validationFreeze.valid) throw new Error(`invalid_taste_validation_freeze:${validationFreeze.reasons.join(",")}`);
  const lifecycle = [];
  for (const seed of contract.seeds) for (const archetype of ARCHETYPES) {
    const fullHistory = simulateLifecycle({ archetype, seed, count: Math.max(...contract.learningCheckpoints) });
    if (!validateTasteEngineScientificBoundary(fullHistory)) throw new Error("latent_truth_leaked_into_engine_input");
    for (const checkpoint of contract.learningCheckpoints) {
      const map = buildUserTasteMap(fullHistory.slice(0, checkpoint), { asOf: AS_OF });
      const evaluated = evaluateTasteMap(map, archetype.truth);
      lifecycle.push({ seed, archetype: archetype.id, checkpoint, ...evaluated, rankCorrelation: spearman(evaluated.rows) });
    }
  }
  const informative = lifecycle.filter(({ checkpoint }) => checkpoint > 0);
  const matureRows = lifecycle.filter(({ checkpoint }) => checkpoint >= contract.cohorts.MATURE_USER);
  const confidence = confidenceCalibration(informative.flatMap(({ rows }) => rows));
  const learningCurve = Object.fromEntries(contract.learningCheckpoints.map((checkpoint) => [checkpoint, averageMetrics(lifecycle.filter((row) => row.checkpoint === checkpoint))]));
  const scoped = scopedDiagnostics(contract.seeds);
  const mandatoryArms = mandatoryCoverageDiagnostics();
  const breakdowns = lifecycleFailureBreakdowns(lifecycle, mandatoryArms.ONBOARDING_ONLY.evidence);
  mandatoryArms.FAILURE_BY_COHORT = { measurements: Object.keys(breakdowns.byCohort).length, executable: Object.keys(breakdowns.byCohort).length > 0, evidence: { cohorts: Object.keys(breakdowns.byCohort) } };
  mandatoryArms.FAILURE_BY_CONCEPT = { measurements: Object.keys(breakdowns.byConcept).length, executable: Object.keys(breakdowns.byConcept).length > 0, evidence: { concepts: Object.keys(breakdowns.byConcept) } };
  const coverage = evaluateDiagnosticCoverage(mandatoryArms, contract);
  const driftRows = contract.seeds.map(driftDiagnostic); const onboardingRows = contract.seeds.map(onboardingDiagnostic); const noiseRows = contract.seeds.map((seed) => runNoiseDiagnostic({ seed }));
  const metrics = {
    overall: averageMetrics(informative), mature: averageMetrics(matureRows), learningCurve, confidence, scoped,
    drift: { directionAccuracy: mean(driftRows.map(({ directionAccuracy }) => directionAccuracy)), affinityAccuracy: mean(driftRows.map(({ affinityAccuracy }) => affinityAccuracy)), adaptationEvents: Math.max(...driftRows.map(({ adaptationEvents }) => adaptationEvents)) },
    onboarding: { corrected: onboardingRows.every(({ corrected }) => corrected), correctionEvents: Math.max(...onboardingRows.map(({ correctionEvents }) => correctionEvents)), residualAffinityError: mean(onboardingRows.map(({ residualAffinityError }) => residualAffinityError)) },
    noise: { falsePreferenceRate: mean(noiseRows.map(({ falsePreferenceRate }) => falsePreferenceRate)), maxAffinity: Math.max(...noiseRows.map(({ maxAffinity }) => maxAffinity)), learnedRows: mean(noiseRows.map(({ learnedRows }) => learnedRows)) },
    safety: runSafetyDiagnostics({ asOf: AS_OF }), temporaryInterest: temporaryInterestDiagnostic(contract.seeds[0]), adversarialPairs: adversarialPairDiagnostic(),
    mandatoryArms, coverage
  };
  const promotion = evaluatePromotion(metrics, contract);
  const decomposedFailures = failureDecomposition(metrics, promotion, breakdowns);
  const body = {
    baselineId: "wave3b-internal-taste-validation-v1.1", generatedAt: "2026-08-17T12:00:00.000Z", contractVersion: contract.version,
    contractHash: contentHash(contract), validationFreezeHash: validationFreeze.freezeHash, parentTasteEngineFreezeHash: contentHash(engineFreeze.frozen),
    runtimeVersion: VALIDATION_RUNTIME_VERSION, sample: { seeds: contract.seeds.length, archetypes: ARCHETYPES.length, checkpoints: contract.learningCheckpoints.length, lifecycleEvaluations: lifecycle.length, maxInformativeEvents: Math.max(...contract.learningCheckpoints) },
    metrics, promotion, failureDecomposition: decomposedFailures,
    scientificValidity: { status: "PASS", engineMutation: "NONE", latentTruthFeedsEngine: false, thresholdsFrozenBeforeRun: true, productionAccess: "NONE", finalRankingIntegration: "NONE", groundTruthRole: "EVALUATOR_ONLY" },
    engineVerdict: promotion.pass ? "STRONG" : metrics.overall.directionAccuracy >= 0.6 ? "MIXED" : "WEAK",
    wave3cReadiness: promotion.pass ? "READY" : "NOT_READY"
  };
  return sealValidationResult(body);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : defaultOutput;
  const result = await runOfficialTasteValidation();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, canonicalJson(result));
  process.stdout.write(`${JSON.stringify({ output, resultHash: result.resultHash, promotion: result.promotion, wave3cReadiness: result.wave3cReadiness }, null, 2)}\n`);
}
