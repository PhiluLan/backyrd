#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { contentHash } from "../../packages/decision-input-runtime/src/index.mjs";

if(process.env.BACKYRD_GATE3_PRODUCTION_ACCEPTANCE!=="AUTHORIZED")throw new Error("explicit Gate 3 Production acceptance acknowledgement required");
const require=createRequire(resolve(process.env.BACKYRD_MODULE_ROOT??process.cwd(),"package.json"));
const {createClient}=require("@supabase/supabase-js");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.SUPABASE_ANON_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anon||!serviceKey||!url.includes("hjgcrrzfjchzqoegcywn"))throw new Error("linked Production credentials required");

class NoRealtime{constructor(){throw new Error("realtime_disabled");}}
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{transport:NoRealtime}};
const service=createClient(url,serviceKey,options);
const suffix=randomUUID().slice(0,8),email=`gate3-acceptance-${suffix}@fixture.invalid`,password=`Gate3-${randomUUID()}!aA1`;
let userId=null;
const ok=(error,label)=>{if(error)throw new Error(`${label}:${String(error.message??error.name??"unknown")}`);};

const installKnownCard=async(id)=>{
  const node=(concept,scope,affinity=.78,confidence=.88)=>({nodeKey:`${scope.kind}:${scope.key}:${concept}`,concept,scope,affinity,polarity:"POSITIVE",knowledgeState:"POSITIVE",confidence,evidenceDepth:{independentSessions:8,independentSpots:6,outcomes:7},evidenceComposition:{comparative:5,mood:1,review:1},evidenceRefs:["gate3:controlled-user-evidence"],contradictions:[],trend:{direction:"STABLE"},highEligible:true});
  const body={version:"backyrd-n5-6-user-card-v1",userId:id,maturity:{state:"WELL_KNOWN"},occasionPatterns:[],nodes:[
    node("vibe.lively",{kind:"CONTEXT",key:"audience.friends"}),
    node("vibe.romantic",{kind:"CONTEXT",key:"audience.date"}),
    node("vibe.cozy",{kind:"GLOBAL",key:"global"}),
    node("place_type.bar",{kind:"PLACE_TYPE",key:"bar"},.7,.84),
  ]};
  const card={...body,userCardHash:contentHash(body),snapshotId:randomUUID(),watermark:new Date().toISOString()};
  ok((await service.from("backyrd_user_intelligence_snapshots_v2").insert({snapshot_id:card.snapshotId,user_id:id,runtime_version:"backyrd-n5-8-4-shared-runtime-v1",input_contract_version:"backyrd-production-user-intelligence-input-v1",source_watermark:card.watermark,source_hash:contentHash({id,fixture:"gate3-known"}),snapshot_hash:card.userCardHash,card,node_count:card.nodes.length})).error,"known snapshot");
  ok((await service.from("backyrd_user_intelligence_latest_v1").insert({user_id:id,snapshot_id:card.snapshotId,source_watermark:card.watermark})).error,"known latest");
  return card.userCardHash;
};

const cases=[
  ["S01","simple","Ein guter Kaffee",["cafe","restaurant"]],
  ["S02","simple","Eine Cocktailbar",["bar"]],
  ["S03","simple","Ein Restaurant fürs Abendessen",["restaurant"]],
  ["S04","simple","Ein Museum",["culture"]],
  ["S05","simple","Etwas zum Bouldern",["activity"]],
  ["S06","simple","Ein schöner Spaziergang",["outing"]],
  ["S07","simple","Ein Hotel in Basel",["hotel"]],
  ["S08","simple","Brunch",["cafe","restaurant"]],
  ["C01","combined","Ruhiges Café zum Reden",["cafe"]],
  ["C02","combined","Romantisches Dinner heute Abend",["restaurant"]],
  ["C03","combined","Lebendige Drinks mit Freunden",["bar","nightlife"]],
  ["C04","combined","Regentag mit meiner 4-jährigen Tochter",["culture","activity","experience","outing","cafe"]],
  ["C05","combined","Indoor etwas Aktives mit Kind",["activity","culture","experience"]],
  ["C06","combined","Mit meiner Tochter draußen Tiere anschauen",["outing","activity","experience"]],
  ["C07","combined","Ruhige Kunst, keine Bar und kein Restaurant",["culture"]],
  ["C08","combined","Günstiges Mittagessen",["restaurant","cafe"]],
  ["C09","combined","Spontan Cocktails, jetzt offen",["bar"]],
  ["C10","combined","Nur eine Stunde für etwas Kulturelles",["culture"]],
  ["M01","mood","Etwas Gemütliches",null],
  ["M02","mood","Etwas Ruhiges",null],
  ["M03","mood","Etwas Lebendiges",null],
  ["M04","mood","Etwas Romantisches",null],
  ["M05","mood","Etwas Inspirierendes",null],
  ["M06","mood","Etwas Urbanes",null],
  ["M07","mood","Gemütlich und ruhig",null],
  ["M08","mood","Lebendig, aber nicht Party",null],
  ["O01","offering","Craft Beer",["bar","restaurant"]],
  ["O02","offering","Selbst gebrautes Bier",["bar","restaurant"]],
  ["O03","offering","Ein Glas Wein",["bar","restaurant"]],
  ["O04","offering","Cocktails",["bar"]],
  ["O05","offering","Kaffee",["cafe","restaurant"]],
  ["O06","offering","Alkoholfreie Drinks",null],
  ["O07","offering","Brunch am Sonntag",["cafe","restaurant"]],
  ["O08","purpose","Afterwork",["bar","restaurant"]],
  ["O09","purpose","Noch schnell etwas essen",["restaurant","cafe"]],
  ["O10","purpose","Den Abend bei Drinks verbringen",["bar","restaurant"]],
  ["T01","time","Was ist jetzt offen?",null,{openNow:true}],
  ["T02","time","Café jetzt offen",["cafe"],{openNow:true}],
  ["T03","time","Heute Abend essen",["restaurant"]],
  ["T04","time","Sonntagmorgen frühstücken",["cafe","restaurant"]],
  ["T05","time","Spät nachts noch etwas trinken",["bar","nightlife"]],
  ["T06","time","Ich habe nur 30 Minuten",null],
  ["L01","location","Ein Café im Gundeli",["cafe"]],
  ["L02","location","Drinks im Kleinbasel",["bar"]],
  ["L03","location","Etwas nahe beim Bahnhof SBB",null],
  ["L04","location","Zu Fuss vom Marktplatz erreichbar",null],
  ["P01","price","Günstig essen",["restaurant","cafe"]],
  ["P02","price","Budget-Date",null],
  ["P03","price","Preiswerter Kaffee",["cafe","restaurant"]],
  ["P04","price","Premium Dinner",["restaurant"]],
  ["A01","adversarial","Café, aber bitte kein Café",null],
  ["A02","adversarial","Bar ohne Alkohol",null],
  ["A03","adversarial","Etwas glorpiges zum Flanxen",null],
  ["A04","adversarial","Ruhige vegane Rooftop-Bar mit Live-Jazz, jetzt offen und günstig",["bar"],{openNow:true}],
  ["A05","adversarial","Museum und Club gleichzeitig, aber keine Kultur und keine Party",null],
  ["F01","fallback","Was könnten wir machen?",null],
  ["F02","fallback","Überrasch mich",null],
  ["F03","fallback","Irgendwohin",null],
  ["D01","diversity","Etwas Schönes in Basel",null],
  ["D02","diversity","Etwas Schönes in Basel",null],
  ["D03","diversity","Etwas Schönes in Basel",null],
];
const requestedIds=new Set(String(process.env.BACKYRD_GATE3_CASE_IDS??"").split(",").map((value)=>value.trim()).filter(Boolean));
const selectedCases=requestedIds.size?cases.filter((row)=>requestedIds.has(row[0])):cases;

const removeFixtureUser=async(id)=>{
  for(const [table,column] of [["backyrd_internal_live_users_v1","user_id"],["user_consents","user_id"],["decision_sessions","user_id"]]){
    const removed=await service.from(table).delete().eq(column,id);ok(removed.error,`delete ${table}`);
  }
  ok((await service.from("safety_content_items").delete().eq("entity_type","profile").eq("entity_id",id)).error,"delete safety registry");
  ok((await service.from("profiles").delete().eq("id",id)).error,"delete profile");
  ok((await service.auth.admin.deleteUser(id)).error,"delete auth user");
};

const cleanOrphans=async()=>{
  let page=1,cleaned=0;
  for(;;){
    const listed=await service.auth.admin.listUsers({page,perPage:100});ok(listed.error,"list users");
    const users=listed.data.users??[];
    for(const user of users){
      if(user.user_metadata?.production_fixture!=="gate3-acceptance-v1"||!user.email?.endsWith("@fixture.invalid"))continue;
      await removeFixtureUser(user.id);cleaned++;
    }
    if(users.length<100)break;page++;
  }
  return cleaned;
};

const compactFact=(fact)=>fact?{value:fact.value,provenance:fact.provenance}:null;
const assess=(scenario,payload,trace)=>{
  const [,dimension,,expectedTypes,options={}] = scenario;
  const results=payload.candidates??[];
  const topTypes=results.map((row)=>row.place_type);
  const ranking=trace?.decision_funnel?.rankingInputs??{};
  const order=trace?.decision_funnel?.deterministicOrder??[];
  const topRows=order.slice(0,3).map((id)=>ranking[id]??{});
  const mismatches=topRows.flatMap((row)=>row.factualFit?.observations?.filter((x)=>x.outcome==="MISMATCH").map((x)=>x.code)??[]);
  const reasons=results.map((row)=>String(row.human_reason??""));
  const failures=[];
  if(results.length>3)failures.push(`RESULT_COUNT_${results.length}`);
  if(results.length===0&&payload.match_disposition!=="INSUFFICIENT_VERIFIED_EVIDENCE")failures.push("EMPTY_WITHOUT_HONEST_DISPOSITION");
  if(new Set(results.map((row)=>row.spot_id)).size!==results.length)failures.push("DUPLICATE_RESULT");
  if(expectedTypes?.length&&topTypes[0]&&!expectedTypes.includes(topTypes[0]))failures.push(`TOP_TYPE_${topTypes[0]}`);
  if(mismatches.length)failures.push(`TOP3_FACT_MISMATCH_${[...new Set(mismatches)].join("+")}`);
  if(options.openNow===true&&results.some((row)=>row.is_open_now!==true))failures.push("OPEN_NOW_NOT_PROVEN");
  if(reasons.some((value)=>value.length<12))failures.push("WEAK_REASON");
  if(reasons.some((value)=>/dein(?:em|er)? bisherigen|bei dir|dein geschmack/i.test(value)))failures.push("UNPROVEN_PERSONAL_REASON");
  return {
    dimension,
    machineSafetyPass:failures.length===0,
    diagnosticFailures:failures,
    evidenceLimited:results.length===0&&payload.match_disposition==="INSUFFICIENT_VERIFIED_EVIDENCE",
    requiresManualProductReview:true,
  };
};

const recordVisiblePage=async(client,decisionId,spotIds,page)=>{
  for(let index=0;index<spotIds.length;index+=1){
    const recorded=await client.rpc("backyrd_record_visible_decision_impression_v1",{
      p_decision_id:decisionId,p_spot_id:spotIds[index],p_page:page,p_rank:index+1,
    });
    ok(recorded.error,`visible impression page=${page} rank=${index+1}`);
  }
};

try{
  const cleanedOrphanFixtures=await cleanOrphans();
  const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{production_fixture:"gate3-acceptance-v1"}});ok(created.error,"create fixture");userId=created.data.user.id;
  ok((await service.from("profiles").upsert({id:userId,display_name:"Gate 3 Acceptance Fixture"})).error,"profile");
  ok((await service.from("user_consents").insert({user_id:userId,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"})).error,"consent");
  const knownCard=process.env.BACKYRD_GATE3_KNOWN_CARD==="AUTHORIZED"?await installKnownCard(userId):null;
  ok((await service.from("backyrd_internal_live_users_v1").insert({user_id:userId,enabled:true,n2_enabled:false,user_intelligence_enabled:Boolean(knownCard),decision_enabled:true,n6_enabled:false,activation_reason:"GO_LIVE_GATE_3_ACCEPTANCE"})).error,"allowlist");
  const client=createClient(url,anon,options),signed=await client.auth.signInWithPassword({email,password});ok(signed.error,"sign in");
  const token=signed.data.session?.access_token;assert.ok(token);
  const report={version:"go-live-gate-3-production-acceptance-v2-manual-review",mode:knownCard?"SUFFICIENT_USER_EVIDENCE":"COLD_START",knownCard,cleanedOrphanFixtures,scenarioCount:selectedCases.length,results:[],continuation:null};
  for(const scenario of selectedCases){
    const [id,dimension,query,,extra={}] = scenario;
    const started=performance.now();
    const response=await fetch(`${url}/functions/v1/decision-v13`,{method:"POST",headers:{authorization:`Bearer ${token}`,apikey:anon,"content-type":"application/json"},body:JSON.stringify({city:"Basel",query,rawFreeText:query,inputMode:"free",limit:10,v12Limit:12,semanticLimit:20,excludeSpotIds:[],...extra})});
    const payload=await response.json();
    if(!response.ok||payload?.ok!==true||payload?.north_star?.active!==true)throw new Error(`${id}:edge:${response.status}:${payload?.error??"invalid"}`);
    const decisionId=payload.north_star.decision_id??null;
    let trace=null;
    if(decisionId){
      const traced=await service.from("backyrd_decision_funnel_traces_v1").select("current_intent,retrieval_funnel,decision_funnel,final_disposition").eq("decision_id",decisionId).single();ok(traced.error,`${id}:trace`);
      trace=traced.data;
    }
    const requestFacts=trace?.decision_funnel?.n3?.currentRequestFacts??{};
    const assessment=assess(scenario,payload,trace);
    report.results.push({
      id,dimension,query,latencyMs:Math.round(performance.now()-started),...assessment,
      finalSource:payload.north_star?.final_source??null,
      knowledgeMode:payload.north_star?.knowledge_mode??null,
      personalizationActive:payload.north_star?.personalization_active??false,
      intent:{placeTypes:trace?.current_intent?.preferredPlaceTypes??[],excluded:trace?.current_intent?.excludedPlaceTypes??[],hard:trace?.current_intent?.hardConstraints??null},
      facts:{rain:compactFact(requestFacts.rain),family:compactFact(requestFacts.familyContext),environment:compactFact(requestFacts.environment),duration:compactFact(requestFacts.durationMinutes),dayparts:compactFact(requestFacts.dayparts),temporalEligibility:compactFact(requestFacts.temporalEligibility),location:compactFact(requestFacts.location),priceMinimum:compactFact(requestFacts.priceMinimum),priceMaximum:compactFact(requestFacts.priceMaximum),priceBudgetChf:compactFact(requestFacts.priceBudgetChf),offerings:compactFact(requestFacts.offerings),purposes:compactFact(requestFacts.purposes)},
      results:(payload.candidates??[]).map((row)=>({name:row.name,spotId:row.spot_id,type:row.place_type,openNow:row.is_open_now,reason:row.human_reason})),
    });
    if(process.env.BACKYRD_GATE3_CONTINUATION==="AUTHORIZED"&&!report.continuation&&decisionId){
      const pages=[(payload.candidates??[]).map((row)=>String(row.spot_id))];
      await recordVisiblePage(client,decisionId,pages[0],1);
      let exhausted=payload.continuation?.exhausted===true,page=2;
      while(!exhausted&&page<=10){
        const continuationRequestId=randomUUID();
        const nextResponse=await fetch(`${url}/functions/v1/decision-v13`,{method:"POST",headers:{authorization:`Bearer ${token}`,apikey:anon,"content-type":"application/json"},body:JSON.stringify({continuationDecisionId:decisionId,continuationRequestId})});
        const next=await nextResponse.json();
        if(!nextResponse.ok||next?.ok!==true)throw new Error(`continuation:${nextResponse.status}:${next?.error??"invalid"}`);
        const returned=(next.candidates??[]).map((row)=>String(row.spot_id));
        pages.push(returned);
        await recordVisiblePage(client,decisionId,returned,page);
        exhausted=next.continuation?.exhausted===true;page++;
      }
      const all=pages.flat();
      const visible=await service.from("backyrd_decision_visible_impressions_v1").select("spot_id",{count:"exact"}).eq("decision_id",decisionId);
      ok(visible.error,"continuation visible impressions");
      report.continuation={decisionId,pages,pageSizes:pages.map((row)=>row.length),returnedCount:all.length,distinctCount:new Set(all).size,duplicateCount:all.length-new Set(all).size,visibleImpressionCount:visible.count??visible.data.length,exhausted};
    }
    process.stderr.write(`${id} ${assessment.machineSafetyPass?"SAFE":"UNSAFE"}${assessment.evidenceLimited?" EVIDENCE_LIMITED":""}\n`);
  }
  const byDimension=Object.fromEntries([...new Set(report.results.map((row)=>row.dimension))].map((dimension)=>{const rows=report.results.filter((row)=>row.dimension===dimension);return[dimension,{count:rows.length,machineSafe:rows.filter((row)=>row.machineSafetyPass).length,evidenceLimited:rows.filter((row)=>row.evidenceLimited).length}];}));
  report.summary={machineSafe:report.results.filter((row)=>row.machineSafetyPass).length,machineUnsafe:report.results.filter((row)=>!row.machineSafetyPass).length,evidenceLimited:report.results.filter((row)=>row.evidenceLimited).length,manualProductQualityVerdict:"REQUIRED",byDimension,distinctTopSpots:new Set(report.results.map((row)=>row.results[0]?.spotId).filter(Boolean)).size};
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}finally{
  if(userId)await removeFixtureUser(userId).catch((error)=>process.stderr.write(`cleanup_failed:${error.message}\n`));
}
