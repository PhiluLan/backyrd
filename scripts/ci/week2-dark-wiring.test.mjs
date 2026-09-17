import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWeek2Documents,
  resolveWeek2DarkWiring,
  runWeek2ContractRehearsal,
  validateWeek2Documents,
} from "./week2-dark-wiring.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const documents = () => loadWeek2Documents(ROOT);
const clone = (value) => JSON.parse(JSON.stringify(value));

test("Week-2 control-plane documents are internally consistent", () => {
  const result = validateWeek2Documents(documents());
  assert.equal(result.boundDomainCandidates, 2);
  assert.equal(result.rehearsalReady, false);
});

test("missing and unknown configuration fail closed with zero work", () => {
  for (const configuration of [{}, { unknownToggle: true }, { WORLD_PRODUCT_READ: true }]) {
    const result = runWeek2ContractRehearsal({ fixture: documents().fixture, configuration });
    assert.equal(result.state.enabled, false);
    assert.deepEqual(result.counters, documents().fixture.expectedOffCounters);
    assert.equal(result.productOutput, null);
    assert.equal(result.persisted, false);
  }
});

test("activation order cannot be bypassed", () => {
  const common = {
    environment: "LOCAL_SYNTHETIC_TEST",
    globalKillSwitch: "DISENGAGED",
    WORLD_PRODUCT_READ: true,
    WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED",
    USER_LEARNING_RUNTIME: false,
    USER_LEARNING_KILL_SWITCH: "FORCED_OFF",
    relevantUserProjectionTestPort: true,
    DECISION_VNEXT_SHADOW_TRAFFIC: true,
    DECISION_VNEXT_SHADOW_KILL_SWITCH: "DISENGAGED",
    DECISION_VNEXT_PRODUCT_RANKING: false,
    DECISION_VNEXT_PRODUCT_KILL_SWITCH: "ENGAGED",
  };
  assert.equal(resolveWeek2DarkWiring({ ...common, globalKillSwitch: "ENGAGED" }).enabled, false);
  assert.equal(resolveWeek2DarkWiring({ ...common, WORLD_PRODUCT_READ: false }).enabled, false);
  assert.equal(resolveWeek2DarkWiring({ ...common, relevantUserProjectionTestPort: false }).enabled, false);
  assert.equal(resolveWeek2DarkWiring({ ...common, DECISION_VNEXT_PRODUCT_RANKING: true }).enabled, false);
  assert.equal(resolveWeek2DarkWiring(common).enabled, true);
});

test("controlled local Test-ON remains read-only, synthetic and invisible to Product", () => {
  const result = runWeek2ContractRehearsal({
    fixture: documents().fixture,
    configuration: {
      environment: "PROD_LIKE_SYNTHETIC_TEST",
      globalKillSwitch: "DISENGAGED",
      WORLD_PRODUCT_READ: true,
      WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED",
      USER_LEARNING_RUNTIME: false,
      USER_LEARNING_KILL_SWITCH: "FORCED_OFF",
      relevantUserProjectionTestPort: true,
      DECISION_VNEXT_SHADOW_TRAFFIC: true,
      DECISION_VNEXT_SHADOW_KILL_SWITCH: "DISENGAGED",
      DECISION_VNEXT_PRODUCT_RANKING: false,
      DECISION_VNEXT_PRODUCT_KILL_SWITCH: "ENGAGED",
    },
  });
  assert.equal(result.state.enabled, true);
  assert.equal(result.counters.worldReads, 1);
  assert.equal(result.counters.projectionBuilds, 1);
  assert.equal(result.counters.shadowEvaluations, 1);
  assert.equal(result.counters.writes, 0);
  assert.equal(result.counters.networkCalls, 0);
  assert.equal(result.counters.productOutputs, 0);
  assert.equal(result.productOutput, null);
  assert.equal(result.persisted, false);
});

test("all feature flags and authority fields remain closed", () => {
  const value = clone(documents());
  value.flags.flags[0].default = true;
  assert.throws(() => validateWeek2Documents(value), /week2_flag_not_off/);

  const authority = clone(documents());
  authority.manifest.executionAuthorized = true;
  assert.throws(() => validateWeek2Documents(authority), /week2_manifest_authority_must_be_false/);
});
