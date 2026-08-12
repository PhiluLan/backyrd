import { listQuality, diversityMetrics, jaccard, fallbackMetrics, explanationMetrics, repetitionMetrics, contextResponse } from "./metrics.mjs";
import { comparePaired } from "./ab-comparison.mjs";
import { d0f002Fixture } from "./golden-scenarios.mjs";
import { HARD_GATE_REGISTRY, aggregateHardGates } from "./hard-gates.mjs";
import { d3Readiness, frameworkGuards } from "./hard-gate-acceptance.mjs";

export function selfValidate(constitution) {
  const truth = { a: 1, b: 0.8, c: 0.6, d: 0.2, e: 0 }; const oracle = ["a", "b", "c", "d", "e"], near = ["b", "a", "c", "d", "e"], reverse = [...oracle].reverse(), random = ["c", "e", "a", "d", "b"];
  const q = (ids) => listQuality(ids, truth, 0.6, 5); const context = contextResponse(oracle, ["b","a","c"], truth, { a:0.7,b:1,c:0.5 }); const checks = { oracleBeatsNear: q(oracle).ndcgAt5 > q(near).ndcgAt5, oracleBeatsRandom: q(oracle).ndcgAt5 > q(random).ndcgAt5, oracleBeatsReverse: q(oracle).ndcgAt5 > q(reverse).ndcgAt5, missingBestLowersRecall: listQuality(oracle.slice(1), truth, 0.6, 5).recallAt5 < q(oracle).recallAt5, badRankKeepsRecall: q(reverse).recallAt5 === q(oracle).recallAt5, betterOrderLowersRegret: q(oracle).regretAt5 <= q(reverse).regretAt5, irrelevantTailNoTopKGain: listQuality([...oracle,"z"], {...truth,z:0},0.6,5).ndcgAt5 === q(oracle).ndcgAt5, contextBlindDetected: jaccard(oracle, oracle) === 1, contextDirectionDetected: context.directional, duplicateDetected: diversityMetrics(["a", "a"], { a: { id: "a", category: "c" } }).duplicateRate > 0, repetitionDetected: repetitionMetrics([["a"],["a"]]).repeatedTop1Rate > 0, honestEmptyPreferred: fallbackMetrics({activated:true,results:[],eligibleIds:[],utilityById:{}}).honestEmpty, invalidFallbackRejected: fallbackMetrics({activated:true,results:["x"],eligibleIds:[],utilityById:{}}).eligibleFallbackRate === 0, supportedExplanationWins: explanationMetrics([{claims:["x"],evidence:["e"],unsupportedClaims:[]}]).factualSupport > explanationMetrics([{claims:["x"],evidence:[],unsupportedClaims:["x"]}]).factualSupport };
  const d0 = d0f002Fixture(); checks.d0f002Detected = d0.actualRanking[0] === "reduced" && d0.candidates.find((x) => x.id === "reduced").distributionPriority === null;
  const fake = (value) => [{ scenarioId: "s", metrics: { ranking: { ndcgAt10: value } } }]; const nullAb = comparePaired(fake(0.8), fake(0.8), { iterations: 100, seed: "null" }); checks.identicalAbInconclusive = nullAb.verdict === "INCONCLUSIVE";
  const guards = frameworkGuards(constitution);
  const missingRegistry = HARD_GATE_REGISTRY.slice(1);
  const missingEvaluatorGuard = !frameworkGuards(constitution, missingRegistry).pass;
  const placeholderEvaluatorGuard = HARD_GATE_REGISTRY.every((target) => {
    const placeholderRegistry = HARD_GATE_REGISTRY.map((gate) => gate.id === target.id ? { ...gate, evaluate() { return { gateId: gate.id, status: "PASS", applicable: true, expected: "placeholder", observed: "placeholder", reason: "placeholder", evidence: {}, severity: "hard" }; } } : gate);
    return !frameworkGuards(constitution, placeholderRegistry).pass;
  });
  const ignoredFailure = aggregateHardGates([{ gateId: "TEST", status: "FAIL", applicable: true }]);
  const aggregationGuard = ignoredFailure.pass === false && ignoredFailure.status === "FAIL";
  checks.hardGateCoverage = guards.coverage.pass;
  checks.hardGateAdversarial = guards.adversarial.pass;
  checks.missingEvaluatorDetected = missingEvaluatorGuard;
  checks.placeholderEvaluatorDetected = placeholderEvaluatorGuard;
  checks.hardGateAggregation = aggregationGuard;
  const pass = Object.values(checks).every(Boolean);
  const readinessProbe = d3Readiness({ integrity: { valid: true }, acceptance: { pass, guards }, freezeValid: true, engineUnchanged: true });
  const missingReadinessProbe = d3Readiness({ integrity: { valid: true }, acceptance: { pass: false, guards: frameworkGuards(constitution, missingRegistry) }, freezeValid: true, engineUnchanged: true });
  checks.readyWhenComplete = readinessProbe.status === "READY";
  checks.notReadyWhenEvaluatorMissing = missingReadinessProbe.status === "NOT_READY";
  return { version: constitution.frameworkAcceptanceVersion, checks, guards, pass: Object.values(checks).every(Boolean), readinessProbe, missingReadinessProbe, knownEngineDefect: { id: "D0-F-002", status: checks.d0f002Detected ? "REPRODUCED_AND_CLASSIFIED" : "NOT_REPRODUCED", topKExposure: 1, affectedRanks: [1, 2], regretImpact: 0.27 } };
}
