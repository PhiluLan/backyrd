import test from "node:test";
import { EventEmitter } from "node:events";
import { verifyEdgeRuntimeBundle } from "./verify-edge-runtime-bundle.mjs";
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

test("worker entrypoint and its research dependency are sealed, with no checkout fallback", () => {
  const root = fixture();
  put(root, "supabase/functions/decision-engine-worker/index.ts", 'import "../../../packages/spot-research-runtime/src/world-knowledge-worker.mjs"; import "../../../packages/spot-research-runtime/src/supabase-repository.mjs"; import "../../../packages/user-intelligence-runtime/src/queue-runner.mjs";\n');
  for (const path of ["packages/spot-research-runtime/src/world-knowledge-worker.mjs", "packages/spot-research-runtime/src/supabase-repository.mjs", "packages/user-intelligence-runtime/src/queue-runner.mjs"]) put(root, path, "export const sealed = true;\n");
  assert.equal(verifyEdgeDeployClosure(root, "decision-engine-worker").status, "PASS");
  put(root, "packages/spot-research-runtime/src/world-knowledge-worker.mjs", 'import "./missing.mjs";\n');
  assert.throws(() => verifyEdgeDeployClosure(root, "decision-engine-worker"), /edge_import_unresolved/);
});

const runtimeProbe = (responses) => {
  const child = { stdout: new EventEmitter(), stderr: new EventEmitter(), exitCode: null, kill: () => { killed = true; } };
  let killed = false;
  let calls = 0;
  const run = () => verifyEdgeRuntimeBundle("/tmp/synthetic-edge-bundle", {
    spawnImpl: () => {
      queueMicrotask(() => child.stdout.emit("data", "Serving functions on"));
      return child;
    },
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      const [status, body] = responses[Math.min(calls++, responses.length - 1)];
      return new Response(JSON.stringify(body), { status });
    },
  });
  return { run, calls: () => calls, killed: () => killed };
};
const gatewayStarting = [502, { message: "An invalid response was received from the upstream server" }];
const safeUnavailable = [503, { status: "UNAVAILABLE", legacyFallbackUsed: false }];

test("runtime readiness tolerates a transient gateway startup response but still requires the safe product response", async () => {
  const probe = runtimeProbe([gatewayStarting, safeUnavailable]);
  assert.equal((await probe.run()).status, "PASS");
  assert.equal(probe.calls(), 2);
  assert.equal(probe.killed(), true);
});

test("a permanent gateway failure exhausts four retries and fails closed", async () => {
  const probe = runtimeProbe([gatewayStarting]);
  await assert.rejects(probe.run(), /edge_runtime_unexpected_response:502/);
  assert.equal(probe.calls(), 5);
  assert.equal(probe.killed(), true);
});

test("runtime readiness never retries or accepts a wrong product response", async () => {
  for (const response of [[200, { status: "OK" }], [503, { status: "UNAVAILABLE", legacyFallbackUsed: true }], [502, { message: "different failure" }]]) {
    const probe = runtimeProbe([response, safeUnavailable]);
    await assert.rejects(probe.run(), /edge_runtime_unexpected_response/);
    assert.equal(probe.calls(), 1);
    assert.equal(probe.killed(), true);
  }
});
