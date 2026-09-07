import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const helperSource = fs.readFileSync(
  path.resolve("lib/moment-media-upload.ts"),
  "utf8",
);
const feedSource = fs.readFileSync(
  path.resolve("app/(tabs)/feed.tsx"),
  "utf8",
);
const storageSource = fs.readFileSync(
  path.resolve("../supabase/canonical/storage.sql"),
  "utf8",
);
const socialMediaSource = fs.readFileSync(
  path.resolve("lib/socialMedia.ts"),
  "utf8",
);

const helperModule = { exports: {} };
const helperOutput = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

new Function("exports", "require", "module", helperOutput)(
  helperModule.exports,
  () => {
    throw new Error("Moment media upload helpers must stay dependency-free");
  },
  helperModule,
);

const {
  MOMENT_MEDIA_ALLOWED_MIME_TYPES,
  MOMENT_MEDIA_MAX_BYTES,
  MomentMediaUploadError,
  isExactRetryableExistingObject,
  makeMomentMediaUploadPath,
  resolveMomentMediaMimeType,
  uploadMomentMedia,
} = helperModule.exports;

const USER_ID = "97062df5-f2ba-40b1-b170-015669a09713";
const OTHER_USER_ID = "87062df5-f2ba-40b1-b170-015669a09713";
const REQUEST_ID = "771cc88b-0875-42db-b331-a488062f46f3";

function asset(uri, mimeType, overrides = {}) {
  return {
    uri,
    mimeType,
    width: 1200,
    height: 900,
    ...overrides,
  };
}

async function captureUpload(inputAsset, options = {}) {
  const calls = [];
  const alreadyUploadedPaths = options.alreadyUploadedPaths ?? new Set();
  const result = await uploadMomentMedia({
    assets: [inputAsset],
    userId: USER_ID,
    requestId: REQUEST_ID,
    alreadyUploadedPaths,
    readUri: async () => options.body ?? new ArrayBuffer(2048),
    upload: async (uploadPath, body, uploadOptions) => {
      calls.push({ uploadPath, body, uploadOptions });
      return { error: options.error ?? null };
    },
  });
  return { calls, result, alreadyUploadedPaths };
}

// Gallery and camera JPEG assets converge on the same private upload contract.
for (const inputAsset of [
  asset("file:///gallery/library-photo.jpg", "image/jpeg"),
  asset("file:///camera/captured-photo.jpg", "image/jpeg"),
]) {
  const { calls, result } = await captureUpload(inputAsset);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].uploadOptions, {
    contentType: "image/jpeg",
    upsert: false,
  });
  assert.equal(
    calls[0].uploadPath,
    `${USER_ID}/${REQUEST_ID}-0.jpg`,
  );
  assert.equal(result[0].storage_path, calls[0].uploadPath);
  assert.equal(result[0].public_url, null);
}

assert.match(feedSource, /launchImageLibraryAsync[\s\S]*setMedia/);
assert.match(feedSource, /launchCameraAsync[\s\S]*setMedia/);
assert.match(feedSource, /await uploadMomentMedia\(/);
assert.doesNotMatch(feedSource, /upsert:\s*true/);

// The client accepts exactly the existing private bucket MIME contract.
assert.deepEqual([...MOMENT_MEDIA_ALLOWED_MIME_TYPES], [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
]);
for (const mimeType of MOMENT_MEDIA_ALLOWED_MIME_TYPES) {
  const extension = mimeType.split("/")[1].replace("jpeg", "jpg");
  const { calls } = await captureUpload(
    asset(`file:///library/photo.${extension}`, mimeType),
  );
  assert.equal(calls[0].uploadOptions.contentType, mimeType);
}
assert.equal(
  resolveMomentMediaMimeType(asset("file:///library/photo.heic", undefined)),
  "image/heic",
);
assert.equal(
  resolveMomentMediaMimeType(asset("file:///library/photo.heif", undefined)),
  "image/heif",
);

let unsupportedUploadCalls = 0;
await assert.rejects(
  uploadMomentMedia({
    assets: [asset("file:///library/animated.gif", "image/gif")],
    userId: USER_ID,
    requestId: REQUEST_ID,
    alreadyUploadedPaths: new Set(),
    readUri: async () => new ArrayBuffer(128),
    upload: async () => {
      unsupportedUploadCalls += 1;
      return { error: null };
    },
  }),
  (error) =>
    error instanceof MomentMediaUploadError &&
    error.safeCode === "UNSUPPORTED_IMAGE_TYPE",
);
assert.equal(unsupportedUploadCalls, 0);

// The canonical 12 MB boundary is accepted; one byte more fails locally.
await captureUpload(
  asset("file:///library/limit.jpg", "image/jpeg"),
  { body: new ArrayBuffer(MOMENT_MEDIA_MAX_BYTES) },
);
await assert.rejects(
  captureUpload(
    asset("file:///library/too-large.jpg", "image/jpeg"),
    { body: new ArrayBuffer(MOMENT_MEDIA_MAX_BYTES + 1) },
  ),
  (error) =>
    error instanceof MomentMediaUploadError &&
    error.safeCode === "IMAGE_TOO_LARGE",
);

// A normal upload error aborts before the Moment RPC can run.
let mutationCalls = 0;
await assert.rejects(
  (async () => {
    const { result } = await captureUpload(
      asset("file:///camera/denied.jpg", "image/jpeg"),
      {
        error: {
          statusCode: 403,
          error: "Unauthorized",
          message: "new row violates row-level security policy",
        },
      },
    );
    mutationCalls += 1;
    return result;
  })(),
  (error) =>
    error instanceof MomentMediaUploadError &&
    error.stage === "storage_upload" &&
    error.safeCode === "Unauthorized",
);
assert.equal(mutationCalls, 0);

// Only Supabase's exact existing-object response on this deterministic owned
// path is a retry success. It is never sent as an overwrite.
const retryPaths = new Set();
const retryAsset = asset("file:///gallery/retry.jpg", "image/jpeg");
const retry = await captureUpload(retryAsset, {
  alreadyUploadedPaths: retryPaths,
  error: {
    statusCode: 400,
    error: "Asset Already Exists",
    message: "Asset Already Exists",
  },
});
assert.equal(retry.calls.length, 1);
assert.equal(retry.calls[0].uploadOptions.upsert, false);
assert.equal(retryPaths.has(retry.result[0].storage_path), true);

const retryWithoutSecondWrite = await captureUpload(retryAsset, {
  alreadyUploadedPaths: retryPaths,
});
assert.equal(retryWithoutSecondWrite.calls.length, 0);
assert.equal(retryWithoutSecondWrite.result.length, 1);

const expectedPath = makeMomentMediaUploadPath(
  USER_ID,
  REQUEST_ID,
  0,
  retryAsset.uri,
);
const currentDuplicate = {
  statusCode: 409,
  code: "ResourceAlreadyExists",
  error: "Duplicate",
  message: "The resource already exists",
};
assert.equal(isExactRetryableExistingObject({
  error: currentDuplicate,
  path: expectedPath,
  userId: USER_ID,
  requestId: REQUEST_ID,
  index: 0,
  uri: retryAsset.uri,
}), true);
assert.equal(isExactRetryableExistingObject({
  error: currentDuplicate,
  path: expectedPath.replace(USER_ID, OTHER_USER_ID),
  userId: USER_ID,
  requestId: REQUEST_ID,
  index: 0,
  uri: retryAsset.uri,
}), false);
assert.equal(isExactRetryableExistingObject({
  error: { ...currentDuplicate, message: "different failure" },
  path: expectedPath,
  userId: USER_ID,
  requestId: REQUEST_ID,
  index: 0,
  uri: retryAsset.uri,
}), false);

// Missing/invalid auth authority fails before any local read or network call.
let unauthenticatedNetworkCalls = 0;
await assert.rejects(
  uploadMomentMedia({
    assets: [retryAsset],
    userId: "",
    requestId: REQUEST_ID,
    alreadyUploadedPaths: new Set(),
    readUri: async () => {
      unauthenticatedNetworkCalls += 1;
      return new ArrayBuffer(128);
    },
    upload: async () => {
      unauthenticatedNetworkCalls += 1;
      return { error: null };
    },
  }),
  (error) =>
    error instanceof MomentMediaUploadError &&
    error.safeCode === "INVALID_UPLOAD_AUTHORITY",
);
assert.equal(unauthenticatedNetworkCalls, 0);

// Canonical Storage remains private and foreign paths remain fail-closed.
assert.match(
  storageSource,
  /'social-post-media',\s*'social-post-media',\s*false,\s*12582912/,
);
assert.match(
  storageSource,
  /social_post_media_user_upload[\s\S]*for insert[\s\S]*to "authenticated"[\s\S]*auth\.uid\(\)\)::text = \(storage\.foldername\(name\)\)\[1\]/,
);
const socialUploadPolicy = storageSource.match(
  /drop policy if exists "social_post_media_user_upload"[\s\S]*?(?=drop policy if exists "spot_photos_delete_owner_or_admin")/,
)?.[0] ?? "";
assert.ok(socialUploadPolicy, "canonical social-post upload policy must exist");
assert.doesNotMatch(
  socialUploadPolicy,
  /to (?:public|anon)/,
);

// Logs are stage-specific and never dump raw provider errors, paths or IDs.
assert.match(feedSource, /stage: error\.stage/);
assert.match(feedSource, /createStage = "moment_mutation"/);
const createFailureLogger = feedSource.match(
  /function logMomentCreateFailure[\s\S]*?(?=function momentCreateErrorMessage)/,
)?.[0] ?? "";
assert.ok(createFailureLogger, "sanitized Moment-create logger must exist");
assert.doesNotMatch(
  createFailureLogger,
  /console\.(?:log|warn)\([^\n]*,\s*error\s*\)/,
);
assert.doesNotMatch(feedSource, /create_social_post_v2 failed/);

// Persisted private paths are signed again after a fresh app/module start, so
// a successfully created photo remains renderable after restart.
let signedUrlCalls = 0;
function loadSocialMediaModule() {
  const target = { exports: {} };
  const output = ts.transpileModule(socialMediaSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  new Function("exports", "require", "module", output)(
    target.exports,
    (specifier) => {
      if (specifier !== "./supabase") {
        throw new Error(`Unexpected social media dependency: ${specifier}`);
      }
      return {
        supabase: {
          storage: {
            from: (bucket) => {
              assert.equal(bucket, "social-post-media");
              return {
                createSignedUrls: async (paths) => {
                  signedUrlCalls += 1;
                  return {
                    data: paths.map((storedPath) => ({
                      path: storedPath,
                      signedUrl: `https://media.example/signed/${signedUrlCalls}`,
                    })),
                    error: null,
                  };
                },
              };
            },
          },
        },
      };
    },
    target,
  );
  return target.exports;
}

const persistedPost = {
  post_id: "post-1",
  media: [{ storage_path: expectedPath, public_url: null }],
};
const firstHydration = await loadSocialMediaModule()
  .hydrateSocialMediaSignedUrls([persistedPost]);
assert.equal(firstHydration[0].media[0].public_url, "https://media.example/signed/1");
const afterRestartHydration = await loadSocialMediaModule()
  .hydrateSocialMediaSignedUrls([persistedPost]);
assert.equal(afterRestartHydration[0].media[0].public_url, "https://media.example/signed/2");
assert.equal(signedUrlCalls, 2);
assert.match(feedSource, /await hydrateSocialMediaSignedUrls\(visiblePosts\)/);

console.log("Moment media upload contracts passed.");
