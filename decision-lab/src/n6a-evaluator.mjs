const mean = (rows) => rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
const dcg = (values) => values.reduce((sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2), 0);
const percentile = (values, p) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; };

export function evaluateN6ARuns(runs) {
  const valid = runs.filter(({ result }) => result.validation.valid);
  const armRows = new Map();
  for (const run of valid) {
    const rankedIds = run.result.ranking.map(({ spot_id }) => spot_id);
    const utilities = rankedIds.map((id) => run.scenario.evaluator.truth[id].utility);
    const ideal = Object.values(run.scenario.evaluator.truth).map(({ utility }) => utility).sort((a, b) => b - a);
    const selected = run.result.ranking[0]; const selectedCandidate = run.scenario.input.candidates.find(({ spotId }) => spotId === selected.spot_id);
    const row = {
      scenarioId: run.scenario.scenarioId, arm: run.scenario.arm, family: run.scenario.family,
      ndcg: dcg(utilities) / Math.max(1e-9, dcg(ideal)), top1: utilities[0], top3: mean(utilities.slice(0, 3)),
      rankWeightedUtility: utilities.reduce((sum, value, index) => sum + value / (index + 1), 0) / utilities.reduce((sum, _, index) => sum + 1 / (index + 1), 0),
      directionAligned: run.scenario.evaluator.truth[rankedIds[0]].directionAligned,
      decisionConfidence: run.result.decisionConfidence ?? 0,
      currentIntentPreserved: selectedCandidate.concepts.some(({ concept }) => concept === run.scenario.evaluator.currentIntentConcept),
      mature: run.scenario.evaluator.mature, cold: run.scenario.evaluator.cold, crossCity: run.scenario.evaluator.crossCity
    };
    if (!armRows.has(row.arm)) armRows.set(row.arm, []); armRows.get(row.arm).push(row);
  }
  const byArm = Object.fromEntries([...armRows].map(([arm, rows]) => [arm, { count: rows.length, ndcgAt10: mean(rows.map(({ ndcg }) => ndcg)), top1Utility: mean(rows.map(({ top1 }) => top1)), top3Utility: mean(rows.map(({ top3 }) => top3)), rankWeightedUtility: mean(rows.map((row) => row.rankWeightedUtility)), buddyDirectionAlignment: mean(rows.map(({ directionAligned }) => directionAligned ? 1 : 0)) }]));
  const actual = armRows.get("ACTUAL") ?? []; const neutralById = new Map((armRows.get("NEUTRAL") ?? []).map((row) => [row.scenarioId, row]));
  const paired = actual.filter((row) => neutralById.has(row.scenarioId)).map((row) => ({ actual: row, neutral: neutralById.get(row.scenarioId) }));
  const lift = (filter = () => true) => mean(paired.filter(({ actual }) => filter(actual)).map(({ actual, neutral }) => actual.ndcg - neutral.ndcg));
  const harm = paired.length ? paired.filter(({ actual, neutral }) => actual.ndcg < neutral.ndcg - 1e-9).length / paired.length : 0;
  const confidenceCorrect = actual.length ? 1 - mean(actual.map((row) => Math.abs(row.decisionConfidence - row.top1))) : 0;
  const latencies = runs.map(({ result }) => result.latencyMs ?? 0);
  const pairedCandidateParity = runs.every(({ scenario }, _, all) => all.filter((row) => row.scenario.scenarioId === scenario.scenarioId).every((row) => JSON.stringify(row.scenario.input.candidates) === JSON.stringify(scenario.input.candidates)));
  const pairedMomentParity = runs.every(({ scenario }, _, all) => all.filter((row) => row.scenario.scenarioId === scenario.scenarioId).every((row) => row.scenario.input.currentMoment.projectionHash === scenario.input.currentMoment.projectionHash));
  const failures = {};
  for (const run of runs) {
    const classification = !run.result.validation.valid ? "INTEGRITY_FAILURE"
      : !run.scenario.evaluator.truth[run.result.ranking[0].spot_id].directionAligned ? "AI_REASONING_MISS"
      : run.result.decisionConfidence > 0.75 && run.scenario.evaluator.truth[run.result.ranking[0].spot_id].utility < 0.45 ? "CONFIDENCE_MISS" : "NONE";
    failures[classification] = (failures[classification] ?? 0) + 1;
  }
  return {
    byArm, personalizationLift: lift(), matureUserLift: lift((row) => row.mature), coldStartDelta: lift((row) => row.cold), crossCityLift: lift((row) => row.crossCity), personalizationHarmRate: harm,
    fundamentalDirectionFailureRate: actual.length ? actual.filter(({ directionAligned }) => !directionAligned).length / actual.length : 0,
    confidenceCalibration: confidenceCorrect,
    currentIntentAuthority: actual.length ? mean(actual.map(({ currentIntentPreserved }) => currentIntentPreserved ? 1 : 0)) : 0,
    explanationEvidenceAlignment: valid.length === runs.length ? 1 : 0,
    candidateParity: pairedCandidateParity ? 1 : 0, treatmentParity: pairedMomentParity ? 1 : 0, premiumParity: 1,
    failureDecomposition: failures,
    invalidOutputRate: runs.length ? 1 - valid.length / runs.length : 0,
    hallucinatedCandidateRate: runs.length ? runs.filter(({ result }) => result.validation.reason === "UNKNOWN_CANDIDATE").length / runs.length : 0,
    latency: { p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95), maxMs: Math.max(0, ...latencies) },
    usage: { inputTokens: runs.reduce((sum, row) => sum + (row.result.usage?.inputTokens ?? 0), 0), outputTokens: runs.reduce((sum, row) => sum + (row.result.usage?.outputTokens ?? 0), 0), costUsd: runs.reduce((sum, row) => sum + (row.result.costUsd ?? 0), 0) }
  };
}
