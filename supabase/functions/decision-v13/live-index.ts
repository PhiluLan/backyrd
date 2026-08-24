// Production-only internal-live wrapper. The frozen canonical v13 source is
// imported unchanged; this layer may only route its already-valid candidates.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isInternalLiveUser, runInternalLiveDecision } from "./north-star-live.ts";
import { jsonResponseWithFreshEntityHeaders } from "./live-response.mjs";
import { buildLiveCandidateFunnel, LIVE_RETRIEVAL_SOURCE_LIMIT, sanitizeLiveProductCandidate, sanitizeLiveProductRequestBody } from "../../../packages/decision-input-runtime/src/live-product-boundary.mjs";
import { assertUnseenContinuation } from "../../../packages/decision-input-runtime/src/continuation.mjs";

type Handler = (request: Request) => Promise<Response> | Response;
let canonicalHandler: Handler | null = null;
const denoMutable = Deno as unknown as { serve: (handler: Handler) => unknown };
const realServe = denoMutable.serve.bind(Deno);
denoMutable.serve = (handler: Handler) => { canonicalHandler = handler; return undefined; };
await import("./index.ts");
denoMutable.serve = realServe;
if (!canonicalHandler) throw new Error("canonical_v13_handler_missing");

const bearer = (request: Request) => (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const text = (value: unknown) => { const result = String(value ?? "").trim(); return result || null; };
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(payload:Record<string,unknown>,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","cache-control":"no-store"},
});

realServe(async (request: Request) => {
  const body = request.method === "POST" ? await request.clone().json().catch(() => ({})) : {};
  let service: ReturnType<typeof createClient> | null = null;
  let userId: string | null = null;
  let internalInvocation = false;
  let liveEnabled = false;
  let internalWrapperSecret: string | null = null;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey && request.method === "POST") {
      const configuredSecret = Deno.env.get("DECISION_ENGINE_INTERNAL_SECRET");
      internalWrapperSecret = configuredSecret ?? null;
      internalInvocation = Boolean(configuredSecret && request.headers.get("x-backyrd-internal-secret") === configuredSecret);
      service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      if (internalInvocation) userId = text(request.headers.get("x-backyrd-test-user-id"));
      else {
        const token = bearer(request);
        if (token) {
          const { data: verified, error } = await service.auth.getUser(token);
          if (!error && verified.user) userId = verified.user.id;
        }
      }
      if (userId) liveEnabled = await isInternalLiveUser(service, userId, "DECISION");
    }
  } catch {
    service = null;
    userId = null;
    liveEnabled = false;
  }

  const continuationDecisionId=text(body.continuationDecisionId);
  if(request.method==="POST"&&continuationDecisionId){
    const requestId=text(body.continuationRequestId);
    if(!service||!userId)return json({ok:false,error:"decision_continuation_not_authenticated"},401);
    if(!liveEnabled)return json({ok:false,error:"decision_continuation_not_available"},403);
    if(!uuidPattern.test(continuationDecisionId)||!requestId||!uuidPattern.test(requestId))return json({ok:false,error:"decision_continuation_request_invalid"},400);
    const continued=await service.rpc("backyrd_next_decision_continuation_v1",{
      p_decision_id:continuationDecisionId,p_user_id:userId,p_request_id:requestId,p_page_size:3,
    });
    if(continued.error)return json({ok:false,error:"decision_continuation_failed"},continued.error.message?.includes("cross_user")?403:409);
    const page=continued.data as Record<string,unknown>;
    const previous=Array.isArray(page.previouslyShownSpotIds)?page.previouslyShownSpotIds.map(String):[];
    const returned=Array.isArray(page.returnedSpotIds)?page.returnedSpotIds.map(String):[];
    assertUnseenContinuation({previouslyShownSpotIds:previous,returnedSpotIds:returned,pageSize:3});
    return json({
      ok:true,model:"backyrd_decision_v13_orchestrator",version:"0.2.0",candidates:Array.isArray(page.candidates)?page.candidates:[],
      continuation:{decision_id:continuationDecisionId,page:page.page,request_id:requestId,exhausted:page.exhausted===true,remaining_count:page.remainingCount??0},
      north_star:{active:true,decision_id:continuationDecisionId,final_source:page.finalSource??null,n6_disposition:page.n6Disposition??null},
    });
  }

  const canonicalHeaders = new Headers(request.headers);
  canonicalHeaders.delete("content-length");
  if(liveEnabled&&internalWrapperSecret)canonicalHeaders.set("x-backyrd-internal-wrapper",internalWrapperSecret);
  const requestedSemanticLimit=Number(body.semanticLimit);
  const canonicalRequest = liveEnabled
    ? new Request(request.url, { method: request.method, headers: canonicalHeaders, body: JSON.stringify({
        ...sanitizeLiveProductRequestBody(body),
        limit:LIVE_RETRIEVAL_SOURCE_LIMIT,
        semanticLimit:Number.isFinite(requestedSemanticLimit)
          ? Math.max(LIVE_RETRIEVAL_SOURCE_LIMIT,requestedSemanticLimit)
          : LIVE_RETRIEVAL_SOURCE_LIMIT,
      }) })
    : request;
  const baseResponse = await canonicalHandler!(canonicalRequest);
  if (!baseResponse.ok || request.method !== "POST") return baseResponse;
  const payload = await baseResponse.clone().json().catch(() => null) as Record<string, unknown> | null;
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates as Array<Record<string, unknown>> : [];
  if (!payload?.ok || candidates.length === 0) return baseResponse;

  try {
    if (!liveEnabled || !service || !userId || (!internalInvocation && text(payload.user_id) !== userId)) return baseResponse;

    const canonicalIntent=(payload.canonical_intent??{}) as Record<string, unknown>;
    const funnel=buildLiveCandidateFunnel(candidates,{city:text(body.city),canonicalIntent});
    const selected = funnel.selected;
    const { selected: _selectedCandidates, ...candidateFunnelTrace } = funnel;
    if(selected.length===0)return baseResponse;
    const live = await runInternalLiveDecision({
      service,
      userId,
      city: text(body.city),
      moodA: text(body.moodA),
      moodB: text(body.moodB),
      requestContext: {
        inputMode: text(body.inputMode),
        rawFreeText: text(body.rawFreeText) ?? text(body.query),
        city: text(body.city),
        audience: Array.isArray(body.audience) ? body.audience : [],
        selectedAudiences: Array.isArray(body.audience) ? body.audience : [],
        selectedMoods: [text(body.moodA), text(body.moodB)].filter(Boolean),
        preferredPlaceTypes: body.preferredPlaceTypes ?? body.placeTypes ?? body.categories ?? [],
        excludedPlaceTypes: body.excludedPlaceTypes ?? body.avoidPlaceTypes ?? [],
        strictCategoryIntent: body.strictCategoryIntent === true,
        openNow: (payload.intent as Record<string, unknown> | undefined)?.openNow === true,
        explicitConstraints: { openNow: (payload.intent as Record<string, unknown> | undefined)?.openNow === true },
        intent: payload.intent ?? {},
        canonicalIntent,
      },
      candidates: selected.map((candidate) => ({ spotId: String(candidate.spot_id), why: text(candidate.human_reason) })),
      candidateFunnel:{...candidateFunnelTrace,sourceRetrieval:payload._internal_retrieval_trace??null},
      openAIKey: Deno.env.get("OPENAI_API_KEY") ?? null,
      learningEligible: !internalInvocation,
    });
    if (!live.active) return baseResponse;
    const byId = new Map(selected.map((candidate) => [String(candidate.spot_id), candidate]));
    const orderedAll = live.continuationOrder.map((spotId, index) => {
      const candidate = byId.get(spotId);
      return candidate ? { ...sanitizeLiveProductCandidate(candidate, live.reasons[spotId]), rank: index + 1 } : null;
    }).filter(Boolean);
    if(orderedAll.length!==live.continuationOrder.length)throw new Error("decision_continuation_candidate_payload_incomplete");
    const ordered=orderedAll.slice(0,3);
    assertUnseenContinuation({previouslyShownSpotIds:[],returnedSpotIds:ordered.map((candidate)=>String(candidate?.spot_id)),pageSize:3});
    const initialized=await service.rpc("backyrd_initialize_decision_continuation_v1",{
      p_decision_id:live.decisionId,p_user_id:userId,p_candidate_order:live.continuationOrder,
      p_candidate_payload:Object.fromEntries(orderedAll.map((candidate)=>[String(candidate?.spot_id),candidate])),
      p_initial_spot_ids:ordered.map((candidate)=>String(candidate?.spot_id)),p_final_source:live.finalSource,p_n6_disposition:live.n6Disposition,
    });
    if(initialized.error)throw new Error(`decision_continuation_initialize:${initialized.error.message??"unknown"}`);
    const initialPage=initialized.data as Record<string,unknown>;
    const safeRequest = sanitizeLiveProductRequestBody(body);
    const { _internal_retrieval_trace: _internalRetrievalTrace, ...safePayload } = payload;
    return jsonResponseWithFreshEntityHeaders({
      ...safePayload,
      query: safeRequest.query,
      queryText: safeRequest.query,
      candidates: ordered,
      north_star: {
        active: true, decision_id: live.decisionId, final_source: live.finalSource,
        knowledge_mode: live.knowledgeMode, user_card_hash: live.userCardHash,
        package_hash: live.packageHash, deterministic_trace_id: live.deterministicTraceId,
        n6_trace_id: live.n6TraceId, n6_disposition: live.n6Disposition,
        fallback_error: live.errorCode ?? null,
      },
      continuation:{decision_id:live.decisionId,page:1,request_id:null,exhausted:initialPage.exhausted===true,remaining_count:initialPage.remainingCount??0},
    }, baseResponse);
  } catch {
    return baseResponse;
  }
});
