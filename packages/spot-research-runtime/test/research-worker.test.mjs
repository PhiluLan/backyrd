import test from "node:test";
import assert from "node:assert/strict";
import { processOneResearchJob } from "../src/worker.mjs";

const context = { spot: { id: "11111111-1111-4111-8111-111111111111", name: "Museum", city: "Basel", website: "https://museum.example/" }, catalog: [{ field_key: "activity.types", value_kind: "MULTI_SELECT", allowed_values: ["MUSEUM"], engine_role: "SUITABILITY_FACT" }], acceptedFacts: [] };
const payload = { proposals: [{ field_key: "activity.types", value_json: '["MUSEUM"]', source_url: "https://museum.example/visit", source_title: "Visit", observed_at: null, evidence_excerpt: "Official museum visitor information.", confidence_rationale: "Explicit official source." }] };
function repository(overrides = {}) {
  const calls = [];
  return { calls,
    claim: async () => ({ jobId: "job", leaseToken: "lease", providerResponseId: null, model: "gpt-5-mini" }),
    loadContext: async () => context,
    beginAttempt: async () => ({ attemptToken: "attempt", runId: "run" }),
    recordProvider: async (...args) => calls.push(["record", ...args]),
    release: async (...args) => calls.push(["release", ...args]),
    fail: async (...args) => { calls.push(["fail", ...args]); return { state: args[1] ? "QUEUED" : "FAILED", retry: args[1] }; },
    finalize: async (...args) => { calls.push(["finalize", ...args]); return { state: "READY_FOR_REVIEW", proposalCount: args[1].length }; },
    ...overrides
  };
}

test("background response is persisted then released while provider works", async () => {
  const repo = repository();
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { create: async () => ({ providerResponseId: "resp_1", providerStatus: "queued" }) } });
  assert.equal(result.state, "RUNNING");
  assert.deepEqual(repo.calls.map((row) => row[0]), ["record", "release"]);
});

test("restart retrieves the same response and atomically finalizes proposals", async () => {
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", providerResponseId: "resp_1", model: "gpt-5-mini" }) });
  const response = { providerResponseId: "resp_1", providerStatus: "completed", payload, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, webSearchCalls: 1, transportLatencyMs: 4 };
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => response } });
  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.equal(result.proposalCount, 1);
  assert.deepEqual(repo.calls.map((row) => row[0]), ["finalize"]);
});

test("transport timeout receives one bounded technical retry disposition", async () => {
  const repo = repository();
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { create: async () => { throw new Error("research_provider_timeout"); } } });
  assert.equal(result.state, "QUEUED");
  assert.equal(result.retry, true);
});

test("validator rejection is terminal and never writes proposals", async () => {
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", providerResponseId: "resp_1" }) });
  const response = { providerResponseId: "resp_1", providerStatus: "completed", payload: { proposals: [{ ...payload.proposals[0], source_url: "https://attacker.example/" }] }, usage: {}, webSearchCalls: 1 };
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => response } });
  assert.equal(result.state, "FAILED");
  assert.equal(result.retry, false);
  assert.equal(repo.calls.some((row) => row[0] === "finalize"), false);
});

test("response loss reconciliation is delegated to idempotent final transaction", async () => {
  const repo = repository({ claim: async () => null });
  assert.deepEqual(await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r" }), { state: "IDLE" });
  assert.equal(repo.calls.length, 0);
});
