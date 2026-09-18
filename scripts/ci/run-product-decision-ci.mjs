#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const productTests = [
  "packages/decision-vnext-core/test/product-decision-single-route.test.mjs",
  "packages/decision-vnext-core/test/product-decision-production-adapter.test.mjs",
  "packages/decision-vnext-core/test/product-runtime-composition.test.mjs",
  "packages/decision-vnext-core/test/isolation.test.mjs",
];

function run(label, command, args) {
  const started = process.hrtime.bigint();
  process.stdout.write(`\n[product-decision-ci] ${label}\n`);
  execFileSync(command, args, { cwd: root, env: process.env, stdio: "inherit" });
  return { label, milliseconds: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3)), outcome: "PASS" };
}

const args = process.argv.slice(2);
const output = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;

try {
  const started = process.hrtime.bigint();
  const steps = [
    run("build canonical World, User and Product Decision artifacts", "npm", ["run", "decision-vnext:build"]),
    run("Product Decision TypeScript boundary", "npm", ["exec", "tsc", "--", "-p", "packages/decision-vnext-core/tsconfig.json", "--noEmit"]),
    run("Product Decision contracts, runtime and isolation", process.execPath, ["--test", ...productTests]),
    run("single-route repository invariant", process.execPath, ["scripts/ci/validate-single-route-repository.mjs"]),
    run("Mobile/Web Product release contracts", "npm", ["run", "product-release:test"]),
    run("Product release end-to-end", "npm", ["run", "product-release:e2e"]),
  ];
  const report = {
    contractVersion: "backyrd-decision-product-ci-report-v1",
    outcome: "PASS",
    durationMilliseconds: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3)),
    steps,
  };
  if (output) {
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`\n${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`product_decision_ci_blocked:${error.message}\n`);
  process.exitCode = 1;
}
