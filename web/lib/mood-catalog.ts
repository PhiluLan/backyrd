import { supabase } from "@/lib/supabase/client";
import { loadBrowseMoods } from "../../packages/shared/src/presentation/mood";

export function loadSpotBrowseMoods(spotIds: readonly string[]) {
  return loadBrowseMoods(spotIds, async (ids, from, to) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const { data, error } = await supabase.from("backyrd_spot_mood_profile_public_v1")
        .select("spot_id,concept_key,label,rank").in("spot_id", ids).order("spot_id").order("concept_key").range(from, to).abortSignal(abort.signal);
      if (error) throw error;
      return data;
    } finally { clearTimeout(timer); }
  });
}
