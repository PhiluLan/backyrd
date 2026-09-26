import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/spot-world-profile.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const directory = await mkdtemp(join(tmpdir(), "backyrd-world-profile-test-"));
const modulePath = join(directory, "profile.mjs");
await writeFile(modulePath, output, { mode: 0o600 });
const { applyCanonicalWorldSpot } = await import(modulePath);

const legacy = {
  spot: { name: "Alt", address: "Altweg", city: "Altstadt", lat: 1, lng: 2, header_photo_path: "photo" },
  opening_hours: [{ day_of_week: "Montag", open_time: "01:00", close_time: "02:00", idx: 0 }],
};
const profile = {
  contractVersion: "backyrd.spot-detail-product-profile@1.0",
  surface: "WEB",
  worldManifestHash: "a".repeat(64),
  spot: {
    spotId: "spot", name: "Kanonisch", addressLine1: "Weltweg 1", locality: "Basel",
    countryCode: "CH", latitude: 47.5, longitude: 7.5,
    regularHours: [{ day: "SUNDAY", intervals: [{ start: "10:00", end: "18:00" }] }],
    source: "WORLD_KNOWLEDGE", headerPhotoPath: null,
  },
  fields: [],
};

test("a manifested World profile replaces legacy identity, location and hours together", () => {
  const result = applyCanonicalWorldSpot(legacy, profile);
  assert.deepEqual(result.spot, {
    name: "Kanonisch", address: "Weltweg 1", city: "Basel", country: "CH",
    lat: 47.5, lng: 7.5, header_photo_path: "photo",
  });
  assert.deepEqual(result.opening_hours, [
    { day_of_week: "Sonntag", open_time: "10:00", close_time: "18:00", idx: 0 },
  ]);
});

test("no manifest means no partial World override", () => {
  assert.equal(applyCanonicalWorldSpot(legacy, { ...profile, worldManifestHash: null }), legacy);
});
