import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/spot-product-profile.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: (name) => {
  assert.equal(name, "./supabase");
  return { supabase: {} };
}, Intl });

const known = (attributeKey, value) => ({ attributeKey, value, knowledgeState: "KNOWN_VALUE" });
assert.deepEqual(Array.from(exports.spotOfferingLabels(["BEER", "CRAFT_BEER", "NON_ALCOHOLIC_DRINKS", "LATE_NIGHT_FOOD"])), ["Bier", "Craft Beer", "Alkoholfreie Getränke", "Spätes Essen"]);
assert.equal(exports.presentSpotProductField(known("offering.groups", ["BEER", "COFFEE"])), "Bier · Kaffee");
assert.deepEqual(JSON.parse(JSON.stringify(exports.spotPetAccessDetails({ indoor: "ALLOWED", outdoor: "NOT_ALLOWED", assistanceAnimals: "UNKNOWN" }))), [
  { label: "Drinnen", value: "Erlaubt" },
  { label: "Draussen", value: "Nicht erlaubt" },
  { label: "Assistenztiere", value: "Noch nicht bekannt" },
]);
assert.deepEqual(JSON.parse(JSON.stringify(exports.spotCurrentStateDetails({ kind: "AREA_CLOSED", scope: "VENUE" }))), { title: "Bereichsschliessung gemeldet", scope: "Betrifft den ganzen Ort" });
assert.equal(exports.presentSpotProductField(known("state.current", { kind: "AREA_CLOSED", scope: "VENUE" })), "Bereichsschliessung gemeldet · Betrifft den ganzen Ort");
assert.equal(exports.presentSpotProductField({ ...known("state.current", null), knowledgeState: "UNKNOWN" }), "Noch nicht bekannt");
console.log("Spot detail presentation: PASS");
