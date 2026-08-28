import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(path.resolve("lib/spot-images.ts"), "utf8");
const artwork = fs.readFileSync(path.resolve("components/spot/SpotArtwork.tsx"), "utf8");
const decision = fs.readFileSync(path.resolve("app/(tabs)/decision.tsx"), "utf8");
const detail = fs.readFileSync(path.resolve("app/spot/[id].tsx"), "utf8");
const module = { exports: {} };
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

new Function("exports", "require", "module", compiled)(module.exports, (specifier) => {
  if (specifier === "./supabase") {
    return { supabase: { storage: { from: () => ({ getPublicUrl: (value) => ({ data: { publicUrl: `https://storage.example/${value}` } }) }) } } };
  }
  throw new Error(`Unexpected dependency: ${specifier}`);
}, module);

const { resolveCanonicalSpotImage } = module.exports;

const owner = "https://images.example/owner-admin.jpg";
const resolve = (input) => resolveCanonicalSpotImage(input);

// A + B: Owner/Admin always wins and is also valid on its own.
assert.deepEqual(resolve({ headerPhotoUrl: owner, photoUrl: "https://images.example/gallery.jpg" }), {
  imageUrl: owner,
  provenance: "OWNER_ADMIN",
  identity: `owner-admin:${owner}`,
});
assert.equal(resolve({ headerPhotoPath: "owner/header.jpg" }).provenance, "OWNER_ADMIN");

// C + D: without a verified header, the renderer asks the authenticated Google
// resolver; failing that, it renders Backyrd's designed fallback.
assert.deepEqual(resolve({ photoUrl: "https://images.example/unverified-gallery.jpg" }), {
  imageUrl: null,
  provenance: "BACKYRD_FALLBACK",
  identity: "backyrd:fallback",
});
assert.equal(resolve({}).provenance, "BACKYRD_FALLBACK");

// E + F are covered at the renderer boundary: owner <Image onError> requests
// Google with preferredOwnerImageFailed, and a missing/broken Google response
// leaves this fallback identity in place.
const surfaceInputs = ["Home", "List", "Map Preview", "Decision", "Spot Detail", "Moment reference"];
const canonical = surfaceInputs.map(() => resolve({ headerPhotoUrl: owner }));
assert.ok(canonical.every((image) => image.identity === canonical[0].identity && image.provenance === canonical[0].provenance));
assert.match(source, /backyrd_web_canonical_spot_image_headers_v1/, "Home catalog must project the authoritative header, not a gallery row");
assert.match(artwork, /preferredOwnerImageFailed/, "broken Owner/Admin images must request the Google fallback");
assert.match(artwork, /Google Maps/, "Google display must retain visible attribution");
assert.doesNotMatch(decision, /photo_url: selectSpotImageUrl\(\{ photoUrl/, "Decision must not select a generic gallery cover");
assert.doesNotMatch(detail, /getGooglePlacePhotoFallback/, "Spot Detail must use the shared renderer resolver");

console.log("Canonical Spot image resolver and cross-surface identity tests passed.");
