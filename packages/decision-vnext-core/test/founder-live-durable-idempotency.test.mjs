import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalJson, createFounderLiveDurableIdempotencyPort } from "../dist/index.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const bindings = { releaseHash: "a".repeat(64), artifactHash: "b".repeat(64), sourceSetHash: "c".repeat(64), responseContractVersion: "backyrd.decision-vnext.founder-live-execution@1.0", hmacSecret: "private-test-secret-that-is-at-least-thirty-two-bytes" };
const execution = { response: { status: "EVALUATION_ONLY" }, expert: { expertHash: "d".repeat(64) } };
const input = { subjectBindingHash: "e".repeat(64), idempotencyKey: "request-key", payloadHash: "f".repeat(64), execution };
const timestamps = { createdAt: "2026-09-18T10:00:00.000Z", expiresAt: "2026-09-19T10:00:00.000Z" };

test("durable port sends only purpose-bound digests and sealed bindings", async () => {
  let call;
  const port = createFounderLiveDurableIdempotencyPort({ async rpc(name, parameters) { call = { name, parameters }; return { data: { status: "CREATED", responseHash: hash(canonicalJson(execution)), ...timestamps }, error: null }; } }, bindings);
  const result = await port.commit(input);
  assert.equal(result.status, "CREATED"); assert.equal(call.name, "backyrd_founder_live_idempotency_commit_v1");
  assert.equal(call.parameters.p_subject_digest.length, 64); assert.equal(call.parameters.p_idempotency_key_digest.length, 64);
  assert.equal(JSON.stringify(call).includes(input.idempotencyKey), false); assert.equal(JSON.stringify(call).includes(input.subjectBindingHash), false);
  assert.equal(call.parameters.p_release_hash, bindings.releaseHash); assert.equal(call.parameters.p_artifact_hash, bindings.artifactHash); assert.equal(call.parameters.p_source_set_hash, bindings.sourceSetHash);
  assert.equal(call.parameters.p_ttl_seconds, 86400); assert.equal(call.parameters.p_response_hash, hash(call.parameters.p_response_envelope_bytes));
});

test("durable port returns verified byte-identical replay and preserves conflict/expiry", async () => {
  const bytes = canonicalJson(execution); const responseHash = hash(bytes); let status = "REPLAYED";
  const port = createFounderLiveDurableIdempotencyPort({ async rpc() { return { data: status === "REPLAYED" ? { status, responseHash, responseEnvelopeBytes: bytes, ...timestamps } : { status, ...timestamps }, error: null }; } }, bindings);
  const replay = await port.commit(input); assert.equal(replay.status, "REPLAYED"); assert.equal(canonicalJson(replay.execution), bytes);
  status = "CONFLICT"; assert.equal((await port.commit(input)).status, "CONFLICT");
  status = "EXPIRED"; assert.equal((await port.commit(input)).status, "EXPIRED");
});

test("durable port fails closed on binding, RPC, status and replay tampering", async () => {
  assert.throws(() => createFounderLiveDurableIdempotencyPort({}, { ...bindings, releaseHash: "0" }), /release_hash_invalid/);
  assert.throws(() => createFounderLiveDurableIdempotencyPort({}, { ...bindings, hmacSecret: "short" }), /secret_too_short/);
  assert.throws(() => createFounderLiveDurableIdempotencyPort({}, { ...bindings, ttlSeconds: 86401 }), /ttl_invalid/);
  const cases = [
    { data: null, error: { message: "secret detail" }, match: /rpc_failed/ },
    { data: { status: "UNKNOWN", ...timestamps }, error: null, match: /status_invalid/ },
    { data: { status: "CREATED", responseHash: "0".repeat(64), ...timestamps }, error: null, match: /created_hash_mismatch/ },
    { data: { status: "REPLAYED", responseHash: hash("{}"), responseEnvelopeBytes: "{tampered", ...timestamps }, error: null, match: /replay_hash_mismatch/ },
  ];
  for (const fixture of cases) {
    const port = createFounderLiveDurableIdempotencyPort({ async rpc() { return fixture; } }, bindings);
    await assert.rejects(port.commit(input), fixture.match);
  }
});
