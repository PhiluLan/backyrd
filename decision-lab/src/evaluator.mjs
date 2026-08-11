import { contentHash } from "./canonical-json.mjs";
import { assertTrace, failureRecord } from "./contracts.mjs";
import { diversityMetrics, eligible, listQuality, weightedUtilityRecall } from "./metrics.mjs";
import { latentUtility } from "./utility.mjs";

export function groundTruth(world, scenario) {
  const user = world.users.find((item) => item.id === scenario.userId); const context = world.contexts.find((item) => item.id === scenario.context.contextId);
  if (!user || !context) throw new Error("Ground-truth reference missing");
  const universe = world.spots.filter(eligible).filter((spot) => !scenario.hardConstraints.category || spot.category === scenario.hardConstraints.category).filter((spot) => !scenario.hardConstraints.exclusions.includes(spot.category));
  return Object.fromEntries(universe.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
}

export function attributeFailure({ trace, truth, scenario }) {
  const failures = []; const final = trace.results.map((item) => item.id); const first = trace.stages[0]?.candidates.map((item) => item.id) ?? []; const best = Object.entries(truth).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const item of trace.results) {
    if (item.status !== "approved") failures.push(failureRecord({ id: `${scenario.id}:${item.id}:eligibility`, primaryClass: "ELIGIBILITY_FAILURE", severity: "P0", scenarioId: scenario.id, candidateId: item.id, rank: final.indexOf(item.id) + 1, expected: "approved", actual: item.status, evidence: "trace.results" }));
    if (["quarantined", "excluded"].includes(item.distribution)) failures.push(failureRecord({ id: `${scenario.id}:${item.id}:distribution`, primaryClass: "DISTRIBUTION_FAILURE", severity: "P0", scenarioId: scenario.id, candidateId: item.id, expected: "eligible distribution", actual: item.distribution, evidence: "trace.results" }));
  }
  if (best && !first.includes(best)) failures.push(failureRecord({ id: `${scenario.id}:retrieval`, primaryClass: "RETRIEVAL_FAILURE", scenarioId: scenario.id, expected: best, actual: "missing from first pool", evidence: "trace.stages[0]" }));
  else if (best && final.indexOf(best) > 2) failures.push(failureRecord({ id: `${scenario.id}:ranking`, primaryClass: "RANKING_FAILURE", scenarioId: scenario.id, expected: `${best} near top`, actual: final.indexOf(best) + 1, evidence: "trace.results" }));
  return failures;
}

export function evaluateTrace({ world, scenario, trace, constitution, identity }) {
  assertTrace(trace); const truth = groundTruth(world, scenario); const ids = trace.results.map((item) => item.id); const spotById = Object.fromEntries(world.spots.map((spot) => [spot.id, spot])); const threshold = scenario.relevanceRule.utilityAtLeast; const stages = Object.fromEntries(trace.stages.map((stage) => [stage.name, { ...listQuality(stage.candidates.map((c) => c.id), truth, threshold, Math.min(20, stage.candidates.length || 20)), weightedUtilityRecall: weightedUtilityRecall(stage.candidates.map((c) => c.id), truth, stage.candidates.length) }]));
  const metrics = { ranking: { ...listQuality(ids, truth, threshold, 5), ...listQuality(ids, truth, threshold, 10) }, diversity: diversityMetrics(ids, spotById), stages };
  const failures = attributeFailure({ trace, truth, scenario }); const hardPass = !failures.some((f) => ["P0", "P1"].includes(f.severity)); const body = { ...identity, scenarioId: scenario.id, frameworkValidity: "PASS", engineQuality: hardPass ? "PASS" : "FAIL", hardGates: { pass: hardPass, failures: failures.filter((f) => ["P0", "P1"].includes(f.severity)).map((f) => f.id) }, metrics, failures };
  body.outputHash = contentHash({ scenarioId: body.scenarioId, hardGates: body.hardGates, metrics: body.metrics, failures: body.failures }); return body;
}

export function aggregate(records, constitution) {
  const valid = records.filter((r) => r.frameworkValidity === "PASS"); const mean = (path) => { const values = valid.map(path).filter((x) => x !== null && x !== undefined); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
  const summary = { validRuns: valid.length, invalidRuns: records.length - valid.length, hardGatePass: valid.every((r) => r.hardGates.pass), ndcgAt10: mean((r) => r.metrics.ranking.ndcgAt10), recallAt10: mean((r) => r.metrics.ranking.recallAt10), precisionAt10: mean((r) => r.metrics.ranking.precisionAt10), duplicateRate: mean((r) => r.metrics.diversity.duplicateRate), failureCounts: Object.fromEntries([...new Set(valid.flatMap((r) => r.failures.map((f) => f.primaryClass)))].sort().map((key) => [key, valid.flatMap((r) => r.failures).filter((f) => f.primaryClass === key).length])) };
  return { summary, verdict: !records.length || valid.length !== records.length ? "INVALID" : summary.hardGatePass && summary.ndcgAt10 >= constitution.dimensionFloors.ndcgAt10 ? "PASS" : "FAIL", hash: contentHash(summary) };
}
