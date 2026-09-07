import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(path.resolve("lib/spot-images.ts"), "utf8");
const artwork = fs.readFileSync(path.resolve("components/spot/SpotArtwork.tsx"), "utf8");
const googlePhoto = fs.readFileSync(path.resolve("lib/google-place-photo.ts"), "utf8");
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

const storedGooglePhotos = new Map();
let googleInvokeCount = 0;
let failGoogleInvoke = false;
const googleMocks = {
  asyncStorage: {
    getItem: async (key) => storedGooglePhotos.get(key) ?? null,
    setItem: async (key, value) => { storedGooglePhotos.set(key, value); },
    removeItem: async (key) => { storedGooglePhotos.delete(key); },
  },
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "token-a" } } }) },
    functions: {
      invoke: async () => {
        googleInvokeCount += 1;
        return failGoogleInvoke
          ? { data: null, error: new Error("temporary") }
          : { data: { ok: true, source: "google", imageUrl: "https://lh3.googleusercontent.com/place-photo", imageIdentity: "places/test/photos/one" }, error: null };
      },
    },
  },
};

function loadGooglePhotoModule() {
  const target = { exports: {} };
  const output = ts.transpileModule(googlePhoto, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("exports", "require", "module", output)(target.exports, (specifier) => {
    if (specifier === "@react-native-async-storage/async-storage") return { __esModule: true, default: googleMocks.asyncStorage };
    if (specifier === "./supabase") return { supabase: googleMocks.supabase };
    throw new Error(`Unexpected Google photo dependency: ${specifier}`);
  }, target);
  return target.exports;
}

const owner = "https://images.example/owner-admin.jpg";
const resolve = (input) => resolveCanonicalSpotImage(input);

// A + B: Owner/Admin always wins and is also valid on its own.
assert.deepEqual(resolve({ headerPhotoUrl: owner, photoUrl: "https://images.example/gallery.jpg" }), {
  imageUrl: owner,
  provenance: "OWNER_ADMIN",
  identity: `owner-admin:${owner}`,
});
assert.equal(resolve({ headerPhotoPath: "owner/header.jpg" }).provenance, "OWNER_ADMIN");
assert.equal(
  resolve({ headerPhotoUrl: "https://images.example/hero%20photo.jpg" }).imageUrl,
  "https://images.example/hero%20photo.jpg",
  "already encoded Owner/Admin URLs must not be encoded a second time",
);

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
assert.match(googlePhoto, /supabase\.auth\.getSession\(\)/, "Google fallback must wait for the native session restoration");
assert.match(googlePhoto, /Authorization:\s*`Bearer \$\{accessToken\}`/, "Google fallback must bind the restored session token explicitly");
assert.match(googlePhoto, /cached\.accessToken === accessToken/, "Google fallback cache must not reuse an older auth token");
assert.match(googlePhoto, /GOOGLE_PHOTO_FAILURE_TTL_MS/, "failed Google requests must be briefly deduplicated instead of creating a retry storm");
assert.match(googlePhoto, /GOOGLE_PHOTO_REQUEST_TTL_MS/, "successful Google metadata may only be retained for the existing short response lifetime");
assert.match(artwork, /cacheNamespace: user\?\.id \?\? null/, "persistent resolver cache must remain isolated to the authenticated user");
assert.match(googlePhoto, /stored\.result\?\.source !== "google"/, "only successful canonical Google results may enter the short persistent cache");
assert.match(artwork, /useAuth\(\)/, "Spot artwork must use the canonical AuthProvider session");
assert.match(artwork, /session\?\.access_token \?\? null/, "missing-image fallback must follow the concrete canonical auth token");
assert.doesNotMatch(artwork, /supabase\.auth\.(?:getSession|onAuthStateChange)/, "Spot cards must not create a parallel auth lifecycle");
assert.doesNotMatch(decision, /photo_url: selectSpotImageUrl\(\{ photoUrl/, "Decision must not select a generic gallery cover");
assert.doesNotMatch(detail, /getGooglePlacePhotoFallback/, "Spot Detail must use the shared renderer resolver");

const googleResolverA = loadGooglePhotoModule();
await googleResolverA.getGooglePlacePhotoFallback("spot-a", { accessToken: "token-a", cacheNamespace: "user-a" });
await googleResolverA.getGooglePlacePhotoFallback("spot-a", { accessToken: "token-a", cacheNamespace: "user-a" });
assert.equal(googleInvokeCount, 1, "concurrent/remounted artwork must share one successful resolver request");

const googleResolverAfterRestart = loadGooglePhotoModule();
await googleResolverAfterRestart.getGooglePlacePhotoFallback("spot-a", { accessToken: "token-a", cacheNamespace: "user-a" });
assert.equal(googleInvokeCount, 1, "a short user-isolated cache must prevent immediate cold-restart fan-out");

failGoogleInvoke = true;
await googleResolverAfterRestart.getGooglePlacePhotoFallback("spot-b", { accessToken: "token-a", cacheNamespace: "user-a" });
await googleResolverAfterRestart.getGooglePlacePhotoFallback("spot-b", { accessToken: "token-a", cacheNamespace: "user-a" });
assert.equal(googleInvokeCount, 2, "a failed resolver request must be negatively cached briefly instead of retrying on every remount");

console.log("Canonical Spot image resolver and cross-surface identity tests passed.");
