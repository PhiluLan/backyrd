import assert from "node:assert/strict";
import { createRequire } from "node:module";

// GHSA-pqg4-j6r4-53mv: quoting after a comment must reject a new shell line.
// Inspect quote output only. Never pass these inputs to a shell.
const { quote, parse } = createRequire(import.meta.url)("shell-quote");
for (const separator of ["\n", "\r", "\u2028", "\u2029"]) {
  assert.throws(() => quote(["echo", "ok", { comment: "test" }, `a${separator}harmless-token;#`]), TypeError);
}
assert.equal(quote(["echo", "hello world"]), "echo 'hello world'");
assert.deepEqual(parse("echo 'hello world'"), ["echo", "hello world"]);
console.log("Tooling security: comment/line-terminator injection rejected; ordinary quoting preserved.");
