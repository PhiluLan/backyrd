import { supabase } from "./supabase";

export const REVIEW_MEDIA_BUCKET = "review-photos";
export const REVIEW_MEDIA_MAX_BYTES = 12 * 1024 * 1024;

const MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
} as const;

type ReviewMime = keyof typeof MIME_TO_EXTENSION;

export type ReviewMediaAsset = {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
};

export type ReviewMediaStage =
  | "reservation"
  | "media_read"
  | "media_validation"
  | "storage_upload"
  | "finalization";

export class ReviewMediaError extends Error {
  constructor(
    readonly stage: ReviewMediaStage,
    readonly safeCode: string,
    readonly mediaIndex: number | null = null,
    readonly httpStatus: number | null = null,
  ) {
    super(safeCode);
    this.name = "ReviewMediaError";
  }
}

export function resolveReviewMediaMime(asset: ReviewMediaAsset): ReviewMime | null {
  const supplied = asset.mimeType?.trim().toLowerCase().split(";")[0];
  const mime = supplied === "image/jpg" ? "image/jpeg" : supplied;
  if (mime && mime in MIME_TO_EXTENSION) return mime as ReviewMime;

  const source = asset.fileName || asset.uri.split("?")[0] || "";
  const ext = source.split(".").pop()?.toLowerCase();
  const inferred = Object.entries(MIME_TO_EXTENSION).find(([, value]) => value === ext)?.[0];
  return (inferred as ReviewMime | undefined) ?? null;
}

function safeProviderCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN_PROVIDER_ERROR";
  const value = error as { code?: unknown; error?: unknown; name?: unknown; message?: unknown };
  if (typeof value.message === "string") {
    const domainCode = value.message.match(
      /\b(SAFETY_OWNER_SELF_REVIEW|REVIEW_SAME_DAY_LIMIT|REVIEW_MEDIA_[A-Z_]+)\b/,
    )?.[1];
    if (domainCode) return domainCode;
  }
  for (const candidate of [value.code, value.error, value.name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "UNKNOWN_PROVIDER_ERROR";
}

function safeProviderStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = error as { statusCode?: unknown; status?: unknown };
  const status = Number(value.statusCode ?? value.status);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

export function reviewMediaErrorContext(error: unknown) {
  if (!(error instanceof ReviewMediaError)) return null;
  return {
    stage: error.stage,
    code: error.safeCode,
    http_status: error.httpStatus,
    media_index: error.mediaIndex,
  };
}

export function reviewMediaUserMessage(error: unknown) {
  if (!(error instanceof ReviewMediaError)) return null;
  if (error.safeCode === "UNSUPPORTED_IMAGE_TYPE" || error.safeCode === "IMAGE_CONTENT_TYPE_MISMATCH") {
    return "Dieses Bildformat kann nicht sicher verarbeitet werden. Bitte wähle ein JPEG-, PNG-, WebP-, HEIC-, HEIF- oder AVIF-Bild.";
  }
  if (error.safeCode === "IMAGE_TOO_LARGE") {
    return "Das Bild ist zu gross. Bitte wähle ein Bild mit maximal 12 MB.";
  }
  if (error.stage === "media_read") {
    return "Das Bild konnte auf deinem Gerät nicht gelesen werden. Bitte wähle es erneut aus.";
  }
  if (error.stage === "storage_upload") {
    return "Das Bild konnte nicht hochgeladen werden. Es wurde keine Review veröffentlicht. Bitte versuche es nochmals.";
  }
  if (error.stage === "finalization") {
    return "Bild und Review konnten nicht gemeinsam gespeichert werden. Es wurde keine unvollständige Review veröffentlicht.";
  }
  return "Der sichere Bild-Upload konnte nicht vorbereitet werden. Bitte versuche es nochmals.";
}

function detectImageMime(body: ArrayBuffer): ReviewMime | null {
  const bytes = new Uint8Array(body);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4).toLowerCase();
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

function exactDuplicate(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  const status = Number(value.statusCode ?? value.status);
  return (status === 400 || status === 409) &&
    value.message === "The resource already exists";
}

export async function uploadReservedReviewMedia(input: {
  reviewId: string;
  spotId: string;
  smartReview: boolean;
  assets: ReviewMediaAsset[];
}) {
  if (input.assets.length < 1 || input.assets.length > 3) {
    throw new ReviewMediaError("media_validation", "INVALID_MEDIA_COUNT");
  }

  const prepared = [] as Array<{
    body: ArrayBuffer;
    mime: ReviewMime;
    path: string;
  }>;
  for (let index = 0; index < input.assets.length; index += 1) {
    const asset = input.assets[index];
    const declaredMime = resolveReviewMediaMime(asset);
    if (!declaredMime) {
      throw new ReviewMediaError("media_validation", "UNSUPPORTED_IMAGE_TYPE", index);
    }
    if (asset.fileSize && asset.fileSize > REVIEW_MEDIA_MAX_BYTES) {
      throw new ReviewMediaError("media_validation", "IMAGE_TOO_LARGE", index);
    }

    let body: ArrayBuffer;
    try {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error("LOCAL_IMAGE_READ_FAILED");
      body = await response.arrayBuffer();
    } catch {
      throw new ReviewMediaError("media_read", "LOCAL_IMAGE_READ_FAILED", index);
    }
    if (!body.byteLength) {
      throw new ReviewMediaError("media_validation", "EMPTY_IMAGE_FILE", index);
    }
    if (body.byteLength > REVIEW_MEDIA_MAX_BYTES) {
      throw new ReviewMediaError("media_validation", "IMAGE_TOO_LARGE", index);
    }
    const detectedMime = detectImageMime(body);
    if (!detectedMime || detectedMime !== declaredMime) {
      throw new ReviewMediaError("media_validation", "IMAGE_CONTENT_TYPE_MISMATCH", index);
    }
    prepared.push({
      body,
      mime: detectedMime,
      path: `${input.reviewId}/${index}.${MIME_TO_EXTENSION[detectedMime]}`,
    });
  }

  const { data: reservation, error: reservationError } = await supabase.rpc(
    "reserve_review_media_upload_v1",
    {
      p_review_id: input.reviewId,
      p_spot_id: input.spotId,
      p_storage_paths: prepared.map((item) => item.path),
      p_content_types: prepared.map((item) => item.mime),
      p_max_sizes_bytes: prepared.map((item) => item.body.byteLength),
      p_smart_review: input.smartReview,
    },
  );
  if (reservationError) {
    throw new ReviewMediaError(
      "reservation",
      safeProviderCode(reservationError),
      null,
      safeProviderStatus(reservationError),
    );
  }

  const storagePaths: string[] = [];
  const publicUrls: string[] = [];

  if ((reservation as { state?: unknown } | null)?.state === "FINALIZED") {
    for (const item of prepared) {
      storagePaths.push(item.path);
      publicUrls.push(supabase.storage.from(REVIEW_MEDIA_BUCKET).getPublicUrl(item.path).data.publicUrl);
    }
    return { storagePaths, publicUrls };
  }

  for (let index = 0; index < input.assets.length; index += 1) {
    const { body, mime, path } = prepared[index];

    const { error: uploadError } = await supabase.storage
      .from(REVIEW_MEDIA_BUCKET)
      .upload(path, body, { contentType: mime, upsert: false });
    if (uploadError && !exactDuplicate(uploadError)) {
      throw new ReviewMediaError(
        "storage_upload",
        safeProviderCode(uploadError),
        index,
        safeProviderStatus(uploadError),
      );
    }

    const { data } = supabase.storage.from(REVIEW_MEDIA_BUCKET).getPublicUrl(path);
    if (!data.publicUrl) {
      throw new ReviewMediaError("storage_upload", "PUBLIC_URL_UNAVAILABLE", index);
    }
    storagePaths.push(path);
    publicUrls.push(data.publicUrl);
  }

  return { storagePaths, publicUrls };
}

export async function finalizeReviewWithMedia(input: {
  reviewId: string;
  spotId: string;
  text: string | null;
  moodA: string | null;
  moodB: string | null;
  storagePaths: string[];
  publicUrls: string[];
  smartReview: boolean;
}) {
  const { data, error } = await supabase.rpc("finalize_review_with_media_v1", {
    p_review_id: input.reviewId,
    p_spot_id: input.spotId,
    p_text: input.text,
    p_mood_a: input.moodA,
    p_mood_b: input.moodB,
    p_storage_paths: input.storagePaths,
    p_public_urls: input.publicUrls,
    p_smart_review: input.smartReview,
  });
  if (error) {
    throw new ReviewMediaError(
      "finalization",
      safeProviderCode(error),
      null,
      safeProviderStatus(error),
    );
  }
  return data as string;
}
