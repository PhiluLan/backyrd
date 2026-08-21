import { SupabaseDecisionOrchestrator } from "../../../packages/decision-orchestrator-runtime/src/supabase-repository.mjs";
import { N6ShadowService } from "../../../packages/n6-shadow-runtime/src/shadow.mjs";
import { SupabaseN6ShadowRepository } from "../../../packages/n6-shadow-runtime/src/supabase-repository.mjs";

type CandidateSeed = { spotId: string; why: string | null };
type ServiceClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
type LiveInput = {
  service: ServiceClient;
  userId: string;
  city: string | null;
  moodA: string | null;
  moodB: string | null;
  requestContext: Record<string, unknown>;
  candidates: CandidateSeed[];
  openAIKey: string | null;
  learningEligible: boolean;
};

const errorCode = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 160);
const fail = (error: { message?: string } | null, label: string) => { if (error) throw new Error(`internal_live:${label}:${error.message ?? "unknown"}`); };

export async function isInternalLiveUser(service: ServiceClient, userId: string, capability = "DECISION") {
  const { data, error } = await service.rpc("backyrd_internal_live_user_enabled_v1", { p_user_id: userId, p_capability: capability });
  if (error && /schema cache|does not exist/i.test(error.message ?? "")) return false;
  fail(error, "allowlist");
  return data === true;
}

export async function runInternalLiveDecision(input: LiveInput) {
  if (!(await isInternalLiveUser(input.service, input.userId, "DECISION"))) return { active: false as const };
  const candidateIds = input.candidates.map((row) => row.spotId);
  let decisionId: string | null = null;
  try {
    const prepared = await input.service.rpc("backyrd_prepare_internal_live_decision_v1", {
      p_user_id: input.userId,
      p_city: input.city,
      p_mood_a_text: input.moodA,
      p_mood_b_text: input.moodB,
      p_request_context: input.requestContext,
      p_candidate_ids: candidateIds,
      p_why_this: input.candidates.map((row) => row.why),
      p_learning_eligible: input.learningEligible,
    });
    fail(prepared.error, "prepare");
    decisionId = String(prepared.data);

    const deterministic = await new SupabaseDecisionOrchestrator(input.service).run({ decisionId, authenticatedUserId: input.userId });
    let finalSource = "DETERMINISTIC_NORTH_STAR";
    let finalOrder = deterministic.response.spots.map((row: { spotId: string }) => row.spotId);
    let reasons = Object.fromEntries(deterministic.response.spots.map((row: { spotId: string; explanation: string }) => [row.spotId, row.explanation]));
    let n6TraceId: string | null = null;
    let n6Disposition = "NOT_RUN";

    if (input.openAIKey && await isInternalLiveUser(input.service, input.userId, "N6")) {
      try {
        const repository = new SupabaseN6ShadowRepository(input.service);
        const shadow = new N6ShadowService({ repository, apiKey: input.openAIKey, fetchImpl: globalThis.fetch });
        const queued = await shadow.enqueueSecuredDecision({ decisionPackage: deterministic.inputPackage, deterministicDecision: deterministic, authenticatedUserId: input.userId });
        if (queued.status === "PENDING" || queued.status === "RETRYABLE_FAILED") {
          const claim = await repository.claimDecision(decisionId);
          if (claim) {
            const result = await shadow.processClaimed(claim);
            n6Disposition = result.status;
            n6TraceId = result.traceId ?? null;
            if (result.status === "VALIDATED" && result.trace?.validatorDisposition === "VALIDATED") {
              if (await isInternalLiveUser(input.service, input.userId, "N6")) {
                finalSource = "N6_VALIDATED";
                finalOrder = result.trace.n6Order;
                const priority: Record<string, number> = { WHY_FOR_YOU: 3, WHY_NOW: 2, UNCERTAINTY: 1 };
                const chosen: Record<string, { copy: string; priority: number }> = {};
                for (const selected of result.trace.selectedReasons ?? []) {
                  const nextPriority = priority[selected.type] ?? 0;
                  if (selected.copy && nextPriority > (chosen[selected.spotId]?.priority ?? -1)) chosen[selected.spotId] = { copy: selected.copy, priority: nextPriority };
                }
                for (const [spotId, selected] of Object.entries(chosen)) reasons[spotId] = selected.copy;
              }
            }
          } else n6Disposition = "CONCURRENCY_FALLBACK";
        } else n6Disposition = queued.status ?? queued.skip_reason ?? "SKIPPED";
      } catch (error) {
        // The secured deterministic result is the authoritative fallback. N6
        // transport, input-shape, budget and validator failures never unwind it.
        n6Disposition = `FAILED:${errorCode(error)}`;
      }
    }

    if (!(await isInternalLiveUser(input.service, input.userId, "DECISION"))) {
      finalSource = "LEGACY_V13_FALLBACK";
      finalOrder = candidateIds;
      reasons = {};
    }
    const finalized = await input.service.rpc("backyrd_finalize_internal_live_decision_v1", {
      p_decision_id: decisionId,
      p_user_id: input.userId,
      p_status: "COMPLETE",
      p_deterministic_trace_id: deterministic.traceId,
      p_n6_trace_id: n6TraceId,
      p_n6_disposition: n6Disposition,
      p_final_source: finalSource,
      p_final_order: finalOrder,
      p_knowledge_mode: deterministic.response.knowledgeMode,
      p_user_card_hash: deterministic.inputPackage.n5.userCardHash,
      p_package_hash: deterministic.inputPackage.packageHash,
      p_response_hash: deterministic.response.responseHash,
      p_error_code: null,
    });
    fail(finalized.error, "finalize");
    return {
      active: true as const, decisionId, finalSource, finalOrder, reasons,
      knowledgeMode: deterministic.response.knowledgeMode,
      userCardHash: deterministic.inputPackage.n5.userCardHash,
      packageHash: deterministic.inputPackage.packageHash,
      deterministicTraceId: deterministic.traceId,
      n6TraceId, n6Disposition,
    };
  } catch (error) {
    const code = errorCode(error);
    if (decisionId) {
      await input.service.rpc("backyrd_finalize_internal_live_decision_v1", {
        p_decision_id: decisionId, p_user_id: input.userId, p_status: "FALLBACK",
        p_deterministic_trace_id: null, p_n6_trace_id: null, p_n6_disposition: "FAILED",
        p_final_source: "LEGACY_V13_FALLBACK", p_final_order: candidateIds,
        p_knowledge_mode: null, p_user_card_hash: null, p_package_hash: null,
        p_response_hash: null, p_error_code: code,
      });
    }
    return { active: true as const, decisionId, finalSource: "LEGACY_V13_FALLBACK", finalOrder: candidateIds, reasons: {}, knowledgeMode: null, userCardHash: null, packageHash: null, deterministicTraceId: null, n6TraceId: null, n6Disposition: "FAILED", errorCode: code };
  }
}
