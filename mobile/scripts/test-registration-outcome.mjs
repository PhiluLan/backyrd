import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/auth/registrationOutcome.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { registrationOutcome } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("confirmed duplicate does not claim a confirmation email was sent", () => {
  assert.equal(registrationOutcome({ user: { identities: [] }, session: null }), "not_created");
});

test("new registration can offer the confirmation step", () => {
  assert.equal(registrationOutcome({ user: { identities: [{ provider: "email" }] }, session: null }), "confirmation_requested");
});

test("immediate session and ambiguous responses stay distinct", () => {
  assert.equal(registrationOutcome({ user: null, session: {} }), "signed_in");
  assert.equal(registrationOutcome({ user: null, session: null }), "uncertain");
  assert.equal(registrationOutcome({ user: {}, session: null }), "uncertain");
});
