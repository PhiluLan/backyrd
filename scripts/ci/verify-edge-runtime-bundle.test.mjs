import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { verifyEdgeRuntimeBundle } from "./verify-edge-runtime-bundle.mjs";

function runtime(start) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    exitCode: null,
    signalCode: null,
    signals: [],
    kill(signal) {
      this.signals.push(signal);
      queueMicrotask(() => this.emit("close"));
      return true;
    },
  });

  return {
    child,
    spawnRuntime: () => {
      queueMicrotask(() => start ? start(child) : child.stdout.emit("data", "Serving functions on localhost"));
      return child;
    },
  };
}

test("verifies the Decision Worker response and closes its runtime", async () => {
  const { child, spawnRuntime } = runtime();
  const result = await verifyEdgeRuntimeBundle(".", {
    slug: "decision-engine-worker",
    spawnRuntime,
    request: async url => {
      assert.equal(new URL(url).pathname, "/functions/v1/decision-engine-worker");
      return Response.json({ error: "server_configuration_missing" }, { status: 503 });
    },
  });
  assert.equal(result.workerStatus, "server_configuration_missing");
  assert.deepEqual(child.signals, ["SIGINT"]);
});

test("aborts an Edge Runtime request that never replies", async () => {
  const { child, spawnRuntime } = runtime();
  let aborted = false;
  await assert.rejects(verifyEdgeRuntimeBundle(".", {
    timeoutMilliseconds: 1_000,
    spawnRuntime,
    request: async (_url, { signal }) => {
      try {
        await delay(30_000, undefined, { signal });
        assert.fail("runtime request was not aborted");
      } finally {
        aborted = signal.aborted;
      }
    },
  }), /edge_runtime_bundle_timeout/);
  assert.equal(aborted, true);
  assert.deepEqual(child.signals, ["SIGINT"]);
});

test("reports a missing CLI without an unhandled child-process error", async () => {
  const { child, spawnRuntime } = runtime(process => {
    process.emit("error", new Error("supabase not found"));
    process.emit("close");
  });
  await assert.rejects(verifyEdgeRuntimeBundle(".", { spawnRuntime }), /edge_runtime_process_failed:supabase not found/);
  assert.deepEqual(child.signals, []);
});
