import { supabase } from "../supabase";

/**
 * Preference Engine 2.0:
 * Lernt Nutzerverhalten aus:
 * - Reviews (stärkstes Signal)
 * - Reservations (Intentionalität)
 * - Searches (Trend-Signale)
 * - Spot Moods (indirekte Präferenzen)
 *
 * → liefert ein skalierbares Nutzer-Vektorprofil
 */

function norm(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export async function buildUserPreferences(userId: string) {
  // ====================================================================
  // 1) REVIEWS – sehr starke Präferenzsignale
  // ====================================================================
  const { data: reviews, error: reviewErr } = await supabase
    .from("reviews")
    .select("spot_id, mood_a, mood_b, created_at")
    .eq("user_id", userId);

  if (reviewErr) console.warn("buildUserPreferences: reviews error", reviewErr.message);

  // ====================================================================
  // 2) RESERVATIONS – moderate Signale (Intent zum Besuch)
  // ====================================================================
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("spot_id, date")
    .eq("user_id", userId);

  if (resErr) console.warn("buildUserPreferences: reservations error", resErr.message);

  // ====================================================================
  // 3) SEARCHES – schwache semantische Signale
  // ====================================================================
  const { data: searches, error: searchErr } = await supabase
    .from("user_searches")
    .select("query, created_at")
    .eq("user_id", userId);

  if (searchErr) console.warn("buildUserPreferences: searches error", searchErr.message);

  // ====================================================================
  // 4) SPOT MOODS – indirekte Signale (Moods der Spots, die besucht wurden)
  // ====================================================================
  const visitedSpotIds = [
    ...(reviews?.map((r) => r.spot_id).filter(Boolean) || []),
    ...(reservations?.map((r) => r.spot_id).filter(Boolean) || []),
  ];

  let spotMoods: any[] = [];
  if (visitedSpotIds.length > 0) {
    const { data, error } = await supabase
      .from("spot_moods_agg")
      .select("spot_id, mood_id, mood_tokens(token), rank")
      .in("spot_id", visitedSpotIds);

    if (error) console.warn("buildUserPreferences: spot_moods_agg error", error.message);
    else spotMoods = data || [];
  }

  // ====================================================================
  // AGGREGATION
  // ====================================================================

  const moodScore: Record<string, number> = {};
  const categoryScore: Record<string, number> = {};
  const timePatterns: Record<string, number> = {};

  const weights = {
    review: 3,       // direkt angegeben
    reservation: 2,  // Nutzer hat aktiv gebucht → stark
    search: 1,       // schwach, aber relevant
    spotMood: 1,     // indirektes Signal
  };

  function increase(map: Record<string, number>, key: string, value: number) {
    if (!key) return;
    map[key] = (map[key] || 0) + value;
  }

  // ====================================================================
  // REVIEWS
  // ====================================================================
  for (const r of reviews || []) {
    const moods = [norm(r.mood_a), norm(r.mood_b)].filter(Boolean);
    for (const m of moods) increase(moodScore, m, weights.review);

    // Zeitmuster
    const dt = new Date(r.created_at);
    increase(timePatterns, `${dt.getDay()}-${dt.getHours()}`, 1);
  }

  // ====================================================================
  // RESERVATIONS
  // ====================================================================
  for (const r of reservations || []) {
    const dt = new Date(r.date);
    increase(timePatterns, `${dt.getDay()}-${dt.getHours()}`, weights.reservation);
  }

  // ====================================================================
  // SEARCHES  → semantische Mood-Extraktion
  // ====================================================================
  const searchMoodDictionary = [
    { key: "romant", mood: "romantisch" },
    { key: "date", mood: "romantisch" },
    { key: "gemüt", mood: "gemütlich" },
    { key: "cozy", mood: "gemütlich" },
    { key: "ruhig", mood: "ruhig" },
    { key: "entspannt", mood: "ruhig" },
    { key: "chill", mood: "chillig" },
    { key: "lebendig", mood: "lebendig" },
    { key: "party", mood: "lebendig" },
    { key: "laut", mood: "laut" },
  ];

  for (const s of searches || []) {
    const q = norm(s.query);

    for (const entry of searchMoodDictionary) {
      if (q.includes(entry.key)) {
        increase(moodScore, entry.mood, weights.search);
      }
    }

    // Auch Zeitmuster aus Suchanfrage
    const dt = new Date(s.created_at);
    increase(timePatterns, `${dt.getDay()}-${dt.getHours()}`, 0.5);
  }

  // ====================================================================
  // SPOT MOODS (indirekt)
  // ====================================================================
  for (const sm of spotMoods) {
    const token: string = norm(sm.mood_tokens?.token);
    if (!token) continue;

    // Spots, die der Nutzer gewählt hat, sagen viel über Vorlieben
    increase(moodScore, token, weights.spotMood * (sm.rank ? 1 / sm.rank : 1));
  }

  // ====================================================================
  // NORMALIZATION (min-max scaling)
  // ====================================================================
  function normalizeScores(obj: Record<string, number>) {
    const vals = Object.values(obj);
    if (vals.length === 0) return {};
    const max = Math.max(...vals);
    const out: Record<string, number> = {};
    for (const key in obj) {
      out[key] = max === 0 ? 0 : obj[key] / max;
    }
    return out;
  }

  return {
    moodPreferences: normalizeScores(moodScore),
    categoryPreferences: normalizeScores(categoryScore),
    timePatterns: normalizeScores(timePatterns),
    distancePreferencesAvgKm: null, // später implementieren
  };
}
