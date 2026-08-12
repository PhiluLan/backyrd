import test from "node:test";
import assert from "node:assert/strict";
import { D3_EXPECTED, d3Preflight } from "../src/d3-preflight.mjs";

test("D3 preflight binds the complete D2.1 freeze and unchanged V13 source", async () => {
  const result = await d3Preflight();
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.identities.freezeManifestHash, D3_EXPECTED.freezeManifestHash);
  assert.equal(result.identities.engineSourceHash, D3_EXPECTED.engineSourceHash);
  assert.equal(result.hardGateCoverage.pass, true);
  assert.equal(result.hardGateCoverage.count, 9);
  assert.equal(result.scientificValidity, "PASS");
  assert.equal(result.engineMutation, "NONE");
});

test("D3 official world command uses hard violations as a stop exit", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/d3-world-cli.mjs", import.meta.url), "utf8"));
  assert.match(source, /P0_STOP/);
  assert.match(source, /process\.exitCode = 42/);
});
