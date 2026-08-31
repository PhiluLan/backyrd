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
    description: string | null;
    description_source: string | null;
  };
  opening_hours: Array<{
    day_of_week: string;
    open_time: string | null;
    close_time: string | null;
    idx: number;
  }>;
  photos: Array<{
    id: string | number;
    url: string;
  }>;
  top_moods: Array<{
    concept_key: string;
    label: string;
    canonical_label: string;
    concept_contributors: number | null;
    eligible_contributors: number | null;
    percentage: number | null;
    evidence_state: "EARLY" | "ESTABLISHED";
    rank: number;
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

export async function getPublicSpotDetail(
  spotId: string
): Promise<PublicSpotDetailDTO | null> {
  const { data, error } = await supabase.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spotId,
  });

  if (error) throw new Error("Spot konnte nicht geladen werden.");
  if (!data) return null;
  const { data: moodProfile, error: moodError } = await supabase
    .from("backyrd_spot_mood_profile_public_v1")
    .select("concept_key,label,canonical_label,concept_contributors,eligible_contributors,percentage,evidence_state,rank")
    .eq("spot_id", spotId)
    .order("rank", { ascending: true });
  if (moodError) throw new Error("Community-Moods konnten nicht geladen werden.");
  return { ...(data as PublicSpotDetailDTO), top_moods: moodProfile ?? [] };
}
