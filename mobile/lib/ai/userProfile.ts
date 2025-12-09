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
  const { data: searches, error: searchesError } = await supabase
    .from("user_searches")
    .select("query")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (searchesError) {
    console.warn("buildUserProfile: user_searches error", searchesError.message);
  }

  const queries = (searches || [])
    .map((x) => normalize(x.query))
    .filter(Boolean);

  const preferredMoods = new Set<string>();
  const dislikedMoods = new Set<string>();

  // Sehr einfache Keyword-Heuristik aus Suchanfragen
  for (const q of queries) {
    const has = (frag: string) => q.includes(frag);

    if (has("romant")) preferredMoods.add("romantisch");
    if (has("date")) preferredMoods.add("date night");

    if (has("gemüt") || has("gemuet") || has("cozy") || has("chillig")) {
      preferredMoods.add("gemütlich");
    }

    if (has("ruhig") || has("calm") || has("entspannt")) {
      preferredMoods.add("ruhig");
    }

    if (has("party") || has("lebendig") || has("vibe") || has("nightlife")) {
      preferredMoods.add("lebendig");
    }

    if (has("kein lauter") || has("nicht laut") || has("keine clubs")) {
      dislikedMoods.add("laut");
    }
  }

  // =============== 2) Zuletzt bewertete Spots (Reviews) ===============
  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("spot_id,mood_a,mood_b")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (reviewsError) {
    console.warn("buildUserProfile: reviews error", reviewsError.message);
  }

  const recentSpotIds = new Set<string>();
  const moodCounts: Record<string, number> = {};

  for (const r of reviews || []) {
    if (r.spot_id) recentSpotIds.add(r.spot_id);

    const moods = [r.mood_a, r.mood_b].map(normalize).filter(Boolean) as string[];
    for (const m of moods) {
      // alles was der Nutzer aktiv markiert hat → eher bevorzugt
      moodCounts[m] = (moodCounts[m] || 0) + 1;

      // einfache Heuristik: wenn jemand „laut“ schreibt, eher disliked
      if (m.includes("laut") && !m.includes("nicht")) {
        dislikedMoods.add("laut");
      } else {
        preferredMoods.add(m);
      }
    }
  }

  // =============== 3) Kategorien der besuchten Spots ===============
  let favoriteCategories: string[] = [];
  if (recentSpotIds.size > 0) {
    const { data: spotDetails, error: spotsError } = await supabase
      .from("spots")
      .select("id,category_id,categories(name)")
      .in("id", Array.from(recentSpotIds));

    if (spotsError) {
      console.warn("buildUserProfile: spots error", spotsError.message);
    }

    const catCounts: Record<string, number> = {};

    for (const s of spotDetails || []) {
      const c = normalize(s.categories?.name);
      if (!c) continue;
      catCounts[c] = (catCounts[c] || 0) + 1;
    }

    favoriteCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);
  }

  // =============== 4) typische Distanz ===============
  // Aktuell keine saubere Distanzberechnung ohne Home-Location → lieber null als falsche Werte.
  const typicalDistanceKm: number | null = null;

  // =============== 5) Knappe Vibe-Beschreibung ===============
  const preferredList = Array.from(preferredMoods);
  const dislikedList = Array.from(dislikedMoods);

  const vibeParts: string[] = [];

  if (preferredList.length) {
    vibeParts.push(`mag Moods wie ${preferredList.join(", ")}`);
  }
  if (dislikedList.length) {
    vibeParts.push(`meidet Moods wie ${dislikedList.join(", ")}`);
  }
  if (favoriteCategories.length) {
    vibeParts.push(`besucht oft Kategorien wie ${favoriteCategories.join(", ")}`);
  }

  const vibeSummary = vibeParts.join("; ");

  return {
    preferredMoods: preferredList,
    dislikedMoods: dislikedList,
    favoriteCategories,
    typicalDistanceKm,
    recentSearches: queries,
    recentSpots: Array.from(recentSpotIds),
    vibeSummary,
  };
}
