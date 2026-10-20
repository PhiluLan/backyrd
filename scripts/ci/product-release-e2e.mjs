#!/usr/bin/env node
// Browser journey through the exported, existing Expo app. All remote requests
// are intercepted with synthetic fixtures; this never contacts Production.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, lstatSync, mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { DECISION_PRODUCT_CONTRACT, validateDecisionProductRequest } from "../../mobile/packages/product-decision-contract/src/index.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const suppliedBundle = process.env.BACKYRD_PRODUCT_MOBILE_BUNDLE;
const output = suppliedBundle ? resolve(suppliedBundle) : mkdtempSync(join(tmpdir(), "backyrd-product-mobile-"));
const endpoint = "https://example.invalid";
const publicKey = "ci-public-placeholder-key-000000000000";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2" };

if (!suppliedBundle) {
  execFileSync("npx", ["expo", "export", "--platform", "web", "--output-dir", output], {
    cwd: resolve(root, "mobile"),
    env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: endpoint, EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 100 * 1024 * 1024,
  });
}
if (!existsSync(resolve(output, "index.html"))) throw new Error("product_mobile_bundle_missing");

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const requested = resolve(output, `.${pathname}`);
  const file = requested.startsWith(output) && existsSync(requested) && lstatSync(requested).isFile() ? requested : resolve(output, "index.html");
  response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const address = server.address();
if (!address || typeof address === "string") throw new Error("mobile_server_unavailable");

const subject = randomUUID();
const now = Math.floor(Date.now() / 1000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: subject, exp: now + 3600, role: "authenticated", aud: "authenticated" })}.synthetic-only`;
const user = { id: subject, aud: "authenticated", role: "authenticated", is_anonymous: false, user_metadata: {}, app_metadata: {}, created_at: new Date(now * 1000).toISOString() };
const session = { access_token: token, refresh_token: "synthetic-refresh", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user };
const state = { consent: false, unavailable: false, allowSyntheticMoment: false, worldName: "Café Vorher", worldVersion: 1, decisions: [], interactions: [], unexpectedRemote: [] };
const spots = [
  { spotId: "spot-cafe-one", name: () => state.worldName, rank: 1 },
  { spotId: "spot-cafe-two", name: () => "Café Alternative", rank: 2 },
  { spotId: "spot-cafe-three", name: () => "Café Dritte Wahl", rank: 3 },
  { spotId: "spot-cafe-four", name: () => "Café Vierte Wahl", rank: 4 },
  { spotId: "spot-cafe-five", name: () => "Café Fünfte Wahl", rank: 5 },
];
const candidate = (spot) => {
  const sourceHash = hash({ spotId: spot.spotId, worldVersion: state.worldVersion });
  return {
    spotId: spot.spotId,
    presentation: { contractVersion: "backyrd.decision-vnext.product-presentation@1.0", spotId: spot.spotId, name: spot.name(), locality: "Bern", categoryLabel: "Café", imageUrl: null, sourceHash, presentationHash: hash({ spotId: spot.spotId, sourceHash }) },
    tier: "ELIGIBLE_CONFIRMED", rank: spot.rank, coreIntentCoverage: "CONFIRMED", actualAvailability: "open",
    confirmedHardConstraints: [], unknownHardConstraints: [], failedHardConstraints: [], rankVector: { hardConstraintState: "PASS", userRelevance: { state: "NEUTRAL" }, contextFit: { secondaryIntentConfirmed: false, visitSituationConfirmed: false, atmosphereConfirmed: false, typicalDaypartConfirmed: false, matchedSoftPreferenceCount: 0 }, worldEvidence: { confirmedReasonCount: 1 }, vectorHash: hash({ rank: spot.rank }) },
    reasons: [{ code: "core-intent-confirmed", domain: "WORLD", sourceHash, statement: `Bestätigter Café-Fit aus World-Version ${state.worldVersion}.`, confirmed: true }],
    limitations: [], contextualReject: false, candidateHash: hash({ spotId: spot.spotId, sourceHash }),
  };
};
const responseFor = (request) => {
  const available = spots.find((spot) => !request.previouslyPresentedCandidateIds.includes(spot.spotId)) ?? null;
  return {
    contractVersion: DECISION_PRODUCT_CONTRACT.response, status: "AVAILABLE", decisionId: `decision-${state.decisions.length}`,
    requestHash: hash(request), envelopeHash: hash({ request, worldVersion: state.worldVersion }),
    rankingPolicyVersion: "backyrd.decision-vnext.product-ranking-policy@1.0", rankingPolicyHash: hash("synthetic-policy"),
    interpretation: { interpretationHash: hash(request.explicit), targetCity: "Bern", primaryIntent: "COFFEE", dateTime: { localDate: "2026-09-20" } },
    primaryCandidateId: available?.spotId ?? null, candidates: spots.map(candidate), limitations: [],
    alternative: { requested: request.alternativeRequested, selectedCandidateId: request.alternativeRequested ? available?.spotId ?? null : null, negativeSignalProduced: false },
    reject: { candidateIds: request.rejectedCandidateIds, contextualOnly: true, worldFactProduced: false },
    personalization: { state: state.consent ? "ACTIVE" : "NEUTRAL", neutralReason: state.consent ? null : "NO_CONSENT", projectionHash: hash({ consent: state.consent }) },
    learning: { mode: state.consent ? "CONSENT_BOUND_EVENTS" : "DISABLED_NEUTRAL", acknowledgement: state.consent ? "CONSENT_BOUND_IDEMPOTENT" : "NOT_APPLICABLE_NEUTRAL", eventCount: state.consent ? 1 : 0, rawTextIncluded: false },
    productOutputAuthorized: true, legacyEngineUsed: false, fallbackUsed: false, resultHash: hash({ request, worldVersion: state.worldVersion }),
  };
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript((injected) => window.localStorage.setItem("sb-example-auth-token", JSON.stringify(injected)), session);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => process.stderr.write(`browser page error: ${error.message}\n`));
  let passwordLogins = 0;
  let fixturePhotoRequests = 0;
  let momentPublishes = 0;
  const remoteFixture = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (/\/rpc\/(reserve_review_media_upload_v2|finalize_review_with_media_v2|finalize_review_without_media_v1)$/.test(path)) {
      momentPublishes++;
      if (state.allowSyntheticMoment && path.endsWith("/finalize_review_without_media_v1")) {
        const body=JSON.parse(request.postData()??"{}");
        assert.equal(body.p_mood_a,"Gemütlich");
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body.p_review_id)});
      }
      return route.abort("blockedbyclient");
    }
    if (path === "/rest/v1/rpc/get_social_feed_v2") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{post_id:"moment-visible",user_id:subject,spot_id:"spot-cafe-one",spot_name:state.worldName,spot_city:"Bern",category_name:"Café",mood_tags:["Gemütlich","Ruhig"],caption:"Ein Kaffee am Fenster",created_at:new Date().toISOString(),media:[]},{post_id:"moment-hidden",user_id:subject,spot_id:"spot-cafe-two",spot_name:"Verborgener Ort",spot_city:"Bern",mood_tags:["Laut"],created_at:new Date().toISOString(),media:[]}])});
    if (path === "/rest/v1/rpc/safety_visible_social_post_ids_v1") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(["moment-visible"])});
    if (path === "/rest/v1/rpc/safety_visible_entity_ids_v1") {
      const body=JSON.parse(request.postData()??"{}");
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body.p_entity_type === "profile" ? [subject] : [])});
    }
    if (path === "/rest/v1/spots" && url.searchParams.get("select")?.includes("categories(name)")) {
      const ids = url.searchParams.get("id");
      const rows = spots.filter(spot => !ids || ids.includes(spot.spotId)).map((spot,index)=>({id:spot.spotId,name:spot.name(),city:"Bern",address:"Testgasse 1",lat:46.94,lng:7.44,status:"approved",created_at:new Date(Date.UTC(2026,0,index+1)).toISOString(),categories:{name:"Café"},spot_hours:[]}));
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(rows.reverse())});
    }
    if (path === "/rest/v1/spots" && url.searchParams.get("id")?.startsWith("eq.")) return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:url.searchParams.get("id").replace("eq.",""),name:state.worldName,address:"Testgasse 1",city:"Bern",lat:46.94,lng:7.44})});
    if (path === "/rest/v1/rpc/backyrd_search_mood_concepts_v1") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(["Gemütlich","Urban"].map(label=>({concept_key:label,label,matched_expression:label})))});
    if (path === "/rest/v1/rpc/distribution_trust_filter_entities_v1") {
      const body=JSON.parse(request.postData()??"{}");
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify((body.p_entity_ids??[]).map(entity_id=>({entity_id,eligible:true,distribution_priority:0})))});
    }
    if (path === "/rest/v1/spots" && url.searchParams.get("select") === "id,name,address,lat,lng,status") {
      assert.equal(url.searchParams.get("status"),"eq.approved");
      assert.equal(url.searchParams.get("limit"),"20");
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{id:"11111111-1111-4111-a111-111111111111",name:"Café Moment",address:"Testgasse 1",lat:46.94,lng:7.44,status:"approved"}])});
    }
    if (path === "/fixture-spot-photo.jpg") { fixturePhotoRequests++; return route.fulfill({status:200,contentType:"image/jpeg",path:resolve(root,"mobile/assets/headers/bern_day.jpg")}); }
    if (path === "/rest/v1/rpc/backyrd_web_canonical_spot_image_headers_v1") {
      const {p_spot_ids: ids} = JSON.parse(request.postData() ?? "{}");
      assert.ok(Array.isArray(ids) && ids.length <= 5, "covers are a bounded batch for visible candidates");
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(ids.map(id=>({spot_id:id,header_photo_path:id === spots[1].spotId ? `${endpoint}/fixture-spot-photo.jpg` : null})))});
    }
    if (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      passwordLogins += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
    }
    if (path === "/auth/v1/user") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    if (path.includes("/rest/v1/rpc/safety_user_enforcement_summary_v1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ active_points: 0, confirmed_violations: 0, active_measure_type: null, active_measure_ends_at: null, can_write: true, requires_account_review: false }]) });
    if (path.includes("/rest/v1/rpc/get_my_legal_gate_status_v1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ gate_required: false }]) });
    if (path.includes("/rest/v1/rpc/get_my_product_entry_status_v1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ loggedIn: true, userId: subject, profileBasicsComplete: true, tasteOnboardingComplete: true, personalizationConsentValid: true, canEnterDecision: true, needsProfileOnboarding: false, needsDecisionOnboarding: false, semanticContractVersion: "synthetic", nextRoute: "/(tabs)" }]) });
    if (path === "/rest/v1/profiles") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ city: "Bern" }]) });
    if (path === "/functions/v1/decision-v13") {
      assert.match(request.headers().authorization ?? "", /^Bearer\s+\S+$/);
      if (state.unavailable) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "DECISION_UNAVAILABLE" } }) });
      const body = JSON.parse(request.postData() ?? "{}");
      if (body.contractVersion === "backyrd.decision-vnext.product-interaction-request@1.0") {
        state.interactions.push(body);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: "backyrd.decision-vnext.product-interaction-response@1.0", status: "ACKNOWLEDGED", decisionId: body.decisionId, candidateId: body.candidateId, eventType: body.eventType, legacyWriteUsed: false, fallbackUsed: false }) });
      }
      const productRequest = validateDecisionProductRequest(body);
      state.decisions.push(productRequest);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseFor(productRequest)) });
    }
    if (path.startsWith("/rest/v1/")) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    state.unexpectedRemote.push(path);
    return route.abort("blockedbyclient");
  };
  await context.route(`${endpoint}/**`, remoteFixture);

  const appUrl = `http://127.0.0.1:${address.port}`;
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Was hast du heute vor?", exact: true }).waitFor({ timeout: 30000 }).catch(async (error) => {
    throw new Error(`Authenticated home did not appear at ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 1200)}`, { cause: error });
  });
  // The prominent Plus opens the draft directly; location refusal does not block manual entry.
  await page.getByRole("button",{name:"Moment mit Foto festhalten",exact:true}).click();
  await page.getByText("Dein Moment",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Gemütlich",exact:true}).click();
  await page.getByRole("button",{name:"Urban",exact:true}).click();
  await page.getByText("2/2",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Ort selbst wählen",exact:true}).click();
  await page.getByRole("textbox",{name:"Ort für deinen Moment suchen",exact:true}).fill("Café");
  await page.getByRole("button",{name:"Café Moment · Testgasse 1",exact:true}).click();
  await page.getByText("Café Moment",{exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Gemütlich entfernen",exact:true}).count(),1,"place choice preserves first Mood");
  assert.equal(await page.getByRole("button",{name:"Urban entfernen",exact:true}).count(),1,"place choice preserves second Mood");
  assert.equal(await page.getByRole("button",{name:"Moment teilen",exact:true}).isEnabled(),true);
  assert.equal(momentPublishes,0,"two Mood selections and place matching never publish automatically");
  await page.getByRole("button",{name:"Moment schließen",exact:true}).click();
  await page.getByRole("textbox",{name:"Was hast du heute vor?",exact:true}).waitFor();
  await page.getByText("Wohin", { exact: true }).last().click();
  await page.getByPlaceholder(/Sonntag gemütlich Kaffee trinken/).waitFor({ timeout: 30000 });
  await page.getByPlaceholder(/Sonntag gemütlich Kaffee trinken/).fill("Sonntag gemütlich Kaffee trinken");
  await page.getByText("Für Bern · Ort aus deinem Profil", { exact: true }).waitFor();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByTestId("wohin-result-card").filter({hasText:"Café Vorher"}).first().waitFor();
  await page.getByText("1 / 5", { exact: true }).waitFor();
  for (let attempt=0; attempt<40 && !state.interactions.some(row=>row.eventType === "candidate_impression"); attempt++) await page.waitForTimeout(100);
  assert.deepEqual([...new Set(state.interactions.filter(row => row.eventType === "candidate_impression").map(row => row.candidateId))], [spots[0].spotId], "offscreen pages must not record impressions");
  const cardBounds=await page.getByTestId("wohin-result-card").first().boundingBox();
  assert.ok(cardBounds && cardBounds.height>400 && cardBounds.y>40 && cardBounds.y+cardBounds.height<740,"one full-height card occupies the available viewport");
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/wohin-390.png` });
  for (let i=1;i<spots.length;i++) {
    await page.getByRole("button", {name:"Nächster Vorschlag",exact:true}).click();
    await page.getByText(`${i+1} / 5`, {exact:true}).waitFor();
    if (i === 1) assert.ok(fixturePhotoRequests>0,"the supplied cover image is requested through the canonical artwork component");
    if (i === 1 && process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) {
      await page.waitForTimeout(300);
      await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/wohin-photo-390.png`});
    }
    const bounds=await page.getByRole("button",{name:`${spots[i].name()} entdecken`,exact:true}).boundingBox();
    assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=390 && bounds.y+bounds.height<740,"current Spot action fits above tab navigation");
  }
  assert.equal(state.decisions.length,1,"browsing never invokes the model again");
  assert.equal(state.interactions.some(row=>row.eventType==="candidate_rejected"),false,"swiping is browsing, not rejection");
  for (let i=3;i>=0;i--) {
    await page.getByRole("button",{name:"Vorheriger Vorschlag",exact:true}).click();
    await page.getByText(`${i+1} / 5`,{exact:true}).waitFor();
  }
  await page.setViewportSize({width:320,height:568});
  await page.getByText("1 / 5",{exact:true}).waitFor();
  const compactAction=page.getByRole("button",{name:"Café Vorher entdecken",exact:true});
  await compactAction.waitFor();
  await page.waitForTimeout(300);
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/wohin-320.png`});
  const compactBounds=await compactAction.boundingBox();
  assert.ok(compactBounds && compactBounds.x>=0 && compactBounds.x+compactBounds.width<=320 && compactBounds.y+compactBounds.height<480,`small-screen action remains above tabs: ${JSON.stringify(compactBounds)}`);
  const compactName=await page.getByTestId("wohin-result-card").filter({hasText:"Café Vorher"}).getByText("Café Vorher",{exact:true}).boundingBox();
  const compactDetails=await page.getByText("Details & Hinweise",{exact:true}).first().boundingBox();
  assert.ok(compactName && compactDetails && compactName.y+compactName.height<=compactDetails.y,"Spot name and details action remain readable on small screens");
  assert.equal(await page.getByText("Eine passende Idee für das, was du gerade vorhast.",{exact:true}).filter({visible:true}).count(),0,"recommendation prose stays off the photo");
  // Real touch swipe, not a rejection action or another model call.
  const cdp=await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:270,y:170}]});
  await page.waitForTimeout(50);
  for(const x of [230,180,130,80,30]) { await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:170}]}); await page.waitForTimeout(50); }
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await page.getByText("2 / 5",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Vorheriger Vorschlag",exact:true}).click();
  await page.getByText("1 / 5",{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.getByText("Details & Hinweise",{exact:true}).first().click();
  await page.getByText("Auswahl ohne persönliche Vorlieben",{exact:true}).waitFor();
  await page.getByText("Eine passende Idee für das, was du gerade vorhast.",{exact:true}).filter({visible:true}).waitFor();
  await page.getByRole("button",{name:"Hinweise schließen",exact:true}).click();
  assert.equal(state.decisions[0].explicit.targetCity, "Bern");
  assert.equal(state.decisions[0].explicit.primaryIntent, undefined, "old guided intent must not leak into Wohin");
  assert.equal(state.decisions[0].alternativeRequested, false);
  await page.getByText("Eine passende Idee für das, was du gerade vorhast.", { exact: true }).filter({visible:true}).waitFor({state:"hidden"});
  assert.equal(await page.getByText(/World-Version 1/).count(), 0, "internal evidence stays out of the consumer UI");

  assert.equal(state.decisions.every((item) => item.contractVersion === DECISION_PRODUCT_CONTRACT.request), true);
  assert.equal(state.decisions.length, 1);

  // A recommendation keeps its grounded context only when opened from this search.
  await page.getByRole("button", {name:"Café Vorher entdecken",exact:true}).click();
  await page.getByText("FÜR DEINEN NÄCHSTEN MOMENT",{exact:true}).waitFor();
  await page.getByText("Eine passende Idee für das, was du gerade vorhast.",{exact:true}).filter({visible:true}).waitFor();
  await page.getByRole("button",{name:"Zurück zu deinen Vorschlägen",exact:true}).click();
  await page.getByText("1 / 5",{exact:true}).waitFor();

  state.consent = true;
  state.worldName = "Café Aktualisiert";
  state.worldVersion = 2;
  await page.getByRole("button",{name:"Suche ändern",exact:true}).click();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByTestId("wohin-result-card").filter({hasText:"Café Aktualisiert"}).first().waitFor();
  assert.equal(await page.getByText(/World-Version 2/).count(), 0);
  await page.getByText("Details & Hinweise",{exact:true}).first().click();
  await page.getByText("Nach deinen Vorlieben ausgewählt",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Hinweise schließen",exact:true}).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Was hast du heute vor?", exact: true }).waitFor();
  await page.getByText("Wohin", { exact: true }).last().click();
  await page.getByPlaceholder(/Sonntag gemütlich Kaffee trinken/).fill("ruhiges Café nach Reload");
  await page.getByText("Für Bern · Ort aus deinem Profil", { exact: true }).waitFor();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByTestId("wohin-result-card").filter({hasText:"Café Aktualisiert"}).first().waitFor();
  state.unavailable = true;
  const failureReport = page.waitForRequest(request => request.url().includes("/rpc/analytics_report_error_v1") && JSON.parse(request.postData() ?? "{}").p_error_type === "wohin_request_failed", {timeout:15000});
  await page.getByRole("button",{name:"Suche ändern",exact:true}).click();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByText(/Wohin kann gerade keine verlässlichen Vorschläge zeigen|Vorschläge nicht verfügbar/).waitFor();
  assert.equal(await page.getByTestId("wohin-result-card").count(), 0, "unavailable search never retains a recommendation card");
  const diagnostic = JSON.parse((await failureReport).postData());
  assert.equal(diagnostic.p_context.phase,"LOAD");
  assert.equal(diagnostic.p_context.http_status,503);
  assert.equal(diagnostic.p_message,"decision_transport_http_failure");
  assert.equal(JSON.stringify(diagnostic).includes("ruhiges Café nach Reload"),false,"handled diagnostics never send the search text");
  assert.equal(state.unexpectedRemote.length, 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0);

  state.unavailable = false;
  await page.goto(appUrl, {waitUntil:"domcontentloaded"});
  await page.getByText("Hier entstehen Momente",{exact:true}).waitFor();
  await page.getByRole("button",{name:/Moment bei Café Aktualisiert/}).waitFor();
  assert.equal(await page.getByText("Verborgener Ort",{exact:true}).count(),0,"Home never displays safety-hidden Moments");
  await page.getByText("ackyrd",{exact:true}).waitFor({state:"detached"});
  await page.getByText("DEINE LETZTE SUCHE",{exact:true}).waitFor();
  await page.getByText("ruhiges Café nach Reload",{exact:true}).waitFor();
  const recentRail = page.getByLabel("Deine letzte Suche: ruhiges Café nach Reload",{exact:true});
  await recentRail.getByRole("button",{name:/Café Aktualisiert öffnen/}).first().waitFor();
  const recentLabels = await recentRail.getByRole("button").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("aria-label")));
  assert.match(recentLabels[0],/Café Aktualisiert/);
  assert.match(recentLabels[1],/Café Alternative/);
  const newRail = page.getByLabel("Neu auf Backyrd",{exact:true});
  const newLabels = await newRail.getByRole("button").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("aria-label")));
  assert.match(newLabels[0],/Café Fünfte Wahl/);
  assert.match(newLabels.at(-1),/Café Aktualisiert/);
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) {
    for (const [width,height] of [[320,568],[430,932]]) {
      await page.setViewportSize({width,height});
      await newRail.getByRole("button").first().scrollIntoViewIfNeeded();
      await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/home-new-and-recent-${width}.png`,fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
      await recentRail.getByRole("button").first().scrollIntoViewIfNeeded();
      await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/home-last-search-${width}.png`});
    }
    await page.setViewportSize({width:390,height:844});
  }
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/connected-home-390.png`,fullPage:true});
  await page.getByText("Momente",{exact:true}).last().click();
  await page.getByRole("button",{name:"Ähnliche Orte finden",exact:true}).first().click();
  await page.getByText("1 / 5",{exact:true}).waitFor();
  assert.equal(state.decisions.at(-1).naturalLanguage,"Ich suche einen Ort (Café) mit dieser Atmosphäre: Gemütlich, Ruhig in Bern.");
  await page.getByRole("button",{name:"Café Aktualisiert entdecken",exact:true}).click();
  await page.getByText("FÜR DEINEN NÄCHSTEN MOMENT",{exact:true}).waitFor();
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/connected-place-390.png`});
  // A direct visit has no personalized rationale, even for the same place.
  await page.goto(`${appUrl}/spot/spot-cafe-one`,{waitUntil:"domcontentloaded"});
  await page.getByText("Café Aktualisiert",{exact:true}).first().waitFor();
  assert.equal(await page.getByText("FÜR DEINEN NÄCHSTEN MOMENT",{exact:true}).count(),0);

  // Explicit sharing reaches the common confirmation only after successful synthetic finalization.
  await page.goto(appUrl,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Moment mit Foto festhalten",exact:true}).click();
  await page.getByRole("button",{name:"Gemütlich",exact:true}).click();
  await page.getByRole("button",{name:"Ort selbst wählen",exact:true}).click();
  await page.getByRole("textbox",{name:"Ort für deinen Moment suchen",exact:true}).fill("Café");
  await page.getByRole("button",{name:"Café Moment · Testgasse 1",exact:true}).click();
  assert.equal(momentPublishes,0);
  state.allowSyntheticMoment=true;
  await page.getByRole("button",{name:"Moment teilen",exact:true}).click();
  await page.getByText("Dein Moment ist geteilt.",{exact:true}).waitFor();
  assert.equal(momentPublishes,1);
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) {
    await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/connected-shared-390.png`});
    await page.setViewportSize({width:320,height:568});
    await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/connected-shared-320.png`});
    await page.setViewportSize({width:430,height:932});
    await page.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/connected-shared-430.png`});
  }
  await page.getByRole("button",{name:"Zur Startseite",exact:true}).click();
  await page.getByRole("textbox",{name:"Was hast du heute vor?",exact:true}).waitFor();

  const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await loginContext.route(`${endpoint}/**`, remoteFixture);
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${appUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await loginPage.getByLabel("E-Mail", { exact: true }).fill("synthetic@example.invalid");
  await loginPage.getByLabel("Passwort", { exact: true }).fill("synthetic-password");
  await loginPage.getByText("Einloggen", { exact: true }).last().click();
  await loginPage.waitForFunction(() => window.localStorage.getItem("sb-example-auth-token") !== null);
  assert.equal(passwordLogins, 1);
  await loginContext.close();

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await guestContext.route(`${endpoint}/**`, remoteFixture);
  const guestPage = await guestContext.newPage();
  await guestPage.goto(appUrl, { waitUntil: "domcontentloaded" });
  await guestPage.getByText("Erst einmal Orte entdecken", { exact: true }).click();
  await guestPage.getByRole("textbox", { name: "Orte suchen", exact: true }).waitFor();
  assert.equal(await guestPage.getByText("Wohin", { exact: true }).count(), 0, "personalized Decision tab is unavailable to guests");
  await guestContext.close();

  process.stdout.write(`${JSON.stringify({ suite: "product-wohin-web-bundle", status: "PASS", realExistingApp: true, localSyntheticTransport: true, passwordLogin: true, authenticatedSession: true, guestDiscovery: true, cameraFirstDraft: true, manualPlaceWithoutLocation: true, moodsPreservedOnPlaceChoice: true, noAutomaticMomentPublishing: true, explicitMomentConfirmation: true, connectedMomentDiscovery: true, groundedPlaceContext: true, directPlaceHasNoPersonalClaim: true, homeSafetyVisibility: true, decisionRequests: state.decisions.length, fiveServerRankedCandidates: true, fullscreenCards: true, touchSwipe: true, compactViewport: true, offscreenImpressionsSuppressed: true, noGuidedIntentLeak: true, consentTransition: true, reload: true, worldReaderVisibilityFixture: true, unavailableNoFallback: true, productionActions: 0 })}\n`);
} catch (error) {
  if (process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR) {
    for (const ctx of browser.contexts()) for (const [index, tab] of ctx.pages().entries()) await tab.screenshot({path:`${process.env.BACKYRD_PRODUCT_SCREENSHOT_DIR}/failure-${index}.png`}).catch(()=>undefined);
  }
  throw error;
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
}
