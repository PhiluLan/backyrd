// lib/ai/preferences/deepPreferences.ts
import { supabase } from "../../supabase";

/**
 * Lädt das Deep-Preference-Profil des Users.
 * Liefert IMMER ein komplettes, robustes Modell:
 *  - normalisierte Scores
 *  - Top-Moods/Vibes/Categories
 *  - Habits
 */
export async function buildDeepPreferences(userId: string) {
  const { data, error } = await supabase
    .from("user_preferences_model")
    .select("likes, dislikes, habits")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) console.warn("DeepPreferences: Load error:", error.message);

  // =========================================
  // 1) Rohdaten oder Defaults
  // =========================================
  const likes = data?.likes || { vibes: {}, categories: {}, moods: {} };
  const dislikes = data?.dislikes || { vibes: {}, categories: {}, moods: {} };
  const habits = data?.habits || {};

  // Sicherheit: Maps statt Arrays sicherstellen
  const safeLikes = {
    vibes: likes.vibes || {},
    categories: likes.categories || {},
    moods: likes.moods || {},
  };

  const safeDislikes = {
    vibes: dislikes.vibes || {},
    categories: dislikes.categories || {},
    moods: dislikes.moods || {},
  };

  // =========================================
  // 2) Normieren (0..1)
  // =========================================
  function normalizeMap(map: Record<string, number>): Record<string, number> {
    const entries = Object.entries(map);
    if (entries.length === 0) return {};

    const max = Math.max(...entries.map(([_, v]) => v || 0), 0.0001);
    const out: Record<string, number> = {};

    for (const [k, v] of entries) {
      const nv = Math.max(0, Number(v || 0) / max);
      if (nv > 0.02) out[k] = nv; // remove noise
    }
    return out;
  }

  const likesNorm = {
    vibes: normalizeMap(safeLikes.vibes),
    categories: normalizeMap(safeLikes.categories),
    moods: normalizeMap(safeLikes.moods),
  };

  const dislikesNorm = {
    vibes: normalizeMap(safeDislikes.vibes),
    categories: normalizeMap(safeDislikes.categories),
    moods: normalizeMap(safeDislikes.moods),
  };

  // =========================================
  // 3) Hilfsfunktion: Top-N extrahieren
  // =========================================
  function topN(map: Record<string, number>, n = 4): string[] {
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .slice(0, n);
  }

  const topVibes = topN(likesNorm.vibes, 4);
  const topMoods = topN(likesNorm.moods, 6);
  const topCategories = topN(likesNorm.categories, 4);

  // =========================================
  // 4) Habits normalisieren
  // =========================================
  function normalizeHabits(h: Record<string, any>) {
    const out: Record<string, number> = {};
    const entries = Object.entries(h);
    if (entries.length === 0) return {};

    const max = Math.max(...entries.map(([_, v]) => Number(v) || 0), 0.0001);

    for (const [k, v] of entries) {
      const nv = Math.max(0, Number(v || 0) / max);
      if (nv > 0.05) out[k] = nv; // small noise removed
    }
    return out;
  }

  const habitsNorm = normalizeHabits(habits);

  // =========================================
  // 5) Vollständiges Modell zurückgeben
  // =========================================
  return {
    likes: likesNorm,
    dislikes: dislikesNorm,
    habits: habitsNorm,

    // HIGH-LEVEL EXTRACTS (extrem nützlich für GPT!)
    summary: {
      topVibes,
      topMoods,
      topCategories,
      dominantHabits: Object.keys(habitsNorm),
    },
  };
}
