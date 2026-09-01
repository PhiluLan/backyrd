#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { distanceKm } from "../../packages/decision-input-runtime/src/location-reference.mjs";

if(process.env.BACKYRD_FOUNDER_LOCATION_CHECK!=="AUTHORIZED")throw new Error("explicit Founder location Production check acknowledgement required");
const require=createRequire(resolve(process.env.BACKYRD_MODULE_ROOT??process.cwd(),"package.json"));
const {createClient}=require("@supabase/supabase-js");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.SUPABASE_ANON_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anon||!serviceKey||!url.includes("hjgcrrzfjchzqoegcywn"))throw new Error("linked Production credentials required");

class NoRealtime{constructor(){throw new Error("realtime_disabled");}}
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{transport:NoRealtime}};
const service=createClient(url,serviceKey,options);
const email=`gate3-location-${randomUUID().slice(0,8)}@fixture.invalid`,password=`Gate3-${randomUUID()}!aA1`;
let userId=null;
const ok=(error,label)=>{if(error)throw new Error(`${label}:${String(error.message??error.name??"unknown")}`);};
const cases=[
  {id:"FOUNDER_BAHNHOF",query:"gemütliches Café in der Nähe vom Bahnhof",expectedLabel:"Basel SBB",expectResults:true},
  {id:"BASEL_SBB",query:"gemütliches Café in der Nähe vom Basel SBB",expectedLabel:"Basel SBB",expectResults:true},
  {id:"MESSEPLATZ",query:"Bar in der Nähe vom Messeplatz",expectedLabel:"Messeplatz",expectResults:true},
  {id:"KUNSTMUSEUM",query:"Restaurant nahe Kunstmuseum Basel",expectedLabel:/Kunstmuseum Basel/,expectResults:true},
  {id:"UNKNOWN_REFERENCE",query:"Café nahe Glorpplatz 999",expectUnresolved:true},
];

const removeFixtureUser=async(id)=>{
  for(const [table,column] of [["backyrd_internal_live_users_v1","user_id"],["user_consents","user_id"],["decision_sessions","user_id"]])ok((await service.from(table).delete().eq(column,id)).error,`delete ${table}`);
  ok((await service.from("safety_content_items").delete().eq("entity_type","profile").eq("entity_id",id)).error,"delete safety registry");
  ok((await service.from("profiles").delete().eq("id",id)).error,"delete profile");
  ok((await service.auth.admin.deleteUser(id)).error,"delete auth user");
};

try{
  const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{production_fixture:"gate3-founder-location-v1"}});ok(created.error,"create fixture");userId=created.data.user.id;
  ok((await service.from("profiles").upsert({id:userId,display_name:"Gate 3 Founder Location Fixture"})).error,"profile");
  ok((await service.from("user_consents").insert({user_id:userId,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"})).error,"consent");
  ok((await service.from("backyrd_internal_live_users_v1").insert({user_id:userId,enabled:true,n2_enabled:false,user_intelligence_enabled:false,decision_enabled:true,n6_enabled:false,activation_reason:"GATE3_FOUNDER_LOCATION_REALITY_CHECK"})).error,"allowlist");
  const client=createClient(url,anon,options),signed=await client.auth.signInWithPassword({email,password});ok(signed.error,"sign in");
  const token=signed.data.session?.access_token;assert.ok(token);
  const report={version:"gate3-founder-location-reality-check-v1",productionProject:"hjgcrrzfjchzqoegcywn",nearSemantics:{defaultMaxDistanceKm:.8,spotEvidence:"spots.lat_lng",referenceEvidence:"canonical city disambiguation or bounded Google Places Text Search"},results:[]};
  for(const scenario of cases){
    const response=await fetch(`${url}/functions/v1/decision-v13`,{method:"POST",headers:{authorization:`Bearer ${token}`,apikey:anon,"content-type":"application/json"},body:JSON.stringify({city:"Basel",query:scenario.query,rawFreeText:scenario.query,inputMode:"free",limit:10,v12Limit:12,semanticLimit:20,excludeSpotIds:[]})});
    const payload=await response.json();
    assert.equal(response.ok,true,`${scenario.id}:${response.status}:${payload?.error??"invalid"}`);
    assert.equal(payload?.ok,true,scenario.id);
    if(scenario.expectUnresolved){
      assert.equal(payload.match_disposition,"INSUFFICIENT_VERIFIED_EVIDENCE");
      assert.equal(payload.location_constraint?.status,"UNRESOLVED");
      assert.deepEqual(payload.candidates,[]);
      report.results.push({id:scenario.id,query:scenario.query,resolutionStatus:"UNRESOLVED",referencePoint:null,appliedNearKm:null,spots:[],honestEmpty:true,pass:true});
      continue;
    }
    const decisionId=payload.north_star?.decision_id;assert.ok(decisionId,scenario.id);
    const traced=await service.from("backyrd_decision_funnel_traces_v1").select("current_intent,retrieval_funnel,final_disposition").eq("decision_id",decisionId).single();ok(traced.error,`${scenario.id}:trace`);
    const location=traced.data.current_intent?.hardConstraints?.location;assert.ok(location,`${scenario.id}:location_missing`);
    if(scenario.expectedLabel instanceof RegExp)assert.match(location.label,scenario.expectedLabel);else assert.equal(location.label,scenario.expectedLabel);
    assert.equal(Number(location.maxDistanceKm),.8);
    const candidates=payload.candidates??[];if(scenario.expectResults)assert.ok(candidates.length>0,`${scenario.id}:no_result`);
    const ids=candidates.map((row)=>row.spot_id),spots=ids.length?await service.from("spots").select("id,name,lat,lng").in("id",ids):{data:[],error:null};ok(spots.error,`${scenario.id}:spots`);
    const spotById=new Map((spots.data??[]).map((row)=>[row.id,row]));
    const traceById=new Map((traced.data.retrieval_funnel?.rows??[]).map((row)=>[row.spotId,row]));
    const resultRows=candidates.map((candidate)=>{
      const spot=spotById.get(candidate.spot_id);assert.ok(spot,`${scenario.id}:spot_missing`);
      const measured=distanceKm({latitude:location.latitude,longitude:location.longitude},{latitude:spot.lat,longitude:spot.lng});assert.ok(measured!==null);
      assert.ok(measured<=Number(location.maxDistanceKm),`${scenario.id}:${spot.name}:${measured}`);
      const tracedDistance=Number(traceById.get(candidate.spot_id)?.locationDistanceKm);assert.ok(Number.isFinite(tracedDistance));assert.ok(Math.abs(tracedDistance-measured)<.000001);
      assert.match(String(candidate.human_reason??""),new RegExp(location.label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
      assert.match(String(candidate.human_reason??""),/\d+ m entfernt/);
      return{name:spot.name,spotId:spot.id,spotCoordinates:{latitude:spot.lat,longitude:spot.lng},distanceMeters:Math.round(measured*1000),reason:candidate.human_reason};
    });
    report.results.push({id:scenario.id,query:scenario.query,resolutionStatus:"RESOLVED",resolutionSource:location.resolutionSource,sourceIdentity:location.sourceIdentity,referencePoint:{label:location.label,latitude:location.latitude,longitude:location.longitude},appliedNearKm:location.maxDistanceKm,spots:resultRows,honestEmpty:false,pass:true});
  }
  report.summary={pass:report.results.every((row)=>row.pass),resolved:report.results.filter((row)=>row.resolutionStatus==="RESOLVED").length,unresolvedFailClosed:report.results.filter((row)=>row.resolutionStatus==="UNRESOLVED"&&row.honestEmpty).length,manualSpotLandmarkTagsRequired:false};
  const serialized=`${JSON.stringify(report,null,2)}\n`;
  if(process.env.BACKYRD_FOUNDER_LOCATION_REPORT_PATH)await writeFile(resolve(process.env.BACKYRD_FOUNDER_LOCATION_REPORT_PATH),serialized,{encoding:"utf8",flag:"wx"});else process.stdout.write(serialized);
}finally{if(userId)await removeFixtureUser(userId).catch((error)=>process.stderr.write(`cleanup_failed:${error.message}\n`));}
