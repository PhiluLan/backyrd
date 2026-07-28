import { supabase } from "./supabase";

export type MobileTaxonomySearchMatch = {
  spot_id: string;
  matched_labels: string[];
  match_score: number;
};

export async function searchMobileTaxonomySpots(
  query: string,
  locale = "de",
  limit = 100,
): Promise<MobileTaxonomySearchMatch[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const { data, error } = await supabase.rpc(
    "search_mobile_taxonomy_spots_v1",
    {
      p_query: cleanQuery,
      p_locale: locale,
      p_limit: limit,
    },
  );

  if (error) throw new Error(error.message);

  return Array.isArray(data)
    ? (data as MobileTaxonomySearchMatch[]).map((row) => ({
        ...row,
        matched_labels: Array.isArray(row.matched_labels)
          ? row.matched_labels
          : [],
        match_score: Number(row.match_score ?? 0),
      }))
    : [];
}
