import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("checked-in Edge implementation evidence stays non-authorizing", () => {
  const evidence = JSON.parse(readFileSync(new URL("../../delivery/integration/founder-live-edge-implementation-evidence.json", import.meta.url), "utf8"));
  assert.equal(evidence.runtimeAuthority, "NOT_AUTHORIZED");
  assert.equal(evidence.defaultState, "OFF");
  assert.equal(evidence.deploymentAuthorized, false);
  assert.equal(evidence.executionAuthorized, false);
  assert.deepEqual(evidence.deployFunctions, ["decision-founder-live"]);
  assert.equal(evidence.productionQueries, 0);
  assert.equal(evidence.functionsDeployed, 0);
  assert.equal(evidence.runtimeActivations, 0);
});
