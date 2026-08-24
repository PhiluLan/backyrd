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
  candidateFunnel: Record<string, unknown>;
  openAIKey: string | null;
  learningEligible: boolean;
};

const errorCode = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 160);
const fail = (error: { message?: string } | null, label: string) => { if (error) throw new Error(`internal_live:${label}:${error.message ?? "unknown"}`); };
const reasonPriority=(reason:{type?:string;code?:string})=>{
  if(reason.type==="WHY_NOW"&&["RAIN_SUITABLE","INDOOR_MATCH","OUTDOOR_MATCH","CHILD_AGE_MATCH","FAMILY_SUITABLE","ACTIVITY_MATCH","ACCESSIBILITY_MATCH","DURATION_MATCH","QUIET_MATCH","SOCIAL_CONTEXT_MATCH","CONVERSATION_MATCH","PLANNING_MATCH","DAYPART_MATCH","PRICE_MATCH"].includes(reason.code??""))return 50;
  if(reason.type==="WHY_NOW"&&reason.code==="CURRENT_INTENT_MATCH")return 40;
  if(reason.type==="WHY_NOW"&&reason.code==="PLACE_TYPE_MATCH")return 30;
  if(reason.type==="WHY_FOR_YOU")return 20;
  if(reason.type==="UNCERTAINTY")return 10;
  return 0;
};

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
    const retrievalTrace=await input.service.rpc("backyrd_persist_decision_funnel_trace_v1",{
      p_decision_id:decisionId,p_user_id:input.userId,p_stage:"RETRIEVAL",
      p_payload:{currentIntent:input.requestContext.canonicalIntent??{},funnel:input.candidateFunnel},
    });
    fail(retrievalTrace.error,"retrieval_trace");

    const deterministic = await new SupabaseDecisionOrchestrator(input.service).run({ decisionId, authenticatedUserId: input.userId });
    const decisionTrace=await input.service.rpc("backyrd_persist_decision_funnel_trace_v1",{
      p_decision_id:decisionId,p_user_id:input.userId,p_stage:"DECISION",
      p_payload:{
        eligibilityAudit:deterministic.eligibilityAudit,
        n3:{momentHash:deterministic.inputPackage.n3.momentHash,currentRequestFacts:deterministic.inputPackage.n3.currentMoment.currentRequestFacts},
        n4:deterministic.inputPackage.candidates.map((candidate:{spotId:string;n4:Record<string,unknown>})=>({spotId:candidate.spotId,n4:candidate.n4})),
        rankingVersion:deterministic.internal.rankingVersion,rankingInputs:deterministic.internal.rankingInputs,
        deterministicOrder:deterministic.internal.finalOrder,
        authorizedReasonIds:Object.fromEntries(Object.entries(deterministic.internal.authorizedReasons).map(([spotId,reasons])=>[spotId,(reasons as Array<{id:string}>).map((reason)=>reason.id)])),
        performance:deterministic.performance,
      },
    });
    fail(decisionTrace.error,"decision_trace");
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
                const chosen: Record<string, { copy: string; priority: number }> = {};
                for (const selected of result.trace.selectedReasons ?? []) {
                  const nextPriority = reasonPriority(selected);
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
    const finalTrace=await input.service.rpc("backyrd_persist_decision_funnel_trace_v1",{
      p_decision_id:decisionId,p_user_id:input.userId,p_stage:"COMPLETE",
      p_payload:{finalSource,finalOrder,reasons,n6Disposition,n6TraceId,knowledgeMode:deterministic.response.knowledgeMode,responseHash:deterministic.response.responseHash},
    });
    fail(finalTrace.error,"final_trace");
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
      await input.service.rpc("backyrd_persist_decision_funnel_trace_v1", {
        p_decision_id: decisionId, p_user_id: input.userId, p_stage: "COMPLETE",
        p_payload: { finalSource: "LEGACY_V13_FALLBACK", finalOrder: candidateIds, n6Disposition: "FAILED", errorCode: code },
      });
    }
    return { active: true as const, decisionId, finalSource: "LEGACY_V13_FALLBACK", finalOrder: candidateIds, reasons: {}, knowledgeMode: null, userCardHash: null, packageHash: null, deterministicTraceId: null, n6TraceId: null, n6Disposition: "FAILED", errorCode: code };
  }
}
