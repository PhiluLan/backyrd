const REQUIRE = (condition, reason) => {
  if (!condition) throw new Error(`single_route_release_blocked:${reason}`);
};

const ACTIVE_ROUTE_FORBIDDEN = Object.freeze([
  ["legacy_body", /\blegacyBody\b/],
  ["existing_invoker", /\binvokeExisting\b/],
  ["fallback_function", /\bfallbackFunction\b/],
  ["existing_engine_route", /\bEXISTING_ENGINE\b/],
  ["founder_special_transport", /\bdecision-founder-live\b/],
  ["parallel_route_orchestrator", /\brouteFounderDecision\b/],
  ["parallel_vnext_invoker", /\binvokeVNext\b/],
  ["client_route_authority", /\bserverAuthority\b/],
]);

const DEPLOY_ENTRYPOINT_FORBIDDEN = Object.freeze([
  ["legacy_live_entrypoint", /(?:^|["'`/])live-index\.ts(?:["'`]|$)/m],
  ["legacy_index_entrypoint", /(?:from\s*|import\s*)["']\.\/index\.ts["']/m],
  ["founder_special_transport", /\bdecision-founder-live\b/],
]);

const normalizeSource = (entry, collection) => {
  REQUIRE(entry && typeof entry === "object" && !Array.isArray(entry), `${collection}_entry_invalid`);
  REQUIRE(typeof entry.path === "string" && entry.path.length > 0, `${collection}_path_invalid`);
  REQUIRE(typeof entry.source === "string", `${collection}_source_invalid:${entry.path}`);
  return entry;
};

export function verifyNoActiveLegacyRouting(activeSources) {
  REQUIRE(Array.isArray(activeSources) && activeSources.length > 0, "active_sources_required");
  for (const raw of activeSources) {
    const entry = normalizeSource(raw, "active_sources");
    for (const [name, pattern] of ACTIVE_ROUTE_FORBIDDEN) {
      REQUIRE(!pattern.test(entry.source), `${name}:${entry.path}`);
    }
  }
  return true;
}

export function verifySingleProductTransport({ productTransportSlugs, expectedSlug = "decision-v13" }) {
  REQUIRE(Array.isArray(productTransportSlugs), "product_transport_slugs_required");
  REQUIRE(productTransportSlugs.length === 1, "product_transport_count_invalid");
  REQUIRE(productTransportSlugs[0] === expectedSlug, "product_transport_slug_invalid");
  return true;
}

export function verifyVNextOnlyDeployEntrypoint({
  entrypointPath,
  entrypointSource,
  canonicalVNextMarker,
  expectedPath = "supabase/functions/decision-v13/index.deploy.ts",
}) {
  REQUIRE(entrypointPath === expectedPath, "deploy_entrypoint_path_invalid");
  REQUIRE(typeof entrypointSource === "string" && entrypointSource.length > 0, "deploy_entrypoint_source_required");
  REQUIRE(typeof canonicalVNextMarker === "string" && canonicalVNextMarker.length >= 8, "canonical_vnext_marker_required");
  const markerCount = entrypointSource.split(canonicalVNextMarker).length - 1;
  REQUIRE(markerCount === 1, "canonical_vnext_marker_count_invalid");
  for (const [name, pattern] of DEPLOY_ENTRYPOINT_FORBIDDEN) {
    REQUIRE(!pattern.test(entrypointSource), `${name}:${entrypointPath}`);
  }
  return true;
}

export function verifyLegacyV13OfflineOnly(legacyV13Modules) {
  REQUIRE(Array.isArray(legacyV13Modules), "legacy_v13_modules_required");
  for (const raw of legacyV13Modules) {
    const entry = normalizeSource(raw, "legacy_v13_modules");
    REQUIRE(["OFFLINE_COMPARATOR", "TEST_FIXTURE"].includes(entry.usage), `legacy_v13_usage_invalid:${entry.path}`);
    const requiredMarker = entry.usage === "OFFLINE_COMPARATOR"
      ? "BACKYRD_OFFLINE_COMPARATOR_ONLY"
      : "BACKYRD_TEST_FIXTURE_ONLY";
    REQUIRE(entry.source.includes(requiredMarker), `legacy_v13_marker_missing:${entry.path}`);
  }
  return true;
}

export function validateSingleRouteRelease(input) {
  verifyNoActiveLegacyRouting(input.activeSources);
  verifySingleProductTransport(input);
  verifyVNextOnlyDeployEntrypoint(input);
  verifyLegacyV13OfflineOnly(input.legacyV13Modules);
  return Object.freeze({
    contractVersion: "backyrd.single-product-route-release-gate@1.0",
    status: "PASS",
    productTransportSlug: input.expectedSlug ?? "decision-v13",
    activeSourceCount: input.activeSources.length,
    legacyV13ModuleCount: input.legacyV13Modules.length,
    vNextOnly: true,
    parallelRouting: false,
  });
}
