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
import { buildRetrievalProjections, candidateUnionNextGen, classifyRetrievalMisses, oracleRecallAtKCapacity } from "./wave2.1-retrieval-next-gen.mjs";
import { retrievalBreakthroughExperiments, retrievalBreakthroughManifest } from "./wave2.2-retrieval-breakthrough.mjs";
import { buildObservedSpotSignals, retrievalRebuildExperiments, retrievalRebuildManifest } from "./wave2.3-retrieval-rebuild.mjs";
import { retrievalShortlistingExperiments, retrievalShortlistingManifest } from "./wave2.4-retrieval-shortlisting.mjs";

const mean = (values) => { const rows = values.filter(Number.isFinite); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null; };
const quantile = (values, p) => { const rows = values.filter(Number.isFinite).sort((a, b) => a - b); return rows.length ? rows[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)] : null; };
const ids = (rows) => (rows ?? []).map((row) => row.spot_id ?? row.id).filter(Boolean);
const spotFor = (world, id) => world.spots.find((spot) => spot.id === id);
const recallAt = (relevant, orderedIds, limit) => relevant.length ? relevant.filter((row) => new Set(orderedIds.slice(0, limit)).has(row.spotId)).length / relevant.length : 1;
const pearson = (left, right) => {
  if (left.length < 2 || left.length !== right.length) return null;
  const leftMean = mean(left); const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator ? numerator / denominator : null;
};

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
  const unionIds = observed.retrievalUnion?.length ? ids(observed.retrievalUnion) : [...new Set([...ids(observed.distributedV12), ...ids(observed.distributedSemantic)])];
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
      ...(observed.structuredCandidates ? [stage("structured", observed.structuredCandidates)] : []),
      ...(observed.lexicalCandidates ? [stage("lexical", observed.lexicalCandidates)] : []),
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

function retrievalDiagnostics(world, scenario, truth, unionIds, observed) {
  const utilityRows = Object.entries(truth).map(([spotId, utility]) => ({ spotId, utility }));
  const retrieved = new Set(unionIds);
  const good = utilityRows.filter((row) => row.utility >= 0.6);
  const excellent = utilityRows.filter((row) => row.utility >= 0.8);
  const best = [...utilityRows].sort((a, b) => b.utility - a.utility)[0] ?? null;
  const evidenceBySpot = new Map((observed.retrievalUnion ?? []).map((row) => [row.spot_id, row.evidence_list ?? [row.evidence].filter(Boolean)]));
  if (!observed.retrievalUnion) {
    for (const id of ids(observed.distributedV12)) evidenceBySpot.set(id, [{ source: "personalized_v12" }]);
    for (const id of ids(observed.distributedSemantic)) evidenceBySpot.set(id, [...(evidenceBySpot.get(id) ?? []), { source: "semantic_v13" }]);
  }
  const sources = [...new Set([...evidenceBySpot.values()].flat().map((row) => row.source).filter(Boolean))];
  const sourceContribution = Object.fromEntries(sources.map((source) => {
    const sourceIds = [...evidenceBySpot.entries()].filter(([, evidence]) => evidence.some((row) => row.source === source)).map(([id]) => id);
    const useful = sourceIds.filter((id) => (truth[id] ?? 0) >= 0.6);
    const uniqueUseful = useful.filter((id) => (evidenceBySpot.get(id) ?? []).length === 1);
    return [source, { candidates: sourceIds.length, useful: useful.length, uniqueUseful: uniqueUseful.length }];
  }));
  const missed = good.filter((row) => !retrieved.has(row.spotId)).slice(0, 20).map((row) => {
    const spot = spotFor(world, row.spotId);
    const known = [spot?.category, spot?.observed.name, spot?.observed.description, spot?.observed.priceLevel, spot?.observed.lat, spot?.observed.lng, ...(spot?.observed.moods ?? [])].filter((value) => value !== null && value !== undefined && value !== "").length;
    const classification = known <= 4 ? "SPOT_DATA_LIMITATION" : known <= 6 ? "BOTH" : "ENGINE_RETRIEVAL_FAILURE";
    return { spotId: row.spotId, utility: row.utility, density: spot?.density ?? "unknown", category: spot?.category ?? "unknown", observedEvidenceCount: known, classification };
  });
  const semanticIds = new Set(ids(observed.distributedSemantic));
  const semanticRows = observed.distributedSemantic ?? [];
  const semanticSimilarities = semanticRows.map((row) => Number(row.similarity)).filter(Number.isFinite);
  const semanticRanks = semanticRows.map((_, index) => index + 1);
  const semanticUtilityRanks = semanticRows.map((row) => truth[row.spot_id] ?? 0);
  const bestSpot = best ? spotFor(world, best.spotId) : null;
  return {
    candidatePoolSize: unionIds.length,
    goodOrBetterRecall: good.length ? good.filter((row) => retrieved.has(row.spotId)).length / good.length : 1,
    goodOrBetterRecallAt20: recallAt(good, unionIds, 20),
    goodOrBetterRecallAt50: recallAt(good, unionIds, 50),
    excellentFitRecall: excellent.length ? excellent.filter((row) => retrieved.has(row.spotId)).length / excellent.length : 1,
    excellentFitRecallAt20: recallAt(excellent, unionIds, 20),
    excellentFitRecallAt50: recallAt(excellent, unionIds, 50),
    bestAvailableRetrieved: best ? retrieved.has(best.spotId) : true,
    bestAvailableSpotId: best?.spotId ?? null,
    retrievalCeiling: Math.max(0, ...unionIds.map((id) => truth[id] ?? 0)),
    badSemanticMatches: [...semanticIds].filter((id) => (truth[id] ?? 0) < 0.35).length,
    semanticCandidates: semanticIds.size,
    semanticGoodOrBetterRecallAt20: recallAt(good, [...semanticIds], 20),
    semanticGoodOrBetterRecallAt50: recallAt(good, [...semanticIds], 50),
    semanticSimilarity: { min: semanticSimilarities.length ? Math.min(...semanticSimilarities) : null, mean: mean(semanticSimilarities), max: semanticSimilarities.length ? Math.max(...semanticSimilarities) : null, normalizedSaturationRate: semanticSimilarities.length ? semanticSimilarities.filter((value) => value >= 0.75).length / semanticSimilarities.length : null },
    semanticUtilityRankCorrelation: pearson(semanticRanks, semanticUtilityRanks),
    sourceOverlapCount: [...evidenceBySpot.values()].filter((evidence) => evidence.length > 1).length,
    sourceContribution,
    missed,
    scenarioCategory: scenario.hardConstraints.category ?? bestSpot?.category ?? null,
    scenarioDensity: bestSpot?.density ?? "unknown",
  };
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
      const request = { ...requestForGoldenScenario(scenario), ...(engine?.requestOverrides ?? {}) };
      const started = performance.now();
      const run = await executor({ userId: scenario.userId, request, context: scenario.context, diagnostic: { arm: "golden", scenarioId: scenario.id } });
      const baseExecutorLatencyMs = performance.now() - started;
      let retrievalNextGen = null;
      let retrievalBreakthrough = null;
      let retrievalRebuild = null;
      let retrievalShortlisting = null;
      let retrievalRebuildProjectionRuns = null;
      if (engine?.retrievalNextGen === true) {
        const baseUnion = structuredClone(run.trace.observed.retrievalUnion ?? []);
        const projections = buildRetrievalProjections({ request, structuredIntent: run.trace.structuredIntent });
        const projectionRuns = [{ projection: projections.find((item) => item.id === "base") ?? { id: "base", query: request.query }, observed: structuredClone(run.trace.observed) }];
        const executeProjection = async (projection) => {
          const projectionRequest = {
            ...request,
            query: projection.query,
            rawFreeText: projection.query,
            structuredLimit: engine.retrievalNextGenLimits?.structured ?? 60,
            lexicalLimit: engine.retrievalNextGenLimits?.lexical ?? 40,
            semanticLimit: engine.retrievalNextGenLimits?.semantic ?? 60,
          };
          const projectionStarted = performance.now();
          const projectionRun = await executor({ userId: scenario.userId, request: projectionRequest, context: scenario.context, diagnostic: { arm: "retrieval_projection", scenarioId: scenario.id, projection: projection.id } });
          return { projection, observed: structuredClone(projectionRun.trace.observed), latencyMs: Number((performance.now() - projectionStarted).toFixed(3)) };
        };
        const additionalProjections = projections.filter((item) => item.id !== "base");
        if (engine?.retrievalBreakthrough === true) {
          projectionRuns.push(...await Promise.all(additionalProjections.map(executeProjection)));
        } else {
          for (const projection of additionalProjections) projectionRuns.push(await executeProjection(projection));
        }
        const nextUnion = candidateUnionNextGen(projectionRuns, { limit: engine.retrievalNextGenLimits?.union ?? 100 });
        if (engine?.retrievalBreakthrough === true) {
          const experiments = retrievalBreakthroughExperiments({
            projectionRuns,
            catalogResult: run.trace.observed.eligibleSpotIntelligenceCatalog,
            request,
            structuredIntent: run.trace.structuredIntent,
            poolLimit: engine.retrievalBreakthroughLimits?.union ?? 80,
          });
          experiments.H0_WAVE2_1 = nextUnion;
          retrievalBreakthrough = { manifest: retrievalBreakthroughManifest(), experiments, finalUnion: experiments.H3_EVIDENCE_AGGREGATION };
        }
        if (engine?.retrievalRebuild === true) {
          const rebuildProjectionRuns = projectionRuns.filter((item) => item.projection.id === "base" || !engine.retrievalProjectionIds || engine.retrievalProjectionIds.includes(item.projection.id));
          retrievalRebuildProjectionRuns = rebuildProjectionRuns;
          const experiments = retrievalRebuildExperiments({
            projectionRuns: rebuildProjectionRuns,
            catalogResult: run.trace.observed.eligibleSpotIntelligenceCatalog,
            request,
            structuredIntent: run.trace.structuredIntent,
            observedSpotSignals: buildObservedSpotSignals(world),
            budget: engine.retrievalRebuildLimits?.union ?? 80,
            shortlistK: engine.retrievalRebuildLimits?.shortlist ?? 20,
          });
          const projectionLatencyMs = Math.max(0, ...rebuildProjectionRuns.filter((item) => item.projection.id !== "base").map((item) => item.latencyMs ?? 0));
          retrievalRebuild = { manifest: retrievalRebuildManifest(), experiments, finalUnion: experiments.H3_OBSERVED_QUALITY, latencyMs: Number((baseExecutorLatencyMs + projectionLatencyMs).toFixed(3)) };
        }
        if (engine?.retrievalShortlisting === true && retrievalRebuild && retrievalRebuildProjectionRuns) {
          const shortlistStarted = performance.now();
          const experiments = retrievalShortlistingExperiments({
            projectionRuns: retrievalRebuildProjectionRuns,
            catalogResult: run.trace.observed.eligibleSpotIntelligenceCatalog,
            request,
            structuredIntent: run.trace.structuredIntent,
            observedSpotSignals: buildObservedSpotSignals(world),
            wave23Candidates: retrievalRebuild.finalUnion,
            budget: engine.retrievalShortlistingLimits?.union ?? 80,
            shortlistK: engine.retrievalShortlistingLimits?.shortlist ?? 20,
          });
          retrievalShortlisting = {
            manifest: retrievalShortlistingManifest(),
            experiments,
            finalUnion: experiments.H1_TIE_SAFE_CALIBRATION,
            latencyMs: Number((retrievalRebuild.latencyMs + performance.now() - shortlistStarted).toFixed(3)),
          };
        }
        const selectedUnion = retrievalShortlisting?.finalUnion ?? retrievalRebuild?.finalUnion ?? retrievalBreakthrough?.finalUnion ?? nextUnion;
        run.trace.observed.retrievalUnion = selectedUnion.map((candidate) => ({
          spot_id: candidate.spot_id,
          retrieval_score: candidate.retrieval_score,
          union_rank: candidate.union_rank,
          evidence_list: candidate.evidence.map((evidence) => ({
            source: evidence.source,
            source_rank: evidence.source_rank,
            source_score: evidence.source_score,
            evidence: [
              ...evidence.evidence,
              `projection:${evidence.projection}`,
              ...(Number.isFinite(evidence.rrf_contribution) ? [`rrf:${evidence.rrf_contribution.toFixed(9)}`] : []),
              ...(Number.isFinite(evidence.calibrated_rank) ? [`calibrated_rank:${evidence.calibrated_rank.toFixed(9)}`] : []),
            ],
          })),
        }));
        retrievalNextGen = { projections, projectionRuns, baseUnion, nextUnion: selectedUnion };
      }
      const latencyMs = Number((performance.now() - started).toFixed(3));
      const trace = traceFrom(run, world, scenario);
      const evaluation = evaluateTrace({ world, scenario, trace, constitution, identity: identity(world, constitution, scenario, request, trace, canonical.sourceHash) });
      const candidates = candidateDiagnostics(world, scenario, run);
      const truth = groundTruth(world, scenario);
      const unionIds = trace.stages.find((stage) => stage.name === "union").candidates.map((item) => item.id);
      const bestEligible = Math.max(0, ...Object.values(truth));
      const bestRetrieved = Math.max(0, ...unionIds.map((id) => truth[id] ?? 0));
      const top1 = candidates[0]?.latentUtility ?? 0;
      const retrieval = retrievalDiagnostics(world, scenario, truth, unionIds, run.trace.observed);
      const retrievalRootCause = retrievalNextGen ? classifyRetrievalMisses({ world, truth, baseUnion: retrievalNextGen.baseUnion, nextUnion: retrievalNextGen.nextUnion, projectionRuns: retrievalNextGen.projectionRuns }) : null;
      const recallCapacity = oracleRecallAtKCapacity(truth, 20, scenario.relevanceRule.utilityAtLeast);
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
        retrieval,
        retrievalContractEvidence: {
          candidateIds: unionIds,
          eligibleUtilityById: truth,
          relevanceThreshold: scenario.relevanceRule.utilityAtLeast,
        },
        retrievalNextGen: retrievalNextGen ? {
          projections: retrievalNextGen.projections,
          candidateUnion: retrievalNextGen.nextUnion,
          rootCause: retrievalRootCause,
          recallAt20Capacity: recallCapacity,
        } : null,
        retrievalBreakthrough: retrievalBreakthrough ? {
          manifest: retrievalBreakthrough.manifest,
          experiments: retrievalBreakthrough.experiments,
          finalUnion: retrievalBreakthrough.finalUnion,
          integrity: Object.fromEntries(Object.entries(retrievalBreakthrough.experiments).map(([experiment, rows]) => {
            const resolved = (rows ?? []).map((candidate) => world.spots.find((spot) => spot.id === candidate.spot_id));
            return [experiment, {
              unresolved: resolved.filter((spot) => !spot).length,
              productFailures: resolved.filter((spot) => spot && spot.observed.status !== "approved").length,
              distributionFailures: resolved.filter((spot) => spot && ["quarantined", "excluded"].includes(spot.observed.distribution)).length,
              hardConstraintFailures: resolved.filter((spot) => spot && !Object.hasOwn(truth, spot.id)).length,
            }];
          })),
        } : null,
        retrievalRebuild: retrievalRebuild ? {
          manifest: retrievalRebuild.manifest,
          experiments: retrievalRebuild.experiments,
          finalUnion: retrievalRebuild.finalUnion,
          latencyMs: retrievalRebuild.latencyMs,
          integrity: Object.fromEntries(Object.entries(retrievalRebuild.experiments).map(([experiment, rows]) => {
            const resolved = (rows ?? []).map((candidate) => world.spots.find((spot) => spot.id === candidate.spot_id));
            return [experiment, {
              unresolved: resolved.filter((spot) => !spot).length,
              productFailures: resolved.filter((spot) => spot && spot.observed.status !== "approved").length,
              distributionFailures: resolved.filter((spot) => spot && ["quarantined", "excluded"].includes(spot.observed.distribution)).length,
              hardConstraintFailures: resolved.filter((spot) => spot && !Object.hasOwn(truth, spot.id)).length,
            }];
          })),
        } : null,
        retrievalShortlisting: retrievalShortlisting ? {
          manifest: retrievalShortlisting.manifest,
          experiments: retrievalShortlisting.experiments,
          finalUnion: retrievalShortlisting.finalUnion,
          latencyMs: retrievalShortlisting.latencyMs,
          integrity: Object.fromEntries(Object.entries(retrievalShortlisting.experiments).filter(([, rows]) => Array.isArray(rows)).map(([experiment, rows]) => {
            const resolved = rows.map((candidate) => world.spots.find((spot) => spot.id === candidate.spot_id));
            return [experiment, {
              unresolved: resolved.filter((spot) => !spot).length,
              productFailures: resolved.filter((spot) => spot && spot.observed.status !== "approved").length,
              distributionFailures: resolved.filter((spot) => spot && ["quarantined", "excluded"].includes(spot.observed.distribution)).length,
              hardConstraintFailures: resolved.filter((spot) => spot && !Object.hasOwn(truth, spot.id)).length,
            }];
          })),
        } : null,
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

    if (engine?.goldenOnly === true) {
      return { worldManifest: world.manifest, worldHealth, records, diagnostics: null, externalUsage: canonical.getExternalUsage?.() ?? null };
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
    return { worldManifest: world.manifest, worldHealth, records, diagnostics: { counterfactual, personalization, remix, explanation, coverage }, externalUsage: canonical.getExternalUsage?.() ?? null };
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
