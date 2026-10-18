import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { parseMoodOptions, type MoodOption } from "../../packages/shared/src/presentation/mood";

export function useMoodCatalog(query = "") {
  const [options, setOptions] = useState<MoodOption[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    const debounce = setTimeout(() => {
      setState("loading");
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("backyrd_search_mood_concepts_v1", { p_query: query, p_locale: "de", p_limit: 30 }).abortSignal(abort.signal);
          if (!active) return;
          if (error) throw error;
          setOptions(parseMoodOptions(data)); setLoadedQuery(query); setState("ready");
        } catch { if (active) { setOptions([]); setLoadedQuery(query); setState("error"); } }
        finally { clearTimeout(timeout); }
      })();
    }, 150);
    return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); abort.abort(); };
  }, [query, revision]);
  return { options: loadedQuery === query ? options : [], state: loadedQuery === query ? state : "loading" as const, retry: () => setRevision(v => v + 1) };
}

export async function loadSpotBrowseMoods(spotIds: readonly string[]) {
  const { loadBrowseMoods } = await import("../../packages/shared/src/presentation/mood");
  return loadBrowseMoods(spotIds, async (ids, from, to) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const { data, error } = await supabase.from("backyrd_spot_mood_profile_public_v1")
        .select("spot_id,concept_key,label,concept_contributors,evidence_state,rank").in("spot_id", ids).order("spot_id").order("concept_key").range(from, to).abortSignal(abort.signal);
      if (error) throw error;
      return data;
    } finally { clearTimeout(timer); }
  });
}

export async function loadSpotReviewCounts(spotIds: readonly string[]) {
  const { loadReviewCounts } = await import("../../packages/shared/src/presentation/mood");
  return loadReviewCounts(spotIds, async ids => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const { data, error } = await supabase.rpc("backyrd_public_spot_review_counts_v1", { p_spot_ids: ids }).abortSignal(abort.signal);
      if (error) throw error;
      return data;
    } finally { clearTimeout(timer); }
  });
}

export function useSpotReviewCounts(spotIds: readonly string[]) {
  const key = [...new Set(spotIds)].sort().join(",");
  const [counts, setCounts] = useState<Record<string, number>>({});
  useFocusEffect(useCallback(() => {
    let active = true;
    setCounts({});
    void loadSpotReviewCounts(key ? key.split(",") : []).then(rows => { if (active) setCounts(rows); }).catch(() => { /* A failed count remains unavailable, never zero. */ });
    return () => { active = false; };
  }, [key]));
  return counts;
}
