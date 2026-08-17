import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { repoRoot } from "./io.mjs";

const VALID_REASON_CODES = new Set([
  "current_intent_fit", "contextual_fit", "personal_taste_fit", "place_type_fit",
  "strong_spot_evidence", "retrieval_support", "uncertain_fit",
]);

export const AI_RERANKER_VERSION = "backyrd-ai-decision-reranker-v1";
export const CACHE_DIR = resolve(repoRoot, ".decision-lab-ai-cache/d4.3");

export function estimateTokens(value, safetyMultiplier = 1.15) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil((Buffer.byteLength(text, "utf8") / 4) * safetyMultiplier);
}

export function estimateStageCost(config, stage) {
  const spec = config.stages[stage];
  if (!spec) throw new Error(`unknown_stage:${stage}`);
  const requests = spec.maxRequests;
  const inputTokens = requests * config.maxInputTokensPerRequest;
  const outputTokens = requests * config.modelConfig.maxOutputTokens;
  const expectedInputTokens = Math.ceil(inputTokens * 0.7);
  const expectedOutputTokens = Math.ceil(outputTokens * 0.55);
  const cost = (inTokens, outTokens) => (inTokens / 1_000_000) * config.pricingUsdPerMillionTokens.input + (outTokens / 1_000_000) * config.pricingUsdPerMillionTokens.output;
  return {
    stage, requests,
    expected: { inputTokens: expectedInputTokens, outputTokens: expectedOutputTokens, costUsd: cost(expectedInputTokens, expectedOutputTokens) },
    worstCase: { inputTokens, outputTokens, costUsd: cost(inputTokens, outputTokens) },
  };
}

export function fullExperimentCostProjection(config) {
  const stages = ["SMOKE", "PILOT", "FULL"].map((stage) => estimateStageCost(config, stage));
  return {
    stages,
    totalExpectedUsd: stages.reduce((sum, row) => sum + row.expected.costUsd, 0),
    totalWorstCaseUsd: stages.reduce((sum, row) => sum + row.worstCase.costUsd, 0),
    requests: stages.reduce((sum, row) => sum + row.requests, 0),
  };
}

export function requireBudget(env = process.env) {
  const budget = Number(env.DECISION_LAB_AI_BUDGET_USD);
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("DECISION_LAB_AI_BUDGET_USD_required");
  return budget;
}

export function assertProjectedBudget({ budgetUsd, spentUsd, projectedUsd }) {
  if (![budgetUsd, spentUsd, projectedUsd].every(Number.isFinite)) throw new Error("invalid_budget_projection");
  if (spentUsd + projectedUsd > budgetUsd + 1e-12) throw new Error(`AI_BUDGET_PROJECTED_EXCEEDED:${(spentUsd + projectedUsd).toFixed(6)}>${budgetUsd.toFixed(6)}`);
}

export function compactAiInput({ request, context, tasteProjection = [], candidates }) {
  return {
    intent: {
      query: String(request?.query ?? request?.rawFreeText ?? "").slice(0, 160),
      preferred_place_types: (request?.preferredPlaceTypes ?? []).slice(0, 4),
    },
    context: {
      audience: context?.audience ?? "unknown",
      time: context?.timeBucket ?? "unknown",
      weekday: Number.isFinite(Number(context?.weekday)) ? Number(context.weekday) : null,
      requires_open: Boolean(context?.requiresOpen),
      moods: Object.entries(context?.moods ?? {}).filter(([, value]) => Number(value) >= 0.65).slice(0, 3).map(([key]) => key),
    },
    taste: tasteProjection.slice(0, 6).map((row) => ({ concept: row.concept, affinity: Number(row.affinity.toFixed(2)), confidence: Number(row.confidence.toFixed(2)) })),
    candidates: candidates.map((candidate) => ({
      spot_id: candidate.spotId,
      category: candidate.category,
      name: String(candidate.name ?? "").slice(0, 60),
      description: String(candidate.description ?? "").slice(0, 80),
      moods: (candidate.moods ?? []).slice(0, 4),
      price_level: candidate.priceLevel,
      retrieval_rank: candidate.retrievalRank,
      observed_data_confidence: candidate.dataConfidence,
    })),
  };
}

export function outputSchema(candidateIds, reasonCodes = [...VALID_REASON_CODES]) {
  return {
    type: "object",
    properties: {
      ranked_candidates: {
        type: "array", minItems: candidateIds.length, maxItems: candidateIds.length,
        items: {
          type: "object",
          properties: {
            spot_id: { type: "string", enum: candidateIds },
            rank: { type: "integer", minimum: 1, maximum: candidateIds.length },
            fit: { type: "number", minimum: 0, maximum: 1 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason_codes: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: reasonCodes } },
          },
          required: ["spot_id", "rank", "fit", "confidence", "reason_codes"],
          additionalProperties: false,
        },
      },
      overall_confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["ranked_candidates", "overall_confidence"],
    additionalProperties: false,
  };
}

export function validateAiRanking(payload, candidateIds) {
  if (!payload || !Array.isArray(payload.ranked_candidates) || !Number.isFinite(payload.overall_confidence)) return { valid: false, reason: "INVALID_SCHEMA" };
  if (payload.ranked_candidates.length !== candidateIds.length) return { valid: false, reason: "INCOMPLETE_RANKING" };
  const expected = new Set(candidateIds); const ids = payload.ranked_candidates.map((row) => row.spot_id);
  if (new Set(ids).size !== ids.length) return { valid: false, reason: "DUPLICATE_CANDIDATE" };
  if (ids.some((id) => !expected.has(id))) return { valid: false, reason: "UNKNOWN_CANDIDATE" };
  const ranks = payload.ranked_candidates.map((row) => row.rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) return { valid: false, reason: "INVALID_RANK_SEQUENCE" };
  for (const row of payload.ranked_candidates) {
    if (![row.fit, row.confidence].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return { valid: false, reason: "INVALID_SCORE" };
    if (!Array.isArray(row.reason_codes) || !row.reason_codes.length || row.reason_codes.some((code) => !VALID_REASON_CODES.has(code))) return { valid: false, reason: "INVALID_REASON_CODE" };
  }
  return { valid: true, ranked: [...payload.ranked_candidates].sort((left, right) => left.rank - right.rank) };
}

export function promptInstructions() {
  return [
    "Rank only the supplied eligible Backyrd candidates for this request.",
    "Current explicit intent has priority. Context changes what matters now.",
    "Taste personalizes only within current intent and only in proportion to confidence.",
    "Do not invent, remove, or duplicate candidate IDs. Return every supplied candidate exactly once.",
    "Use only the supplied observed evidence. Uncertainty is allowed.",
  ].join(" ");
}

function responseText(response) {
  for (const output of response.output ?? []) for (const content of output.content ?? []) if (content.type === "output_text") return content.text;
  return null;
}

function actualCost(config, usage) {
  return (Number(usage?.input_tokens ?? 0) / 1_000_000) * config.pricingUsdPerMillionTokens.input
    + (Number(usage?.output_tokens ?? 0) / 1_000_000) * config.pricingUsdPerMillionTokens.output;
}

async function readCache(key) {
  try { return JSON.parse(await readFile(resolve(CACHE_DIR, `${key}.json`), "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function writeCache(key, value) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(resolve(CACHE_DIR, `${key}.json`), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export async function rerankWithAi({ config, input, candidateIds, budgetLedger, env = process.env, fetchImpl = fetch }) {
  const budgetUsd = requireBudget(env);
  if (!env.DECISION_LAB_OPENAI_API_KEY) throw new Error("DECISION_LAB_OPENAI_API_KEY_required");
  const estimatedInputTokens = estimateTokens({ instructions: promptInstructions(), input, schema: outputSchema(candidateIds) }, config.estimatedTokenSafetyMultiplier);
  if (estimatedInputTokens > config.maxInputTokensPerRequest) throw new Error(`AI_INPUT_TOKEN_CAP_EXCEEDED:${estimatedInputTokens}`);
  const cacheKey = contentHash({ model: config.model, modelConfig: config.modelConfig, promptVersion: config.promptVersion, inputContractVersion: config.inputContractVersion, outputContractVersion: config.outputContractVersion, input, candidateIds });
  const cached = await readCache(cacheKey);
  if (cached) return { ...cached, execution: "CACHE_REPLAY", costUsd: 0, cacheKey };
  const projected = (estimatedInputTokens / 1_000_000) * config.pricingUsdPerMillionTokens.input
    + (config.modelConfig.maxOutputTokens / 1_000_000) * config.pricingUsdPerMillionTokens.output;
  assertProjectedBudget({ budgetUsd, spentUsd: budgetLedger.spentUsd, projectedUsd: projected });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.modelConfig.timeoutMs);
  const startedAt = performance.now();
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.DECISION_LAB_OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: config.model,
        instructions: promptInstructions(),
        input: JSON.stringify(input),
        reasoning: { effort: config.modelConfig.reasoningEffort },
        max_output_tokens: config.modelConfig.maxOutputTokens,
        text: { format: { type: "json_schema", name: "backyrd_decision_ranking", strict: true, schema: outputSchema(candidateIds, config.reasonCodes) } },
      }),
    });
  } finally { clearTimeout(timeout); }
  const latencyMs = performance.now() - startedAt;
  if (!response.ok) throw new Error(`OPENAI_API_ERROR:${response.status}:${(await response.text()).slice(0, 160)}`);
  const raw = await response.json();
  const text = responseText(raw);
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  const validation = validateAiRanking(parsed, candidateIds);
  const costUsd = actualCost(config, raw.usage);
  budgetLedger.spentUsd += costUsd;
  if (budgetLedger.spentUsd > budgetUsd + 1e-12) throw new Error("AI_BUDGET_ACTUAL_EXCEEDED");
  const result = {
    responseIdHash: contentHash(raw.id ?? "missing"), responseModel: raw.model ?? config.model,
    ranking: validation.valid ? validation.ranked : null, overallConfidence: validation.valid ? parsed.overall_confidence : null,
    validation, usage: { inputTokens: Number(raw.usage?.input_tokens ?? 0), outputTokens: Number(raw.usage?.output_tokens ?? 0), totalTokens: Number(raw.usage?.total_tokens ?? 0) },
    costUsd, latencyMs, execution: "LIVE", cacheKey,
  };
  if (validation.valid) await writeCache(cacheKey, result);
  return result;
}

export function aiRerankerManifest(config) {
  const body = {
    version: AI_RERANKER_VERSION, model: config.model, modelConfig: config.modelConfig,
    promptVersion: config.promptVersion, inputContractVersion: config.inputContractVersion, outputContractVersion: config.outputContractVersion,
    candidateCount: config.candidateCount, reasonCodes: config.reasonCodes,
    allowedRuntimeInputs: ["structured_intent", "current_context", "current_taste_projection", "taste_confidence", "eligible_candidate_spot_intelligence", "retrieval_rank"],
    prohibitedInputs: ["latent_truth", "evaluation_utility", "golden_labels", "future_outcomes", "pii", "private_trust_evidence"],
    outputValidation: "DETERMINISTIC_FAIL_CLOSED_TO_WAVE3C_CONTROL",
    productionAccess: "NONE",
  };
  return { ...body, manifestHash: contentHash(body) };
}
