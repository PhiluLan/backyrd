import { contentHash } from "./canonical-json.mjs";
import { N3_VERSIONS } from "./n3-moment-intelligence.mjs";
import { N4_VERSIONS } from "./n4-spot-intelligence.mjs";
import { N5_VERSIONS } from "./n5-relevant-user-projection.mjs";
import { buildN6Input } from "./n6a-ai-decision-buddy.mjs";

export const N6A_SCENARIO_FAMILIES = Object.freeze([
  "COLD_START", "EARLY_USER", "MATURE_USER", "POWER_USER", "SAME_USER_DIFFERENT_MOMENT",
  "DIFFERENT_USERS_SAME_MOMENT", "CROSS_CITY", "UNKNOWN_CONTEXT", "INTENT_HISTORY_CONFLICT",
  "SPARSE_SPOT_INTELLIGENCE", "PREMIUM_FAIRNESS", "STRONG_WRONG_CANDIDATE", "BUDDY_DIRECTION_FAILURE"
]);
const concepts = ["vibe.cozy", "vibe.lively", "character.authentic_character", "discovery.hidden_gem", "discovery.mainstream", "character.design_led", "price.budget", "price.premium", "social_style.family_friendly", "social_style.conversation_friendly"];
const preferredByFamily = {
  COLD_START: ["vibe.cozy"], EARLY_USER: ["character.authentic_character"], MATURE_USER: ["discovery.hidden_gem"], POWER_USER: ["character.design_led"],
  SAME_USER_DIFFERENT_MOMENT: ["social_style.family_friendly"], DIFFERENT_USERS_SAME_MOMENT: ["discovery.mainstream"], CROSS_CITY: ["character.authentic_character"],
  UNKNOWN_CONTEXT: ["vibe.cozy"], INTENT_HISTORY_CONFLICT: ["vibe.lively"], SPARSE_SPOT_INTELLIGENCE: ["price.budget"], PREMIUM_FAIRNESS: ["social_style.conversation_friendly"],
  STRONG_WRONG_CANDIDATE: ["social_style.family_friendly"], BUDDY_DIRECTION_FAILURE: ["discovery.hidden_gem"]
};
const knowledgeByFamily = { COLD_START: "LOW", EARLY_USER: "LOW", UNKNOWN_CONTEXT: "LOW", SPARSE_SPOT_INTELLIGENCE: "MEDIUM" };

function currentMoment(family, index, seed) {
  const context = family === "SAME_USER_DIFFERENT_MOMENT" ? ["family", "friends", "date"][seed % 3]
    : family === "CROSS_CITY" ? "solo" : family === "INTENT_HISTORY_CONFLICT" ? "friends" : "date";
  const fields = {
    social_context: { value: context, confidence: 1, sourceClass: "EXPLICIT" },
    vibe: { value: ["cozy", "lively", "relaxed"][index % 3], confidence: 0.9, sourceClass: "EXPLICIT" },
    daypart: { value: index % 2 ? "evening" : "afternoon", confidence: 1, sourceClass: "OBSERVED" },
    calendar: { value: index % 2 ? "weekday" : "weekend", confidence: 1, sourceClass: "OBSERVED" },
    current_city: { value: family === "CROSS_CITY" ? "Copenhagen" : "Basel", confidence: 1, sourceClass: "OBSERVED" }
  };
  const compact = { version: N3_VERSIONS.momentSchema, fields, overallConfidence: 0.9, confidenceLevel: "HIGH", unknownFields: ["duration", "distance_willingness"] };
  return { ...compact, projectionHash: contentHash(compact) };
}

function projection(family, arm, preferred) {
  const level = knowledgeByFamily[family] ?? (family === "EARLY_USER" ? "LOW" : "HIGH");
  const actualConcepts = level === "LOW" ? [] : preferred;
  const selected = arm === "NEUTRAL" ? [] : arm === "OPPOSING" ? actualConcepts.map((concept) => concepts[(concepts.indexOf(concept) + 4) % concepts.length]) : actualConcepts;
  const body = {
    version: N5_VERSIONS.serialization,
    sufficiency: { level: arm === "NEUTRAL" ? "LOW" : level, score: arm === "NEUTRAL" ? 0 : level === "HIGH" ? 0.85 : 0.3 },
    relevantTaste: selected.map((concept, index) => ({ concept, affinity: 0.85, confidence: level === "HIGH" ? 0.86 : 0.42, relevance: 0.9, sourceLayer: index % 2 ? "CONTEXT" : "GLOBAL", reasonCodes: ["STRONG_KNOWN_PREFERENCE"] })),
    relevantPatterns: level === "HIGH" && arm !== "NEUTRAL" ? [{ contextSignature: { audience: "date" }, confidence: 0.8, relevance: 0.78, reasonCodes: ["RECURRING_OCCASION_PATTERN"] }] : [],
    recentRelevantEvidence: [], uncertainties: level === "LOW" || arm === "NEUTRAL" ? ["MINIMUM_NECESSARY_USER_KNOWLEDGE"] : [], contradictions: [],
    boundaries: { currentIntentAuthoritative: true, candidateIndependent: true, ranking: "NONE" }
  };
  const serializedBytes = Buffer.byteLength(JSON.stringify(body));
  return { ...body, serializedBytes, estimatedTokens: Math.ceil(serializedBytes / 4), serializationHash: contentHash(body) };
}

function candidates(family, seed, index) {
  return Array.from({ length: 10 }, (_, rank) => {
    const primary = concepts[(rank + seed + index) % concepts.length];
    const secondary = concepts[(rank * 3 + index + 2) % concepts.length];
    const sparse = family === "SPARSE_SPOT_INTELLIGENCE" && rank % 3 === 0;
    return {
      spotId: `n6-${seed}-${index}-spot-${rank}`,
      facts: { place_type: { value: rank % 2 ? "bar" : "restaurant", confidence: 0.98 }, city: { value: family === "CROSS_CITY" ? "Copenhagen" : "Basel", confidence: 0.98 }, price_level: { value: rank % 4 + 1, confidence: 0.9 } },
      concepts: sparse ? [] : [primary, secondary].map((concept) => ({ concept, value: 0.75, confidence: 0.72, evidenceFamilies: [rank % 2 ? "community_derived" : "backyrd_derived"] })),
      contradictions: [], intelligenceConfidence: sparse ? 0.1 : 0.74, evidenceSufficiency: sparse ? "SPARSE" : "RICH", version: N4_VERSIONS.serialization
    };
  });
}

function evaluatorTruth(candidateRows, preferred, family, index) {
  return Object.fromEntries(candidateRows.map((candidate, rank) => {
    const candidateConcepts = new Set(candidate.concepts.map(({ concept }) => concept));
    const userFit = preferred.filter((concept) => candidateConcepts.has(concept)).length / preferred.length;
    const intentConcept = family === "INTENT_HISTORY_CONFLICT" ? "vibe.lively" : preferred[0];
    const intentFit = candidateConcepts.has(intentConcept) ? 1 : 0;
    const directionViolation = family === "STRONG_WRONG_CANDIDATE" && rank === 0 || family === "BUDDY_DIRECTION_FAILURE" && rank === 1;
    const utility = Math.max(0, Math.min(1, 0.18 + 0.42 * intentFit + 0.28 * userFit + 0.08 * (1 - rank / 10) - (directionViolation ? 0.5 : 0)));
    return [candidate.spotId, { utility: Number(utility.toFixed(6)), directionAligned: !directionViolation && (intentFit > 0 || utility >= 0.45) }];
  }));
}

export function buildN6AScenario({ seed, index, arm = "ACTUAL" }) {
  const family = N6A_SCENARIO_FAMILIES[index % N6A_SCENARIO_FAMILIES.length];
  const preferred = preferredByFamily[family];
  const candidateRows = candidates(family, seed, index);
  const moment = currentMoment(family, index, seed);
  const intentConcept = family === "INTENT_HISTORY_CONFLICT" ? "vibe.lively" : preferred[0];
  const currentIntent = { requestSummary: family === "CROSS_CITY" ? "two hours walking and a relaxed drink in Copenhagen" : `current ${intentConcept} decision`, conceptDirections: [{ concept: intentConcept, direction: 1 }], excludedPlaceTypes: [] };
  const input = buildN6Input({ decisionId: `${seed}-${index}-${arm}`, currentIntent, currentMoment: moment, relevantUserProjection: projection(family, arm, preferred), candidates: candidateRows });
  return {
    scenarioId: `${seed}-${index}`, seed, index, family, arm, input,
    evaluator: { truth: evaluatorTruth(candidateRows, preferred, family, index), preferredConcepts: preferred, currentIntentConcept: intentConcept, mature: !["COLD_START", "EARLY_USER"].includes(family), crossCity: family === "CROSS_CITY", cold: family === "COLD_START" }
  };
}

export function buildN6AScenarioMatrix({ count = 42, seeds = [6101, 6102, 6103], arms = ["ACTUAL", "NEUTRAL", "OPPOSING"] } = {}) {
  const perSeed = Math.ceil(count / seeds.length);
  return seeds.flatMap((seed) => Array.from({ length: perSeed }, (_, index) => arms.map((arm) => buildN6AScenario({ seed, index, arm })))).flat().slice(0, count * arms.length);
}
