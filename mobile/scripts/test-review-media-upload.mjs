import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// V15_ASSERT:upload_failure_no_review_or_smart_evidence
// V15_ASSERT:exact_retry_idempotent

const source = fs.readFileSync(path.resolve("lib/review-media-upload.ts"), "utf8");
const screens = ["new", "smart", "quick"].map((name) =>
  fs.readFileSync(path.resolve(`app/review/${name}.tsx`), "utf8"),
);
const calls = [];
let uploadError = null;
let reservationState = "OPEN";
let reservationError = null;
let finalizationError = null;
const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: "user" }, expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null }),
    refreshSession: async () => ({ data: { session: { user: { id: "user" } } }, error: null }),
  },
  rpc: async (name, args) => {
    calls.push({ kind: "rpc", name, args });
    return {
      data: name === "reserve_review_media_upload_v2"
        ? { review_id: args.p_review_id, state: reservationState }
        : args.p_review_id,
      error: name === "reserve_review_media_upload_v2"
        ? reservationError
        : finalizationError,
    };
  },
  storage: {
    from: (bucket) => ({
      upload: async (storagePath, body, options) => {
        calls.push({ kind: "upload", bucket, storagePath, body, options });
        return { error: uploadError };
      },
      getPublicUrl: (storagePath) => ({
        data: { publicUrl: `https://project.invalid/storage/v1/object/public/${bucket}/${storagePath}` },
      }),
      remove: async (storagePaths) => {
        calls.push({ kind: "remove", bucket, storagePaths });
        return { error: null };
      },
    }),
  },
};
const module = { exports: {} };
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function("exports", "require", "module", output)(
  module.exports,
  (specifier) => {
    if (specifier === "./supabase") return { supabase };
    if (specifier === "expo-crypto") return {
      CryptoDigestAlgorithm: { SHA256: "SHA256" },
      digest: async () => new Uint8Array(32).buffer,
    };
    if (specifier === "expo-file-system") return {
      File: class {
        constructor(uri) { this.uri = uri; }
        async arrayBuffer() { return (await globalThis.fetch(this.uri)).arrayBuffer(); }
      },
    };
    throw new Error(specifier);
  },
  module,
);
const {
  REVIEW_MEDIA_MAX_BYTES,
  ReviewMediaError,
  reviewMediaErrorContext,
  resolveReviewMediaMime,
  uploadReservedReviewMedia,
  finalizeReviewWithMedia,
  finalizeReviewWithoutMedia,
  discardReviewMediaAttempt,
} = module.exports;

const reviewId = "91000000-0000-4000-8000-000000000020";
const spotId = "91000000-0000-4000-8000-000000000010";
const bytesFor = (uri) => {
  if (uri.endsWith(".jpg")) return Uint8Array.from([0xff, 0xd8, 0xff, 0x00]).buffer;
  if (uri.endsWith(".png")) return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  if (uri.endsWith(".heic")) return Uint8Array.from([0, 0, 0, 0, 102, 116, 121, 112, 104, 101, 105, 99]).buffer;
  if (uri.endsWith(".heif")) return Uint8Array.from([0, 0, 0, 0, 102, 116, 121, 112, 109, 105, 102, 49]).buffer;
  return new ArrayBuffer(0);
};
globalThis.fetch = async (uri) => ({ ok: true, arrayBuffer: async () => bytesFor(uri) });

assert.equal(resolveReviewMediaMime({ uri: "file:///a.heic", mimeType: "image/heic" }), "image/heic");
assert.equal(resolveReviewMediaMime({ uri: "file:///a.heif" }), "image/heif");
assert.equal(resolveReviewMediaMime({ uri: "file:///a.gif", mimeType: "image/gif" }), null);

for (const asset of [
  { uri: "file:///gallery.jpg", mimeType: "image/jpeg", fileName: "gallery.jpg" },
  { uri: "file:///camera.jpg", mimeType: "image/jpeg", fileName: "camera.jpg" },
  { uri: "file:///gallery.png", mimeType: "image/png", fileName: "gallery.png" },
  { uri: "file:///native.heic", mimeType: "image/heic", fileName: "native.heic" },
  { uri: "file:///native.heif", mimeType: "image/heif", fileName: "native.heif" },
]) {
  calls.length = 0;
  const result = await uploadReservedReviewMedia({ reviewId, spotId, smartReview: false, assets: [asset] });
  assert.equal(calls[0].name, "reserve_review_media_upload_v2");
  assert.equal(calls[0].args.p_max_sizes_bytes[0], bytesFor(asset.uri).byteLength);
  assert.equal(calls[1].kind, "upload");
  assert.equal(calls[1].options.upsert, false);
  assert.equal(calls[1].options.metadata.review_content_sha256, "0".repeat(64));
  assert.match(result.storagePaths[0], new RegExp(`^${reviewId}/0\\.`));
  if (asset.mimeType === "image/heic" || asset.mimeType === "image/heif") {
    assert.equal(calls[1].options.contentType, asset.mimeType);
    assert.match(result.storagePaths[0], new RegExp(`\.${asset.mimeType.slice(6)}$`));
  }
}

await assert.rejects(
  uploadReservedReviewMedia({
    reviewId, spotId, smartReview: false,
    assets: [{ uri: "file:///large.jpg", mimeType: "image/jpeg", fileSize: REVIEW_MEDIA_MAX_BYTES + 1 }],
  }),
  (error) => error instanceof ReviewMediaError && error.stage === "media_validation",
);

calls.length = 0;
await assert.rejects(
  uploadReservedReviewMedia({
    reviewId, spotId, smartReview: false,
    assets: [{ uri: "file:///content.png", mimeType: "image/jpeg", fileName: "claimed.jpg" }],
  }),
  (error) => error instanceof ReviewMediaError &&
    error.stage === "media_validation" &&
    error.safeCode === "IMAGE_CONTENT_TYPE_MISMATCH",
);
assert.equal(calls.length, 0, "invalid bytes must fail before a reservation or upload");

calls.length = 0;
reservationError = { status: 403, code: "42501", message: "REVIEW_MEDIA_RESERVATION_INVALID" };
await assert.rejects(
  uploadReservedReviewMedia({
    reviewId, spotId, smartReview: false,
    assets: [{ uri: "file:///gallery.jpg", mimeType: "image/jpeg" }],
  }),
  (error) => error instanceof ReviewMediaError &&
    error.stage === "reservation" &&
    error.safeCode === "REVIEW_MEDIA_RESERVATION_INVALID",
);
assert.equal(calls.filter((call) => call.kind === "upload").length, 0);
reservationError = null;

uploadError = { status: 403, code: "Unauthorized", message: "denied" };
await assert.rejects(
  uploadReservedReviewMedia({ reviewId, spotId, smartReview: true, assets: [{ uri: "file:///denied.jpg", mimeType: "image/jpeg" }] }),
  (error) => error instanceof ReviewMediaError && error.stage === "storage_upload",
);
assert.equal(calls.some((call) => call.name === "finalize_review_with_media_v2"), false);
const safeFailure = reviewMediaErrorContext(await uploadReservedReviewMedia({
  reviewId, spotId, smartReview: false,
  assets: [{ uri: "file:///gallery.jpg", mimeType: "image/jpeg" }],
}).catch((error) => error));
assert.deepEqual(safeFailure, {
  stage: "storage_upload", code: "Unauthorized", http_status: 403, media_index: 0,
});
uploadError = null;

calls.length = 0;
uploadError = { status: 409, message: "The resource already exists" };
const exactDuplicateRetry = await uploadReservedReviewMedia({
  reviewId, spotId, smartReview: false,
  assets: [{ uri: "file:///gallery.jpg", mimeType: "image/jpeg" }],
});
assert.deepEqual(exactDuplicateRetry.storagePaths, [`${reviewId}/0.jpg`]);
assert.equal(calls.find((call) => call.kind === "upload").options.upsert, false);

uploadError = { status: 409, message: "A different conflict" };
await assert.rejects(
  uploadReservedReviewMedia({
    reviewId, spotId, smartReview: false,
    assets: [{ uri: "file:///gallery.jpg", mimeType: "image/jpeg" }],
  }),
  (error) => error instanceof ReviewMediaError && error.stage === "storage_upload",
);
uploadError = null;

calls.length = 0;
reservationState = "FINALIZED";
const retry = await uploadReservedReviewMedia({
  reviewId, spotId, smartReview: false,
  assets: [{ uri: "file:///gallery.jpg", mimeType: "image/jpeg" }],
});
assert.equal(calls.filter((call) => call.kind === "upload").length, 0);
assert.deepEqual(retry.storagePaths, [`${reviewId}/0.jpg`]);
reservationState = "OPEN";

await finalizeReviewWithMedia({
  reviewId, spotId, text: null, moodA: null, moodB: null,
  storagePaths: [`${reviewId}/0.jpg`],
  publicUrls: [`https://project.invalid/storage/v1/object/public/review-photos/${reviewId}/0.jpg`],
  smartReview: true,
});
assert.equal(calls.at(-1).name, "finalize_review_with_media_v2");

await finalizeReviewWithoutMedia({
  reviewId, spotId, text: "ohne Bild", moodA: "ruhig", moodB: null,
  smartReview: true,
});
assert.equal(calls.at(-1).name, "finalize_review_without_media_v1");

await discardReviewMediaAttempt({ reviewId, storagePaths: [`${reviewId}/0.jpg`] });
assert.equal(calls.at(-2).kind, "remove");
assert.equal(calls.at(-1).name, "cancel_review_media_upload_v2");

finalizationError = { status: 403, code: "42501", message: "REVIEW_MEDIA_OBJECT_INVALID" };
await assert.rejects(
  finalizeReviewWithMedia({
    reviewId, spotId, text: null, moodA: null, moodB: null,
    storagePaths: [`${reviewId}/0.jpg`],
    publicUrls: [`https://project.invalid/storage/v1/object/public/review-photos/${reviewId}/0.jpg`],
    smartReview: true,
  }),
  (error) => error instanceof ReviewMediaError &&
    error.stage === "finalization" &&
    error.safeCode === "REVIEW_MEDIA_OBJECT_INVALID",
);
finalizationError = null;

for (const screen of screens) {
  assert.match(screen, /uploadReservedReviewMedia/);
  assert.match(screen, /finalizeReviewWithMedia/);
  assert.doesNotMatch(screen, /from\(["']review_photos["']\)\.insert/);
  assert.doesNotMatch(screen, /from\(["']spot-photos["']\)/);
}

console.log("Review media upload contract passed.");
