import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalRuntimeInputWithDispositions } from "../src/production-input.mjs";
import { buildUserIntelligenceReadOnly } from "../src/worker.mjs";

const baseEvent=(overrides={})=>({
  id:"5683abec-5e16-4d8b-8e38-19655d6c1c13",idempotencyKey:"passt:919",userId:"user-1",
  eventType:"exact_mood_feedback",contractVersion:"backyrd-memory-event-contract-v1",
  occurredAt:"2026-08-25T06:24:00.000Z",observedAt:"2026-08-25T06:24:00.000Z",ingestedAt:"2026-08-25T06:24:01.000Z",
  decisionId:"7a79453c-9469-4cf8-92fc-08f224d3ca72",sessionId:"7a79453c-9469-4cf8-92fc-08f224d3ca72",spotId:"941da8a2-97c0-442f-adfb-288ee14904de",
  momentSignature:{},spotEvidence:{},provenance:{source:"product_memory_bridge",sourceEventId:"product_action:919",sourceVersion:"v1"},
  consentPurpose:"personalized_recommendations",consentState:"granted",...overrides,
});

const source=(memoryEvents,n4BySpot={})=>({consentGranted:true,memoryEvents,reviewsById:{},n4BySpot,asOf:"2026-08-25T07:00:00.000Z",watermark:"2026-08-25T06:24:01.000Z"});

test("UNKNOWN at feedback time remains unattributed after later N4 enrichment",()=>{
  const event=baseEvent({evidenceEnvelope:{sourceKind:"DECISION_PACKAGE",momentSignature:{audience:"friends",daypart:"evening"},requestedContext:{concepts:["vibe.cozy"],socialContext:"friends",requestedDayparts:["evening"],city:"basel"},ambientContext:{observedDaypart:"morning"},n4SnapshotHash:"a".repeat(64),n4Availability:"UNKNOWN",tasteConcepts:[],attributionDisposition:"NO_EVENT_TIME_N4",envelopeHash:"b".repeat(64)}});
  const before=buildCanonicalRuntimeInputWithDispositions(source([event]));
  const after=buildCanonicalRuntimeInputWithDispositions(source([event],{[event.spotId]:{placeType:"bar",concepts:{"vibe.cozy":{confidence:.99},"vibe.social":{confidence:.95}}}}));
  assert.deepEqual(before.events,[]);
  assert.equal(before.dispositions[0].processingDisposition,"NO_EVENT_TIME_N4");
  assert.deepEqual(before,after);
});

test("pinned N4 and requested moment survive current N4 corrections",()=>{
  const event=baseEvent({evidenceEnvelope:{sourceKind:"DECISION_PACKAGE",momentSignature:{audience:"friends",daypart:"evening"},requestedContext:{concepts:["vibe.cozy"],socialContext:"friends",requestedDayparts:["evening"],city:"basel"},ambientContext:{observedDaypart:"morning"},n4SnapshotHash:"c".repeat(64),n4SnapshotIdentity:"n4:t0",n4Availability:"FULL",placeType:"bar",tasteConcepts:[{concept:"vibe.cozy",confidence:.81},{concept:"vibe.social",confidence:.77}],attributionDisposition:"PINNED_DECISION_EVIDENCE",envelopeHash:"d".repeat(64)}});
  const t0=buildUserIntelligenceReadOnly({userId:"user-1",source:source([event])});
  const t1=buildUserIntelligenceReadOnly({userId:"user-1",source:source([event],{[event.spotId]:{placeType:"restaurant",concepts:{"vibe.lively":{confidence:.99}}}})});
  assert.equal(t0.input[0].momentSignature.audience,"friends");
  assert.equal(t0.input[0].momentSignature.daypart,"evening");
  assert.notEqual(t0.input[0].momentSignature.daypart,"morning");
  assert.deepEqual(t0.input[0].spotEvidence.concepts,["vibe.cozy","vibe.social"]);
  assert.equal(t0.result.userCard.userCardHash,t1.result.userCard.userCardHash);
  assert.equal(t0.dispositions[0].processingDisposition,"FUSION_CONSUMED_BOUNDED");
});

test("family child context survives attribution without becoming a Taste concept or scope",()=>{
  const event=baseEvent({evidenceEnvelope:{sourceKind:"DECISION_PACKAGE",momentSignature:{audience:"family",placeType:"outing"},requestedContext:{concepts:["social_style.family_friendly"],socialContext:"family_with_kids",childAge:4,requestedDayparts:[],city:"basel"},ambientContext:{observedDaypart:"afternoon"},n4SnapshotHash:"9".repeat(64),n4SnapshotIdentity:"n4:family-t0",n4Availability:"FULL",placeType:"experience",tasteConcepts:[{concept:"social_style.family_friendly",confidence:.9}],attributionDisposition:"PINNED_DECISION_EVIDENCE",envelopeHash:"8".repeat(64)}});
  const built=buildUserIntelligenceReadOnly({userId:"user-1",source:source([event])});
  assert.equal(built.input[0].momentSignature.audience,"family");
  assert.equal(event.evidenceEnvelope.requestedContext.childAge,4);
  assert.deepEqual(built.input[0].spotEvidence.concepts,["social_style.family_friendly"]);
  assert.deepEqual(built.result.userCard.nodes.map((node)=>`${node.scope.kind}:${node.scope.key}`).sort(),[
    "CONTEXT:audience.family","GLOBAL:global","PLACE_TYPE:experience",
  ]);
  assert.equal(built.result.userCard.nodes.every((node)=>node.knowledgeState==="UNKNOWN"),true);
  assert.equal(built.result.userCard.nodes.every((node)=>node.momentFeedbackEvidence.independentSessions===1),true);
  assert.equal(built.result.userCard.nodes.some((node)=>JSON.stringify(node).includes("childAge")||node.concept.includes("age")),false);
  const changedN4=buildUserIntelligenceReadOnly({userId:"user-1",source:source([event],{[event.spotId]:{placeType:"bar",concepts:{"vibe.cozy":{confidence:1}}}})});
  assert.equal(built.result.userCard.userCardHash,changedN4.result.userCard.userCardHash);
});

test("old unpinned feedback fails closed instead of borrowing current Spot truth",()=>{
  const event=baseEvent();
  const built=buildCanonicalRuntimeInputWithDispositions(source([event],{[event.spotId]:{placeType:"bar",concepts:{"vibe.cozy":{confidence:1}}}}));
  assert.deepEqual(built.events,[]);
  assert.equal(built.dispositions[0].processingDisposition,"UNPINNED_HISTORICAL_FAIL_CLOSED");
  assert.equal(built.dispositions[0].evidenceCount,0);
});

test("one pinned Passt remains one correlated outcome across concept scopes",()=>{
  const event=baseEvent({evidenceEnvelope:{sourceKind:"DECISION_PACKAGE",momentSignature:{audience:"friends",daypart:"evening"},requestedContext:{},ambientContext:{observedDaypart:"morning"},n4SnapshotHash:"e".repeat(64),n4Availability:"FULL",placeType:"bar",tasteConcepts:[{concept:"vibe.cozy",confidence:.8},{concept:"vibe.social",confidence:.8}],attributionDisposition:"PINNED_DECISION_EVIDENCE",envelopeHash:"f".repeat(64)}});
  const built=buildCanonicalRuntimeInputWithDispositions(source([event]));
  assert.equal(built.events.length,1);
  assert.equal(built.events[0].id,event.id);
  assert.equal(built.events[0].sessionId,event.sessionId);
  assert.equal(new Set(built.events.map((row)=>row.sessionId)).size,1);
});
