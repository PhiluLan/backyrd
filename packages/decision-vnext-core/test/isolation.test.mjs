import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

test("Product Decision core has no Supabase, network, persistence or production credential dependency", () => {
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const pureProductSources = ["canonical.ts", "schema.ts", "opening-state.ts", "product-v1-contracts.ts", "product-v1-authority.ts", "product-v1-evaluator.ts", "product-decision.ts"]
    .map((name) => resolve(packageRoot, "src", name));
  const text = pureProductSources.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(text, /@supabase|SUPABASE_|service_role|hjgcrrzfjchzqoegcywn|https?:\/\//i);
  assert.doesNotMatch(text, /\bfetch\s*\(/);
  assert.doesNotMatch(text, /\b(?:writeFile|appendFile|createWriteStream|mkdir|rmSync|unlinkSync)\s*\(/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  const production = readFileSync(resolve(packageRoot, "src/product-decision-production-adapter.ts"), "utf8");
  assert.match(production, /DecisionProductRpcClient/);
  assert.match(production, /DecisionProductAuthClient/);
  // A request-local Map indexes the already-authorized World snapshots. It is
  // neither persistence nor a fallback store; direct network and projection
  // reconstruction remain forbidden in this adapter.
  assert.doesNotMatch(production, /@supabase|\bfetch\s*\(|buildRelevantUserProjection/);
  assert.doesNotMatch(production, /hjgcrrzfjchzqoegcywn|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("only the vNext Product entrypoint is deployable for Decision", () => {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const entrypoint = resolve(repositoryRoot, "supabase/functions/decision-v13/index.deploy.ts");
  const vnext = resolve(repositoryRoot, "supabase/functions/decision-v13/vnext-only.ts");
  assert.equal(existsSync(entrypoint), true);
  assert.equal(existsSync(vnext), true);
  assert.equal(existsSync(resolve(repositoryRoot, "supabase/functions/decision-founder-live/index.ts")), false);
  assert.equal(existsSync(resolve(repositoryRoot, "supabase/functions/decision-founder-live/runtime-boundary.mjs")), false);
  assert.equal(readFileSync(entrypoint, "utf8").trim(), "import './vnext-only.ts';");
});

test("the installed Product route has no legacy or parallel fallback", () => {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const entrypoint = readFileSync(resolve(repositoryRoot, "supabase/functions/decision-v13/index.deploy.ts"), "utf8");
  const implementation = readFileSync(resolve(repositoryRoot, "supabase/functions/decision-v13/vnext-only.ts"), "utf8");
  assert.equal(entrypoint.trim(), "import './vnext-only.ts';");
  assert.doesNotMatch(`${entrypoint}\n${implementation}`, /founder-live|north-star|legacyBody|fallbackFunction|DecisionV13/);
});
