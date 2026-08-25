import assert from "node:assert/strict";
import test from "node:test";
import { buildUserIntelligenceReadOnly } from "../src/worker.mjs";

const USER="11111111-1111-4111-8111-111111111111";
const SPOT="22222222-2222-4222-8222-222222222222";
const concepts=["vibe.cozy","vibe.social","vibe.authentic"];
const event=(id,session,occurredAt="2026-08-25T09:10:37.000Z")=>({
  id,idempotencyKey:id,userId:USER,eventType:"exact_mood_feedback",contractVersion:"backyrd-memory-event-contract-v1",
  occurredAt,observedAt:occurredAt,ingestedAt:occurredAt,decisionId:session,sessionId:session,spotId:SPOT,
  momentSignature:{audience:"friends",daypart:"evening"},spotEvidence:{},
  evidenceEnvelope:{sourceKind:"DECISION_PACKAGE",momentSignature:{audience:"friends",daypart:"evening"},requestedContext:{concepts:["vibe.cozy","vibe.social"],socialContext:"friends",requestedDayparts:["evening"],city:"basel"},ambientContext:{observedDaypart:"morning"},n4SnapshotHash:"a".repeat(64),n4SnapshotIdentity:`n4:${session}`,n4Availability:"FULL",placeType:"bar",tasteConcepts:concepts.map((concept)=>({concept,confidence:.95})),attributionDisposition:"PINNED_DECISION_EVIDENCE",semanticContractVersion:"backyrd-canonical-semantics-v1",envelopeHash:"b".repeat(64)},
  provenance:{source:"product_memory_bridge",sourceEventId:`product_action:${id}`,sourceVersion:"v1"},consentPurpose:"personalized_recommendations",consentState:"granted",
});
const declared={id:"declared:cozy",idempotencyKey:"declared:cozy",userId:USER,eventType:"onboarding_preference",contractVersion:"backyrd-memory-event-contract-v1",occurredAt:"2026-08-24T09:00:00.000Z",observedAt:"2026-08-24T09:00:00.000Z",ingestedAt:"2026-08-24T09:00:00.000Z",decisionId:null,sessionId:"declared:onboarding",spotId:SPOT,momentSignature:{},spotEvidence:{concepts:["vibe.cozy"]},provenance:{source:"SELF_DECLARED",sourceEventId:"declared:cozy",sourceVersion:"backyrd-canonical-semantics-v1"},consentPurpose:"personalized_recommendations",consentState:"granted"};
const source=(events)=>({consentGranted:true,memoryEvents:events,reviewsById:{},n4BySpot:{},asOf:"2026-08-27T00:00:00.000Z",watermark:"2026-08-26T10:00:00.000Z"});
const refs=(node)=>new Set([...(node.evidenceRefs??[]).map((ref)=>typeof ref==="string"?ref:ref.eventId),...(node.momentFeedbackEvidence?.eventIds??[])]);

test("one pinned Passt reaches bounded Unified Card nodes as one independent outcome",()=>{
  const id="33333333-3333-4333-8333-333333333333",session="44444444-4444-4444-8444-444444444444";
  const output=buildUserIntelligenceReadOnly({userId:USER,source:source([event(id,session)])});
  const contributed=output.result.userCard.nodes.filter((node)=>refs(node).has(id));
  assert.equal(contributed.length,concepts.length*4);
  assert.ok(contributed.every((node)=>node.knowledgeState==="UNKNOWN"&&node.polarity==="UNKNOWN"));
  assert.ok(contributed.every((node)=>node.evidenceDepth.independentSessions===1));
  assert.equal(output.result.outcomeObservations.length,0,"moment fit must not fabricate Comparative evidence");
  assert.equal(output.result.userCard.behavioralEvidence.counts.satisfaction,0);
  assert.equal(output.dispositions[0].processingDisposition,"FUSION_CONSUMED_BOUNDED");
  assert.equal(output.dispositions[0].cardContributionCount,concepts.length*4);
  assert.equal(output.dispositions[0].activeNodeContributionCount,0);
});

test("SELF_DECLARED and one Passt fuse through the frozen bounded evidence formula",()=>{
  const id="55555555-5555-4555-8555-555555555555",session="66666666-6666-4666-8666-666666666666";
  const declaredOnly=buildUserIntelligenceReadOnly({userId:USER,source:source([declared])});
  const combined=buildUserIntelligenceReadOnly({userId:USER,source:source([declared,event(id,session)])});
  const key="GLOBAL:global:vibe.cozy",before=declaredOnly.result.userCard.nodes.find((node)=>node.nodeKey===key),after=combined.result.userCard.nodes.find((node)=>node.nodeKey===key);
  assert.ok(before&&after);
  assert.ok(after.confidence>before.confidence);
  assert.equal(after.knowledgeState,"UNKNOWN");
  assert.equal(after.evidenceComposition.declared,1);
  assert.equal(after.evidenceComposition.explicit,1);
  assert.equal(after.evidenceAuthorities.momentFit,1);
});

test("a second Passt is two independent sessions, never concept-by-scope multiplication",()=>{
  const first=event("77777777-7777-4777-8777-777777777777","88888888-8888-4888-8888-888888888888");
  const second=event("99999999-9999-4999-8999-999999999999","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","2026-08-26T09:10:37.000Z");
  const output=buildUserIntelligenceReadOnly({userId:USER,source:source([first,second])});
  const cozy=output.result.userCard.nodes.filter((node)=>node.concept==="vibe.cozy");
  assert.equal(cozy.length,4);
  assert.ok(cozy.every((node)=>node.evidenceDepth.independentSessions===2));
  assert.ok(cozy.every((node)=>!['POSITIVE','NEGATIVE'].includes(node.knowledgeState)));
});

test("a later independent negative review follows frozen conflict handling without a positive ratchet",()=>{
  const passt=event("dddddddd-dddd-4ddd-8ddd-dddddddddddd","eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  const visit={...event("ffffffff-ffff-4fff-8fff-ffffffffffff","12121212-1212-4212-8212-121212121212","2026-08-26T09:10:37.000Z"),eventType:"verified_visit",reviewId:"review-negative"};
  const input=source([passt,visit]);input.reviewsById={"review-negative":{text:"Ungemütlich und schlecht, komme nicht wieder.",moods:[],semanticContractVersion:"backyrd-canonical-semantics-v1",spotBinding:{status:"CONFIRMED",confidence:.9}}};
  const output=buildUserIntelligenceReadOnly({userId:USER,source:input});
  const cozy=output.result.userCard.nodes.find((node)=>node.nodeKey==="GLOBAL:global:vibe.cozy");
  assert.ok(cozy);
  assert.ok(cozy.affinity<0);
  assert.notEqual(cozy.knowledgeState,"POSITIVE");
  assert.ok(cozy.contradictions.some((row)=>row.kind==="DIRECT_AND_BOUNDED_MOMENT_CONFLICT"));
});

test("unpinned Passt remains fail closed and cannot enter Unified Fusion",()=>{
  const row=event("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","cccccccc-cccc-4ccc-8ccc-cccccccccccc");delete row.evidenceEnvelope;
  const output=buildUserIntelligenceReadOnly({userId:USER,source:source([declared,row])});
  assert.ok(output.result.userCard.nodes.length>0);
  assert.ok(output.result.userCard.nodes.every((node)=>!refs(node).has(row.id)));
  assert.equal(output.dispositions.find((item)=>item.eventId===row.id).processingDisposition,"UNPINNED_HISTORICAL_FAIL_CLOSED");
});
