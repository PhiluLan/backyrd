import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";

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

export type ReviewMediaStage = "auth" | "media_read" | "media_validation" |
  "reservation" | "storage_upload" | "finalization" | "cleanup";

export type ReviewMediaProgress = {
  stage: ReviewMediaStage;
  completed: number;
  total: number;
};

export class ReviewMediaError extends Error {
  constructor(
    readonly stage: ReviewMediaStage,
    readonly safeCode: string,
    readonly mediaIndex: number | null = null,
    readonly httpStatus: number | null = null,
    readonly uploadedPaths: string[] = [],
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
  const inferred = Object.entries(MIME_TO_EXTENSION).find(
    ([, value]) => value === ext || (ext === "jpeg" && value === "jpg"),
  )?.[0];
  return (inferred as ReviewMime | undefined) ?? null;
}

function safeProviderCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN_PROVIDER_ERROR";
  const value = error as { code?: unknown; error?: unknown; name?: unknown; message?: unknown };
  if (typeof value.message === "string") {
    const domainCode = value.message.match(
      /\b(SAFETY_OWNER_SELF_REVIEW|REVIEW_SAME_DAY_LIMIT|REVIEW_(?:MEDIA|CAPTURE)_[A-Z_]+)\b/,
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
  return { stage: error.stage, code: error.safeCode, http_status: error.httpStatus, media_index: error.mediaIndex };
}

export function reviewMediaUserMessage(error: unknown) {
  if (!(error instanceof ReviewMediaError)) return null;
  if (error.safeCode === "UNSUPPORTED_IMAGE_TYPE" || error.safeCode === "IMAGE_CONTENT_TYPE_MISMATCH") {
    return "Dieses Bildformat kann nicht sicher verarbeitet werden. Bitte wähle ein JPEG-, PNG-, WebP-, HEIC-, HEIF- oder AVIF-Bild.";
  }
  if (error.safeCode === "IMAGE_TOO_LARGE") return "Das Bild ist zu gross. Bitte wähle ein Bild mit maximal 12 MB.";
  if (error.safeCode === "EMPTY_IMAGE_FILE") return "Das ausgewählte Bild enthält keine lesbaren Bilddaten. Bitte wähle es erneut aus.";
  if (error.stage === "auth") return "Deine Anmeldung ist nicht mehr aktuell. Melde dich bitte erneut an; dein Entwurf bleibt erhalten.";
  if (error.stage === "media_read") return "Das Bild konnte auf deinem Gerät nicht gelesen werden. Bitte wähle es erneut aus.";
  if (error.stage === "storage_upload") {
    return error.httpStatus === null || error.httpStatus >= 500
      ? "Das Bild konnte wegen einer Netzwerk- oder Serverstörung nicht hochgeladen werden. Dein Entwurf bleibt erhalten."
      : "Das Bild konnte nicht hochgeladen werden. Es wurde keine Review veröffentlicht. Dein Entwurf bleibt erhalten.";
  }
  if (error.stage === "finalization") return "Bild und Review konnten nicht gemeinsam gespeichert werden. Es wurde keine unvollständige Review veröffentlicht; dein Entwurf bleibt erhalten.";
  if (error.stage === "cleanup") return "Das vorherige Bild konnte noch nicht sicher entfernt werden. Bitte versuche es nochmals.";
  return "Der sichere Bild-Upload konnte nicht vorbereitet werden. Dein Entwurf bleibt erhalten.";
}

export function reviewMediaProgressLabel(progress: ReviewMediaProgress | null) {
  if (!progress) return null;
  switch (progress.stage) {
    case "auth": return "Anmeldung wird geprüft…";
    case "media_read": return "Bild wird vorbereitet…";
    case "media_validation": return "Bild wird geprüft…";
    case "reservation": return "Sicherer Upload wird vorbereitet…";
    case "storage_upload": return progress.total > 1 ? `Bild ${progress.completed + 1} von ${progress.total} wird hochgeladen…` : "Bild wird hochgeladen…";
    case "finalization": return "Review und Bild werden gemeinsam gespeichert…";
    case "cleanup": return "Vorheriges Bild wird entfernt…";
  }
}

function detectImageMime(body: ArrayBuffer): ReviewMime | null {
  const bytes = new Uint8Array(body);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
    const brands = ascii(8, Math.min(24, bytes.length - 8)).toLowerCase();
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
    if (["heic", "heix", "hevc", "hevx"].some((brand) => brands.includes(brand))) return "image/heic";
    if (["mif1", "msf1"].some((brand) => brands.includes(brand))) return "image/heif";
  }
  return null;
}

async function readLocalAsset(uri: string) {
  try {
    return await new File(uri).arrayBuffer();
  } catch {
    try {
      const response = await fetch(uri);
      if (!response.ok) throw new Error("LOCAL_IMAGE_READ_FAILED");
      return await response.arrayBuffer();
    } catch {
      throw new Error("LOCAL_IMAGE_READ_FAILED");
    }
  }
}

async function sha256Hex(body: ArrayBuffer) {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, body);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function exactDuplicate(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; status?: unknown; message?: unknown; code?: unknown };
  const status = Number(value.statusCode ?? value.status);
  const message = typeof value.message === "string" ? value.message : "";
  const code = typeof value.code === "string" ? value.code : "";
  return (status === 400 || status === 409) &&
    (message === "The resource already exists" || message === "Asset Already Exists") &&
    (!code || ["ResourceAlreadyExists", "Duplicate", "Asset Already Exists"].includes(code));
}

async function requireCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) throw new ReviewMediaError("auth", "REVIEW_MEDIA_AUTH_REQUIRED");
  const expiresAt = data.session.expires_at ?? 0;
  if (expiresAt && expiresAt * 1000 - Date.now() < 60_000) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.user?.id) throw new ReviewMediaError("auth", "REVIEW_MEDIA_SESSION_REFRESH_FAILED");
  }
}

export async function uploadReservedReviewMedia(input: {
  reviewId: string; spotId: string; smartReview: boolean; assets: ReviewMediaAsset[];
  onProgress?: (progress: ReviewMediaProgress) => void;
}) {
  if (input.assets.length < 1 || input.assets.length > 3) throw new ReviewMediaError("media_validation", "INVALID_MEDIA_COUNT");
  input.onProgress?.({ stage: "auth", completed: 0, total: input.assets.length });
  await requireCurrentSession();

  const prepared: Array<{ body: ArrayBuffer; mime: ReviewMime; path: string; sha256: string }> = [];
  for (let index = 0; index < input.assets.length; index += 1) {
    const asset = input.assets[index];
    const declaredMime = resolveReviewMediaMime(asset);
    if (!declaredMime) throw new ReviewMediaError("media_validation", "UNSUPPORTED_IMAGE_TYPE", index);
    if (asset.fileSize && asset.fileSize > REVIEW_MEDIA_MAX_BYTES) throw new ReviewMediaError("media_validation", "IMAGE_TOO_LARGE", index);
    input.onProgress?.({ stage: "media_read", completed: index, total: input.assets.length });
    let body: ArrayBuffer;
    try { body = await readLocalAsset(asset.uri); }
    catch { throw new ReviewMediaError("media_read", "LOCAL_IMAGE_READ_FAILED", index); }
    input.onProgress?.({ stage: "media_validation", completed: index, total: input.assets.length });
    if (!body.byteLength) throw new ReviewMediaError("media_validation", "EMPTY_IMAGE_FILE", index);
    if (body.byteLength > REVIEW_MEDIA_MAX_BYTES) throw new ReviewMediaError("media_validation", "IMAGE_TOO_LARGE", index);
    const detectedMime = detectImageMime(body);
    if (!detectedMime || detectedMime !== declaredMime) throw new ReviewMediaError("media_validation", "IMAGE_CONTENT_TYPE_MISMATCH", index);
    prepared.push({ body, mime: detectedMime, path: `${input.reviewId}/${index}.${MIME_TO_EXTENSION[detectedMime]}`, sha256: await sha256Hex(body) });
  }

  input.onProgress?.({ stage: "reservation", completed: 0, total: prepared.length });
  const { data: reservation, error: reservationError } = await supabase.rpc("reserve_review_media_upload_v2", {
    p_review_id: input.reviewId, p_spot_id: input.spotId,
    p_storage_paths: prepared.map((item) => item.path),
    p_content_types: prepared.map((item) => item.mime),
    p_max_sizes_bytes: prepared.map((item) => item.body.byteLength),
    p_content_sha256: prepared.map((item) => item.sha256),
    p_smart_review: input.smartReview,
  });
  if (reservationError) throw new ReviewMediaError("reservation", safeProviderCode(reservationError), null, safeProviderStatus(reservationError));

  const storagePaths: string[] = [];
  const publicUrls: string[] = [];
  if ((reservation as { state?: unknown } | null)?.state === "FINALIZED") {
    for (const item of prepared) {
      storagePaths.push(item.path);
      publicUrls.push(supabase.storage.from(REVIEW_MEDIA_BUCKET).getPublicUrl(item.path).data.publicUrl);
    }
    return { storagePaths, publicUrls };
  }

  for (let index = 0; index < prepared.length; index += 1) {
    const { body, mime, path, sha256 } = prepared[index];
    input.onProgress?.({ stage: "storage_upload", completed: index, total: prepared.length });
    const { error: uploadError } = await supabase.storage.from(REVIEW_MEDIA_BUCKET).upload(path, body, {
      contentType: mime, upsert: false, metadata: { review_content_sha256: sha256 },
    });
    if (uploadError && !exactDuplicate(uploadError)) {
      throw new ReviewMediaError("storage_upload", safeProviderCode(uploadError), index, safeProviderStatus(uploadError), [...storagePaths]);
    }
    const { data } = supabase.storage.from(REVIEW_MEDIA_BUCKET).getPublicUrl(path);
    if (!data.publicUrl) throw new ReviewMediaError("storage_upload", "PUBLIC_URL_UNAVAILABLE", index, null, [...storagePaths, path]);
    storagePaths.push(path);
    publicUrls.push(data.publicUrl);
  }
  return { storagePaths, publicUrls };
}

export async function finalizeReviewWithMedia(input: {
  reviewId: string; spotId: string; text: string | null; moodA: string | null; moodB: string | null;
  storagePaths: string[]; publicUrls: string[]; smartReview: boolean;
  onProgress?: (progress: ReviewMediaProgress) => void;
}) {
  input.onProgress?.({ stage: "finalization", completed: 0, total: input.storagePaths.length });
  const { data, error } = await supabase.rpc("finalize_review_with_media_v2", {
    p_review_id: input.reviewId, p_spot_id: input.spotId, p_text: input.text,
    p_mood_a: input.moodA, p_mood_b: input.moodB, p_storage_paths: input.storagePaths,
    p_public_urls: input.publicUrls, p_smart_review: input.smartReview,
  });
  if (error) throw new ReviewMediaError("finalization", safeProviderCode(error), null, safeProviderStatus(error), input.storagePaths);
  return data as string;
}

export async function finalizeReviewWithoutMedia(input: {
  reviewId: string; spotId: string; text: string | null; moodA: string | null; moodB: string | null;
  smartReview: boolean; onProgress?: (progress: ReviewMediaProgress) => void;
}) {
  input.onProgress?.({ stage: "auth", completed: 0, total: 0 });
  await requireCurrentSession();
  input.onProgress?.({ stage: "finalization", completed: 0, total: 0 });
  const { data, error } = await supabase.rpc("finalize_review_without_media_v1", {
    p_review_id: input.reviewId, p_spot_id: input.spotId, p_text: input.text,
    p_mood_a: input.moodA, p_mood_b: input.moodB, p_smart_review: input.smartReview,
  });
  if (error) throw new ReviewMediaError("finalization", safeProviderCode(error), null, safeProviderStatus(error));
  return data as string;
}

export async function discardReviewMediaAttempt(input: {
  reviewId: string; storagePaths: string[]; onProgress?: (progress: ReviewMediaProgress) => void;
}) {
  input.onProgress?.({ stage: "cleanup", completed: 0, total: input.storagePaths.length });
  if (input.storagePaths.length) {
    const { error } = await supabase.storage.from(REVIEW_MEDIA_BUCKET).remove(input.storagePaths);
    if (error) throw new ReviewMediaError("cleanup", safeProviderCode(error), null, safeProviderStatus(error), input.storagePaths);
  }
  const { error } = await supabase.rpc("cancel_review_media_upload_v2", { p_review_id: input.reviewId });
  if (error) throw new ReviewMediaError("cleanup", safeProviderCode(error), null, safeProviderStatus(error));
}
