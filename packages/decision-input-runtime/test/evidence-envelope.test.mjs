import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionEvidenceEnvelope } from "../src/evidence-envelope.mjs";

const pkg=()=>({decisionId:"decision",userId:"user",packageHash:"a".repeat(64),contractIdentities:{semantics:"backyrd-canonical-semantics-v1"},n3:{momentHash:"b".repeat(64),currentMoment:{fields:{city:{value:"Basel"},social_context:{value:"friends"},daypart:{value:"morning"}}}},candidates:[{spotId:"spot",n4:{snapshotHash:"c".repeat(64),snapshotIdentity:null,availability:"UNKNOWN",placeType:null,concepts:[],suitabilityFacts:{}}}]});

test("explicit requested evening overrides ambient morning in the learning envelope",()=>{
  const value=buildDecisionEvidenceEnvelope(pkg(),{canonicalIntent:{socialContext:"FRIENDS",currentRequestFacts:{dayparts:{value:["EVENING"],authority:"EXPLICIT"}},conceptDirections:[{concept:"vibe.cozy",direction:1}]}});
  assert.deepEqual(value.momentSignature,{audience:"friends",daypart:"evening"});
  assert.deepEqual(value.requestedContext,{city:"basel",socialContext:"friends",requestedDayparts:["evening"],concepts:["vibe.cozy"]});
  assert.deepEqual(value.ambientContext,{observedDaypart:"morning"});
});

test("UNKNOWN candidate remains pinned without future concepts",()=>{
  const value=buildDecisionEvidenceEnvelope(pkg(),{}).candidates[0];
  assert.equal(value.availability,"UNKNOWN");
  assert.deepEqual(value.tasteConcepts,[]);
});

test("only frozen Taste concepts cross the candidate envelope",()=>{
  const value=pkg();
  value.candidates[0].n4={...value.candidates[0].n4,availability:"FULL",placeType:"bar",snapshotIdentity:"snapshot",concepts:[{concept:"vibe.cozy",confidence:.9,presence:1},{concept:"occasion.kids_friendly",confidence:.9,presence:1}]};
  assert.deepEqual(buildDecisionEvidenceEnvelope(value,{}).candidates[0].tasteConcepts,[{concept:"vibe.cozy",confidence:.9,presence:1}]);
});
