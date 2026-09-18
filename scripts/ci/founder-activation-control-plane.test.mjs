import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateFounderActivationDocuments, verifyFounderActivationCanonicalDescendant, verifyFounderActivationDescendantMigrationChanges, verifyFounderActivationInactiveEdgeChanges } from "./founder-activation-control-plane.mjs";

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

test("canonical descendants preserve every sealed activation blob and exact lineage", () => {
  const paths = [
    "delivery/integration/founder-activation-dependency-ownership-matrix.json",
    "delivery/integration/founder-activation-manifest.json",
    "delivery/integration/founder-activation-post-deploy-evidence.json",
    "delivery/integration/founder-activation-production-plan.json",
    "delivery/integration/founder-activation-rehearsal-evidence.json",
    "delivery/integration/founder-activation-shared-artifact.json",
    "delivery/integration/founder-activation-status.json"
  ];
  const bindings = paths.map((path) => ({ path, completionBlobSha: "a".repeat(40), baseBlobSha: "a".repeat(40), headBlobSha: "a".repeat(40) }));
  const value = { completionSha: "96f648cebbfdfd854aec688613ddbedb447c25bb", completionTree: "4321f018f04056f14aea6c7d59c4cb21a88a9a44", completionIsAncestorOfBase: true, baseIsAncestorOfHead: true, sealedBlobBindings: bindings };
  assert.equal(verifyFounderActivationCanonicalDescendant(value), true);
  assert.throws(() => verifyFounderActivationCanonicalDescendant({ ...value, baseIsAncestorOfHead: false }), /descendant_lineage_invalid/);
  assert.throws(() => verifyFounderActivationCanonicalDescendant({ ...value, sealedBlobBindings: bindings.map((entry, index) => index === 0 ? { ...entry, headBlobSha: "b".repeat(40) } : entry) }), /sealed_blob_drift/);
  assert.throws(() => verifyFounderActivationCanonicalDescendant({ ...value, sealedBlobBindings: bindings.slice(1) }), /sealed_binding_set_invalid/);
});

test("activation descendants accept only newly added versioned migrations", () => {
  const additive = { status: "A", path: "supabase/migrations/20260918123000_founder_live_durable_idempotency_v1.sql" };
  assert.deepEqual(verifyFounderActivationDescendantMigrationChanges({ descendant: true, entries: [additive] }), [additive.path]);
  assert.throws(() => verifyFounderActivationDescendantMigrationChanges({ descendant: false, entries: [additive] }), /database_change_forbidden/);
  for (const entry of [
    { ...additive, status: "M" }, { ...additive, status: "D" }, { ...additive, status: "R100" },
    { status: "A", path: "supabase/migrations/not-versioned.sql" }
  ]) assert.throws(() => verifyFounderActivationDescendantMigrationChanges({ descendant: true, entries: [entry] }), /migration_not_additive/);
});

test("only the exact independently inactive Founder Live Edge host may cross the sealed activation boundary", () => {
  const block = `[functions.decision-founder-live]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/decision-founder-live/index.ts"\n\n`;
  const entries = [
    { status: "M", path: "supabase/config.toml" },
    { status: "A", path: "supabase/functions/decision-founder-live/index.ts" },
    { status: "A", path: "supabase/functions/decision-founder-live/runtime-boundary.mjs" },
    { status: "A", path: "supabase/functions/decision-founder-live/runtime-boundary.test.mjs" },
  ];
  assert.equal(verifyFounderActivationInactiveEdgeChanges({ entries: [], baseConfig: "base", headConfig: "base" }).length, 0);
  assert.deepEqual(verifyFounderActivationInactiveEdgeChanges({ entries, baseConfig: "before\nafter\n", headConfig: `before\n${block}after\n` }), entries.map(({ path }) => path));
  assert.throws(() => verifyFounderActivationInactiveEdgeChanges({ entries: [...entries, { status: "M", path: "supabase/production/auth-config.json" }], baseConfig: "before\nafter\n", headConfig: `before\n${block}after\n` }), /runtime_change_set_invalid/);
  assert.throws(() => verifyFounderActivationInactiveEdgeChanges({ entries, baseConfig: "before\nafter\n", headConfig: `before\n${block}after = true\n` }), /edge_config_scope_invalid/);
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
