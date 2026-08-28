import assert from "node:assert/strict";
import test from "node:test";
import Supercluster from "supercluster";

test("10k presentation-only map points cluster within the interaction budget", () => {
  const points = Array.from({ length: 10_000 }, (_, index) => ({
    type: "Feature",
    properties: { spotId: `spot-${index}` },
    geometry: {
      type: "Point",
      coordinates: [7.55 + (index % 100) * 0.001, 47.5 + Math.floor(index / 100) * 0.001],
    },
  }));
  const started = performance.now();
  const index = new Supercluster({ radius: 56, maxZoom: 17 }).load(points);
  const clusters = index.getClusters([7.4, 47.4, 7.8, 47.7], 10);
  const elapsed = performance.now() - started;
  assert.ok(clusters.length > 0 && clusters.length < points.length);
  assert.ok(elapsed < 1_500, `clustering took ${Math.round(elapsed)}ms`);
  assert.equal(points.length, 10_000, "clustering must not change Spot eligibility");
});
