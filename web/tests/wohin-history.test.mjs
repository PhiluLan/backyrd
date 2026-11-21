import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/wohin-history.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const history = await import(
  `data:text/javascript,${encodeURIComponent(compiled)}`
);
const row = (id, at = Date.now()) => ({
  id,
  query: "Heute gemütlich etwas trinken",
  city: "Basel",
  at,
  completed: true,
});

test("history bounds age, size and untrusted entry fields", () => {
  const now = Date.now();
  const rows = Array.from({ length: 25 }, (_, index) =>
    row(`request-${index}`, now - index),
  );
  rows.push(row("expired", now - 31 * 86400000), row("future", now + 1000), {
    ...row("invalid"),
    query: { secret: true },
  });
  assert.equal(history.parseWohinHistory(JSON.stringify(rows), now).length, 20);
  assert.equal(
    history.parseWohinHistory(JSON.stringify(rows), now)[0].id,
    "request-0",
  );
  assert.throws(() => history.parseWohinHistory('{"not":"an array"}'));
  assert.throws(() => history.parseWohinHistory("{bad json"));
});

test("history partitions accounts, removes on logout and never hides storage failure", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
      key: (index) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
    dispatchEvent: () => {},
  };
  history.writeWohinHistory("account-a", [row("first")]);
  history.writeWohinHistory("account-b", [row("second")]);
  assert.equal(history.readWohinHistory("account-a")[0].id, "first");
  assert.equal(history.readWohinHistory("account-b")[0].id, "second");
  history.clearOtherWohinHistories("account-b");
  assert.deepEqual(history.readWohinHistory("account-a"), []);
  history.clearOtherWohinHistories();
  assert.deepEqual(history.readWohinHistory("account-b"), []);
  window.localStorage.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => history.writeWohinHistory("account-b", [row("third")]));
  assert.throws(() => history.readWohinHistory("../wrong-actor"));
  delete globalThis.window;
});
