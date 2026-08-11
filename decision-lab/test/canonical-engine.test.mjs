import test from "node:test";
import assert from "node:assert/strict";
import { loadCanonicalDecisionHandler } from "../src/canonical-engine.mjs";

test("adapter loads the canonical complete V13 handler without a ranking clone", async () => {
  const loaded = await loadCanonicalDecisionHandler({ embeddingMode: "FAST_SIMULATION", env: { DECISION_LAB_SUPABASE_URL: "http://127.0.0.1:54321", DECISION_LAB_SERVICE_ROLE_KEY: "local-fixture" } });
  assert.equal(typeof loaded.handler, "function");
  assert.match(loaded.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(loaded.getTrace(), null);
  loaded.restore();
});
