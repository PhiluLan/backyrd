import test from "node:test";
import assert from "node:assert/strict";
import { createDecisionProductAiIntentInterpreter, parseDecisionProductAiIntentAllowlist, PRODUCT_AI_INTENT_CACHE_RPC, PRODUCT_DECISION_VERSIONS } from "../dist/index.js";

const identity = { releaseHash: "a".repeat(64), artifactHash: "b".repeat(64), sourceSetHash: "c".repeat(64), controlGeneration: 4 };
const actor = { userId: "11111111-1111-4111-8111-111111111111", subjectBindingHash: "d".repeat(64), authenticationContextHash: "e".repeat(64), sessionBindingHash: "f".repeat(64), sessionId: "22222222-2222-4222-8222-222222222222" };
const request = (naturalLanguage, explicit = {}) => ({ contractVersion: PRODUCT_DECISION_VERSIONS.request, requestId: "request-family", idempotencyKey: "idem-family", naturalLanguage, explicit, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] });

test("AI resolves an everyday compound once and the durable cache makes retries identical", async () => {
  const calls = [];
  let stored;
  let fetches = 0;
  const interpreter = createDecisionProductAiIntentInterpreter({
    identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc(name, parameters) {
      assert.equal(name, PRODUCT_AI_INTENT_CACHE_RPC);
      calls.push(parameters);
      if (parameters.p_write) stored ??= parameters.p_primary_intent;
      return { data: stored === undefined ? { status: "MISS" } : { status: "HIT", primaryIntent: stored }, error: null };
    } },
    async fetchImpl(_url, options) {
      fetches += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.input, "Familienausflug in Basel");
      assert.equal(body.text.format.strict, true);
      return { ok: true, async json() { return { status: "completed", output: [{ content: [{ type: "output_text", text: '{"primaryIntent":"ACTIVITY_EXPERIENCE"}' }] }] }; } };
    },
  });
  const input = request("Familienausflug in Basel", { targetCity: "Basel" });
  const first = await interpreter(input, actor, new AbortController().signal);
  const second = await interpreter(input, actor, new AbortController().signal);
  assert.deepEqual(first, second);
  assert.deepEqual(first.explicit, { targetCity: "Basel", primaryIntent: "ACTIVITY_EXPERIENCE" });
  assert.equal(fetches, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].p_write, false);
  assert.equal(calls[1].p_write, true);
  assert.equal(calls[1].p_primary_intent, "ACTIVITY_EXPERIENCE");
  assert.equal(calls[0].p_auth_user_id, actor.userId);
});

test("explicit user intent is not replaced by AI", async () => {
  const interpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc() { throw new Error("should not be called"); } },
    async fetchImpl() { throw new Error("should not be called"); } });
  const input = request("Irgendwo hin", { primaryIntent: "CULTURE_ART" });
  assert.deepEqual(await interpreter(input, actor, new AbortController().signal), input);
});

test("clear everyday requests keep the deterministic path without provider or cache cost", async () => {
  const interpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc() { throw new Error("should not be called"); } },
    async fetchImpl() { throw new Error("should not be called"); } });
  const input = request("Kaffee in Basel");
  assert.deepEqual(await interpreter(input, actor, new AbortController().signal), input);
});

test("provider failure does not silently fall back to fabricated recommendations", async () => {
  const interpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc() { return { data: { status: "MISS" }, error: null }; } },
    async fetchImpl() { return { ok: false }; } });
  await assert.rejects(interpreter(request("Familienausflug in Basel"), actor, new AbortController().signal), /product_ai_intent_provider_unavailable/);
});

test("invalid model intent is rejected before reaching Product ranking", async () => {
  const interpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc() { return { data: { status: "MISS" }, error: null }; } },
    async fetchImpl() { return { ok: true, async json() { return { status: "completed", output: [{ content: [{ type: "output_text", text: '{"primaryIntent":"RESTAURANT_ONLY"}' }] }] }; } }; } });
  await assert.rejects(interpreter(request("Familienausflug in Basel"), actor, new AbortController().signal), /product_ai_intent_result_invalid/);
});

test("model cannot attach a spot claim or instruction to its intent", async () => {
  const interpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc() { return { data: { status: "MISS" }, error: null }; } },
    async fetchImpl() { return { ok: true, async json() { return { status: "completed", output: [{ content: [{ type: "output_text", text: '{"primaryIntent":"ACTIVITY_EXPERIENCE","spotId":"unverified"}' }] }] }; } }; } });
  await assert.rejects(interpreter(request("Familienausflug in Basel"), actor, new AbortController().signal), /product_ai_intent_result_invalid/);
});

test("pilot allowlist is exact and fails closed for malformed configuration", async () => {
  assert.deepEqual(parseDecisionProductAiIntentAllowlist(""), []);
  assert.deepEqual(parseDecisionProductAiIntentAllowlist(` ${actor.userId.toUpperCase()} `), [actor.userId]);
  assert.equal(parseDecisionProductAiIntentAllowlist("*"), "*");
  assert.throws(() => parseDecisionProductAiIntentAllowlist("*,"), /allowlist_invalid/);
  assert.throws(() => parseDecisionProductAiIntentAllowlist(`${actor.userId},${actor.userId}`), /allowlist_invalid/);
  const interpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [],
    rpc: { async rpc() { throw new Error("cache must not be called"); } },
    async fetchImpl() { throw new Error("provider must not be called"); } });
  const input = request("Familienausflug in Basel");
  assert.deepEqual(await interpreter(input, actor, new AbortController().signal), input);
  const oneAccountInterpreter = createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "test-model", allowedUserIds: [actor.userId],
    rpc: { async rpc() { throw new Error("cache must not be called for another account"); } },
    async fetchImpl() { throw new Error("provider must not be called for another account"); } });
  assert.deepEqual(await oneAccountInterpreter(input, { ...actor, userId: "33333333-3333-4333-8333-333333333333" }, new AbortController().signal), input);
});
