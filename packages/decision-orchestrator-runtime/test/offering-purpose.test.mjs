import test from "node:test";
import assert from "node:assert/strict";
import {buildDecisionInputPackage} from "../../decision-input-runtime/src/package.mjs";
import {buildDeterministicDecision} from "../src/orchestrator.mjs";

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
