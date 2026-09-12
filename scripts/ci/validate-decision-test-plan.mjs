#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE2_TEST_SHARDS, REQUIRED_DECISION_SHARDS } from "./decision-test-plan.mjs";

export function validateDecisionTestPlan({ source, shards = PHASE2_TEST_SHARDS }) {
  const discovered = [...source.matchAll(/^test\("([^"]+)"/gm)].map((match) => match[1]);
  const routed = Object.values(shards).flat();
  const duplicate = routed.find((title, index) => routed.indexOf(title) !== index);
  if (duplicate) throw new Error(`decision_test_routed_more_than_once:${duplicate}`);
  const missing = discovered.filter((title) => !routed.includes(title));
  const stale = routed.filter((title) => !discovered.includes(title));
  if (missing.length) throw new Error(`decision_test_not_routed:${missing.join("|")}`);
  if (stale.length) throw new Error(`decision_test_deleted_or_renamed:${stale.join("|")}`);
  if (discovered.length !== routed.length) throw new Error("decision_test_route_cardinality_mismatch");
  if (new Set(REQUIRED_DECISION_SHARDS).size !== REQUIRED_DECISION_SHARDS.length) throw new Error("decision_required_shard_duplicate");
  return { outcome: "PASS", discoveredTests: discovered.length, shards: Object.keys(shards).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(new URL("../..", import.meta.url).pathname);
    const source = readFileSync(resolve(root, "packages/decision-vnext-core/test/phase2-evaluation-harness.test.mjs"), "utf8");
    process.stdout.write(`${JSON.stringify(validateDecisionTestPlan({ source }))}\n`);
  } catch (error) {
    process.stderr.write(`decision_test_plan_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
