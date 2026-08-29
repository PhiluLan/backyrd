import test from "node:test";
import assert from "node:assert/strict";
import { processOneResearchJob } from "../src/worker.mjs";

const context = { passKey: "A", spot: { id: "11111111-1111-4111-8111-111111111111", name: "Museum", city: "Basel", website: "https://museum.example/" }, catalog: [
  { field_key: "activity.types", value_kind: "MULTI_SELECT", allowed_values: ["MUSEUM"], engine_role: "SUITABILITY_FACT" }
], acceptedFacts: [] };
const payload = { evidence: [{ fact_key: "activity.types", typed_value: ["MUSEUM"], evidence_scope: "SPOT", entity_scope: "SPOT", subject_name: "Museum", durability: "PERSISTENT", support_status: "SUPPORTED", source_url: "https://museum.example/visit", source_type: "OFFICIAL_WEBSITE", short_evidence: "Museum is a museum with permanent exhibitions.", observed_at: null }] };

function repository(overrides = {}) {
  const calls = [];
  return { calls,
    claim: async () => ({ jobId: "job", leaseToken: "lease", passKey: "A", providerResponseId: null, model: "gpt-5-mini" }),
    loadContext: async () => context,
    beginAttempt: async () => ({ attemptToken: "attempt", runId: "run" }),
    recordDisposition: async (...args) => calls.push(["record", ...args]),
    release: async (...args) => calls.push(["release", ...args]),
    fail: async (...args) => { calls.push(["fail", ...args]); return { state: args[1] ? "QUEUED" : "FAILED", retry: args[1] }; },
    finalizePass: async (...args) => { calls.push(["finalizePass", ...args]); return { state: "QUEUED", phase: "PASS_A_COMPLETE", proposalCount: args[2].length }; },
    ...overrides
  };
}

test("background response is persisted then released while pass works", async () => {
  const repo = repository();
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { create: async () => ({ providerResponseId: "resp_1", providerStatus: "queued" }) } });
  assert.equal(result.state, "RUNNING");
  assert.equal(result.phase, "PASS_A_RUNNING");
  assert.deepEqual(repo.calls.map((row) => row[0]), ["record", "release"]);
});

test("restart retrieves same response and atomically finalizes deterministic proposals", async () => {
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", passKey: "A", providerResponseId: "resp_1", model: "gpt-5-mini" }) });
  const response = { providerResponseId: "resp_1", providerStatus: "completed", payload, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, webSearchCalls: 1, transportLatencyMs: 4 };
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => response } });
  assert.equal(result.phase, "PASS_A_COMPLETE");
  assert.equal(result.proposalCount, 1);
  assert.deepEqual(repo.calls.map((row) => row[0]), ["record", "finalizePass"]);
  assert.equal(repo.calls[1][3][0].classification, "NEW");
});

test("Pass B completes independently with its deep catalog", async () => {
  const deepContext = { ...context, passKey: "B", catalog: [{ field_key: "suitability.conversation", value_kind: "ENUM", allowed_values: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"], engine_role: "N4_EVIDENCE" }] };
  const deepPayload = { evidence: [{ ...payload.evidence[0], fact_key: "suitability.conversation", typed_value: "MEDIUM" }] };
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", passKey: "B", providerResponseId: "resp_b" }), loadContext: async () => deepContext, finalizePass: async (...args) => ({ state: "READY_FOR_REVIEW", phase: "READY_FOR_REVIEW", proposalCount: args[2].length }) });
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => ({ providerResponseId: "resp_b", providerStatus: "completed", payload: deepPayload, usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 }, webSearchCalls: 1 }) } });
  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.equal(result.passKey, "B");
});

test("timeout receives one bounded technical retry disposition for its pass", async () => {
  const repo = repository();
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { create: async () => { throw new Error("research_provider_timeout"); } } });
  assert.equal(result.state, "QUEUED");
  assert.equal(result.retry, true);
});

test("incomplete max-output pass is retryable but writes zero proposals", async () => {
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", passKey: "A", providerResponseId: "resp_1" }) });
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => ({ providerResponseId: "resp_1", providerStatus: "incomplete", incompleteReason: "max_output_tokens", usage: {} }) } });
  assert.equal(result.retry, true);
  assert.equal(repo.calls.some((row) => row[0] === "finalizePass"), false);
});

test("validator rejection is terminal and never writes a pass", async () => {
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", passKey: "A", providerResponseId: "resp_1" }) });
  const response = { providerResponseId: "resp_1", providerStatus: "completed", payload: { evidence: [{ ...payload.evidence[0], source_url: "https://attacker.example/" }] }, usage: {}, webSearchCalls: 1 };
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => response } });
  assert.equal(result.retry, false);
  assert.equal(repo.calls.some((row) => row[0] === "finalizePass"), false);
});

test("valid sparse or UNKNOWN evidence completes without retry or invented proposal", async () => {
  const repo = repository({ claim: async () => ({ jobId: "job", leaseToken: "lease", passKey: "A", providerResponseId: "resp_1" }) });
  const unknown = { evidence: [{ ...payload.evidence[0], typed_value: null, evidence_scope: "UNKNOWN_SCOPE", entity_scope: "AMBIGUOUS", subject_name: null, durability: "UNKNOWN", support_status: "UNKNOWN", short_evidence: "" }] };
  const result = await processOneResearchJob({ repository: repo, apiKey: "x", runnerId: "r", provider: { retrieve: async () => ({ providerResponseId: "resp_1", providerStatus: "completed", payload: unknown, usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 }, webSearchCalls: 1 }) } });
  assert.equal(result.retry, undefined);
  assert.equal(repo.calls[1][3].length, 0);
});
