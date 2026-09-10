import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const committed = JSON.parse(readFileSync(new URL("../../docs/world-knowledge/slice-3a/repository-coverage.aggregate.json", import.meta.url), "utf8"));

test("repository coverage artifact is deterministic and bound to canonical base", () => {
  const generated = JSON.parse(execFileSync(process.execPath, ["scripts/world-knowledge/build-repository-coverage.mjs"], { cwd: root, encoding: "utf8" }));
  assert.deepEqual(generated, committed);
  assert.equal(generated.canonicalBase, "983cd7b3a3c11dd3e549c256850749b07b52eadf");
  assert.equal(generated.productionQueried, false);
  assert.match(generated.reportHash, /^[a-f0-9]{64}$/);
});
