import test from "node:test";
import assert from "node:assert/strict";
import { verifiedBrowserLocations, locationBinding, signLocation, verifyLocation } from "../lib/server/researchLocation.mjs";

const expected = { name: "Nomad Eatery & Bar", address: "Brunngässlein 8", locality: "Basel", country: "CH" };
const place = { id: "nomad", displayName: { text: expected.name }, formattedAddress: "Brunngässlein 8, Basel", businessStatus: "OPERATIONAL", location: { latitude: 47.55, longitude: 7.59 }, addressComponents: [
  { types: ["route"], longText: "Brunngässlein" }, { types: ["street_number"], longText: "8" }, { types: ["locality"], longText: "Basel" }, { types: ["country"], shortText: "CH" },
] };

test("browser ID must be independently present in server response and existing identity", () => {
  const provider = { ok: true, results: [{ id: "nomad", place_name: "Brunngässlein 8, Basel", coords: [7.59, 47.55] }] };
  const result = verifiedBrowserLocations(["nomad"], provider, "nomad");
  assert.equal(result.candidates[0].latitude, 47.55);
  assert.equal(result.candidates[0].longitude, 7.59);
  assert.equal(result.automatic, null);
  assert.deepEqual(verifiedBrowserLocations(["forged"], provider, null).candidates, []);
  assert.deepEqual(verifiedBrowserLocations(["nomad"], provider, "different").candidates, []);
  assert.throws(() => verifiedBrowserLocations([{ id: "nomad", latitude: 0 }], provider, null));
});

test("confirmation binds actor, complete input and spot; rejects tampering and expiry", () => {
  const binding = locationBinding({ exportHash: "hash", claims: [1] }, "spot", "admin");
  const token = signLocation(place, binding, "test-secret", 1000);
  assert.equal(verifyLocation(token, binding, "test-secret", 1001).id, "nomad");
  assert.throws(() => verifyLocation(token, binding, "wrong-secret", 1001));
  assert.throws(() => verifyLocation(token, locationBinding({ exportHash: "hash", claims: [2] }, "spot", "admin"), "test-secret", 1001));
  assert.throws(() => verifyLocation(token, locationBinding({ exportHash: "hash", claims: [1] }, "other", "admin"), "test-secret", 1001));
  assert.throws(() => verifyLocation(token, locationBinding({ exportHash: "hash", claims: [1] }, "spot", "other-admin"), "test-secret", 1001));
  assert.throws(() => verifyLocation(token, binding, "test-secret", 901000));
});

test("provider failures, malformed positions and excessive browser candidates fail closed", () => {
  assert.throws(() => verifiedBrowserLocations(["nomad"], { ok: false }, null));
  assert.throws(() => verifiedBrowserLocations(Array(6).fill("nomad"), { ok: true, results: [] }, null));
  for (const coords of [[181, 47], [7, 91], [NaN, 47], ["7", 47], []]) {
    assert.deepEqual(verifiedBrowserLocations(["nomad"], { ok: true, results: [{ id: "nomad", place_name: "address", coords }] }, null).candidates, []);
  }
});
