import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/spot-search.ts", import.meta.url), "utf8");
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module,
  exports: module.exports,
});
const { spotMatchesSearch } = module.exports;
const spot = { name: "Volta Bräu", address: "Voltastrasse 30", city: "Basel", categories: { name: "Pub" } };

assert.equal(spotMatchesSearch(spot, "Volta"), true);
assert.equal(spotMatchesSearch(spot, "Braeu"), true);
assert.equal(spotMatchesSearch(spot, "Pub"), true);
assert.equal(spotMatchesSearch(spot, "Voltastrase"), true);
assert.equal(spotMatchesSearch(spot, "Basel Pub"), true);
assert.equal(spotMatchesSearch(spot, "gemuetlich", ["Gemütlich"]), true);
assert.equal(spotMatchesSearch(spot, "Zürich"), false);
assert.equal(spotMatchesSearch(spot, ""), true);
console.log("Spot search matching passed.");
