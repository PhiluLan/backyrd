#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyEdgeRuntimeBundle(bundleRoot, { timeoutMilliseconds = 90_000 } = {}) {
  const root = resolve(bundleRoot);
  const child = spawn("supabase", ["--workdir", root, "functions", "serve", "decision-v13", "--no-verify-jwt"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const record = (chunk) => { logs = `${logs}${chunk}`.slice(-4_000); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  const deadline = Date.now() + timeoutMilliseconds;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`edge_runtime_exited:${logs}`);
      if (logs.includes("Serving functions on")) {
        const response = await fetch("http://127.0.0.1:54321/functions/v1/decision-v13", {
          method: "POST", headers: { "content-type": "application/json" }, body: "{}",
        }).catch(() => null);
        if (response) {
          const body = await response.json().catch(() => null);
          if (response.status === 503 && body?.status === "UNAVAILABLE" && body.legacyFallbackUsed === false) {
            return { status: "PASS", httpStatus: 503, productStatus: body.status, legacyFallbackUsed: false };
          }
          throw new Error(`edge_runtime_unexpected_response:${response.status}:${JSON.stringify(body).slice(0, 400)}`);
        }
      }
      await new Promise((done) => setTimeout(done, 500));
    }
    throw new Error(`edge_runtime_bundle_timeout:${logs}`);
  } finally {
    child.kill("SIGINT");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf("--bundle");
    if (index < 0 || !process.argv[index + 1]) throw new Error("edge_bundle_path_required");
    process.stdout.write(`${JSON.stringify(await verifyEdgeRuntimeBundle(process.argv[index + 1]))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
