import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPhase1Decision } from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);

test("sandbox and deterministic core have no Supabase, network, production credential or production id dependency", () => {
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const serverAdapter = resolve(packageRoot, "src/founder-live-server-authority.ts");
  const productionAdapter = resolve(packageRoot, "src/founder-live-production-adapter.ts");
  const inspected = files(resolve(packageRoot, "src")).filter((path) => path !== serverAdapter && path !== productionAdapter).concat(files(resolve(packageRoot, "sandbox")));
  const text = inspected.filter((path) => !path.endsWith(".json") || path.includes("config")).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(text, /@supabase|SUPABASE_|service_role|hjgcrrzfjchzqoegcywn|https?:\/\//i);
  assert.doesNotMatch(text, /\bfetch\s*\(/);
  assert.doesNotMatch(text, /\b(?:writeFile|appendFile|createWriteStream|mkdir|rmSync|unlinkSync)\s*\(/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  const adapter = readFileSync(serverAdapter, "utf8");
  assert.match(adapter, /\/auth\/v1\/user/);
  assert.doesNotMatch(adapter, /service_role|hjgcrrzfjchzqoegcywn|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  const production = readFileSync(productionAdapter, "utf8");
  assert.match(production, /createFounderWorldKnowledgeReader/);
  assert.match(production, /DecisionVNextUserProjectionPort/);
  assert.match(production, /FounderLiveIdempotencyPort/);
  assert.match(production, /FounderLiveRateLimitPort/);
  assert.doesNotMatch(production, /new Map|buildRelevantUserProjection/);
  assert.doesNotMatch(production, /hjgcrrzfjchzqoegcywn|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("Founder Live edge remains an unactivatable fail-closed NO-GO", () => {
  const edge = readFileSync(resolve(fileURLToPath(new URL("../../..", import.meta.url)), "supabase/functions/decision-founder-live/index.ts"), "utf8");
  assert.match(edge, /CANONICAL_PRODUCTION_PORTS_NOT_CONFIGURED/);
  assert.match(edge, /status:\s*503/);
  assert.doesNotMatch(edge, /Deno\.env|getenv|SUPABASE_|createFounderLiveProductionPorts/);
});

test("decision executes with network disabled", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network_forbidden_in_sandbox"); };
  try {
    const syntheticWorld = world();
    const result = runPhase1Decision({ request: request(), execution: execution(undefined, syntheticWorld), world: syntheticWorld, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36 });
    assert.equal(result.mode, "evaluation");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
