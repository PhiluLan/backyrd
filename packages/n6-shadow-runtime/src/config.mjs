export const N6_SHADOW_VERSIONS = Object.freeze({
  service: "backyrd-production-n6-shadow-service-v1",
  input: "backyrd-production-n6-shadow-input-v1",
  validator: "backyrd-production-n6-shadow-validator-v1",
  comparison: "backyrd-production-n6-shadow-comparison-v1",
  trace: "backyrd-production-n6-shadow-trace-v1",
  prompt: "backyrd-n6a2-ai-decision-buddy-instruction-v1",
  providerRequest: "backyrd-production-n6-shadow-provider-request-v1.1",
  providerResponse: "backyrd-n6a7-canonical-provider-response-v1"
});

// Frozen N6A/N6A.1/N6A.2 production configuration. Changing these values is
// an engine-contract change, not an operational tuning knob.
export const FROZEN_N6_CONFIG = Object.freeze({
  model: "gpt-5.6-sol",
  reasoningEffort: "medium",
  maxInputTokens: 12_000,
  maxOutputTokens: 2_400,
  timeoutMs: 120_000,
  maxTechnicalRetries: 1,
  candidateLimit: 10,
  tokenEstimateSafetyMultiplier: 1.2,
  accountingCeilingUsdPerMillionTokens: Object.freeze({ input: 10, output: 60 })
});

export function estimateTokens(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  return Math.ceil(bytes / 4 * FROZEN_N6_CONFIG.tokenEstimateSafetyMultiplier);
}

export function estimateCostUsd(inputTokens, outputTokens = FROZEN_N6_CONFIG.maxOutputTokens) {
  const rates = FROZEN_N6_CONFIG.accountingCeilingUsdPerMillionTokens;
  return inputTokens / 1_000_000 * rates.input + outputTokens / 1_000_000 * rates.output;
}
