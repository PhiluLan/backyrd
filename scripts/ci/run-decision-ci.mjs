#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { phase2Pattern } from "./decision-test-plan.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const coreTests = [
  "packages/decision-vnext-core/test/contracts.test.mjs",
  "packages/decision-vnext-core/test/determinism.test.mjs",
  "packages/decision-vnext-core/test/eligibility-baselines.test.mjs",
  "packages/decision-vnext-core/test/evidence-explanation.test.mjs",
  "packages/decision-vnext-core/test/final-integrity-closure.test.mjs",
  "packages/decision-vnext-core/test/integration-closure.test.mjs",
  "packages/decision-vnext-core/test/isolation.test.mjs",
];

function compactSuccessOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) return "";
  const tests = [...trimmed.matchAll(/^# tests (\d+)$/gm)].at(-1)?.[1];
  const pass = [...trimmed.matchAll(/^# pass (\d+)$/gm)].at(-1)?.[1];
  if (tests) return JSON.stringify({ tests: Number(tests), pass: Number(pass ?? 0) });
  const last = trimmed.split("\n").at(-1) ?? "";
  try {
    const value = JSON.parse(last);
    return JSON.stringify(Object.fromEntries(["contractVersion", "scenarioCount", "worldHash", "candidatePoolHash", "resultHash", "reportHash", "workbenchHash", "valid", "status"].filter((key) => key in value).map((key) => [key, value[key]])));
  } catch { return last.length > 800 ? `${last.slice(0, 800)}…` : last; }
}

function run(label, command, args, env = {}, compact = false) {
  const started = process.hrtime.bigint();
  process.stdout.write(`\n[decision-ci] ${label}\n`);
  try {
    if (compact) {
      const output = execFileSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
      const summary = compactSuccessOutput(output);
      if (summary) process.stdout.write(`${summary}\n`);
    } else execFileSync(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
  } catch (error) {
    if (compact) {
      if (error.stdout) process.stderr.write(String(error.stdout));
      if (error.stderr) process.stderr.write(String(error.stderr));
    }
    throw new Error(`${label}:failed:${error.status ?? "unknown"}`);
  }
  const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  return { label, milliseconds: Number(milliseconds.toFixed(3)), outcome: "PASS" };
}

function nodeTest(label, files, extra = []) {
  return run(label, process.execPath, ["--test", ...extra, ...files]);
}

function testsUnder(directory) {
  return readdirSync(resolve(root, directory)).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => `${directory}/${name}`);
}

function runGroup(group) {
  if (group === "full") return [
    ...runGroup("preflight"),
    ...runGroup("functional"),
    ...runGroup("sandbox-worlds"),
    ...runGroup("sandbox-profiles"),
    ...runGroup("decision-lab"),
  ];
  if (group === "preflight") return [
    run("build canonical World, User and Decision artifacts", "npm", ["run", "decision-vnext:build"]),
    run("Decision TypeScript boundary", "npm", ["exec", "tsc", "--", "-p", "packages/decision-vnext-core/tsconfig.json", "--noEmit"]),
    run("closed Phase-2 shard routing", process.execPath, ["scripts/ci/validate-decision-test-plan.mjs"]),
  ];
  if (group === "fast") return [
    ...runGroup("preflight"),
    nodeTest("Decision core and contract fast tests", coreTests),
    run("small deterministic smoke world", process.execPath, ["packages/decision-vnext-core/sandbox/run.mjs", "packages/decision-vnext-core/sandbox/config/world-smoke-v1.json"]),
  ];
  if (group === "core-context") return [nodeTest("Decision core, integrity and contract tests", coreTests)];
  if (group === "phase2-all") return [nodeTest("Phase-2 complete integration", ["packages/decision-vnext-core/test/phase2-evaluation-harness.test.mjs"])];
  if (group.startsWith("phase2-")) return [nodeTest(`Phase-2 integration ${group}`, ["packages/decision-vnext-core/test/phase2-evaluation-harness.test.mjs"], ["--test-name-pattern", phase2Pattern(group)])];
  if (group === "oracles-workbenches") return [
    nodeTest("Context kernel and Founder Oracle contracts", ["packages/decision-vnext-core/test/context-kernel.test.mjs", "packages/decision-vnext-core/test/phase3b-product-context.test.mjs"]),
    run("Phase-3A recursive Workbench replay", process.execPath, ["packages/decision-vnext-core/sandbox/evaluate-context-phase3a.mjs"]),
    run("Phase-3B Product Context Workbench replay", process.execPath, ["packages/decision-vnext-core/sandbox/evaluate-context-phase3b.mjs"]),
  ];
  if (group === "sandbox-worlds") return [
    run("small deterministic smoke world", process.execPath, ["packages/decision-vnext-core/sandbox/run.mjs", "packages/decision-vnext-core/sandbox/config/world-smoke-v1.json"], {}, true),
    run("full synthetic world seed 1001", process.execPath, ["packages/decision-vnext-core/sandbox/run.mjs", "packages/decision-vnext-core/sandbox/config/world-phase1-v1.json"], {}, true),
    run("full synthetic world seed 1002", process.execPath, ["packages/decision-vnext-core/sandbox/run.mjs", "packages/decision-vnext-core/sandbox/config/world-phase1-seed-1002-v1.json"], {}, true),
  ];
  if (group === "sandbox-profiles") return [
    run("Phase-2 smoke evaluation", process.execPath, ["packages/decision-vnext-core/sandbox/evaluate-phase2.mjs", "packages/decision-vnext-core/sandbox/config/world-smoke-v1.json"], {}, true),
    run("Phase-2 full evaluation seed 1001", process.execPath, ["packages/decision-vnext-core/sandbox/evaluate-phase2.mjs", "packages/decision-vnext-core/sandbox/config/world-phase1-v1.json"], {}, true),
    run("Phase-2 full evaluation seed 1002", process.execPath, ["packages/decision-vnext-core/sandbox/evaluate-phase2.mjs", "packages/decision-vnext-core/sandbox/config/world-phase1-seed-1002-v1.json"], {}, true),
  ];
  if (group === "decision-lab") return [
    run("Decision Lab complete tests", "npm", ["run", "decision-lab:test"], {}, true),
    run("Decision Lab smoke", "npm", ["run", "decision-lab:smoke"], {}, true),
    run("Decision Lab D2 acceptance", "npm", ["run", "decision-lab:d2:acceptance"], {}, true),
    run("Decision Lab D2 recertification", "npm", ["run", "decision-lab:d2:recertify"], {}, true),
    run("Decision Lab D2.2", "npm", ["run", "decision-lab:d2.2:validate"], {}, true),
    run("Decision Lab D3.1", "npm", ["run", "decision-lab:d3.1:preflight"], {}, true),
    run("Decision Lab D3-A", "npm", ["run", "decision-lab:d3-a:validate"], {}, true),
  ];
  if (group === "consumer-contracts") return [
    run("shared contract typecheck", "npm", ["exec", "tsc", "--", "--noEmit", "--pretty", "false", "-p", "packages/shared/tsconfig.json"]),
    run("User Intelligence typecheck", "npm", ["exec", "tsc", "--", "-p", "packages/user-intelligence-vnext-core/tsconfig.json", "--noEmit"]),
    nodeTest("User Intelligence canonical regression", testsUnder("packages/user-intelligence-vnext-core/test")),
    run("World Knowledge typecheck", "npm", ["exec", "tsc", "--", "-p", "packages/world-knowledge-core/tsconfig.json", "--noEmit"]),
    nodeTest("World Knowledge canonical regression", testsUnder("packages/world-knowledge-core/test")),
  ];
  if (group === "functional") return [
    ...runGroup("core-context"),
    ...runGroup("phase2-all"),
    ...runGroup("oracles-workbenches"),
    ...runGroup("consumer-contracts"),
  ];
  throw new Error(`unknown_decision_ci_group:${group}`);
}

const args = process.argv.slice(2);
const group = args[args.indexOf("--group") + 1];
const output = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;
try {
  const started = process.hrtime.bigint();
  const steps = runGroup(group);
  const report = {
    contractVersion: "backyrd-decision-ci-run-report-v1",
    group,
    outcome: "PASS",
    durationMilliseconds: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3)),
    steps,
  };
  if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`); }
  process.stdout.write(`\n${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`decision_ci_group_blocked:${group}:${error.message}\n`);
  process.exitCode = 1;
}
