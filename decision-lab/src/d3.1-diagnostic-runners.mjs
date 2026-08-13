import { contentHash } from "./canonical-json.mjs";
import { jaccard, listQuality } from "./metrics.mjs";
import { TREATMENT_ARMS, validateTreatment } from "./personalization-treatment.mjs";

export const CANONICAL_EXECUTION_PATH = "CANONICAL_V13_AUTHENTICATED";
const forbiddenInput = /(^|_)(latent|ground_truth|true_preference|utility|oracle)($|_)/i;
const contributionKeys = ["personalized_component", "semantic_component", "source_bonus", "intent_boost", "category_fit_component", "category_mismatch_penalty", "place_type_boost", "contextual_taste_component", "recent_memory_component", "v12_only_penalty", "weak_intent_penalty"];

const clone = (value) => structuredClone(value);
const ids = (run) => run.candidates.map((candidate) => candidate.spot_id ?? candidate.id);
const meanUtility = (run, utilityById, k = 10) => { const values = ids(run).slice(0, k).map((id) => utilityById[id] ?? 0); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
const rankMovement = (before, after) => Object.fromEntries([...new Set([...before, ...after])].map((id) => [id, { before: before.indexOf(id) < 0 ? null : before.indexOf(id) + 1, after: after.indexOf(id) < 0 ? null : after.indexOf(id) + 1 }]));

function assertLatentFree(value, path = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertLatentFree(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenInput.test(key)) throw new Error(`Latent evaluation field in Engine input: ${path}.${key}`);
    assertLatentFree(child, `${path}.${key}`);
  }
}

function assertCanonicalRun(run, expectedHash) {
  if (!run || run.executionPath !== CANONICAL_EXECUTION_PATH) throw new Error("Diagnostic arm did not execute canonical authenticated V13");
  if (run.engineSourceHash !== expectedHash) throw new Error("Diagnostic arm Engine hash drift");
  if (!Array.isArray(run.candidates) || !run.trace) throw new Error("Diagnostic arm missing candidates or Flight Recorder trace");
  return run;
}

async function execute(executor, input, expectedHash) {
  assertLatentFree(input);
  return assertCanonicalRun(await executor(clone(input)), expectedHash);
}

function changedPaths(base, changed, path = "$") {
  if (Object.is(base, changed)) return [];
  if (!base || !changed || typeof base !== "object" || typeof changed !== "object" || Array.isArray(base) !== Array.isArray(changed)) return [path];
  const keys = new Set([...Object.keys(base), ...Object.keys(changed)]);
  return [...keys].flatMap((key) => changedPaths(base[key], changed[key], `${path}.${key}`));
}

export async function runCounterfactualEvaluation({ pairs, executor, engineSourceHash, utilityFor }) {
  const measurements = [];
  for (const pair of pairs) {
    const differences = changedPaths(pair.base, pair.counterfactual).filter((path) => !path.endsWith(".id") && !path.endsWith(".name"));
    const allowedPrefix = pair.changedPath ?? (pair.dimension === "audience" ? "$.request.audience" : "$.request.query");
    if (!differences.length || differences.some((path) => !path.startsWith(allowedPrefix))) throw new Error(`Counterfactual isolation failed for ${pair.id}`);
    const base = await execute(executor, { userId: pair.base.userId, request: pair.base.request, context: pair.base.context ?? null, diagnostic: { arm: "counterfactual", pairId: pair.id, side: "base" } }, engineSourceHash);
    const counterfactual = await execute(executor, { userId: pair.counterfactual.userId, request: pair.counterfactual.request, context: pair.counterfactual.context ?? null, diagnostic: { arm: "counterfactual", pairId: pair.id, side: "counterfactual" } }, engineSourceHash);
    const baseTruth = utilityFor(pair.base);
    const changedTruth = utilityFor(pair.counterfactual);
    const before = ids(base), after = ids(counterfactual);
    measurements.push({ pairId: pair.id, dimension: pair.dimension, changedPaths: differences, unchangedControlsHash: contentHash({ userId: pair.base.userId, worldId: pair.worldId, seed: pair.seed }), baseCandidateIds: before, counterfactualCandidateIds: after, topKOverlap: jaccard(before, after), rankMovement: rankMovement(before, after), baseUtility: meanUtility(base, baseTruth), counterfactualUtility: meanUtility(counterfactual, changedTruth), directionalUtilityDelta: meanUtility(counterfactual, changedTruth) - meanUtility(base, changedTruth), hardGates: { base: base.hardGates ?? null, counterfactual: counterfactual.hardGates ?? null }, traceHashes: [base.trace.traceHash, counterfactual.trace.traceHash] });
  }
  return { arm: "counterfactual", executableMeasurements: measurements.length, measurements, hash: contentHash(measurements) };
}

export async function runPersonalizationTreatmentComparison({ bundles, materialize, executor, engineSourceHash, utilityFor }) {
  const measurements = [];
  for (const bundle of bundles) {
    const validation = validateTreatment(bundle);
    if (!validation.pass) throw new Error(`Invalid frozen Personalization Treatment: ${validation.validationHash}`);
    const runs = {};
    for (const arm of TREATMENT_ARMS) {
      const plan = bundle.enginePlans[arm];
      if (plan.authenticationMode !== "authenticated") throw new Error("Anonymous Personalization control prohibited");
      const state = await materialize(clone(plan));
      if (state.directDerivedWrites || state.rawDerivedConsistent !== true) throw new Error(`Inconsistent treatment state for ${arm}`);
      runs[arm] = await execute(executor, { userId: plan.user.id, request: bundle.controls.currentRequest, context: bundle.controls.currentContext, diagnostic: { arm: "personalization", treatmentArm: arm, stateRef: state.stateRef } }, engineSourceHash);
    }
    const truth = utilityFor(bundle.evaluationOnly.sameLatentTruthReference, bundle.controls.currentContext);
    const utility = Object.fromEntries(TREATMENT_ARMS.map((arm) => [arm, meanUtility(runs[arm], truth)]));
    const candidateIds = Object.fromEntries(TREATMENT_ARMS.map((arm) => [arm, ids(runs[arm])]));
    measurements.push({ treatmentHash: bundle.treatmentHash, maturity: bundle.evaluationOnly.actualMaturityCohort, candidateIds, v12CandidateIds: Object.fromEntries(TREATMENT_ARMS.map((arm) => [arm, runs[arm].trace.v12CandidateIds ?? []])), semanticCandidateIds: Object.fromEntries(TREATMENT_ARMS.map((arm) => [arm, runs[arm].trace.semanticCandidateIds ?? []])), utility, personalizationLift: utility.ACTUAL - utility.NEUTRAL, personalizationHarm: utility.ACTUAL < utility.NEUTRAL, opposingHistoryImpact: utility.OPPOSING - utility.ACTUAL, topKOverlap: { actualNeutral: jaccard(candidateIds.ACTUAL, candidateIds.NEUTRAL), actualOpposing: jaccard(candidateIds.ACTUAL, candidateIds.OPPOSING) }, rankMovement: { actualNeutral: rankMovement(candidateIds.ACTUAL, candidateIds.NEUTRAL), actualOpposing: rankMovement(candidateIds.ACTUAL, candidateIds.OPPOSING) }, contributionDelta: contributionDelta(runs.ACTUAL, runs.NEUTRAL), traceHashes: TREATMENT_ARMS.map((arm) => runs[arm].trace.traceHash) });
  }
  return { arm: "personalization", executableMeasurements: measurements.length, measurements, hash: contentHash(measurements) };
}

function contributionDelta(actual, control) {
  const sum = (run, key) => run.candidates.reduce((total, candidate) => total + Number(candidate.explanation?.[key] ?? 0), 0);
  return Object.fromEntries(contributionKeys.map((key) => [key, sum(actual, key) - sum(control, key)]));
}

export async function runRemixEvaluation({ cases, executor, engineSourceHash, utilityFor }) {
  const measurements = [];
  for (const item of cases) {
    const initial = await execute(executor, { userId: item.userId, request: { ...item.request, excludeSpotIds: [] }, context: item.context, diagnostic: { arm: "remix", caseId: item.id, invocation: "initial" } }, engineSourceHash);
    const initialIds = ids(initial);
    const remix = await execute(executor, { userId: item.userId, request: { ...item.request, excludeSpotIds: initialIds }, context: item.context, diagnostic: { arm: "remix", caseId: item.id, invocation: "canonical_remix" } }, engineSourceHash);
    const remixIds = ids(remix);
    const repeated = remixIds.filter((id) => initialIds.includes(id));
    const truth = utilityFor(item);
    measurements.push({ caseId: item.id, family: item.family, initialTopK: initialIds, remixTopK: remixIds, excludedSpotIds: initialIds, repeatedSpotIds: repeated, candidateOverlap: jaccard(initialIds, remixIds), newCandidateCount: remixIds.filter((id) => !initialIds.includes(id)).length, rankMovement: rankMovement(initialIds, remixIds), utilityBefore: meanUtility(initial, truth), utilityAfter: meanUtility(remix, truth), fallbackUsage: Boolean(remix.trace.fallbackUsed), memoryContribution: remix.candidates.reduce((sum, candidate) => sum + Number(candidate.explanation?.recent_memory_component ?? 0), 0), candidateStarvation: remixIds.length < Math.min(item.request.limit ?? 10, initialIds.length), hardGates: remix.hardGates ?? null, traceHashes: [initial.trace.traceHash, remix.trace.traceHash] });
  }
  return { arm: "remix", executableMeasurements: measurements.length, measurements, hash: contentHash(measurements) };
}

function dominantFactors(candidate) {
  const entries = contributionKeys.map((key) => [key, Math.abs(Number(candidate.explanation?.[key] ?? 0))]).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.filter(([, value]) => value >= entries[0][1] * 0.8).map(([key]) => key) : [];
}

export function evaluateExplanationAlignment({ candidates }) {
  const measurements = candidates.map((candidate) => {
    const explanation = String(candidate.human_reason ?? "").trim();
    const evidence = candidate.explanationEvidence ?? {};
    const claimed = Array.isArray(evidence.claimedFactors) ? evidence.claimedFactors : [];
    const supported = Array.isArray(evidence.supportedFactors) ? evidence.supportedFactors : [];
    const unsupported = claimed.filter((factor) => !supported.includes(factor));
    const dominant = dominantFactors(candidate);
    const omittedDominant = dominant.filter((factor) => !claimed.includes(factor));
    let classification = "ALIGNED";
    if (!explanation || !claimed.length) classification = "UNSUPPORTED";
    else if (unsupported.length) classification = "MISLEADING";
    else if (omittedDominant.length) classification = "PARTIALLY_ALIGNED";
    return { spotId: candidate.spot_id ?? candidate.id, explanation, dominantFactors: dominant, claimedFactors: claimed, supportedFactors: supported, unsupportedFactors: unsupported, omittedDominantFactors: omittedDominant, classification };
  });
  return { arm: "explanation", executableMeasurements: measurements.length, measurements, counts: Object.fromEntries(["ALIGNED", "PARTIALLY_ALIGNED", "MISLEADING", "UNSUPPORTED"].map((key) => [key, measurements.filter((item) => item.classification === key).length])), hash: contentHash(measurements) };
}

export async function runExplanationAlignment({ cases, executor, engineSourceHash }) {
  const measurements = [];
  for (const item of cases) {
    const run = await execute(executor, { userId: item.userId, request: item.request, context: item.context, diagnostic: { arm: "explanation", caseId: item.id } }, engineSourceHash);
    const result = evaluateExplanationAlignment({ candidates: run.candidates });
    measurements.push(...result.measurements.map((row) => ({ caseId: item.id, traceHash: run.trace.traceHash, ...row })));
  }
  return { arm: "explanation", executableMeasurements: measurements.length, measurements, counts: Object.fromEntries(["ALIGNED", "PARTIALLY_ALIGNED", "MISLEADING", "UNSUPPORTED"].map((key) => [key, measurements.filter((item) => item.classification === key).length])), hash: contentHash(measurements) };
}

export function coverageReport({ expected, results }) {
  const rows = Object.entries(expected.arms).map(([arm, contract]) => {
    const result = results[arm];
    const executable = result?.executableMeasurements ?? 0;
    const expectedCount = contract.minimumExecutable;
    return { arm, expectedMeasurements: expectedCount, executableMeasurements: executable, missingMeasurements: Math.max(0, expectedCount - executable), invalidMeasurements: result?.invalidMeasurements ?? 0, coveragePercent: expectedCount ? Math.min(100, executable / expectedCount * 100) : 0, complete: executable >= expectedCount && !(result?.invalidMeasurements) };
  });
  const ready = rows.every((row) => row.complete);
  return { version: expected.version, rows, ready, verdict: ready ? "READY" : "NOT_READY", hash: contentHash(rows) };
}

export function pairedQuality(idsValue, utilityById, threshold = 0.6) { return listQuality(idsValue, utilityById, threshold, 10); }
