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
const state = { consent: false, unavailable: false, worldName: "Café Vorher", worldVersion: 1, decisions: [], interactions: [], unexpectedRemote: [] };
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
  const remoteFixture = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
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
  await page.getByText("Wohin", { exact: true }).last().click();
  await page.getByPlaceholder(/Sonntag gemütlich Kaffee trinken/).waitFor({ timeout: 30000 });
  await page.getByPlaceholder(/Sonntag gemütlich Kaffee trinken/).fill("Sonntag gemütlich Kaffee trinken");
  await page.getByText("Für Bern · Ort aus deinem Profil", { exact: true }).waitFor();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByText("Café Vorher", { exact: true }).first().waitFor();
  await page.getByText("1 / 5", { exact: true }).waitFor();
  await page.waitForTimeout(400);
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
  const compactName=await page.getByText("Café Vorher",{exact:true}).first().boundingBox();
  const compactDetails=await page.getByText("Details & Hinweise",{exact:true}).first().boundingBox();
  assert.ok(compactName && compactDetails && compactName.y+compactName.height<=compactDetails.y,"Spot name and details action remain readable on small screens");
  assert.equal(await page.getByText("Eine passende Idee für das, was du gerade vorhast.",{exact:true}).count(),0,"recommendation prose stays off the photo");
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
  await page.getByText("Eine passende Idee für das, was du gerade vorhast.",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Hinweise schließen",exact:true}).click();
  assert.equal(state.decisions[0].explicit.targetCity, "Bern");
  assert.equal(state.decisions[0].explicit.primaryIntent, undefined, "old guided intent must not leak into Wohin");
  assert.equal(state.decisions[0].alternativeRequested, false);
  await page.getByText("Eine passende Idee für das, was du gerade vorhast.", { exact: true }).waitFor({state:"hidden"});
  assert.equal(await page.getByText(/World-Version 1/).count(), 0, "internal evidence stays out of the consumer UI");

  assert.equal(state.decisions.every((item) => item.contractVersion === DECISION_PRODUCT_CONTRACT.request), true);
  assert.equal(state.decisions.length, 1);

  state.consent = true;
  state.worldName = "Café Aktualisiert";
  state.worldVersion = 2;
  await page.getByRole("button",{name:"Suche ändern",exact:true}).click();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByText("Café Aktualisiert", { exact: true }).first().waitFor();
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
  await page.getByText("Café Aktualisiert", { exact: true }).first().waitFor();
  state.unavailable = true;
  const failureReport = page.waitForRequest(request => request.url().includes("/rpc/analytics_report_error_v1") && JSON.parse(request.postData() ?? "{}").p_error_type === "wohin_request_failed", {timeout:15000});
  await page.getByRole("button",{name:"Suche ändern",exact:true}).click();
  await page.getByText("Orte finden", { exact: true }).click();
  await page.getByText(/Wohin kann gerade keine verlässlichen Vorschläge zeigen|Vorschläge nicht verfügbar/).waitFor();
  assert.equal(await page.getByText("Café Aktualisiert", { exact: true }).count(), 0);
  const diagnostic = JSON.parse((await failureReport).postData());
  assert.equal(diagnostic.p_context.phase,"LOAD");
  assert.equal(diagnostic.p_context.http_status,503);
  assert.equal(diagnostic.p_message,"decision_transport_http_failure");
  assert.equal(JSON.stringify(diagnostic).includes("ruhiges Café nach Reload"),false,"handled diagnostics never send the search text");
  assert.equal(state.unexpectedRemote.length, 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0);

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

  process.stdout.write(`${JSON.stringify({ suite: "product-wohin-web-bundle", status: "PASS", realExistingApp: true, localSyntheticTransport: true, passwordLogin: true, authenticatedSession: true, guestDiscovery: true, decisionRequests: state.decisions.length, fiveServerRankedCandidates: true, fullscreenCards: true, touchSwipe: true, compactViewport: true, offscreenImpressionsSuppressed: true, noGuidedIntentLeak: true, consentTransition: true, reload: true, worldReaderVisibilityFixture: true, unavailableNoFallback: true, productionActions: 0 })}\n`);
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
}
