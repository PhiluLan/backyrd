// Production-only internal-live wrapper. The frozen canonical v13 source is
// imported unchanged; this layer may only route its already-valid candidates.
import { createClient } from "npm:@supabase/supabase-js@2";
import { interpretCanonicalCurrentIntent } from "../../../packages/canonical-semantics/src/index.mjs";
import { isInternalLiveUser, runInternalLiveDecision } from "./north-star-live.ts";
import { jsonResponseWithFreshEntityHeaders } from "./live-response.mjs";
import { alignLiveProductCurrentIntent, buildLiveCandidateFunnel, LIVE_RETRIEVAL_SOURCE_LIMIT, sanitizeLiveProductCandidate, sanitizeLiveProductRequestBody } from "../../../packages/decision-input-runtime/src/live-product-boundary.mjs";
import { bindResolvedLocationIntent, configuredNearDistanceKm, resolveLocationReference, verifiedLocationEvidence } from "../../../packages/decision-input-runtime/src/location-reference.mjs";
import { assertUnseenContinuation } from "../../../packages/decision-input-runtime/src/continuation.mjs";
import { consumeLaunchCostBoundary } from "../_shared/launch-cost-boundary.ts";

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
const honestEmpty=(payload:Record<string,unknown>,baseResponse:Response,decisionId:string|null=null)=>jsonResponseWithFreshEntityHeaders({
  ...payload,
  candidates:[],
  match_disposition:"INSUFFICIENT_VERIFIED_EVIDENCE",
  match_message:"Für diese konkrete Kombination gibt es aktuell keinen ausreichend belegten Treffer. Bitte passe oder lockere eine Anforderung.",
  north_star:{active:true,decision_id:decisionId,final_source:"DETERMINISTIC_EMPTY",n6_disposition:"NOT_RUN",personalization_active:false,fallback_error:null},
  continuation:null,
},baseResponse);

realServe(async (request: Request) => {
  const body = request.method === "POST" ? await request.clone().json().catch(() => ({})) : {};
  const presentedBearer=bearer(request);
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
        const token = presentedBearer;
        if (token) {
          const { data: verified, error } = await service.auth.getUser(token);
          if(error||!verified.user)return json({ok:false,error:"decision_authentication_failed"},401);
          userId=verified.user.id;
        }
      }
      if (userId) liveEnabled = await isInternalLiveUser(service, userId, "DECISION");
    }
  } catch {
    if(userId||presentedBearer)return json({ok:false,error:"canonical_product_eligibility_unavailable"},503);
    service=null;
    liveEnabled=false;
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

  if (request.method === "POST") {
    if (!service || !userId) return json({ ok: false, error: "decision_cost_boundary_unavailable" }, 503);
    const boundary = await consumeLaunchCostBoundary(service, {
      operation: "decision_v13",
      subjectKey: userId,
      subjectMinute: 100,
      subjectDay: 100,
      globalMinute: 300,
      globalDay: 2000,
    });
    if (!boundary.allowed) {
      return json(
        { ok: false, error: boundary.reason === "LIMITED" ? "decision_rate_limited" : "decision_cost_boundary_unavailable" },
        boundary.reason === "LIMITED" ? 429 : 503,
      );
    }
  }

  const canonicalHeaders = new Headers(request.headers);
  canonicalHeaders.delete("content-length");
  // The outer Product boundary has already authenticated the bearer and bound
  // userId to that verified token. Withholding it from the frozen retrieval
  // handler disables only its historical personalized-v12 source; all later
  // writes remain bound to the outer verified userId.
  if(liveEnabled)canonicalHeaders.delete("authorization");
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
  if (!payload?.ok) return baseResponse;
  if(candidates.length===0){
    if(!liveEnabled)return baseResponse;
    return honestEmpty(payload,baseResponse);
  }

  try {
    const retrievalPayloadUserId=text(payload.user_id);
    if(
      !liveEnabled||!service||!userId||
      (!internalInvocation&&retrievalPayloadUserId!==null&&retrievalPayloadUserId!==userId)
    )return baseResponse;

    const productQuery=text(body.rawFreeText)??text(body.query)??[text(body.moodA),text(body.moodB)].filter(Boolean).join(" ");
    let canonicalIntent=alignLiveProductCurrentIntent(interpretCanonicalCurrentIntent({
      query:productQuery,
      preferredPlaceTypes:body.preferredPlaceTypes??body.placeTypes??body.categories??[],
      excludedPlaceTypes:body.excludedPlaceTypes??body.avoidPlaceTypes??[],
      audience:Array.isArray(body.audience)?body.audience:[],
      strictCategoryIntent:body.strictCategoryIntent===true,
      openNow:body.openNow===true,
    }),productQuery) as Record<string, unknown>;
    const initialHard=canonicalIntent.hardConstraints as Record<string,unknown> | undefined;
    const locationReference=initialHard?.locationReference as Record<string,unknown> | null | undefined;
    if(locationReference){
      let runtimeLocationConfig:Record<string,unknown>|null=null;
      if(locationReference.distanceSource==="ADMIN_CONFIG"){
        const configResult=await service.rpc("backyrd_decision_location_runtime_config_v1",{p_city_key:text(body.city)});
        if(configResult.error||!configResult.data)return honestEmpty({
          ...payload,
          location_constraint:{status:"UNRESOLVED",reference:text(locationReference.normalizedReference),reason:"LOCATION_CONFIG_UNAVAILABLE"},
        },baseResponse);
        runtimeLocationConfig=configResult.data as Record<string,unknown>;
      }
      const configuredDistanceKm=configuredNearDistanceKm({locationReference,runtimeConfig:runtimeLocationConfig});
      if(configuredDistanceKm===null)return honestEmpty({
        ...payload,
        location_constraint:{status:"UNRESOLVED",reference:text(locationReference.normalizedReference),reason:"LOCATION_CONFIG_INVALID"},
      },baseResponse);
      const resolution=await resolveLocationReference({
        reference:text(locationReference.normalizedReference),city:text(body.city),
        maxDistanceKm:configuredDistanceKm,googleApiKey:Deno.env.get("GOOGLE_PLACES_API_KEY")??null,
      });
      if(resolution.status!=="RESOLVED")return honestEmpty({
        ...payload,
        location_constraint:{status:"UNRESOLVED",reference:text(locationReference.normalizedReference),reason:resolution.reason??"REFERENCE_NOT_RESOLVED"},
      },baseResponse);
      canonicalIntent=bindResolvedLocationIntent(canonicalIntent,resolution) as Record<string,unknown>;
    }
    const funnel=buildLiveCandidateFunnel(candidates,{city:text(body.city),canonicalIntent});
    const selected = funnel.selected;
    const resolvedLocation=(canonicalIntent.hardConstraints as Record<string,unknown> | undefined)?.location as Record<string,unknown> | null | undefined;
    const verifiedLocationBySpot=resolvedLocation?Object.fromEntries(funnel.rows.flatMap((row)=>{
      if(row.handoffStatus!=="SELECTED")return[];
      const evidence=verifiedLocationEvidence({location:resolvedLocation,distanceKm:row.locationDistanceKm});
      return evidence?[[String(row.spotId),evidence]]:[];
    })):{};
    const { selected: _selectedCandidates, ...candidateFunnelTrace } = funnel;
    if(selected.length===0)return honestEmpty(payload,baseResponse);
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
        openNow: (canonicalIntent.hardConstraints as Record<string,unknown> | undefined)?.openNow === true,
        explicitConstraints: { openNow: (canonicalIntent.hardConstraints as Record<string,unknown> | undefined)?.openNow === true },
        intent: payload.intent ?? {},
        canonicalIntent,
      },
      candidates: selected.map((candidate) => ({ spotId: String(candidate.spot_id), why: text(candidate.human_reason) })),
      candidateFunnel:{...candidateFunnelTrace,sourceRetrieval:payload._internal_retrieval_trace??null},
      openAIKey: Deno.env.get("OPENAI_API_KEY") ?? null,
      verifiedLocationBySpot,
      learningEligible: !internalInvocation,
    });
    if (!live.active) return baseResponse;
    if(live.continuationOrder.length===0){
      const safeRequest=sanitizeLiveProductRequestBody(body);
      const {_internal_retrieval_trace:_internalRetrievalTrace,...safePayload}=payload;
      return jsonResponseWithFreshEntityHeaders({
        ...safePayload,query:safeRequest.query,queryText:safeRequest.query,candidates:[],
        match_disposition:"INSUFFICIENT_VERIFIED_EVIDENCE",
        match_message:"Für diese konkrete Kombination gibt es aktuell keinen ausreichend belegten Treffer. Bitte passe oder lockere eine Anforderung.",
        north_star:{
          active:true,decision_id:live.decisionId,final_source:"DETERMINISTIC_EMPTY",
          knowledge_mode:live.knowledgeMode,user_card_hash:live.userCardHash,package_hash:live.packageHash,
          deterministic_trace_id:live.deterministicTraceId,n6_trace_id:live.n6TraceId,
          n6_disposition:live.n6Disposition,personalization_active:false,fallback_error:null,
        },
        continuation:null,
      },baseResponse);
    }
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
        personalization_active:live.personalizationActive,
        fallback_error: null,
      },
      continuation:{decision_id:live.decisionId,page:1,request_id:null,exhausted:initialPage.exhausted===true,remaining_count:initialPage.remainingCount??0},
    }, baseResponse);
  } catch {
    if(liveEnabled)return json({ok:false,error:"canonical_north_star_unavailable"},503);
    return baseResponse;
  }
});
