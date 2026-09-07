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

export async function getGooglePlacePhotoFallback(
  spotId: string,
  options: { preferredOwnerImageFailed?: boolean; accessToken?: string | null } = {},
): Promise<GooglePlacePhotoResult | null> {
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
  if (cached && cached.accessToken === accessToken && Date.now() - cached.createdAt < GOOGLE_PHOTO_REQUEST_TTL_MS) {
    return cached.request;
  }

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
  if (!result && googlePhotoRequests.get(cacheKey)?.request === request) googlePhotoRequests.delete(cacheKey);
  return result;
}
