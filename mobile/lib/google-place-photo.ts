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
  authorAttributions?: GooglePhotoAttribution[];
  googleMapsUri?: string | null;
  reason?: string;
  error?: string;
};

export async function getGooglePlacePhotoFallback(
  spotId: string,
): Promise<GooglePlacePhotoResult | null> {
  const cleanSpotId = spotId.trim();

  if (!cleanSpotId) {
    console.warn("Google place photo: Spot ID fehlt");
    return null;
  }

  const { data, error } =
    await supabase.functions.invoke<GooglePlacePhotoResult>(
      "google-place-photo",
      {
        body: {
          spotId: cleanSpotId,
        },
      },
    );

  if (error) {
    console.warn("Google place photo function error:", {
      message: error.message,
      context: error.context,
      name: error.name,
    });

    return null;
  }

  console.log("GOOGLE PLACE PHOTO RESULT:", {
    spotId: cleanSpotId,
    data,
  });

  return data ?? null;
}