// /hooks/useAchievements.ts
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  tier: number | null;
  type: string;
  threshold: number | null;
};

type UserAchievement = {
  achievement_id: string;
  achieved_at: string;
};

type AchievementWithProgress = Achievement & {
  unlocked: boolean;
  progress: number;   // 0 - threshold
  percentage: number; // 0 - 1
};

export function useAchievements() {
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1) session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setError(sessionError.message);
      setLoading(false);
      return;
    }

    const user = session?.user;
    if (!user) {
      setError("No user");
      setLoading(false);
      return;
    }

    const userId = user.id;

    // 2) alle Achievements
    const { data: allAchievements, error: achErr } = await supabase
      .from("achievements")
      .select("*")
      .order("tier", { ascending: true });

    if (achErr) {
      setError(achErr.message);
      setLoading(false);
      return;
    }

    // 3) user_achievements für diesen User
    const { data: userAchievements, error: uaErr } = await supabase
      .from("user_achievements")
      .select("achievement_id, achieved_at")
      .eq("user_id", userId);

    if (uaErr) {
      setError(uaErr.message);
      setLoading(false);
      return;
    }

    // 4) Counter besorgen
    // 4a) review count
    const { count: reviewCount, error: reviewErr } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    // 4b) spots created count
    const { count: spotCount, error: spotErr } = await supabase
      .from("spots")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId);

    if (reviewErr || spotErr) {
      setError(reviewErr?.message || spotErr?.message || "Error loading counters");
      setLoading(false);
      return;
    }

    const uaSet = new Set(userAchievements?.map((u) => u.achievement_id) || []);

    const mapped = (allAchievements || []).map<AchievementWithProgress>((a) => {
      let progress = 0;
      let percentage = 0;
      const threshold = a.threshold || 1;

      if (a.type === "review") {
        progress = reviewCount || 0;
      } else if (a.type === "spot") {
        progress = spotCount || 0;
      } else {
        // andere typen erstmal 0
        progress = 0;
      }

      percentage = Math.min(1, progress / threshold);

      return {
        ...a,
        unlocked: uaSet.has(a.id),
        progress,
        percentage,
      };
    });

    setAchievements(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    achievements,
    loading,
    error,
    refetch: load,
  };
}
