import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifyEdgeDeployClosure } from "./verify-edge-deploy-closure.mjs";

const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-edge-deploy-"));
  put(root, "supabase/functions/decision-v13/index.deploy.ts", 'import "./vnext-only.ts";\n');
  put(root, "supabase/functions/decision-v13/vnext-only.ts", 'import "../../../packages/decision-vnext-core/dist/product-decision-production-adapter.js"; import "../../../packages/decision-vnext-core/dist/product-decision.js";\n');
  put(root, "supabase/functions/decision-v13/deno.json", JSON.stringify({ imports: { "@backyrd/user-intelligence-vnext-core": "../../../packages/user-intelligence-vnext-core/dist/index.js", "@backyrd/world-knowledge-core": "../../../packages/world-knowledge-core/dist/index.js" } }));
  put(root, "packages/decision-vnext-core/dist/product-decision-production-adapter.js", 'import "@backyrd/user-intelligence-vnext-core"; import "@backyrd/world-knowledge-core";\n');
  put(root, "packages/decision-vnext-core/dist/product-decision.js", 'export const route = "vnext";\n');
  put(root, "packages/user-intelligence-vnext-core/dist/index.js", 'export const user = true;\n');
  put(root, "packages/world-knowledge-core/dist/index.js", 'export const world = true;\n');
  return root;
};

test("the deploy entrypoint closes over the exact packaged modules", () => {
  assert.equal(verifyEdgeDeployClosure(fixture()).status, "PASS");
});

test("missing, unmapped and non-literal imports fail closed", () => {
  const missing = fixture();
  put(missing, "packages/decision-vnext-core/dist/product-decision.js", 'import "./absent.js";\n');
  assert.throws(() => verifyEdgeDeployClosure(missing), /edge_import_unresolved/);
  const bare = fixture();
  put(bare, "packages/decision-vnext-core/dist/product-decision.js", 'import "@backyrd/unmapped";\n');
  assert.throws(() => verifyEdgeDeployClosure(bare), /edge_bare_import_unmapped/);
  const dynamic = fixture();
  put(dynamic, "packages/decision-vnext-core/dist/product-decision.js", 'import(moduleName);\n');
  assert.throws(() => verifyEdgeDeployClosure(dynamic), /edge_dynamic_import_unbounded/);
});
