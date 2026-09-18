import test from "node:test";
import assert from "node:assert/strict";
import { createFounderLiveDurableRateLimitPort } from "../dist/founder-live-durable-rate-limit.js";

const hash = (digit) => digit.repeat(64);
const expected = Object.freeze({
  environment: "PRODUCTION",
  projectRef: "project-ref",
  functionHost: "https://project-ref.supabase.co/functions/v1/decision-founder-live",
  releaseHash: hash("a"),
  artifactHash: hash("b"),
  sourceSetHash: hash("c"),
  subjectKeyVersion: "founder-rate-key-v1",
});
const limits = Object.freeze({ subjectMinute: 2, subjectDay: 3, globalMinute: 4, globalDay: 5 });

function sharedRpc() {
  const counts = new Map();
  const calls = [];
  let unavailable = false;
  return {
    calls,
    setUnavailable(value) { unavailable = value; },
    async rpc(name, args) {
      calls.push({ name, args });
      if (unavailable) return { data: null, error: { message: "unavailable" } };
      const key = `${args.p_operation}:${args.p_subject_key}`;
      const count = counts.get(key) ?? 0;
      if (count >= args.p_subject_minute_limit) return { data: { allowed: false, blockedScope: "subject_minute" }, error: null };
      counts.set(key, count + 1);
      return { data: { allowed: true }, error: null };
    },
  };
}

function create(runtime, rpc, overrides = {}) {
  return createFounderLiveDurableRateLimitPort({
    rpc,
    expectedBinding: expected,
    loadRuntimeBinding: () => runtime.binding,
    loadSubjectKey: () => runtime.key,
    limits,
    assertActive: () => { if (!runtime.active) throw new Error("emergency_off"); },
    ...overrides,
  });
}

test("two instances and a restart share the durable atomic boundary", async () => {
  const rpc = sharedRpc();
  const runtime = { binding: expected, key: { version: expected.subjectKeyVersion, value: "x".repeat(48) }, active: true };
  const first = create(runtime, rpc);
  const second = create(runtime, rpc);
  assert.deepEqual(await Promise.all([first.consume(hash("1")), second.consume(hash("1"))]), [true, true]);
  assert.equal(await create(runtime, rpc).consume(hash("1")), false);
  assert.equal(rpc.calls.some((call) => JSON.stringify(call).includes(hash("1"))), false);
});

test("store outage, secret rotation, binding drift and emergency OFF fail closed", async () => {
  const rpc = sharedRpc();
  const runtime = { binding: expected, key: { version: expected.subjectKeyVersion, value: "x".repeat(48) }, active: true };
  const port = create(runtime, rpc);
  rpc.setUnavailable(true);
  await assert.rejects(() => port.consume(hash("1")), /store_unavailable/);
  rpc.setUnavailable(false);
  runtime.key = { version: "rotated-without-seal", value: "y".repeat(48) };
  await assert.rejects(() => port.consume(hash("1")), /subject_key_drift/);
  runtime.key = { version: expected.subjectKeyVersion, value: "x".repeat(48) };
  runtime.binding = { ...expected, artifactHash: hash("d") };
  await assert.rejects(() => port.consume(hash("1")), /binding_drift/);
  runtime.binding = expected;
  runtime.active = false;
  await assert.rejects(() => port.consume(hash("1")), /emergency_off/);
});

test("revocation after the awaited RPC is rechecked before returning", async () => {
  const runtime = { binding: expected, key: { version: expected.subjectKeyVersion, value: "x".repeat(48) }, active: true };
  const rpc = { async rpc() { runtime.active = false; return { data: { allowed: true }, error: null }; } };
  await assert.rejects(() => create(runtime, rpc).consume(hash("1")), /emergency_off/);
});
