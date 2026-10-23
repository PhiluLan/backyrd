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
const { MAP_SPOT_LIMIT, hasMapRegionChanged, mapDistanceMeters, selectMapDiscoverySpots } = policyModule.exports;

const region = { latitude: 47.5596, longitude: 7.5886, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const spots = Array.from({ length: 5000 }, (_, index) => ({
  id: `spot-${index}`,
  lat: region.latitude - 0.06 + ((index * 37) % 997) / 997 * 0.12,
  lng: region.longitude - 0.06 + ((index * 61) % 991) / 991 * 0.12,
}));
const user = { latitude: region.latitude + 0.012, longitude: region.longitude - 0.021 };
const selected = selectMapDiscoverySpots(spots, region, user);
assert.equal(selected.length, MAP_SPOT_LIMIT);
assert.equal(new Set(selected.map((spot) => spot.id)).size, MAP_SPOT_LIMIT);
assert.ok(selected.every((spot) => Math.abs(spot.lat - region.latitude) <= region.latitudeDelta / 2));
assert.deepEqual(selected, selectMapDiscoverySpots([...spots].reverse(), region, user));
const distances = selected.map((spot) => mapDistanceMeters(user, { latitude: spot.lat, longitude: spot.lng }));
assert.deepEqual(distances, [...distances].sort((a, b) => a - b), "the rail must show the nearest places first");
assert.ok(mapDistanceMeters(user, user) < 0.001);
assert.ok(mapDistanceMeters(user, { ...user, latitude: user.latitude + 0.001 }) > 100);
assert.deepEqual(selectMapDiscoverySpots([{ id: "outside", lat: 0, lng: 0 }], region, user), []);
assert.equal(selectMapDiscoverySpots(spots, region, user, 0).length, 0);
const edgeRegion = { latitude: 47.56, longitude: 7.59, latitudeDelta: 0.04, longitudeDelta: 0.04 };
const westOrigin = { latitude: 47.56, longitude: 7.575 };
const example = [
  { id: "east", lat: 47.56, lng: 7.605 },
  { id: "middle", lat: 47.56, lng: 7.59 },
  { id: "west", lat: 47.56, lng: 7.576 },
];
assert.equal(selectMapDiscoverySpots(example, edgeRegion, westOrigin)[0].id, "west", "a user at the edge must see nearby spots first");
assert.equal(selectMapDiscoverySpots(example, edgeRegion)[0].id, "middle", "without location, use the map centre honestly");
assert.equal(hasMapRegionChanged(region, region), false);
assert.equal(hasMapRegionChanged({ ...region, latitude: region.latitude + 0.003 }, region), false);
assert.equal(hasMapRegionChanged({ ...region, latitude: region.latitude + 0.02 }, region), true);
assert.equal(hasMapRegionChanged({ ...region, latitudeDelta: 0.08 }, region), true);
console.log("Nearby map selection and deliberate refresh regression passed.");
