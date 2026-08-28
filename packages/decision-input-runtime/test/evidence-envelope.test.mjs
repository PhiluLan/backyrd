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

test("family with child preserves canonical context and uses the frozen family audience scope",()=>{
  const value=pkg();
  value.n3.currentMoment.currentRequestFacts={
    familyContext:{value:"FAMILY_WITH_CHILD",provenance:"EXPLICIT"},
    childAge:{value:4,provenance:"EXPLICIT"},
    socialContext:{value:null,provenance:"UNKNOWN"},
  };
  const envelope=buildDecisionEvidenceEnvelope(value,{canonicalIntent:{
    socialContext:"family_with_kids",
    preferredPlaceTypes:["outing"],
    currentRequestFacts:value.n3.currentMoment.currentRequestFacts,
    conceptDirections:[{concept:"social_style.family_friendly",direction:1}],
  }});
  assert.deepEqual(envelope.momentSignature,{audience:"family",placeType:"outing"});
  assert.deepEqual(envelope.requestedContext,{city:"basel",socialContext:"family_with_kids",childAge:4,requestedDayparts:[],concepts:["social_style.family_friendly"]});
  assert.deepEqual(envelope.ambientContext,{observedDaypart:"morning"});
  assert.equal(envelope.version,"backyrd-decision-evidence-envelope-v2");
});

test("all supported canonical social contexts share one envelope mapper",()=>{
  const cases=[
    ["friends","friends"], ["date","date"], ["solo","solo"],
    ["family_with_kids","family"], ["work","work"], ["group","other"],
  ];
  for(const [socialContext,audience] of cases){
    const envelope=buildDecisionEvidenceEnvelope(pkg(),{canonicalIntent:{socialContext,currentRequestFacts:{},conceptDirections:[]}});
    assert.equal(envelope.requestedContext.socialContext,socialContext);
    assert.equal(envelope.momentSignature.audience,audience);
  }
});

test("child age is accepted only as explicit bounded context metadata",()=>{
  for(const fact of [{value:6,provenance:"INFERRED"},{value:6,provenance:"UNKNOWN"},{value:121,provenance:"EXPLICIT"}]){
    const envelope=buildDecisionEvidenceEnvelope(pkg(),{canonicalIntent:{currentRequestFacts:{childAge:fact},conceptDirections:[]}});
    assert.equal(envelope.momentSignature.childAge,undefined);
    assert.equal(envelope.requestedContext.childAge,undefined);
  }
});
