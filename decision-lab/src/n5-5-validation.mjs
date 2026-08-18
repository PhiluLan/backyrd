import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { N5_LIMITS, validateN5ScientificBoundary } from "./n5-relevant-user-projection.mjs";
import { N5_5_CONTRACT_IDENTITIES, buildN5_5Evaluation } from "./n5-5-longitudinal-user-world.mjs";

const contractUrl = new URL("../config/n5-5-validation-contract-v1.json", import.meta.url);
const baselineUrl = new URL("../baselines/n5-5-longitudinal-user-intelligence-world-v1.json", import.meta.url);
const unique = (rows) => [...new Set(rows)];
const numeric = (value) => Number(value.toFixed(6));

function profileSummary(profile) {
  const rows = profile.tasteMap?.rows ?? [];
  const counts = (scope) => unique(rows.filter((row) => row.scope.kind === scope).map((row) => row.concept)).length;
  return {
    knowledgeState: profile.knowledgeState,
    globalConcepts: counts("GLOBAL"), placeTypeConcepts: counts("PLACE_TYPE"), contextConcepts: counts("CONTEXT"),
    negativeEvidenceConcepts: unique(rows.filter((row) => row.negativeEventCount > 0).map((row) => row.concept)).length,
    patterns: profile.patterns.filter((row) => row.state === "KNOWN").length,
    contradictions: profile.contradictions.length,
    eventCount: profile.memorySummary.eventCount, sessions: profile.memorySummary.independentSessionCount,
    spots: profile.tasteMap.rows.reduce((max, row) => Math.max(max, row.distinctSpotCount), 0),
    outcomeCount: profile.graph.outcomeIds.length
  };
}

function opportunity(row) {
  const taste = row.projection.relevantTaste;
  const differentiating = taste.filter(({ affinity, confidence, relevance }) => Math.abs(affinity) >= 0.2 && confidence >= 0.55 && relevance >= 0.45).length;
  if (differentiating >= 4 && row.projection.knowledgeSufficiency.level !== "LOW") return "HIGH";
  if (differentiating >= 2) return "MEDIUM";
  return "LOW";
}

export async function buildN5_5ValidationResult() {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const evaluation = buildN5_5Evaluation();
  const summaries = evaluation.profiles.map(({ user, profile, snapshots }) => ({ ...user, ...profileSummary(profile), snapshots: snapshots.map(({ stage, count, profile: snapshot }) => ({ stage, count, knowledgeState: snapshot.knowledgeState, rows: snapshot.tasteMap?.rows.length ?? 0, patterns: snapshot.patterns.length })) }));
  const mature = summaries.filter(({ knowledgeState }) => knowledgeState === "LONG_TERM" || knowledgeState === "MATURE");
  const projectionRows = evaluation.projections.map((row) => ({ userId: row.userId, momentKey: row.momentKey, opportunity: opportunity(row), projectionHash: row.projection.projectionHash, relevantTasteCount: row.projection.relevantTaste.length, relevantPatternCount: row.projection.relevantPatterns.length, sufficiency: row.projection.knowledgeSufficiency.level, selected: row.projection.relevantTaste.map(({ concept, sourceLayer }) => `${concept}:${sourceLayer}`), suppressed: row.projection.suppressionSummary.audited }));
  const byUser = new Map(evaluation.projections.reduce((map, row) => map.set(row.userId, [...(map.get(row.userId) ?? []), row]), new Map()));
  const sameUserDifferentMoment = [...byUser.values()].every((rows) => unique(rows.map(({ projection }) => contentHash(projection.relevantTaste))).length >= (rows[0].userId === "n55-user-cold" ? 1 : 3));
  const dateRows = evaluation.projections.filter(({ momentKey }) => momentKey === "DATE_EVENING");
  const differentUser = unique(dateRows.map(({ projection }) => contentHash(projection.relevantTaste))).length >= 4;
  const crossCity = evaluation.projections.filter(({ momentKey }) => momentKey === "CROSS_CITY_COPENHAGEN").every(({ projection }) => !JSON.stringify(projection).includes('"city"'));
  const intentRows = evaluation.projections.filter(({ momentKey }) => momentKey === "FRIENDS_FRIDAY");
  const intentAuthority = intentRows.every(({ projection }) => projection.relevantTaste.filter(({ concept }) => concept === "vibe.quiet").every(({ affinity }) => affinity <= 0) && projection.authority.currentIntent === "AUTHORITATIVE");
  const canonicalMemoryValidity = evaluation.world.engineInputs.every(({ events }) => events.every((event) => !/(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i.test(JSON.stringify(event))));
  const latentIsolation = !/(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i.test(JSON.stringify(evaluation.world.engineInputs));
  const matureProfileRichness = mature.every((row) => row.globalConcepts >= 4 && row.placeTypeConcepts >= 2 && row.contextConcepts >= 3 && row.patterns >= 1 && row.negativeEvidenceConcepts >= 1);
  const lifecycleProgression = summaries.filter(({ id }) => id !== "n55-user-cold").every(({ snapshots }) => snapshots.at(-1).rows >= snapshots[0].rows) && summaries.find(({ id }) => id === "n55-user-cold").knowledgeState === "COLD";
  const projectionBoundedness = evaluation.projections.every(({ projection }) => projection.relevantTaste.length <= N5_LIMITS.maxTasteConcepts && projection.relevantPatterns.length <= N5_LIMITS.maxPatterns);
  const privacyBoundary = validateN5ScientificBoundary(evaluation.projections.map(({ projection }) => ({ relevantTaste: projection.relevantTaste, relevantPatterns: projection.relevantPatterns, uncertainties: projection.uncertainties })));
  const opportunities = Object.fromEntries(["HIGH", "MEDIUM", "LOW"].map((level) => [level, projectionRows.filter((row) => row.opportunity === level).length]));
  const metrics = {
    canonicalMemoryValidity: canonicalMemoryValidity ? 1 : 0, latentIsolation: latentIsolation ? 1 : 0,
    matureProfileRichness: matureProfileRichness ? 1 : 0, lifecycleProgression: lifecycleProgression ? 1 : 0,
    contextualProjectionDifferentiation: sameUserDifferentMoment ? 1 : 0, differentUserDifferentiation: differentUser ? 1 : 0,
    crossCityPortability: crossCity ? 1 : 0, currentIntentAuthority: intentAuthority ? 1 : 0,
    projectionBoundedness: projectionBoundedness ? 1 : 0, privacyBoundary: privacyBoundary ? 1 : 0,
    personalizationOpportunityCoverage: numeric((opportunities.HIGH + opportunities.MEDIUM) / projectionRows.length)
  };
  const gateMatrix = Object.fromEntries(Object.entries(contract.gates).map(([key, threshold]) => [key, metrics[key] >= threshold]));
  const body = {
    version: contract.version, contractHash: contentHash(contract), identities: N5_5_CONTRACT_IDENTITIES,
    worldHash: evaluation.world.worldHash, evaluatorReferenceHash: contentHash(evaluation.world.evaluatorReference),
    userCount: summaries.length, projectionScenarioCount: projectionRows.length, profiles: summaries, projections: projectionRows,
    opportunities, metrics, gateMatrix,
    scientificBoundary: { noExternalAiCalls: true, noN6Invocation: true, noRanking: true, noProductionMutation: true, latentTruthRuntimeInput: false },
    historicN6AStatus: "UNCHANGED_NOT_REEVALUATED"
  };
  return { ...body, allMandatoryGatesPass: Object.values(gateMatrix).every(Boolean), scientificValidity: Object.values(gateMatrix).every(Boolean) && privacyBoundary ? "PASS" : "FAIL", production: "UNCHANGED", resultHash: contentHash(body) };
}

export async function buildN5_5SealedArtifact() {
  const result = await buildN5_5ValidationResult();
  const artifact = {
    artifactType: "BACKYRD_N5_5_LONGITUDINAL_USER_INTELLIGENCE_WORLD_RESULT",
    sealed: true, version: result.version, contractHash: result.contractHash, identities: result.identities,
    worldHash: result.worldHash, evaluatorReferenceHash: result.evaluatorReferenceHash,
    metrics: result.metrics, gateMatrix: result.gateMatrix, opportunities: result.opportunities,
    profiles: result.profiles,
    projections: result.projections.map(({ userId, momentKey, opportunity, projectionHash, relevantTasteCount, relevantPatternCount, sufficiency, selected }) => ({ userId, momentKey, opportunity, projectionHash, relevantTasteCount, relevantPatternCount, sufficiency, selected })),
    scientificBoundary: result.scientificBoundary, scientificValidity: result.scientificValidity, production: result.production,
    externalAiCalls: 0, historicalN6AVerdicts: "UNCHANGED_NOT_REEVALUATED"
  };
  return { ...artifact, artifactHash: contentHash(artifact) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildN5_5ValidationResult();
  if (process.argv.includes("--write")) await writeFile(baselineUrl, `${JSON.stringify(await buildN5_5SealedArtifact(), null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.allMandatoryGatesPass) process.exitCode = 1;
}
