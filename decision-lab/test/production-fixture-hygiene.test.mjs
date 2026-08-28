import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scripts = [
  "scripts/decision/validate-user-intelligence-execution.mjs",
  "scripts/decision/validate-deterministic-decision-orchestrator.mjs",
  "scripts/decision/validate-n6-shadow.mjs",
];

test("production-capable Decision fixtures are explicitly product-isolated", async () => {
  for (const path of scripts) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.match(source, /data_origin:\s*"FIXTURE"/, `${path} must mark fixture Spots`);
  }
});

test("user-intelligence execution validation removes its fixture Spots", async () => {
  const source = await readFile(
    new URL("../../scripts/decision/validate-user-intelligence-execution.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /from\("spots"\)\.delete\(\)\.in\("id",Object\.values\(spots\)\)/,
  );
});
