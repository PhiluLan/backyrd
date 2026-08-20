import { canonicalizeProviderResponse } from "../../../decision-lab/src/n6a7-provider-response.mjs";
import { n6A2Instructions, n6A2OutputSchema } from "../../../decision-lab/src/n6a2-reason-authorization.mjs";
import { FROZEN_N6_CONFIG, estimateCostUsd, estimateTokens } from "./config.mjs";
import { validateProductionN6Output } from "./validator.mjs";

const textOf = (canonical) => canonical.output.text;
const retryableStatus = (status) => status === 408 || status === 409 || status === 429 || status >= 500;

export class N6ProviderError extends Error {
  constructor(code, { retryable = false, cause } = {}) { super(code, { cause }); this.code = code; this.retryable = retryable; }
}

export function buildProviderRequest(input) {
  const candidateIds = input.n6a2Input.n6a1Input.baseInput.candidates.map(({ spotId }) => spotId);
  const schema = n6A2OutputSchema(candidateIds);
  const instructions = n6A2Instructions();
  const estimatedInputTokens = estimateTokens({ instructions, input: input.n6a2Input, schema });
  if (estimatedInputTokens > FROZEN_N6_CONFIG.maxInputTokens) throw new N6ProviderError("N6_INPUT_TOKEN_CAP_EXCEEDED");
  return {
    estimatedInputTokens,
    worstCaseCostUsd: estimateCostUsd(estimatedInputTokens),
    body: { model: FROZEN_N6_CONFIG.model, instructions, input: JSON.stringify(input.n6a2Input), reasoning: { effort: FROZEN_N6_CONFIG.reasoningEffort }, max_output_tokens: FROZEN_N6_CONFIG.maxOutputTokens, text: { format: { type: "json_schema", name: "backyrd_n6a2_buddy", strict: true, schema } } }
  };
}

export async function callN6Provider(input, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = FROZEN_N6_CONFIG.timeoutMs } = {}) {
  if (!apiKey) throw new N6ProviderError("N6_PROVIDER_KEY_REQUIRED");
  const request = buildProviderRequest(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(request.body) });
  } catch (error) {
    if (error?.name === "AbortError") throw new N6ProviderError("N6_PROVIDER_TIMEOUT", { retryable: true, cause: error });
    throw new N6ProviderError("N6_PROVIDER_NETWORK_FAILURE", { retryable: true, cause: error });
  } finally { clearTimeout(timer); }
  if (!response.ok) throw new N6ProviderError(`N6_PROVIDER_HTTP_${response.status}`, { retryable: retryableStatus(response.status) });
  let raw;
  try { raw = await response.json(); } catch (error) { throw new N6ProviderError("N6_PROVIDER_MALFORMED_JSON", { cause: error }); }
  const canonicalProviderResponse = canonicalizeProviderResponse(raw);
  let payload = null;
  try { payload = JSON.parse(textOf(canonicalProviderResponse)); } catch { /* strict validator rejects */ }
  const validation = validateProductionN6Output(payload, input);
  const inputTokens = Number(canonicalProviderResponse.usage.input_tokens ?? 0);
  const outputTokens = Number(canonicalProviderResponse.usage.output_tokens ?? 0);
  return {
    payload, validation, canonicalProviderResponse,
    usage: { inputTokens, outputTokens, totalTokens: Number(canonicalProviderResponse.usage.total_tokens ?? inputTokens + outputTokens) },
    costUsd: estimateCostUsd(inputTokens, outputTokens), latencyMs: Number((performance.now() - started).toFixed(3)),
    model: canonicalProviderResponse.response.model
  };
}

export async function callN6ProviderWithRetry(input, options = {}) {
  const maxRetries = options.maxRetries ?? FROZEN_N6_CONFIG.maxTechnicalRetries;
  let retryCount = 0;
  for (;;) {
    try { return { ...(await callN6Provider(input, options)), retryCount }; }
    catch (error) {
      if (!(error instanceof N6ProviderError) || !error.retryable || retryCount >= maxRetries) throw Object.assign(error, { retryCount });
      retryCount += 1;
    }
  }
}
