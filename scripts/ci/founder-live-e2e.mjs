#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { chromium } from "@playwright/test";
import { DECISION_PRODUCT_CONTRACT, validateDecisionProductRequest } from "../../mobile/packages/founder-live-control-plane/src/index.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const auth = "synthetic-founder-admin-0001";
const state = { version: "world-v0001", spots: [{ id: "spot-casa", name: "Casa vorher" }], saves: 0, rebuilds: 0, manualFileHandoffs: 0, userLearningWrites: 0 };
const json = (response, status, body) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(body)); };
const html = (response, body) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" }); response.end(body); };
const shell = (title, body, script) => `<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#08080a;color:#fff;font:16px system-ui}main{width:min(100%,720px);margin:auto;padding:24px}input,button{width:100%;min-height:48px;margin:8px 0;border-radius:14px;padding:12px}button{background:#ff4f91;color:#111;font-weight:700}.card{border:1px solid #555;border-radius:18px;padding:18px;overflow-wrap:anywhere}</style><main><h1>${title}</h1>${body}</main><script>${script}</script></html>`;

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/admin") return html(response, shell("World Authoring", '<label>Spot name<input id="name" value="Casa aktualisiert"></label><button id="save">Speichern & neu aufbauen</button><p id="status" role="status"></p>', `document.querySelector('#save').onclick=async()=>{const result=await fetch('/api/admin/save',{method:'POST',headers:{'content-type':'application/json','x-local-auth':'${auth}'},body:JSON.stringify({name:document.querySelector('#name').value})});const body=await result.json();document.querySelector('#status').textContent=body.ok?'Gespeichert · '+body.worldVersion:'Nicht gespeichert'};`));
  if (request.method === "GET" && request.url === "/mobile") return html(response, shell("Für jetzt", '<p>Was passt zu deinem Moment?</p><button id="decide">Vorschläge laden</button><section id="results" aria-live="polite"></section>', `document.querySelector('#decide').onclick=async()=>{const result=await fetch('/api/decision',{method:'POST',headers:{'content-type':'application/json','x-local-auth':'${auth}'},body:JSON.stringify({contractVersion:'${DECISION_PRODUCT_CONTRACT.request}',requestId:'product-e2e-request-0001',idempotencyKey:'product-e2e-idempotency-0001',naturalLanguage:'ruhiges Café in Bern',explicit:{primaryIntent:'coffee',moods:['quiet'],targetCity:'Bern',hardConstraints:[],softPreferences:[]},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]})});const body=await result.json();document.querySelector('#results').innerHTML=body.candidates.map(item=>'<article class="card"><h2>'+item.presentation.name+'</h2><p>'+item.reasons[0].statement+'</p><button>Alternative</button><button>Nicht passend</button></article>').join('');};`));
  if (request.method === "POST" && request.url === "/api/admin/save") {
    if (request.headers["x-local-auth"] !== auth) return json(response, 403, { ok: false });
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); assert.equal(typeof body.name, "string");
    state.spots = [{ id: "spot-casa", name: body.name.trim() }]; state.saves += 1; state.rebuilds += 1; state.version = `world-v${String(state.rebuilds + 1).padStart(4, "0")}`;
    return json(response, 200, { ok: true, worldVersion: state.version });
  }
  if (request.method === "POST" && request.url === "/api/decision") {
    if (request.headers["x-local-auth"] !== auth) return json(response, 403, { ok: false });
    let raw = ""; for await (const chunk of request) raw += chunk;
    const productRequest = validateDecisionProductRequest(JSON.parse(raw));
    const spot = state.spots[0];
    const sourceHash = hash({ worldVersion: state.version, spot });
    const candidate = {
      spotId: spot.id,
      presentation: { contractVersion: "backyrd.decision-vnext.product-presentation@1.0", spotId: spot.id, name: spot.name, locality: "Bern", categoryLabel: "Café", imageUrl: null, sourceHash, presentationHash: hash({ spot, sourceHash }) },
      tier: "ELIGIBLE_CONFIRMED", rank: 1, coreIntentCoverage: "CONFIRMED", actualAvailability: "open",
      confirmedHardConstraints: [], unknownHardConstraints: [], failedHardConstraints: [], rankVector: { vectorHash: hash({ rank: 1 }) },
      reasons: [{ code: "world-version", domain: "WORLD", sourceHash, statement: `World-Version ${state.version}`, confirmed: true }],
      limitations: [], contextualReject: false, candidateHash: hash({ spotId: spot.id, sourceHash }),
    };
    return json(response, 200, {
      contractVersion: DECISION_PRODUCT_CONTRACT.response, status: "AVAILABLE", decisionId: "decision-e2e-0001",
      requestHash: hash(productRequest), envelopeHash: hash({ productRequest, sourceHash }), rankingPolicyVersion: "backyrd.decision-vnext.product-ranking-policy@1.0", rankingPolicyHash: hash("ranking-policy"),
      interpretation: { interpretationHash: hash(productRequest.explicit), targetCity: "Bern" }, primaryCandidateId: spot.id, candidates: [candidate], limitations: [],
      alternative: { requested: false, selectedCandidateId: null, negativeSignalProduced: false }, reject: { candidateIds: [], contextualOnly: true, worldFactProduced: false },
      personalization: { state: "NEUTRAL", neutralReason: "LOCAL_TEST", projectionHash: hash("neutral") }, learning: { mode: "DISABLED_NEUTRAL", acknowledgement: "NOT_APPLICABLE_NEUTRAL", eventCount: 0, rawTextIncluded: false },
      productOutputAuthorized: true, legacyEngineUsed: false, fallbackUsed: false, resultHash: hash({ candidate, sourceHash }),
    });
  }
  return json(response, 404, { ok: false });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address(); const url = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
let assertions = 0;
try {
  const admin = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await admin.goto(`${url}/admin`); await admin.locator("#save").click(); await admin.locator("#status").getByText(/Gespeichert/).waitFor(); assertions += 1;
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
    const mobile = await browser.newPage({ viewport }); await mobile.goto(`${url}/mobile`); await mobile.locator("#decide").click();
    await mobile.getByRole("heading", { name: "Casa aktualisiert" }).waitFor();
    assert.equal(await mobile.getByText(/World-Version world-v0002/).count(), 1); assertions += 1;
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.equal(overflow, 0); assertions += 1;
    assert.equal(await mobile.getByRole("button", { name: "Alternative" }).count(), 1); assert.equal(await mobile.getByRole("button", { name: "Nicht passend" }).count(), 1); assertions += 2;
    await mobile.close();
  }
  assert.deepEqual({ saves: state.saves, rebuilds: state.rebuilds, manualFileHandoffs: state.manualFileHandoffs, userLearningWrites: state.userLearningWrites }, { saves: 1, rebuilds: 1, manualFileHandoffs: 0, userLearningWrites: 0 }); assertions += 1;
  process.stdout.write(`${JSON.stringify({ suite: "product-single-route-admin-reader-mobile-e2e", status: "PASS", assertions, localAuthFixture: true, adminBrowser: true, mobileViewports: ["320x568", "1440x900"], worldVersion: state.version, manualFileHandoffs: 0, userLearningWrites: 0, productionActions: 0 })}\n`);
} finally {
  await browser.close(); await new Promise((resolve) => server.close(resolve));
}
