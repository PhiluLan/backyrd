import test from "node:test";
import assert from "node:assert/strict";
import { validateBrowserLocations, locationBinding, signLocation, verifyLocation } from "../lib/server/researchLocation.mjs";

const expected = { name: "Nomad Eatery & Bar", address: "Brunngässlein 8", locality: "Basel", country: "CH" };
const place = { id: "nomad", displayName: { text: expected.name }, formattedAddress: "Brunngässlein 8, Basel", businessStatus: "OPERATIONAL", location: { latitude: 47.55, longitude: 7.59 }, addressComponents: [
  { types: ["route"], longText: "Brunngässlein" }, { types: ["street_number"], longText: "8" }, { types: ["locality"], longText: "Basel" }, { types: ["country"], shortText: "CH" },
] };

const proposal = { placeId: "nomad", name: "Nomad", address: "Brunngässlein 8, Basel", latitude: 47.55, longitude: 7.59 };
test("Admin proposals preserve existing identity and are never automatically accepted", () => {
  const result = validateBrowserLocations([proposal], "nomad");
  assert.equal(result.candidates[0].latitude, 47.55);
  assert.equal(result.candidates[0].longitude, 7.59);
  assert.equal(result.automatic, null);
  assert.deepEqual(validateBrowserLocations([proposal], "different").candidates, []);
  assert.throws(() => validateBrowserLocations([{ id: "nomad", latitude: 0 }], null));
  assert.match(result.candidates[0].sourceUrl, /^https:\/\/www.google.com\/maps\/search/);
  assert.equal(validateBrowserLocations([{ ...proposal, sourceUrl: "https://evil.invalid" }], null).candidates[0].sourceUrl, result.candidates[0].sourceUrl);
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

test("malformed proposals, positions and excessive browser candidates fail closed", () => {
  assert.throws(() => validateBrowserLocations(null, null));
  assert.throws(() => validateBrowserLocations(Array(6).fill(proposal), null));
  for (const coords of [[181, 47], [7, 91], [NaN, 47], ["7", 47], []]) {
    assert.throws(() => validateBrowserLocations([{ ...proposal, longitude: coords[0], latitude: coords[1] }], null));
  }
});
