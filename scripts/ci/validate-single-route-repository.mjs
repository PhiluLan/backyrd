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
const CANONICAL_VNEXT_MARKER = "import './vnext-only.ts';";

async function sourceAt(root, path) {
  return { path, source: await readFile(resolve(root, path), "utf8") };
}

export async function validateSingleRouteRepository(root) {
  const activeSources = await Promise.all(ACTIVE_SOURCE_PATHS.map((path) => sourceAt(root, path)));
  const entrypoint = await sourceAt(root, DEPLOY_ENTRYPOINT);
  const binding = await sourceAt(root, GENERATED_BINDING);
  const config = await sourceAt(root, SUPABASE_CONFIG);

  const transportMatches = [
    ...binding.source.matchAll(/["']transportFunction["']\s*:\s*["']([^"']+)["']/g),
    ...activeSources.flatMap(({ source }) => [...source.matchAll(/functions\.invoke(?:<[^>]+>)?\(\s*["']([^"']+)["']/g)]),
  ];
  const productTransportSlugs = [...new Set(transportMatches.map((match) => match[1]))];

  REQUIRE(
    /\[functions\.decision-founder-live\][\s\S]*?enabled\s*=\s*false(?:\s|$)/m.test(config.source),
    "founder_special_transport_not_explicitly_disabled",
  );

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
    founderSpecialTransportEnabled: false,
    checkedPaths: Object.freeze([...ACTIVE_SOURCE_PATHS, DEPLOY_ENTRYPOINT, GENERATED_BINDING, SUPABASE_CONFIG]),
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  process.stdout.write(`${JSON.stringify(await validateSingleRouteRepository(root), null, 2)}\n`);
}
