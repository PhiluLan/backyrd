import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { repoRoot } from "./io.mjs";
import { N3_VERSIONS } from "./n3-moment-intelligence.mjs";
import { N4_VERSIONS } from "./n4-spot-intelligence.mjs";
import { N5_VERSIONS } from "./n5-relevant-user-projection.mjs";

export const N6A_VERSIONS = Object.freeze({
  buddy: "backyrd-ai-decision-buddy-v1",
  input: "backyrd-n6-ai-decision-input-v1",
  output: "backyrd-n6-ai-decision-output-v1",
  instruction: "backyrd-ai-decision-buddy-instruction-v1",
  reasons: "backyrd-n6-buddy-reason-codes-v1",
  confidence: "backyrd-n6-decision-confidence-v1",
  direction: "backyrd-buddy-direction-alignment-v1",
  cost: "backyrd-n6a-cost-contract-v1",
  validation: "backyrd-n6a-validation-contract-v1"
});

export const WHY_FOR_YOU_CODES = Object.freeze([
  "USER_TASTE_MATCH", "PLACE_TYPE_TASTE_MATCH", "CONTEXTUAL_TASTE_MATCH", "OCCASION_PATTERN_MATCH"
]);
export const WHY_NOW_CODES = Object.freeze([
  "CURRENT_INTENT_MATCH", "CURRENT_MOMENT_MATCH", "CONTEXTUAL_SPOT_MATCH", "PRACTICAL_FIT"
]);
export const UNCERTAINTY_CODES = Object.freeze([
  "LOW_USER_KNOWLEDGE", "LOW_MOMENT_UNDERSTANDING", "SPARSE_SPOT_INTELLIGENCE", "CONTRADICTORY_EVIDENCE"
]);

const forbidden = /(latent|ground[_-]?truth|expected[_-]?utility|evaluation[_-]?label|oracle|owner[_-]?tier|premium|billing|payment|trust|moderation|raw[_-]?history|contact|fingerprint|precise[_-]?location|user[_-]?id)/i;
const clamp = (value) => Math.max(0, Math.min(1, Number(value)));
const CACHE_DIR = resolve(repoRoot, "decision-lab/.ai-cache/n6a-v1");

function assertNoForbidden(value, path = "input") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) throw new Error(`forbidden_n6_input:${path}.${key}`);
    assertNoForbidden(child, `${path}.${key}`);
  }
}

export function buildN6Input({ decisionId, currentIntent, currentMoment, relevantUserProjection, candidates }) {
  if (!decisionId || !currentIntent || !currentMoment || !relevantUserProjection || !Array.isArray(candidates)) throw new Error("n6_input_required");
  if (currentMoment.version !== N3_VERSIONS.momentSchema) throw new Error("n3_moment_version_mismatch");
  if (relevantUserProjection.version !== N5_VERSIONS.serialization) throw new Error("n5_projection_version_mismatch");
  if (!candidates.length || candidates.some((row) => row.version !== N4_VERSIONS.serialization)) throw new Error("n4_candidate_version_mismatch");
  const candidateIds = candidates.map(({ spotId }) => spotId);
  if (new Set(candidateIds).size !== candidateIds.length) throw new Error("duplicate_input_candidate");
  const body = {
    version: N6A_VERSIONS.input,
    decisionRef: contentHash(String(decisionId)),
    authority: ["ELIGIBILITY_PREVALIDATED", "EXPLICIT_CURRENT_INTENT", "CURRENT_MOMENT", "RELEVANT_USER_KNOWLEDGE", "UNKNOWN"],
    currentIntent,
    currentMoment,
    relevantUserProjection,
    candidates
  };
  assertNoForbidden(body);
  return Object.freeze({ ...body, inputHash: contentHash(body) });
}

export function buddyInstructions() {
  return [
    "Rank every supplied eligible candidate exactly once. Never invent or remove a candidate.",
    "Explicit current intent has highest authority; history may personalize only within it.",
    "Use the current moment to decide what matters now and only use relevant user knowledge in proportion to its sufficiency and confidence.",
    "UNKNOWN is neutral. Sparse evidence must not become a negative fact or a confident claim.",
    "Return evidence-bound reason codes and calibrated uncertainty. Do not infer payment, premium, trust, identity, or hidden facts."
  ].join(" ");
}

export function n6OutputSchema(candidateIds) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      ranked_candidates: { type: "array", minItems: candidateIds.length, maxItems: candidateIds.length, items: {
        type: "object", additionalProperties: false,
        properties: {
          spot_id: { type: "string", enum: candidateIds }, rank: { type: "integer", minimum: 1, maximum: candidateIds.length },
          buddy_fit: { type: "number", minimum: 0, maximum: 1 }, confidence: { type: "number", minimum: 0, maximum: 1 },
          why_for_you_reason_codes: { type: "array", maxItems: 3, items: { type: "string", enum: WHY_FOR_YOU_CODES } },
          why_now_reason_codes: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: WHY_NOW_CODES } },
          uncertainty_codes: { type: "array", maxItems: 3, items: { type: "string", enum: UNCERTAINTY_CODES } }
        },
        required: ["spot_id", "rank", "buddy_fit", "confidence", "why_for_you_reason_codes", "why_now_reason_codes", "uncertainty_codes"]
      } },
      decision_confidence: { type: "number", minimum: 0, maximum: 1 },
      user_knowledge_sufficiency: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      moment_understanding_sufficiency: { type: "string", enum: ["LOW", "PARTIAL", "HIGH"] }
    },
    required: ["ranked_candidates", "decision_confidence", "user_knowledge_sufficiency", "moment_understanding_sufficiency"]
  };
}

function evidenceSupports(code, input, candidate) {
  const user = input.relevantUserProjection;
  const moment = input.currentMoment;
  if (code === "USER_TASTE_MATCH") return user.sufficiency.level !== "LOW" && user.relevantTaste.some(({ concept }) => candidate.concepts.some((row) => row.concept === concept));
  if (code === "PLACE_TYPE_TASTE_MATCH") return user.relevantTaste.some(({ sourceLayer, concept }) => sourceLayer === "PLACE_TYPE" && candidate.concepts.some((row) => row.concept === concept));
  if (code === "CONTEXTUAL_TASTE_MATCH") return user.relevantTaste.some(({ sourceLayer, concept }) => sourceLayer === "CONTEXT" && candidate.concepts.some((row) => row.concept === concept));
  if (code === "OCCASION_PATTERN_MATCH") return user.relevantPatterns.length > 0;
  if (code === "CURRENT_INTENT_MATCH") return Object.keys(input.currentIntent).length > 0;
  if (code === "CURRENT_MOMENT_MATCH") return moment.overallConfidence > 0;
  if (code === "CONTEXTUAL_SPOT_MATCH") return candidate.concepts.length > 0;
  if (code === "PRACTICAL_FIT") return Object.keys(candidate.facts).length > 0;
  if (code === "LOW_USER_KNOWLEDGE") return user.sufficiency.level === "LOW";
  if (code === "LOW_MOMENT_UNDERSTANDING") return moment.confidenceLevel !== "HIGH";
  if (code === "SPARSE_SPOT_INTELLIGENCE") return candidate.evidenceSufficiency === "SPARSE";
  if (code === "CONTRADICTORY_EVIDENCE") return user.contradictions.length > 0 || candidate.contradictions.length > 0;
  return false;
}

export function validateBuddyOutput(payload, input) {
  const ids = input.candidates.map(({ spotId }) => spotId);
  if (!payload || !Array.isArray(payload.ranked_candidates)) return { valid: false, reason: "MALFORMED_OUTPUT" };
  if (payload.ranked_candidates.length !== ids.length) return { valid: false, reason: "MISSING_CANDIDATE" };
  const outputIds = payload.ranked_candidates.map(({ spot_id }) => spot_id);
  if (new Set(outputIds).size !== outputIds.length) return { valid: false, reason: "DUPLICATE_CANDIDATE" };
  if (outputIds.some((id) => !ids.includes(id))) return { valid: false, reason: "UNKNOWN_CANDIDATE" };
  const ranks = payload.ranked_candidates.map(({ rank }) => rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) return { valid: false, reason: "INVALID_RANK" };
  if (![payload.decision_confidence, ...payload.ranked_candidates.flatMap((row) => [row.buddy_fit, row.confidence])].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return { valid: false, reason: "INVALID_CONFIDENCE" };
  if (payload.user_knowledge_sufficiency !== input.relevantUserProjection.sufficiency.level) return { valid: false, reason: "SUFFICIENCY_MISMATCH" };
  if (payload.moment_understanding_sufficiency !== input.currentMoment.confidenceLevel) return { valid: false, reason: "MOMENT_SUFFICIENCY_MISMATCH" };
  for (const row of payload.ranked_candidates) {
    const candidate = input.candidates.find(({ spotId }) => spotId === row.spot_id);
    const groups = [row.why_for_you_reason_codes, row.why_now_reason_codes, row.uncertainty_codes];
    if (groups.some((group) => !Array.isArray(group)) || row.why_now_reason_codes.length === 0) return { valid: false, reason: "INVALID_REASON_CODES" };
    if ([...groups.flat()].some((code) => !evidenceSupports(code, input, candidate))) return { valid: false, reason: "UNSUPPORTED_REASON_EVIDENCE" };
    if (input.relevantUserProjection.sufficiency.level === "LOW" && row.why_for_you_reason_codes.length > 0) return { valid: false, reason: "LOW_SUFFICIENCY_OVERPERSONALIZATION" };
  }
  return { valid: true, ranked: [...payload.ranked_candidates].sort((a, b) => a.rank - b.rank) };
}

export function estimateTokens(value, multiplier = 1.2) { return Math.ceil(Buffer.byteLength(JSON.stringify(value), "utf8") / 4 * multiplier); }
export function estimateRequestCost(config, inputTokens = config.maxInputTokensPerRequest, outputTokens = config.modelConfig.maxOutputTokens) {
  const rates = config.costAccountingCeilingUsdPerMillionTokens;
  return inputTokens / 1_000_000 * rates.input + outputTokens / 1_000_000 * rates.output;
}
export function requireAiBudget(env = process.env) {
  const budget = Number(env.DECISION_LAB_AI_BUDGET_USD);
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("DECISION_LAB_AI_BUDGET_USD_REQUIRED");
  return budget;
}
export function assertBudget({ budgetUsd, spentUsd, projectedUsd }) {
  if (![budgetUsd, spentUsd, projectedUsd].every(Number.isFinite) || spentUsd + projectedUsd > budgetUsd + 1e-12) throw new Error("N6A_AI_BUDGET_PROJECTED_EXCEEDED");
}
export function estimateStage(config, stage) {
  const row = config.stages[stage]; if (!row) throw new Error(`unknown_stage:${stage}`);
  const perRequest = estimateRequestCost(config);
  return { stage, requests: row.maxRequests, maximumInputTokens: row.maxRequests * config.maxInputTokensPerRequest, maximumOutputTokens: row.maxRequests * config.modelConfig.maxOutputTokens, worstCaseCostUsd: row.maxRequests * perRequest };
}

function responseText(response) {
  for (const item of response.output ?? []) for (const content of item.content ?? []) if (content.type === "output_text") return content.text;
  return null;
}
async function cacheRead(key) { try { return JSON.parse(await readFile(resolve(CACHE_DIR, `${key}.json`), "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function cacheWrite(key, value) { await mkdir(CACHE_DIR, { recursive: true }); await writeFile(resolve(CACHE_DIR, `${key}.json`), `${JSON.stringify(value)}\n`, { mode: 0o600 }); }

export async function callAiBuddy({ config, input, ledger, env = process.env, fetchImpl = fetch }) {
  const budgetUsd = requireAiBudget(env);
  if (!env.DECISION_LAB_OPENAI_API_KEY) throw new Error("DECISION_LAB_OPENAI_API_KEY_REQUIRED");
  const schema = n6OutputSchema(input.candidates.map(({ spotId }) => spotId));
  const inputTokens = estimateTokens({ instructions: buddyInstructions(), input, schema }, config.tokenEstimateSafetyMultiplier);
  if (inputTokens > config.maxInputTokensPerRequest) throw new Error("N6A_INPUT_TOKEN_CAP_EXCEEDED");
  const cacheKey = contentHash({ model: config.model, modelConfig: config.modelConfig, promptVersion: config.promptVersion, momentHash: input.currentMoment.projectionHash, projectionHash: input.relevantUserProjection.serializationHash, candidateHash: contentHash(input.candidates), input });
  const cached = await cacheRead(cacheKey); if (cached) return { ...cached, execution: "CACHE_REPLAY", costUsd: 0 };
  assertBudget({ budgetUsd, spentUsd: ledger.spentUsd, projectedUsd: estimateRequestCost(config, inputTokens) });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.modelConfig.timeoutMs); const started = performance.now();
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", { method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.DECISION_LAB_OPENAI_API_KEY}` },
      body: JSON.stringify({ model: config.model, instructions: buddyInstructions(), input: JSON.stringify(input), reasoning: { effort: config.modelConfig.reasoningEffort }, max_output_tokens: config.modelConfig.maxOutputTokens, text: { format: { type: "json_schema", name: "backyrd_n6a_buddy", strict: true, schema } } }) });
  } finally { clearTimeout(timeout); }
  const latencyMs = performance.now() - started;
  if (!response.ok) throw new Error(`OPENAI_API_ERROR:${response.status}:${(await response.text()).slice(0, 160)}`);
  const raw = await response.json(); let parsed = null;
  try { parsed = JSON.parse(responseText(raw)); } catch { /* validator fails closed */ }
  const validation = validateBuddyOutput(parsed, input);
  const usage = { inputTokens: Number(raw.usage?.input_tokens ?? 0), outputTokens: Number(raw.usage?.output_tokens ?? 0) };
  const costUsd = estimateRequestCost(config, usage.inputTokens, usage.outputTokens); ledger.spentUsd += costUsd;
  if (ledger.spentUsd > budgetUsd + 1e-12) throw new Error("N6A_AI_BUDGET_ACTUAL_EXCEEDED");
  const result = { execution: "LIVE_CALL", responseHash: contentHash(raw.id ?? "missing"), model: raw.model ?? config.model, validation, ranking: validation.valid ? validation.ranked : null, decisionConfidence: validation.valid ? parsed.decision_confidence : null, usage, costUsd, latencyMs, cacheKey };
  if (validation.valid) await cacheWrite(cacheKey, result);
  return result;
}

export function deterministicFallback(input) {
  return input.candidates.map(({ spotId }, index) => ({ spot_id: spotId, rank: index + 1, reason: "CANONICAL_INPUT_ORDER" }));
}

export function buildN6AFlightRecord(input, result, failureClassification = "UNKNOWN") {
  return Object.freeze({
    version: "backyrd-n6a-flight-recorder-v1", inputHash: input.inputHash,
    currentIntent: input.currentIntent,
    moment: { projectionHash: input.currentMoment.projectionHash, confidence: input.currentMoment.overallConfidence, sufficiency: input.currentMoment.confidenceLevel },
    userProjection: { serializationHash: input.relevantUserProjection.serializationHash, sufficiency: input.relevantUserProjection.sufficiency, uncertainties: input.relevantUserProjection.uncertainties },
    candidates: input.candidates.map(({ spotId, intelligenceConfidence, evidenceSufficiency }) => ({ spotId, intelligenceConfidence, evidenceSufficiency })),
    model: result.model ?? null, execution: result.execution, validation: result.validation,
    rankedOutput: result.ranking, decisionConfidence: result.decisionConfidence,
    failureClassification, usage: result.usage ?? { inputTokens: 0, outputTokens: 0 }, latencyMs: result.latencyMs ?? 0, costUsd: result.costUsd ?? 0,
    secretMaterialPresent: false
  });
}

export const N6A_CONTRACT = Object.freeze({ versions: N6A_VERSIONS, authority: ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "HARD_CONSTRAINTS", "EXPLICIT_CURRENT_INTENT", "CURRENT_MOMENT", "RELEVANT_USER_KNOWLEDGE"], whyForYouCodes: WHY_FOR_YOU_CODES, whyNowCodes: WHY_NOW_CODES, uncertaintyCodes: UNCERTAINTY_CODES, boundaries: { eligibleCandidatesOnly: true, premiumBlind: true, latentTruthRuntimeInput: false, productionIntegration: "NOT_STARTED", fallback: "DETERMINISTIC_CANONICAL_INPUT_ORDER" } });
export const N6A_CONTRACT_HASH = contentHash(N6A_CONTRACT);
