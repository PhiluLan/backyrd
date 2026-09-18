import assert from "node:assert/strict";
import test from "node:test";
import { createFounderLiveRuntimeBootstrapAdapter } from "./runtime-bootstrap.mjs";

const origin = "http://127.0.0.1:3210";
const handler = createFounderLiveRuntimeBootstrapAdapter({
  BACKYRD_FOUNDER_LIVE_CORS_ORIGINS: origin,
  BACKYRD_FOUNDER_LIVE_RUNTIME_ENABLED: "true",
  BACKYRD_FOUNDER_LIVE_KILL_SWITCH: "DISENGAGED",
  BACKYRD_FOUNDER_LIVE_RUNTIME_AUTHORITY: JSON.stringify({ productionAuthorized: true }),
});
test("bootstrap source remains OFF even when environment, headers and body claim authority", async () => {
  const result = await handler(new Request("https://edge.test/decision-founder-live", {
    method: "POST", headers: { origin, authorization: "Bearer forged", "content-type": "application/json", "x-backyrd-runtime-authority": "forged" },
    body: JSON.stringify({ productionAuthorized: true, runtimeActivated: true, killSwitch: "OFF", userId: "forged" }),
  }));
  assert.equal(result.status, 503);
  const body = await result.json(); assert.equal(body.error.code, "RUNTIME_TRUST_ROOT_NOT_PROVISIONED");
  assert.doesNotMatch(JSON.stringify(body), /forged|Bearer|userId/);
});

test("CORS and method checks remain fail closed", async () => {
  assert.equal((await handler(new Request("https://edge.test/decision-founder-live", { method: "OPTIONS", headers: { origin } }))).status, 204);
  assert.equal((await handler(new Request("https://edge.test/decision-founder-live", { method: "OPTIONS", headers: { origin: "https://evil.invalid" } }))).status, 403);
  assert.equal((await handler(new Request("https://edge.test/decision-founder-live", { method: "GET", headers: { origin } }))).status, 405);
});

test("missing configuration never causes a thrown configuration value or secret echo", async () => {
  const closed = createFounderLiveRuntimeBootstrapAdapter({});
  const response = await closed(new Request("https://edge.test/decision-founder-live", { method: "POST", body: "secret-payload" }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret-payload|undefined|null/);
});
