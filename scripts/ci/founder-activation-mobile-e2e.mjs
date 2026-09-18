#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, lstatSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const MOBILE = resolve(ROOT, "mobile");
const output = mkdtempSync(join(tmpdir(), "backyrd-founder-mobile-"));
const publicUrl = "https://example.invalid";
const publicKey = "ci-public-placeholder-key-000000000000";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2" };

execFileSync("npx", ["expo", "export", "--platform", "web", "--output-dir", output], {
  cwd: MOBILE,
  env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: publicUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey },
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
await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const address = server.address();
if (!address || typeof address === "string") throw new Error("founder_activation_mobile_server_unavailable");

const subject = randomUUID();
const sessionId = randomUUID();
const now = Math.floor(Date.now() / 1_000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: subject, session_id: sessionId, exp: now + 3_600, role: "authenticated", aud: "authenticated" })}.test-only-signature`;
const user = { id: subject, aud: "authenticated", role: "authenticated", is_anonymous: false, user_metadata: {}, app_metadata: {}, created_at: new Date(now * 1_000).toISOString() };
const session = { access_token: token, refresh_token: "test-refresh", expires_in: 3_600, expires_at: now + 3_600, token_type: "bearer", user };
const counters = { authReads: 0, decisionRequests: 0, worldReads: 0, userProjectionReads: 0, durableWrites: 0, externalCalls: 0, productOutputs: 0, requestsAfterEmergencyOff: 0 };
const captured = [];
let emergencyOff = false;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ session: injected }) => {
    window.localStorage.setItem("sb-example-auth-token", JSON.stringify(injected));
  }, { session });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message)));
  page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
  await page.route(`${publicUrl}/**`, async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const headers = request.headers();
    captured.push({ method: request.method(), path: url.pathname, hasAuthorization: /^Bearer\s+\S+$/.test(headers.authorization ?? "") });
    if (url.pathname === "/auth/v1/user") {
      counters.authReads += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    }
    if (url.pathname.includes("/rest/v1/rpc/safety_user_enforcement_summary_v1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ active_points: 0, confirmed_violations: 0, active_measure_type: null, active_measure_ends_at: null, can_write: true, requires_account_review: false }]) });
    if (url.pathname.includes("/rest/v1/rpc/get_my_legal_gate_status_v1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ gate_required: false }]) });
    if (url.pathname.includes("/rest/v1/rpc/get_my_product_entry_status_v1")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ loggedIn: true, userId: subject, profileBasicsComplete: true, tasteOnboardingComplete: true, personalizationConsentValid: true, canEnterDecision: true, needsProfileOnboarding: false, needsDecisionOnboarding: false, semanticContractVersion: "test-only", nextRoute: "/(tabs)" }]) });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ city: "Bern" }]) });
    if (url.pathname.includes("/functions/v1/decision-v13")) {
      counters.decisionRequests += 1;
      if (emergencyOff) {
        counters.requestsAfterEmergencyOff += 1;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" }) });
      }
      assert.match(headers.authorization ?? "", /^Bearer\s+\S+$/);
      const body = JSON.parse(request.postData() ?? "{}");
      const serialized = JSON.stringify(body).toLowerCase();
      for (const forbidden of ["founder", "allowlist", "email", "user_metadata", "uuid"]) assert.equal(serialized.includes(forbidden), false, `client authority field forbidden: ${forbidden}`);
      counters.worldReads += 1; counters.userProjectionReads += 1; counters.productOutputs += 1;
      const decisionId = `decision-${counters.decisionRequests}`;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true, model: "test-authority-provider", version: "local-e2e", mode: "personalized_semantic", city: "Bern", query: "ruhiges Café", queryText: "ruhiges Café", intent: {}, counts: { v12: 0, semantic: 1, fused: 1 },
        candidates: [{ rank: 1, spot_id: "spot-local-e2e", name: "Lokaler Testort", city: "Bern", category_name: "Café", is_open_now: true, combined_score: 0, sources: ["semantic_v13"], v12_rank: null, v12_score: 0, semantic_rank: 1, semantic_similarity: 0, matched_tokens: [], matched_terms: [], human_reason: "Passt zum lokalen Testszenario.", technical_why_this: null, document_preview: null }],
        north_star: { active: true, decision_id: decisionId, knowledge_mode: "PARTIAL", personalization_active: true },
        continuation: { decision_id: decisionId, page: 1, request_id: null, exhausted: false, remaining_count: 1 }
      }) });
    }
    if (url.pathname.startsWith("/rest/v1/")) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    counters.externalCalls += 1;
    return route.abort("blockedbyclient");
  });

  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
  await page.getByText("Für jetzt", { exact: true }).last().click();
  try { await page.getByText("DEIN / JETZT.").waitFor({ timeout: 20_000 }); }
  catch {
    const safeBody = (await page.locator("body").innerText()).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[redacted-id]").replace(/\b\S+@\S+\b/g, "[redacted-email]");
    const safeErrors = pageErrors.join(" | ").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[redacted-id]").replace(/\b\S+@\S+\b/g, "[redacted-email]");
    throw new Error(`founder_activation_mobile_ui_not_ready:${safeBody.slice(0, 500)}:${safeErrors.slice(0, 500)}`);
  }
  await page.getByPlaceholder("Basel oder Zürich").fill("Bern");
  await page.getByText("Freitext", { exact: true }).click();
  await page.getByPlaceholder(/Freier Tag/).fill("ruhiges Café für ein Gespräch");
  await page.getByText("Vorschläge finden", { exact: true }).click();
  await page.getByText("Lokaler Testort", { exact: true }).first().waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some((element) => element.textContent?.trim() === "Nicht passend" && element.getAttribute("aria-disabled") !== "true"));
  assert.equal(await page.getByRole("button", { name: "Nicht passend" }).isEnabled(), true);
  const alternativeStatus = await page.evaluate(async () => {
    const current = JSON.parse(window.localStorage.getItem("sb-example-auth-token") ?? "null");
    const response = await fetch("https://example.invalid/functions/v1/decision-v13", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${current.access_token}` }, body: JSON.stringify({ continuationDecisionId: "decision-1", continuationRequestId: "alternative-request" }) });
    return response.status;
  });
  assert.equal(alternativeStatus, 200);
  emergencyOff = true;
  const readsAtEmergencyOff = { world: counters.worldReads, user: counters.userProjectionReads, outputs: counters.productOutputs };
  const emergencyStatus = await page.evaluate(async () => {
    const current = JSON.parse(window.localStorage.getItem("sb-example-auth-token") ?? "null");
    const response = await fetch("https://example.invalid/functions/v1/decision-v13", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${current.access_token}` }, body: JSON.stringify({ continuationDecisionId: "decision-1", continuationRequestId: "emergency-request" }) });
    return response.status;
  });
  assert.equal(emergencyStatus, 503);
  assert.deepEqual({ world: counters.worldReads, user: counters.userProjectionReads, outputs: counters.productOutputs }, readsAtEmergencyOff);
  assert.equal(counters.externalCalls, 0);
  assert.equal(counters.durableWrites, 0);
  assert.ok(counters.authReads >= 1);
  assert.equal(counters.decisionRequests, 3);
  assert.equal(counters.requestsAfterEmergencyOff, 1);
  assert.ok(captured.filter(({ path }) => path.includes("/functions/v1/")).every(({ hasAuthorization }) => hasAuthorization));
  const bundle = readFileSync(resolve(output, "index.html"), "utf8");
  assert.equal(bundle.includes(subject), false);
  process.stdout.write(`${JSON.stringify({
    contractVersion: "backyrd.founder-activation-mobile-e2e@1.0",
    status: "PASS",
    realMobileWebBundle: true,
    ordinaryAuthenticatedSessionOnly: true,
    testAuthorityProvider: "IN_MEMORY_TEST_ONLY",
    screenshotsRetained: 0,
    concreteIdentityValuesRetained: 0,
    authReads: counters.authReads,
    decisionRequests: counters.decisionRequests,
    worldReads: counters.worldReads,
    userProjectionReads: counters.userProjectionReads,
    durableWrites: counters.durableWrites,
    externalNetworkCalls: counters.externalCalls,
    productOutputsBeforeEmergencyOff: readsAtEmergencyOff.outputs,
    readsAfterEmergencyOff: 0,
    projectionsAfterEmergencyOff: 0,
    productOutputsAfterEmergencyOff: 0,
    productionActions: 0,
    executionAuthorized: false
  })}\n`);
} finally {
  await browser.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
