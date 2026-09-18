import test from "node:test";
import assert from "node:assert/strict";
import { FounderDecisionUnavailableError, routeFounderDecisionGateway, validateFounderDecisionGatewayResponse } from "../src/index.mjs";

const binding = { status: "READY_FOR_FOUNDER_ALLOWLIST", releaseHash: "a".repeat(64), bindingHash: "b".repeat(64), allCandidatesBound: true, vNextFunction: "decision-founder-live", fallbackFunction: "decision-v13", executionAuthorized: false };
const request = { contractVersion: "backyrd.decision-api.request@1.0", requestId: "request-12345678", idempotencyKey: "idem-12345678", context: { city: "Basel", query: "Kaffee trinken", moods: [], audience: [], placeTypes: [] }, continuation: null };
const founder = { contractVersion: "backyrd.decision-vnext.founder-live-response@1.1", status: "EVALUATION_ONLY", understood: { primaryIntent: "Kaffee", secondaryIntent: null, occasion: null, targetCity: "Basel", hardConditions: ["Zielort"], softPreferences: [] }, candidates: [{ name: "Fixture", group: "KOENNTE_PASSEN_ANGABE_FEHLT", reasons: ["Evidence fehlt."] }], limitations: [], alternative: { requested: false, negativeSignalProduced: false }, reject: { contextualOnly: true, userLearningProduced: false }, rankingState: "NOT_CONFIGURED" };
const gateway = (route, response) => ({ contractVersion: "backyrd.decision-api.gateway-response@1.0", route, requestId: request.requestId, writebackPerformed: false, response });
const hash = async () => "c".repeat(64);

test("Founder Live stays a distinct read-only route without v13 fallback", async () => {
  let legacy = 0;
  const result = await routeFounderDecisionGateway({ binding, request, hash, invokeGateway: async () => gateway("FOUNDER_LIVE_READ_ONLY", founder), invokeExisting: async () => { legacy += 1; return { ok: true }; } });
  assert.equal(result.route, "FOUNDER_LIVE_READ_ONLY"); assert.equal(result.response.status, "EVALUATION_ONLY"); assert.equal(legacy, 0);
  await assert.rejects(() => routeFounderDecisionGateway({ binding, request, hash, invokeGateway: async () => { throw new Error("down"); }, invokeExisting: async () => { legacy += 1; return { ok: true }; } }), FounderDecisionUnavailableError);
  assert.equal(legacy, 0);
});

test("server may select existing engine but versions and product identities fail closed", async () => {
  const existing = await routeFounderDecisionGateway({ binding, request, hash, invokeGateway: async () => gateway("EXISTING_ENGINE", null), invokeExisting: async () => ({ ok: true, north_star: { active: true } }) });
  assert.equal(existing.route, "EXISTING_ENGINE");
  assert.throws(() => validateFounderDecisionGatewayResponse(gateway("FOUNDER_LIVE_READ_ONLY", { ...founder, candidates: [{ ...founder.candidates[0], spotId: "forbidden" }] })), /gateway_founder_live_product_identity_forbidden/);
  assert.throws(() => validateFounderDecisionGatewayResponse({ ...gateway("FOUNDER_LIVE_READ_ONLY", founder), contractVersion: "backyrd.decision-api.gateway-response@9.0" }), /gateway_response_version_unknown/);
});

test("cross-engine continuation and product relabeling are rejected", async () => {
  const continued = { ...request, continuation: { decisionId: "decision-12345678", requestId: "request-87654321" } };
  await assert.rejects(() => routeFounderDecisionGateway({ binding, request: continued, hash, invokeGateway: async () => { throw new Error("forbidden"); }, invokeExisting: async () => ({ ok: true }) }), FounderDecisionUnavailableError);
  assert.throws(() => validateFounderDecisionGatewayResponse(gateway("FOUNDER_LIVE_READ_ONLY", { ...founder, status: "PRODUCT" })), /gateway_founder_live_contract_invalid/);
});
