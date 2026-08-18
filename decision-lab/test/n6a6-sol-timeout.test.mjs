import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalN6A3PilotDefinition } from "../src/n6a3-pilot-contract.mjs";
import { createN6A3LiveExecution } from "../src/n6a3-live-executor.mjs";

function parsedFor(record) {
  const candidates = record.input.n6a1Input.baseInput.candidates;
  return {
    ranked_candidates: candidates.map(({ spotId }, rank) => ({ spot_id: spotId, rank: rank + 1, buddy_fit: 0.5, confidence: 0.5, why_for_you: [], why_now: [], uncertainty: [] })),
    decision_confidence: 0.5,
    user_knowledge_sufficiency: record.input.n6a1Input.baseInput.relevantUserProjection.sufficiency.level,
    moment_understanding_sufficiency: record.input.n6a1Input.baseInput.currentMoment.confidenceLevel
  };
}

function transportFixture(mode, record) {
  const parsed = parsedFor(record);
  const response = { ok: true, json: async () => ({ id: "fake-timeout-response", output: [{ content: [{ type: "output_text", text: JSON.stringify(parsed) }] }], usage: { input_tokens: 1000, output_tokens: 500 } }) };
  return {
    fetchImpl: async (_url, { signal }) => {
      if (mode === "over-limit") {
        if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      return response;
    },
    setTimeoutImpl: (callback, milliseconds) => { assert.equal(milliseconds, 120000); if (mode === "over-limit") callback(); return "fake-timer"; },
    clearTimeoutImpl: () => {}
  };
}

for (const mode of ["under-60s", "at-61s", "near-120s"]) test(`N6A.6 fake response ${mode} succeeds under the 120s transport boundary`, async () => {
  const definition = await buildCanonicalN6A3PilotDefinition(); const record = definition.records[0];
  const live = await createN6A3LiveExecution({ env: { DECISION_LAB_OPENAI_API_KEY: "fixture-only" }, ...transportFixture(mode, record) });
  const payload = await live.executeSlot(record);
  assert.equal(payload.execution, "LIVE"); assert.equal(live.config.modelConfig.timeoutMs, 120000);
});

test("N6A.6 fake response beyond the 120s boundary is classified as ABORT", async () => {
  const definition = await buildCanonicalN6A3PilotDefinition(); const record = definition.records[0];
  const live = await createN6A3LiveExecution({ env: { DECISION_LAB_OPENAI_API_KEY: "fixture-only" }, ...transportFixture("over-limit", record) });
  await assert.rejects(() => live.executeSlot(record), (error) => error.name === "AbortError" && error.failureType === "ABORT");
});
