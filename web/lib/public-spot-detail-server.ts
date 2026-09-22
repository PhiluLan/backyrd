import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
export async function getPublicSpotDetailServer(spotId: string) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spotId,
  });
  if (error) return null;
  if (!data) return null;

  const [{ data: moodProfile, error: moodError }, { data: worldProfile, error: worldError }] = await Promise.all([client
    .from("backyrd_spot_mood_profile_public_v1")
    .select(
      "concept_key,label,canonical_label,concept_contributors,eligible_contributors,percentage,evidence_state,rank",
    )
    .eq("spot_id", spotId)
    .order("rank", { ascending: true }), client.rpc("spot_detail_product_profile_v1", { p_spot_id: spotId, p_surface: "WEB" })]);

  if (moodError || worldError) return null;
  return {
    ...(data as PublicSpotDetailDTO),
    top_moods: moodProfile ?? [],
    world_profile: worldProfile as PublicSpotDetailDTO["world_profile"],
  } as PublicSpotDetailDTO;
}
