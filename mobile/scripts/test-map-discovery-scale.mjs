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
const { mapDistanceMeters, selectMapDiscoverySpots } = policyModule.exports;

const region = { latitude: 47.5596, longitude: 7.5886, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const spots = Array.from({ length: 5000 }, (_, index) => ({
  id: `spot-${index}`,
  lat: region.latitude - 0.059 + ((index * 37) % 997) / 997 * 0.118,
  lng: region.longitude - 0.059 + ((index * 61) % 991) / 991 * 0.118,
}));
const user = { latitude: region.latitude + 0.012, longitude: region.longitude - 0.021 };
const selected = selectMapDiscoverySpots(spots, region, user);
assert.equal(selected.length, spots.length, "every spot in the viewport must receive a pin");
assert.equal(new Set(selected.map((spot) => spot.id)).size, spots.length);
assert.ok(selected.every((spot) => Math.abs(spot.lat - region.latitude) <= region.latitudeDelta / 2));
assert.deepEqual(selected, selectMapDiscoverySpots([...spots].reverse(), region, user));
const distances = selected.map((spot) => mapDistanceMeters(user, { latitude: spot.lat, longitude: spot.lng }));
assert.deepEqual(distances, [...distances].sort((a, b) => a - b), "spots remain ordered by distance");
assert.ok(mapDistanceMeters(user, user) < 0.001);
assert.ok(mapDistanceMeters(user, { ...user, latitude: user.latitude + 0.001 }) > 100);
assert.deepEqual(selectMapDiscoverySpots([{ id: "outside", lat: 0, lng: 0 }], region, user), []);
assert.deepEqual(selectMapDiscoverySpots(spots, { ...region, latitudeDelta: 0 }, user), []);
const edgeRegion = { latitude: 47.56, longitude: 7.59, latitudeDelta: 0.04, longitudeDelta: 0.04 };
const westOrigin = { latitude: 47.56, longitude: 7.575 };
const example = [
  { id: "east", lat: 47.56, lng: 7.605 },
  { id: "middle", lat: 47.56, lng: 7.59 },
  { id: "west", lat: 47.56, lng: 7.576 },
];
assert.equal(selectMapDiscoverySpots(example, edgeRegion, westOrigin)[0].id, "west", "a user at the edge must see nearby spots first");
assert.equal(selectMapDiscoverySpots(example, edgeRegion)[0].id, "middle", "without location, use the map centre honestly");
console.log("Every visible spot is selected for the map.");
