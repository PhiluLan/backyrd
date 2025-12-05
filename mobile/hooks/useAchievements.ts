import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { 
  awardAchievementsForUser, 
  calculateAchievementProgress 
} from "../lib/achievementEngine";

export function useAchievements() {
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setError("Kein User eingeloggt");
      setLoading(false);
      return;
    }

    // 1) Vergibt Achievements (falls neu)
    await awardAchievementsForUser(userId);

    // 2) Holt Fortschritt aus der Engine (richtig!)
    const calc = await calculateAchievementProgress(userId);

    setAchievements(calc);
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
