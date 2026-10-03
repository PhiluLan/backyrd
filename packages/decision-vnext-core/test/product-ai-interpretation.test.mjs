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
const facet = (key, value, evidence, role = "PREFERRED", group = null) => ({ key, value, evidence, role, group });
const interpreter = (fetchImpl, rpc, allowedUserIds = [actor.userId]) => createDecisionProductAiIntentInterpreter({ identity, apiKey: "test-only-key", model: "gpt-6-luna", allowedUserIds, rpc, fetchImpl });

test("AI interprets a normal request even when the old lexicon recognizes its category; cache is byte-stable", async () => {
  let stored; let fetches = 0; const calls = [];
  const run = interpreter(async (_url, options) => {
    fetches += 1; const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.ok(body.instructions.includes("context.visit_situations"));
    const variants = body.text.format.schema.properties.facets.items.anyOf;
    assert.equal(variants.length, PRODUCT_QUERY_CATALOG.length);
    for (const variant of variants) {
      const field = PRODUCT_QUERY_CATALOG.find((entry) => entry.key === variant.properties.key.const);
      assert.ok(field);
      assert.deepEqual(variant.properties.value.enum, field.values);
    }
    assert.equal(body.input, "Ausflug mit meiner 4 jährigen Tochter bei Regen");
    return modelResponse(semantics({ facets: [
      facet("classification.primary_category", "ACTIVITIES_PLAY", "Ausflug", "REQUIRED", "G1"),
      facet("classification.primary_category", "CULTURE_ARTS", "Ausflug", "REQUIRED", "G1"),
      facet("classification.primary_category", "ENTERTAINMENT", "Ausflug", "REQUIRED", "G1"),
      facet("context.visit_situations", "FAMILY", "Tochter"),
    ], indoorRequired: true, indoorEvidence: "Regen" }));
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
  assert.ok(first.explicit.hardConstraints.includes("WK_REQUIRED:G1:classification.primary_category:ACTIVITIES_PLAY"));
  assert.ok(first.explicit.softPreferences.includes("WK:context.visit_situations:FAMILY"));
  assert.equal(JSON.stringify(stored).includes("Tochter"), false);
  assert.equal(JSON.stringify(stored).includes("Regen"), false);
});

test("explicit user intent wins while AI still interprets the other dimensions", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "DRINKS", facets: [facet("context.atmosphere", "LIVELY", "lebhaft")] })), {
    async rpc(_name, parameters) { return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null }; },
  });
  const output = await run(request("lebhaft", { primaryIntent: "EAT" }), actor, new AbortController().signal);
  assert.equal(output.explicit.primaryIntent, "EAT");
  assert.ok(output.explicit.softPreferences.includes("WK:context.atmosphere:LIVELY"));
});

test("one query plan separates essential alternatives, optional taste and explicit exclusions", async () => {
  const run = interpreter(async () => modelResponse(semantics({ facets: [
    facet("classification.place_types", "MUSEUM", "Museum", "REQUIRED", "G1"),
    facet("classification.place_types", "CINEMA", "Kino", "REQUIRED", "G1"),
    facet("context.atmosphere", "QUIET", "ruhig"),
    facet("classification.primary_category", "EAT", "kein Restaurant", "EXCLUDED"),
  ] })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Museum oder Kino, ruhig, kein Restaurant"), actor, new AbortController().signal);
  assert.deepEqual(output.explicit.hardConstraints, [
    "WK_EXCLUDED:X:classification.primary_category:EAT",
    "WK_REQUIRED:G1:classification.place_types:CINEMA",
    "WK_REQUIRED:G1:classification.place_types:MUSEUM",
  ]);
  assert.deepEqual(output.explicit.softPreferences, ["WK:context.atmosphere:QUIET"]);
});

test("an invented amenity exclusion cannot invert an outdoor request", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "NATURE_ANIMAL_EXPERIENCE", facets: [
    facet("classification.primary_category", "OUTDOOR_NATURE", "draußen", "REQUIRED", "G1"),
    facet("amenity.features", "OUTDOOR_SEATING", "draußen", "EXCLUDED"),
  ] })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("draußen spazieren und Tiere sehen"), actor, new AbortController().signal);
  assert.equal(output.explicit.hardConstraints.some((item) => item.includes("OUTDOOR_SEATING")), false);
});

test("asking for music does not require a verified music club", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "NIGHTLIFE", facets: [
    facet("classification.place_types", "MUSIC_CLUB", "Musik", "REQUIRED", "G1"),
    facet("offering.groups", "COCKTAILS", "Cocktails", "REQUIRED", "G2"),
  ] })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Cocktails und Musik nach 22 Uhr"), actor, new AbortController().signal);
  assert.deepEqual(output.explicit.hardConstraints, ["WK_REQUIRED:G2:offering.groups:COCKTAILS"]);
  assert.ok(output.explicit.softPreferences.includes("WK:classification.place_types:MUSIC_CLUB"));
});

test("a model cannot turn venue kind and requested offering into one OR gate", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "EAT", facets: [
    facet("classification.primary_category", "EAT", "Lunch", "REQUIRED", "G1"),
    facet("offering.groups", "LUNCH", "Lunch", "REQUIRED", "G1"),
  ] })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Lunch in Basel"), actor, new AbortController().signal);
  assert.deepEqual(output.explicit.hardConstraints, [
    "WK_REQUIRED:G1:classification.primary_category:EAT",
    "WK_REQUIRED:Q1:offering.groups:LUNCH",
  ]);
});

test("a qualitative price level never becomes a hard budget ceiling", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "EAT", facets: [
    facet("classification.primary_category", "EAT", "Mittag essen", "REQUIRED", "G1"),
    facet("operation.price_level", "LOW", "günstig", "REQUIRED", "G2"),
  ] })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Günstig Mittag essen"), actor, new AbortController().signal);
  assert.deepEqual(output.explicit.hardConstraints, ["WK_REQUIRED:G1:classification.primary_category:EAT"]);
  assert.ok(output.explicit.softPreferences.includes("WK:operation.price_level:LOW"));
});

test("one incomplete model response is retried within a fixed bound", async () => {
  let fetches = 0;
  const run = interpreter(async () => {
    fetches++;
    return fetches === 1 ? { ok: true, async json() { return { status: "incomplete", output: [] }; } }
      : modelResponse(semantics({ primaryIntent: "SPORT_MOVEMENT", facets: [facet("classification.place_types", "CLIMBING_GYM", "Klettern", "REQUIRED", "G1")] }));
  }, { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Indoor Klettern mit Freunden"), actor, new AbortController().signal);
  assert.equal(fetches, 2);
  assert.ok(output.explicit.hardConstraints.includes("WK_REQUIRED:G1:classification.place_types:CLIMBING_GYM"));
});

test("sparse company and evening context cannot become mandatory World facts", async () => {
  const run = interpreter(async () => modelResponse(semantics({ primaryIntent: "NIGHTLIFE", facets: [
    facet("classification.primary_category", "NIGHTLIFE", "einen drauf machen", "REQUIRED", "G1"),
    facet("context.visit_situations", "FRIENDS_GROUP", "homies", "REQUIRED", "G2"),
    facet("context.typical_dayparts", "EVENING", "heute Abend", "REQUIRED", "G3"),
    facet("context.atmosphere", "LIVELY", "einen drauf machen", "REQUIRED", "G4"),
  ] })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Mit den homies heute Abend einen drauf machen"), actor, new AbortController().signal);
  assert.deepEqual(output.explicit.hardConstraints, [
    "WK_REQUIRED:G1:classification.primary_category:DRINKS",
    "WK_REQUIRED:G1:classification.primary_category:NIGHTLIFE",
  ]);
  assert.deepEqual(output.explicit.softPreferences, [
    "WK:context.atmosphere:LIVELY", "WK:context.typical_dayparts:EVENING", "WK:context.visit_situations:FRIENDS_GROUP",
  ]);
});

test("AI core facets respect the intent ontology and broad activity alternatives", async () => {
  const rpc = { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } };
  const night = interpreter(async () => modelResponse(semantics({ primaryIntent: "NIGHTLIFE", facets: [
    facet("classification.primary_category", "NIGHTLIFE", "ausgehen", "REQUIRED", "G1"),
    facet("purpose.primary_visit", "COMMUNITY_SOCIAL", "homies", "REQUIRED", "G2"),
    facet("context.visit_situations", "FRIENDS_GROUP", "homies", "REQUIRED", "G3"),
  ] })), rpc);
  const nightOutput = await night(request("Mit den homies heute Abend einen drauf machen"), actor, new AbortController().signal);
  assert.deepEqual(nightOutput.explicit.hardConstraints, [
    "WK_REQUIRED:G1:classification.primary_category:DRINKS",
    "WK_REQUIRED:G1:classification.primary_category:NIGHTLIFE",
  ]);
  assert.ok(nightOutput.explicit.softPreferences.includes("WK:purpose.primary_visit:COMMUNITY_SOCIAL"));
  assert.ok(nightOutput.explicit.softPreferences.includes("WK:context.visit_situations:FRIENDS_GROUP"));

  const family = interpreter(async () => modelResponse(semantics({ facets: [
    facet("classification.primary_category", "ACTIVITIES_PLAY", "Ausflug"),
    facet("classification.primary_category", "CULTURE_ARTS", "Ausflug"),
    facet("classification.primary_category", "ENTERTAINMENT", "Ausflug"),
    facet("context.visit_situations", "FAMILY", "Tochter"),
  ] })), rpc);
  const familyOutput = await family(request("Ausflug mit meiner 4-jährigen Tochter bei Regen"), actor, new AbortController().signal);
  assert.deepEqual(familyOutput.explicit.hardConstraints, [
    "INDOOR_REQUIRED",
    "WK_REQUIRED:CORE:classification.primary_category:ACTIVITIES_PLAY",
    "WK_REQUIRED:CORE:classification.primary_category:CULTURE_ARTS",
    "WK_REQUIRED:CORE:classification.primary_category:ENTERTAINMENT",
  ]);

  const openEnded = interpreter(async () => modelResponse(semantics({ facets: [
    facet("classification.primary_category", "ACTIVITIES_PLAY", "etwas unternehmen"),
    facet("classification.primary_category", "CULTURE_ARTS", "etwas unternehmen"),
  ] })), rpc);
  const openOutput = await openEnded(request("Ich möchte irgendetwas unternehmen"), actor, new AbortController().signal);
  assert.deepEqual(openOutput.explicit.hardConstraints, []);
  assert.ok(openOutput.explicit.softPreferences.includes("WK:classification.primary_category:ACTIVITIES_PLAY"));

  const museum = interpreter(async () => modelResponse(semantics({ facets: [
    facet("classification.primary_category", "CULTURE_ARTS", "Museum", "REQUIRED", "G1"),
  ] })), rpc);
  const museumOutput = await museum(request("Museum besuchen"), actor, new AbortController().signal);
  assert.deepEqual(museumOutput.explicit.hardConstraints, ["WK_REQUIRED:G1:classification.primary_category:CULTURE_ARTS"]);

  const noBars = interpreter(async () => modelResponse(semantics({ primaryIntent: "NIGHTLIFE", facets: [
    facet("classification.primary_category", "NIGHTLIFE", "Club", "REQUIRED", "G1"),
    facet("classification.primary_category", "DRINKS", "keine Bar", "EXCLUDED"),
  ] })), rpc);
  const noBarsOutput = await noBars(request("Club, aber keine Bar"), actor, new AbortController().signal);
  assert.deepEqual(noBarsOutput.explicit.hardConstraints, [
    "WK_EXCLUDED:X:classification.primary_category:DRINKS",
    "WK_REQUIRED:G1:classification.primary_category:NIGHTLIFE",
  ]);

  const concreteVenue = interpreter(async () => modelResponse(semantics({ primaryIntent: "NIGHTLIFE", facets: [
    facet("classification.place_types", "BAR", "Bar", "REQUIRED", "G1"),
    facet("classification.primary_category", "NIGHTLIFE", "ausgehen", "REQUIRED", "G2"),
  ] })), rpc);
  const concreteOutput = await concreteVenue(request("Abends in eine Bar gehen"), actor, new AbortController().signal);
  assert.deepEqual(concreteOutput.explicit.hardConstraints, ["WK_REQUIRED:G1:classification.place_types:BAR"]);
  assert.ok(concreteOutput.explicit.softPreferences.includes("WK:classification.primary_category:NIGHTLIFE"));
});

test("an unambiguous rain phrase remains an indoor requirement if the model misses it", async () => {
  const run = interpreter(async () => modelResponse(semantics()), {
    async rpc(_name, parameters) { return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null }; },
  });
  const output = await run(request("Ausflug bei Regen"), actor, new AbortController().signal);
  assert.ok(output.explicit.hardConstraints.includes("INDOOR_REQUIRED"));
});

test("ordinary model paraphrases and group formatting do not abort the Decision", async () => {
  const run = interpreter(async () => modelResponse(semantics({
    primaryIntent: "ACTIVITY_EXPERIENCE", secondaryIntent: "ACTIVITY_EXPERIENCE",
    facets: [
      facet("classification.primary_category", "ACTIVITIES_PLAY", "family outing", "REQUIRED"),
      facet("classification.primary_category", "CULTURE_ARTS", "family outing", "REQUIRED", "g1"),
      facet("context.visit_situations", "FAMILY", "four-year-old daughter", "PREFERRED", "G9"),
    ], indoorRequired: true, indoorEvidence: "rainy weather",
  })), { async rpc(_name, parameters) {
    return { data: parameters.p_write ? { status: "HIT", semantics: parameters.p_semantics } : { status: "MISS" }, error: null };
  } });
  const output = await run(request("Ausflug mit meiner 4-jährigen Tochter bei Regen"), actor, new AbortController().signal);
  assert.equal(output.explicit.secondaryIntent, null);
  assert.ok(output.explicit.hardConstraints.includes("WK_REQUIRED:G1:classification.primary_category:ACTIVITIES_PLAY"));
  assert.ok(output.explicit.hardConstraints.includes("WK_REQUIRED:G1:classification.primary_category:CULTURE_ARTS"));
  assert.ok(output.explicit.hardConstraints.includes("INDOOR_REQUIRED"));
  assert.ok(output.explicit.softPreferences.includes("WK:context.visit_situations:FAMILY"));
});

test("unknown values and invented Spot fields still fail before ranking", async () => {
  for (const invalid of [
    semantics({ facets: [facet("context.atmosphere", "PARTY_HARD", "homies")] }),
    semantics({ facets: [facet("imaginary.place", "ANY", "homies")] }),
    { ...semantics(), spotId: "unverified" },
    semantics({ facets: [facet("context.atmosphere", "LIVELY", "x".repeat(121))] }),
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
