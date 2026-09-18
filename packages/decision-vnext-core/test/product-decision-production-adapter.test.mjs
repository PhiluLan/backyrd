import test from "node:test";
import assert from "node:assert/strict";
import {
  DECISION_PRODUCT_PRODUCTION_RPCS,
  DECISION_PRODUCT_RUNTIME_CONTROL_VERSION,
  createDecisionProductProductionPorts,
  createDecisionProductRpcInteractionAuthorityProvider,
} from "../dist/index.js";

const hash = (value) => value.repeat(64);
const now = "2026-09-18T15:00:00.000Z";
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const identity = { releaseHash: hash("a"), artifactHash: hash("b"), sourceSetHash: hash("c"), controlGeneration: 7 };
const configuration = {
  identity,
  rateLimitOperation: "decision_v13_product",
  rateLimitSubjectKeyVersion: "rate-key-v1",
  rateLimitSubjectKey: "r".repeat(32),
  idempotencyKeyVersion: "idempotency-key-v1",
  idempotencyKey: "i".repeat(32),
  subjectMinuteLimit: 20,
  subjectDayLimit: 500,
  globalMinuteLimit: 300,
  globalDayLimit: 20_000,
};

const token = (() => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256", typ: "JWT" })}.${encode({
    sub: userId, session_id: sessionId, iat: 1_789_743_000, exp: 1_789_746_000,
    role: "authenticated", aud: "authenticated",
  })}.signature`;
})();

function harness(overrides = {}) {
  const calls = [];
  const rpc = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === DECISION_PRODUCT_PRODUCTION_RPCS.control) return { data: {
        contractVersion: DECISION_PRODUCT_RUNTIME_CONTROL_VERSION,
        state: "ON", enabled: true, killSwitch: false, generation: identity.controlGeneration,
        releaseHash: identity.releaseHash, artifactHash: identity.artifactHash, sourceSetHash: identity.sourceSetHash,
        ...(overrides.control ?? {}),
      }, error: null };
      if (name === DECISION_PRODUCT_PRODUCTION_RPCS.rateLimit) return { data: { allowed: true }, error: null };
      throw new Error(`unexpected_rpc:${name}`);
    },
  };
  const ports = createDecisionProductProductionPorts({
    rpc,
    authClient: { async getUser() { return { user: { id: userId, role: "authenticated", is_anonymous: false }, error: null }; } },
    evaluationProvider: { contractVersion: "backyrd.decision-vnext.product-canonical-evaluation-provider@1.0", async evaluate() { throw new Error("not_used"); } },
    interactionAuthority: { contractVersion: "backyrd.decision-vnext.product-interaction-authority-provider@1.0", async resolve() { return { status: "SUPPRESSED_NO_CONSENT" }; } },
    learningPort: { contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0", async record() { throw new Error("not_used"); } },
    configuration,
    now: () => new Date(now),
  });
  return { ports, calls };
}

test("binds verified Auth, exact dynamic control and Gate-7 without an allowlist", async () => {
  const { ports, calls } = harness();
  await ports.control.assertBoundary("REQUEST_START", new AbortController().signal);
  const actor = await ports.auth.authenticate(token, new AbortController().signal);
  assert.equal(actor?.userId, userId);
  assert.equal(actor?.sessionId, sessionId);
  assert.equal(await ports.rateLimit.consume(actor.subjectBindingHash, new AbortController().signal), true);
  assert.deepEqual(calls.map((call) => call.name), [DECISION_PRODUCT_PRODUCTION_RPCS.control, DECISION_PRODUCT_PRODUCTION_RPCS.rateLimit]);
  assert.deepEqual(calls[0].parameters, {
    p_release_hash: identity.releaseHash, p_artifact_hash: identity.artifactHash,
    p_source_set_hash: identity.sourceSetHash, p_generation: identity.controlGeneration,
  });
  assert.notEqual(calls[1].parameters.p_subject_key, userId);
  assert.match(calls[1].parameters.p_subject_key, /^[a-f0-9]{64}$/);
});

test("control fails closed on OFF, kill switch and identity drift", async () => {
  for (const control of [
    { state: "OFF", enabled: false, killSwitch: true },
    { releaseHash: hash("f") },
    { generation: 8 },
  ]) {
    const { ports } = harness({ control });
    await assert.rejects(ports.control.assertBoundary("EVALUATION", new AbortController().signal), /product_runtime_control_denied/);
  }
});

test("interaction RPC accepts only server-authorized or exact no-consent suppression", async () => {
  const actor = { userId, subjectBindingHash: hash("d"), authenticationContextHash: hash("e"), sessionBindingHash: hash("f"), sessionId };
  const request = { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId: "action-1", idempotencyKey: "idem-1", decisionId: "decision-1", eventType: "candidate_opened", candidateId: "spot-1" };
  const call = async (data) => createDecisionProductRpcInteractionAuthorityProvider({ rpc: async () => ({ data, error: null }) })
    .resolve({ request, actor, identity, signal: new AbortController().signal });
  assert.deepEqual(await call({ status: "SUPPRESSED_NO_CONSENT" }), { status: "SUPPRESSED_NO_CONSENT" });
  assert.deepEqual(await call({ status: "AUTHORIZED", sessionId, contextBindingHash: hash("1"), spotId: "spot-1", occurredAt: now }), {
    status: "AUTHORIZED", sessionId, contextBindingHash: hash("1"), spotId: "spot-1", occurredAt: now,
  });
  await assert.rejects(call({ status: "AUTHORIZED", sessionId, contextBindingHash: hash("1"), spotId: "spot-2", occurredAt: now }), /authority_invalid/);
});

test("configuration rejects missing identities and weak server keys", () => {
  const make = (next) => createDecisionProductProductionPorts({
    rpc: { rpc: async () => ({ data: null, error: null }) },
    authClient: { getUser: async () => ({ user: null, error: null }) },
    evaluationProvider: { contractVersion: "backyrd.decision-vnext.product-canonical-evaluation-provider@1.0", evaluate: async () => { throw new Error("unused"); } },
    interactionAuthority: { contractVersion: "backyrd.decision-vnext.product-interaction-authority-provider@1.0", resolve: async () => ({ status: "SUPPRESSED_NO_CONSENT" }) },
    learningPort: { contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0", record: async () => { throw new Error("unused"); } },
    configuration: next,
  });
  assert.throws(() => make({ ...configuration, identity: { ...identity, releaseHash: "bad" } }), /release_hash_invalid/);
  assert.throws(() => make({ ...configuration, idempotencyKey: "short" }), /idempotency_key_invalid/);
});
