"use client";
import { useCallback, useEffect, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
export default function SafetyPage() {
  const [actions, setActions] = useState<Record<string, unknown>[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const [a, r] = await Promise.all([
      supabase.rpc("safety_my_actions_v1", { p_limit: 100 }),
      supabase.rpc("safety_my_reports_v1", { p_limit: 100 }),
    ]);
    setError(Boolean(a.error || r.error));
    setActions(Array.isArray(a.data) ? a.data : []);
    setReports(Array.isArray(r.data) ? r.data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsShell title="SICHERHEIT & MODERATION">
      <p className="b-muted">
        Meldungen, Maßnahmen und Entscheidungen bleiben nachvollziehbar.
        Automatische Signale sind keine endgültigen Urteile.
      </p>
      {loading ? (
        <div
          className="b-skeleton"
          style={{ height: 420, borderRadius: 22, marginTop: 24 }}
        />
      ) : error ? (
        <StateView
          title="Safety Center nicht geladen"
          message="Versuch es gleich nochmals."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : (
        <>
          <section className="b-settings-section" style={{ marginTop: 28 }}>
            <h2 className="b-section-title">Dein Kontostatus</h2>
            <p className="b-muted">
              Keine neuen Maßnahmen werden durch diese Ansicht ausgelöst.
            </p>
            <div className="b-surface" style={{ padding: 20 }}>
              {actions.length
                ? `${actions.length} bestehende Maßnahme${actions.length === 1 ? "" : "n"} oder Entscheidung${actions.length === 1 ? "" : "en"}.`
                : "Keine aktiven Maßnahmen sichtbar."}
            </div>
          </section>
          <section>
            <h2 className="b-section-title">Deine Meldungen</h2>
            {reports.length ? (
              <p className="b-muted">
                {reports.length} Meldungen sind in deinem Verlauf.
              </p>
            ) : (
              <p className="b-muted">Noch keine Meldungen in deinem Verlauf.</p>
            )}
          </section>
        </>
      )}
    </SettingsShell>
  );
}
