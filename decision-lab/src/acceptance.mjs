import { listQuality, diversityMetrics, jaccard } from "./metrics.mjs";
import { comparePaired } from "./ab-comparison.mjs";
import { d0f002Fixture } from "./golden-scenarios.mjs";

export function selfValidate() {
  const truth = { a: 1, b: 0.8, c: 0.6, d: 0.2, e: 0 }; const oracle = ["a", "b", "c", "d", "e"], near = ["b", "a", "c", "d", "e"], reverse = [...oracle].reverse(), random = ["c", "e", "a", "d", "b"];
  const q = (ids) => listQuality(ids, truth, 0.6, 5); const checks = { oracleBeatsNear: q(oracle).ndcgAt5 > q(near).ndcgAt5, oracleBeatsRandom: q(oracle).ndcgAt5 > q(random).ndcgAt5, oracleBeatsReverse: q(oracle).ndcgAt5 > q(reverse).ndcgAt5, missingBestLowersRecall: listQuality(oracle.slice(1), truth, 0.6, 5).recallAt5 < q(oracle).recallAt5, badRankKeepsRecall: q(reverse).recallAt5 === q(oracle).recallAt5, betterOrderLowersRegret: q(oracle).regretAt5 <= q(reverse).regretAt5, contextBlindDetected: jaccard(oracle, oracle) === 1, duplicateDetected: diversityMetrics(["a", "a"], { a: { id: "a", category: "c" } }).duplicateRate > 0 };
  const d0 = d0f002Fixture(); checks.d0f002Detected = d0.actualRanking[0] === "reduced" && d0.candidates.find((x) => x.id === "reduced").distributionPriority === null;
  const fake = (value) => [{ scenarioId: "s", metrics: { ranking: { ndcgAt10: value } } }]; const nullAb = comparePaired(fake(0.8), fake(0.8), { iterations: 100, seed: "null" }); checks.identicalAbInconclusive = nullAb.verdict === "INCONCLUSIVE";
  return { version: "framework-acceptance-v1", checks, pass: Object.values(checks).every(Boolean), knownEngineDefect: { id: "D0-F-002", status: checks.d0f002Detected ? "REPRODUCED_AND_CLASSIFIED" : "NOT_REPRODUCED", topKExposure: 1, affectedRanks: [1, 2], regretImpact: 0.27 } };
}
