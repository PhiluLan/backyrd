import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSingleRouteRelease,
  verifyLegacyV13OfflineOnly,
  verifyNoActiveLegacyRouting,
  verifySingleProductTransport,
  verifyVNextOnlyDeployEntrypoint,
} from "./validate-single-route-release.mjs";

const marker = 'import "./canonical-vnext-product-handler.ts";';
const valid = () => ({
  activeSources: [
    { path: "mobile/lib/decision/productDecision.ts", source: 'invoke("decision-v13", request)' },
    { path: "delivery/integration/decision-release.json", source: '{"productTransport":"decision-v13","route":"VNEXT_ONLY"}' },
  ],
  productTransportSlugs: ["decision-v13"],
  expectedSlug: "decision-v13",
  entrypointPath: "supabase/functions/decision-v13/index.deploy.ts",
  entrypointSource: `${marker}\n`,
  canonicalVNextMarker: marker,
  legacyV13Modules: [
    { path: "decision-lab/offline/decision-v13-comparator.mjs", usage: "OFFLINE_COMPARATOR", source: "export const BACKYRD_OFFLINE_COMPARATOR_ONLY = true;" },
    { path: "scripts/fixtures/decision-v13.mjs", usage: "TEST_FIXTURE", source: "export const BACKYRD_TEST_FIXTURE_ONLY = true;" },
  ],
});

test("accepts one decision-v13 Product transport with a vNext-only deploy entrypoint", () => {
  assert.deepEqual(validateSingleRouteRelease(valid()), {
    contractVersion: "backyrd.single-product-route-release-gate@1.0",
    status: "PASS",
    productTransportSlug: "decision-v13",
    activeSourceCount: 2,
    legacyV13ModuleCount: 2,
    vNextOnly: true,
    parallelRouting: false,
  });
});

test("rejects every legacy or parallel routing primitive in active Product sources", () => {
  for (const token of [
    "legacyBody",
    "invokeExisting",
    "fallbackFunction",
    "EXISTING_ENGINE",
    "decision-founder-live",
    "decision-copy",
    "routeFounderDecision",
    "invokeVNext",
    "serverAuthority",
  ]) {
    assert.throws(
      () => verifyNoActiveLegacyRouting([{ path: "mobile/active.ts", source: `const forbidden = ${JSON.stringify(token)}; ${token === "decision-founder-live" ? "" : `void ${token};`}` }]),
      /single_route_release_blocked/,
      token,
    );
  }
});

test("rejects missing, duplicate, and Founder-special Product transports", () => {
  for (const productTransportSlugs of [[], ["decision-v13", "decision-founder-live"], ["decision-founder-live"]]) {
    assert.throws(() => verifySingleProductTransport({ productTransportSlugs }), /single_route_release_blocked/);
  }
});

test("rejects legacy imports and ambiguous vNext markers in the deployed decision-v13 entrypoint", () => {
  const base = valid();
  for (const entrypointSource of [
    'import "./live-index.ts";',
    'import "./index.ts";',
    `import "../decision-founder-live/index.ts"; // ${marker}`,
    `const first = "${marker}"; const second = "${marker}";`,
  ]) {
    assert.throws(() => verifyVNextOnlyDeployEntrypoint({ ...base, entrypointSource }), /single_route_release_blocked/);
  }
});

test("permits legacy v13 semantics only behind explicit Offline Comparator or test-fixture markers", () => {
  assert.equal(verifyLegacyV13OfflineOnly(valid().legacyV13Modules), true);
  for (const legacyV13Modules of [
    [{ path: "supabase/functions/decision-v13/index.ts", usage: "PRODUCT", source: "" }],
    [{ path: "decision-lab/offline/comparator.mjs", usage: "OFFLINE_COMPARATOR", source: "" }],
    [{ path: "scripts/fixtures/v13.mjs", usage: "TEST_FIXTURE", source: "" }],
  ]) assert.throws(() => verifyLegacyV13OfflineOnly(legacyV13Modules), /single_route_release_blocked/);
});
