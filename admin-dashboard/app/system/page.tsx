"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { dateTime, number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type Summary = {
  events: number;
  sessions: number;
  active_users: number;
  errors: number;
  error_rate: number;
  installations: number;
  last_event_at: string | null;
  last_session_at: string | null;
  last_error_at: string | null;
};
type Daily = { metric_day: string; events: number; users: number; sessions: number; errors: number };
type Version = { app_version: string; events: number; users: number; last_seen: string | null };
type Platform = { platform: string; events: number; users: number; installations: number };
type TopEvent = { event_name: string; occurrences: number; users: number };
type RecentError = { id: number; fingerprint: string | null; error_type: string; message: string; severity: string; screen_name: string | null; platform: string | null; app_version: string | null; handled: boolean; occurred_at: string };
type TableHealth = { table_name: string; row_count: number; size_bytes: number };
type Insight = { sort_order: number; tone: "good" | "info" | "warning" | "critical"; title: string; body: string };
type Data = { generated_at: string; summary: Summary; daily: Daily[]; versions: Version[]; platforms: Platform[]; top_events: TopEvent[]; recent_errors: RecentError[]; tables: TableHealth[]; insights: Insight[] };

export default function SystemPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const r = rangeFor(preset);
      const { data: response, error: rpcError } = await supabase.rpc("admin_system_intelligence_v1", { p_from: r.from, p_to: r.to });
      if (cancelled) return;
      if (rpcError) { setError(rpcError.message); setData(null); }
      else setData(response as Data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [preset]);

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily ?? []).map(x => Number(x.events || 0))), [data]);
  const totalSize = useMemo(() => (data?.tables ?? []).reduce((sum, row) => sum + Number(row.size_bytes || 0), 0), [data]);

  return <div className="bi-page">
    <header className="bi-header">
      <div><div className="bi-eyebrow">Operations intelligence</div><h1>System</h1><p>Datenpipeline, App-Versionen, Fehlerquote und Gesundheit deiner Intelligence-Infrastruktur.</p></div>
      <DateRangeSelector value={preset} onChange={setPreset} />
    </header>

    {error && <div className="bi-error">{error}</div>}
    {loading && <div className="bi-state">Systemzustand wird geprüft …</div>}

    {data && <>
      <section className="bi-systemBrief">
        <div><div className="bi-kicker">Daily Intelligence Briefing</div><h2>{briefingTitle(data.summary)}</h2><p>Stand {dateTime(data.generated_at)} · Zeitraumdaten werden live aus Supabase berechnet.</p></div>
        <div className={`bi-healthPill ${healthTone(data.summary)}`}><span />{healthLabel(data.summary)}</div>
      </section>

      <section className="bi-insightGrid">
        {data.insights.map((item) => <article key={item.sort_order} className={`bi-insightCard ${item.tone}`}><div className="bi-insightIcon">{iconFor(item.tone)}</div><div><strong>{item.title}</strong><p>{item.body}</p></div></article>)}
      </section>

      <section className="bi-kpiGrid bi-systemKpis">
        <Metric label="Events" value={data.summary.events} meta={`Letztes: ${dateTime(data.summary.last_event_at)}`} />
        <Metric label="Sessions" value={data.summary.sessions} meta={`Letzte: ${dateTime(data.summary.last_session_at)}`} />
        <Metric label="Aktive Nutzer" value={data.summary.active_users} meta="Identifizierte Nutzer" />
        <Metric label="Installationen" value={data.summary.installations} meta="Registrierte Geräte" />
        <Metric label="Errors" value={data.summary.errors} meta={`Letzter: ${dateTime(data.summary.last_error_at)}`} />
        <Metric label="Error Rate" value={`${number(data.summary.error_rate, 2)}%`} meta="Fehler je 100 Sessions" />
        <Metric label="DB-Größe" value={formatBytes(totalSize)} meta="Relevante Tabellen" />
        <Metric label="App-Versionen" value={data.versions.length} meta="Im Zeitraum aktiv" />
      </section>

      <div className="bi-grid2">
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Ingestion</div><h2>Events pro Tag</h2></div></div><div className="bi-systemChart">{data.daily.map(row => <div className="bi-systemBarCol" key={row.metric_day}><div className="bi-systemBarTrack"><div className="bi-systemBar" style={{height:`${Math.max(3, row.events/maxDaily*100)}%`}} /></div><strong>{number(row.events)}</strong><span>{new Date(`${row.metric_day}T00:00:00`).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit"})}</span></div>)}</div></section>
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Platforms</div><h2>Geräte-Mix</h2></div></div><div className="bi-list">{data.platforms.map(p => <div className="bi-listRow" key={p.platform}><div><strong>{p.platform}</strong><small>{number(p.users)} Nutzer · {number(p.installations)} Installationen</small></div><span>{number(p.events)} Events</span></div>)}</div>{!data.platforms.length&&<div className="bi-emptyInline">Noch keine Plattformdaten.</div>}</section>
      </div>

      <div className="bi-grid2">
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Release health</div><h2>App-Versionen</h2></div></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Version</th><th>Events</th><th>Nutzer</th><th>Zuletzt aktiv</th></tr></thead><tbody>{data.versions.map(v => <tr key={v.app_version}><td><strong>{v.app_version}</strong></td><td>{number(v.events)}</td><td>{number(v.users)}</td><td>{dateTime(v.last_seen)}</td></tr>)}</tbody></table></div></section>
        <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Event taxonomy</div><h2>Top Events</h2></div></div><div className="bi-list">{data.top_events.map(e => <div className="bi-listRow" key={e.event_name}><div><strong>{e.event_name}</strong><small>{number(e.users)} Nutzer</small></div><span>{number(e.occurrences)}</span></div>)}</div></section>
      </div>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Storage</div><h2>Tabellenzustand</h2></div><span>{formatBytes(totalSize)} gesamt</span></div><div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Tabelle</th><th>Zeilen</th><th>Größe</th><th>Anteil</th></tr></thead><tbody>{data.tables.map(t => <tr key={t.table_name}><td><strong>{t.table_name}</strong></td><td>{number(t.row_count)}</td><td>{formatBytes(t.size_bytes)}</td><td><div className="bi-sizeTrack"><span style={{width:`${totalSize?Math.max(2,t.size_bytes/totalSize*100):0}%`}} /></div></td></tr>)}</tbody></table></div></section>

      <section className="bi-card bi-pad"><div className="bi-sectionHead"><div><div className="bi-kicker">Recent failures</div><h2>Neueste Fehler</h2></div><Link href="/errors">Alle Fehler →</Link></div>{data.recent_errors.length?<div className="bi-tableWrap"><table className="bi-table"><thead><tr><th>Zeit</th><th>Fehler</th><th>Screen</th><th>Version</th><th>Severity</th></tr></thead><tbody>{data.recent_errors.map(e => <tr key={e.id}><td>{dateTime(e.occurred_at)}</td><td><strong>{e.message}</strong><small>{e.error_type}</small></td><td>{e.screen_name||"—"}</td><td>{e.app_version||"—"}</td><td><span className={`bi-severity ${e.severity}`}>{e.severity}</span></td></tr>)}</tbody></table></div>:<div className="bi-emptyInline">Keine Fehler im gewählten Zeitraum. Sehr gut.</div>}</section>
    </>}
  </div>;
}

function Metric({label,value,meta}:{label:string;value:string|number;meta:string}){return <div className="bi-kpi"><span>{label}</span><strong>{typeof value==="number"?number(value):value}</strong><div>{meta}</div></div>}
function formatBytes(value:number){if(!value)return"0 B";const units=["B","KB","MB","GB","TB"];const i=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);return `${number(value/1024**i,1)} ${units[i]}`}
function healthTone(s:Summary){if(!s.last_event_at)return"critical";if(Date.now()-new Date(s.last_event_at).getTime()>86400000||s.error_rate>=10)return"critical";if(s.error_rate>=3)return"warning";return"good"}
function healthLabel(s:Summary){const t=healthTone(s);return t==="good"?"System gesund":t==="warning"?"Beobachten":"Handlungsbedarf"}
function briefingTitle(s:Summary){if(!s.last_event_at)return"Backyrd sendet aktuell keine Analytics-Daten.";if(s.error_rate>=10)return"Die Fehlerquote braucht heute deine Aufmerksamkeit.";if(s.sessions===0)return"Noch keine Sessions in diesem Zeitraum.";return `${number(s.sessions)} Sessions und ${number(s.events)} Events – die Pipeline läuft.`}
function iconFor(t:Insight["tone"]){return t==="good"?"✓":t==="critical"?"!":t==="warning"?"△":"i"}
