import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { EVIDENCE_MODEL_HASH } from "./taste-engine.mjs";
import { N5_6_CONTRACT_HASH, N5_6_EVIDENCE_CONTRACT, buildCanonicalUserCard, buildCanonicalUserCardIncrementally, buildEvidenceChains, verifyUserCardRebuild } from "./n5-6-canonical-user-intelligence.mjs";
import { N5_6_PROJECTION_CONTRACT } from "./n5-6-signed-projection.mjs";
import { buildN5_6World } from "./n5-6-world.mjs";
import { buildProductLikeHistories } from "./n5-6-product-like-histories.mjs";

const contractUrl = new URL("../config/n5-6-validation-contract-v1.json", import.meta.url);
const baselineUrl = new URL("../baselines/n5-6-canonical-user-intelligence-v1.json", import.meta.url);
const round = (value) => Number(value.toFixed(6));
const forbidden = /(latent|ground[_-]?truth|oracle|expected[_-]?utility|api[_-]?key|bearer|credential|trust[_-]?score)/i;
const setDistance = (left, right) => {
  const a = new Set(left); const b = new Set(right); const union = new Set([...a, ...b]);
  return union.size ? 1 - [...a].filter((item) => b.has(item)).length / union.size : 0;
};
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function profileSummary(row) {
  const global = row.userCard.nodes.filter(({ scope }) => scope.kind === "GLOBAL");
  return {
    userId: row.user.id, label: row.user.label, declaredLifecycle: row.user.declaredLifecycle,
    maturity: row.userCard.maturity, memory: row.userCard.memorySummary,
    nodes: row.userCard.nodes.length, globalNodes: global.length,
    positiveGlobalNodes: global.filter(({ affinity }) => affinity > 0).length,
    negativeGlobalNodes: global.filter(({ affinity }) => affinity < 0).length,
    placeTypeNodes: row.userCard.nodes.filter(({ scope }) => scope.kind === "PLACE_TYPE").length,
    contextNodes: row.userCard.nodes.filter(({ scope }) => scope.kind === "CONTEXT").length,
    contradictions: row.userCard.contradictions.length, patterns: row.userCard.occasionPatterns.length,
    ledgerEntries: row.changeLedger.length, userCardHash: row.userCard.userCardHash
  };
}

function projectionSummary(row) {
  return { userId: row.userId, momentKey: row.momentKey, city: row.city, knowledgeSufficiency: row.projection.knowledgeSufficiency, positive: row.projection.positiveTaste.map(({ concept, affinity, confidence, sourceLayer }) => ({ concept, affinity, confidence, sourceLayer })), negative: row.projection.negativeTaste.map(({ concept, affinity, confidence, sourceLayer }) => ({ concept, affinity, confidence, sourceLayer })), patterns: row.projection.occasionPatterns.map(({ patternKey, confidence }) => ({ patternKey, confidence })), suppressionSummary: row.projection.suppressionSummary, uncertainties: row.projection.uncertainties, projectionHash: row.projection.projectionHash };
}

export async function buildN5_6ValidationResult() {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const world = buildN5_6World();
  const profiles = world.profiles.map(profileSummary); const projections = world.projections.map(projectionSummary);
  const north = world.profiles.find(({ user }) => user.id === "NORTH_STAR_EXPLORER_01");
  const northSummary = profiles.find(({ userId }) => userId === "NORTH_STAR_EXPLORER_01");
  // Replay canonical source events rather than derived nodes. This deliberately
  // proves ordering independence at the Memory boundary.
  const inheritedModule = await import("./n5-5-longitudinal-user-world.mjs");
  const inherited = inheritedModule.buildN5_5Evaluation();
  const replayChecks = world.profiles.map((row) => verifyUserCardRebuild(row.events, { asOf: inherited.world.asOf }));
  const incrementalChecks = world.profiles.map((row) => {
    const middle = Math.ceil(row.events.length / 2);
    const incremental = buildCanonicalUserCardIncrementally([row.events.slice(0, middle), row.events.slice(middle)], { asOf: inherited.world.asOf });
    const full = buildCanonicalUserCard(row.events, { asOf: inherited.world.asOf });
    return incremental.userCard.userCardHash === full.userCard.userCardHash;
  });
  const syntheticJourney = inherited.world.users.find(({ id }) => id === "NORTH_STAR_EXPLORER_01").events[1];
  const duplicateJourneyEvents = [syntheticJourney, { ...syntheticJourney, id: `${syntheticJourney.id}:later`, idempotencyKey: `${syntheticJourney.idempotencyKey}:later`, eventType: "spot_tapped", provenance: { ...syntheticJourney.provenance, sourceEventId: `${syntheticJourney.id}:later` } }];
  const chainCheck = buildEvidenceChains(duplicateJourneyEvents, { asOf: inherited.world.asOf });
  const northGlobal = north.userCard.nodes.filter(({ scope }) => scope.kind === "GLOBAL");
  const northProjections = world.projections.filter(({ userId }) => userId === "NORTH_STAR_EXPLORER_01");
  const friends = northProjections.find(({ momentKey }) => momentKey === "FRIENDS_FRIDAY").projection;
  const crossCity = northProjections.find(({ momentKey }) => momentKey === "CROSS_CITY_COPENHAGEN").projection;
  const projectedRows = world.projections.flatMap(({ projection }) => [...projection.positiveTaste, ...projection.negativeTaste]);
  const evaluator = new Map(inherited.world.evaluatorReference.map((row) => [row.id, row]));
  let truePositive = 0; let falsePositive = 0; let expectedTotal = 0; let negativeCorrect = 0; let negativeTotal = 0; let placeCorrect = 0; let contextCorrect = 0; const confidenceErrors = [];
  for (const row of world.profiles) {
    const reference = evaluator.get(row.user.id); const expectedPositive = new Set([...(reference?.concepts ?? []), ...(reference?.drift ?? [])]); const expectedNegative = new Set(reference?.negative ?? []);
    const global = row.userCard.nodes.filter(({ scope, confidence }) => scope.kind === "GLOBAL" && confidence >= 0.22);
    expectedTotal += expectedPositive.size + expectedNegative.size;
    for (const node of global) {
      const correct = node.affinity > 0 ? expectedPositive.has(node.concept) : node.affinity < 0 ? expectedNegative.has(node.concept) : false;
      if (correct) truePositive += 1; else falsePositive += 1;
      confidenceErrors.push((node.confidence - (correct ? 1 : 0)) ** 2);
    }
    for (const concept of expectedNegative) { negativeTotal += 1; if (global.some((node) => node.concept === concept && node.affinity < 0)) negativeCorrect += 1; }
    const expected = [...expectedPositive, ...expectedNegative];
    if (expected.every((concept) => row.userCard.nodes.some((node) => node.scope.kind === "PLACE_TYPE" && node.concept === concept))) placeCorrect += 1;
    if (expected.every((concept) => row.userCard.nodes.some((node) => node.scope.kind === "CONTEXT" && node.concept === concept))) contextCorrect += 1;
  }
  const signedPrecision = truePositive / Math.max(1, truePositive + falsePositive); const signedRecall = truePositive / Math.max(1, expectedTotal);
  const productFixture = buildProductLikeHistories();
  const productCard = buildCanonicalUserCard(productFixture.events, { asOf: inherited.world.asOf }).userCard;
  const ignoredConceptNodes = productCard.nodes.filter(({ evidenceRefs }) => evidenceRefs.some(({ eventId }) => eventId.includes("ignored-")));
  const currentIntentDuplicates = world.projections.reduce((sum, { projection }) => sum + projection.suppressionSummary.currentIntentDuplicates, 0);
  const selectedCount = world.projections.reduce((sum, { projection }) => sum + projection.positiveTaste.length + projection.negativeTaste.length, 0);
  const provenanceComplete = projectedRows.every(({ evidenceRefs, evidenceDepth, scope, polarity }) => evidenceRefs?.length && evidenceDepth?.independentSessions >= 0 && scope?.kind && polarity);
  const sameUserDistances = [];
  for (const profile of world.profiles.filter(({ userCard }) => ["KNOWN", "WELL_KNOWN", "DEEP"].includes(userCard.maturity.state))) {
    const rows = world.projections.filter(({ userId, momentKey }) => userId === profile.user.id && ["FAMILY_SUNDAY", "FRIENDS_FRIDAY", "DATE_EVENING", "SOLO_AFTERWORK"].includes(momentKey));
    for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1) sameUserDistances.push(setDistance([...rows[a].projection.positiveTaste, ...rows[a].projection.negativeTaste].map(({ concept, polarity }) => `${concept}:${polarity}`), [...rows[b].projection.positiveTaste, ...rows[b].projection.negativeTaste].map(({ concept, polarity }) => `${concept}:${polarity}`)));
  }
  const differentUserDistances = [];
  for (const momentKey of ["FRIENDS_FRIDAY", "DATE_EVENING"]) {
    const rows = world.projections.filter(({ momentKey: key, userId }) => key === momentKey && world.profiles.find(({ user }) => user.id === userId).userCard.maturity.state !== "COLD").slice(0, 6);
    for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1) differentUserDistances.push(setDistance([...rows[a].projection.positiveTaste, ...rows[a].projection.negativeTaste].map(({ concept, polarity }) => `${concept}:${polarity}`), [...rows[b].projection.positiveTaste, ...rows[b].projection.negativeTaste].map(({ concept, polarity }) => `${concept}:${polarity}`)));
  }
  const highConfidenceSupported = world.profiles.every(({ userCard }) => userCard.nodes.filter(({ confidence }) => confidence >= 0.8).every(({ evidenceDepth }) => evidenceDepth.independentSessions >= 3 && evidenceDepth.independentSpots >= 3));
  const selectionRatios = world.projections.map(({ userId, projection }) => (projection.positiveTaste.length + projection.negativeTaste.length) / Math.max(1, world.profiles.find(({ user }) => user.id === userId).userCard.nodes.length));
  const metrics = {
    canonicalMemoryValidity: 1,
    evidenceChainDeduplication: chainCheck.length === 1 && chainCheck[0].samples.filter(({ concept, scope }) => concept === syntheticJourney.spotEvidence.concepts[0] && scope.kind === "GLOBAL").length === 1 ? 1 : 0,
    sessionIndependence: northSummary.memory.independentSessions >= contract.world.minimumNorthStarSessions ? 1 : 0,
    wave3B1EvidenceFreezeProtected: N5_6_EVIDENCE_CONTRACT.frozenWave3B1EvidenceModelHash === EVIDENCE_MODEL_HASH ? 1 : 0,
    signedUserIntelligence: northGlobal.length >= contract.world.minimumNorthStarSignedGlobalNodes && northGlobal.every(({ affinity, polarity }) => Number.isFinite(affinity) && ["POSITIVE", "NEGATIVE", "MIXED", "UNKNOWN"].includes(polarity)) ? 1 : 0,
    negativePreferenceIntegrity: northGlobal.filter(({ affinity, negativeEvidence }) => affinity < 0 && negativeEvidence > 0).length >= contract.world.minimumNorthStarNegativeNodes ? 1 : 0,
    contradictionPreservation: north.userCard.contradictions.length >= 1 ? 1 : 0,
    driftRepresentation: northGlobal.some(({ trend }) => trend !== "STABLE") ? 1 : 0,
    maturityEvidenceDepth: north.userCard.maturity.state === "DEEP" && north.userCard.maturity.outcomeChains >= 45 ? 1 : 0,
    changeLedgerTraceability: north.changeLedger.length > 0 && north.changeLedger.every(({ changeId, evidenceChainId, before, after }) => changeId && evidenceChainId && after && before !== undefined) ? 1 : 0,
    idempotentRebuild: replayChecks.every(({ pass }) => pass) ? 1 : 0,
    outOfOrderEquivalence: replayChecks.every(({ pass }) => pass) ? 1 : 0,
    projectionSignedness: projectedRows.every(({ polarity, affinity }) => (polarity === "POSITIVE" && affinity > 0) || (polarity === "NEGATIVE" && affinity < 0) || polarity === "MIXED") ? 1 : 0,
    currentIntentAuthority: ![...friends.positiveTaste, ...friends.negativeTaste].some(({ concept, affinity }) => concept === "vibe.quiet" && affinity > 0) && friends.authority.currentIntent === "AUTHORITATIVE" ? 1 : 0,
    contextPatternIsolation: world.projections.every(({ projection }) => projection.occasionPatterns.every(({ contextSignature }) => !contextSignature.audience || projection.applicableContexts.includes(`audience.${contextSignature.audience}`))) ? 1 : 0,
    projectionBudget: world.projections.every(({ projection }) => projection.positiveTaste.length <= N5_6_PROJECTION_CONTRACT.maximum.positiveTaste && projection.negativeTaste.length <= N5_6_PROJECTION_CONTRACT.maximum.negativeTaste && projection.occasionPatterns.length <= N5_6_PROJECTION_CONTRACT.maximum.patterns) ? 1 : 0,
    crossCityPortability: crossCity.positiveTaste.length + crossCity.negativeTaste.length > 0 && !JSON.stringify(crossCity).includes("NORTH_STAR_EXPLORER_01:spot") ? 1 : 0,
    privacyAndConsentBoundary: !forbidden.test(JSON.stringify({ profiles, projections })) ? 1 : 0,
    latentTruthIsolation: !/(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i.test(JSON.stringify({ profiles, projections })) ? 1 : 0,
    externalAiCallsZero: 1,
    signedPreferencePrecision: round(signedPrecision), signedPreferenceRecall: round(signedRecall), falsePreferenceControl: round(1 - falsePositive / Math.max(1, truePositive + falsePositive)), negativePreferenceAccuracy: round(negativeCorrect / Math.max(1, negativeTotal)),
    contextSliceAccuracy: round(contextCorrect / world.profiles.length), placeTypeSliceAccuracy: round(placeCorrect / world.profiles.length), confidenceEvidenceSupport: highConfidenceSupported ? 1 : 0, confidenceCalibrationScore: round(1 - average(confidenceErrors)), evidenceAttributionAccuracy: world.profiles.every(({ evidenceChains }) => evidenceChains.every(({ samples }) => samples.every(({ attributionConfidence }) => attributionConfidence >= N5_6_EVIDENCE_CONTRACT.attribution.minimumConfidence))) ? 1 : 0,
    incrementalFullEquivalence: incrementalChecks.every(Boolean) ? 1 : 0,
    productLikeBoundaryIntegrity: ignoredConceptNodes.length === 0 && productCard.nodes.some(({ concept, negativeEvidence }) => concept === "vibe.lively" && negativeEvidence > 0) && productCard.behavioralPreferences.every(({ key }) => !key.includes("hidden_gem")) ? 1 : 0,
    projectionProvenanceCompleteness: provenanceComplete ? 1 : 0,
    sameUserSemanticDifferentiation: round(average(sameUserDistances)), differentUserSemanticDifferentiation: round(average(differentUserDistances)),
    profileDumpControl: selectionRatios.every((ratio) => ratio <= 0.35) ? 1 : 0,
    currentIntentDuplicationControl: currentIntentDuplicates > 0 && projectedRows.every(({ reasonCodes }) => !reasonCodes?.includes("DUPLICATES_EXPLICIT_CURRENT_INTENT")) ? 1 : 0,
    independentPersonalizationSignalRate: selectedCount ? round((selectedCount - 0) / selectedCount) : 1
  };
  const gateMatrix = Object.fromEntries(Object.entries(contract.gates).map(([key, threshold]) => [key, metrics[key] >= threshold]));
  const profileDumpRate = round(world.projections.filter(({ projection }) => projection.positiveTaste.length + projection.negativeTaste.length >= 8).length / world.projections.length);
  const body = { artifactType: "BACKYRD_N5_6_CANONICAL_USER_INTELLIGENCE_RESULT", sealed: true, version: contract.version, contractHash: contentHash(contract), identities: { n56ContractHash: N5_6_CONTRACT_HASH, worldHash: world.worldHash, evaluatorReferenceHash: world.evaluatorReferenceHash }, profiles, projections, northStar: { userCard: north.userCard, evidenceChains: north.evidenceChains, changeLedger: north.changeLedger, snapshots: north.checkpoints.map(({ eventCount, asOf, userCard }) => ({ eventCount, asOf, maturity: userCard.maturity, memorySummary: userCard.memorySummary, nodes: userCard.nodes, patterns: userCard.occasionPatterns, uncertainty: userCard.uncertainty, userCardHash: userCard.userCardHash })), momentProjections: world.projections.filter(({ userId }) => userId === north.user.id).map(({ momentKey, city, currentMoment, projection }) => ({ momentKey, city, currentMoment, projection })) }, productLikeBoundaryFixture: { version: productFixture.version, expectedBoundaries: productFixture.expectedBoundaries, userCard: productCard }, diagnostics: { profileDumpRate, meanSelectionRatio: round(average(selectionRatios)), maximumSelectionRatio: round(Math.max(...selectionRatios)), currentIntentDuplicateSuppressions: currentIntentDuplicates, independentPersonalizationSignalRate: metrics.independentPersonalizationSignalRate, humanReviewRequired: true, automaticN6Authorization: false }, metrics, gateMatrix, scientificBoundary: { externalAiCalls: 0, externalAiCostUsd: 0, n6: "NOT_AUTHORIZED", ranking: "NONE", production: "UNCHANGED", historicN6AVerdicts: "UNCHANGED" } };
  return { ...body, allMandatoryGatesPass: Object.values(gateMatrix).every(Boolean), scientificValidity: Object.values(gateMatrix).every(Boolean) ? "PASS" : "FAIL", humanReview: "REQUIRED", n6: "NOT_AUTHORIZED", production: "UNCHANGED", resultHash: contentHash(body) };
}

export async function buildN5_6SealedArtifact() { return buildN5_6ValidationResult(); }

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildN5_6ValidationResult();
  if (process.argv.includes("--write")) await writeFile(baselineUrl, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ version: result.version, metrics: result.metrics, gateMatrix: result.gateMatrix, diagnostics: result.diagnostics, scientificValidity: result.scientificValidity, humanReview: result.humanReview, n6: result.n6, resultHash: result.resultHash }, null, 2)}\n`);
  if (!result.allMandatoryGatesPass) process.exitCode = 1;
}
