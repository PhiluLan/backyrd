import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createContractGeneratedLocalStub, FOUNDER_DECISION_CONTRACT, FounderDecisionUnavailableError, routeFounderDecision } from "../src/index.mjs";

const hash = async (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const request = {
  contractVersion: FOUNDER_DECISION_CONTRACT.request,
  requestId: "founder-request-0001",
  idempotencyKey: "founder-idempotency-0001",
  context: { city: "Bern", query: "ruhiges Café", moods: ["ruhig"], audience: ["solo"], placeTypes: ["cafe"] },
  continuation: null,
};
const pending = { status: "YELLOW_CANDIDATES_PENDING", releaseHash: "1".repeat(64), bindingHash: "2".repeat(64), allCandidatesBound: false, vNextFunction: null, fallbackFunction: "decision-v13", executionAuthorized: false };
const ready = { ...pending, status: "READY_FOR_FOUNDER_ALLOWLIST", allCandidatesBound: true, vNextFunction: "decision-vnext-v1" };
const authority = { contractVersion: FOUNDER_DECISION_CONTRACT.routeAuthority, requestId: request.requestId, releaseHash: ready.releaseHash, bindingHash: ready.bindingHash, route: "VNEXT", allowlisted: true, globalKillSwitch: false, decisionKillSwitch: false, validUntil: "2026-10-01T00:00:00.000Z" };
const vnext = async () => ({ contractVersion: FOUNDER_DECISION_CONTRACT.response, requestId: request.requestId, idempotencyKey: request.idempotencyKey, releaseHash: ready.releaseHash, bindingHash: ready.bindingHash, resultHash: "3".repeat(64), writebackPerformed: false, candidates: [{ spotId: "spot-a" }] });

test("pending candidates always use the existing engine without a client toggle", async () => {
  let candidateCalls = 0;
  const result = await routeFounderDecision({ binding: pending, request, hash, invokeVNext: async () => { candidateCalls += 1; }, invokeExisting: async () => ({ ok: true, candidates: [{ spot_id: "legacy-a" }] }) });
  assert.equal(result.route, "EXISTING_ENGINE");
  assert.equal(result.fallbackReason, "CANDIDATES_PENDING");
  assert.equal(result.mixedResults, false);
  assert.equal(candidateCalls, 0);
});

test("only fresh server authority can select vNext", async () => {
  const result = await routeFounderDecision({ binding: ready, request, serverAuthority: authority, hash, now: "2026-09-18T00:00:00.000Z", invokeVNext: vnext, invokeExisting: async () => ({ ok: true }) });
  assert.equal(result.route, "VNEXT");
  assert.equal(result.writebackPerformed, false);
});

for (const [name, override] of [
  ["missing authority", null],
  ["forged release", { ...authority, releaseHash: "9".repeat(64) }],
  ["expired authority", { ...authority, validUntil: "2026-09-01T00:00:00.000Z" }],
  ["not allowlisted", { ...authority, allowlisted: false }],
  ["global kill switch", { ...authority, globalKillSwitch: true }],
  ["decision kill switch", { ...authority, decisionKillSwitch: true }],
]) test(`${name} fails closed to one unmixed existing result`, async () => {
  const result = await routeFounderDecision({ binding: ready, request, serverAuthority: override, hash, now: "2026-09-18T00:00:00.000Z", invokeVNext: vnext, invokeExisting: async () => ({ ok: true, source: "existing" }) });
  assert.equal(result.route, "EXISTING_ENGINE");
  assert.deepEqual(result.response, { ok: true, source: "existing" });
  assert.equal(result.mixedResults, false);
});

test("candidate failure falls back and dual failure becomes an honest unavailable state", async () => {
  const fallback = await routeFounderDecision({ binding: ready, request, serverAuthority: authority, hash, now: "2026-09-18T00:00:00.000Z", invokeVNext: async () => { throw new Error("down"); }, invokeExisting: async () => ({ ok: true }) });
  assert.equal(fallback.fallbackReason, "VNEXT_FAILED_CLOSED");
  await assert.rejects(() => routeFounderDecision({ binding: pending, request, hash, invokeVNext: vnext, invokeExisting: async () => { throw new Error("offline"); } }), (error) => error instanceof FounderDecisionUnavailableError && /verlässlichen Vorschläge/.test(error.userMessage));
});

test("local stub is contract generated, local-only and never writes user learning", async () => {
  const stub = createContractGeneratedLocalStub({ worldVersion: "world-v0001", spots: [{ id: "spot-a", name: "Casa" }] });
  const result = await stub(request, { executionEnvironment: "LOCAL_TEST", hash });
  assert.equal(result.contractVersion, FOUNDER_DECISION_CONTRACT.localStub);
  assert.equal(result.writebackPerformed, false);
  assert.equal(result.productionCapable, false);
  await assert.rejects(() => stub(request, { executionEnvironment: "PRODUCTION", hash }), /stub_non_local_execution_forbidden/);
});
