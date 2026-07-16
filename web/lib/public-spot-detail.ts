import type { SpotDetailDTO } from "@backyrd/shared";
import { supabase } from "@/lib/supabase/client";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Spot konnte nicht geladen werden.";
}

export async function getPublicSpotDetail(spotId: string): Promise<SpotDetailDTO> {
  const { data, error } = await supabase.rpc("backyrd_web_spot_detail_v1", {
    p_spot_id: spotId,
  });

  if (error) throw new Error(errorMessage(error));
  return data as SpotDetailDTO;
}
