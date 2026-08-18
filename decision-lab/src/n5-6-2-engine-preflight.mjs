import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import { EVIDENCE_MODEL } from "./taste-engine.mjs";
import { N5_6_CONTRACT_HASH, N5_6_EVIDENCE_CONTRACT, buildEvidenceChains } from "./n5-6-canonical-user-intelligence.mjs";
import { N5_6_1_PROJECTION_CONTRACT_HASH } from "./n5-6-1-moment-aware-projection.mjs";
import { buildN5_6_2SeedTreatment } from "./n5-6-2-evaluator.mjs";
import { N5_6_2_SEEDS, buildN5_6_2World } from "./n5-6-2-realistic-user-world.mjs";

export const N5_6_2_ENGINE_DEFECT_ID = "N5.6.2-ED-001";
export const N5_6_2_PREFLIGHT_VERSION = "backyrd-n5-6-2-engine-defect-preflight-v1";
const baselineUrl = new URL("../baselines/n5-6-2-engine-defect-preflight-v1.json", import.meta.url);
const contractUrl = new URL("../config/n5-6-2-validation-contract-v1.json", import.meta.url);
const round = (value) => Number(value.toFixed(6));

function spotIntelligence(world) {
  return Object.fromEntries(world.spots.map((spot) => [spot.id, { spotId: spot.id, concepts: spot.concepts }]));
}

function negativeJourneyAudit(world) {
  const intelligence = spotIntelligence(world);
  const rows = [];
  for (const user of world.users) {
    for (const negative of user.events.filter(({ eventType }) => ["explicit_negative", "negative_post_visit"].includes(eventType))) {
      const journey = user.events.filter((event) => event.sessionId === negative.sessionId && event.spotId === negative.spotId);
      const chain = buildEvidenceChains(journey, { asOf: world.asOf, spotIntelligence: intelligence })[0];
      const negativeSelected = chain.samples.filter(({ eventId, direction }) => eventId === negative.id && direction < 0);
      const positiveVisit = journey.find(({ eventType }) => eventType === "verified_visit");
      rows.push({
        userId: user.id, sessionId: negative.sessionId, spotId: negative.spotId,
        negativeEventId: negative.id, negativeEventType: negative.eventType,
        positiveVisitEventId: positiveVisit?.id ?? null,
        negativeSelectedSampleCount: negativeSelected.length,
        selectedDirections: [...new Set(chain.samples.map(({ direction }) => Math.sign(direction)))],
        selectedEventTypes: [...new Set(chain.samples.map(({ eventId }) => journey.find(({ id }) => id === eventId)?.eventType).filter(Boolean))],
        sample: chain.samples.slice(0, 8).map(({ concept, scope, direction, magnitude, eventId, evidenceFamily }) => ({ concept, scope, direction, magnitude: round(magnitude), eventId, evidenceFamily }))
      });
    }
  }
  return rows;
}

export async function buildN5_6_2EnginePreflight() {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const seedResults = N5_6_2_SEEDS.map((seed) => {
    const world = buildN5_6_2World(seed);
    const treatment = buildN5_6_2SeedTreatment(seed);
    const audits = negativeJourneyAudit(world);
    return {
      seed, worldHash: world.worldHash, treatmentHash: treatment.treatmentHash,
      population: treatment.diagnostics.population, sessions: treatment.diagnostics.sessions, events: treatment.diagnostics.events,
      missingOutcomeRate: treatment.diagnostics.missingOutcomeRate, explicitFeedbackRate: treatment.diagnostics.explicitFeedbackRate,
      outcomeDistribution: treatment.diagnostics.outcomes, placeTypes: treatment.diagnostics.placeTypes, audiences: treatment.diagnostics.audiences,
      confidenceDistribution: treatment.confidence, diagnosticLearningMetrics: treatment.learning.metrics,
      negativeFeedbackJourneys: audits.length,
      negativeFeedbackSamplesSelected: audits.reduce((sum, row) => sum + row.negativeSelectedSampleCount, 0),
      learnedNegativeNodes: treatment.profiles.reduce((sum, profile) => sum + profile.userCard.nodes.filter(({ polarity }) => polarity === "NEGATIVE").length, 0),
      swallowedNegativeJourneys: audits.filter(({ negativeSelectedSampleCount }) => negativeSelectedSampleCount === 0).length,
      representativeFailure: audits[0]
    };
  });
  const positiveVisitStrength = EVIDENCE_MODEL.verified_visit.strength * N5_6_EVIDENCE_CONTRACT.reliability.outcome;
  const negativeOutcomeStrength = EVIDENCE_MODEL.negative_post_visit.strength * N5_6_EVIDENCE_CONTRACT.reliability.explicit_negative;
  const explicitNegativeStrength = EVIDENCE_MODEL.disliked.strength * N5_6_EVIDENCE_CONTRACT.reliability.explicit_negative;
  const defectProven = seedResults.every((row) => row.negativeFeedbackJourneys > 0 && row.negativeFeedbackSamplesSelected === 0 && row.learnedNegativeNodes === 0);
  const body = {
    artifactType: "BACKYRD_N5_6_2_ENGINE_DEFECT_PREFLIGHT",
    sealed: true,
    version: N5_6_2_PREFLIGHT_VERSION,
    defectId: N5_6_2_ENGINE_DEFECT_ID,
    contractHash: contentHash(contract),
    identities: { engineContractHash: N5_6_CONTRACT_HASH, projectionContractHash: N5_6_1_PROJECTION_CONTRACT_HASH, worldHashes: seedResults.map(({ worldHash }) => worldHash) },
    rootCause: {
      classification: "ENGINE_DEFECT",
      component: "N5.6_EVIDENCE_CHAIN_STRONGEST_DISPOSITION_SELECTION",
      mechanism: "Within one journey/concept/scope, verified_visit has greater weighted positive magnitude than the later explicit negative outcome, so the negative sample is discarded before User Intelligence aggregation.",
      weightedStrengthBeforeSpotConfidenceAndDilution: { verifiedVisitPositive: round(positiveVisitStrength), negativePostVisit: round(negativeOutcomeStrength), explicitNegative: round(explicitNegativeStrength) },
      semanticViolation: "A confirmed visit is not satisfaction and must not erase explicit post-visit negative evidence.",
      worldValidity: "A visit followed by explicit negative feedback is a canonical Product-observable journey, not a fixture anomaly."
    },
    seedResults,
    stopRule: { triggered: defectProven, code: "ENGINE_LIMITATION_FOUND_BY_REALISTIC_WORLD", officialWorldFreezeCreated: false, officialMeasurementStarted: false, officialQualityVerdictProduced: false, engineModified: false },
    historicalVerdicts: { n56: "FAIL_UNCHANGED", n561: "PASS_UNCHANGED", n6a: "FAIL_UNCHANGED" },
    scientificBoundary: { externalDecisionAiCalls: 0, externalDecisionAiCostUsd: 0, n6: "NOT_AUTHORIZED", production: "UNCHANGED" }
  };
  return { ...body, defectProven, scientificValidity: defectProven ? "PASS" : "FAIL", n562Disposition: defectProven ? "STOPPED_ENGINE_DEFECT" : "PREFLIGHT_INCONCLUSIVE", resultHash: contentHash(body) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildN5_6_2EnginePreflight();
  if (process.argv.includes("--write")) await writeFile(baselineUrl, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ version: result.version, defectId: result.defectId, rootCause: result.rootCause, seeds: result.seedResults.map(({ seed, negativeFeedbackJourneys, negativeFeedbackSamplesSelected, learnedNegativeNodes, swallowedNegativeJourneys }) => ({ seed, negativeFeedbackJourneys, negativeFeedbackSamplesSelected, learnedNegativeNodes, swallowedNegativeJourneys })), stopRule: result.stopRule, scientificValidity: result.scientificValidity, n562Disposition: result.n562Disposition, resultHash: result.resultHash }, null, 2)}\n`);
  if (!result.defectProven) process.exitCode = 1;
}
