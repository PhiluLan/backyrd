import { supabase } from "@/lib/supabase/client";

export type PublicSpotDetailDTO = {
  spot: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
    header_photo_path: string | null;
    price_level: number | null;
    website: string | null;
    phone: string | null;
    email: null;
    category: {
      id: string;
      name: string;
    } | null;
  };
  photos: Array<{
    id: string | number;
    url: string;
  }>;
  top_moods: Array<{
    mood_id: string;
    token: string;
    count: number;
  }>;
  reviews: Array<{
    id: string;
    text: string | null;
    mood_a: string | null;
    mood_b: string | null;
    created_at: string | null;
    user: {
      first_name: string | null;
    };
    photos: Array<{
      url: string;
    }>;
  }>;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Spot konnte nicht geladen werden.";
}

export async function getPublicSpotDetail(
  spotId: string
): Promise<PublicSpotDetailDTO | null> {
  const { data, error } = await supabase.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spotId,
  });

  if (error) throw new Error(errorMessage(error));
  return (data ?? null) as PublicSpotDetailDTO | null;
}
