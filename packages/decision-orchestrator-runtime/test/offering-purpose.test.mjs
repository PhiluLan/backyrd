import test from "node:test";
import assert from "node:assert/strict";
import {buildDecisionInputPackage} from "../../decision-input-runtime/src/package.mjs";
import {buildDeterministicDecision} from "../src/orchestrator.mjs";
import {selectBestAuthorizedReason} from "../src/ranking.mjs";

const userId="71000000-0000-4000-8000-000000000001",decisionId="71000000-0000-4000-8000-000000000010";
const ids=["71000000-0000-4000-8000-000000000101","71000000-0000-4000-8000-000000000102","71000000-0000-4000-8000-000000000103"];
const base=()=>({decision:{id:decisionId,userId,city:"Basel",createdAt:"2026-08-25T18:00:00Z"},requestContext:{query:"Craft Beer und etwas essen",rawFreeText:"Craft Beer und etwas essen"},userCard:null,memoryConsentState:"missing",candidates:ids.map((spotId,index)=>({spotId,retrievalPosition:index+1,status:"approved",city:"Basel",category:"Bar",productPlaceType:"bar",openNow:true,distributionEligible:true})),n4BySpot:Object.fromEntries(ids.map((id)=>[id,{available:false,placeType:"bar",snapshotIdentity:`n4:${id}`,concepts:{}}])),offeringBySpot:{
 [ids[0]]:{offerings:{value:{CRAFT_BEER:"AVAILABLE",FOOD:"AVAILABLE"}},purposes:{value:{DRINK:"SUITABLE",EAT:"SUITABLE"}},sourceIdentity:"accepted-facts:exact",confidence:.9},
 [ids[1]]:{offerings:{value:{BEER:"AVAILABLE",FOOD:"UNKNOWN"}},purposes:{value:{}},sourceIdentity:"accepted-facts:beer",confidence:.9},
 [ids[2]]:{offerings:{value:{CRAFT_BEER:"NOT_AVAILABLE",FOOD:"AVAILABLE"}},purposes:{value:{}},sourceIdentity:"accepted-facts:no-craft",confidence:.9},
}});
const cards=ids.map((spotId)=>({spotId,name:spotId,city:"Basel",category:"Bar",headerPhotoPath:null}));

test("multi-Offering requirements remain independent, exact beats unknown and contradiction",()=>{
 const input=buildDecisionInputPackage(base()),result=buildDeterministicDecision(input.package,cards,{expectedUserId:userId});
 assert.equal(result.internal.finalOrder[0],ids[0]);
 assert.equal(result.internal.rankingInputs[ids[0]].factualFit.observations.filter((row)=>row.code==="OFFERING_MATCH"&&row.matched).length,2);
 assert.equal(result.internal.rankingInputs[ids[1]].factualFit.disposition,"UNKNOWN");
 assert.equal(result.internal.rankingInputs[ids[2]].factualFit.disposition,"CONTRADICTED");
 assert.ok(result.internal.authorizedReasons[ids[0]].some((row)=>row.copy==="Hier gibt es Craft Beer."));
 assert.ok(result.internal.authorizedReasons[ids[0]].some((row)=>row.copy==="Hier kannst du etwas essen."));
 assert.equal(JSON.stringify(input.package).includes("userTaste"),true);
 assert.deepEqual(input.package.candidates[0].n4.suitabilityFacts,{});
});

test("more unrelated Offering facts confer no completeness advantage",()=>{
 const value=base();value.requestContext={query:"Craft Beer"};value.offeringBySpot[ids[0]].offerings.value={CRAFT_BEER:"NOT_AVAILABLE",WINE:"AVAILABLE",COCKTAILS:"AVAILABLE",COFFEE:"AVAILABLE",FOOD:"AVAILABLE",SNACKS:"AVAILABLE",FULL_MEALS:"AVAILABLE"};value.offeringBySpot[ids[1]].offerings.value={CRAFT_BEER:"AVAILABLE"};
 const result=buildDeterministicDecision(buildDecisionInputPackage(value).package,cards,{expectedUserId:userId});assert.equal(result.internal.finalOrder[0],ids[1]);
});

test("all-UNKNOWN authoring remains UNKNOWN Decision truth",()=>{
 const value=base();value.requestContext={query:"Craft Beer"};value.offeringBySpot[ids[0]].offerings.value={CRAFT_BEER:"UNKNOWN",BEER:"UNKNOWN",DRINKS:"UNKNOWN"};value.offeringBySpot[ids[0]].purposes.value={};
 const input=buildDecisionInputPackage(value).package;
 assert.equal(input.candidates[0].offering.availability,"UNKNOWN");
 const result=buildDeterministicDecision(input,cards,{expectedUserId:userId});
 assert.equal(result.internal.rankingInputs[ids[0]].factualFit.disposition,"UNKNOWN");
 assert.equal(result.internal.authorizedReasons[ids[0]].some((row)=>row.copy==="Hier gibt es Craft Beer."),false);
});

test("a discriminative explicit Offering reason is selected without changing ranking",()=>{
 const value=base();value.requestContext={query:"Gemütliches Craft Beer trinken und etwas essen mit Freunden",rawFreeText:"Gemütliches Craft Beer trinken und etwas essen mit Freunden",audience:["friends"]};
 for(const spotId of ids)value.n4BySpot[spotId]={available:true,placeType:"bar",snapshotIdentity:`n4:${spotId}`,concepts:{"vibe.cozy":{presence:1,confidence:.9,provenance:`n4:${spotId}:cozy`},"vibe.social":{presence:1,confidence:.9,provenance:`n4:${spotId}:social`}},suitabilityFacts:{"social.suitability":{value:{friends:"SUITABLE"},status:"ACTIVE",confidence:.9,sourceIdentity:`accepted-fact:${spotId}:social`}}};
 value.offeringBySpot[ids[1]]={offerings:{value:{}},purposes:{value:{}},sourceIdentity:null,confidence:null};
 value.offeringBySpot[ids[2]]={offerings:{value:{}},purposes:{value:{}},sourceIdentity:null,confidence:null};
 const result=buildDeterministicDecision(buildDecisionInputPackage(value).package,cards,{expectedUserId:userId});
 assert.equal(result.internal.finalOrder[0],ids[0]);
 assert.equal(result.response.spots[0].reasonId,`now:fact:OFFERING_MATCH:offering.availability:CRAFT_BEER`);
 assert.equal(result.response.spots[0].explanation,"Hier gibt es Craft Beer.");
 assert.equal(result.response.spots[1].reasonId.includes("OFFERING_MATCH"),false);
 assert.ok(result.internal.authorizedReasons[result.response.spots[1].spotId].some((row)=>row.id===result.response.spots[1].reasonId));
 assert.equal(result.internal.rankingInputs[ids[0]].factualFit.matches,4);
 assert.equal(result.internal.rankingInputs[ids[1]].factualFit.matches,0);
});

test("reason relevance is discriminative, not a hard-coded Offering-over-audience rule",()=>{
 const offering=(id)=>({id,type:"WHY_NOW",copy:"Offering"});
 const social={id:"now:fact:SOCIAL_CONTEXT_MATCH:social.suitability",type:"WHY_NOW",copy:"Audience"};
 const exact={id:"now:fact:OFFERING_MATCH:offering.availability:CRAFT_BEER",type:"WHY_NOW",copy:"Craft"};
 assert.equal(selectBestAuthorizedReason([exact,social],[[exact,social],[offering(exact.id)] ]).id,social.id);
 assert.equal(selectBestAuthorizedReason([social,exact],[[social,exact]]).id,exact.id);
});

test("Cocktails fürs Date selects an authorized Cocktail reason when it differentiates the candidate",()=>{
 const value=base();value.requestContext={query:"Cocktails fürs Date",rawFreeText:"Cocktails fürs Date",audience:["date"]};
 value.offeringBySpot[ids[0]]={offerings:{value:{COCKTAILS:"AVAILABLE"}},purposes:{value:{DRINK:"SUITABLE"}},sourceIdentity:"accepted-facts:cocktails",confidence:.9};
 value.offeringBySpot[ids[1]]={offerings:{value:{}},purposes:{value:{}},sourceIdentity:null,confidence:null};
 value.offeringBySpot[ids[2]]={offerings:{value:{}},purposes:{value:{}},sourceIdentity:null,confidence:null};
 const result=buildDeterministicDecision(buildDecisionInputPackage(value).package,cards,{expectedUserId:userId});
 assert.equal(result.response.spots[0].explanation,"Hier gibt es Cocktails.");
 assert.ok(result.internal.authorizedReasons[ids[0]].some((row)=>row.id===result.response.spots[0].reasonId));
});

test("a broad unknown request keeps an honest candidate-specific uncertainty reason",()=>{
 const value=base();value.requestContext={query:"Was soll ich machen?",rawFreeText:"Was soll ich machen?"};value.offeringBySpot={};
 const result=buildDeterministicDecision(buildDecisionInputPackage(value).package,cards,{expectedUserId:userId});
 for(const spot of result.response.spots){
   assert.ok(spot.reasonId.startsWith("uncertainty:"));
   assert.ok(result.internal.authorizedReasons[spot.spotId].some((row)=>row.id===spot.reasonId));
 }
});

test("Indoor etwas Aktives keeps environment and activity-place semantics independently explainable",()=>{
 const value=base();value.requestContext={query:"Indoor etwas Aktives",rawFreeText:"Indoor etwas Aktives",preferredPlaceTypes:["activity"],strictCategoryIntent:true};
 value.candidates=value.candidates.map((row)=>({...row,category:"Aktivität",productPlaceType:"activity"}));
 value.n4BySpot[ids[0]]={available:true,placeType:"activity",snapshotIdentity:"n4:indoor-activity",concepts:{"environment.indoor":{presence:1,confidence:.9,provenance:"accepted:indoor"}},suitabilityFacts:{"suitability.environment":{value:"INDOOR",status:"ACTIVE",confidence:.9,sourceIdentity:"accepted-fact:indoor"}}};
 value.n4BySpot[ids[1]]={available:true,placeType:"activity",snapshotIdentity:"n4:outdoor-activity",concepts:{"environment.outdoor":{presence:1,confidence:.9,provenance:"accepted:outdoor"}},suitabilityFacts:{"suitability.environment":{value:"OUTDOOR",status:"ACTIVE",confidence:.9,sourceIdentity:"accepted-fact:outdoor"}}};
 value.n4BySpot[ids[2]]={available:false,placeType:"activity",snapshotIdentity:"n4:unknown-activity",concepts:{}};
 const activityCards=cards.map((row)=>({...row,category:"Aktivität"}));
 const result=buildDeterministicDecision(buildDecisionInputPackage(value).package,activityCards,{expectedUserId:userId});
 assert.equal(result.response.spots[0].spotId,ids[0]);
 assert.equal(result.response.spots[0].explanation,"Drinnen – passend zu deiner aktuellen Suche.");
 assert.ok(result.internal.authorizedReasons[ids[0]].some((row)=>row.id==="now:place_type:activity"));
});
