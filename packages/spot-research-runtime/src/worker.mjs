import { createBackgroundResearchResponse, retrieveBackgroundResearchResponse, validateResearchProposals } from "./index.mjs";

const pendingStatuses = new Set(["queued", "in_progress"]);
const retryableCodes = [/research_provider_timeout/, /research_provider_transport_error/, /research_provider_http_429/, /research_provider_http_5\d\d/];
const safeCode = (error) => String(error instanceof Error ? error.message : error).replace(/[^a-zA-Z0-9_:\-]/g, "_").slice(0, 160);
export const isRetryableResearchFailure = (code) => retryableCodes.some((pattern) => pattern.test(code));

export async function processOneResearchJob({ repository, apiKey, runnerId, provider = {}, pollDelaySeconds = 4 }) {
  const claim = await repository.claim(runnerId);
  if (!claim) return { state: "IDLE" };
  const identity = { jobId: claim.jobId, leaseToken: claim.leaseToken };
  try {
    const context = await repository.loadContext(claim);
    let response;
    if (claim.providerResponseId) {
      response = await (provider.retrieve ?? retrieveBackgroundResearchResponse)(claim.providerResponseId, { apiKey });
    } else {
      const attempt = await repository.beginAttempt(identity);
      response = await (provider.create ?? createBackgroundResearchResponse)(context, { apiKey, model: claim.model, idempotencyKey: attempt.attemptToken });
      if (!response.providerResponseId) throw new Error("research_provider_response_id_missing");
      await repository.recordProvider(identity, response.providerResponseId, response.providerStatus);
    }
    if (pendingStatuses.has(response.providerStatus)) {
      await repository.release(identity, response.providerStatus, pollDelaySeconds);
      return { state: "RUNNING", jobId: claim.jobId, providerStatus: response.providerStatus };
    }
    if (response.providerStatus !== "completed") throw new Error(`research_provider_${response.providerStatus || "unknown"}`);
    const validation = validateResearchProposals(response.payload, context);
    if (!validation.valid) throw new Error(validation.reason);
    const result = await repository.finalize(identity, validation.proposals, {
      providerResponseId: response.providerResponseId,
      providerStatus: response.providerStatus,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      webSearchCalls: response.webSearchCalls,
      latencyMs: response.transportLatencyMs
    });
    return { ...result, jobId: claim.jobId };
  } catch (error) {
    const code = safeCode(error);
    const failed = await repository.fail(identity, isRetryableResearchFailure(code), code);
    return { state: failed?.state ?? "FAILED", jobId: claim.jobId, failureCode: code, retry: Boolean(failed?.retry) };
  }
}

