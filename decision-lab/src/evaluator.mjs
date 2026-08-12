import { contentHash } from "./canonical-json.mjs";
import { assertEvaluationResult, assertIdentity, assertScenario, assertTrace, failureRecord } from "./contracts.mjs";
import { aggregateHardGates, CERTIFIED_EVALUATION_MODE, evaluateHardGates } from "./hard-gates.mjs";
import { diversityMetrics, eligible, listQuality, weightedUtilityRecall } from "./metrics.mjs";
import { latentUtility } from "./utility.mjs";

export function groundTruth(world, scenario) {
  const user = world.users.find((item) => item.id === scenario.userId);
  const context = world.contexts.find((item) => item.id === scenario.context.contextId);
  if (!user || !context) throw new Error("Ground-truth reference missing");
  const universe = world.spots
    .filter(eligible)
    .filter((spot) => !scenario.hardConstraints.city || spot.observed.city === scenario.hardConstraints.city)
    .filter((spot) => !scenario.hardConstraints.category || spot.category === scenario.hardConstraints.category)
    .filter((spot) => !scenario.hardConstraints.exclusions.includes(spot.category))
    .filter((spot) => !scenario.hardConstraints.openNow || spot.latent.openByContext?.[context.timeBucket] === true);
  return Object.fromEntries(universe.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
}

const gateFailureClass = {
  PRODUCT_ELIGIBILITY: "ELIGIBILITY_FAILURE",
  DISTRIBUTION_ELIGIBILITY: "DISTRIBUTION_FAILURE",
  ENTITY_INTEGRITY: "ENTITY_INTEGRITY_FAILURE",
  LATENT_LEAKAGE: "LATENT_LEAKAGE_FAILURE",
  CITY: "CONSTRAINT_FAILURE",
  HARD_CATEGORY: "CONSTRAINT_FAILURE",
  CATEGORY_EXCLUSION: "CONSTRAINT_FAILURE",
  OPEN_NOW: "OPENING_HOURS_FAILURE",
  DUPLICATE_RESULTS: "DUPLICATE_FAILURE"
};

function hardGateFailures(gates, scenario) {
  return gates.filter((gate) => gate.status === "FAIL").map((gate) => failureRecord({
    id: `${scenario.id}:hard:${gate.gateId}`,
    primaryClass: gateFailureClass[gate.gateId] ?? "EVALUATOR_FAILURE",
    severity: ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY"].includes(gate.gateId) ? "P0" : "P1",
    scenarioId: scenario.id,
    expected: gate.expected,
    actual: gate.observed,
    evidence: gate.evidence,
    reason: gate.reason
  }));
}

export function attributeFailure({ trace, truth, scenario, hardGates = [] }) {
  const failures = hardGateFailures(hardGates, scenario);
  const final = trace.results.map((item) => item.id);
  const first = trace.stages[0]?.candidates.map((item) => item.id) ?? [];
  const best = Object.entries(truth).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best && !first.includes(best)) failures.push(failureRecord({ id: `${scenario.id}:retrieval`, primaryClass: "RETRIEVAL_FAILURE", scenarioId: scenario.id, expected: best, actual: "missing from first pool", evidence: "trace.stages[0]" }));
  else if (best && final.indexOf(best) > 2) failures.push(failureRecord({ id: `${scenario.id}:ranking`, primaryClass: "RANKING_FAILURE", scenarioId: scenario.id, expected: `${best} near top`, actual: final.indexOf(best) + 1, evidence: "trace.results" }));
  return failures;
}

function assertCompatible({ constitution, scenario, identity }) {
  if (constitution.evaluationMode !== CERTIFIED_EVALUATION_MODE) throw new Error("Only CERTIFIED evaluation mode can produce D2.1 results");
  if (identity.evaluationVersion !== constitution.evaluationVersion) throw new Error("Unsupported evaluation version");
  if (identity.scenarioVersion !== constitution.scenarioVersion || scenario.version !== constitution.scenarioVersion) throw new Error("Unsupported scenario version");
  if (identity.gateVersion !== constitution.gateVersion) throw new Error("Unsupported hard-gate version");
}

export function evaluateTrace({ world, scenario, trace, constitution, identity, gateRegistry }) {
  assertTrace(trace);
  assertScenario(scenario);
  assertIdentity(identity);
  assertCompatible({ constitution, scenario, identity });
  const truth = groundTruth(world, scenario);
  const ids = trace.results.map((item) => item.id);
  const spotById = Object.fromEntries(world.spots.map((spot) => [spot.id, spot]));
  const threshold = scenario.relevanceRule.utilityAtLeast;
  const stages = Object.fromEntries(trace.stages.map((stage) => [stage.name, {
    ...listQuality(stage.candidates.map((candidate) => candidate.id), truth, threshold, Math.min(20, stage.candidates.length || 20)),
    weightedUtilityRecall: weightedUtilityRecall(stage.candidates.map((candidate) => candidate.id), truth, stage.candidates.length)
  }]));
  const metrics = {
    ranking: { ...listQuality(ids, truth, threshold, 5), ...listQuality(ids, truth, threshold, 10) },
    diversity: diversityMetrics(ids, spotById),
    stages
  };
  const gateResults = evaluateHardGates({ world, scenario, trace, constitution }, gateRegistry);
  const hardGates = aggregateHardGates(gateResults);
  const failures = attributeFailure({ trace, truth, scenario, hardGates: gateResults });
  const frameworkValidity = hardGates.complete ? "PASS" : "INCOMPLETE";
  const engineQuality = hardGates.status === "PASS" ? "PASS" : hardGates.status === "FAIL" ? "FAIL" : "NOT_EVALUATED";
  const body = {
    ...identity,
    resultSchemaVersion: constitution.resultSchemaVersion,
    evaluationMode: constitution.evaluationMode,
    scenarioId: scenario.id,
    scenarioValidity: "PASS",
    frameworkValidity,
    evaluationCompleteness: hardGates.complete ? "COMPLETE" : "INCOMPLETE",
    engineQuality,
    certifiable: frameworkValidity === "PASS" && hardGates.pass,
    hardGates,
    metrics,
    failures
  };
  body.outputHash = contentHash({ scenarioId: body.scenarioId, resultSchemaVersion: body.resultSchemaVersion, hardGates: body.hardGates, metrics: body.metrics, failures: body.failures });
  return assertEvaluationResult(body);
}

export function aggregate(records, constitution) {
  const valid = records.filter((record) => record.frameworkValidity === "PASS");
  const mean = (path) => { const values = valid.map(path).filter((value) => value !== null && value !== undefined); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
  const summary = {
    validRuns: valid.length,
    invalidRuns: records.length - valid.length,
    certifiableRuns: records.filter((record) => record.certifiable).length,
    hardGatePass: records.every((record) => record.hardGates.pass),
    ndcgAt10: mean((record) => record.metrics.ranking.ndcgAt10),
    recallAt10: mean((record) => record.metrics.ranking.recallAt10),
    precisionAt10: mean((record) => record.metrics.ranking.precisionAt10),
    duplicateRate: mean((record) => record.metrics.diversity.duplicateRate),
    failureCounts: Object.fromEntries([...new Set(valid.flatMap((record) => record.failures.map((failure) => failure.primaryClass)))].sort().map((key) => [key, valid.flatMap((record) => record.failures).filter((failure) => failure.primaryClass === key).length]))
  };
  const verdict = !records.length || valid.length !== records.length ? "INVALID" : summary.hardGatePass && summary.ndcgAt10 >= constitution.dimensionFloors.ndcgAt10 ? "PASS" : "FAIL";
  return { summary, verdict, hash: contentHash(summary) };
}
