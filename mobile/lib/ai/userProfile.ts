// /lib/ai/userProfile.ts

import { supabase } from "../supabase";

export type UserProfile = {
  preferredMoods: string[];
  dislikedMoods: string[];
  favoriteCategories: string[];
  typicalDistanceKm: number | null;
  recentSearches: string[];
  recentSpots: string[];
  vibeSummary: string; // Kurzbeschreibung für GPT
};

function normalize(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export async function buildUserProfile(userId: string): Promise<UserProfile> {
  // =============== 1) Letzte 10 Suchanfragen ===============
  const { data: searches } = await supabase
    .from("user_searches")
    .select("query")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const queries = (searches || [])
    .map((x) => normalize(x.query))
    .filter(Boolean);

  const preferredMoods = new Set<string>();
  const dislikedMoods = new Set<string>();

  for (const q of queries) {
    if (q.includes("romant")) preferredMoods.add("romantisch");
    if (q.includes("gemüt") || q.includes("cozy")) preferredMoods.add("gemütlich");
    if (q.includes("party")) preferredMoods.add("lebendig");
    if (q.includes("laut")) dislikedMoods.add("laut");
    if (q.includes("ruhig")) preferredMoods.add("ruhig");
  }

  // =============== 2) Zuletzt besuchte Spots ===============
  const { data: reviews } = await supabase
    .from("reviews")
    .select("spot_id,mood_a,mood_b")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const recentSpotIds = new Set<string>();
  const moodVotes = new Set<string>();

  for (const r of reviews || []) {
    if (r.spot_id) recentSpotIds.add(r.spot_id);
    if (r.mood_a) moodVotes.add(normalize(r.mood_a));
    if (r.mood_b) moodVotes.add(normalize(r.mood_b));
  }

  // Mood Votes zählen
  moodVotes.forEach((m) => preferredMoods.add(m));

  // =============== 3) Kategorien der besuchten Spots ===============
  const { data: spotDetails } = await supabase
    .from("spots")
    .select("id,category_id,categories(name)")
    .in("id", Array.from(recentSpotIds));

  const catCounts: Record<string, number> = {};

  for (const s of spotDetails || []) {
    const c = normalize(s.categories?.name);
    if (!c) continue;
    catCounts[c] = (catCounts[c] || 0) + 1;
  }

  const favoriteCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // =============== 4) typische Distanz (aus letzten 10 Spots) ===============
  // Hole Spot Koordinaten und berechne Durchschnitt
  let typicalDistanceKm: number | null = null;

  if (recentSpotIds.size > 0) {
    const { data: posSpots } = await supabase
      .from("spots")
      .select("lat,lng")
      .in("id", Array.from(recentSpotIds));

    const distances = posSpots
      ?.map((s) => Number(s.lat) && Number(s.lng) ? 1 : null)
      .filter(Boolean) as number[];

    if (distances.length > 0) {
      typicalDistanceKm = distances.reduce((a, b) => a + b, 0) / distances.length;
    }
  }

  // =============== 5) Knappe Vibe-Beschreibung ===============
  const vibeSummary = [
    preferredMoods.size ? `mag ${Array.from(preferredMoods).join(", ")}` : "",
    favoriteCategories.length ? `besucht oft Kategorien wie ${favoriteCategories.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    preferredMoods: Array.from(preferredMoods),
    dislikedMoods: Array.from(dislikedMoods),
    favoriteCategories,
    typicalDistanceKm,
    recentSearches: queries,
    recentSpots: Array.from(recentSpotIds),
    vibeSummary,
  };
}
