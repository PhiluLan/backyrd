import { supabase } from "./supabase";

export async function resolveMoodTokens(input: string[]) {
  if (!input.length) return [];

  const normalized = input.map((m) =>
    m.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  );

  const { data, error } = await supabase
    .from("mood_matching")
    .select("mood_id, canonical_token, query_token")
    .in("query_token", normalized);

  if (error) {
    console.error("Mood matching error:", error);
    return [];
  }

  return [...new Set(data.map((d) => d.mood_id))];
}
