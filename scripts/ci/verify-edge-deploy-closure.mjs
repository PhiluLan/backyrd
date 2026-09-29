#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ENTRYPOINTS = Object.freeze({
  "decision-v13": "supabase/functions/decision-v13/index.deploy.ts",
  "decision-engine-worker": "supabase/functions/decision-engine-worker/index.ts",
});
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };

export function verifyEdgeDeployClosure(bundleRoot, slug = "decision-v13") {
  const root = resolve(bundleRoot);
  const entrypoint = ENTRYPOINTS[slug];
  requireValue(entrypoint, "edge_function_slug_invalid");
  const configPath = resolve(root, `supabase/functions/${slug}/deno.json`);
  const imports = slug === "decision-v13" ? (JSON.parse(readFileSync(configPath, "utf8")).imports ?? {}) : {};
  requireValue(typeof imports === "object" && !Array.isArray(imports), "edge_import_map_invalid");
  const visited = new Set();
  const queue = [resolve(root, entrypoint)];
  while (queue.length) {
    const file = queue.pop();
    const path = relative(root, file);
    requireValue(path && path !== ".." && !path.startsWith(`..${sep}`), `edge_import_outside_artifact:${path}`);
    requireValue(existsSync(file), `edge_import_unresolved:${path}`);
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(file, "utf8");
    requireValue(!/\bimport\s*\(\s*(?!["'`])/.test(source), `edge_dynamic_import_unbounded:${path}`);
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
      if (fileName.startsWith("node:")) continue;
      if (fileName === "npm:@supabase/supabase-js@2.112.4") continue;
      const mapped = imports[fileName];
      requireValue(fileName.startsWith("./") || fileName.startsWith("../") || typeof mapped === "string", `edge_bare_import_unmapped:${fileName}`);
      const target = mapped ? resolve(dirname(configPath), mapped) : resolve(dirname(file), fileName);
      queue.push(target);
    }
  }
  const requiredModules = slug === "decision-v13" ? [
    "supabase/functions/decision-v13/vnext-only.ts",
    "packages/decision-vnext-core/dist/product-decision-production-adapter.js",
    "packages/decision-vnext-core/dist/product-decision.js",
    "packages/user-intelligence-vnext-core/dist/index.js",
    "packages/world-knowledge-core/dist/index.js",
  ] : [
    "packages/spot-research-runtime/src/world-knowledge-worker.mjs",
    "packages/spot-research-runtime/src/supabase-repository.mjs",
    "packages/user-intelligence-runtime/src/queue-runner.mjs",
  ];
  for (const required of requiredModules) requireValue(visited.has(required), `edge_required_module_unreached:${required}`);
  return { status: "PASS", entrypoint, visitedModules: visited.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf("--bundle");
    requireValue(index >= 0 && process.argv[index + 1], "edge_bundle_path_required");
    const slugIndex = process.argv.indexOf("--slug");
    process.stdout.write(`${JSON.stringify(verifyEdgeDeployClosure(process.argv[index + 1], slugIndex >= 0 ? process.argv[slugIndex + 1] : "decision-v13"))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
