import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { contentHash } from "./canonical-json.mjs";
import { createCanonicalV13Executor, createIsolatedPostgresTreatmentAdapters, createTreatmentMaterializer } from "./d3.1-canonical-adapters.mjs";
import { coverageReport, runCounterfactualEvaluation, runExplanationAlignment, runPersonalizationTreatmentComparison, runRemixEvaluation } from "./d3.1-diagnostic-runners.mjs";
import { evaluateTrace, groundTruth } from "./evaluator.mjs";
import { generateWorld } from "./generator.mjs";
import { buildGoldenScenarios } from "./golden-scenarios.mjs";
import { validateWorld } from "./health.mjs";
import { loadCanonicalDecisionHandler } from "./canonical-engine.mjs";
import { outcomePotential } from "./metrics.mjs";
import { buildPersonalizationTreatment } from "./personalization-treatment.mjs";
import { sealTrace } from "./replay.mjs";
import { counterfactualPairs, scenarioLibrary } from "./scenarios.mjs";
import { latentUtility } from "./utility.mjs";

const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const quantile = (values, p) => { const rows = values.filter(Number.isFinite).sort((a, b) => a - b); return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null; };
const ids = (rows) => (rows ?? []).map((row) => row.spot_id ?? row.id).filter(Boolean);
const spotFor = (world, id) => world.spots.find((spot) => spot.id === id);

export function requestForGoldenScenario(scenario) {
  const query = {
    product_eligibility: "exact approved discovery",
    distribution: "trusted places",
    exact_name: scenario.family.replaceAll("_", " "),
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
  }[scenario.family] ?? scenario.request.query;
  const requiresOpenNow = scenario.hardConstraints.openNow === true;
  const decisionHour = { morning: 9, afternoon: 13, evening: 19, night: 23 }[scenario.context.timeBucket] ?? 12;
  return {
    city: scenario.request.city,
    query,
    rawFreeText: query,
    inputMode: ["category_intent", "exact_name"].includes(scenario.family) ? "guided" : "free_text",
    preferredPlaceTypes: scenario.hardConstraints.category ? [scenario.hardConstraints.category] : [],
    excludedPlaceTypes: scenario.hardConstraints.exclusions,
    audience: [scenario.context.audience],
    occasions: [scenario.context.timeBucket, scenario.context.weekday === 0 ? "sunday" : "weekday"],
    strictCategoryIntent: Boolean(scenario.hardConstraints.category),
    openNow: requiresOpenNow,
    requireOpenNow: requiresOpenNow,
    decisionAt: `2026-08-10T${String(decisionHour).padStart(2, "0")}:30:00.000Z`,
    limit: 10,
    v12Limit: 16,
    semanticLimit: 24,
    excludeSpotIds: []
  };
}

function traceFrom(run, world, scenario) {
  const observed = run.trace.observed;
  const stage = (name, rows) => ({ name, candidates: ids(rows).map((id) => ({ id, status: spotFor(world, id)?.observed.status, distribution: spotFor(world, id)?.observed.distribution })) });
  const unionIds = [...new Set([...ids(observed.distributedV12), ...ids(observed.distributedSemantic)])];
  const results = run.candidates.map((candidate) => ({
    id: candidate.spot_id,
    status: spotFor(world, candidate.spot_id)?.observed.status,
    distribution: spotFor(world, candidate.spot_id)?.observed.distribution,
    explanation: { claims: [candidate.human_reason], evidence: candidate.explanationEvidence?.supportedFactors ?? [], unsupportedClaims: candidate.explanationEvidence?.claimedFactors?.filter((factor) => !candidate.explanationEvidence.supportedFactors.includes(factor)) ?? [], constraintCorrect: true }
  }));
  return sealTrace({
    traceVersion: "decision-flight-recorder-v1",
    scenarioId: scenario.id,
    stages: [
      stage("v12", observed.v12Candidates), stage("semantic", observed.semanticCandidates),
      stage("post_distribution_v12", observed.distributedV12), stage("post_distribution_semantic", observed.distributedSemantic),
      stage("union", unionIds.map((id) => ({ id }))), stage("pre_diversity", observed.fusedBeforeFinalMetadata),
      stage("final", results)
    ],
    results
  });
}

function source(candidate) {
  if ((candidate.sources ?? []).length === 2) return "overlap";
  if (candidate.sources?.includes("personalized_v12")) return "v12_only";
  if (candidate.semantic_similarity === 0 && candidate.document_preview === "Distribution-safe alternative candidate") return "fallback";
  return "semantic_only";
}

function candidateDiagnostics(world, scenario, run) {
  const user = world.users.find((item) => item.id === scenario.userId);
  const context = world.contexts.find((item) => item.id === scenario.context.contextId);
  const before = new Map(ids(run.trace.observed.fusedBeforeFinalMetadata).map((id, index) => [id, index + 1]));
  const distribution = new Map((run.trace.observed.distribution ?? []).map((row) => [row.entity_id, row]));
  return run.candidates.map((candidate) => {
    const spot = spotFor(world, candidate.spot_id);
    const utility = spot ? latentUtility(user, spot, context) : null;
    return {
      spotId: candidate.spot_id,
      syntheticSpotClass: spot?.density ?? null,
      source: source(candidate),
      sourceMembership: candidate.sources,
      v12Rank: candidate.v12_rank,
      v12Score: candidate.v12_score,
      semanticRank: candidate.semantic_rank,
      semanticSimilarity: candidate.semantic_similarity,
      normalizedSemanticContribution: candidate.explanation?.semantic_component ?? 0,
      distributionState: spot?.observed.distribution ?? null,
      distributionPriority: distribution.get(candidate.spot_id)?.distribution_priority ?? null,
      productEligibility: spot?.observed.status === "approved",
      tasteContribution: (candidate.explanation?.personalized_component ?? 0) + (candidate.explanation?.place_type_boost ?? 0) + (candidate.explanation?.contextual_taste_component ?? 0),
      contextContribution: (candidate.explanation?.place_type_boost ?? 0) + (candidate.explanation?.contextual_taste_component ?? 0),
      intentContribution: (candidate.explanation?.intent_boost ?? 0) + (candidate.explanation?.category_fit_component ?? 0),
      memoryContribution: candidate.explanation?.recent_memory_component ?? 0,
      penalties: (candidate.explanation?.category_mismatch_penalty ?? 0) + (candidate.explanation?.v12_only_penalty ?? 0) + (candidate.explanation?.weak_intent_penalty ?? 0),
      personalizedContribution: candidate.explanation?.personalized_component ?? 0,
      semanticContribution: candidate.explanation?.semantic_component ?? 0,
      sourceBonus: candidate.explanation?.source_bonus ?? 0,
      fusionScore: candidate.combined_score,
      preDiversityRank: before.get(candidate.spot_id) ?? null,
      finalRank: candidate.rank,
      latentUtility: utility?.utility ?? null,
      latentUtilityComponents: utility?.components ?? null,
      humanReason: candidate.human_reason
    };
  });
}

function missedOpportunity(world, scenario, trace, candidates) {
  const truth = groundTruth(world, scenario);
  const best = Object.entries(truth).sort((a, b) => b[1] - a[1])[0];
  if (!best) return { bestEligibleSpotId: null, utility: null, disposition: "NO_ELIGIBLE_SPOT", dataSufficiency: "NOT_APPLICABLE" };
  const [id, utility] = best;
  const stages = Object.fromEntries(trace.stages.map((stage) => [stage.name, new Set(stage.candidates.map((candidate) => candidate.id))]));
  const final = candidates.find((candidate) => candidate.spotId === id);
  let disposition = "NEVER_RETRIEVED";
  if (stages.v12.has(id) && !stages.semantic.has(id)) disposition = "V12_ONLY";
  if (!stages.v12.has(id) && stages.semantic.has(id)) disposition = "SEMANTIC_ONLY";
  if ((stages.v12.has(id) || stages.semantic.has(id)) && !stages.union.has(id)) disposition = "REMOVED_BY_DISTRIBUTION";
  if (stages.union.has(id) && !stages.pre_diversity.has(id)) disposition = "DEMOTED_OR_REMOVED_BY_FUSION";
  if (stages.pre_diversity.has(id) && !final) disposition = "REMOVED_BY_DIVERSITY_OR_METADATA";
  if (final?.finalRank > 3) disposition = final.finalRank <= 10 ? "SHOWN_NOT_TOP3" : "TOO_LOW";
  if (final?.finalRank <= 3) disposition = "TOP3";
  const spot = spotFor(world, id);
  const observedEvidence = [spot?.observed.description, ...(spot?.observed.moods ?? [])].filter(Boolean).length;
  return { bestEligibleSpotId: id, utility, finalRank: final?.finalRank ?? null, disposition, dataSufficiency: observedEvidence >= 3 ? "ENGINE_FAILURE" : observedEvidence <= 1 ? "OBSERVED_DATA_LIMITATION" : "BOTH", observedEvidenceCount: observedEvidence };
}

function identity(world, constitution, scenario, request, trace, engineSourceHash = world.manifest.engineSourceHash) {
  const inputHash = contentHash({ request, scenarioHash: scenario.hash, traceHash: trace.traceHash });
  const runId = createHash("sha256").update(`${world.manifest.worldHash}:${scenario.id}:${inputHash}`).digest("hex");
  return { worldId: world.manifest.worldId, worldHash: world.manifest.worldHash, split: scenario.split, seedId: world.manifest.seed, generatorVersion: world.manifest.generatorVersion, groundTruthVersion: constitution.groundTruthVersion, scenarioVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion, gateVersion: constitution.gateVersion, gitSha: world.manifest.gitSha, migrationHash: world.manifest.migrationHash, engineSourceHash, embeddingMode: world.manifest.embeddingMode, runId, inputHash, outputHash: "pending" };
}

function utilityMap(world, userId, context = world.contexts[0]) {
  const user = world.users.find((item) => item.id === userId);
  if (!user) throw new Error(`Evaluation user missing: ${userId}`);
  return Object.fromEntries(world.spots.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
}

export async function runD3AWorld({ config, metadata, constitution, coverageContract, env, engine = null }) {
  const world = generateWorld({ ...config, scenarioSetVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion }, metadata);
  const worldHealth = validateWorld(world);
  if (!worldHealth.valid) throw new Error(`World health failed: ${JSON.stringify(worldHealth.failures)}`);
  const canonical = await loadCanonicalDecisionHandler({ env, embeddingMode: config.embeddingMode, ...(engine?.sourceUrl ? { sourceUrl: engine.sourceUrl } : {}) });
  const expectedEngineSourceHash = engine?.expectedSourceHash ?? coverageContract.engineSourceHash;
  const baselineId = engine?.baselineId ?? "backyrd-decision-v13-baseline-d3-a-v1";
  if (canonical.sourceHash !== expectedEngineSourceHash) throw new Error("Decision Engine source hash drift");
  const executor = createCanonicalV13Executor({ canonical, jwtSecret: env.DECISION_LAB_JWT_SECRET });
  const goldenScenarios = buildGoldenScenarios(world, constitution.scenarioVersion);
  const records = [];
  try {
    for (const scenario of goldenScenarios) {
      const request = requestForGoldenScenario(scenario);
      const started = performance.now();
      const run = await executor({ userId: scenario.userId, request, context: scenario.context, diagnostic: { arm: "golden", scenarioId: scenario.id } });
      const latencyMs = Number((performance.now() - started).toFixed(3));
      const trace = traceFrom(run, world, scenario);
      const evaluation = evaluateTrace({ world, scenario, trace, constitution, identity: identity(world, constitution, scenario, request, trace, canonical.sourceHash) });
      const candidates = candidateDiagnostics(world, scenario, run);
      const truth = groundTruth(world, scenario);
      const unionIds = trace.stages.find((stage) => stage.name === "union").candidates.map((item) => item.id);
      const bestEligible = Math.max(0, ...Object.values(truth));
      const bestRetrieved = Math.max(0, ...unionIds.map((id) => truth[id] ?? 0));
      const top1 = candidates[0]?.latentUtility ?? 0;
      records.push({
        baselineId,
        experimentId: evaluation.runId,
        worldId: world.manifest.worldId,
        seed: world.manifest.seed,
        scenarioId: scenario.id,
        split: scenario.split,
        family: scenario.family,
        persona: scenario.persona,
        maturity: scenario.maturity,
        contextClass: { audience: scenario.context.audience, timeBucket: scenario.context.timeBucket, weekday: scenario.context.weekday, weather: scenario.context.weather, indoorRequired: scenario.context.indoorRequired },
        inputMode: request.inputMode,
        rawInput: request.query,
        engineVersion: run.payloadMeta.version,
        fidelityMode: config.embeddingMode,
        candidateCounts: { v12: run.trace.v12CandidateIds.length, semantic: run.trace.semanticCandidateIds.length, postDistributionV12: run.trace.distributedV12CandidateIds.length, postDistributionSemantic: run.trace.distributedSemanticCandidateIds.length, union: unionIds.length, preDiversity: run.trace.fusedCandidateIds.length, final: candidates.length },
        candidateSources: Object.fromEntries(["v12_only", "semantic_only", "overlap", "fallback"].map((key) => [key, candidates.filter((candidate) => candidate.source === key).length])),
        finalTopK: candidates.map((candidate) => candidate.spotId),
        latentUtilities: candidates.map((candidate) => candidate.latentUtility),
        metrics: { ...evaluation.metrics, rankRegretTop1: bestRetrieved - top1, eligibleRegretTop1: bestEligible - top1, retrievalCeilingTop1: bestRetrieved, eligibleCeilingTop1: bestEligible, outcomePotential: outcomePotential(candidates.map((candidate) => candidate.spotId), truth) },
        hardConstraintResult: evaluation.hardGates,
        failureClassification: evaluation.failures,
        fallbackUsage: candidates.some((candidate) => candidate.source === "fallback"),
        latencyMs,
        validityState: evaluation.frameworkValidity,
        engineQuality: evaluation.engineQuality,
        candidates,
        missedOpportunity: missedOpportunity(world, scenario, trace, candidates),
        traceHash: trace.traceHash,
        outputHash: evaluation.outputHash,
        observedEngine: { ...run.payloadMeta, structuredIntent: run.trace.structuredIntent ?? null, hardConstraintEligibility: run.trace.hardConstraintEligibility ?? null }
      });
    }

    const library = scenarioLibrary(world);
    const counterfactual = await runCounterfactualEvaluation({ pairs: counterfactualPairs(library), executor, engineSourceHash: canonical.sourceHash, utilityFor: (scenario) => utilityMap(world, scenario.userId) });
    const bundles = coverageContract.arms.personalization.maturities.map((maturity) => {
      const sourceUser = world.users.find((user) => user.maturity === maturity);
      if (!sourceUser) throw new Error(`World has no ${maturity} user`);
      const scenario = library.find((item) => item.userId === sourceUser.id) ?? library[1];
      return buildPersonalizationTreatment(world, { userId: sourceUser.id, scenarioId: `d3-a-${maturity}`, currentRequest: scenario.request, currentContext: world.contexts[0] });
    });
    const materialize = createTreatmentMaterializer(createIsolatedPostgresTreatmentAdapters({ dbUrl: env.DECISION_LAB_DB_URL }));
    const personalization = await runPersonalizationTreatmentComparison({ bundles, materialize, executor, engineSourceHash: canonical.sourceHash, utilityFor: (userId, context) => utilityMap(world, userId, context) });
    const remixCases = coverageContract.arms.remix.families.map((family, index) => ({ ...library[index % library.length], id: `d3-a-remix-${family}`, family, context: world.contexts[index % world.contexts.length], request: { ...library[index % library.length].request, limit: family.includes("few") || family.includes("sparse") ? 6 : 10 } }));
    const remix = await runRemixEvaluation({ cases: remixCases, executor, engineSourceHash: canonical.sourceHash, utilityFor: (item) => utilityMap(world, item.userId, item.context) });
    const explanationCases = goldenScenarios.map((scenario) => ({ id: scenario.id, userId: scenario.userId, request: requestForGoldenScenario(scenario), context: scenario.context }));
    const explanation = await runExplanationAlignment({ cases: explanationCases, executor, engineSourceHash: canonical.sourceHash });
    const coverage = coverageReport({ expected: coverageContract, results: { counterfactual, personalization, remix, explanation } });
    if (!coverage.ready) throw new Error(`D3-A diagnostic coverage incomplete: ${JSON.stringify(coverage.rows)}`);
    return { worldManifest: world.manifest, worldHealth, records, diagnostics: { counterfactual, personalization, remix, explanation, coverage } };
  } finally {
    canonical.restore();
  }
}

export function summarizeGolden(records) {
  const summary = (rows) => ({
    n: rows.length,
    hardPass: rows.filter((row) => row.hardConstraintResult.pass).length,
    hardViolationRate: rows.length ? rows.filter((row) => !row.hardConstraintResult.pass).length / rows.length : null,
    ndcgAt5: mean(rows.map((row) => row.metrics.ranking.ndcgAt5)),
    ndcgAt10: mean(rows.map((row) => row.metrics.ranking.ndcgAt10)),
    recallAt10: mean(rows.map((row) => row.metrics.ranking.recallAt10)),
    precisionAt10: mean(rows.map((row) => row.metrics.ranking.precisionAt10)),
    top1Utility: mean(rows.map((row) => row.latentUtilities[0])),
    top3Utility: mean(rows.map((row) => mean(row.latentUtilities.slice(0, 3)))),
    top10Utility: mean(rows.map((row) => mean(row.latentUtilities.slice(0, 10)))),
    rankRegretTop1: mean(rows.map((row) => row.metrics.rankRegretTop1)),
    eligibleRegretTop1: mean(rows.map((row) => row.metrics.eligibleRegretTop1)),
    noResultRate: rows.length ? rows.filter((row) => row.finalTopK.length === 0).length / rows.length : null,
    fallbackRate: rows.length ? rows.filter((row) => row.fallbackUsage).length / rows.length : null,
    latency: { median: quantile(rows.map((row) => row.latencyMs), .5), p95: quantile(rows.map((row) => row.latencyMs), .95), max: quantile(rows.map((row) => row.latencyMs), 1) }
  });
  const grouped = (key) => Object.fromEntries([...new Set(records.map(key))].sort().map((value) => [value, summary(records.filter((record) => key(record) === value))]));
  const sourceRows = Object.fromEntries(["v12_only", "semantic_only", "overlap", "fallback"].map((key) => {
    const rows = records.flatMap((record) => record.candidates.filter((candidate) => candidate.source === key));
    return [key, { candidateCount: rows.length, top3Count: rows.filter((row) => row.finalRank <= 3).length, meanUtility: mean(rows.map((row) => row.latentUtility)), excellentFitCount: rows.filter((row) => row.latentUtility >= .8).length, badFitCount: rows.filter((row) => row.latentUtility < .35).length }];
  }));
  return { overall: summary(records), splits: grouped((row) => row.split), cohorts: grouped((row) => row.maturity), personas: grouped((row) => row.persona), contexts: { audience: grouped((row) => row.contextClass.audience), timeBucket: grouped((row) => row.contextClass.timeBucket), family: grouped((row) => row.family) }, seeds: grouped((row) => row.seed), sources: sourceRows };
}
