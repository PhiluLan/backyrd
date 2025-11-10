import { supabase } from "../../supabase";

/**
 * Lernt tiefe Präferenzen aus den ausgewählten Journey-Schritten.
 */
export async function learnDeepPreferences(
  userId: string,
  pickedSteps: any[]
) {
  if (!userId || !pickedSteps || !Array.isArray(pickedSteps)) return;

  // ---------------------------------------------------------
  // 1) Signale extrahieren
  // ---------------------------------------------------------

  const vibes: string[] = [];
  const categories: string[] = [];
  const moods: string[] = [];

  pickedSteps.forEach((step) => {
    const spot = step.spot;
    if (!spot) return;

    // Moods
    if (Array.isArray(spot.moods)) moods.push(...spot.moods);
    if (Array.isArray(spot.reviewMoods)) moods.push(...spot.reviewMoods);

    // Kategorien
    if (spot.categoryName) categories.push(spot.categoryName.toLowerCase());

    // Vibes (sehr grob, kann später verfeinert werden)
    const summary = (spot.moodSummary || "").toLowerCase();
    if (summary.includes("cozy") || summary.includes("gemüt")) vibes.push("cozy");
    if (summary.includes("romant")) vibes.push("romantic");
    if (summary.includes("laut") || summary.includes("loud")) vibes.push("loud");
  });

  // ---------------------------------------------------------
  // 2) Vorheriges Modell laden (soft)
  // ---------------------------------------------------------
  const { data: existing, error } = await supabase
    .from("user_preferences_model")
    .select("likes, dislikes, habits")
    .eq("user_id", userId)
    .maybeSingle(); // ✅ sicher

  if (error) {
    console.warn("Deep Preferences: Laden fehlgeschlagen:", error.message);
  }

  const model = existing || {
    likes: { vibes: [], categories: [], moods: [] },
    dislikes: { vibes: [], categories: [], moods: [] },
    habits: {},
  };

  // Sicherheit: Fallbacks, falls Felder fehlen
  model.likes = model.likes || { vibes: [], categories: [], moods: [] };
  model.dislikes = model.dislikes || { vibes: [], categories: [], moods: [] };

  // ---------------------------------------------------------
  // 3) Likes anreichern (ohne Duplikate)
  // ---------------------------------------------------------
  model.likes.vibes = [...new Set([...(model.likes.vibes || []), ...vibes])];
  model.likes.categories = [...new Set([...(model.likes.categories || []), ...categories])];
  model.likes.moods = [...new Set([...(model.likes.moods || []), ...moods])];

  // ---------------------------------------------------------
  // 4) Zurückschreiben: insert oder update
  // ---------------------------------------------------------
  if (existing) {
    await supabase
      .from("user_preferences_model")
      .update({
        likes: model.likes,
        habits: model.habits,
        dislikes: model.dislikes,
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
