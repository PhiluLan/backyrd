import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(path.resolve("lib/requestDeadline.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const requestDeadline = { exports: {} };
new Function("exports", compiled)(requestDeadline.exports);
const { withRequestDeadline } = requestDeadline.exports;

test("successful request resolves before its deadline", async () => {
  assert.equal(await withRequestDeadline(async () => "ready", 100), "ready");
});

test("stalled request stops loading and aborts its transport", async () => {
  let signal;
  await assert.rejects(
    withRequestDeadline((requestSignal) => {
      signal = requestSignal;
      return new Promise(() => {});
    }, 20),
    /request_deadline_exceeded/,
  );
  assert.equal(signal.aborted, true);
});

test("request failure remains a failure without waiting for the deadline", async () => {
  await assert.rejects(
    withRequestDeadline(async () => { throw new Error("offline"); }, 100),
    /offline/,
  );
});
