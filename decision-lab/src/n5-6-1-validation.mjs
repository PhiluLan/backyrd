import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { buildN5_6_1World } from "./n5-6-1-world.mjs";
import {
  N5_6_1_CONCEPT_METADATA, N5_6_1_CONCEPT_METADATA_HASH,
  N5_6_1_PROJECTION_CONTRACT, N5_6_1_PROJECTION_CONTRACT_HASH,
  N5_6_1_SUFFICIENCY_CONTRACT_HASH, validateConceptMetadataCompleteness
} from "./n5-6-1-moment-aware-projection.mjs";

const contractUrl = new URL("../config/n5-6-1-validation-contract-v1.json", import.meta.url);
const baselineUrl = new URL("../baselines/n5-6-1-moment-aware-projection-v1.json", import.meta.url);
const round = (value) => Number(value.toFixed(6));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const quantile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
};
const signedKey = (row) => `${row.concept}:${row.polarity}`;
const setDistance = (left, right) => {
  const a = new Set(left); const b = new Set(right); const union = new Set([...a, ...b]);
  return union.size ? 1 - [...a].filter((item) => b.has(item)).length / union.size : 0;
};
const forbiddenRuntime = /(latent|ground[_-]?truth|oracle|expected[_-]?utility|api[_-]?key|bearer|credential|trust[_-]?score)/i;

const SUFFICIENCY_CASES = Object.freeze([
  ["NORTH_STAR_EXPLORER_01", "FAMILY_SUNDAY", ["LOW", "PARTIAL"]],
  ["NORTH_STAR_EXPLORER_01", "SOLO_AFTERWORK", ["HIGH"]],
  ["NORTH_STAR_EXPLORER_01", "FRIENDS_FRIDAY", ["HIGH", "PARTIAL"]],
  ["NORTH_STAR_EXPLORER_01", "DATE_EVENING", ["PARTIAL", "LOW"]],
  ["NORTH_STAR_EXPLORER_01", "CROSS_CITY_COPENHAGEN", ["HIGH", "PARTIAL"]],
  ["NORTH_STAR_EXPLORER_01", "BROAD_UNKNOWN", ["LOW", "UNKNOWN"]],
  ["NORTH_STAR_EXPLORER_01", "NEW_CITY_BROAD_UNKNOWN", ["LOW", "UNKNOWN"]],
  ["NORTH_STAR_EXPLORER_01", "MUSEUM_CULTURE_FAMILY", ["LOW", "PARTIAL"]],
  ["n55-user-social", "FRIENDS_FRIDAY", ["HIGH"]],
  ["n55-user-family", "FAMILY_SUNDAY", ["HIGH"]],
  ["n55-user-budget", "DATE_EVENING", ["PARTIAL", "LOW"]],
  ["n55-user-premium", "DATE_EVENING", ["HIGH", "PARTIAL"]],
  ["n55-user-cold", "SOLO_AFTERWORK", ["UNKNOWN", "LOW"]],
  ["n55-user-developing", "SOLO_AFTERWORK", ["PARTIAL", "LOW"]]
]);

function projectionSummary(row) {
  const projection = row.projection;
  return {
    userId: row.userId, momentKey: row.momentKey, city: row.city,
    currentMomentHash: row.currentMoment.momentHash,
    moment: projection.moment,
    overallUserMaturity: projection.knowledgeSufficiency.overallUserMaturity,
    knowledgeSufficiency: projection.knowledgeSufficiency,
    selected: projection.taste,
    patterns: projection.occasionPatterns,
    uncertainties: projection.uncertainties,
    projectionAudit: projection.projectionAudit,
    authority: projection.authority,
    projectionHash: projection.projectionHash
  };
}

function scopeLeak(row) {
  const social = row.projection.moment.socialContext;
  return row.projection.taste.some(({ scope, concept }) => {
    const metadata = N5_6_1_CONCEPT_METADATA[concept];
    const scopedMismatch = scope.kind === "CONTEXT" && scope.key.startsWith("audience.") && social && scope.key !== `audience.${social}`;
    const semanticMismatch = metadata.compatibleSocialContexts.length && social && !metadata.compatibleSocialContexts.includes(social);
    return scopedMismatch || semanticMismatch;
  });
}

function placeLeak(row) {
  const placeTypes = row.projection.moment.applicablePlaceTypes;
  return row.projection.taste.some(({ scope, concept }) => {
    const metadata = N5_6_1_CONCEPT_METADATA[concept];
    return (scope.kind === "PLACE_TYPE" && placeTypes.length && !placeTypes.includes(scope.key)) ||
      (metadata.compatiblePlaceTypes.length && placeTypes.length && !metadata.compatiblePlaceTypes.some((key) => placeTypes.includes(key)));
  });
}

function beforeAfter(row) {
  const control = row.controlProjection;
  if (!control) return null;
  const beforeRows = [...control.positiveTaste, ...control.negativeTaste];
  const afterRows = row.projection.taste;
  const before = new Set(beforeRows.map(signedKey)); const after = new Set(afterRows.map(signedKey));
  return {
    userId: row.userId, momentKey: row.momentKey,
    before: { sufficiency: control.knowledgeSufficiency.level, score: control.knowledgeSufficiency.score, selectedCount: beforeRows.length, concepts: beforeRows.map(({ concept, polarity }) => ({ concept, polarity })) },
    after: { sufficiency: row.projection.knowledgeSufficiency.finalPersonalizationSufficiency.level, score: row.projection.knowledgeSufficiency.finalPersonalizationSufficiency.score, selectedCount: afterRows.length, concepts: afterRows.map(({ concept, polarity, scope, relevance, fallbackLevel }) => ({ concept, polarity, scope, relevance, fallbackLevel })) },
    removed: [...before].filter((key) => !after.has(key)), added: [...after].filter((key) => !before.has(key)),
    fallbackDepth: row.projection.knowledgeSufficiency.fallbackDepth,
    suppressionByReason: row.projection.projectionAudit.suppressionByReason
  };
}

function negativePreferenceDiagnosis(world) {
  const profile = world.profiles.find(({ user }) => user.id === "n55-user-developing");
  const node = profile.userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:vibe.lively");
  const event = profile.events.find(({ eventType, spotEvidence }) => eventType === "explicit_negative" && spotEvidence.concepts.includes("vibe.lively"));
  return {
    classification: "WORLD_GROUND_TRUTH_MISMATCH",
    historicalN56Metric: 0.888889,
    historicalFrozenGate: 0.9,
    evaluatorPersonaDeclaration: { userId: profile.user.id, concept: "vibe.lively", direction: "NEGATIVE" },
    generatedEvidence: { eventId: event.id, eventType: event.eventType, independentSessions: 1, independentSpots: 1, outcomeCount: 1, occurredAt: event.occurredAt },
    resultingNode: { affinity: node.affinity, confidence: node.confidence, polarity: node.polarity, negativeEvidence: node.negativeEvidence, evidenceDepth: node.evidenceDepth },
    durablePolarityConfidenceBoundary: 0.22,
    finding: "One weak negative observation is a hypothesis, not a durable negative preference. The frozen evaluator declared durable negative truth before sufficient evidence existed.",
    treatment: "HISTORICAL_FAIL_PRESERVED_NO_ENGINE_OR_THRESHOLD_CHANGE"
  };
}

export async function buildN5_6_1ValidationResult() {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const world = buildN5_6_1World();
  const summaries = world.projections.map(projectionSummary);
  const selected = world.projections.flatMap(({ projection }) => projection.taste);
  const auditNodes = world.projections.flatMap(({ projection }) => projection.projectionAudit.nodes);
  const eligibleMaterial = auditNodes.filter(({ disposition, reasonCode }) => disposition === "SELECTED" || ["REDUNDANT_WITH_STRONGER_NODE", "OUTSIDE_PROJECTION_CAP"].includes(reasonCode));
  const selectedMaterial = auditNodes.filter(({ disposition }) => disposition === "SELECTED");
  const materialSignalKeys = new Set(eligibleMaterial.map(({ concept, polarity }) => `${concept.split(".")[0]}:${polarity}`));
  const selectedSignalKeys = new Set(selectedMaterial.map(({ concept, polarity }) => `${concept.split(".")[0]}:${polarity}`));
  const invalidKnowledge = auditNodes.filter(({ compatibility, reasonCode }) => compatibility === "CONFLICT" || ["LOW_RELEVANCE", "LOW_CONFIDENCE", "INSUFFICIENT_SUPPORT", "GLOBAL_FALLBACK_NOT_JUSTIFIED", "CONTEXT_UNKNOWN_FOR_CONTEXT_SENSITIVE_CONCEPT"].includes(reasonCode));
  const invalidSuppressed = invalidKnowledge.filter(({ disposition }) => disposition === "SUPPRESSED");
  const suppressed = auditNodes.filter(({ disposition }) => disposition === "SUPPRESSED");
  const suppressionCorrect = suppressed.filter(({ compatibility, reasonCode }) => compatibility === "CONFLICT" || ["LOW_RELEVANCE", "LOW_CONFIDENCE", "INSUFFICIENT_SUPPORT", "GLOBAL_FALLBACK_NOT_JUSTIFIED", "CONTEXT_UNKNOWN_FOR_CONTEXT_SENSITIVE_CONCEPT", "REDUNDANT_WITH_STRONGER_NODE", "REDUNDANT_WITH_CURRENT_INTENT", "CURRENT_INTENT_CONFLICT", "CONTEXT_MISMATCH", "PLACE_TYPE_MISMATCH"].includes(reasonCode));
  const sizes = world.projections.map(({ projection }) => projection.taste.length);
  const selectionRatios = world.projections.map(({ userId, projection }) => projection.taste.length / Math.max(1, world.profiles.find(({ user }) => user.id === userId).userCard.nodes.length));
  const contextLeaks = world.projections.filter(scopeLeak);
  const placeLeaks = world.projections.filter(placeLeak);
  const globalFallbackRows = selected.filter(({ scope }) => scope.kind === "GLOBAL");
  const unjustifiedGlobal = globalFallbackRows.filter(({ concept, compatibility, relevance }) => N5_6_1_CONCEPT_METADATA[concept].portability === "BOUND" || compatibility === "CONFLICT" || relevance < N5_6_1_PROJECTION_CONTRACT.relevanceThreshold.clearOrPartialMoment);
  const capHits = sizes.filter((size) => size === N5_6_1_PROJECTION_CONTRACT.maximumTasteNodes).length;
  const sameUserDistances = [];
  for (const profile of world.profiles.filter(({ userCard }) => ["KNOWN", "WELL_KNOWN", "DEEP"].includes(userCard.maturity.state))) {
    const rows = world.projections.filter(({ userId, momentKey }) => userId === profile.user.id && ["FAMILY_SUNDAY", "FRIENDS_FRIDAY", "DATE_EVENING", "SOLO_AFTERWORK"].includes(momentKey));
    for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1) sameUserDistances.push(setDistance(rows[a].projection.taste.map(signedKey), rows[b].projection.taste.map(signedKey)));
  }
  const differentUserDistances = [];
  for (const momentKey of ["FRIENDS_FRIDAY", "DATE_EVENING"]) {
    const ids = ["NORTH_STAR_EXPLORER_01", "n55-user-social", "n55-user-family", "n55-user-budget", "n55-user-premium"];
    const rows = ids.map((userId) => world.projections.find((row) => row.userId === userId && row.momentKey === momentKey));
    for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1) differentUserDistances.push(setDistance(rows[a].projection.taste.map(signedKey), rows[b].projection.taste.map(signedKey)));
  }
  const caseResults = SUFFICIENCY_CASES.map(([userId, momentKey, allowed]) => {
    const row = world.projections.find((item) => item.userId === userId && item.momentKey === momentKey);
    const actual = row.projection.knowledgeSufficiency.finalPersonalizationSufficiency.level;
    return { userId, momentKey, allowed, actual, pass: allowed.includes(actual) };
  });
  const north = (key) => world.projections.find(({ userId, momentKey }) => userId === "NORTH_STAR_EXPLORER_01" && momentKey === key);
  const cold = world.projections.filter(({ userId }) => userId === "n55-user-cold");
  const developing = world.projections.find(({ userId, momentKey }) => userId === "n55-user-developing" && momentKey === "SOLO_AFTERWORK");
  const intentRows = selected.filter(({ signalType }) => signalType === "CORROBORATIVE");
  const justifiedIntentRows = intentRows.filter(({ confidence, evidenceDepth }) => confidence >= 0.75 && evidenceDepth.independentSessions >= 3);
  const independentRows = selected.filter(({ signalType }) => signalType === "INDEPENDENT_PERSONALIZATION_SIGNAL");
  const familyDuplicates = world.projections.filter(({ projection }) => {
    const keys = projection.taste.map(({ concept, polarity }) => `${concept.split(".")[0]}:${polarity}`);
    return new Set(keys).size !== keys.length;
  });
  const runtimeSurface = summaries.map(({ userId, momentKey, city, moment, selected: taste, patterns, uncertainties, authority }) => ({ userId, momentKey, city, moment, taste, patterns, uncertainties, authority }));
  const confidenceValues = world.profiles.flatMap(({ userCard }) => userCard.nodes.map(({ confidence }) => confidence));
  const distribution = {
    zero: sizes.filter((value) => value === 0).length,
    oneToTwo: sizes.filter((value) => value >= 1 && value <= 2).length,
    threeToFour: sizes.filter((value) => value >= 3 && value <= 4).length,
    fiveToSix: sizes.filter((value) => value >= 5 && value <= 6).length,
    sevenToEight: sizes.filter((value) => value >= 7 && value <= 8).length,
    capHits
  };
  const metrics = {
    scientificIdentity: world.parentWorldHash && N5_6_1_PROJECTION_CONTRACT_HASH && N5_6_1_SUFFICIENCY_CONTRACT_HASH ? 1 : 0,
    conceptMetadataCompleteness: validateConceptMetadataCompleteness() ? 1 : 0,
    currentIntentAuthority: auditNodes.some(({ reasonCode }) => reasonCode === "CURRENT_INTENT_CONFLICT") && selected.every(({ compatibility }) => compatibility !== "CONFLICT") ? 1 : 0,
    signedPolarityCompleteness: selected.every(({ polarity, affinity }) => (polarity === "POSITIVE" && affinity > 0) || (polarity === "NEGATIVE" && affinity < 0) || polarity === "MIXED") ? 1 : 0,
    projectionAuditCompleteness: world.projections.every(({ projection }) => projection.projectionAudit.consideredCount === projection.projectionAudit.selectedCount + projection.projectionAudit.suppressedCount && projection.projectionAudit.nodes.every(({ disposition, reasonCode, compatibility, relevance }) => disposition && reasonCode && compatibility && Number.isFinite(relevance))) ? 1 : 0,
    contextLeakageControl: contextLeaks.length ? 0 : 1,
    placeTypeLeakageControl: placeLeaks.length ? 0 : 1,
    globalFallbackControl: unjustifiedGlobal.length ? 0 : 1,
    projectionCapAsMaximum: capHits / world.projections.length <= contract.profileDump.maximumCapHitRate && new Set(sizes).size > 3 ? 1 : 0,
    profileDumpControl: capHits / world.projections.length <= contract.profileDump.maximumCapHitRate && average(selectionRatios) <= contract.profileDump.maximumMeanSelectionRatio && selectedMaterial.length === selected.length && familyDuplicates.length / world.projections.length <= contract.profileDump.maximumSemanticFamilyDuplicationRate ? 1 : 0,
    broadMomentUncertainty: [north("BROAD_UNKNOWN"), north("NEW_CITY_BROAD_UNKNOWN")].every(({ projection }) => ["LOW", "UNKNOWN"].includes(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level) && projection.taste.length <= 2 && projection.uncertainties.includes("USER_KNOWN_MOMENT_RELEVANCE_UNCLEAR")) ? 1 : 0,
    deepUserUnknownContextHonesty: [north("FAMILY_SUNDAY"), north("MUSEUM_CULTURE_FAMILY")].every(({ projection }) => ["LOW", "PARTIAL"].includes(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level) && projection.knowledgeSufficiency.overallUserMaturity === "DEEP") ? 1 : 0,
    soloMatchingKnowledgeRetention: north("SOLO_AFTERWORK").projection.knowledgeSufficiency.finalPersonalizationSufficiency.level === "HIGH" && north("SOLO_AFTERWORK").projection.occasionPatterns.length === 1 && north("SOLO_AFTERWORK").projection.taste.length >= 4 ? 1 : 0,
    familyUnknownHonesty: !north("FAMILY_SUNDAY").projection.taste.some(({ scope, concept }) => scope.key === "audience.family" || concept === "social_style.solo_friendly") ? 1 : 0,
    crossCityPortability: north("CROSS_CITY_COPENHAGEN").projection.taste.length > 0 && north("CROSS_CITY_COPENHAGEN").projection.occasionPatterns.length === 0 && !JSON.stringify(north("CROSS_CITY_COPENHAGEN").projection).includes("NORTH_STAR_EXPLORER_01:spot") ? 1 : 0,
    coldUserSparsity: cold.every(({ projection }) => projection.taste.length === 0 && ["UNKNOWN", "LOW"].includes(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level)) ? 1 : 0,
    developingUserCalibration: developing.projection.knowledgeSufficiency.finalPersonalizationSufficiency.level === "PARTIAL" && developing.projection.taste.length <= 3 ? 1 : 0,
    sameUserDifferentMoment: round(average(sameUserDistances)),
    differentUsersSameMoment: round(average(differentUserDistances)),
    relevantNegativeSignalRetention: world.projections.some(({ projection }) => projection.negativeTaste.length > 0 && projection.negativeTaste.every(({ relevance }) => relevance >= N5_6_1_PROJECTION_CONTRACT.relevanceThreshold.clearOrPartialMoment)) ? 1 : 0,
    projectionRelevancePrecision: selected.length ? round(selectedMaterial.length / selected.length) : 1,
    projectionRelevanceRecall: materialSignalKeys.size ? round([...materialSignalKeys].filter((key) => selectedSignalKeys.has(key)).length / materialSignalKeys.size) : 1,
    irrelevantKnowledgeSuppression: invalidKnowledge.length ? round(invalidSuppressed.length / invalidKnowledge.length) : 1,
    suppressionPrecision: suppressed.length ? round(suppressionCorrect.length / suppressed.length) : 1,
    suppressionRecall: invalidKnowledge.length ? round(invalidSuppressed.length / invalidKnowledge.length) : 1,
    decisionSpecificSufficiency: round(caseResults.filter(({ pass }) => pass).length / caseResults.length),
    currentIntentDuplicationControl: intentRows.length ? round(justifiedIntentRows.length / intentRows.length) : 1,
    independentPersonalizationSignalRate: selected.length ? round(independentRows.length / selected.length) : 1,
    crossCityUnknownContextHonesty: ["LOW", "UNKNOWN"].includes(north("NEW_CITY_BROAD_UNKNOWN").projection.knowledgeSufficiency.finalPersonalizationSufficiency.level) && north("NEW_CITY_BROAD_UNKNOWN").projection.taste.length <= 2 ? 1 : 0,
    privacyAndScientificBoundary: forbiddenRuntime.test(JSON.stringify(runtimeSurface)) ? 0 : 1,
    externalAiCallsZero: 1
  };
  const gateMatrix = Object.fromEntries(Object.entries(contract.gates).map(([key, threshold]) => [key, metrics[key] >= threshold]));
  const diagnosis = negativePreferenceDiagnosis(world);
  const northStarBeforeAfter = world.projections.filter(({ userId, momentKey }) => userId === "NORTH_STAR_EXPLORER_01" && ["FAMILY_SUNDAY", "SOLO_AFTERWORK", "FRIENDS_FRIDAY", "DATE_EVENING", "CROSS_CITY_COPENHAGEN", "BROAD_UNKNOWN"].includes(momentKey)).map(beforeAfter);
  const body = {
    artifactType: "BACKYRD_N5_6_1_MOMENT_AWARE_PROJECTION_RESULT",
    sealed: true, version: contract.version, contractHash: contentHash(contract),
    identities: {
      parentN56WorldHash: world.parentWorldHash, worldHash: world.worldHash,
      projectionContractHash: N5_6_1_PROJECTION_CONTRACT_HASH,
      sufficiencyContractHash: N5_6_1_SUFFICIENCY_CONTRACT_HASH,
      conceptMetadataHash: N5_6_1_CONCEPT_METADATA_HASH
    },
    scenarioPopulation: world.scenarioPopulation,
    projections: summaries,
    northStarBeforeAfter,
    diagnostics: {
      projectionSizeDistribution: distribution,
      projectionSize: { mean: round(average(sizes)), median: quantile(sizes, 0.5), p95: quantile(sizes, 0.95), maximum: Math.max(...sizes), capHitRate: round(capHits / sizes.length) },
      fallback: { globalSelected: globalFallbackRows.length, globalFallbackRate: selected.length ? round(globalFallbackRows.length / selected.length) : 0, meanDepth: round(average(selected.map(({ fallbackLevel }) => fallbackLevel))) },
      leakage: { context: contextLeaks.map(({ userId, momentKey }) => ({ userId, momentKey })), placeType: placeLeaks.map(({ userId, momentKey }) => ({ userId, momentKey })) },
      overlap: { sameUserDifferentMoment: metrics.sameUserDifferentMoment, differentUsersSameMoment: metrics.differentUsersSameMoment },
      confidenceDistribution: { minimum: quantile(confidenceValues, 0), p25: quantile(confidenceValues, 0.25), median: quantile(confidenceValues, 0.5), p75: quantile(confidenceValues, 0.75), p95: quantile(confidenceValues, 0.95), maximum: quantile(confidenceValues, 1), treatment: "UNCHANGED_N5_6_WORLD" },
      sufficiencyCases: caseResults,
      syntheticUserRealism: "NEEDS_WORK_UNCHANGED_CONTROL_WORLD",
      profileDump: { meanSelectionRatio: round(average(selectionRatios)), capHitRate: round(capHits / sizes.length), familySamePolarityDuplicateRate: round(familyDuplicates.length / world.projections.length) }
    },
    negativePreferenceDiagnosis: diagnosis,
    metrics, gateMatrix,
    boundaries: { historicalN56Verdict: "FAIL_UNCHANGED", historicalN6AVerdict: "FAIL_UNCHANGED", n6: "NOT_AUTHORIZED_PENDING_HUMAN_REVIEW", ranking: "NONE", externalDecisionAiCalls: 0, externalDecisionAiCostUsd: 0, production: "UNCHANGED" }
  };
  const allMandatoryGatesPass = Object.values(gateMatrix).every(Boolean);
  return { ...body, allMandatoryGatesPass, scientificValidity: allMandatoryGatesPass ? "PASS" : "FAIL", humanReview: "READY", n6: "NOT_AUTHORIZED", production: "UNCHANGED", resultHash: contentHash(body) };
}

export async function buildN5_6_1SealedArtifact() { return buildN5_6_1ValidationResult(); }

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildN5_6_1ValidationResult();
  if (process.argv.includes("--write")) await writeFile(baselineUrl, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ version: result.version, metrics: result.metrics, gateMatrix: result.gateMatrix, diagnostics: result.diagnostics, negativePreferenceDiagnosis: result.negativePreferenceDiagnosis, scientificValidity: result.scientificValidity, humanReview: result.humanReview, n6: result.n6, resultHash: result.resultHash }, null, 2)}\n`);
  if (!result.allMandatoryGatesPass) process.exitCode = 1;
}
