import test from "node:test";
import assert from "node:assert/strict";
import {buildDecisionInputPackage} from "../../decision-input-runtime/src/package.mjs";
import {buildDeterministicDecision} from "../src/orchestrator.mjs";
import {canonicalizeProductMood} from "../../canonical-semantics/src/index.mjs";
import {buildProductionN6ShadowInput} from "../../n6-shadow-runtime/src/input.mjs";
import {validateProductionN6Output} from "../../n6-shadow-runtime/src/validator.mjs";
import {rebuildUserIntelligence} from "../../user-intelligence-runtime/src/worker.mjs";
import {N2_VERSIONS} from "../../../decision-lab/src/n2-memory-user-intelligence.mjs";

const userId="70000000-0000-4000-8000-000000000001",decisionId="70000000-0000-4000-8000-000000000010";
const spots=["70000000-0000-4000-8000-000000000101","70000000-0000-4000-8000-000000000102"];
const source=()=>({
 decision:{id:decisionId,userId,city:"Basel",moodA:null,moodB:null,createdAt:"2026-08-21T10:00:00.000Z"},
 requestContext:{query:"Regentag mit meiner 4-jährigen Tochter",rawFreeText:"Regentag mit meiner 4-jährigen Tochter",audience:["kids","family"],strictCategoryIntent:false},
 userCard:null,memoryConsentState:"missing",
 candidates:spots.map((spotId,index)=>({spotId,retrievalPosition:index+1,status:"approved",city:"Basel",category:"Aktivität",productPlaceType:"activity",openNow:null,distributionEligible:true})),
 n4BySpot:{
  [spots[0]]:{available:true,placeType:"activity",snapshotIdentity:"n4:unknown-facts",freshness:"2026-08-21T09:00:00.000Z",concepts:{}},
  [spots[1]]:{available:true,placeType:"activity",snapshotIdentity:"n4:family-rain",freshness:"2026-08-21T09:00:00.000Z",concepts:{"environment.indoor":{presence:1,confidence:.9,provenance:"e:indoor"}},suitabilityFacts:{
   "suitability.family_kids":{value:"SUITABLE",status:"ACTIVE",confidence:.9,sourceIdentity:"accepted-fact:family",contractVersion:"backyrd-canonical-semantics-v1"},
   "suitability.age":{value:{min_age:3,max_age:8,adult_supervision_required:true},status:"ACTIVE",confidence:.9,sourceIdentity:"accepted-fact:age",contractVersion:"backyrd-canonical-semantics-v1"},
   "suitability.environment":{value:"INDOOR",status:"ACTIVE",confidence:.9,sourceIdentity:"accepted-fact:environment",contractVersion:"backyrd-canonical-semantics-v1"},
   "suitability.rain":{value:"SUITABLE",status:"ACTIVE",confidence:.9,sourceIdentity:"accepted-fact:rain",contractVersion:"backyrd-canonical-semantics-v1"}
  }}
 }
});

test("FAMILY + AGE + RAIN survive N3 V2, package serialization, factual ranking and reasons",()=>{
 const input=buildDecisionInputPackage(source());
 const facts=input.package.n3.currentMoment.currentRequestFacts;
 assert.equal(facts.rain.value,"PREFERRED");assert.equal(facts.childAge.value,4);assert.equal(facts.familyContext.value,"FAMILY_WITH_CHILD");
 const factKeys=Object.keys(input.package.candidates[1].n4.suitabilityFacts);assert.deepEqual(factKeys,["suitability.age","suitability.environment","suitability.family_kids","suitability.rain"]);
 const result=buildDeterministicDecision(input.package,spots.map((spotId)=>({spotId,name:spotId,city:"Basel",category:"Aktivität",headerPhotoPath:null})),{expectedUserId:userId});
 assert.equal(result.response.spots[0].spotId,spots[1]);
 const reasons=result.internal.authorizedReasons[spots[1]];for(const code of ["RAIN_SUITABLE","INDOOR_MATCH","CHILD_AGE_MATCH","FAMILY_SUITABLE"]){const reason=reasons.find((row)=>row.id.includes(code));assert.ok(reason);assert.match(reason.evidence.factSourceIdentity,/accepted-fact:/);}
});

test("quiet is one canonical language and explicit current intent beats retrieval order",()=>{
 const value=source();value.requestContext={query:"ruhige Bar zum Reden",rawFreeText:"ruhige Bar zum Reden",selectedMoods:["ruhig"],preferredPlaceTypes:[],strictCategoryIntent:false};
 value.candidates=value.candidates.map((row,index)=>({...row,category:"Bar",productPlaceType:"bar",retrievalPosition:index+1}));
 value.n4BySpot={[spots[0]]:{available:true,placeType:"bar",snapshotIdentity:"lively",concepts:{"vibe.lively":{presence:1,confidence:.9,provenance:"e:lively"}}},[spots[1]]:{available:true,placeType:"bar",snapshotIdentity:"quiet",concepts:{"vibe.quiet":{presence:1,confidence:.9,provenance:"e:quiet"}}}};
 const input=buildDecisionInputPackage(value),result=buildDeterministicDecision(input.package,spots.map((spotId)=>({spotId,name:spotId,city:"Basel",category:"Bar",headerPhotoPath:null})),{expectedUserId:userId});
 assert.equal(result.response.spots[0].spotId,spots[1]);assert.ok(result.internal.authorizedReasons[spots[1]].some((row)=>row.id==="now:concept:vibe.quiet"));
});

test("controlled review moods qualify aliases but unsupported/test moods cannot create claims",()=>{
 assert.equal(canonicalizeProductMood("gemütlich").concept,"vibe.cozy");assert.equal(canonicalizeProductMood("cozy").concept,"vibe.cozy");assert.equal(canonicalizeProductMood("unmapped-mood").status,"INVALID");assert.equal(canonicalizeProductMood("test").status,"INVALID");
});

test("GEMÜTLICH review evidence reaches User Card/N5 while N4 authorizes the candidate reason",async()=>{
 let learned;
 const memoryEvents=[],reviewsById={},n4BySpot={};
 for(let index=0;index<6;index+=1){const spotId=`review-spot-${index}`,reviewId=`review-${index}`;memoryEvents.push({id:`memory-${index}`,idempotencyKey:`memory-${index}`,userId,eventType:"verified_visit",contractVersion:N2_VERSIONS.memoryEventContract,occurredAt:`2026-08-${String(index+1).padStart(2,"0")}T10:00:00.000Z`,observedAt:`2026-08-${String(index+1).padStart(2,"0")}T10:00:00.000Z`,ingestedAt:`2026-08-${String(index+1).padStart(2,"0")}T10:00:00.000Z`,sessionId:`review-session-${index}`,spotId,reviewId,momentSignature:{audience:index%2?"friends":"solo"},provenance:{source:"smart_review_v1",sourceEventId:reviewId,sourceVersion:"v1"},consentPurpose:"personalized_recommendations",consentState:"granted"});reviewsById[reviewId]={text:"Super gemütlich, komme wieder.",moods:[index%2?"gemütlich":"cozy"],spotBinding:{status:"CONFIRMED",confidence:.9}};n4BySpot[spotId]={placeType:"cafe",concepts:{"vibe.cozy":{confidence:.9}}};}
 const repository={readCanonicalSources:async()=>({consentGranted:true,memoryEvents,reviewsById,n4BySpot,asOf:"2026-08-21T10:00:00.000Z",watermark:"cozy-reviews"}),readLatestCard:async()=>null,persistAtomically:async(value)=>{learned=value;return{snapshotHash:value.card.userCardHash};}};
 await rebuildUserIntelligence({userId,repository});
 assert.ok(learned.nodes.some((row)=>row.concept==="vibe.cozy"&&row.evidenceAuthorities.directReview>0));
 const value=source();value.userCard=learned.card;value.requestContext={query:"gemütliches Café",rawFreeText:"gemütliches Café",selectedMoods:["gemütlich"],strictCategoryIntent:false};value.candidates=value.candidates.map((row)=>({...row,category:"Café",productPlaceType:"cafe"}));value.n4BySpot={[spots[0]]:{available:true,placeType:"cafe",snapshotIdentity:"cozy",concepts:{"vibe.cozy":{presence:1,confidence:.9,provenance:"accepted:cozy"}}},[spots[1]]:{available:false,placeType:"cafe",snapshotIdentity:"unknown",concepts:{}}};
 const input=buildDecisionInputPackage(value);assert.ok(input.package.n5.taste.some((row)=>row.concept==="vibe.cozy"));
 const result=buildDeterministicDecision(input.package,spots.map((spotId)=>({spotId,name:spotId,city:"Basel",category:"Café",headerPhotoPath:null})),{expectedUserId:userId});
 assert.ok(result.internal.authorizedReasons[spots[0]].some((row)=>row.type==="WHY_NOW"&&row.concept==="vibe.cozy"));
 assert.equal(result.internal.authorizedReasons[spots[0]].some((row)=>row.type==="WHY_FOR_YOU"),input.package.n5.knowledgeMode!=="LOW_OR_UNKNOWN");
});

test("Date and afterwork remain current context, never durable preference facts",()=>{
 const value=source();value.requestContext={query:"Date nach der Arbeit",audience:["date"],occasion:"afterwork"};const input=buildDecisionInputPackage(value);
 assert.equal(input.package.n3.currentMoment.fields.social_context.value,"date");assert.equal(input.package.n3.currentMoment.currentRequestFacts.boundaries.durablePreference,false);assert.equal(input.package.n5.taste.length,0);
});

test("N6 can select only the exact candidate-specific factual reason",()=>{
 const input=buildDecisionInputPackage(source());
 const deterministic=buildDeterministicDecision(input.package,spots.map((spotId)=>({spotId,name:spotId,city:"Basel",category:"Aktivität",headerPhotoPath:null})),{expectedUserId:userId});
 const shadow=buildProductionN6ShadowInput({decisionPackage:input.package,deterministicDecision:deterministic});
 const order=deterministic.internal.finalOrder,base=shadow.n6a2Input.n6a1Input.baseInput;
 const authorized=shadow.n6a2Input.authorizedReasons.candidates.find((row)=>row.spot_id===spots[1]).why_now.find((row)=>row.code==="RAIN_SUITABLE");assert.ok(authorized);
 const payload={ranked_candidates:order.map((spotId,index)=>({spot_id:spotId,rank:index+1,buddy_fit:.5,confidence:.5,why_for_you:[],why_now:spotId===spots[1]?[authorized]:[],uncertainty:[]})),decision_confidence:.5,user_knowledge_sufficiency:base.relevantUserProjection.sufficiency.level,moment_understanding_sufficiency:base.currentMoment.confidenceLevel};
 assert.equal(validateProductionN6Output(payload,shadow).valid,true);
 payload.ranked_candidates.find((row)=>row.spot_id===spots[0]).why_now=[authorized];assert.equal(validateProductionN6Output(payload,shadow).valid,false);
});
