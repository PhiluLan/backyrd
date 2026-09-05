"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Boundary = { operation: string; scope: string; requestCount: number; blockedCount: number; lastRequestAt: string };
type Snapshot = {
  generatedAt: string;
  database: { sizeBytes: number; connectionsUsed: number; connectionsActive: number; connectionLimit: number; ungrantedLocks: number };
  storage: { objectCount: number; bytes: number };
  backgroundJobs: { active: number; failed24h: number };
  providerBoundaries: Boundary[];
  queues: { embeddingFailed: number; safetyTextFailed: number; safetyImageFailed: number };
  recovery: { databaseDailyBackup: string; pointInTimeRecovery: string; storageObjectBackup: string };
};

export default function FounderOperationsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getSession();
    const token = auth.session?.access_token;
    if (!token) { setError("Deine Admin-Sitzung ist abgelaufen."); setLoading(false); return; }
    const response = await fetch("/api/admin/operations", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) setError(payload?.error ?? "Betriebszustand nicht verfügbar.");
    else setData(payload as Snapshot);
    setLoading(false);
  }, []);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const connectionPct = data ? Math.round(data.database.connectionsUsed / Math.max(1, data.database.connectionLimit) * 100) : 0;
  const queueFailures = data ? data.queues.embeddingFailed + data.queues.safetyTextFailed + data.queues.safetyImageFailed : 0;
  const critical = Boolean(data && (connectionPct >= 80 || data.database.ungrantedLocks > 0 || data.backgroundJobs.failed24h > 0));
  const warnings = useMemo(() => data?.providerBoundaries.filter(row => row.blockedCount > 0) ?? [], [data]);

  return <div className="bi-page">
    <header className="bi-header"><div><div className="bi-eyebrow">Launch operations</div><h1>Betriebsstatus</h1><p>Live-Gesundheit, Kostenbremsen und Recovery-Bereitschaft für den Basel-Testlaunch.</p></div><button className="bi-button" onClick={() => void load()} disabled={loading}>{loading ? "Prüft …" : "Jetzt prüfen"}</button></header>
    {error && <div className="bi-error">{error}</div>}
    {loading && !data && <div className="bi-state">Production wird geprüft …</div>}
    {data && <>
      <section className="bi-systemBrief"><div><div className="bi-kicker">Production health</div><h2>{critical ? "Handlungsbedarf" : warnings.length ? "Stabil, Limits beobachten" : "Launch-Systeme stabil"}</h2><p>Stand {new Date(data.generatedAt).toLocaleString("de-CH")}</p></div><div className={`bi-healthPill ${critical ? "critical" : warnings.length ? "warning" : "good"}`}><span />{critical ? "Kritisch" : "Betriebsbereit"}</div></section>
      <section className="bi-kpiGrid bi-systemKpis">
        <Metric label="DB-Verbindungen" value={`${data.database.connectionsUsed}/${data.database.connectionLimit}`} meta={`${data.database.connectionsActive} aktiv · ${connectionPct}% belegt`} />
        <Metric label="Wartende Locks" value={data.database.ungrantedLocks} meta="Ziel: 0" />
        <Metric label="Job-Fehler 24h" value={data.backgroundJobs.failed24h} meta={`${data.backgroundJobs.active} aktive Zeitpläne`} />
        <Metric label="Queue-Fehler" value={queueFailures} meta="Embedding + Safety" />
        <Metric label="Storage" value={formatBytes(data.storage.bytes)} meta={`${data.storage.objectCount} Objekte`} />
        <Metric label="Kostenlimits aktiv" value={new Set(data.providerBoundaries.map(row => row.operation)).size} meta={`${warnings.length} mit Blockierungen`} />
      </section>
      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Variable Providerkosten</div><h2>Serverseitige Circuit Breaker</h2></div></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Pfad</th><th>Fenster</th><th>Akzeptiert</th><th>Blockiert</th><th>Zuletzt</th></tr></thead><tbody>{data.providerBoundaries.map(row => <tr key={`${row.operation}-${row.scope}`}><td><strong>{label(row.operation)}</strong></td><td>{scope(row.scope)}</td><td>{row.requestCount}</td><td><span className={`bi-badge ${row.blockedCount ? "warning" : "success"}`}>{row.blockedCount}</span></td><td>{new Date(row.lastRequestAt).toLocaleString("de-CH")}</td></tr>)}</tbody></table></div>{!data.providerBoundaries.length && <div className="bi-emptyInline">Noch keine kostenrelevanten Aufrufe seit Aktivierung.</div>}</section>
      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Recovery</div><h2>Wiederherstellungsstatus</h2></div></div><div className="bi-list"><Status name="Datenbank" value="Tägliches Provider-Backup · 7 Tage" good/><Status name="PITR" value="Nicht aktiviert · RPO bis 24 Stunden"/><Status name="Storage-Objekte" value="Restore getestet · dauerhafter externer Backup-Ort noch offen"/></div></section>
      <section id="runbook" className="bi-card bi-pad"><div className="bi-kicker">Erster Schritt bei Alarm</div><h2>Schreibzugriffe stoppen, Zustand sichern, dann Ursache eingrenzen.</h2><p>Bei DB ≥80%, wartenden Locks, Job-Fehlern oder wiederholten Provider-Blockierungen keine hektische Production-Änderung durchführen. Betroffenen Pfad begrenzen, Deployment-Audit und Systemstatus sichern und den dokumentierten Recovery-/Rollback-Pfad verwenden.</p></section>
    </>}
  </div>;
}

function Metric({label,value,meta}:{label:string;value:string|number;meta:string}) { return <div className="bi-kpi"><span>{label}</span><strong>{value}</strong><div>{meta}</div></div>; }
function Status({name,value,good=false}:{name:string;value:string;good?:boolean}) { return <div className="bi-listRow"><div><strong>{name}</strong><small>{value}</small></div><span className={`bi-badge ${good ? "success" : "warning"}`}>{good ? "Verifiziert" : "Offen"}</span></div>; }
function formatBytes(value:number) { const units=["B","KB","MB","GB"]; if(!value)return"0 B"; const i=Math.min(Math.floor(Math.log(value)/Math.log(1024)),3); return `${(value/1024**i).toFixed(1)} ${units[i]}`; }
function label(value:string) { return value === "decision_v13" ? "Decision" : value === "google_place_photo" ? "Google Spot-Fotos" : value === "safety_evaluate" ? "Safety-Auswertung" : value; }
function scope(value:string) { return value === "global_minute" ? "Global / Minute" : value === "global_day" ? "Global / Tag" : value; }
