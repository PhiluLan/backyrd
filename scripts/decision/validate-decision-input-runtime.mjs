#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SupabaseDecisionInputRepository } from "../../packages/decision-input-runtime/src/index.mjs";

const url=process.env.SUPABASE_URL;
const anonKey=process.env.SUPABASE_ANON_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!anonKey||!serviceKey)throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
if(!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost)/.test(url)&&process.env.BACKYRD_ALLOW_NONLOCAL_SPRINT3!=="true")throw new Error("Sprint 3 validation is local-only unless explicitly authorized");

class DisabledRealtimeTransport{constructor(){throw new Error("realtime_disabled_for_sprint3_validation")}}
const clientOptions={auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:DisabledRealtimeTransport}};
const service=createClient(url,serviceKey,clientOptions);
const canonical=(value)=>value&&typeof value==="object"?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])]))):value;
const hash=(value)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const runId=Date.now().toString(36);
const emails={known:`s3-known-${runId}@fixture.invalid`,cold:`s3-cold-${runId}@fixture.invalid`,other:`s3-other-${runId}@fixture.invalid`};
const password=`S3-${randomUUID()}!aA1`;
const createdUsers=[];
const createdSpots=[];
let categoryId;

const ok=(error,label)=>{if(error)throw new Error(`${label}: ${error.message}`)};
const clientFor=async(email)=>{const client=createClient(url,anonKey,clientOptions);const{error}=await client.auth.signInWithPassword({email,password});ok(error,`sign in ${email}`);return client;};
const makeNode=(concept,scope,affinity=.75,confidence=.86)=>({
  nodeKey:`${scope.kind}:${scope.key}:${concept}`,concept,scope,affinity,
  polarity:affinity>0?"POSITIVE":"NEGATIVE",knowledgeState:affinity>0?"POSITIVE":"NEGATIVE",confidence,
  evidenceDepth:{independentSessions:7,independentSpots:5,outcomes:6},evidenceComposition:{comparative:4,mood:1,review:1},
  evidenceRefs:["basel:private-local-history"],contradictions:[],trend:{direction:"STABLE"},highEligible:true,
});

async function createUser(email){
  const{data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});ok(error,"create fixture user");createdUsers.push(data.user.id);return data.user.id;
}

async function installKnownCard(userId){
  const body={version:"backyrd-n5-6-user-card-v1",userId,maturity:{state:"WELL_KNOWN"},occasionPatterns:[],nodes:[
    makeNode("vibe.lively",{kind:"CONTEXT",key:"audience.friends"}),
    makeNode("vibe.romantic",{kind:"CONTEXT",key:"audience.date"}),
    makeNode("social_style.solo_friendly",{kind:"CONTEXT",key:"audience.solo"}),
    makeNode("social_style.family_friendly",{kind:"CONTEXT",key:"audience.family"}),
    makeNode("place_type.bar",{kind:"PLACE_TYPE",key:"bar"},.68,.81),
    makeNode("discovery.hidden_gem",{kind:"GLOBAL",key:"global"},.66,.84),
  ]};
  const card={...body,userCardHash:hash(body)};
  const snapshotId=randomUUID();
  let response=await service.from("backyrd_user_intelligence_snapshots_v2").insert({snapshot_id:snapshotId,user_id:userId,runtime_version:"backyrd-n5-8-4-shared-runtime-v1",input_contract_version:"backyrd-production-user-intelligence-input-v1",source_watermark:"2026-08-20T12:00:00.000Z",source_hash:hash({userId,fixture:"s3"}),snapshot_hash:card.userCardHash,card,node_count:card.nodes.length});ok(response.error,"insert canonical card snapshot");
  response=await service.from("backyrd_user_intelligence_latest_v1").insert({user_id:userId,snapshot_id:snapshotId,source_watermark:"2026-08-20T12:00:00.000Z"});ok(response.error,"mark latest canonical card");
  return card;
}

async function createSpot(name,city="Basel"){
  const id=randomUUID();createdSpots.push(id);
  const{error}=await service.from("spots").insert({id,name,city,country:city==="Copenhagen"?"Denmark":"Switzerland",category_id:categoryId,status:"approved",lat:city==="Copenhagen"?55.676:47.56,lng:city==="Copenhagen"?12.568:7.59});ok(error,`create ${name}`);return id;
}

async function addN4(spotId,{concepts,snapshot=true,placeType="bar"}){
  const rows=Object.entries(concepts).map(([dimension,value],index)=>({spot_id:spotId,dimension_key:dimension,value_kind:"INTERPRETATION",value:value.presence,context_signature:{},source_family:"backyrd_derived",source_reference:`s3:${runId}:${spotId}:${index}`,independent_subject_hash:hash({spotId,dimension}),signal_confidence:value.confidence,observed_at:"2026-08-19T12:00:00.000Z",valid_from:"2026-08-19T12:00:00.000Z",provenance:{source:"sprint3_fixture",identity:`s3:${spotId}:${dimension}`},status:"ACTIVE"}));
  const{error}=await service.from("backyrd_spot_intelligence_evidence_v1").insert(rows);ok(error,"insert N4 evidence");
  if(snapshot){const{error:snapshotError}=await service.from("backyrd_spot_intelligence_snapshots_v1").insert({spot_id:spotId,context_key:"global",intelligence:{placeType},confidence:.86,completeness:.75,contradictions:[],evidence_watermark:"2026-08-19T12:00:00.000Z",fingerprint:hash({spotId,placeType,concepts}),calculated_at:"2026-08-19T12:05:00.000Z"});ok(snapshotError,"insert N4 snapshot");}
}

async function productDecision(client,userId,{label,city="Basel",query,audience=[],moods=[],placeTypes=[],strict=false,spots,createdAt="2026-08-21T18:30:00.000Z"}){
  const{data:decisionId,error:createError}=await client.rpc("create_decision_session_v1",{p_city:city,p_mood_a_text:moods[0]??null,p_mood_b_text:moods[1]??null});ok(createError,`${label} create Product decision`);
  let response=await service.from("decision_sessions").update({created_at:createdAt}).eq("id",decisionId).eq("user_id",userId);ok(response.error,`${label} fixture clock`);
  response=await client.rpc("log_decision_impressions_v1",{p_decision_id:decisionId,p_spot_ids:spots,p_why_this:spots.map(()=>"existing-v13-result")});ok(response.error,`${label} Product impressions`);
  const context={query,rawFreeText:query,inputMode:"free",preferredPlaceTypes:placeTypes,audience,selectedAudiences:audience,selectedMoods:moods,strictCategoryIntent:strict,model_version:"decision-v13.0",intent:{primaryPlaceTypes:placeTypes,audience,mustRespectCategory:strict}};
  for(let index=0;index<spots.length;index++){
    const logged=await client.rpc("backyrd_ml_log_event_v1",{p_event_type:"decision_impression",p_spot_id:spots[index],p_decision_id:decisionId,p_rank:index+1,p_city:city,p_mood_a_text:moods[0]??null,p_mood_b_text:moods[1]??null,p_context:context,p_signal_strength:null});ok(logged.error,`${label} Product context event`);
  }
  const repository=new SupabaseDecisionInputRepository(service);
  const result=await repository.buildAndPersist(decisionId);
  return {label,decisionId,query,result};
}

function proof(row){
  const p=row.result.package;
  return {case:row.label,request:row.query,n3:{social:p.n3.currentMoment.fields.social_context?.value??null,city:p.n3.currentMoment.fields.city?.value??null,vibe:p.n3.currentMoment.fields.vibe?.value??[],unknown:p.n3.currentMoment.unknownFields},knownCard:row.result.userCardSource,n5Selected:p.n5.taste.map(({concept,scope,polarity,confidence})=>({concept,scope,polarity,confidence})),n5Suppressed:row.result.n5.raw?.projectionAudit?.suppressedCount??row.result.n5.suppressionSummary,candidates:p.candidates.map(({spotId,n4})=>({spotId,n4:n4.availability,concepts:n4.concepts.map((x)=>x.concept)})),knowledgeMode:p.n5.knowledgeMode,why:"Current Moment and frozen N5 relevance/suppression; existing v13 candidate identity remains fixed."};
}

async function main(){
  const knownId=await createUser(emails.known),coldId=await createUser(emails.cold);await createUser(emails.other);
  const purpose=await service.from("consent_purposes").select("key").eq("key","personalized_recommendations").maybeSingle();ok(purpose.error,"read consent purpose");
  if(!purpose.data){const inserted=await service.from("consent_purposes").insert({key:"personalized_recommendations",title_de:"Personalisierte Empfehlungen",description_de:"Sprint 3 local fixture",category:"personalization",legal_basis:"consent",requires_consent:true,is_required:false,default_enabled:false,sort_order:1,is_active:true});ok(inserted.error,"create local consent purpose");}
  for(const userId of createdUsers){const{error}=await service.from("user_consents").upsert({user_id:userId,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"});ok(error,"grant fixture consent");}
  const existingCategory=await service.from("categories").select("id").eq("name","Bar").maybeSingle();ok(existingCategory.error,"read Bar category");
  if(existingCategory.data)categoryId=existingCategory.data.id;
  else{const category=await service.from("categories").insert({name:"Bar"}).select("id").single();ok(category.error,"create Bar category");categoryId=category.data.id;}
  const rich=await createSpot(`S3 Rich ${runId}`),partial=await createSpot(`S3 Partial ${runId}`),unknown=await createSpot(`S3 Unknown ${runId}`),copenhagen=await createSpot(`S3 Copenhagen ${runId}`,"Copenhagen");
  await addN4(rich,{concepts:{"vibe.lively":{presence:.9,confidence:.88},"social_style.conversation_friendly":{presence:.72,confidence:.76}}});
  await addN4(partial,{concepts:{"vibe.cozy":{presence:.82,confidence:.8}},snapshot:false});
  await addN4(copenhagen,{concepts:{"discovery.hidden_gem":{presence:.87,confidence:.84}}});
  await installKnownCard(knownId);
  let response=await service.from("backyrd_decision_input_runtime_settings_v1").update({enabled:true}).eq("singleton",true);ok(response.error,"enable local Sprint 3 runtime");
  const known=await clientFor(emails.known),cold=await clientFor(emails.cold);
  const baselCandidates=[rich,partial,unknown];
  const cases=[];
  cases.push(await productDecision(cold,coldId,{label:"COLD_FRIENDS",query:"Freitag Drinks mit Freunden",audience:["friends"],placeTypes:["bar"],strict:true,spots:baselCandidates}));
  cases.push(await productDecision(known,knownId,{label:"KNOWN_FRIENDS",query:"Freitag Drinks mit Freunden",audience:["friends"],placeTypes:["bar"],strict:true,spots:baselCandidates}));
  cases.push(await productDecision(known,knownId,{label:"KNOWN_DATE",query:"Romantisches Date am Abend",audience:["date"],moods:["romantisch"],placeTypes:["bar"],strict:true,spots:baselCandidates,createdAt:"2026-08-22T18:30:00.000Z"}));
  cases.push(await productDecision(known,knownId,{label:"KNOWN_SOLO",query:"Allein nach der Arbeit",audience:["solo"],placeTypes:["bar"],strict:true,spots:baselCandidates,createdAt:"2026-08-25T16:30:00.000Z"}));
  cases.push(await productDecision(known,knownId,{label:"KNOWN_FAMILY",query:"Sonntag mit der Familie",audience:["family"],placeTypes:["bar"],strict:true,spots:baselCandidates,createdAt:"2026-08-23T10:30:00.000Z"}));
  cases.push(await productDecision(known,knownId,{label:"EXPLICIT_QUIET_CONFLICT",query:"Ruhig, damit wir reden können",audience:["friends"],moods:["ruhig"],placeTypes:["bar"],strict:true,spots:baselCandidates}));
  cases.push(await productDecision(known,knownId,{label:"COPENHAGEN",city:"Copenhagen",query:"Eine exploratory Hidden-Gem-Bar",moods:["exploratory"],placeTypes:["bar"],strict:true,spots:[copenhagen]}));
  cases.push(await productDecision(known,knownId,{label:"BROAD_UNKNOWN",query:"Was soll ich machen?",spots:baselCandidates}));

  const byLabel=Object.fromEntries(cases.map((row)=>[row.label,row]));
  assert.equal(byLabel.COLD_FRIENDS.result.package.n5.knowledgeMode,"LOW_OR_UNKNOWN");
  assert.equal(byLabel.COLD_FRIENDS.result.package.n5.taste.length,0);
  const friends=byLabel.KNOWN_FRIENDS.result.package.n5.taste.map((row)=>row.concept),date=byLabel.KNOWN_DATE.result.package.n5.taste.map((row)=>row.concept);
  assert.notDeepEqual(friends,date);assert.ok(friends.includes("vibe.lively"));assert.ok(date.includes("vibe.romantic"));
  assert.equal(byLabel.EXPLICIT_QUIET_CONFLICT.result.package.n5.taste.some((row)=>row.concept==="vibe.lively"),false);
  assert.equal(byLabel.EXPLICIT_QUIET_CONFLICT.result.n5.raw.projectionAudit.nodes.some((row)=>row.concept==="vibe.lively"&&row.reasonCode==="CURRENT_INTENT_CONFLICT"),true);
  assert.equal(byLabel.BROAD_UNKNOWN.result.package.n5.knowledgeMode,"LOW_OR_UNKNOWN");assert.ok(byLabel.BROAD_UNKNOWN.result.package.n5.taste.length<=1);
  const n4States=new Set(byLabel.KNOWN_FRIENDS.result.package.candidates.map((row)=>row.n4.availability));assert.deepEqual(n4States,new Set(["FULL","PARTIAL","UNKNOWN"]));
  const copenhagenJson=JSON.stringify(byLabel.COPENHAGEN.result.package);assert.equal(copenhagenJson.includes("basel:private-local-history"),false);assert.equal(copenhagenJson.includes(rich),false);
  assert.equal(byLabel.COPENHAGEN.result.package.n5.taste.some((row)=>row.concept==="discovery.hidden_gem"),true);
  assert.equal(JSON.stringify(cases.map((row)=>row.result.package)).match(/ownerPlan|subscriptionTier|sponsoredBoost|paymentState/),null);

  const repository=new SupabaseDecisionInputRepository(service);const replay=await repository.buildAndPersist(byLabel.KNOWN_FRIENDS.decisionId);assert.equal(replay.traceId,byLabel.KNOWN_FRIENDS.result.traceId);assert.equal(replay.package.packageHash,byLabel.KNOWN_FRIENDS.result.package.packageHash);
  const ownRead=await known.from("backyrd_user_intelligence_snapshots_v2").select("user_id").eq("user_id",coldId);assert.equal(ownRead.error,null);assert.equal(ownRead.data.length,0);
  const traceRead=await known.from("backyrd_decision_input_traces_v1").select("id");assert.ok(traceRead.error);
  const forged=await known.rpc("backyrd_persist_decision_input_trace_v1",{p_decision_id:byLabel.KNOWN_FRIENDS.decisionId,p_user_id:knownId,p_user_card_hash:"a".repeat(64),p_moment_hash:"b".repeat(64),p_projection_hash:"c".repeat(64),p_candidate_set_hash:"d".repeat(64),p_n4_hashes:{},p_knowledge_mode:"LOW_OR_UNKNOWN",p_contract_versions:{},p_package_hash:"e".repeat(64),p_validation_disposition:"VALID"});assert.ok(forged.error);

  const summaries=cases.filter((row)=>["COLD_FRIENDS","KNOWN_FRIENDS","KNOWN_DATE","EXPLICIT_QUIET_CONFLICT","COPENHAGEN","BROAD_UNKNOWN"].includes(row.label)).map(proof);
  const performance=Object.fromEntries(cases.map((row)=>[row.label,row.result.performance]));
  console.log(JSON.stringify({status:"PASS",runtime:"SHADOW_ONLY",cases:summaries,performance,assertions:{coldHonesty:true,currentIntentAuthority:true,sameUserDifferentMoment:true,crossCityPortableWithoutLocalTrail:true,n4FullPartialUnknown:true,commercialIsolation:true,traceReplayIdempotent:true,crossUserIsolation:true},boundaries:{n6:"NOT_AUTHORIZED",visibleProduct:"UNCHANGED",production:"UNCHANGED"}},null,2));
}

try{await main();}finally{
  if(createdUsers.length){await service.from("backyrd_decision_input_runtime_settings_v1").update({enabled:false}).eq("singleton",true);for(const userId of createdUsers.reverse())await service.auth.admin.deleteUser(userId);}
  if(createdSpots.length)await service.from("spots").delete().in("id",createdSpots);
  // The canonical Bar category may predate the fixture and is intentionally retained.
}
