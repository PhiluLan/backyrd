import AsyncStorage from "@react-native-async-storage/async-storage";

import { SPOT_PHOTO_POLICY } from "./spot-photo-policy";
import { supabase } from "./supabase";

export type GooglePhotoAttribution = {
  displayName?: string;
  uri?: string;
  photoUri?: string;
};

export type GooglePlacePhotoResult = {
  ok: boolean;
  source: "google" | "backyrd" | "placeholder";
  imageUrl: string | null;
  imageIdentity?: string | null;
  authorAttributions?: GooglePhotoAttribution[];
  googleMapsUri?: string | null;
  reason?: string;
  error?: string;
};

type GooglePhotoRequest = {
  accessToken: string;
  createdAt: number;
  request: Promise<GooglePlacePhotoResult | null>;
};

const googlePhotoRequests = new Map<string, GooglePhotoRequest>();
const GOOGLE_PHOTO_REQUEST_TTL_MS = 5 * 60 * 1000;
const GOOGLE_PHOTO_FAILURE_TTL_MS = 30 * 1000;
const GOOGLE_PHOTO_STORAGE_PREFIX = "@backyrd/google-place-photo/v1";

type StoredGooglePhoto = {
  storedAt: number;
  result: GooglePlacePhotoResult;
};

function persistentCacheKey(namespace: string, cacheKey: string) {
  return `${GOOGLE_PHOTO_STORAGE_PREFIX}:${namespace}:${cacheKey}`;
}

async function readStoredGooglePhoto(namespace: string | null | undefined, cacheKey: string) {
  if (!namespace) return null;
  try {
    const raw = await AsyncStorage.getItem(persistentCacheKey(namespace, cacheKey));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredGooglePhoto;
    if (
      !stored ||
      !Number.isFinite(stored.storedAt) ||
      Date.now() - stored.storedAt >= GOOGLE_PHOTO_REQUEST_TTL_MS ||
      stored.result?.source !== "google" ||
      typeof stored.result.imageUrl !== "string" ||
      !stored.result.imageUrl.startsWith("https://")
    ) {
      await AsyncStorage.removeItem(persistentCacheKey(namespace, cacheKey));
      return null;
    }
    return stored.result;
  } catch {
    return null;
  }
}

async function storeGooglePhoto(namespace: string | null | undefined, cacheKey: string, result: GooglePlacePhotoResult) {
  if (!namespace) return;
  try {
    await AsyncStorage.setItem(
      persistentCacheKey(namespace, cacheKey),
      JSON.stringify({ storedAt: Date.now(), result } satisfies StoredGooglePhoto),
    );
  } catch {
    // A cache write must never turn an available canonical image into an error.
  }
}

export async function getGooglePlacePhotoFallback(
  spotId: string,
  options: { preferredOwnerImageFailed?: boolean; accessToken?: string | null; cacheNamespace?: string | null } = {},
): Promise<GooglePlacePhotoResult | null> {
  // Defense in depth: even a future call site cannot reach Auth, Supabase, or
  // Google while the canonical Product policy is disabled.
  if (!SPOT_PHOTO_POLICY.googlePlacePhotosEnabled) return null;

  const cleanSpotId = spotId.trim();

  if (!cleanSpotId) {
    console.warn("Google place photo: Spot ID fehlt");
    return null;
  }

  // The fallback is deliberately authenticated. On native, the first visual
  // render can precede SecureStore session restoration, so read the session
  // here and bind its current token explicitly instead of allowing an anon
  // invocation to be cached as a missing photo.
  const suppliedAccessToken = options.accessToken?.trim();
  const sessionData = suppliedAccessToken ? null : (await supabase.auth.getSession()).data;
  const accessToken = suppliedAccessToken || sessionData?.session?.access_token;
  if (!accessToken) return null;

  const cacheKey = `${cleanSpotId}:${options.preferredOwnerImageFailed ? "owner-failed" : "missing-owner"}`;
  const cached = googlePhotoRequests.get(cacheKey);
  if (cached && cached.accessToken === accessToken) {
    const cachedResult = await cached.request;
    const ttl = cachedResult ? GOOGLE_PHOTO_REQUEST_TTL_MS : GOOGLE_PHOTO_FAILURE_TTL_MS;
    if (Date.now() - cached.createdAt < ttl) return cachedResult;
  }

  const stored = await readStoredGooglePhoto(options.cacheNamespace, cacheKey);
  if (stored) return stored;

  const request = supabase.functions
    .invoke<GooglePlacePhotoResult>("google-place-photo", {
      body: {
        spotId: cleanSpotId,
        preferredOwnerImageFailed: Boolean(options.preferredOwnerImageFailed),
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    .then(({ data, error }) => {
      if (error) {
        console.warn("Google place photo function error:", {
          message: error.message,
          context: error.context,
          name: error.name,
        });
        return null;
      }
      return data ?? null;
    })
    .catch((error: unknown) => {
      console.warn("Google place photo function failed:", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

  googlePhotoRequests.set(cacheKey, { accessToken, createdAt: Date.now(), request });
  const result = await request;
  if (result?.source === "google" && result.imageUrl) {
    await storeGooglePhoto(options.cacheNamespace, cacheKey, result);
  }
  return result;
}
