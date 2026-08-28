"use client";
import { useCallback, useEffect, useState } from "react";
import { StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Badge = {
  achieved_at: string;
  achievements: {
    name: string;
    description: string | null;
    icon_url: string | null;
    tier: string | null;
  } | null;
};
export default function AchievementsPage() {
  const [rows, setRows] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setError(true);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("user_achievements")
      .select("achieved_at,achievements(name,description,icon_url,tier)")
      .eq("user_id", user.user.id)
      .order("achieved_at", { ascending: false });
    setError(Boolean(error));
    setRows((data ?? []) as unknown as Badge[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="b-container b-main">
      <p className="b-kicker">Dein Beitrag</p>
      <h1 className="b-display b-page-title" style={{ marginTop: 10 }}>
        ACHIEVEMENTS
      </h1>
      <div className="b-marker" />
      {loading ? (
        <div className="b-skeleton" style={{ height: 400, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Achievements nicht geladen"
          message="Versuch es gleich nochmals."
        />
      ) : rows.length ? (
        <div className="b-grid b-grid-3">
          {rows.map((row, index) => (
            <article
              className="b-surface"
              style={{ padding: 26 }}
              key={`${row.achievements?.name}-${index}`}
            >
              <p className="b-kicker">{row.achievements?.tier || "Backyrd"}</p>
              <h2 className="b-section-title" style={{ marginTop: 10 }}>
                {row.achievements?.name || "Achievement"}
              </h2>
              {row.achievements?.description ? (
                <p className="b-muted">{row.achievements.description}</p>
              ) : null}
              <p className="b-meta">
                Erreicht am{" "}
                {new Date(row.achieved_at).toLocaleDateString("de-CH")}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <StateView
          title="Noch keine Achievements"
          message="Echte Beiträge und Erlebnisse können hier sichtbar werden – ohne Vanity-Dashboard."
        />
      )}
    </div>
  );
}
