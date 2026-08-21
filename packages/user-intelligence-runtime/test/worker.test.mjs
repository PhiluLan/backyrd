import assert from "node:assert/strict";
import test from "node:test";
import { rebuildUserIntelligence } from "../src/worker.mjs";
import { N2_VERSIONS } from "../../../decision-lab/src/n2-memory-user-intelligence.mjs";

test("worker persists only a complete shared-runtime result", async () => {
  let persisted = null;
  const event = { id:"e", idempotencyKey:"e", userId:"u", eventType:"verified_visit", contractVersion:N2_VERSIONS.memoryEventContract, occurredAt:"2026-01-01T00:00:00.000Z", observedAt:"2026-01-01T00:00:00.000Z", ingestedAt:"2026-01-01T00:00:00.000Z", sessionId:"s", spotId:"a", reviewId:"r", momentSignature:{audience:"solo"}, provenance:{source:"product",sourceEventId:"e",sourceVersion:"v1"}, consentPurpose:"personalized_recommendations", consentState:"granted" };
  const repository = { readCanonicalSources: async () => ({ consentGranted:true, memoryEvents:[event], reviewsById:{r:{text:"Super gemütlich, komme wieder.",moods:["gemütlich"],spotBinding:{status:"CONFIRMED",confidence:.9}}},n4BySpot:{a:{placeType:"bar",concepts:{"vibe.cozy":{confidence:.9}}}},asOf:"2026-02-01T00:00:00.000Z",watermark:"w" }), readLatestCard:async()=>null, persistAtomically: async (value) => { persisted=value; return { snapshotHash:value.card.userCardHash }; } };
  await rebuildUserIntelligence({ userId:"u", repository });
  assert.equal(persisted.userId,"u"); assert.ok(persisted.card.userCardHash); assert.ok(Array.isArray(persisted.nodes));
});
