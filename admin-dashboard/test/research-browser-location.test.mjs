import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/world-knowledge/WorldAddressPicker.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function browser(status, results) {
  const module = { exports: {} };
  const queries = [];
  const context = vm.createContext({ module, exports: module.exports, require, setTimeout, clearTimeout,
    process: { env: { NEXT_PUBLIC_GOOGLE_API_KEY: "existing-browser-key" } },
    document: { createElement: () => ({}) },
    window: { google: { maps: { places: { PlacesService: class { textSearch(request, callback) { queries.push(request.query); callback(results, status); } } } } } },
  });
  vm.runInContext(code, context);
  return { search: module.exports.findResearchPlaceIds, queries };
}
test("research uses existing browser SDK and returns bounded IDs, never browser coordinates", async () => {
  const app = browser("OK", Array.from({ length: 8 }, (_, i) => ({ place_id: `place${i}`, geometry: { latitude: 0 } })));
  const result = await app.search("Nomad Eatery & Bar, Brunngässlein 8, Basel");
  assert.equal(result.length, 5);
  assert.equal(result[0], "place0");
  assert.equal(typeof result[0], "string");
  assert.equal(app.queries.length, 1);
});
test("browser distinguishes no match and denied/provider error", async () => {
  assert.equal((await browser("ZERO_RESULTS", null).search("Nomad")).length, 0);
  await assert.rejects(browser("REQUEST_DENIED", null).search("Nomad"), /nicht verfügbar/);
});
