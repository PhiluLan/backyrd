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
  _userId: string
): Promise<NewlyUnlockedAchievement[]> {
  const { data, error } = await supabase.rpc("backyrd_sync_my_achievements_v1");
  if (error) throw error;

  return (data ?? []).map((row: Achievement & { achieved_at: string }) => ({
    ...row,
    unlocked: true,
    progress: row.threshold ?? 1,
    percentage: 1,
    public_icon_url: resolveIconUrl(row),
  }));
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
