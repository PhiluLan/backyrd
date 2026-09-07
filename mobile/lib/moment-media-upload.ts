export const MOMENT_MEDIA_BUCKET = "social-post-media";
export const MOMENT_MEDIA_MAX_BYTES = 12 * 1024 * 1024;

export const MOMENT_MEDIA_ALLOWED_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
] as const);

type AllowedMomentMediaMimeType =
  (typeof MOMENT_MEDIA_ALLOWED_MIME_TYPES)[number];

export type MomentMediaAsset = {
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

export type UploadedMomentMedia = {
  storage_path: string;
  public_url: null;
  media_type: "image";
  width: number | null;
  height: number | null;
  sort_order: number;
};

type StorageUploadOptions = {
  contentType: AllowedMomentMediaMimeType;
  upsert: false;
};

type StorageUploadResult = {
  error: unknown;
};

type StorageErrorLike = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export type MomentMediaFailureStage =
  | "media_read"
  | "media_validation"
  | "storage_upload";

export class MomentMediaUploadError extends Error {
  readonly stage: MomentMediaFailureStage;
  readonly safeCode: string;
  readonly httpStatus: number | null;
  readonly mediaIndex: number;

  constructor(input: {
    stage: MomentMediaFailureStage;
    safeCode: string;
    httpStatus?: number | null;
    mediaIndex: number;
  }) {
    super(input.safeCode);
    this.name = "MomentMediaUploadError";
    this.stage = input.stage;
    this.safeCode = input.safeCode;
    this.httpStatus = input.httpStatus ?? null;
    this.mediaIndex = input.mediaIndex;
  }
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeStorageErrorIdentity(error: unknown) {
  const value = error && typeof error === "object"
    ? error as StorageErrorLike
    : {};

  return {
    code:
      stringField(value.code) ||
      stringField(value.error) ||
      stringField(value.name) ||
      "STORAGE_UPLOAD_FAILED",
    providerError: stringField(value.error),
    message: stringField(value.message),
    httpStatus: statusField(value.statusCode) ?? statusField(value.status),
  };
}

function extensionFrom(asset: MomentMediaAsset) {
  const value = asset.fileName?.trim() || asset.uri.split("?")[0] || "";
  return value.split(".").pop()?.toLowerCase() ?? "";
}

export function resolveMomentMediaMimeType(
  asset: MomentMediaAsset,
): AllowedMomentMediaMimeType | null {
  const provided = asset.mimeType?.trim().toLowerCase().split(";")[0] ?? "";
  const normalized = provided === "image/jpg" ? "image/jpeg" : provided;

  if (
    MOMENT_MEDIA_ALLOWED_MIME_TYPES.includes(
      normalized as AllowedMomentMediaMimeType,
    )
  ) {
    return normalized as AllowedMomentMediaMimeType;
  }

  if (normalized && normalized !== "application/octet-stream") return null;

  const inferred: Record<string, AllowedMomentMediaMimeType> = {
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };

  return inferred[extensionFrom(asset)] ?? null;
}

export function makeMomentMediaUploadPath(
  userId: string,
  requestId: string,
  index: number,
  uri: string,
) {
  const extFromUri = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
  const safeExt = extFromUri && extFromUri.length <= 5 ? extFromUri : "jpg";
  return `${userId}/${requestId}-${index}.${safeExt}`;
}

export function isExactMomentMediaPath(input: {
  path: string;
  userId: string;
  requestId: string;
  index: number;
  uri: string;
}) {
  return input.path === makeMomentMediaUploadPath(
    input.userId,
    input.requestId,
    input.index,
    input.uri,
  );
}

export function isExactRetryableExistingObject(input: {
  error: unknown;
  path: string;
  userId: string;
  requestId: string;
  index: number;
  uri: string;
}) {
  if (!isExactMomentMediaPath(input)) return false;

  const identity = safeStorageErrorIdentity(input.error);
  const recognizedStatus =
    identity.httpStatus === 400 || identity.httpStatus === 409;
  const recognizedCode =
    identity.code === "ResourceAlreadyExists" ||
    identity.code === "Duplicate" ||
    identity.code === "Asset Already Exists";
  const recognizedProviderError =
    !identity.providerError ||
    identity.providerError === "Duplicate" ||
    identity.providerError === "Asset Already Exists";
  const recognizedMessage =
    identity.message === "The resource already exists" ||
    identity.message === "Asset Already Exists";

  return recognizedStatus && recognizedCode && recognizedProviderError && recognizedMessage;
}

export async function uploadMomentMedia(input: {
  assets: MomentMediaAsset[];
  userId: string;
  requestId: string;
  alreadyUploadedPaths: Set<string>;
  readUri: (uri: string) => Promise<ArrayBuffer>;
  upload: (
    path: string,
    body: ArrayBuffer,
    options: StorageUploadOptions,
  ) => Promise<StorageUploadResult>;
}) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(input.userId) || !uuidPattern.test(input.requestId)) {
    throw new MomentMediaUploadError({
      stage: "storage_upload",
      safeCode: "INVALID_UPLOAD_AUTHORITY",
      mediaIndex: 0,
    });
  }

  const uploadedMedia: UploadedMomentMedia[] = [];

  for (let index = 0; index < input.assets.length; index += 1) {
    const asset = input.assets[index];
    const path = makeMomentMediaUploadPath(
      input.userId,
      input.requestId,
      index,
      asset.uri,
    );
    const mimeType = resolveMomentMediaMimeType(asset);

    if (!mimeType) {
      throw new MomentMediaUploadError({
        stage: "media_validation",
        safeCode: "UNSUPPORTED_IMAGE_TYPE",
        mediaIndex: index,
      });
    }

    if (!input.alreadyUploadedPaths.has(path)) {
      let body: ArrayBuffer;

      try {
        body = await input.readUri(asset.uri);
      } catch {
        throw new MomentMediaUploadError({
          stage: "media_read",
          safeCode: "LOCAL_IMAGE_READ_FAILED",
          mediaIndex: index,
        });
      }

      if (!body.byteLength) {
        throw new MomentMediaUploadError({
          stage: "media_validation",
          safeCode: "EMPTY_IMAGE_FILE",
          mediaIndex: index,
        });
      }

      if (body.byteLength > MOMENT_MEDIA_MAX_BYTES) {
        throw new MomentMediaUploadError({
          stage: "media_validation",
          safeCode: "IMAGE_TOO_LARGE",
          mediaIndex: index,
        });
      }

      let uploadResult: StorageUploadResult;
      try {
        uploadResult = await input.upload(path, body, {
          contentType: mimeType,
          upsert: false,
        });
      } catch (error) {
        const identity = safeStorageErrorIdentity(error);
        throw new MomentMediaUploadError({
          stage: "storage_upload",
          safeCode: identity.code,
          httpStatus: identity.httpStatus,
          mediaIndex: index,
        });
      }

      if (uploadResult.error) {
        if (!isExactRetryableExistingObject({
          error: uploadResult.error,
          path,
          userId: input.userId,
          requestId: input.requestId,
          index,
          uri: asset.uri,
        })) {
          const identity = safeStorageErrorIdentity(uploadResult.error);
          throw new MomentMediaUploadError({
            stage: "storage_upload",
            safeCode: identity.code,
            httpStatus: identity.httpStatus,
            mediaIndex: index,
          });
        }
      }

      input.alreadyUploadedPaths.add(path);
    }

    uploadedMedia.push({
      storage_path: path,
      public_url: null,
      media_type: "image",
      width: asset.width ?? null,
      height: asset.height ?? null,
      sort_order: index,
    });
  }

  return uploadedMedia;
}
