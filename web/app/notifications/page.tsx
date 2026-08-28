"use client";
import { useCallback, useEffect, useState } from "react";
import { StateView } from "@/components/consumer/ui";
import { supabase } from "@/lib/supabase/client";
type Notice = {
  notice_id: string;
  title: string | null;
  message: string | null;
  created_at: string;
  read_at: string | null;
};
export default function NotificationsPage() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("safety_my_notices_v1", {
      p_limit: 200,
    });
    setError(Boolean(error));
    setRows((Array.isArray(data) ? data : []) as Notice[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function read(row: Notice) {
    if (row.read_at) return;
    await supabase.rpc("safety_mark_notice_read_v1", {
      p_notice_id: row.notice_id,
    });
    setRows((items) =>
      items.map((item) =>
        item.notice_id === row.notice_id
          ? { ...item, read_at: new Date().toISOString() }
          : item,
      ),
    );
  }
  return (
    <div className="b-narrow b-main">
      <p className="b-kicker">Dein Backyrd</p>
      <h1 className="b-display b-page-title" style={{ marginTop: 10 }}>
        MITTEILUNGEN
      </h1>
      <div className="b-marker" />
      {loading ? (
        <div className="b-skeleton" style={{ height: 420, borderRadius: 22 }} />
      ) : error ? (
        <StateView
          title="Mitteilungen nicht geladen"
          message="Versuch es gleich nochmals."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => (
            <button
              type="button"
              key={row.notice_id}
              className="b-surface"
              style={{ textAlign: "left", padding: 20, color: "inherit" }}
              onClick={() => void read(row)}
            >
              <p
                className="b-kicker"
                style={{ color: row.read_at ? "var(--muted)" : "var(--pink)" }}
              >
                {row.read_at ? "Gelesen" : "Neu"}
              </p>
              <h2 className="b-card-title" style={{ marginTop: 7 }}>
                {row.title || "Backyrd Mitteilung"}
              </h2>
              <p className="b-muted">
                {row.message ||
                  "Öffne dein Safety Center für weitere Informationen."}
              </p>
              <time className="b-meta">
                {new Date(row.created_at).toLocaleString("de-CH")}
              </time>
            </button>
          ))}
        </div>
      ) : (
        <StateView
          title="Alles ruhig"
          message="Du hast keine neuen Mitteilungen."
        />
      )}
    </div>
  );
}
