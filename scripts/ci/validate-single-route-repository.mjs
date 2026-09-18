import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateSingleRouteRelease } from "./validate-single-route-release.mjs";

const REQUIRE = (condition, reason) => {
  if (!condition) throw new Error(`single_route_repository_blocked:${reason}`);
};

const ACTIVE_SOURCE_PATHS = Object.freeze([
  "mobile/lib/decision/founderLiveDecision.ts",
  "mobile/packages/founder-live-control-plane/src/index.mjs",
  "web/lib/decision-web-api.ts",
  "supabase/functions/decision-v13/vnext-only.ts",
]);

const DEPLOY_ENTRYPOINT = "supabase/functions/decision-v13/index.deploy.ts";
const GENERATED_BINDING = "mobile/lib/decision/founderLiveRelease.generated.ts";
const SUPABASE_CONFIG = "supabase/config.toml";
const PRODUCT_AUTHORITY = "delivery/product-authority-v1.json";
const RISK_GATE = ".github/workflows/risk-gate.yml";
const TRUST_CONSUMER_GATE = "scripts/ci/validate-trust-platform-consumers.sh";
const CANONICAL_VNEXT_MARKER = "import './vnext-only.ts';";

async function sourceAt(root, path) {
  return { path, source: await readFile(resolve(root, path), "utf8") };
}

export async function validateSingleRouteRepository(root) {
  const activeSources = await Promise.all(ACTIVE_SOURCE_PATHS.map((path) => sourceAt(root, path)));
  const entrypoint = await sourceAt(root, DEPLOY_ENTRYPOINT);
  const binding = await sourceAt(root, GENERATED_BINDING);
  const config = await sourceAt(root, SUPABASE_CONFIG);
  const authority = await sourceAt(root, PRODUCT_AUTHORITY);
  const workflow = await sourceAt(root, RISK_GATE);
  const trustConsumerGate = await sourceAt(root, TRUST_CONSUMER_GATE);
  const authorityDocument = JSON.parse(authority.source);

  const transportMatches = [
    ...binding.source.matchAll(/["']transportFunction["']\s*:\s*["']([^"']+)["']/g),
    ...activeSources.flatMap(({ source }) => [...source.matchAll(/functions\.invoke(?:<[^>]+>)?\(\s*["']([^"']+)["']/g)]),
  ];
  const productTransportSlugs = [...new Set(transportMatches.map((match) => match[1]))];

  REQUIRE(
    !/\[functions\.decision-founder-live\]/m.test(config.source),
    "founder_special_transport_must_be_removed",
  );
  REQUIRE(authorityDocument.runtimeScope?.contractVersion === "backyrd.product-runtime-scope@1.0", "product_runtime_scope_contract_invalid");
  REQUIRE(authorityDocument.runtimeScope?.activeTransport === "decision-v13", "product_runtime_transport_invalid");
  REQUIRE(authorityDocument.runtimeScope?.deployEntrypoint === DEPLOY_ENTRYPOINT, "product_runtime_entrypoint_invalid");
  REQUIRE(authorityDocument.runtimeScope?.productHandler === "supabase/functions/decision-v13/vnext-only.ts", "product_runtime_handler_invalid");
  REQUIRE(JSON.stringify(authorityDocument.runtimeScope?.retiredTransports) === JSON.stringify(["decision-founder-live"]), "retired_transport_set_invalid");
  REQUIRE(authorityDocument.runtimeScope?.legacyDecisionModulesPolicy === "DEEP_RECERTIFICATION_ONLY", "legacy_decision_policy_invalid");
  REQUIRE(!authorityDocument.protectedSemanticSourceSet?.paths?.some((path) => path.startsWith("supabase/functions/decision-founder-live")), "retired_founder_edge_must_not_be_product_authority");
  REQUIRE(authorityDocument.protectedSemanticSourceSet?.paths?.includes("supabase/functions/decision-v13/vnext-only.ts"), "vnext_product_authority_missing");
  REQUIRE(!workflow.source.includes("supabase/functions/decision-founder-live/runtime-boundary.test.mjs"), "routine_ci_runs_retired_founder_edge");
  REQUIRE(!trustConsumerGate.source.includes("supabase/functions/decision-v13/index.ts"), "routine_database_gate_reads_legacy_decision_v13");

  const result = validateSingleRouteRelease({
    activeSources,
    productTransportSlugs,
    expectedSlug: "decision-v13",
    entrypointPath: entrypoint.path,
    entrypointSource: entrypoint.source,
    canonicalVNextMarker: CANONICAL_VNEXT_MARKER,
    legacyV13Modules: [],
  });

  return Object.freeze({
    ...result,
    founderSpecialTransportPresent: false,
    checkedPaths: Object.freeze([...ACTIVE_SOURCE_PATHS, DEPLOY_ENTRYPOINT, GENERATED_BINDING, SUPABASE_CONFIG, PRODUCT_AUTHORITY, RISK_GATE, TRUST_CONSUMER_GATE]),
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  process.stdout.write(`${JSON.stringify(await validateSingleRouteRepository(root), null, 2)}\n`);
}
