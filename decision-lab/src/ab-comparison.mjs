import { createHmac } from "node:crypto";
import { contentHash } from "./canonical-json.mjs";
import { pairedBootstrap } from "./statistics.mjs";

const label = (key, scenarioId) => createHmac("sha256", key).update(scenarioId).digest()[0] % 2 === 0;
export function blindComparison({ snapshotA, snapshotB, resultsA, resultsB, key }) {
  if (snapshotA.worldHash !== snapshotB.worldHash || snapshotA.evaluationVersion !== snapshotB.evaluationVersion || snapshotA.embeddingMode !== snapshotB.embeddingMode) throw new Error("Incompatible engine snapshots");
  const pairs = resultsA.map((a) => { const b = resultsB.find((item) => item.scenarioId === a.scenarioId); if (!b) return { scenarioId: a.scenarioId, status: "INVALID_PAIR" }; const aLeft = label(key, a.scenarioId); return { scenarioId: a.scenarioId, left: aLeft ? a.metrics : b.metrics, right: aLeft ? b.metrics : a.metrics, positionToken: contentHash([a.scenarioId, aLeft]).slice(0, 12) }; });
  const bundle = { version: "blinded-comparison-v1", pairs, sealed: true }; bundle.hash = contentHash(bundle); return { reviewBundle: bundle, blindingKey: { version: "blinding-key-v1", mappingHash: contentHash(pairs.map((p) => p.positionToken)), key } };
}
export function comparePaired(resultsA, resultsB, bootstrap) { const pairs = resultsA.flatMap((a) => { const b = resultsB.find((x) => x.scenarioId === a.scenarioId); return b ? [[a.metrics.ranking.ndcgAt10, b.metrics.ranking.ndcgAt10]] : []; }); const stats = pairedBootstrap(pairs, bootstrap); return { stats, verdict: stats.n === 0 ? "INCONCLUSIVE" : stats.interval[0] > 0 ? "B_BETTER" : stats.interval[1] < 0 ? "A_BETTER" : "INCONCLUSIVE" }; }
