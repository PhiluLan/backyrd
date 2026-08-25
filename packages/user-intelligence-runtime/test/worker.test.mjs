import assert from "node:assert/strict";
import test from "node:test";
import { rebuildUserIntelligence } from "../src/worker.mjs";
import { N2_VERSIONS } from "../../../decision-lab/src/n2-memory-user-intelligence.mjs";

test("worker persists only a complete shared-runtime result", async () => {
  let persisted = null;
  const event = { id:"e", idempotencyKey:"e", userId:"u", eventType:"verified_visit", contractVersion:N2_VERSIONS.memoryEventContract, occurredAt:"2026-01-01T00:00:00.000Z", observedAt:"2026-01-01T00:00:00.000Z", ingestedAt:"2026-01-01T00:00:00.000Z", sessionId:"s", spotId:"a", reviewId:"r", momentSignature:{audience:"solo"}, evidenceEnvelope:{n4Availability:"FULL",placeType:"bar",tasteConcepts:[{concept:"vibe.cozy",confidence:.9}],momentSignature:{audience:"solo"},attributionDisposition:"PINNED_EVENT_TIME_N4"}, provenance:{source:"product",sourceEventId:"e",sourceVersion:"v1"}, consentPurpose:"personalized_recommendations", consentState:"granted" };
  const repository = { readCanonicalSources: async () => ({ consentGranted:true, memoryEvents:[event], reviewsById:{r:{text:"Super gemütlich, komme wieder.",moods:["gemütlich"],spotBinding:{status:"CONFIRMED",confidence:.9}}},n4BySpot:{a:{placeType:"bar",concepts:{"vibe.cozy":{confidence:.9}}}},asOf:"2026-02-01T00:00:00.000Z",watermark:"w" }), readLatestCard:async()=>null, persistAtomically: async (value) => { persisted=value; return { snapshotHash:value.card.userCardHash }; } };
  await rebuildUserIntelligence({ userId:"u", repository });
  assert.equal(persisted.userId,"u"); assert.ok(persisted.card.userCardHash); assert.ok(Array.isArray(persisted.nodes));
});

test("self-declared evidence stays a weak declared authority in the User Card",async()=>{
 let persisted;
 const event={id:"declared:1",idempotencyKey:"declared:1",userId:"u",eventType:"onboarding_preference",contractVersion:N2_VERSIONS.memoryEventContract,occurredAt:"2026-01-01T00:00:00.000Z",observedAt:"2026-01-01T00:00:00.000Z",ingestedAt:"2026-01-01T00:00:00.000Z",sessionId:"declared:onboarding",spotId:"a",momentSignature:{},spotEvidence:{concepts:["vibe.cozy"]},provenance:{source:"SELF_DECLARED",sourceEventId:"1",sourceVersion:"backyrd-canonical-semantics-v1"},consentPurpose:"personalized_recommendations",consentState:"granted"};
 const repository={readCanonicalSources:async()=>({consentGranted:true,memoryEvents:[event],reviewsById:{},n4BySpot:{a:{placeType:"cafe",concepts:{"vibe.cozy":{confidence:.9}}}},asOf:"2026-02-01T00:00:00.000Z",watermark:"w"}),readLatestCard:async()=>null,persistAtomically:async(value)=>{persisted=value;return{snapshotHash:value.card.userCardHash};}};
 await rebuildUserIntelligence({userId:"u",repository});
 const node=persisted.nodes.find((row)=>row.concept==="vibe.cozy");assert.ok(node);assert.equal(node.evidenceComposition.declared,1);assert.notEqual(node.knowledgeState,"POSITIVE");
});
