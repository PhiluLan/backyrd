#!/usr/bin/env node
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {config as loadEnv} from "dotenv";
import {createClient} from "@supabase/supabase-js";

if(process.env.BACKYRD_PRODUCTION_ENV_FILE)loadEnv({path:process.env.BACKYRD_PRODUCTION_ENV_FILE,quiet:true});
if(process.env.BACKYRD_PRODUCTION_CONTINUATION_VALIDATION!=="AUTHORIZED")throw new Error("explicit Production continuation validation acknowledgement required");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.SUPABASE_ANON_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anon||!serviceKey||!url.includes("hjgcrrzfjchzqoegcywn"))throw new Error("linked Production credentials required");

class NoRealtime{constructor(){throw new Error("realtime_disabled");}}
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{transport:NoRealtime}};
const service=createClient(url,serviceKey,options);
const suffix=randomUUID().slice(0,8),email=`decision-continuation-${suffix}@fixture.invalid`,password=`Continuation-${randomUUID()}!aA1`;
let userId=null;
const ok=(error,label)=>{if(error)throw new Error(`${label}:${String(error.message??error.name??"unknown")}`);};
const intersection=(left,right)=>left.filter((value)=>new Set(right).has(value));
const ids=(candidates)=>candidates.map((candidate)=>String(candidate.spot_id));
const compact=(candidate)=>({spotId:String(candidate.spot_id),name:String(candidate.name),rank:candidate.rank??null,reason:candidate.human_reason??null});

const removeFixtureUser=async(id)=>{
  for(const [table,column] of [["backyrd_internal_live_users_v1","user_id"],["user_consents","user_id"],["decision_sessions","user_id"]]){
    const removed=await service.from(table).delete().eq(column,id);ok(removed.error,`cleanup ${table}`);
  }
  const safety=await service.from("safety_content_items").delete().eq("entity_type","profile").eq("entity_id",id);ok(safety.error,"cleanup safety registry");
  const profile=await service.from("profiles").delete().eq("id",id);ok(profile.error,"cleanup profile");
  const auth=await service.auth.admin.deleteUser(id);ok(auth.error,"cleanup auth user");
};

const invoke=async(token,body)=>{
  const started=performance.now();
  const response=await fetch(`${url}/functions/v1/decision-v13`,{
    method:"POST",headers:{authorization:`Bearer ${token}`,apikey:anon,"content-type":"application/json"},body:JSON.stringify(body),
  });
  const payload=await response.json();
  if(!response.ok||payload?.ok!==true)throw new Error(`edge:${response.status}:${payload?.error??"invalid_response"}`);
  return {payload,latencyMs:Math.round(performance.now()-started)};
};

try{
  const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{production_fixture:"decision-continuation-v1"}});ok(created.error,"create fixture user");userId=created.data.user.id;
  ok((await service.from("profiles").upsert({id:userId,display_name:"Decision Continuation Fixture"})).error,"fixture profile");
  ok((await service.from("user_consents").insert({user_id:userId,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"})).error,"fixture consent");
  ok((await service.from("backyrd_internal_live_users_v1").insert({user_id:userId,enabled:true,n2_enabled:false,user_intelligence_enabled:false,decision_enabled:true,n6_enabled:false,activation_reason:"PRODUCTION_CONTINUATION_VALIDATION"})).error,"fixture allowlist");
  const client=createClient(url,anon,options),signed=await client.auth.signInWithPassword({email,password});ok(signed.error,"fixture sign in");
  const token=signed.data.session?.access_token;assert.ok(token);
  const query="Regentag mit meiner 4-jährigen Tochter";
  const initial=await invoke(token,{city:"Basel",moodA:null,moodB:null,query,preferredPlaceTypes:[],audience:[],strictCategoryIntent:false,inputMode:"free",rawFreeText:query,limit:10,v12Limit:12,semanticLimit:18,excludeSpotIds:[]});
  const decisionId=initial.payload.north_star?.decision_id;assert.ok(decisionId);
  const pages=[{page:1,latencyMs:initial.latencyMs,candidates:(initial.payload.candidates??[]).map(compact),exhausted:initial.payload.continuation?.exhausted===true}];
  let exhausted=pages[0].exhausted;
  let previous=ids(initial.payload.candidates??[]);
  let retryReplay=null;
  for(let expectedPage=2;!exhausted&&expectedPage<=10;expectedPage+=1){
    const requestId=randomUUID();
    const next=await invoke(token,{continuationDecisionId:decisionId,continuationRequestId:requestId});
    assert.equal(next.payload.continuation?.decision_id,decisionId);
    assert.equal(next.payload.continuation?.page,expectedPage);
    const returned=ids(next.payload.candidates??[]);
    assert.deepEqual(intersection(previous,returned),[]);
    if(expectedPage===2){
      const replay=await invoke(token,{continuationDecisionId:decisionId,continuationRequestId:requestId});
      assert.deepEqual(replay.payload,next.payload);
      retryReplay={requestId,identical:true,latencyMs:replay.latencyMs};
    }
    pages.push({page:expectedPage,latencyMs:next.latencyMs,candidates:(next.payload.candidates??[]).map(compact),exhausted:next.payload.continuation?.exhausted===true});
    previous=[...previous,...returned];exhausted=next.payload.continuation?.exhausted===true;
  }
  assert.equal(new Set(previous).size,previous.length);
  const trace=await service.from("backyrd_decision_funnel_traces_v1").select("decision_funnel,final_disposition").eq("decision_id",decisionId).single();ok(trace.error,"decision trace");
  const continuation=await service.from("backyrd_decision_continuations_v1").select("candidate_order,shown_spot_ids,consumed_spot_ids,page_count,status,final_source,n6_disposition").eq("decision_id",decisionId).single();ok(continuation.error,"continuation state");
  const pageRows=await service.from("backyrd_decision_continuation_pages_v1").select("page_number,request_id,previously_shown_spot_ids,returned_spot_ids,skipped_unavailable_spot_ids,exhausted").eq("decision_id",decisionId).order("page_number");ok(pageRows.error,"continuation pages");
  const visible=await service.from("backyrd_decision_visible_impressions_v1").select("spot_id,page_number,position_in_page").eq("decision_id",decisionId).order("page_number").order("position_in_page");ok(visible.error,"visible impressions");
  assert.equal(visible.data.length,previous.length);
  assert.equal(new Set(visible.data.map((row)=>row.spot_id)).size,visible.data.length);
  const facts=trace.data.decision_funnel?.n3?.currentRequestFacts??{};
  assert.equal(facts.rain?.value,"PREFERRED");assert.equal(facts.familyContext?.value,"FAMILY_WITH_CHILD");assert.equal(facts.childAge?.value,4);
  const oldtimerId="3b4df9a2-47be-4e66-a386-c7c0b4550ca8";
  const ranking=trace.data.decision_funnel?.rankingInputs?.[oldtimerId]??null;
  const result={
    version:"decision-continuation-production-v1",decisionId,query,fixtureUser:userId,
    n3:{rain:facts.rain,family:facts.familyContext,childAge:facts.childAge},pages,retryReplay,
    duplicateCount:previous.length-new Set(previous).size,
    continuation:{...continuation.data,pageRows:pageRows.data,visibleImpressions:visible.data},
    oldtimer:{spotId:oldtimerId,deterministicPosition:(trace.data.decision_funnel?.deterministicOrder??[]).indexOf(oldtimerId)+1,ranking},
  };
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}finally{
  if(userId)await removeFixtureUser(userId).catch(()=>{});
}
