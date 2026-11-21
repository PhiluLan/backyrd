import { loadSpotMoodCounts } from "./mood-catalog";
import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
import { applyCanonicalWorldSpot } from "@/lib/spot-world-profile";
export const getPublicSpotDetailServer = cache(async (spotId: string) => {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spotId,
  });
  if (error) throw new Error("Der Ort konnte gerade nicht geladen werden.");
  if (!data) return null;

  const [
    { data: moodProfile, error: moodError },
    { data: worldProfile, error: worldError },
    { data: sourceCredit },
  ] = await Promise.all([
    client
      .from("backyrd_spot_mood_profile_public_v1")
      .select(
        "concept_key,label,canonical_label,concept_contributors,eligible_contributors,percentage,evidence_state,rank",
      )
      .eq("spot_id", spotId)
      .order("rank", { ascending: true }),
    client.rpc("spot_detail_product_profile_v1", {
      p_spot_id: spotId,
      p_surface: "WEB",
    }),
    client
      .rpc("spot_place_source_credit_v1", { p_spot_id: spotId })
      .maybeSingle<NonNullable<PublicSpotDetailDTO["source_credit"]>>(),
  ]);

  // Projection failures are disclosed; they never turn into a missing-place claim.
  if (moodError)
    throw new Error("Die Eindrücke konnten gerade nicht geladen werden.");
  const result = {
    ...(data as PublicSpotDetailDTO),
    mood_count:
      (
        await loadSpotMoodCounts([spotId], client).catch(
          () => ({}) as Record<string, number>,
        )
      )[spotId] ?? null,
    top_moods: moodProfile ?? [],
    source_credit: sourceCredit,
    world_profile_unavailable: Boolean(worldError),
    world_profile: worldError
      ? null
      : (worldProfile as PublicSpotDetailDTO["world_profile"]),
  } as PublicSpotDetailDTO;
  return applyCanonicalWorldSpot(
    result,
    result.world_profile ?? null,
  ) as PublicSpotDetailDTO;
});
