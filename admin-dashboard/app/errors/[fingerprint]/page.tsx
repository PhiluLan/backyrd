"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { dateTime } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type ErrorOccurrence = {
  id: string; occurred_at: string; message: string | null; stack: string | null;
  screen_name: string | null; platform: string | null; app_version: string | null;
  user_id: string | null; handled: boolean;
};
type ErrorDetailData = {
  group: { status: string; internal_note: string | null } | null;
  occurrences: ErrorOccurrence[];
};

export default function ErrorDetail({ params }: { params: Promise<{ fingerprint: string }> }) {
  const { fingerprint } = React.use(params);
  const fp = decodeURIComponent(fingerprint);
  const [data, setData] = useState<ErrorDetailData | null>(null);
  const [status, setStatus] = useState("open");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await supabase.rpc("admin_error_detail_v1", { p_fingerprint: fp });
    if (result.error) {
      setError("Fehlerdetails konnten nicht geladen werden.");
      return;
    }
    const next = result.data as ErrorDetailData;
    setData(next);
    setStatus(next.group?.status || "open");
    setNote(next.group?.internal_note || "");
    setError("");
  }, [fp]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    setSaving(true);
    const result = await supabase.rpc("admin_update_error_group_v1", {
      p_fingerprint: fp, p_status: status, p_internal_note: note || null,
    });
    setSaving(false);
    if (result.error) {
      setError("Status oder Notiz konnten nicht gespeichert werden.");
      return;
    }
    await load();
  }

  const first = data?.occurrences?.[0];
  return <div className="bi-page">
    <Link className="bi-back" href="/errors">← Zurück zu Fehlern</Link>
    {error ? <div className="bi-error">{error}</div> : null}
    {!data && !error ? <div className="bi-state">Fehlerdetails werden geladen …</div> : null}
    {data ? <>
      <div className="bi-detailHero"><div><div className="bi-eyebrow">Fehlergruppe</div><h1>{first?.message || "Unbekannter Fehler"}</h1><p>{fp}</p></div><div className="bi-detailActions">
        <select className="bi-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Offen</option><option value="watching">Beobachten</option><option value="resolved">Gelöst</option></select>
        <button className="bi-button" onClick={() => void save()} disabled={saving}>{saving ? "Speichert …" : "Status speichern"}</button>
      </div></div>
      <div className="bi-grid2">
        <section className="bi-card bi-pad"><div className="bi-kicker">Technische Diagnose</div><h2>Letzter Stacktrace</h2><pre className="bi-code">{first?.stack || "Kein Stacktrace gespeichert."}</pre></section>
        <section className="bi-card bi-pad"><div className="bi-kicker">Einordnung</div><h2>Interne Notiz</h2><textarea className="bi-textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Analyse, Ursache oder Fix dokumentieren …"/><button className="bi-button" onClick={() => void save()} disabled={saving}>Notiz speichern</button></section>
      </div>
      <section className="bi-card bi-pad"><div className="bi-kicker">Verlauf</div><h2>Vorkommnisse</h2><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Zeit</th><th>Bereich</th><th>Plattform</th><th>Version</th><th>Nutzer</th><th>Behandelt</th></tr></thead><tbody>{data.occurrences.map((item) => <tr key={item.id}><td>{dateTime(item.occurred_at)}</td><td>{item.screen_name || "—"}</td><td>{item.platform || "—"}</td><td>{item.app_version || "—"}</td><td>{item.user_id || "anonym"}</td><td>{item.handled ? "Ja" : "Nein"}</td></tr>)}</tbody></table></div></section>
    </> : null}
  </div>;
}
