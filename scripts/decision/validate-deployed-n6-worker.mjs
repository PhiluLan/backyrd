#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SupabaseDecisionOrchestrator } from "../../packages/decision-orchestrator-runtime/src/index.mjs";
import { buildProductionN6ShadowInput, buildProviderRequest, SupabaseN6ShadowRepository } from "../../packages/n6-shadow-runtime/src/index.mjs";

const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,internalSecret=process.env.DECISION_ENGINE_INTERNAL_SECRET;
if(!url||!serviceKey||!internalSecret)throw new Error("deployed_worker_validation_environment_required");
if(process.env.BACKYRD_ALLOW_NONLOCAL_SPRINT5!=="true")throw new Error("explicit_nonlocal_authorization_required");
class NoRealtime{constructor(){throw new Error("realtime_disabled")}}
const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:NoRealtime}});
const fail=(error,label)=>{if(error)throw new Error(`${label}:${error.message}`)};

let flagsChanged=false;
try{
  const {data:seed,error:seedError}=await service.from("backyrd_n6_shadow_work_v1").select("input_payload").eq("state","VALIDATED").order("completed_at",{ascending:false}).limit(1).single();fail(seedError,"validated_seed");
  const email=`final-n6-edge-${randomUUID()}@fixture.invalid`,password=`Edge-${randomUUID()}!aA1`;
  const {data:created,error:createError}=await service.auth.admin.createUser({email,password,email_confirm:true});fail(createError,"create_user");
  const userId=created.user.id,candidates=seed.input_payload.n6a2Input.n6a1Input.baseInput.candidates.map((row)=>row.spotId),decisionId=randomUUID();
  fail((await service.from("profiles").upsert({id:userId})).error,"profile");
  fail((await service.from("user_consents").insert({user_id:userId,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"})).error,"consent");
  fail((await service.from("decision_sessions").insert({id:decisionId,user_id:userId,city:"Basel"})).error,"decision");
  fail((await service.from("decision_impressions").insert(candidates.map((spot_id,index)=>({decision_id:decisionId,spot_id,rank:index+1,why_this:"existing-v13-result"})))).error,"impressions");
  const context={query:"Freitag Drinks mit Freunden",rawFreeText:"Freitag Drinks mit Freunden",inputMode:"free",preferredPlaceTypes:["bar"],audience:["friends"],selectedAudiences:["friends"],selectedMoods:[],strictCategoryIntent:true,model_version:"decision-v13.0",intent:{primaryPlaceTypes:["bar"],audience:["friends"],mustRespectCategory:true}};
  fail((await service.from("backyrd_ml_events_v1").insert(candidates.map((spot_id,index)=>({user_id:userId,event_type:"decision_impression",spot_id,decision_id:decisionId,city:"Basel",rank:index+1,signal_strength:0,context})))).error,"context");
  for(const table of ["backyrd_decision_input_runtime_settings_v1","backyrd_decision_orchestrator_settings_v1"])fail((await service.from(table).update({enabled:true}).eq("singleton",true)).error,"enable_decision");
  fail((await service.from("backyrd_n6_shadow_settings_v1").update({enabled:true,internal_only:true,sample_rate:1,allowlisted_user_ids:[userId],per_user_daily_call_cap:5,global_daily_call_cap:100,global_daily_budget_usd:1,max_concurrent_calls:1,max_attempts:2}).eq("singleton",true)).error,"enable_n6");flagsChanged=true;
  const deterministic=await new SupabaseDecisionOrchestrator(service).run({decisionId,authenticatedUserId:userId});
  const input=buildProductionN6ShadowInput({decisionPackage:deterministic.inputPackage,deterministicDecision:deterministic});
  const forecast=buildProviderRequest(input);assert.ok(forecast.worstCaseCostUsd<=Number(process.env.BACKYRD_N6_LIVE_BUDGET_USD??0));
  const enqueue=await new SupabaseN6ShadowRepository(service).enqueue({input,estimatedInputTokens:forecast.estimatedInputTokens,worstCaseCostUsd:forecast.worstCaseCostUsd});assert.equal(enqueue.status,"PENDING",JSON.stringify(enqueue));
  const response=await fetch(`${url}/functions/v1/decision-engine-worker`,{method:"POST",headers:{authorization:`Bearer ${serviceKey}`,"content-type":"application/json","x-backyrd-internal-secret":internalSecret},body:JSON.stringify({mode:"N6_SHADOW"})});
  const payload=await response.json();if(!response.ok)throw new Error(`deployed_worker:${response.status}:${JSON.stringify(payload)}`);
  assert.equal(["VALIDATED","REJECTED"].includes(payload.result.status),true);
  const trace=payload.result.trace;assert.ok(trace?.canonicalProviderResponse?.canonicalHash);assert.deepEqual(new Set(trace.n6Order),new Set(candidates));
  console.log(JSON.stringify({status:"PASS",decisionId,deterministicResponseHash:deterministic.response.responseHash,workStatus:payload.result.status,traceId:payload.result.traceId,shadowRunId:trace.shadowRunId,canonicalResponseHash:trace.canonicalProviderResponse.canonicalHash,validatorDisposition:trace.validatorDisposition,latencyMs:trace.latencyMs,inputTokens:trace.usage.inputTokens,outputTokens:trace.usage.outputTokens,costUsd:trace.costUsd,retryCount:trace.retryCount,candidateIdentity:true,visibleMutation:false,n2ShadowEvents:0},null,2));
}finally{
  if(flagsChanged)await service.from("backyrd_n6_shadow_settings_v1").update({enabled:false,sample_rate:0,allowlisted_user_ids:[]}).eq("singleton",true);
  for(const table of ["backyrd_decision_orchestrator_settings_v1","backyrd_decision_input_runtime_settings_v1"])await service.from(table).update({enabled:false}).eq("singleton",true);
}
