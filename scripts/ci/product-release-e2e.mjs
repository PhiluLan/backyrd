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
const output = mkdtempSync(join(tmpdir(), "backyrd-product-mobile-"));
const endpoint = "https://example.invalid";
const publicKey = "ci-public-placeholder-key-000000000000";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2" };

execFileSync("npx", ["expo", "export", "--platform", "web", "--output-dir", output], {
  cwd: resolve(root, "mobile"),
  env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: endpoint, EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey },
  stdio: ["ignore", "pipe", "pipe"],
  maxBuffer: 100 * 1024 * 1024,
});

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
];
const candidate = (spot) => {
  const sourceHash = hash({ spotId: spot.spotId, worldVersion: state.worldVersion });
  return {
    spotId: spot.spotId,
    presentation: { contractVersion: "backyrd.decision-vnext.product-presentation@1.0", spotId: spot.spotId, name: spot.name(), locality: "Bern", categoryLabel: "Café", imageUrl: null, sourceHash, presentationHash: hash({ spotId: spot.spotId, sourceHash }) },
    tier: "ELIGIBLE_CONFIRMED", rank: spot.rank, coreIntentCoverage: "CONFIRMED", actualAvailability: "open",
    confirmedHardConstraints: [], unknownHardConstraints: [], failedHardConstraints: [], rankVector: { vectorHash: hash({ rank: spot.rank }) },
    reasons: [{ code: "world-fit", domain: "WORLD", sourceHash, statement: `Bestätigter Café-Fit aus World-Version ${state.worldVersion}.`, confirmed: true }],
    limitations: [], contextualReject: false, candidateHash: hash({ spotId: spot.spotId, sourceHash }),
  };
};
const responseFor = (request) => {
  const available = spots.find((spot) => !request.previouslyPresentedCandidateIds.includes(spot.spotId)) ?? null;
  return {
    contractVersion: DECISION_PRODUCT_CONTRACT.response, status: "AVAILABLE", decisionId: `decision-${state.decisions.length}`,
    requestHash: hash(request), envelopeHash: hash({ request, worldVersion: state.worldVersion }),
    rankingPolicyVersion: "backyrd.decision-vnext.product-ranking-policy@1.0", rankingPolicyHash: hash("synthetic-policy"),
    interpretation: { interpretationHash: hash(request.explicit), targetCity: "Bern" },
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((injected) => window.localStorage.setItem("sb-example-auth-token", JSON.stringify(injected)), session);
  const page = await context.newPage();
  let passwordLogins = 0;
  const remoteFixture = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
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
  await page.getByText("Für jetzt", { exact: true }).last().waitFor({ timeout: 30000 });
  await page.getByText("Für jetzt", { exact: true }).last().click();
  await page.getByText("Was passt jetzt?", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByText("Freitext", { exact: true }).click();
  await page.getByPlaceholder(/ruhiges Café zum Lesen/).fill("ruhiges Café für ein Gespräch");
  await page.getByText("Vorschläge finden", { exact: true }).click();
  await page.getByText("Café Vorher", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("Café Alternative", { exact: true }).count(), 0, "only the server-selected primary is presented");
  assert.equal(state.decisions[0].explicit.targetCity, "Bern");
  assert.equal(state.decisions[0].alternativeRequested, false);
  assert.equal(await page.getByText(/World-Version 1/).count(), 1);

  await page.getByText("Andere Richtung zeigen", { exact: true }).click();
  await page.getByText("Café Alternative", { exact: true }).first().waitFor();
  assert.deepEqual(state.decisions[1].previouslyPresentedCandidateIds, ["spot-cafe-one"]);
  assert.equal(state.decisions[1].alternativeRequested, true);
  await page.getByText("Passt nicht", { exact: true }).click();
  await page.getByText("Café Dritte Wahl", { exact: true }).first().waitFor();
  assert.deepEqual(state.decisions[2].previouslyPresentedCandidateIds, ["spot-cafe-one", "spot-cafe-two"]);
  assert.deepEqual(state.decisions[2].rejectedCandidateIds, ["spot-cafe-two"]);
  assert.equal(state.decisions[2].alternativeRequested, false);
  assert.equal(state.decisions.every((item) => item.contractVersion === DECISION_PRODUCT_CONTRACT.request), true);
  assert.equal(state.interactions.some((item) => item.eventType === "candidate_impression"), true);
  assert.equal(state.decisions.length, 3);

  state.consent = true;
  state.worldName = "Café Aktualisiert";
  state.worldVersion = 2;
  await page.getByText("Vorschläge finden", { exact: true }).click();
  await page.getByText("Café Aktualisiert", { exact: true }).first().waitFor();
  assert.equal(await page.getByText(/World-Version 2/).count(), 1);
  assert.equal(await page.getByText(/mit Einwilligung berücksichtigt/).count(), 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Für jetzt", { exact: true }).last().waitFor();
  await page.getByText("Für jetzt", { exact: true }).last().click();
  await page.getByText("Freitext", { exact: true }).click();
  await page.getByPlaceholder(/ruhiges Café zum Lesen/).fill("ruhiges Café nach Reload");
  await page.getByText("Vorschläge finden", { exact: true }).click();
  await page.getByText("Café Aktualisiert", { exact: true }).first().waitFor();
  state.unavailable = true;
  await page.getByText("Vorschläge finden", { exact: true }).click();
  await page.getByText("Vorschläge nicht verfügbar", { exact: true }).waitFor();
  assert.equal(await page.getByText("Café Aktualisiert", { exact: true }).count(), 0);
  assert.equal(state.unexpectedRemote.length, 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0);

  const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await loginContext.route(`${endpoint}/**`, remoteFixture);
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${appUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await loginPage.getByPlaceholder("E-Mail", { exact: true }).fill("synthetic@example.invalid");
  await loginPage.getByPlaceholder("Passwort", { exact: true }).fill("synthetic-password");
  await loginPage.getByText("Einloggen", { exact: true }).last().click();
  await loginPage.waitForFunction(() => window.localStorage.getItem("sb-example-auth-token") !== null);
  assert.equal(passwordLogins, 1);
  await loginContext.close();

  process.stdout.write(`${JSON.stringify({ suite: "product-existing-mobile-web-bundle", status: "PASS", realExistingApp: true, localSyntheticTransport: true, passwordLogin: true, authenticatedSession: true, decisionRequests: state.decisions.length, alternative: true, contextualReject: true, consentTransition: true, reload: true, worldReaderVisibilityFixture: true, unavailableNoFallback: true, productionActions: 0 })}\n`);
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
}
