import assert from "node:assert/strict";
import test from "node:test";
import { absoluteNegativityEligibility as referenceEligibility } from "../../../decision-lab/src/n5-8-4-absolute-negativity-guard.mjs";
import { highEligibilityFor as referenceHigh } from "../../../decision-lab/src/n5-8-2-epistemic-high-guard.mjs";
import { absoluteNegativityEligibility, buildCanonicalRuntimeInput, highEligibilityFor } from "../src/index.mjs";

test("shared production runtime invokes the frozen N5.8.4 implementation", () => {
  const node = { nodeKey: "GLOBAL:global:vibe.lively", polarity: "NEGATIVE", affinity: -.3, comparativeEvidence: { discrimination: -.3, presentPositive: 6, presentNegative: 4 } };
  assert.deepEqual(absoluteNegativityEligibility(node), referenceEligibility(node));
  assert.equal(absoluteNegativityEligibility(node).eligible, false);
});

test("shared production runtime invokes the frozen N5.8.2 implementation", () => {
  const node = { nodeKey: "GLOBAL:global:vibe.cozy", concept: "vibe.cozy", scope: { kind: "GLOBAL", key: "global" }, polarity: "POSITIVE", knowledgeState: "POSITIVE", affinity: .6, confidence: .85, comparativeEvidence: { scopeDiversity: 2, presentPositive: 3, presentNegative: 0 } };
  assert.deepEqual(highEligibilityFor(node), referenceHigh(node));
  assert.equal(highEligibilityFor(node).eligible, false);
});

test("production input adapter preserves visit and derives satisfaction only from a bound explicit review", () => {
  const memory = { id: "visit-1", idempotencyKey: "visit-1", userId: "user", eventType: "verified_visit", contractVersion: "n2", occurredAt: "2026-01-01T10:00:00.000Z", observedAt: "2026-01-01T10:00:00.000Z", ingestedAt: "2026-01-01T10:00:00.000Z", sessionId: "s", spotId: "spot", reviewId: "review", momentSignature: {}, evidenceEnvelope:{n4Availability:"FULL",placeType:"bar",tasteConcepts:[{concept:"vibe.cozy",confidence:.9}],momentSignature:{},attributionDisposition:"PINNED_EVENT_TIME_N4"}, provenance: { source: "product" }, consentPurpose: "personalized_recommendations", consentState: "granted" };
  const rows = buildCanonicalRuntimeInput({ memoryEvents: [memory], reviewsById: { review: { text: "Super gemütlich, komme wieder.", moods: ["gemütlich"], spotBinding: { status: "CONFIRMED", confidence: .9 } } } });
  assert.deepEqual(rows.map((row) => row.eventType), ["verified_visit", "positive_post_visit"]);
  assert.equal(rows[0].id, "visit-1");
});

test("positive review without N4 or an explicit concept remains in N2 but is omitted from Taste input", () => {
  const memory={id:"visit-missing",idempotencyKey:"visit-missing",userId:"user",eventType:"verified_visit",contractVersion:"n2",occurredAt:"2026-01-01T10:00:00.000Z",observedAt:"2026-01-01T10:00:00.000Z",ingestedAt:"2026-01-01T10:00:00.000Z",sessionId:"s",spotId:"missing",reviewId:"r",momentSignature:{},provenance:{source:"product"},consentPurpose:"personalized_recommendations",consentState:"granted"};
  const input=buildCanonicalRuntimeInput({memoryEvents:[memory],reviewsById:{r:{text:"War gut.",moods:["unmapped"],spotBinding:{status:"CONFIRMED",confidence:.9}}},n4BySpot:{}});
  assert.deepEqual(input.map((event)=>event.eventType),[]);
});

test("current N4 is never consulted for an unpinned historical event",()=>{
 const memory={id:"feedback",idempotencyKey:"feedback",userId:"user",eventType:"exact_mood_feedback",contractVersion:"backyrd-memory-event-contract-v1",occurredAt:"2026-01-01T10:00:00.000Z",observedAt:"2026-01-01T10:00:00.000Z",ingestedAt:"2026-01-01T10:00:00.000Z",decisionId:"decision",sessionId:"decision",spotId:"spot",momentSignature:{audience:"family"},spotEvidence:{concepts:[]},provenance:{source:"product_memory_bridge",sourceEventId:"feedback",sourceVersion:"v1"},consentPurpose:"personalized_recommendations",consentState:"granted"};
 const input=buildCanonicalRuntimeInput({memoryEvents:[memory],n4BySpot:{spot:{placeType:"culture",concepts:{"occasion.kids_friendly":{confidence:.9},"planning.low_friction":{confidence:.8},"vibe.inspiring":{confidence:.9},"environment.indoor":{confidence:.9}}}}});
 assert.deepEqual(input,[]);
});
