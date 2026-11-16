#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export async function verifyEdgeRuntimeBundle(bundleRoot, {
  timeoutMilliseconds = 90_000,
  slug = "decision-v13",
  spawnRuntime = spawn,
  request = fetch,
} = {}) {
  const root = resolve(bundleRoot);
  if (!["decision-v13", "decision-engine-worker", "decision-admin-diagnostic", "weather-context"].includes(slug)) throw new Error("edge_function_slug_invalid");
  if (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) throw new Error("edge_runtime_timeout_invalid");
  const child = spawnRuntime("supabase", ["--workdir", root, "functions", "serve", slug, "--no-verify-jwt"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  let processError;
  let processClosed = false;
  const closed = new Promise(resolve => {
    child.once("close", () => {
      processClosed = true;
      resolve();
    });
  });
  child.on("error", error => { processError = error; });
  const record = (chunk) => { logs = `${logs}${chunk}`.slice(-4_000); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  const deadline = performance.now() + timeoutMilliseconds;
  try {
    while (performance.now() < deadline) {
      if (processError) throw new Error(`edge_runtime_process_failed:${processError.message}`);
      if (processClosed || child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`edge_runtime_exited:${logs}`);
      }
      if (logs.includes("Serving functions on")) {
        const signal = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(2_000, deadline - performance.now()))));
        const response = await request(`http://127.0.0.1:54321/functions/v1/${slug}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal,
        }).catch(() => null);
        if (response) {
          const body = await response.json().catch(() => null);
          if (signal.aborted) continue;
          if (slug === "weather-context" && response.status === 401 && body?.error === "authentication_required") {
            return { status: "PASS", slug, httpStatus: 401, authenticationRequired: true };
          }
          if (slug === "decision-v13" && response.status === 503 && body?.status === "UNAVAILABLE" && body.legacyFallbackUsed === false) {
            return { status: "PASS", slug, httpStatus: 503, productStatus: body.status, legacyFallbackUsed: false };
          }
          if (slug === "decision-engine-worker" && response.status === 503 && body?.error === "server_configuration_missing") {
            return { status: "PASS", slug, httpStatus: 503, workerStatus: body.error };
          }
          if (slug === "decision-admin-diagnostic" && response.status === 503 && body?.error === "diagnostic_configuration_unavailable") {
            return { status: "PASS", slug, httpStatus: 503, diagnosticStatus: body.error };
          }
          throw new Error(`edge_runtime_unexpected_response:${response.status}:${JSON.stringify(body).slice(0, 400)}`);
        }
      }
      if (performance.now() < deadline) await delay(Math.min(500, deadline - performance.now()));
    }
    throw new Error(`edge_runtime_bundle_timeout:${logs}`);
  } finally {
    if (!processClosed) {
      child.kill("SIGINT");
      await Promise.race([closed, delay(2_000, undefined, { ref: false })]);
      if (!processClosed) {
        child.kill("SIGKILL");
        await Promise.race([closed, delay(1_000, undefined, { ref: false })]);
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf("--bundle");
    if (index < 0 || !process.argv[index + 1]) throw new Error("edge_bundle_path_required");
    const slugIndex = process.argv.indexOf("--slug");
    process.stdout.write(`${JSON.stringify(await verifyEdgeRuntimeBundle(process.argv[index + 1], { slug: slugIndex >= 0 ? process.argv[slugIndex + 1] : "decision-v13" }))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
