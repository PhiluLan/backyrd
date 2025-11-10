import { supabase } from "../supabase";

/**
 * Deep Preference Learning:
 * Liefert ein Vektorprofil des Users basierend auf ALLEN Aktionen.
 */

export async function buildUserPreferences(userId: string) {
  // ------------------------------------------------------
  // 1) REVIEWS – stärkstes Signal
  // ------------------------------------------------------
  const { data: reviews } = await supabase
    .from("reviews")
    .select("spot_id, mood_a, mood_b, created_at")
    .eq("user_id", userId);

  // ------------------------------------------------------
  // 2) RESERVATIONS – gutes Signal (Intentionalität)
  // ------------------------------------------------------
  const { data: reservations } = await supabase
    .from("reservations")
    .select("spot_id, date");

  // ------------------------------------------------------
  // 3) SEARCHES – schwächeres Signal, aber gut für Trends
  // ------------------------------------------------------
  const { data: searches } = await supabase
    .from("user_searches")
    .select("query, created_at")
    .eq("user_id", userId);

  // ------------------------------------------------------
  // 4) Moods der Spots (für Indirekte Signale)
  // ------------------------------------------------------
  const spotIds = [
    ...(reviews?.map((r) => r.spot_id) || []),
    ...(reservations?.map((r) => r.spot_id) || []),
  ];

  const { data: spotMoods } = await supabase
    .from("spot_moods")
    .select("spot_id, mood, rank")
    .in("spot_id", spotIds);

  // ------------------------------------------------------
  // AGGREGATION
  // ------------------------------------------------------

  const moodScore: Record<string, number> = {};
  const categoryScore: Record<string, number> = {};
  const timePatterns: Record<string, number> = {}; // "Friday-evening", "Sunday-afternoon"
  const distancePreferences: number[] = [];

  // Weighting
  const weights = {
    review: 3,
    reservation: 2,
    search: 1,
  };

  function addScore(map: Record<string, number>, key: string, value: number) {
    map[key] = (map[key] || 0) + value;
  }

  // Reviews
  for (const r of reviews || []) {
    if (r.mood_a) addScore(moodScore, r.mood_a.toLowerCase(), weights.review);
    if (r.mood_b) addScore(moodScore, r.mood_b.toLowerCase(), weights.review);

    const hour = new Date(r.created_at).getHours();
    const dow = new Date(r.created_at).getDay();
    addScore(timePatterns, `${dow}-${hour}`, 1);
  }

  // Reservations
  for (const r of reservations || []) {
    const d = new Date(r.date);
    addScore(timePatterns, `${d.getDay()}-${d.getHours()}`, weights.reservation);
  }

  // Searches
  for (const s of searches || []) {
    const q = (s.query || "").toLowerCase();
    const moods = ["romantisch", "gemütlich", "lebendig", "chillig", "cozy"];

    for (const m of moods) {
      if (q.includes(m)) addScore(moodScore, m, weights.search);
    }
  }

  // Spot Moods (indirekte Signale)
  for (const sm of spotMoods || []) {
    addScore(moodScore, sm.mood.toLowerCase(), 1);
  }

  // ------------------------------------------------------
  // Normalize
  // ------------------------------------------------------
  function normalizeScores(obj: Record<string, number>) {
    const max = Math.max(...Object.values(obj), 1);
    const out: Record<string, number> = {};
    for (const key in obj) out[key] = obj[key] / max;
    return out;
  }

  return {
    moodPreferences: normalizeScores(moodScore),
    categoryPreferences: normalizeScores(categoryScore),
    timePatterns: normalizeScores(timePatterns),
    distancePreferencesAvgKm:
      distancePreferences.length > 0
        ? distancePreferences.reduce((a, b) => a + b, 0) / distancePreferences.length
        : null,
  };
}
