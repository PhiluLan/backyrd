import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import "./test-spot-search.mjs";

const source = fs.readFileSync(path.resolve("lib/mapDiscoveryPolicy.ts"), "utf8");
const policyModule = { exports: {} };
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function("exports", "require", "module", compiled)(policyModule.exports, undefined, policyModule);
const { MAP_SPOT_LIMIT, hasMapRegionChanged, selectMapDiscoverySpots } = policyModule.exports;

const region = { latitude: 47.5596, longitude: 7.5886, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const spots = Array.from({ length: 5000 }, (_, index) => ({
  id: `spot-${index}`,
  lat: region.latitude - 0.06 + ((index * 37) % 997) / 997 * 0.12,
  lng: region.longitude - 0.06 + ((index * 61) % 991) / 991 * 0.12,
}));
const selected = selectMapDiscoverySpots(spots, region);
assert.equal(selected.length, MAP_SPOT_LIMIT);
assert.equal(new Set(selected.map((spot) => spot.id)).size, MAP_SPOT_LIMIT);
assert.ok(selected.every((spot) => Math.abs(spot.lat - region.latitude) <= region.latitudeDelta / 2));
assert.deepEqual(selected, selectMapDiscoverySpots([...spots].reverse(), region));
assert.deepEqual(selectMapDiscoverySpots([{ id: "outside", lat: 0, lng: 0 }], region), []);
assert.equal(selectMapDiscoverySpots(spots, region, 0).length, 0);
const cells = new Set(selected.map((spot) => `${Math.floor((spot.lat - region.latitude + 0.06) / 0.04)}:${Math.floor((spot.lng - region.longitude + 0.06) / 0.03)}`));
assert.ok(cells.size >= 7, "the preview should span the visible area");
assert.equal(hasMapRegionChanged(region, region), false);
assert.equal(hasMapRegionChanged({ ...region, latitude: region.latitude + 0.003 }, region), false);
assert.equal(hasMapRegionChanged({ ...region, latitude: region.latitude + 0.02 }, region), true);
assert.equal(hasMapRegionChanged({ ...region, latitudeDelta: 0.08 }, region), true);
console.log("Map preview selection and deliberate refresh regression passed.");
