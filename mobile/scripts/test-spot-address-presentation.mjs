import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/spot-address-presentation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });

assert.deepEqual(Array.from(exports.spotAddressLines({ street: "Klybeckstrasse 69", locality: "Basel", country: "CH" })), ["Klybeckstrasse 69", "Basel", "Schweiz"]);
assert.deepEqual(Array.from(exports.spotAddressLines({ street: "Volta strasse 30", postalCode: "4056", locality: "Basel", neighborhood: "St. Johann", country: "CH" })), ["Volta strasse 30", "4056 Basel", "St. Johann · Schweiz"]);
assert.deepEqual(Array.from(exports.spotAddressLines({ street: null, locality: null, country: null })), []);
assert.deepEqual(Array.from(exports.spotAddressLines({ street: "  Marktgasse 1 ", locality: " Bern ", country: "Schweiz" })), ["Marktgasse 1", "Bern", "Schweiz"]);
console.log("Spot address presentation: PASS");
