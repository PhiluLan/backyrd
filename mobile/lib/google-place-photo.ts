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

  const cacheKey = `${cleanSpotId}:${options.preferredOwnerImageFailed ? "owner-failed" : "missing-owner"}`;
  const cached = googlePhotoRequests.get(cacheKey);
  if (cached) return cached;

  const request = supabase.functions
    .invoke<GooglePlacePhotoResult>("google-place-photo", {
      body: {
        spotId: cleanSpotId,
        preferredOwnerImageFailed: Boolean(options.preferredOwnerImageFailed),
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
