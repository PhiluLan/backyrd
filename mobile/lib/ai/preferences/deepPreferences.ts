import { supabase } from "../../supabase";

/**
 * Lädt die tiefen Nutzerpräferenzen.
 * Gibt IMMER ein gültiges Objekt zurück (nie null), damit dein AI-Flow nie bricht.
 */
export async function buildDeepPreferences(userId: string) {
  const { data, error } = await supabase
    .from("user_preferences_model")
    .select("likes, dislikes, habits")
    .eq("user_id", userId)
    .maybeSingle(); // ✅ besser als .single()

  // ✅ .maybeSingle() verhindert harte Errors → sauberer
  if (error) {
    console.warn("Deep Preferences Fehler:", error.message);
  }

  // ✅ Falls row nicht existiert → Standardprofil zurückgeben
  if (!data) {
    return {
      likes: { vibes: [], categories: [], moods: [] },
      dislikes: { vibes: [], categories: [], moods: [] },
      habits: {},
    };
  }

  return {
    likes: data.likes || { vibes: [], categories: [], moods: [] },
    dislikes: data.dislikes || { vibes: [], categories: [], moods: [] },
    habits: data.habits || {},
  };
}
