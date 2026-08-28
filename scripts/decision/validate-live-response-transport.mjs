import assert from "node:assert/strict";
import { jsonResponseWithFreshEntityHeaders } from "../../supabase/functions/decision-v13/live-response.mjs";

const canonical = new Response('{"ok":true}', {
  status: 200,
  headers: {
    "content-type": "application/json",
    "content-length": "11",
    "content-encoding": "gzip",
    etag: '"canonical-body"',
    "x-request-id": "request-1",
  },
});

const payload = {
  ok: true,
  candidates: [{ spot_id: "spot-1" }, { spot_id: "spot-2" }],
  north_star: { active: true, decision_id: "decision-1" },
};
const response = jsonResponseWithFreshEntityHeaders(payload, canonical);

assert.equal(response.status, 200);
assert.equal(response.headers.get("content-length"), null);
assert.equal(response.headers.get("content-encoding"), null);
assert.equal(response.headers.get("etag"), null);
assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
assert.equal(response.headers.get("x-request-id"), "request-1");
assert.deepEqual(await response.json(), payload);

console.log("LIVE DECISION RESPONSE TRANSPORT — PASS");
