import assert from "node:assert/strict";
import test from "node:test";
import { verifyRiskGate } from "./verify-risk-gate.mjs";

test("passes when every risk-selected gate succeeds", () => {
  const result = verifyRiskGate({
    requiredGates: ["repository-security", "mobile"],
    results: { "repository-security": "success", mobile: "success", database: "skipped" },
  });
  assert.equal(result.outcome, "PASS");
});

test("ignores an irrelevant skipped gate", () => {
  assert.doesNotThrow(() => verifyRiskGate({
    requiredGates: ["repository-security"],
    results: { "repository-security": "success", decision: "skipped" },
  }));
});

test("fails closed when a selected gate fails or is skipped", () => {
  assert.throws(() => verifyRiskGate({
    requiredGates: ["repository-security", "decision"],
    results: { "repository-security": "success", decision: "skipped" },
  }), /decision=skipped/);
});

test("fails closed when a selected result is absent", () => {
  assert.throws(() => verifyRiskGate({
    requiredGates: ["repository-security", "database"],
    results: { "repository-security": "success" },
  }), /required_gate_results_missing:database/);
});
