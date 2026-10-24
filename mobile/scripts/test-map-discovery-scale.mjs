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
const { groupMapSpotsByCoordinate, mapDistanceMeters, paddedMapPinRegion, retainMapPinRegion, selectMapDiscoverySpots, selectRetainedMapDiscoverySpots, shouldRefreshMapPinRegion } = policyModule.exports;

const region = { latitude: 47.5596, longitude: 7.5886, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const spots = Array.from({ length: 5000 }, (_, index) => ({
  id: `spot-${index}`,
  lat: region.latitude - 0.059 + ((index * 37) % 997) / 997 * 0.118,
  lng: region.longitude - 0.059 + ((index * 61) % 991) / 991 * 0.118,
}));
const user = { latitude: region.latitude + 0.012, longitude: region.longitude - 0.021 };
const selected = selectMapDiscoverySpots(spots, region);
assert.equal(selected.length, spots.length, "every spot in the viewport must receive a pin");
assert.equal(new Set(selected.map((spot) => spot.id)).size, spots.length);
assert.ok(selected.every((spot) => Math.abs(spot.lat - region.latitude) <= region.latitudeDelta / 2));
assert.deepEqual(selected, selectMapDiscoverySpots([...spots].reverse(), region));
assert.deepEqual(selected.map((spot) => spot.id), [...selected.map((spot) => spot.id)].sort(), "marker order must stay fixed while the map moves");
assert.ok(mapDistanceMeters(user, user) < 0.001);
assert.ok(mapDistanceMeters(user, { ...user, latitude: user.latitude + 0.001 }) > 100);
assert.deepEqual(selectMapDiscoverySpots([{ id: "outside", lat: 0, lng: 0 }], region), []);
assert.deepEqual(selectMapDiscoverySpots(spots, { ...region, latitudeDelta: 0 }), []);
const edgeRegion = { latitude: 47.56, longitude: 7.59, latitudeDelta: 0.04, longitudeDelta: 0.04 };
const example = [
  { id: "east", lat: 47.56, lng: 7.605 },
  { id: "middle", lat: 47.56, lng: 7.59 },
  { id: "west", lat: 47.56, lng: 7.576 },
];
assert.deepEqual(selectMapDiscoverySpots(example, edgeRegion).map((spot) => spot.id), ["east", "middle", "west"]);

const visible = { latitude: 47.56, longitude: 7.59, latitudeDelta: 0.0045, longitudeDelta: 0.0045 };
const cached = paddedMapPinRegion(visible);
const smallPan = { ...visible, longitude: visible.longitude + 0.001 };
assert.equal(shouldRefreshMapPinRegion(cached, smallPan), false, "a short pan must retain native annotations");
const edgeSpots = [
  { id: "behind", lat: visible.latitude, lng: visible.longitude - 0.002 },
  { id: "ahead", lat: visible.latitude, lng: visible.longitude + 0.003 },
];
assert.deepEqual(selectMapDiscoverySpots(edgeSpots, cached).map((spot) => spot.id), ["ahead", "behind"], "pins near both viewport edges stay mounted during a short pan");
assert.equal(shouldRefreshMapPinRegion(cached, { ...visible, longitude: visible.longitude + 0.0015 }), true, "load the next pin region before visible spots reach its edge");
assert.equal(shouldRefreshMapPinRegion(cached, { ...visible, longitude: visible.longitude + 0.003 }), true, "a larger pan loads the next area");
assert.equal(shouldRefreshMapPinRegion(cached, { ...visible, latitudeDelta: 0.001, longitudeDelta: 0.001 }), true, "zooming in refreshes the nearby pin buffer");
const shifted = paddedMapPinRegion({ ...visible, longitude: visible.longitude + 0.003 });
const retainedRegions = retainMapPinRegion([cached], shifted);
assert.equal(retainedRegions.length, 2);
const panSpots = [...edgeSpots, { id: "further-ahead", lat: visible.latitude, lng: visible.longitude + 0.006 }];
assert.deepEqual(selectRetainedMapDiscoverySpots(panSpots, retainedRegions).map((spot) => spot.id), ["ahead", "behind", "further-ahead"], "a new buffer adds pins without removing existing ones");
assert.equal(retainMapPinRegion(retainedRegions, cached), retainedRegions, "panning back reuses the existing pin buffer");
assert.deepEqual(selectRetainedMapDiscoverySpots(panSpots, [shifted, cached]).map((spot) => spot.id), ["ahead", "behind", "further-ahead"], "pin order stays fixed when regions arrive in a different order");
const sameAddress = [
  { id: "pong", lat: 47.571175840560464, lng: 7.5801917 },
  { id: "braeu", lat: 47.571175840560464, lng: 7.5801917 },
  { id: "neighbor", lat: 47.571175840560464, lng: 7.5803 },
];
const groups = groupMapSpotsByCoordinate(sameAddress);
assert.equal(groups.length, 2, "spots with identical coordinates share one selectable marker");
assert.deepEqual(groups.find((group) => group.spots.length === 2)?.spots.map((spot) => spot.id), ["braeu", "pong"]);
assert.deepEqual(groupMapSpotsByCoordinate([...sameAddress].reverse()), groups, "group order stays stable when spot data arrives in a different order");
console.log("All visible spots remain pinned in stable order while the map moves.");
