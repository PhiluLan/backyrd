// mobile/lib/achievementEngine.ts
import { supabase } from "./supabase";

export type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  tier: number | null;
  type: string;
  threshold: number | null;
};

export type AchievementWithProgress = Achievement & {
  unlocked: boolean;
  progress: number;
  percentage: number;
  public_icon_url: string | null;
};

export type NewlyUnlockedAchievement = AchievementWithProgress & {
  achieved_at: string;
};

// korrekt für deinen Bucket
function resolveIconUrl(a: Achievement) {
  const path = (a.icon_url || `${a.code}.png`).replace(/^\//, "");
  return supabase.storage.from("badges").getPublicUrl(path).data.publicUrl;
}

/* ============================================================
   1) Vergibt Achievements und speichert sie in user_achievements
   ============================================================ */
export async function awardAchievementsForUser(
  userId: string
): Promise<NewlyUnlockedAchievement[]> {

  const { data: allAchievements, error: achErr } = await supabase
    .from("achievements")
    .select("*")
    .order("threshold", { ascending: true });

  if (achErr || !allAchievements) return [];

  const { data: existingRows } = await supabase
    .from("user_achievements")
    .select("achievement_id")
    .eq("user_id", userId);

  const alreadyUnlocked = new Set(existingRows?.map((r) => r.achievement_id));

  // review + spot zählen
  const [{ count: reviewCount }, { count: spotCount }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId),

    supabase
      .from("spots")
      .select("id", { head: true, count: "exact" })
      .eq("created_by", userId),
  ]);

  const now = new Date().toISOString();
  const newUnlocked: NewlyUnlockedAchievement[] = [];
  const insertRows: any[] = [];

  for (const ach of allAchievements) {
    let progress = 0;

    if (ach.type === "review") progress = reviewCount || 0;
    if (ach.type === "spot") progress = spotCount || 0;

    const threshold = ach.threshold ?? 1;
    const unlocked = progress >= threshold;

    if (unlocked && !alreadyUnlocked.has(ach.id)) {
      const full: NewlyUnlockedAchievement = {
        ...ach,
        unlocked: true,
        progress,
        percentage: Math.min(1, progress / threshold),
        public_icon_url: resolveIconUrl(ach),
        achieved_at: now,
      };

      newUnlocked.push(full);

      insertRows.push({
        user_id: userId,
        achievement_id: ach.id,
        achieved_at: now,
      });
    }
  }

  if (insertRows.length > 0) {
    await supabase.from("user_achievements").insert(insertRows);
  }

  return newUnlocked;
}

/* ============================================================
   2) Progress für die ANZEIGE berechnen (UI nutzt NUR diese Funktion)
   ============================================================ */
export async function calculateAchievementProgress(
  userId: string
): Promise<AchievementWithProgress[]> {

  const { data: allAchievements } = await supabase
    .from("achievements")
    .select("*")
    .order("threshold", { ascending: true });

  if (!allAchievements) return [];

  const { data: unlockedRows } = await supabase
    .from("user_achievements")
    .select("achievement_id")
    .eq("user_id", userId);

  const unlockedSet = new Set(unlockedRows?.map((x) => x.achievement_id));

  const [{ count: reviewCount }, { count: spotCount }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId),

    supabase
      .from("spots")
      .select("id", { head: true, count: "exact" })
      .eq("created_by", userId),
  ]);

  return allAchievements.map((a) => {
    let progress = 0;

    if (a.type === "review") progress = reviewCount || 0;
    if (a.type === "spot") progress = spotCount || 0;

    const threshold = a.threshold ?? 1;

    return {
      ...a,
      unlocked: unlockedSet.has(a.id),
      progress,
      percentage: Math.min(1, progress / threshold),
      public_icon_url: resolveIconUrl(a),
    };
  });
}
