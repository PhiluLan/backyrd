#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ENTRYPOINT = "supabase/functions/decision-v13/index.deploy.ts";
const CONFIG = "supabase/functions/decision-v13/deno.json";
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };

export function verifyEdgeDeployClosure(bundleRoot) {
  const root = resolve(bundleRoot);
  const configPath = resolve(root, CONFIG);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const imports = config.imports ?? {};
  requireValue(typeof imports === "object" && !Array.isArray(imports), "edge_import_map_invalid");
  const visited = new Set();
  const queue = [resolve(root, ENTRYPOINT)];
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
  for (const required of [
    "supabase/functions/decision-v13/vnext-only.ts",
    "packages/decision-vnext-core/dist/product-decision-production-adapter.js",
    "packages/decision-vnext-core/dist/product-decision.js",
    "packages/user-intelligence-vnext-core/dist/index.js",
    "packages/world-knowledge-core/dist/index.js",
  ]) requireValue(visited.has(required), `edge_required_module_unreached:${required}`);
  return { status: "PASS", entrypoint: ENTRYPOINT, visitedModules: visited.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf("--bundle");
    requireValue(index >= 0 && process.argv[index + 1], "edge_bundle_path_required");
    process.stdout.write(`${JSON.stringify(verifyEdgeDeployClosure(process.argv[index + 1]))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
