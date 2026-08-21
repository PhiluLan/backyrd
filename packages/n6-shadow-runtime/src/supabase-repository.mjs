const fail = (error, label) => { if (error) throw new Error(`n6_shadow_repository:${label}:${error.message}`); };

export class SupabaseN6ShadowRepository {
  constructor(client, { runnerId = crypto.randomUUID() } = {}) { this.client = client; this.runnerId = runnerId; }

  async enqueue({ input, estimatedInputTokens, worstCaseCostUsd }) {
    const { data, error } = await this.client.rpc("backyrd_enqueue_n6_shadow_v1", {
      p_decision_id: input.decisionId, p_user_id: input.userId, p_input_hash: input.inputHash,
      p_input: input, p_estimated_input_tokens: estimatedInputTokens, p_worst_case_cost_usd: worstCaseCostUsd
    });
    fail(error, "enqueue"); return data;
  }

  async claim() {
    const { data, error } = await this.client.rpc("backyrd_claim_n6_shadow_v1", { p_runner_id: this.runnerId });
    fail(error, "claim");
    if (!data) return null;
    return { workId: data.work_id, shadowRunId: data.shadow_run_id, userId: data.user_id, decisionId: data.decision_id, attempt: data.attempt, runnerId: this.runnerId };
  }

  async claimDecision(decisionId) {
    const { data, error } = await this.client.rpc("backyrd_claim_n6_shadow_for_decision_v1", { p_runner_id: this.runnerId, p_decision_id: decisionId });
    fail(error, "claim_decision");
    if (!data) return null;
    return { workId: data.work_id, shadowRunId: data.shadow_run_id, userId: data.user_id, decisionId: data.decision_id, attempt: data.attempt, runnerId: this.runnerId };
  }

  async loadInput(work) {
    const { data, error } = await this.client.rpc("backyrd_load_n6_shadow_input_v1", { p_work_id: work.workId, p_shadow_run_id: work.shadowRunId, p_runner_id: this.runnerId });
    fail(error, "load_input"); return data;
  }

  async finalize(work, trace) {
    const status = trace.validatorDisposition === "VALIDATED" ? "VALIDATED" : "REJECTED";
    const { data, error } = await this.client.rpc("backyrd_finalize_n6_shadow_v1", {
      p_work_id: work.workId, p_shadow_run_id: work.shadowRunId, p_runner_id: this.runnerId,
      p_status: status, p_trace: trace, p_output_hash: trace.canonicalOutputHash
    });
    fail(error, "finalize"); return { status, traceId: data, trace };
  }

  async fail(work, failure) {
    const { data, error } = await this.client.rpc("backyrd_fail_n6_shadow_v1", {
      p_work_id: work.workId, p_shadow_run_id: work.shadowRunId, p_runner_id: this.runnerId,
      p_retryable: failure.retryable, p_failure_code: failure.code,
      p_failure_trace: { version: "backyrd-production-n6-shadow-trace-v1", shadowRunId: work.shadowRunId, workId: work.workId, decisionId: work.decisionId, userId: work.userId, startedAt: failure.startedAt, completedAt: new Date().toISOString(), retryCount: failure.retryCount, validatorDisposition: "FAILED", failureCode: failure.code, providerDiagnostic: failure.providerDiagnostic ?? null, boundaries: { visibleDecisionChanged: false, n2LearningCreated: false } }
    });
    fail(error, "fail"); return data;
  }
}
