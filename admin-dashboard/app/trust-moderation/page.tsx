"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Status = "pending" | "flagged" | "approved" | "reverted";
type Row = {
  event_id: string;
  spot_id: string;
  spot_name: string;
  changed_by: string;
  changed_by_name: string;
  change_area: string;
  change_source: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  moderation_status: Status;
  risk_flags: string[];
  validation_warnings: string[];
  moderation_note: string | null;
  created_at: string;
};

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function TrustModerationPage() {
  const [status, setStatus] = useState<Status | "all">("flagged");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.rpc(
      "admin_get_spot_owner_moderation_queue_v2",
      { p_status: status === "all" ? null : status, p_limit: 250 },
    );
    if (error) {
      setRows([]);
      setError("Die Moderationswarteschlange konnte nicht geladen werden.");
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => { const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer); }, [status]);

  async function decide(eventId: string, decision: "approved" | "flagged" | "reverted") {
    const note = decision === "reverted"
      ? window.prompt("Warum wird die Änderung zurückgenommen?") ?? ""
      : "";
    if (decision === "reverted" && !note.trim()) return;

    setSaving(eventId);
    setError("");
    const { error } = await supabase.rpc("admin_review_spot_owner_change_v1", {
      p_event_id: eventId,
      p_decision: decision,
      p_note: note || null,
    });
    setSaving(null);
    if (error) setError("Die Moderationsentscheidung konnte nicht gespeichert werden.");
    else await load();
  }

  const flagged = useMemo(
    () => rows.filter((row) => row.moderation_status === "flagged").length,
    [rows],
  );

  return (
    <div className="by-page">
      <div className="by-header">
        <div>
          <h1 className="by-title">Trust & Moderation</h1>
          <div className="by-subtitle">
            Live gegangene Owner-Änderungen prüfen und bei Bedarf zurücksetzen.
          </div>
        </div>
        <button className="by-btn by-btn-soft" onClick={() => void load()}>
          Neu laden
        </button>
      </div>

      <div className="by-card by-section">
        <div className="by-toolbar">
          <select
            className="by-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as Status | "all")}
          >
            <option value="flagged">Automatisch markiert</option>
            <option value="pending">Noch ungeprüft</option>
            <option value="approved">Bestätigt</option>
            <option value="reverted">Zurückgesetzt</option>
            <option value="all">Alle Änderungen</option>
          </select>
          <div className="by-muted by-small">
            {rows.length} Änderungen · {flagged} markiert
          </div>
        </div>
      </div>

      {error ? <div className="by-card by-section" style={{ color: "#ef4444" }}>{error}</div> : null}
      {loading ? <div className="by-card by-section">Lade Änderungen…</div> : null}

      {!loading && rows.map((row) => (
        <article key={row.event_id} className="by-card by-section">
          <div className="by-row" style={{ alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: 18 }}>{row.spot_name}</div>
              <div className="by-muted by-small" style={{ marginTop: 5 }}>
                {row.changed_by_name} · {row.change_area} · {row.change_source} ·{" "}
                {new Date(row.created_at).toLocaleString("de-CH")}
              </div>
            </div>
            <span className={`by-badge ${
              row.moderation_status === "flagged"
                ? "by-badge-red"
                : row.moderation_status === "approved"
                  ? "by-badge-green"
                  : "by-badge-yellow"
            }`}>
              {row.moderation_status}
            </span>
          </div>

          {(row.risk_flags?.length || row.validation_warnings?.length) ? (
            <div className="by-actions" style={{ marginTop: 14 }}>
              {row.risk_flags?.map((flag) => (
                <span className="by-badge by-badge-red" key={flag}>{flag}</span>
              ))}
              {row.validation_warnings?.map((warning) => (
                <span className="by-badge by-badge-yellow" key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
            marginTop: 16,
          }}>
            <div className="by-panel">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Vorher</div>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>
                {pretty(row.old_data)}
              </pre>
            </div>
            <div className="by-panel">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Nachher – aktuell live</div>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>
                {pretty(row.new_data)}
              </pre>
            </div>
          </div>

          <div className="by-actions" style={{ marginTop: 16 }}>
            <button
              className="by-btn by-btn-blue"
              disabled={saving === row.event_id}
              onClick={() => void decide(row.event_id, "approved")}
            >
              Bestätigen
            </button>
            <button
              className="by-btn by-btn-soft"
              disabled={saving === row.event_id}
              onClick={() => void decide(row.event_id, "flagged")}
            >
              Markieren
            </button>
            <button
              className="by-btn"
              disabled={saving === row.event_id}
              onClick={() => void decide(row.event_id, "reverted")}
              style={{ background: "#7f1d1d", color: "white" }}
            >
              Änderung zurücksetzen
            </button>
          </div>
        </article>
      ))}

      {!loading && rows.length === 0 ? (
        <div className="by-card by-section by-muted">Keine Änderungen für diesen Filter.</div>
      ) : null}
    </div>
  );
}
