import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const policySource = fs.readFileSync(path.resolve("lib/mapDiscoveryPolicy.ts"), "utf8");
const policyModule = { exports: {} };
const compiled = ts.transpileModule(policySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function("exports", "require", "module", compiled)(policyModule.exports, undefined, policyModule);
const { resolveMapZoomBucket, clusterPolicyFor } = policyModule.exports;

const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const gridFor = { city: 6, district: 10, neighborhood: 18, street: 10000 };

function fixture(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `spot-${index}`,
    latitude: BASEL.latitude - 0.06 + ((index * 37) % 997) / 997 * 0.12,
    longitude: BASEL.longitude - 0.06 + ((index * 61) % 991) / 991 * 0.12,
  }));
}

function snapshot(spots, latitudeDelta, previous = "city") {
  const visible = spots.filter((spot) =>
    Math.abs(spot.latitude - BASEL.latitude) <= latitudeDelta / 2 &&
    Math.abs(spot.longitude - BASEL.longitude) <= latitudeDelta / 2,
  );
  const bucket = resolveMapZoomBucket(latitudeDelta, previous);
  const policy = clusterPolicyFor(bucket);
  if (!policy.enabled) return { bucket, visible: visible.length, clusters: 0, markers: visible.length, ids: visible.map((spot) => spot.id).sort(), durationMs: 0 };
  const startedAt = performance.now();
  const cells = gridFor[bucket];
  const cellLat = latitudeDelta / cells;
  const cellLng = latitudeDelta / cells;
  const groups = new Map();
  for (const spot of visible) {
    const lat = Math.floor((spot.latitude - (BASEL.latitude - latitudeDelta / 2)) / cellLat);
    const lng = Math.floor((spot.longitude - (BASEL.longitude - latitudeDelta / 2)) / cellLng);
    const key = `${lat}:${lng}`;
    groups.set(key, [...(groups.get(key) ?? []), spot.id]);
  }
  const ids = [...groups.entries()].map(([key, spotIds]) => spotIds.length >= policy.minPoints ? `cluster:${key}:${spotIds.length}` : `spot:${spotIds[0]}`).sort();
  return { bucket, visible: visible.length, clusters: ids.filter((id) => id.startsWith("cluster:")).length, markers: ids.filter((id) => id.startsWith("spot:")).length, ids, durationMs: performance.now() - startedAt };
}

for (const count of [500, 1000, 5000]) {
  const spots = fixture(count);
  const city = snapshot(spots, 0.12);
  const district = snapshot(spots, 0.04, city.bucket);
  const street = snapshot(spots, 0.006, district.bucket);
  assert.ok(city.clusters + city.markers <= 36, `${count}: city viewport exceeds visual grid budget`);
  assert.equal(street.markers, street.visible, `${count}: street viewport must disclose individual spots`);
  assert.ok(city.clusters + city.markers < count, `${count}: city viewport rendered every input spot`);
  const cycle = snapshot(spots, 0.12, resolveMapZoomBucket(0.04, city.bucket));
  assert.deepEqual(cycle.ids, city.ids, `${count}: zoom cycle produced a stale cluster snapshot`);
  console.log(`${count}: city=${city.visible} visible → ${city.clusters} clusters/${city.markers} markers (${city.durationMs.toFixed(2)}ms), district=${district.visible} → ${district.clusters}/${district.markers} (${district.durationMs.toFixed(2)}ms), street=${street.visible} → ${street.markers} markers`);
}

assert.equal(resolveMapZoomBucket(0.054, "city"), "district");
assert.equal(resolveMapZoomBucket(0.06, "district"), "district");
assert.equal(resolveMapZoomBucket(0.071, "district"), "city");
console.log("Map discovery scale and stale-snapshot regression passed.");
