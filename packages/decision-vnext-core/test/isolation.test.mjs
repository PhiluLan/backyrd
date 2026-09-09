import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPhase1Decision } from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);

test("sandbox source has no Supabase, network, production credential or production id dependency", () => {
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const inspected = files(resolve(packageRoot, "src")).concat(files(resolve(packageRoot, "sandbox")));
  const text = inspected.filter((path) => !path.endsWith(".json") || path.includes("config")).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(text, /@supabase|SUPABASE_|service_role|hjgcrrzfjchzqoegcywn|https?:\/\//i);
  assert.doesNotMatch(text, /\bfetch\s*\(/);
  assert.doesNotMatch(text, /\b(?:writeFile|appendFile|createWriteStream|mkdir|rmSync|unlinkSync)\s*\(/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
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
