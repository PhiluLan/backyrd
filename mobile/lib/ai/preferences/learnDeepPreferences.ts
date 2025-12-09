// lib/ai/preferences/learnDeepPreferences.ts
import { supabase } from "../../supabase";

/**
 * Ultra-Version von Deep Preference Learning:
 * - Weighted embeddings
 * - Decay
 * - Habit extraction
 * - Category & mood scoring
 * - Vibe detection
 */

export async function learnDeepPreferences(
  userId: string,
  pickedSteps: any[]
) {
  if (!userId || !Array.isArray(pickedSteps) || pickedSteps.length === 0) return;

  /* ============================================================
     1) EXTRACT SIGNALS FROM PICKED STEPS
  ============================================================ */
  const vibeScores: Record<string, number> = {};
  const moodScores: Record<string, number> = {};
  const categoryScores: Record<string, number> = {};

  const habits: Record<string, any> = {
    prefersShortDistances: 0,
    prefersLongEvenings: 0,
    prefersRomantic: 0,
    prefersCozy: 0,
    prefersLively: 0,
    prefersOutdoor: 0,
    prefersIndoor: 0,
    picksInBaselAltstadt: 0,
    picksInKleinbasel: 0,
    picksInGundeli: 0,
    picksInStJohann: 0,
    picksInKlybeck: 0,
  };

  pickedSteps.forEach((step: any) => {
    const spot = step?.spot;
    if (!spot) return;

    /* -------------------------
       Moods (direct signal)
    ------------------------- */
    const moods = [
      ...(spot.moods || []),
      ...(spot.reviewMoods || []),
    ].map((m: any) => (m || "").toLowerCase());

    moods.forEach((m) => {
      moodScores[m] = (moodScores[m] || 0) + 1;
    });

    /* -------------------------
       Category
    ------------------------- */
    const cat = (spot.categoryName || "").toLowerCase();
    if (cat) categoryScores[cat] = (categoryScores[cat] || 0) + 1;

    /* -------------------------
       Vibes (semantic)
    ------------------------- */
    const summary = (spot.moodSummary || "").toLowerCase();

    if (summary.includes("romant")) vibeScores["romantic"] = (vibeScores["romantic"] || 0) + 1;
    if (summary.includes("cozy") || summary.includes("gemüt")) vibeScores["cozy"] = (vibeScores["cozy"] || 0) + 1;
    if (summary.includes("laut") || summary.includes("party")) vibeScores["lively"] = (vibeScores["lively"] || 0) + 1;

    /* -------------------------
       Habits
    ------------------------- */

    // Distanz
    if (spot.distanceKm != null) {
      if (spot.distanceKm <= 1.2) habits.prefersShortDistances += 1;
      if (spot.distanceKm >= 4) habits.prefersLongEvenings += 1;
    }

    // Mood tendencies
    if (moods.some((m) => m.includes("romant"))) habits.prefersRomantic += 1;
    if (moods.some((m) => m.includes("gemüt") || m.includes("cozy"))) habits.prefersCozy += 1;
    if (moods.some((m) => m.includes("party") || m.includes("lebendig"))) habits.prefersLively += 1;

    // Outdoor hints
    if (summary.includes("terrasse")) habits.prefersOutdoor += 1;
    if (summary.includes("indoor") || summary.includes("cozy")) habits.prefersIndoor += 1;

    // Area knowledge
    const area = (spot.area || "").toLowerCase();
    if (area.includes("altstadt")) habits.picksInBaselAltstadt += 1;
    if (area.includes("kleinbasel")) habits.picksInKleinbasel += 1;
    if (area.includes("gundeli")) habits.picksInGundeli += 1;
    if (area.includes("st. johann")) habits.picksInStJohann += 1;
    if (area.includes("klybeck")) habits.picksInKlybeck += 1;
  });

  /* ============================================================
     2) LOAD EXISTING MODEL (if exists)
  ============================================================ */
  const { data: existing } = await supabase
    .from("user_preferences_model")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const model = existing || {
    likes: { vibes: {}, categories: {}, moods: {} },
    dislikes: { vibes: {}, categories: {}, moods: {} },
    habits: {},
  };

  /* ============================================================
     3) APPLY DECAY TO OLD MODEL (old signals lose strength)
  ============================================================ */
  const DECAY = 0.85;

  function decayMap(map: Record<string, number>) {
    for (const k in map) {
      map[k] = map[k] * DECAY;
      if (map[k] < 0.01) delete map[k]; // clean noise
    }
  }

  decayMap(model.likes.vibes);
  decayMap(model.likes.categories);
  decayMap(model.likes.moods);

  /* ============================================================
     4) INTEGRATE NEW SIGNALS (weighted)
  ============================================================ */
  function addScores(target: Record<string, number>, src: Record<string, number>, weight: number) {
    for (const key in src) {
      target[key] = (target[key] || 0) + src[key] * weight;
    }
  }

  // weighted learning: mood > vibe > categories
  addScores(model.likes.moods, moodScores, 1.5);
  addScores(model.likes.vibes, vibeScores, 1.3);
  addScores(model.likes.categories, categoryScores, 1.2);

  // habits accumulate linearly
  model.habits = {
    ...(model.habits || {}),
    ...Object.fromEntries(
      Object.entries(habits).map(([k, v]) => [k, (model.habits?.[k] || 0) + v])
    ),
  };

  /* ============================================================
     5) SAVE BACK TO DATABASE
  ============================================================ */
  if (existing) {
    await supabase
      .from("user_preferences_model")
      .update({
        likes: model.likes,
        dislikes: model.dislikes,
        habits: model.habits,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } else {
    await supabase.from("user_preferences_model").insert({
      user_id: userId,
      likes: model.likes,
      dislikes: model.dislikes,
      habits: model.habits,
    });
  }
}
