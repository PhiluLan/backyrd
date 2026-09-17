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
import { verifyDomainCandidates, verifySupabaseCompatibilitySources } from "./week2-dark-wiring-preflight.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const documents = () => loadWeek2Documents(ROOT);
const clone = (value) => JSON.parse(JSON.stringify(value));

test("Week-2 control-plane documents are internally consistent", () => {
  const value = documents();
  const result = validateWeek2Documents(value);
  assert.equal(result.boundDomainCandidates, 3);
  assert.equal(result.rehearsalReady, value.evidence.status === "READY");
  assert.equal(result.releaseTrainStatus, "YELLOW");
});

for (const name of ["USER_HANDOFF_HASH", "USER_NO_WRITE_PROOF_HASH"]) {
  test(`${name} rejects an individually tampered canonical User binding`, () => {
    const value = clone(documents());
    value.manifest.domainCandidates.find(({ track }) => track === "USER").bindings.find((binding) => binding.name === name).expected = "0".repeat(64);
    assert.throws(() => verifyDomainCandidates(ROOT, value.manifest, value.decisionEvidence), new RegExp(`week2_candidate_binding_mismatch:USER:${name}`));
  });
}

for (const name of ["DECISION_REPORT_HASH", "DECISION_RESULT_HASH", "DECISION_CONTROL_HASH", "DECISION_AUTHORITY_HASH", "DECISION_SOURCE_TRUST_HASH"]) {
  test(`${name} rejects an individually tampered frozen Decision evidence binding`, () => {
    const value = clone(documents());
    value.manifest.domainCandidates.find(({ track }) => track === "DECISION").evidence.bindings.find((binding) => binding.name === name).expected = "0".repeat(64);
    assert.throws(() => verifyDomainCandidates(ROOT, value.manifest, value.decisionEvidence), new RegExp(`week2_candidate_evidence_binding_mismatch:DECISION:${name}`));
  });
}

for (const schema of ["auth", "realtime", "storage"]) {
  test(`${schema} schema mutation is blocked fail closed`, () => {
    assert.throws(
      () => verifySupabaseCompatibilitySources([{ path: `synthetic-${schema}.sql`, source: `alter table ${schema}.objects add column unsafe text;` }]),
      /week2_forbidden_protected_schema_mutation/,
    );
  });
}

test("technical rehearsal GREEN cannot promote the release train to GREEN", () => {
  const value = clone(documents());
  value.status.overall = "GREEN";
  value.status.yellowUntil = [];
  assert.throws(() => validateWeek2Documents(value), /week2_release_train_status_must_remain_yellow/);
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
