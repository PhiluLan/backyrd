import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicSpotDetailDTO } from "@/lib/public-spot-detail";
export async function getPublicSpotDetailServer(spotId: string) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spotId,
  });
  if (error) return null;
  return (data ?? null) as PublicSpotDetailDTO | null;
}
