"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Row = {
  decision_id: string;
  decision_created_at: string;
  city: string | null;
  mood_a_text: string | null;
  mood_b_text: string | null;
  spot_id: string;
  spot_name: string;
  category_name: string | null;
  why_this: string | null;
  status: string;
};
export default function DecisionHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "get_decision_visit_candidates_v1",
      { p_limit: 60, p_review_window_hours: 12, p_candidate_ttl_hours: 72 },
    );
    setError(Boolean(error));
    setRows((Array.isArray(data) ? data : []) as Row[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsShell title="FÜR-JETZT-VERLAUF">
      {loading ? (
        <div className="b-skeleton" style={{ height: 420, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Verlauf nicht geladen"
          message="Deine vergangenen Vorschläge konnten gerade nicht geladen werden."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, index) => (
            <Link
              href={`/spots/${row.spot_id}`}
              className="b-surface"
              style={{ padding: 20 }}
              key={`${row.decision_id}-${row.spot_id}-${index}`}
            >
              <p className="b-kicker">
                {row.category_name || row.city || "Für jetzt"}
              </p>
              <h2 className="b-card-title" style={{ marginTop: 7 }}>
                {row.spot_name}
              </h2>
              <p className="b-meta">
                {[row.mood_a_text, row.mood_b_text].filter(Boolean).join(" + ")}{" "}
                ·{" "}
                {new Date(row.decision_created_at).toLocaleDateString("de-CH")}
              </p>
              {row.why_this ? <p className="b-muted">{row.why_this}</p> : null}
            </Link>
          ))}
        </div>
      ) : (
        <StateView
          title="Noch kein Für-jetzt-Verlauf"
          message="Deine vergangenen Vorschläge erscheinen hier, sobald du Für jetzt genutzt hast."
          actionLabel="Für jetzt öffnen"
          onAction={() => location.assign("/decision")}
        />
      )}
    </SettingsShell>
  );
}
