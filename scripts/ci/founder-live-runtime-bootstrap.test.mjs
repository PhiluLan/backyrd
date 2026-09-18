import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const load = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const source = (path) => readFileSync(new URL(path, root), "utf8");

test("runtime bootstrap plan is an exact non-executable single-function scope", () => {
  const plan = load("delivery/decision-vnext/founder-live-runtime-bootstrap-plan.json");
  assert.equal(plan.contractVersion, "backyrd.decision-vnext.founder-live-runtime-bootstrap-plan@1.0");
  assert.equal(plan.productionMode, "PRODUCTION_FOUNDER_READ_ONLY");
  assert.equal(plan.trustRootStatus, "NOT_PROVISIONED");
  assert.equal(plan.runtimeCapabilityMintingAvailable, false);
  assert.equal(plan.internalCapabilitySourcePresent, true);
  assert.equal(plan.internalCapabilityPubliclyExported, false);
  assert.equal(plan.defaultState, "OFF");
  assert.equal(plan.killSwitch, "ENGAGED_BY_ABSENT_TRUST_ROOT");
  assert.equal(plan.expectedMemberCount, 2);
  assert.equal(plan.verifyJwt, true);
  assert.deepEqual(plan.functionScope, ["decision-founder-live"]);
  for (const key of [
    "runtimeActivation", "deploymentAuthorized", "executionAuthorized", "productionQueriesAuthorized",
    "learningAuthorized", "writebackAuthorized", "rankingAuthorized", "eligibilityAuthorized",
    "shadowTrafficAuthorized", "productOutputAuthorized",
  ]) assert.equal(plan[key], false, `expected ${key}=false`);
  assert.equal(plan.newMigrations, 0);
  assert.equal(plan.authChanges, 0);
  assert.equal(plan.productionActionsPerformed, 0);
  assert.deepEqual(plan.requiredExternalBindings, [
    "PROJECT_REF", "CANONICAL_MAIN_SHA", "CANONICAL_TREE_SHA", "RELEASE_HASH", "ARTIFACT_HASH",
    "SOURCE_SET_HASH", "PRODUCTION_PLAN_HASH", "POLICY_HASH", "AUTHORITY_GENERATION",
    "AUTHORITY_NONCE", "VALIDITY_INTERVAL", "KILL_SWITCH_GENERATION", "MEMBER_DIGEST_SET_HASH",
  ]);
});
test("repository runtime boundary preserves JWT and cannot provision its own trust root", () => {
  const config = source("supabase/config.toml");
  const entry = source("supabase/functions/decision-founder-live/index.ts");
  const bootstrap = source("supabase/functions/decision-founder-live/runtime-bootstrap.mjs");
  const core = source("packages/decision-vnext-core/src/founder-live-runtime-bootstrap.ts");
  const capability = source("packages/decision-vnext-core/src/founder-live-runtime-capability.ts");
  const packageIndex = source("packages/decision-vnext-core/src/index.ts");
  assert.match(config, /\[functions\.decision-founder-live\][\s\S]*verify_jwt = true/);
  assert.match(entry, /createFounderLiveRuntimeBootstrapAdapter/);
  assert.match(bootstrap, /RUNTIME_TRUST_ROOT_NOT_PROVISIONED/);
  assert.match(core, /VERIFIED_NON_EXECUTABLE/);
  assert.match(core, /executionAuthorized: false/);
  assert.match(capability, /VERIFIED_EXECUTABLE/);
  assert.match(capability, /WeakSet/);
  assert.doesNotMatch(packageIndex, /founder-live-runtime-capability/);
  assert.doesNotMatch(`${entry}\n${bootstrap}\n${core}`, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|executeFounderLiveDecision|createFounderLiveProductionPorts/);
});
