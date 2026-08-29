import test from "node:test";
import assert from "node:assert/strict";
import { createSpotResearchRepository } from "../src/supabase-repository.mjs";

function serviceDouble() {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { name, args }, error: null };
    }
  };
}

test("Intelligence Population claims are restricted to their requested run", async () => {
  const service = serviceDouble();
  const populationRunId = "71000000-0000-4000-8000-000000000001";
  const repository = createSpotResearchRepository(service, { populationRunId });

  await repository.claim("run-scoped-worker");

  assert.deepEqual(service.calls, [{
    name: "backyrd_claim_spot_research_job_v2",
    args: {
      p_runner_id: "run-scoped-worker",
      p_lease_seconds: 60,
      p_population_run_id: populationRunId
    }
  }]);
});

test("existing scheduled/manual workers retain the legacy unscoped claim contract", async () => {
  const service = serviceDouble();
  const repository = createSpotResearchRepository(service);

  await repository.claim("legacy-worker");

  assert.deepEqual(service.calls, [{
    name: "backyrd_claim_spot_research_job_v1",
    args: { p_runner_id: "legacy-worker", p_lease_seconds: 60 }
  }]);
});
