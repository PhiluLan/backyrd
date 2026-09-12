#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_DECISION_SHARDS } from "./decision-test-plan.mjs";

export function verifyDecisionShards({ results, required = REQUIRED_DECISION_SHARDS }) {
  if (!results || typeof results !== "object" || Array.isArray(results)) throw new Error("decision_shard_results_invalid");
  if (new Set(required).size !== required.length) throw new Error("decision_required_shard_duplicate");
  const missing = required.filter((name) => !(name in results));
  if (missing.length) throw new Error(`decision_shard_missing:${missing.join(",")}`);
  const unexpected = Object.keys(results).filter((name) => !required.includes(name));
  if (unexpected.length) throw new Error(`decision_shard_unexpected:${unexpected.join(",")}`);
  const failed = required.filter((name) => results[name] !== "success");
  if (failed.length) throw new Error(failed.map((name) => `${name}=${results[name]}`).join(","));
  return { schemaVersion: "backyrd-decision-shard-gate-v1", outcome: "PASS", required: [...required] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf("--results");
    const results = JSON.parse(index >= 0 ? process.argv[index + 1] : "{}");
    process.stdout.write(`${JSON.stringify(verifyDecisionShards({ results }))}\n`);
  } catch (error) {
    process.stderr.write(`decision_shard_gate_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
