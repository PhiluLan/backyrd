#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if(process.env.BACKYRD_PRODUCTION_ENV_FILE)loadEnv({path:process.env.BACKYRD_PRODUCTION_ENV_FILE,quiet:true});
if(process.env.BACKYRD_PRODUCTION_DECISION_CLOSURE!=="AUTHORIZED")throw new Error("explicit Production closure acknowledgement required");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.SUPABASE_ANON_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anon||!serviceKey||!url.includes("hjgcrrzfjchzqoegcywn"))throw new Error("linked Production credentials required");

class NoRealtime{constructor(){throw new Error("realtime_disabled");}}
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{transport:NoRealtime}};
const service=createClient(url,serviceKey,options);
const suffix=randomUUID().slice(0,8),email=`decision-closure-${suffix}@fixture.invalid`,password=`Closure-${randomUUID()}!aA1`;
let userId=null;
const curated={
  museum:"ab4da026-0d47-4ea1-b626-5293106b4fc2",
  zoo:"0da020ba-2ef3-4840-9c07-f2376774e14f",
  elys:"57cb213c-9472-40b6-80be-a810fd77b7c9",
  tierpark:"f8ae8625-aa9c-4647-9af5-c981fc40854a",
  muks:"39fa2f48-b5b9-4c00-8c71-efe274e4da93",
};
const cases=[
  ["RAIN_CHILD","Regentag mit meiner 4-jährigen Tochter"],
  ["OUTDOOR_ANIMALS","Mit meiner Tochter draußen Tiere anschauen"],
  ["INDOOR_ACTIVE_CHILD","Indoor etwas Aktives mit Kind"],
  ["COZY_DATE","Gemütliches Date heute Abend"],
  ["LIVELY_FRIENDS","Mit Freunden etwas Lebendiges"],
  ["COFFEE_SHORT","Ich möchte einfach einen Kaffee und kurz sitzen"],
  ["ONE_HOUR","Ich habe nur eine Stunde"],
  ["QUIET_CONVERSATION","Etwas Ruhiges, wo man sich gut unterhalten kann"],
  ["BROAD_UNKNOWN","Was könnten wir machen?"],
];
const ok=(error,label)=>{if(error)throw new Error(`${label}:${String(error.message??error.name??"unknown")}:status=${String(error.status??"unknown")}:code=${String(error.code??"unknown")}`);};
const compactN3=(facts)=>({
  rain:facts?.weather?.rain??facts?.rain??null,
  family:facts?.socialContext?.family??facts?.family??null,
  childAge:facts?.audience?.childAge??facts?.childAge??null,
  environment:facts?.environment??null,
  activities:facts?.activityTypes??facts?.activities??[],
  duration:facts?.duration??null,
  conversation:facts?.conversation??null,
});
const compactRanking=(rankingInputs,order)=>order.slice(0,10).map((spotId)=>{
  const row=rankingInputs?.[spotId]??{};
  return {
    spotId,
    factualDisposition:row.factualDisposition??null,
    matches:row.factualMatches??row.matches??[],
    mismatches:row.factualMismatches??row.mismatches??[],
    partials:row.factualPartials??row.partials??[],
    preferredPlaceTypeMatch:row.preferredPlaceTypeMatch??false,
    retrievalPosition:row.retrievalPosition??null,
  };
});

const cleanupOrphanFixtures=async()=>{
  let page=1,cleaned=0;
  for(;;){
    const listed=await service.auth.admin.listUsers({page,perPage:100});ok(listed.error,"list fixture users");
    const users=listed.data.users??[];
    for(const user of users){
      if(user.user_metadata?.production_fixture!=="decision-closure-v1"||!user.email?.endsWith("@fixture.invalid"))continue;
      const removed=await service.auth.admin.deleteUser(user.id);ok(removed.error,`delete orphan fixture ${user.id}`);cleaned+=1;
    }
    if(users.length<100)break;
    page+=1;
  }
  return cleaned;
};

try{
  const cleanedOrphanFixtures=await cleanupOrphanFixtures();
  const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{production_fixture:"decision-closure-v1"}});ok(created.error,"create fixture user");userId=created.data.user.id;
  ok((await service.from("profiles").upsert({id:userId,display_name:"Decision Closure Fixture"})).error,"fixture profile");
  ok((await service.from("user_consents").insert({user_id:userId,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"})).error,"fixture consent");
  ok((await service.from("backyrd_internal_live_users_v1").insert({user_id:userId,enabled:true,n2_enabled:false,user_intelligence_enabled:false,decision_enabled:true,n6_enabled:false,activation_reason:"PRODUCTION_DECISION_FINAL_CLOSURE"})).error,"fixture allowlist");
  const client=createClient(url,anon,options);const signed=await client.auth.signInWithPassword({email,password});ok(signed.error,"fixture sign in");
  const token=signed.data.session?.access_token;assert.ok(token);
  const report={version:"decision-v13-production-v64/model-0.2.0",cleanedOrphanFixtures,fixtureUser:userId,queries:[]};
  for(const [label,query] of cases){
    const started=performance.now();
    const response=await fetch(`${url}/functions/v1/decision-v13`,{method:"POST",headers:{authorization:`Bearer ${token}`,apikey:anon,"content-type":"application/json"},body:JSON.stringify({city:"Basel",moodA:null,moodB:null,query,preferredPlaceTypes:[],audience:[],strictCategoryIntent:false,inputMode:"free",rawFreeText:query,limit:10,v12Limit:12,semanticLimit:18,excludeSpotIds:[]})});
    const payload=await response.json();
    if(!response.ok||payload?.ok!==true||payload?.north_star?.active!==true)throw new Error(`${label}:edge:${response.status}:${payload?.error??payload?.north_star?.fallback_error??"invalid_response"}`);
    const decisionId=payload.north_star.decision_id;
    const trace=await service.from("backyrd_decision_funnel_traces_v1").select("current_intent,retrieval_funnel,decision_funnel,final_disposition,created_at,completed_at").eq("decision_id",decisionId).single();ok(trace.error,`${label}:trace`);
    const source=trace.data.retrieval_funnel?.sourceRetrieval??{};
    const sourceRows=[...(source.semantic??[]),...(source.personalized??[]),...(source.fusion??[])];
    const handoff=trace.data.retrieval_funnel?.rows??[];
    const deterministicOrder=trace.data.decision_funnel?.deterministicOrder??[];
    const rankingInputs=trace.data.decision_funnel?.rankingInputs??{};
    report.queries.push({
      label,query,decisionId,httpStatus:response.status,totalLatencyMs:Math.round(performance.now()-started),
      n3:compactN3(trace.data.decision_funnel?.n3?.currentRequestFacts),
      sourceCounts:{semantic:source.semantic?.length??0,personalized:source.personalized?.length??0,fusion:source.fusion?.length??0,eligibleBeforeLimit:trace.data.retrieval_funnel?.eligibleBeforeLimit??0,handoff:handoff.filter((row)=>row.handoffStatus==="SELECTED").length},
      curated:Object.fromEntries(Object.entries(curated).map(([name,id])=>[name,{retrieved:sourceRows.some((row)=>row.spotId===id),handoff:handoff.some((row)=>row.spotId===id&&row.handoffStatus==="SELECTED"),exclusions:handoff.find((row)=>row.spotId===id)?.exclusionReasons??[]}])) ,
      deterministicOrder:deterministicOrder.slice(0,10),ranking:compactRanking(rankingInputs,deterministicOrder),
      finalSource:payload.north_star.final_source,n6Disposition:payload.north_star.n6_disposition,
      results:(payload.candidates??[]).map((row)=>({spotId:row.spot_id,name:row.name,placeType:row.place_type,reason:row.human_reason,rank:row.rank})),
      performance:{retrieval:source.performance??null,decision:trace.data.decision_funnel?.performance??null},
    });
  }
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}finally{
  if(userId)await service.auth.admin.deleteUser(userId).catch(()=>{});
}
