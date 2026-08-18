import assert from "node:assert/strict";
import test from "node:test";
import config from "../config/n6a-ai-decision-buddy-v1.json" with { type: "json" };
import { buildN6AScenario, buildN6AScenarioMatrix } from "../src/n6a-scenarios.mjs";
import { assertBudget, buildN6AFlightRecord, buildN6Input, deterministicFallback, estimateStage, n6OutputSchema, requireAiBudget, validateBuddyOutput } from "../src/n6a-ai-decision-buddy.mjs";

const scenario = (arm = "ACTUAL", index = 2) => buildN6AScenario({ seed: 6101, index, arm });
function validPayload(input) {
  const low = input.relevantUserProjection.sufficiency.level === "LOW";
  return { ranked_candidates: input.candidates.map((candidate, index) => ({ spot_id: candidate.spotId, rank: index + 1, buddy_fit: 0.8 - index * 0.03, confidence: 0.7, why_for_you_reason_codes: low ? [] : candidate.concepts.some(({ concept }) => input.relevantUserProjection.relevantTaste.some((taste) => taste.concept === concept)) ? ["USER_TASTE_MATCH"] : [], why_now_reason_codes: ["CURRENT_INTENT_MATCH"], uncertainty_codes: low ? ["LOW_USER_KNOWLEDGE"] : candidate.evidenceSufficiency === "SPARSE" ? ["SPARSE_SPOT_INTELLIGENCE"] : [] })), decision_confidence: 0.72, user_knowledge_sufficiency: input.relevantUserProjection.sufficiency.level, moment_understanding_sufficiency: input.currentMoment.confidenceLevel };
}

test("N6A accepts a complete evidence-bound ranking and preserves deterministic fallback", () => {
  const input = scenario().input; assert.equal(validateBuddyOutput(validPayload(input), input).valid, true);
  assert.deepEqual(deterministicFallback(input).map((row) => row.spot_id), input.candidates.map((row) => row.spotId));
});
test("N6A rejects hallucinated, duplicate, missing, malformed and invalid confidence output", () => {
  const input = scenario().input; const valid = validPayload(input);
  assert.equal(validateBuddyOutput({ ...valid, ranked_candidates: valid.ranked_candidates.slice(1) }, input).reason, "MISSING_CANDIDATE");
  assert.equal(validateBuddyOutput({ ...valid, ranked_candidates: valid.ranked_candidates.map((row, index) => index === 0 ? { ...row, spot_id: "invented" } : row) }, input).reason, "UNKNOWN_CANDIDATE");
  assert.equal(validateBuddyOutput({ ...valid, ranked_candidates: valid.ranked_candidates.map((row, index) => index === 1 ? { ...row, spot_id: valid.ranked_candidates[0].spot_id } : row) }, input).reason, "DUPLICATE_CANDIDATE");
  assert.equal(validateBuddyOutput({ ...valid, decision_confidence: 2 }, input).reason, "INVALID_CONFIDENCE");
  assert.equal(validateBuddyOutput(null, input).reason, "MALFORMED_OUTPUT");
});
test("N6A rejects unsupported reasons and low-sufficiency overpersonalization", () => {
  const mature = scenario().input; const unsupported = validPayload(mature); unsupported.ranked_candidates[0].why_for_you_reason_codes = ["PLACE_TYPE_TASTE_MATCH"];
  assert.equal(validateBuddyOutput(unsupported, mature).reason, "UNSUPPORTED_REASON_EVIDENCE");
  const low = scenario("ACTUAL", 0).input; const over = validPayload(low); over.ranked_candidates[0].why_for_you_reason_codes = ["USER_TASTE_MATCH"];
  assert.equal(validateBuddyOutput(over, low).reason, "UNSUPPORTED_REASON_EVIDENCE");
});
test("N6A input rejects Premium, trust, latent truth and version drift", () => {
  const input = scenario().input;
  assert.throws(() => buildN6Input({ decisionId: "x", currentIntent: { premium: true }, currentMoment: input.currentMoment, relevantUserProjection: input.relevantUserProjection, candidates: input.candidates }), /forbidden/);
  assert.throws(() => buildN6Input({ decisionId: "x", currentIntent: { trustScore: 1 }, currentMoment: input.currentMoment, relevantUserProjection: input.relevantUserProjection, candidates: input.candidates }), /forbidden/);
  assert.throws(() => buildN6Input({ decisionId: "x", currentIntent: { latentTruth: true }, currentMoment: input.currentMoment, relevantUserProjection: input.relevantUserProjection, candidates: input.candidates }), /forbidden/);
  assert.throws(() => buildN6Input({ decisionId: "x", currentIntent: {}, currentMoment: { ...input.currentMoment, version: "wrong" }, relevantUserProjection: input.relevantUserProjection, candidates: input.candidates }), /version/);
});
test("N6A budget is mandatory and fail-closed before projected overrun", () => {
  assert.throws(() => requireAiBudget({}), /REQUIRED/); assert.throws(() => assertBudget({ budgetUsd: 1, spentUsd: 0.9, projectedUsd: 0.2 }), /EXCEEDED/);
  assert.ok(estimateStage(config, "SMOKE").worstCaseCostUsd > 0);
});
test("N6A schema freezes candidate identity and parity across treatments", () => {
  const arms = ["ACTUAL", "NEUTRAL", "OPPOSING"].map((arm) => scenario(arm));
  assert.deepEqual(arms[0].input.candidates, arms[1].input.candidates); assert.deepEqual(arms[0].input.currentMoment, arms[2].input.currentMoment);
  const ids = arms[0].input.candidates.map(({ spotId }) => spotId); assert.deepEqual(n6OutputSchema(ids).properties.ranked_candidates.items.properties.spot_id.enum, ids);
  assert.equal(buildN6AScenarioMatrix({ count: 42 }).length, 126);
});
test("N6A cross-city and same-user/different-moment arms remain explicit", () => {
  const matrix = buildN6AScenarioMatrix({ count: 42, arms: ["ACTUAL"] });
  assert.ok(matrix.some(({ family, input }) => family === "CROSS_CITY" && input.currentMoment.fields.current_city.value === "Copenhagen"));
  const moments = matrix.filter(({ family }) => family === "SAME_USER_DIFFERENT_MOMENT").map(({ input }) => input.currentMoment.fields.social_context.value);
  assert.ok(new Set(moments).size >= 2);
});
test("N6A Flight Recorder is decomposed, secret-free and failure-aware", () => {
  const input = scenario().input; const payload = validPayload(input); const validation = validateBuddyOutput(payload, input);
  const record = buildN6AFlightRecord(input, { model: config.model, execution: "CACHE_REPLAY", validation, ranking: validation.ranked, decisionConfidence: payload.decision_confidence, usage: { inputTokens: 10, outputTokens: 10 }, latencyMs: 1, costUsd: 0 }, "NONE");
  assert.equal(record.failureClassification, "NONE"); assert.equal(record.userProjection.sufficiency.level, "HIGH"); assert.equal(record.secretMaterialPresent, false);
  assert.doesNotMatch(JSON.stringify(record), /sk-[A-Za-z0-9_-]{12,}/);
});
