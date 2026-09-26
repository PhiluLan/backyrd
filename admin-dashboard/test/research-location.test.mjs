import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocations, lookupLocations, locationBinding, signLocation, verifyLocation } from "../lib/server/researchLocation.mjs";

const expected = { name: "Nomad Eatery & Bar", address: "Brunngässlein 8", locality: "Basel", country: "CH" };
const place = { id: "nomad", displayName: { text: expected.name }, formattedAddress: "Brunngässlein 8, Basel", businessStatus: "OPERATIONAL", location: { latitude: 47.55, longitude: 7.59 }, addressComponents: [
  { types: ["route"], longText: "Brunngässlein" }, { types: ["street_number"], longText: "8" }, { types: ["locality"], longText: "Basel" }, { types: ["country"], shortText: "CH" },
] };

test("only a unique exact identity can be preselected", () => {
  assert.equal(classifyLocations([place], expected, "nomad").automatic, "nomad");
  assert.equal(classifyLocations([place, { ...place, id: "second" }], expected).automatic, null);
  for (const mismatch of [{ name: "Nomad Hotel" }, { address: "Brunngässlein 9" }, { locality: "Zürich" }, { country: "DE" }]) {
    assert.equal(classifyLocations([place], { ...expected, ...mismatch }).automatic, null);
  }
  assert.equal(classifyLocations([place], expected, "different-existing-id").automatic, null);
  assert.equal(classifyLocations([{ ...place, businessStatus: "CLOSED_PERMANENTLY" }], expected).automatic, null);
  assert.deepEqual(classifyLocations([{ ...place, location: { latitude: 200, longitude: 7 } }], expected).candidates, []);
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

test("existing Place ID uses details; missing ID uses bounded search; errors stay visible", async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => url.includes("searchText") ? { places: [place] } : place }; };
  assert.equal((await lookupLocations(expected, "nomad", "key", fetcher)).automatic, "nomad");
  assert.match(calls[0].url, /\/places\/nomad$/);
  assert.equal((await lookupLocations(expected, null, "key", fetcher)).automatic, "nomad");
  assert.equal(JSON.parse(calls[1].options.body).pageSize, 5);
  assert.equal(calls[1].options.headers["X-Goog-Api-Key"], "key");
  await assert.rejects(lookupLocations(expected, null, null, fetcher), /konfiguriert/);
  await assert.rejects(lookupLocations(expected, null, "key", async () => ({ ok: false })), /nicht verfügbar/);
});
