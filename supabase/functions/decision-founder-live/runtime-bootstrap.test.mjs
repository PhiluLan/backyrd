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

test("the host delegates only to a process-supplied authorized runtime and preserves the read-only boundary", async () => {
  const stages = [];
  const runtime = Object.freeze({
    contractVersion: "backyrd.decision-vnext.founder-live-authorized-edge-runtime@1.0",
    async handle(request) {
      stages.push("AUTHORIZED_RUNTIME");
      assert.equal(request.headers.get("authorization"), "Bearer verified-session");
      assert.deepEqual(await request.json(), { query: "Café in Basel" });
      return new Response(JSON.stringify({ status: "EVALUATION_ONLY" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const authorized = createFounderLiveRuntimeBootstrapAdapter({ BACKYRD_FOUNDER_LIVE_CORS_ORIGINS: origin }, async () => runtime);
  const response = await authorized(new Request("https://edge.test/decision-founder-live", { method: "POST", headers: { origin, authorization: "Bearer verified-session", "content-type": "application/json" }, body: JSON.stringify({ query: "Café in Basel" }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "EVALUATION_ONLY" });
  assert.deepEqual(stages, ["AUTHORIZED_RUNTIME"]);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("invalid or rejected runtime loading fails before the request body reaches a runtime", async () => {
  for (const loader of [async () => ({ handle: async () => new Response("forbidden") }), async () => { throw new Error("secret-detail"); }]) {
    const response = await createFounderLiveRuntimeBootstrapAdapter({}, loader)(new Request("https://edge.test/decision-founder-live", { method: "POST", body: "private-body" }));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private-body|secret-detail|forbidden/);
  }
});
