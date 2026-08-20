import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { buildProductionN6ShadowInput } from "./input.mjs";
import { buildProviderRequest, callN6ProviderWithRetry } from "./provider.mjs";
import { FROZEN_N6_CONFIG, N6_SHADOW_VERSIONS } from "./config.mjs";

export function compareDecisions(input, validation) {
  const deterministic = input.deterministicOrder;
  const n6 = validation.valid ? validation.ranked.map((row) => row.spot_id) : [];
  return {
    version: N6_SHADOW_VERSIONS.comparison,
    deterministicOrder: deterministic, n6Order: n6,
    sameTop1: validation.valid ? deterministic[0] === n6[0] : null,
    top3OrderChanged: validation.valid ? JSON.stringify(deterministic.slice(0, 3)) !== JSON.stringify(n6.slice(0, 3)) : null,
    rankDisplacement: validation.valid ? Object.fromEntries(deterministic.map((spotId, index) => [spotId, Math.abs(index - n6.indexOf(spotId))])) : {},
    candidateIdentityIntegrity: validation.valid ? new Set(n6).size === input.n6a2Input.n6a1Input.baseInput.candidates.length : false,
    knowledgeMode: input.knowledgeMode
  };
}

export class N6ShadowService {
  constructor({ repository, apiKey, fetchImpl, config = {} }) {
    this.repository = repository; this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.config = { ...config, maxRetries: 0 };
  }

  async enqueueSecuredDecision({ decisionPackage, deterministicDecision, authenticatedUserId }) {
    if (decisionPackage.userId !== authenticatedUserId || deterministicDecision.internal.userId !== authenticatedUserId) throw new Error("n6_shadow_cross_user");
    const input = buildProductionN6ShadowInput({ decisionPackage, deterministicDecision });
    const forecast = buildProviderRequest(input);
    return this.repository.enqueue({ input, estimatedInputTokens: forecast.estimatedInputTokens, worstCaseCostUsd: forecast.worstCaseCostUsd });
  }

  async processClaimed(work) {
    const startedAt = new Date().toISOString();
    try {
      const input = await this.repository.loadInput(work);
      // Production retry is queue-level so every external attempt is counted,
      // budgeted, and traced. The provider helper's retry remains available to
      // the frozen Lab harness, but is deliberately disabled here.
      const result = await callN6ProviderWithRetry(input, { apiKey: this.apiKey, fetchImpl: this.fetchImpl, maxRetries: 0 });
      const comparison = compareDecisions(input, result.validation);
      const validatedOutput = result.validation.valid ? {
        decisionId: input.decisionId,
        rankedCandidates: result.validation.ranked,
        selectedReasons: result.validation.selectedReasons,
        confidence: result.payload.decision_confidence,
        uncertainty: result.payload.ranked_candidates.flatMap((row) => row.uncertainty),
        knowledgeMode: input.knowledgeMode,
        disposition: "VALIDATED"
      } : null;
      const trace = {
        version: N6_SHADOW_VERSIONS.trace, shadowRunId: work.shadowRunId, workId: work.workId,
        decisionId: input.decisionId, userId: input.userId, inputHash: input.inputHash, packageHash: input.packageHash,
        candidateSetHash: input.candidateSetHash, momentHash: input.momentHash, projectionHash: input.projectionHash, n4Hashes: input.n4Hashes,
        model: result.model, promptVersion: N6_SHADOW_VERSIONS.prompt, providerRequestVersion: N6_SHADOW_VERSIONS.providerRequest, providerResponseVersion: N6_SHADOW_VERSIONS.providerResponse,
        startedAt, completedAt: new Date().toISOString(), latencyMs: result.latencyMs,
        usage: result.usage, costUsd: result.costUsd, retryCount: Math.max(0, Number(work.attempt ?? 1) - 1),
        validatorDisposition: result.validation.valid ? "VALIDATED" : "REJECTED", validationReason: result.validation.valid ? null : result.validation.reason,
        n6Order: result.validation.valid ? result.validation.ranked.map((row) => row.spot_id) : [],
        selectedReasons: result.validation.valid ? result.validation.selectedReasons : [],
        confidence: result.validation.valid ? result.payload.decision_confidence : null,
        uncertainty: result.validation.valid ? result.payload.ranked_candidates.flatMap((row) => row.uncertainty) : [],
        validatedOutput,
        canonicalOutputHash: contentHash(validatedOutput ?? result.payload),
        canonicalProviderResponse: result.canonicalProviderResponse, comparison,
        boundaries: { visibleDecisionChanged: false, n2LearningCreated: false }
      };
      return this.repository.finalize(work, trace);
    } catch (error) {
      try { return await this.repository.fail(work, { code: error.code ?? error.message, retryable: error.retryable === true, retryCount: error.retryCount ?? 0, startedAt, providerDiagnostic: error.diagnostic ?? null }); }
      catch (reconcileError) {
        if (/claim_invalid|consent|user_deleted|not found/i.test(`${error.message}:${reconcileError.message}`)) return { status: "SHADOW_ABORTED_LIFECYCLE_CHANGED", failureCode: error.code ?? error.message };
        throw reconcileError;
      }
    }
  }

  async runNext() {
    const work = await this.repository.claim();
    if (!work) return { status: "IDLE" };
    return this.processClaimed(work);
  }
}

// The caller supplies its platform's durable background primitive (for
// example waitUntil). The deterministic response is complete before the
// provider promise is scheduled and is never replaced by its disposition.
export async function runDeterministicWithN6Shadow({ orchestrator, shadowService, request, scheduleBackground }) {
  if (typeof scheduleBackground !== "function") throw new Error("n6_shadow_background_scheduler_required");
  const deterministic = await orchestrator.run(request);
  const task = shadowService.enqueueSecuredDecision({
    decisionPackage: deterministic.inputPackage,
    deterministicDecision: deterministic,
    authenticatedUserId: request.authenticatedUserId
  }).catch(() => ({ status: "SHADOW_ENQUEUE_FAILED" }));
  scheduleBackground(task);
  return deterministic;
}

export const DEFAULT_N6_SHADOW_LIMITS = Object.freeze({
  enabled: false, internalOnly: true, sampleRate: 0, perUserDailyCallCap: 2, globalDailyCallCap: 8,
  globalDailyBudgetUsd: 2, maxConcurrentCalls: 1, maxRetries: FROZEN_N6_CONFIG.maxTechnicalRetries
});
