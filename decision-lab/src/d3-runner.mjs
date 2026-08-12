import { createHash, createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import { buildGoldenScenarios } from "./golden-scenarios.mjs";
import { contentHash } from "./canonical-json.mjs";
import { evaluateTrace, groundTruth } from "./evaluator.mjs";
import { generateWorld } from "./generator.mjs";
import { validateWorld } from "./health.mjs";
import { loadCanonicalDecisionHandler } from "./canonical-engine.mjs";
import { outcomePotential } from "./metrics.mjs";
import { sealTrace } from "./replay.mjs";
import { latentUtility } from "./utility.mjs";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (sub, secret) => { const head = encode({ alg: "HS256", typ: "JWT" }); const body = encode({ aud: "authenticated", exp: 1999999999, iat: 1700000000, iss: "supabase-d3", role: "authenticated", sub }); return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`; };
const mean = (values) => { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; };
const q = (values, p) => { const valid = values.filter(Number.isFinite).sort((a, b) => a - b); return valid.length ? valid[Math.min(valid.length - 1, Math.ceil(valid.length * p) - 1)] : null; };
const idList = (rows) => (rows ?? []).map((row) => row.spot_id ?? row.id).filter(Boolean);
const sourceKey = (candidate) => candidate.sources?.length === 2 ? "overlap" : candidate.sources?.includes("personalized_v12") ? "v12_only" : candidate.semantic_similarity === 0 && candidate.document_preview === "Distribution-safe alternative candidate" ? "fallback" : "semantic_only";

function engineIdentity(world, constitution, runId, split, inputHash) {
  return { worldId: world.manifest.worldId, worldHash: world.manifest.worldHash, split, seedId: world.manifest.seed, generatorVersion: world.manifest.generatorVersion, groundTruthVersion: constitution.groundTruthVersion, scenarioVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion, gateVersion: constitution.gateVersion, gitSha: world.manifest.gitSha, migrationHash: world.manifest.migrationHash, engineSourceHash: world.manifest.engineSourceHash, embeddingMode: world.manifest.embeddingMode, runId, inputHash, outputHash: "pending" };
}

function requestForScenario(scenario) {
  const family = scenario.family;
  const query = {
    product_eligibility: "exact approved discovery",
    distribution: "trusted places",
    exact_name: family.replaceAll("_", " "),
    broad_query: "something good in Basel",
    category_intent: scenario.hardConstraints.category,
    negation: "keine Bar, etwas ruhiges",
    open_now: "jetzt offen",
    geo: "nearby in Basel",
    cold_start: "gemütlich und unkompliziert",
    mature_personalization: "etwas passend für mich",
    audience: `${scenario.context.audience} passende Idee`,
    quiet_lively: scenario.softPreferences.moods.quiet > scenario.softPreferences.moods.lively ? "ruhig" : "lebhaft",
    price: "nicht teuer",
    semantic_only: "ungewöhnlich inspirierend entdecken",
    fallback: "eine sichere Alternative",
    zero_result: "sicher passende Idee",
    repetition: "etwas anderes als zuletzt",
    explanation: "warum passt dieser Ort"
  }[family] ?? scenario.request.query;
  return {
    city: scenario.request.city,
    query,
    rawFreeText: query,
    inputMode: ["category_intent", "exact_name"].includes(family) ? "guided" : "free_text",
    preferredPlaceTypes: scenario.hardConstraints.category ? [scenario.hardConstraints.category] : [],
    excludedPlaceTypes: scenario.hardConstraints.exclusions,
    audience: [scenario.context.audience],
    occasions: [scenario.context.timeBucket, scenario.context.weekday === 0 ? "sunday" : "weekday"],
    strictCategoryIntent: Boolean(scenario.hardConstraints.category),
    limit: 10,
    v12Limit: 16,
    semanticLimit: 24,
    excludeSpotIds: []
  };
}

function stageRows(world, ids) {
  return ids.map((id) => { const spot = world.spots.find((item) => item.id === id); return { id, status: spot?.observed.status, distribution: spot?.observed.distribution }; });
}

function traceFrom(payload, observed, world, scenario) {
  const rawV12 = observed?.v12Candidates ?? [];
  const rawSemantic = observed?.semanticCandidates ?? [];
  const distributedV12 = observed?.distributedV12 ?? [];
  const distributedSemantic = observed?.distributedSemantic ?? [];
  const union = [...new Set([...idList(distributedV12), ...idList(distributedSemantic)])];
  const results = payload.candidates.map((candidate) => ({ id: candidate.spot_id, status: world.spots.find((spot) => spot.id === candidate.spot_id)?.observed.status, distribution: world.spots.find((spot) => spot.id === candidate.spot_id)?.observed.distribution, explanation: { claims: [candidate.human_reason], evidence: Object.values(candidate.explanation ?? {}).filter((value) => Number.isFinite(value) && value !== 0).map(String), unsupportedClaims: [], constraintCorrect: true } }));
  return sealTrace({ traceVersion: "decision-flight-recorder-v1", scenarioId: scenario.id, stages: [
    { name: "v12", candidates: stageRows(world, idList(rawV12)) },
    { name: "semantic", candidates: stageRows(world, idList(rawSemantic)) },
    { name: "post_distribution_v12", candidates: stageRows(world, idList(distributedV12)) },
    { name: "post_distribution_semantic", candidates: stageRows(world, idList(distributedSemantic)) },
    { name: "union", candidates: stageRows(world, union) },
    { name: "final", candidates: results }
  ], results });
}

function candidateDiagnostics(world, scenario, payload, observed) {
  const user = world.users.find((item) => item.id === scenario.userId);
  const context = world.contexts.find((item) => item.id === scenario.context.contextId);
  const before = new Map((observed?.fusedBeforeFinalMetadata ?? []).map((candidate, index) => [candidate.spot_id, index + 1]));
  const distribution = new Map((observed?.distribution ?? []).map((row) => [row.entity_id, row]));
  return payload.candidates.map((candidate) => {
    const spot = world.spots.find((item) => item.id === candidate.spot_id);
    const utility = spot ? latentUtility(user, spot, context) : null;
    return { spotId: candidate.spot_id, syntheticSpotClass: spot?.density ?? null, source: sourceKey(candidate), sourceMembership: candidate.sources, v12Rank: candidate.v12_rank, v12Score: candidate.v12_score, semanticRank: candidate.semantic_rank, semanticSimilarity: candidate.semantic_similarity, distributionState: spot?.observed.distribution ?? null, distributionPriority: distribution.get(candidate.spot_id)?.distribution_priority ?? null, productEligibility: spot?.observed.status === "approved", tasteContribution: (candidate.explanation?.personalized_component ?? 0) + (candidate.explanation?.place_type_boost ?? 0) + (candidate.explanation?.contextual_taste_component ?? 0), contextContribution: (candidate.explanation?.place_type_boost ?? 0) + (candidate.explanation?.contextual_taste_component ?? 0), intentContribution: (candidate.explanation?.intent_boost ?? 0) + (candidate.explanation?.category_fit_component ?? 0), memoryContribution: candidate.explanation?.recent_memory_component ?? 0, penalties: (candidate.explanation?.category_mismatch_penalty ?? 0) + (candidate.explanation?.v12_only_penalty ?? 0) + (candidate.explanation?.weak_intent_penalty ?? 0), personalizedContribution: candidate.explanation?.personalized_component ?? 0, semanticContribution: candidate.explanation?.semantic_component ?? 0, sourceBonus: candidate.explanation?.source_bonus ?? 0, fusionScore: candidate.combined_score, preDiversityRank: before.get(candidate.spot_id) ?? null, finalRank: candidate.rank, latentUtility: utility?.utility ?? null, latentUtilityComponents: utility?.components ?? null, humanReason: candidate.human_reason };
  });
}

function missedOpportunity(world, scenario, trace, diagnostics) {
  const truth = groundTruth(world, scenario);
  const best = Object.entries(truth).sort((a, b) => b[1] - a[1])[0];
  if (!best) return { bestEligibleSpotId: null, utility: null, disposition: "NO_ELIGIBLE_SPOT" };
  const [id, utility] = best;
  const stages = Object.fromEntries(trace.stages.map((stage) => [stage.name, new Set(stage.candidates.map((candidate) => candidate.id))]));
  const final = diagnostics.find((candidate) => candidate.spotId === id);
  let disposition = "NEVER_RETRIEVED";
  if (stages.v12?.has(id) && !stages.semantic?.has(id)) disposition = "V12_ONLY";
  if (!stages.v12?.has(id) && stages.semantic?.has(id)) disposition = "SEMANTIC_ONLY";
  if ((stages.v12?.has(id) || stages.semantic?.has(id)) && !stages.union?.has(id)) disposition = "REMOVED_BY_DISTRIBUTION";
  if (stages.union?.has(id) && !final) disposition = "REMOVED_BY_FUSION_OR_DIVERSITY";
  if (final?.finalRank > 3) disposition = final.finalRank <= 10 ? "SHOWN_NOT_TOP3" : "TOO_LOW";
  if (final?.finalRank <= 3) disposition = "TOP3";
  return { bestEligibleSpotId: id, utility, finalRank: final?.finalRank ?? null, disposition };
}

export async function runWorld({ config, metadata, constitution, env }) {
  const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata);
  const health = validateWorld(world);
  if (!health.valid) throw new Error(`World health failed: ${JSON.stringify(health.failures)}`);
  const canonical = await loadCanonicalDecisionHandler({ env, embeddingMode: config.embeddingMode });
  const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion);
  const records = [];
  try {
    for (const scenario of scenarios) {
      const requestBody = requestForScenario(scenario);
      const token = jwt(scenario.userId, env.DECISION_LAB_JWT_SECRET);
      const request = new Request("http://decision-lab.local/functions/v1/decision-v13", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(requestBody) });
      globalThis.__backyrdDecisionLabTrace = null;
      const started = performance.now();
      const response = await canonical.handler(request);
      const payload = await response.json();
      const latencyMs = Number((performance.now() - started).toFixed(3));
      if (!response.ok || !payload.ok) throw new Error(`${scenario.id}:${payload.error ?? response.status}`);
      const observed = canonical.getTrace();
      const trace = traceFrom(payload, observed, world, scenario);
      const inputHash = contentHash({ requestBody, scenarioHash: scenario.hash, traceHash: trace.traceHash });
      const runId = createHash("sha256").update(`${world.manifest.worldHash}:${scenario.id}:${inputHash}`).digest("hex");
      const identity = engineIdentity(world, constitution, runId, scenario.split, inputHash);
      const evaluation = evaluateTrace({ world, scenario, trace, constitution, identity });
      const candidates = candidateDiagnostics(world, scenario, payload, observed);
      const truth = groundTruth(world, scenario);
      const bestEligible = Math.max(0, ...Object.values(truth));
      const bestRetrieved = Math.max(0, ...trace.stages.find((stage) => stage.name === "union").candidates.map((item) => truth[item.id] ?? 0));
      const top1 = candidates[0]?.latentUtility ?? 0;
      const fallbackUsed = candidates.some((candidate) => candidate.source === "fallback");
      records.push({ baselineId: "backyrd-decision-v13-baseline-d3-v1", experimentId: runId, worldId: world.manifest.worldId, seed: world.manifest.seed, scenarioId: scenario.id, family: scenario.family, split: scenario.split, persona: scenario.persona, maturity: scenario.maturity, contextClass: { audience: scenario.context.audience, timeBucket: scenario.context.timeBucket, weekday: scenario.context.weekday, weather: scenario.context.weather, indoorRequired: scenario.context.indoorRequired }, inputMode: requestBody.inputMode, rawInput: requestBody.query, engineVersion: payload.version, fidelityMode: config.embeddingMode, candidateCounts: { v12: observed.v12Candidates.length, semantic: observed.semanticCandidates.length, postDistributionV12: observed.distributedV12.length, postDistributionSemantic: observed.distributedSemantic.length, union: trace.stages.find((stage) => stage.name === "union").candidates.length, final: candidates.length }, candidateSources: Object.fromEntries(["v12_only", "semantic_only", "overlap", "fallback"].map((source) => [source, candidates.filter((candidate) => candidate.source === source).length])), finalTopK: candidates.map((candidate) => candidate.spotId), latentUtilities: candidates.map((candidate) => candidate.latentUtility), metrics: { ...evaluation.metrics, rankRegretTop1: bestRetrieved - top1, eligibleRegretTop1: bestEligible - top1, retrievalCeilingTop1: bestRetrieved, eligibleCeilingTop1: bestEligible, outcomePotential: outcomePotential(candidates.map((candidate) => candidate.spotId), truth) }, hardConstraintResult: evaluation.hardGates, failureClassification: evaluation.failures, fallbackUsage: fallbackUsed, latencyMs, validityState: evaluation.frameworkValidity, engineQuality: evaluation.engineQuality, certifiable: evaluation.certifiable, candidates, missedOpportunity: missedOpportunity(world, scenario, trace, candidates), traceHash: trace.traceHash, outputHash: evaluation.outputHash, observedEngine: { mode: payload.mode, intent: payload.intent, counts: payload.counts } });
    }
  } finally { canonical.restore(); }
  return { worldManifest: world.manifest, worldHealth: health, records };
}

export function summarize(records) {
  const group = (key) => Object.fromEntries([...new Set(records.map((record) => key(record)))].sort().map((value) => [value, summary(records.filter((record) => key(record) === value))]));
  const summary = (rows) => ({ n: rows.length, hardPass: rows.filter((row) => row.hardConstraintResult.pass).length, hardViolationRate: rows.length ? rows.filter((row) => !row.hardConstraintResult.pass).length / rows.length : null, ndcgAt3: mean(rows.map((row) => row.metrics.ranking.ndcgAt5)), ndcgAt5: mean(rows.map((row) => row.metrics.ranking.ndcgAt5)), ndcgAt10: mean(rows.map((row) => row.metrics.ranking.ndcgAt10)), recallAt10: mean(rows.map((row) => row.metrics.ranking.recallAt10)), precisionAt10: mean(rows.map((row) => row.metrics.ranking.precisionAt10)), top1Utility: mean(rows.map((row) => row.latentUtilities[0])), top3Utility: mean(rows.map((row) => mean(row.latentUtilities.slice(0, 3)))), top10Utility: mean(rows.map((row) => mean(row.latentUtilities.slice(0, 10)))), rankRegretTop1: mean(rows.map((row) => row.metrics.rankRegretTop1)), eligibleRegretTop1: mean(rows.map((row) => row.metrics.eligibleRegretTop1)), noResultRate: rows.length ? rows.filter((row) => row.finalTopK.length === 0).length / rows.length : null, fallbackRate: rows.length ? rows.filter((row) => row.fallbackUsage).length / rows.length : null, latency: { median: q(rows.map((row) => row.latencyMs), .5), p95: q(rows.map((row) => row.latencyMs), .95), max: q(rows.map((row) => row.latencyMs), 1) } });
  const source = Object.fromEntries(["v12_only", "semantic_only", "overlap", "fallback"].map((source) => { const candidates = records.flatMap((record) => record.candidates.filter((candidate) => candidate.source === source)); return [source, { candidateCount: candidates.length, top3Count: candidates.filter((candidate) => candidate.finalRank <= 3).length, top10Count: candidates.length, meanUtility: mean(candidates.map((candidate) => candidate.latentUtility)), excellentFitCount: candidates.filter((candidate) => candidate.latentUtility >= .8).length, badFitCount: candidates.filter((candidate) => candidate.latentUtility < .35).length }]; }));
  const failureRows = records.flatMap((record) => record.failureClassification.map((failure) => ({ scenarioId: record.scenarioId, split: record.split, persona: record.persona, family: record.family, primaryClass: failure.primaryClass, severity: failure.severity, utilityLoss: record.metrics.eligibleRegretTop1 })));
  const d0f002Rows = records.flatMap((record) => {
    const semantic = record.candidates.filter((candidate) => candidate.source === "semantic_only" || candidate.source === "fallback");
    const pairs = [];
    for (const reduced of semantic.filter((candidate) => candidate.distributionState === "reduced")) for (const normal of semantic.filter((candidate) => candidate.distributionState === "normal")) if (reduced.finalRank < normal.finalRank) pairs.push({ scenarioId: record.scenarioId, split: record.split, persona: record.persona, family: record.family, reducedSpotId: reduced.spotId, normalSpotId: normal.spotId, reducedRank: reduced.finalRank, normalRank: normal.finalRank, rankMovement: normal.finalRank - reduced.finalRank, utilityImpact: (normal.latentUtility ?? 0) - (reduced.latentUtility ?? 0) });
    return pairs;
  });
  return { overall: summary(records), splits: group((record) => record.split), cohorts: group((record) => record.maturity), personas: group((record) => record.persona), contexts: { audience: group((record) => record.contextClass.audience), timeBucket: group((record) => record.contextClass.timeBucket), family: group((record) => record.family) }, sources: source, failures: { total: failureRows.length, unknownRate: failureRows.length ? failureRows.filter((row) => row.primaryClass === "UNKNOWN").length / failureRows.length : 0, counts: Object.fromEntries([...new Set(failureRows.map((row) => row.primaryClass))].sort().map((failure) => [failure, failureRows.filter((row) => row.primaryClass === failure).length])), rows: failureRows }, d0f002: { occurrenceCount: d0f002Rows.length, affectedDecisionCount: new Set(d0f002Rows.map((row) => row.scenarioId)).size, affectedDecisionRate: records.length ? new Set(d0f002Rows.map((row) => row.scenarioId)).size / records.length : null, top3ImpactCount: d0f002Rows.filter((row) => row.reducedRank <= 3 || row.normalRank <= 3).length, top10ImpactCount: d0f002Rows.length, meanRankMovement: mean(d0f002Rows.map((row) => row.rankMovement)), meanUtilityImpact: mean(d0f002Rows.map((row) => row.utilityImpact)), rows: d0f002Rows } };
}
