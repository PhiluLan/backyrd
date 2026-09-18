import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  FOUNDER_COHORT_VERSION, FOUNDER_EVALUATION_SCOPE, REGISTRY_HASH, REGISTRY_VERSION,
} from "@backyrd/world-knowledge-core";
import {
  FOUNDER_LIVE_API_VERSIONS, FOUNDER_LIVE_RELEASE, SyntheticUserProjectionReader, SyntheticWorldKnowledgeReader,
  FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, canonicalJson, contentHash, createCanonicalFounderLiveEvaluator, createFounderLiveHttpHandler, createFounderLivePostDeployEvidence,
  createFounderLivePrivateUuidAllowlistFromEnvironment, createFounderLivePrivateUuidAllowlistPort, createFounderLiveSupabaseAuthPort,
  createFounderLiveServerRuntimeControl,
  executeFounderLiveDecision, executeFounderLiveDualRun, generateSyntheticWorld,
} from "../dist/index.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "../dist/synthetic-world-policy.js";

const VERIFIED_USER_ID = randomUUID();
const SESSION_ID = randomUUID();
const SUBJECT_HASH = contentHash({ namespace: "founder-live-subject@1.0", verifiedUserId: VERIFIED_USER_ID });
const ACTOR = Object.freeze({ userId: VERIFIED_USER_ID, subjectBindingHash: SUBJECT_HASH, authenticationContextHash: contentHash("founder-live-auth"), sessionBindingHash: contentHash("founder-live-session"), issuedAt: "2026-09-17T00:00:00.000Z", expiresAt: "2027-01-15T08:00:00.000Z", expertAccess: true });
const AUTHORIZED_ACTOR = Object.freeze({ ...ACTOR, allowlistAuthorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, allowlistDecisionHash: contentHash("founder-live-allowlist-decision") });
const world = generateSyntheticWorld({ configVersion: "backyrd-vnext-sandbox-config-v1", worldVersion: "backyrd-vnext-synthetic-world-founder-live-api", seed: 3101, observedAt: "2026-09-17T18:00:00.000Z", spotCount: 12, userCount: 3, cities: ["Zurich", "Basel"], candidatePoolSize: 8 });
const selected = [...world.spots].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 5);
const manifestBody = {
  contractVersion: FOUNDER_COHORT_VERSION, scope: FOUNDER_EVALUATION_SCOPE, cohortId: "founder-live-local-cohort-1", frozenAt: world.observedAt,
  registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion, policyHash: SYNTHETIC_WORLD_SOURCE_POLICY.policyHash,
  spots: selected.map((spot) => ({ spotId: spot.id, manifestHash: contentHash(`manifest:${spot.id}`), snapshotHash: spot.snapshot.snapshotHash, contextHandoffHash: contentHash(`context:${spot.id}`) })),
  exclusions: ["ADMIN_NOTES", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "SUBSCRIPTION"],
};
const manifest = Object.freeze({ ...manifestBody, cohortHash: contentHash(manifestBody) });

function durablePort(records = new Map()) {
  return { contractVersion: "backyrd.decision-vnext.founder-live-durable-idempotency-port@1.0", async commit(input) { const key = `${input.subjectBindingHash}:${input.idempotencyKey}`; const prior = records.get(key); const timestamps = { createdAt: world.observedAt, expiresAt: "2026-09-18T18:00:00.000Z" }; if (!prior) { records.set(key, { payloadHash: input.payloadHash, execution: input.execution }); return { status: "CREATED", responseHash: contentHash(input.execution), ...timestamps }; } if (prior.payloadHash !== input.payloadHash) return { status: "CONFLICT", ...timestamps }; return { status: "REPLAYED", responseHash: contentHash(prior.execution), execution: prior.execution, ...timestamps }; } };
}

function ports(overrides = {}, durableRecords = new Map()) {
  const state = { killed: false };
  return {
    state,
    auth: { contractVersion: "backyrd.decision-vnext.founder-live-auth-port@2.0", async authenticate(token) { return token === "local-founder-token" ? ACTOR : null; } }, allowlist: { contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0", async authorize() { return { authorized: true, authorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, decisionHash: AUTHORIZED_ACTOR.allowlistDecisionHash }; } },
    authority: { contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0", async bind({ actor, requestedCity }) { return { serverTime: world.observedAt, authorizedCity: requestedCity, locationBindingHash: contentHash({ requestedCity, authorizedCity: requestedCity, subjectBindingHash: actor.subjectBindingHash }) }; } },
    world: new SyntheticWorldKnowledgeReader(world), retrieval: { contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0", async retrieve() { return manifest; } }, user: new SyntheticUserProjectionReader("MISSING_SNAPSHOT"), evaluator: createCanonicalFounderLiveEvaluator(), userSnapshot: null,
    idempotency: durablePort(durableRecords),
    rateLimit: { contractVersion: "backyrd.decision-vnext.founder-live-rate-limit-port@1.0", async consume() { return true; } },
    control: { enabled: true, environment: "LOCAL_TEST", purpose: "FOUNDER_DECISION_EVALUATION", requestTimeoutMilliseconds: 2_000, maxRequestBytes: 16_384, isKillSwitchEngaged() { return state.killed; } },
    ...overrides,
  };
}

const request = (id, naturalLanguage, extra = {}) => ({ contractVersion: FOUNDER_LIVE_API_VERSIONS.request, requestId: `request-${id}`, idempotencyKey: `idem-${id}`, naturalLanguage, explicit: {}, alternativeRequested: false, rejectedCandidateIds: [], ...extra });

const jwt = (claims) => `${Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const validClaims = (overrides = {}) => ({ sub: VERIFIED_USER_ID, session_id: SESSION_ID, iat: 1_758_153_600, exp: 1_800_000_000, role: "authenticated", aud: "authenticated", ...overrides });

test("Supabase Auth is the sole session identity authority and ignores mutable metadata", async () => {
  const calls = [];
  const spoofedEmail = ["ignored", "example.invalid"].join("@");
  const auth = createFounderLiveSupabaseAuthPort({
    supabaseUrl: "http://127.0.0.1:54321",
    publishableKey: "synthetic-publishable-key",
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), authorization: init?.headers.authorization });
      return Response.json({ id: VERIFIED_USER_ID, aud: "authenticated", role: "authenticated", email: spoofedEmail, user_metadata: { founder: true, role: "admin", userId: randomUUID() } });
    },
  });
  const token = jwt(validClaims()); const actor = await auth.authenticate(token); const actorAfterMetadataChange = await auth.authenticate(token);
  assert(actor); assert.equal(actor.userId, VERIFIED_USER_ID); assert.equal(actor.expertAccess, false);
  assert.equal(canonicalJson(actor), canonicalJson(actorAfterMetadataChange));
  assert.equal(calls.length, 2); assert.equal(calls[0].url, "http://127.0.0.1:54321/auth/v1/user"); assert.equal(calls[0].authorization, `Bearer ${token}`);
  assert.equal(JSON.stringify(actor).includes(spoofedEmail), false);
  assert.equal(await auth.authenticate(jwt(validClaims({ exp: 1 }))), null, "expired tokens fail before the Auth request");
  assert.equal(await auth.authenticate(jwt(validClaims({ sub: randomUUID() }))), null, "Auth user and token subject must match");
  const rejected = createFounderLiveSupabaseAuthPort({ supabaseUrl: "https://example.supabase.co", publishableKey: "synthetic", fetchImpl: async () => new Response(null, { status: 401 }) });
  assert.equal(await rejected.authenticate(token), null);
});

test("private UUID authority requires exactly two external members and never serializes them", async () => {
  const second = randomUUID(); const secret = "s".repeat(48);
  const allowlist = createFounderLivePrivateUuidAllowlistPort({ memberUuids: [VERIFIED_USER_ID, second], bindingSecret: secret });
  const input = { verifiedUserId: VERIFIED_USER_ID, subjectBindingHash: SUBJECT_HASH, authenticationContextHash: ACTOR.authenticationContextHash, purpose: "FOUNDER_DECISION_EVALUATION", environment: "LOCAL_TEST" };
  const allowed = await allowlist.authorize(input); assert.equal(allowed.authorized, true); assert.equal(allowed.authorityVersion, FOUNDER_LIVE_SERVER_AUTHORITY_VERSION); assert.equal(JSON.stringify(allowed).includes(VERIFIED_USER_ID), false);
  assert.equal((await allowlist.authorize({ ...input, verifiedUserId: randomUUID() })).authorized, false);
  assert.equal((await allowlist.authorize({ ...input, subjectBindingHash: contentHash("forged") })).authorized, false);
  assert.throws(() => createFounderLivePrivateUuidAllowlistPort({ memberUuids: [VERIFIED_USER_ID], bindingSecret: secret }), /exactly_two/);
  assert.throws(() => createFounderLivePrivateUuidAllowlistFromEnvironment({}), /not_configured/);
  const fromEnvironment = createFounderLivePrivateUuidAllowlistFromEnvironment({ BACKYRD_FOUNDER_LIVE_UUID_ALLOWLIST: `${VERIFIED_USER_ID},${second}`, BACKYRD_FOUNDER_LIVE_AUTHORITY_BINDING_SECRET: secret });
  assert.equal((await fromEnvironment.authorize(input)).authorized, true);
});

test("server runtime defaults to OFF, zero shadow release and engaged kill switch", () => {
  const control = createFounderLiveServerRuntimeControl({});
  assert.equal(control.enabled, false); assert.equal(control.isKillSwitchEngaged(), true);
  assert.equal(FOUNDER_LIVE_RELEASE.shadowTraffic, false); assert.equal(FOUNDER_LIVE_RELEASE.samplingRate, 0);
  assert.equal(FOUNDER_LIVE_RELEASE.productionAuthorized, false); assert.equal(FOUNDER_LIVE_RELEASE.deploymentAuthorized, false);
});

test("server-bound execution is deterministic, port-only, evaluation-only and idempotent", async () => {
  const p = ports(); const value = request("a", "Ruhiges Restaurant in Zürich für ein erstes Date, höchstens 40 CHF pro Person");
  const one = await executeFounderLiveDecision(value, AUTHORIZED_ACTOR, p); const two = await executeFounderLiveDecision(value, AUTHORIZED_ACTOR, p);
  assert.equal(canonicalJson(one), canonicalJson(two));
  assert.equal(one.response.status, "EVALUATION_ONLY"); assert.equal(one.response.rankingState, "NOT_CONFIGURED");
  assert.equal(one.response.understood.primaryIntent, "Essen"); assert.equal(one.response.understood.occasion, "Erstes Date"); assert.equal(one.response.understood.targetCity, "Zurich");
  assert.equal(one.expert.envelope.boundaries.productionAuthorized, false); assert.equal(one.expert.envelope.boundaries.learningAuthorized, false); assert.equal(one.expert.envelope.boundaries.rankingAuthorized, false);
  assert.equal(one.expert.envelope.boundaries.executionAuthorized, false); assert.equal(one.expert.envelope.boundaries.externalProviderNetworkAuthorized, false); assert.equal(one.expert.envelope.boundaries.productOutputAuthorized, false); assert.equal(one.expert.envelope.boundaries.eligibilityAuthority, false); assert.equal(one.expert.envelope.boundaries.confidenceAuthority, false);
  assert.equal("userId" in one.expert.envelope.actor, false); assert.equal(JSON.stringify(one).includes(VERIFIED_USER_ID), false);
  assert.equal("decisionId" in one.response, false); assert.equal("requestId" in one.response, false);
  assert.equal(JSON.stringify(one.response).includes("reasonCode"), false); assert.equal(JSON.stringify(one.response).includes("candidateId"), false); assert.equal(JSON.stringify(one.response).includes("Hash"), false);
});

test("durable idempotency is atomic across concurrent calls and restart-like port instances", async () => {
  const records = new Map(); const value = request("durable-race", "Café in Basel");
  const [left, right] = await Promise.all([executeFounderLiveDecision(value, AUTHORIZED_ACTOR, ports({}, records)), executeFounderLiveDecision(value, AUTHORIZED_ACTOR, ports({}, records))]);
  assert.equal(canonicalJson(left), canonicalJson(right)); assert.equal(records.size, 1);
  const afterRestart = await executeFounderLiveDecision(value, AUTHORIZED_ACTOR, ports({}, records));
  assert.equal(canonicalJson(afterRestart), canonicalJson(left));
});

test("durable replay is recursively validated and semantic tampering fails closed", async () => {
  const valid = await executeFounderLiveDecision(request("tamper-source", "Café in Basel"), AUTHORIZED_ACTOR, ports());
  const tampered = { ...valid, response: { ...valid.response, rankingState: "NOT_CONFIGURED", limitations: [...valid.response.limitations, "Manipuliert"] } };
  const idempotency = { contractVersion: "backyrd.decision-vnext.founder-live-durable-idempotency-port@1.0", async commit() { return { status: "REPLAYED", responseHash: contentHash(tampered), execution: tampered, createdAt: world.observedAt, expiresAt: "2026-09-18T18:00:00.000Z" }; } };
  await assert.rejects(() => executeFounderLiveDecision(request("tampered-replay", "Café in Basel"), AUTHORIZED_ACTOR, ports({ idempotency })), /IDEMPOTENCY_REPLAY_INVALID/);
});

test("A-D, family, bouldering, flip, alternative, reject and replay use the same API", async () => {
  const scenarios = [
    ["a2", "Ruhiges Restaurant in Zürich für ein erstes Date, höchstens 40 CHF pro Person", "Essen", "Zurich"],
    ["b", "Familienessen in Basel mit 12-jährigem Kind und Erwachsenen", "Essen", "Basel"],
    ["c", "Rollstuhlgerechtes gemütliches Café in Basel", "Kaffee", "Basel"],
    ["d", "Restaurant in Zürich", "Essen", "Zurich"],
    ["family", "Familienausflug in Basel am Nachmittag", "Familienausflug", "Basel"],
    ["boulder", "Bouldern in Basel mit Familie", "Bouldern", "Basel"],
    ["flip", "Lebhafte Bar in Basel mit Freunden", "Bar oder Nachtleben", "Basel"],
  ];
  for (const [id, text, intent, city] of scenarios) { const result = await executeFounderLiveDecision(request(id, text), AUTHORIZED_ACTOR, ports()); assert.equal(result.response.understood.primaryIntent, intent); assert.equal(result.response.understood.targetCity, city); assert.equal(result.response.candidates.length, 5); }
  const alternative = await executeFounderLiveDecision(request("alt", "Café in Basel", { alternativeRequested: true }), AUTHORIZED_ACTOR, ports()); assert.equal(alternative.response.alternative.requested, true); assert.equal(alternative.response.alternative.negativeSignalProduced, false);
  const rejected = await executeFounderLiveDecision(request("reject", "Café in Basel", { rejectedCandidateIds: [selected[0].id] }), AUTHORIZED_ACTOR, ports()); assert.equal(rejected.response.reject.contextualOnly, true); assert.equal(rejected.response.reject.userLearningProduced, false); assert(rejected.response.candidates.some((row) => row.group === "FUER_DIESE_ANFRAGE_ABGEWAEHLT"));
  const replay = await executeFounderLiveDecision(request("replay", "Café in Basel"), AUTHORIZED_ACTOR, ports()); const rebuilt = await executeFounderLiveDecision(request("replay", "Café in Basel"), AUTHORIZED_ACTOR, ports()); assert.equal(canonicalJson(replay), canonicalJson(rebuilt));
});

test("client authority injection, bad auth, versions, locations, limits and kill switch fail closed", async () => {
  for (const privileged of [
    { userId: "other" }, { email: ["forged", "invalid.test"].join("@") }, { role: "founder" }, { user_metadata: { founder: true } },
    { worldSnapshot: {} }, { releaseAuthority: true }, { allowlist: ["self"] }, { locationAuthority: "Basel" },
  ]) await assert.rejects(() => executeFounderLiveDecision({ ...request(`inject-${Object.keys(privileged)[0]}`, "Café in Basel"), ...privileged }, AUTHORIZED_ACTOR, ports()));
  await assert.rejects(() => executeFounderLiveDecision({ ...request("version", "Café in Basel"), contractVersion: "future" }, AUTHORIZED_ACTOR, ports()));
  const mismatch = ports({ authority: { contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0", async bind({ actor, requestedCity }) { return { serverTime: world.observedAt, authorizedCity: "Zurich", locationBindingHash: contentHash({ requestedCity, authorizedCity: "Zurich", subjectBindingHash: actor.subjectBindingHash }) }; } } });
  await assert.rejects(() => executeFounderLiveDecision(request("scope", "Café in Basel"), AUTHORIZED_ACTOR, mismatch), /LOCATION_AUTHORITY_MISMATCH/);
  const killed = ports(); killed.state.killed = true; await assert.rejects(() => executeFounderLiveDecision(request("killed", "Café in Basel"), AUTHORIZED_ACTOR, killed), /KILL_SWITCH_ENGAGED/);
  const handler = createFounderLiveHttpHandler(ports());
  const unauthorized = await handler(new Request("http://local/v1/decision/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request("unauth", "Café in Basel")) })); assert.equal(unauthorized.status, 401);
  const malformed = await handler(new Request("http://local/v1/decision/evaluate", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token" }, body: "{" })); assert.equal(malformed.status, 400);
  const limited = createFounderLiveHttpHandler(ports({ rateLimit: { contractVersion: "backyrd.decision-vnext.founder-live-rate-limit-port@1.0", async consume() { return false; } } }));
  assert.equal((await limited(new Request("http://local/v1/decision/evaluate", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token" }, body: JSON.stringify(request("rate", "Café in Basel")) }))).status, 429);
  let deniedRateCalls = 0;
  const notAllowed = createFounderLiveHttpHandler(ports({ allowlist: { contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0", async authorize() { return { authorized: false, authorityVersion: FOUNDER_LIVE_SERVER_AUTHORITY_VERSION, decisionHash: contentHash("denied") }; } }, rateLimit: { contractVersion: "backyrd.decision-vnext.founder-live-rate-limit-port@1.0", async consume() { deniedRateCalls += 1; return true; } } }));
  assert.equal((await notAllowed(new Request("http://local/v1/decision/evaluate", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token" }, body: JSON.stringify(request("allow", "Café in Basel")) }))).status, 403);
  assert.equal(deniedRateCalls, 0, "private membership must be checked before subject-scoped rate state");
  const idemPorts = ports(); await executeFounderLiveDecision(request("same", "Café in Basel"), AUTHORIZED_ACTOR, idemPorts);
  await assert.rejects(() => executeFounderLiveDecision({ ...request("same", "Bar in Basel"), requestId: "request-same-two" }, AUTHORIZED_ACTOR, idemPorts), /IDEMPOTENCY_CONFLICT/);
});

test("Gate-7 rate limiting remains separate and every durable replay consumes it first", async () => {
  const records = new Map(); let rateLimitCalls = 0;
  const rateLimit = { contractVersion: "backyrd.decision-vnext.founder-live-rate-limit-port@1.0", async consume() { rateLimitCalls += 1; return rateLimitCalls <= 2; } };
  const handler = createFounderLiveHttpHandler(ports({ rateLimit }, records));
  const body = JSON.stringify(request("rate-before-replay", "Café in Basel"));
  const call = () => handler(new Request("http://local/v1/decision/evaluate", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token" }, body }));
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 429, "a durable replay must not bypass the separate rate-limit gate");
  assert.equal(rateLimitCalls, 3);
  assert.equal(records.size, 1, "rate limiting and idempotency retain separate durable state");
});

test("Emergency OFF during an in-flight authority check prevents every later read and output", async () => {
  const p = ports(); let retrievals = 0; let projections = 0; let evaluations = 0;
  p.authority = { contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0", async bind({ actor, requestedCity }) { p.state.killed = true; return { serverTime: world.observedAt, authorizedCity: requestedCity, locationBindingHash: contentHash({ requestedCity, authorizedCity: requestedCity, subjectBindingHash: actor.subjectBindingHash }) }; } };
  p.retrieval = { contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0", async retrieve() { retrievals += 1; return manifest; } };
  p.user = { contractVersion: "backyrd.user-intelligence.decision-projection-port@1.0", async read() { projections += 1; throw new Error("must not run"); } };
  p.evaluator = { ...createCanonicalFounderLiveEvaluator(), async evaluate() { evaluations += 1; throw new Error("must not run"); } };
  await assert.rejects(() => executeFounderLiveDecision(request("mid-flight-off", "Café in Basel"), ACTOR, p), /KILL_SWITCH_ENGAGED/);
  assert.deepEqual({ retrievals, projections, evaluations }, { retrievals: 0, projections: 0, evaluations: 0 });
});

test("actual localhost HTTP boundary authenticates, separates expert provenance and has no external calls", async () => {
  const handler = createFounderLiveHttpHandler(ports());
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const req = new Request(`http://127.0.0.1${incoming.url}`, { method: incoming.method, headers: incoming.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const response = await handler(req); outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); const url = `http://127.0.0.1:${address.port}/v1/decision/evaluate`; const payload = JSON.stringify(request("http", "Café in Basel"));
    const normal = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token" }, body: payload }); assert.equal(normal.status, 200); assert.equal((await normal.json()).contractVersion, FOUNDER_LIVE_API_VERSIONS.response);
    const expert = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token", "x-backyrd-expert-view": "true" }, body: payload }); assert.equal(expert.status, 200); assert.equal((await expert.json()).contractVersion, FOUNDER_LIVE_API_VERSIONS.expert);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("Mobile and Desktop traverse Supabase session verification and the private UUID authority before the same API", async () => {
  const token = jwt(validClaims()); const second = randomUUID();
  const auth = createFounderLiveSupabaseAuthPort({
    supabaseUrl: "http://127.0.0.1:54321", publishableKey: "synthetic-publishable-key", now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetchImpl: async () => Response.json({ id: VERIFIED_USER_ID, aud: "authenticated", role: "authenticated", user_metadata: { founder: false } }),
  });
  const allowlist = createFounderLivePrivateUuidAllowlistPort({ memberUuids: [VERIFIED_USER_ID, second], bindingSecret: "b".repeat(48) });
  const handler = createFounderLiveHttpHandler(ports({ auth, allowlist }));
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const req = new Request(`http://127.0.0.1${incoming.url}`, { method: incoming.method, headers: incoming.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const response = await handler(req); outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); const url = `http://127.0.0.1:${address.port}/v1/decision/evaluate`;
    for (const surface of ["MOBILE", "DESKTOP"]) {
      const payload = JSON.stringify(request(`surface-${surface.toLowerCase()}`, "Café in Basel"));
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-backyrd-client-surface": surface }, body: payload });
      assert.equal(response.status, 200); const responseText = await response.text(); const parsed = JSON.parse(responseText);
      assert.equal(parsed.contractVersion, FOUNDER_LIVE_API_VERSIONS.response); assert.equal(parsed.status, "EVALUATION_ONLY");
      assert.equal(responseText.includes(VERIFIED_USER_ID), false); assert.equal(responseText.includes("Hash"), false);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("missing user projection degrades neutrally, port failures close, timeout is bounded and no deploy is claimed", async () => {
  const neutral = await executeFounderLiveDecision(request("neutral", "Café in Basel"), AUTHORIZED_ACTOR, ports()); assert.equal(neutral.expert.provenance.userProjectionHash.length, 64);
  const brokenWorld = ports({ world: { contractVersion: "backyrd.world-knowledge.reader-port@1.0", async readSnapshot() { throw new Error("unavailable"); } } });
  await assert.rejects(() => executeFounderLiveDecision(request("world-down", "Café in Basel"), AUTHORIZED_ACTOR, brokenWorld));
  let retrievalsAfterTimeout = 0;
  const slow = ports({ authority: { contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0", async bind({ actor, requestedCity }) { await new Promise((resolve) => setTimeout(resolve, 25)); return { serverTime: world.observedAt, authorizedCity: requestedCity, locationBindingHash: contentHash({ requestedCity, authorizedCity: requestedCity, subjectBindingHash: actor.subjectBindingHash }) }; } }, retrieval: { contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0", async retrieve() { retrievalsAfterTimeout += 1; return manifest; } }, control: { enabled: true, environment: "PROD_LIKE_TEST", purpose: "FOUNDER_DECISION_EVALUATION", requestTimeoutMilliseconds: 2, maxRequestBytes: 16_384, isKillSwitchEngaged() { return false; } } });
  const timeoutResponse = await createFounderLiveHttpHandler(slow)(new Request("http://local/v1/decision/evaluate", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-founder-token" }, body: JSON.stringify(request("timeout", "Café in Basel")) })); assert.equal(timeoutResponse.status, 504);
  await new Promise((resolve) => setTimeout(resolve, 35)); assert.equal(retrievalsAfterTimeout, 0, "timed-out execution must not continue into World retrieval");
  const evidence = createFounderLivePostDeployEvidence(contentHash("source-aware-plan-no-go")); assert.equal(evidence.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"); assert.equal(evidence.deploymentExecuted, false); assert.equal(FOUNDER_LIVE_RELEASE.productionAuthorized, false);
});

test("dual run is deterministic, local/prod-like only and cannot produce Product output or learning", async () => {
  const value = request("dual", "Café in Basel");
  const one = await executeFounderLiveDualRun({ request: value, actor: AUTHORIZED_ACTOR, primary: ports(), comparator: ports() });
  const two = await executeFounderLiveDualRun({ request: value, actor: AUTHORIZED_ACTOR, primary: ports(), comparator: ports() });
  assert.equal(canonicalJson(one), canonicalJson(two)); assert.equal(one.semanticResponseEquivalent, true);
  assert.equal(one.productOutputProduced, false); assert.equal(one.durableWriteProduced, false); assert.equal(one.learningProduced, false);
  assert.equal(one.productQualityClaim, false); assert.equal(one.rankingClaim, false);
});

test("default OFF and evaluator version drift fail closed before World evaluation", async () => {
  const disabled = ports({ control: { enabled: false, environment: "LOCAL_TEST", purpose: "FOUNDER_DECISION_EVALUATION", requestTimeoutMilliseconds: 2_000, maxRequestBytes: 16_384, isKillSwitchEngaged() { return false; } } });
  await assert.rejects(() => executeFounderLiveDecision(request("off", "Café in Basel"), AUTHORIZED_ACTOR, disabled), /API_DISABLED/);
  const drift = ports({ evaluator: { ...createCanonicalFounderLiveEvaluator(), contractVersion: "backyrd.decision-vnext.founder-live-evaluator-port@2.0" } });
  await assert.rejects(() => executeFounderLiveDecision(request("drift", "Café in Basel"), AUTHORIZED_ACTOR, drift), /SERVER_PORT_VERSION_UNSUPPORTED/);
});
