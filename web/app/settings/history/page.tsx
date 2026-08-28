"use client";
import { useCallback, useEffect, useState } from "react";
import { SettingsShell } from "@/components/consumer/settings-shell";
import { StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type History = {
  event_id: string;
  purpose_title: string | null;
  event_type: string;
  source: string;
  occurred_at: string;
};
type Doc = {
  document_id: string;
  title: string;
  version: string;
  summary: string | null;
  accepted: boolean;
  accepted_at: string | null;
  content_markdown: string;
};
export default function HistoryPage() {
  const [history, setHistory] = useState<History[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const [h, d] = await Promise.all([
      supabase.rpc("get_my_consent_history_v1", { p_limit: 100 }),
      supabase.rpc("get_my_legal_documents_overview_v1", { p_locale: "de-CH" }),
    ]);
    setError(Boolean(h.error || d.error));
    setHistory((Array.isArray(h.data) ? h.data : []) as History[]);
    setDocs((Array.isArray(d.data) ? d.data : []) as Doc[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsShell title="VERLAUF & DOKUMENTE" kicker="NACHVOLLZIEHBAR">
      {loading ? (
        <div className="b-skeleton" style={{ height: 460, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Verlauf nicht geladen"
          message="Versuch es gleich nochmals."
        />
      ) : (
        <>
          <section className="b-settings-section">
            <h2 className="b-section-title">Rechtsdokumente</h2>
            {docs.length ? (
              docs.map((doc) => (
                <details
                  key={doc.document_id}
                  className="b-surface"
                  style={{ padding: 18, marginTop: 10 }}
                >
                  <summary style={{ cursor: "pointer", fontWeight: 750 }}>
                    {doc.title} · Version {doc.version}
                  </summary>
                  <p className="b-meta">
                    {doc.accepted
                      ? `Bestätigt${doc.accepted_at ? ` am ${new Date(doc.accepted_at).toLocaleDateString("de-CH")}` : ""}`
                      : "Noch nicht bestätigt"}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
                    {doc.content_markdown}
                  </p>
                </details>
              ))
            ) : (
              <p className="b-muted">Keine Dokumente verfügbar.</p>
            )}
          </section>
          <section>
            <h2 className="b-section-title">Einwilligungsverlauf</h2>
            {history.length ? (
              history.map((row) => (
                <div key={row.event_id} className="b-setting-row">
                  <span>
                    <strong>
                      {row.purpose_title || "Datenschutzentscheidung"}
                    </strong>
                    <span
                      className="b-meta"
                      style={{ display: "block", marginTop: 4 }}
                    >
                      {row.event_type} · {row.source}
                    </span>
                  </span>
                  <time className="b-meta">
                    {new Date(row.occurred_at).toLocaleDateString("de-CH")}
                  </time>
                </div>
              ))
            ) : (
              <p className="b-muted">Noch keine Einwilligungsereignisse.</p>
            )}
          </section>
        </>
      )}
    </SettingsShell>
  );
}
