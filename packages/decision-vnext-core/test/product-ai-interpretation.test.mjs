import test from "node:test";
import assert from "node:assert/strict";
import {
  createDecisionProductAiIntentInterpreter, parseDecisionProductAiIntentAllowlist,
  PRODUCT_AI_INTENT_CACHE_RPC, PRODUCT_DECISION_VERSIONS, PRODUCT_QUERY_CATALOG,
  inferredIndoorSuitability, decodeWorldPreference,
} from "../dist/index.js";

const identity = { releaseHash: "a".repeat(64), artifactHash: "b".repeat(64), sourceSetHash: "c".repeat(64), controlGeneration: 4 };
const actor = { userId: "11111111-1111-4111-8111-111111111111", subjectBindingHash: "d".repeat(64), authenticationContextHash: "e".repeat(64), sessionBindingHash: "f".repeat(64), sessionId: "22222222-2222-4222-8222-222222222222" };
const request = (naturalLanguage, explicit = {}) => ({ contractVersion: PRODUCT_DECISION_VERSIONS.request, requestId: "request-family", idempotencyKey: "idem-family", naturalLanguage, explicit, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] });
const modelResponse = (value) => ({ ok: true, async json() { return { status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }; } });
const semantics = (overrides = {}) => ({ primaryIntent: "ACTIVITY_EXPERIENCE", secondaryIntent: null, facets: [], indoorRequired: false, indoorEvidence: null, ...overrides });
const interpreter = (fetchImpl, rpc, allowedUserIds = [actor.userId]) => createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "gpt-6-luna", allowedUserIds, rpc, fetchImpl });

test("AI interprets a normal request even when the old lexicon recognizes its category; cache is byte-stable", async () => {
  let stored; let fetches = 0; const calls = [];
  const run = interpreter(async (_url, options) => {
    fetches += 1; const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.ok(body.instructions.includes("context.visit_situations"));
    assert.equal(body.input, "Ausflug mit meiner 4 jährigen Tochter bei Regen");
    return modelResponse(semantics({ facets: [{ key: "context.visit_situations", value: "FAMILY", evidence: "Tochter" }], indoorRequired: true, indoorEvidence: "Regen" }));
  }, { async rpc(name, parameters) {
    assert.equal(name, PRODUCT_AI_INTENT_CACHE_RPC); calls.push(parameters);
    if (parameters.p_write) stored ??= parameters.p_semantics;
    return { data: stored === undefined ? { status: "MISS" } : { status: "HIT", semantics: stored }, error: null };
  } });
  const input = request("Ausflug mit meiner 4 jährigen Tochter bei Regen");
  const first = await run(input, actor, new AbortController().signal);
  const second = await run(input, actor, new AbortController().signal);
  assert.deepEqual(first, second); assert.equal(fetches, 1); assert.equal(calls.length, 3);
  assert.equal(first.explicit.primaryIntent, "ACTIVITY_EXPERIENCE");
  assert.ok(first.explicit.hardConstraints.includes("INDOOR_REQUIRED"));
  assert.ok(first.explicit.softPreferences.includes("WK:context.visit_situations:FAMILY"));
  assert.equal(JSON.stringify(stored).includes("Tochter"), false);
  assert.equal(JSON.stringify(stored).includes("Regen"), false);
});

test("explicit user intent wins while AI still interprets the other dimensions", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "DRINKS", facets: [{ key: "context.atmosphere", value: "LIVELY", evidence: "lebhaft" }] })), {
    async rpc(_name, parameters) { return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null }; },
  });
  const output = await run(request("lebhaft", { primaryIntent: "EAT" }), actor, new AbortController().signal);
  assert.equal(output.explicit.primaryIntent, "EAT");
  assert.ok(output.explicit.softPreferences.includes("WK:context.atmosphere:LIVELY"));
});

test("unknown values, invented spots and unsupported evidence fail before ranking", async () => {
  for (const invalid of [
    semantics({ facets: [{ key: "context.atmosphere", value: "PARTY_HARD", evidence: "homies" }] }),
    { ...semantics(), spotId: "unverified" },
    semantics({ indoorRequired: true, indoorEvidence: "Regen" }),
  ]) {
    const run = interpreter(async () => modelResponse(invalid), { async rpc() { return { data: { status: "MISS" }, error: null }; } });
    await assert.rejects(run(request("mit den homies"), actor, new AbortController().signal), /product_ai_intent_result_invalid/);
  }
});

test("provider failure is not disguised as a successful semantic interpretation", async () => {
  const run = interpreter(async () => ({ ok: false }), { async rpc() { return { data: { status: "MISS" }, error: null }; } });
  await assert.rejects(run(request("Familienausflug"), actor, new AbortController().signal), /product_ai_intent_provider_unavailable/);
});

test("pilot allowlist remains exact and fail-closed", async () => {
  assert.deepEqual(parseDecisionProductAiIntentAllowlist(""), []);
  assert.deepEqual(parseDecisionProductAiIntentAllowlist(` ${actor.userId.toUpperCase()} `), [actor.userId]);
  assert.equal(parseDecisionProductAiIntentAllowlist("*"), "*");
  assert.throws(() => parseDecisionProductAiIntentAllowlist("*,"), /allowlist_invalid/);
  const run = interpreter(async () => { throw new Error("provider must not be called"); }, { async rpc() { throw new Error("cache must not be called"); } }, []);
  const input = request("Familienausflug");
  assert.deepEqual(await run(input, actor, new AbortController().signal), input);
});

test("rain suitability follows verified place type, not invented venue facts", () => {
  assert.equal(inferredIndoorSuitability(["MUSEUM"]), "INDOOR");
  assert.equal(inferredIndoorSuitability(["CLIMBING_GYM"]), "INDOOR");
  assert.equal(inferredIndoorSuitability(["PARK"]), "OUTDOOR");
  assert.equal(inferredIndoorSuitability(["ZOO"]), "OUTDOOR");
  assert.equal(inferredIndoorSuitability(["MUSEUM", "PARK"]), "UNKNOWN");
  assert.equal(inferredIndoorSuitability([]), "UNKNOWN");
  assert.ok(PRODUCT_QUERY_CATALOG.some((field) => field.key === "classification.place_types"));
  assert.deepEqual(decodeWorldPreference("WK:context.atmosphere:LIVELY"), { key: "context.atmosphere", value: "LIVELY" });
  assert.equal(decodeWorldPreference("WK:context.atmosphere:IMAGINARY"), null);
});
