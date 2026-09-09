#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyRiskGate({ requiredGates, results }) {
  if (!Array.isArray(requiredGates) || requiredGates.length === 0) {
    throw new Error("required_gates_missing");
  }
  const missing = requiredGates.filter((gate) => !(gate in results));
  if (missing.length) throw new Error(`required_gate_results_missing:${missing.join(",")}`);

  const failed = requiredGates.filter((gate) => results[gate] !== "success");
  if (failed.length) {
    throw new Error(failed.map((gate) => `${gate}=${results[gate]}`).join(","));
  }
  return {
    schemaVersion: "backyrd-risk-gate-result-v1",
    outcome: "PASS",
    requiredGates: [...requiredGates].sort(),
  };
}

const parseArgs = (argv) => Object.fromEntries(argv.reduce((items, value, index) => {
  if (value.startsWith("--")) items.push([value.slice(2), argv[index + 1]]);
  return items;
}, []));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = verifyRiskGate({
      requiredGates: JSON.parse(args["required-gates"] ?? "[]"),
      results: JSON.parse(args.results ?? "{}"),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`risk_gate_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
