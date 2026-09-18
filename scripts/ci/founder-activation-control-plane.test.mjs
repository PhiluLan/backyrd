import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateFounderActivationDocuments } from "./founder-activation-control-plane.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const load = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const documents = () => ({
  manifest: load("delivery/integration/founder-activation-manifest.json"),
  matrix: load("delivery/integration/founder-activation-dependency-ownership-matrix.json"),
  plan: load("delivery/integration/founder-activation-production-plan.json"),
  status: load("delivery/integration/founder-activation-status.json")
});

test("sealed Founder activation documents bind both candidates and remain non-executable", () => {
  assert.deepEqual(validateFounderActivationDocuments(documents()), { boundCandidates: 2, sealed: true });
});

test("an unsealed status cannot claim CTO readiness", () => {
  const value = documents();
  value.manifest.release.sealed = false;
  assert.throws(() => validateFounderActivationDocuments(value), /pending_status_invalid/);
});

for (const [name, mutate, expected] of [
  ["client claims", (value) => { value.manifest.authority.clientClaimsAccepted = true; }, /client_authority_open/],
  ["email authority", (value) => { value.manifest.authority.emailAuthorizationAccepted = true; }, /client_authority_open/],
  ["user metadata authority", (value) => { value.manifest.authority.userMetadataAuthorizationAccepted = true; }, /client_authority_open/],
  ["missing configuration fail-open", (value) => { value.manifest.authority.failClosedOnMissingConfiguration = false; }, /allowlist_boundary_invalid/],
  ["kill switch disengaged", (value) => { value.manifest.runtimeControls.killSwitch = "DISENGAGED"; }, /runtime_controls_open/],
  ["learning enabled", (value) => { value.manifest.runtimeControls.learning = "ON"; }, /runtime_controls_open/],
  ["Production activation authorized", (value) => { value.plan.productionActivation.authorized = true; }, /plan_authority_invalid/],
  ["secret mutation planned", (value) => { value.plan.changes.secretMutation = true; }, /plan_scope_open/]
]) {
  test(`rejects ${name}`, () => {
    const value = documents(); mutate(value);
    assert.throws(() => validateFounderActivationDocuments(value), expected);
  });
}
