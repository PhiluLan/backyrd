import assert from "node:assert/strict";
import test from "node:test";
import { createInactiveFounderLiveEdgeAdapter } from "./runtime-boundary.mjs";

const origin = "https://founder.example.test";
const handler = createInactiveFounderLiveEdgeAdapter({
  BACKYRD_FOUNDER_LIVE_CORS_ORIGINS: origin,
  BACKYRD_FOUNDER_LIVE_RUNTIME_AUTHORITY: "forged",
  BACKYRD_FOUNDER_LIVE_TEST_EVALUATION_ENABLED: "true",
  BACKYRD_FOUNDER_LIVE_TEST_KILL_SWITCH: "DISENGAGED_FOR_TEST_EVALUATION",
});

test("CORS preflight is exact and does not open runtime execution", async () => {
  const accepted = await handler(new Request("https://edge.test/decision-founder-live", { method: "OPTIONS", headers: { origin } }));
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("access-control-allow-origin"), origin);
  const denied = await handler(new Request("https://edge.test/decision-founder-live", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("forged runtime flags bearer tokens and payloads cannot activate the host", async () => {
  let bodyReads = 0;
  const request = {
    method: "POST",
    headers: new Headers({ origin, authorization: "Bearer forged.jwt.value", "content-type": "application/json", "x-backyrd-runtime-authority": "forged" }),
    async text() { bodyReads += 1; return '{"request":"forged"}'; },
  };
  const result = await handler(request);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.code, "RUNTIME_AUTHORITY_NOT_AUTHORIZED");
  assert.equal(bodyReads, 0);
});

test("non-POST methods remain closed and responses expose no secrets", async () => {
  const result = await handler(new Request("https://edge.test/decision-founder-live", { method: "GET", headers: { origin } }));
  assert.equal(result.status, 405);
  const body = await result.text();
  assert.equal(/token|secret|service_role|uuid/i.test(body), false);
  assert.equal(result.headers.get("cache-control"), "no-store");
});
