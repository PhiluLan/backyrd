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

const googlePhotoRequests = new Map<string, Promise<GooglePlacePhotoResult | null>>();

export async function getGooglePlacePhotoFallback(
  spotId: string,
  options: { preferredOwnerImageFailed?: boolean } = {},
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
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;

  const cacheKey = `${cleanSpotId}:${options.preferredOwnerImageFailed ? "owner-failed" : "missing-owner"}`;
  const cached = googlePhotoRequests.get(cacheKey);
  if (cached) return cached;

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

  googlePhotoRequests.set(cacheKey, request);
  const result = await request;
  if (!result) googlePhotoRequests.delete(cacheKey);
  return result;
}
