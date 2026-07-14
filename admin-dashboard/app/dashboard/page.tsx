"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Preset = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year" | "last_year";

type Overview = {
  period: { from: string; to: string; previous_from: string; previous_to: string };
  kpis: Record<string, number>;
  decision: { sessions: number; impressions: number; opens: number; likes: number; dislikes: number };
  daily: Array<{ day: string; active_users: number; reviews: number; decisions: number; screen_views: number }>;
  top_screens: Array<{ screen_name: string; views: number; users: number }>;
  top_spots: Array<{ spot_id: string; name: string; views: number; users: number }>;
  latest_errors: Array<{ id: number; message: string; severity: string; screen_name: string | null; app_version: string | null; occurred_at: string }>;
};

const presets: Array<[Preset, string]> = [
  ["today", "Heute"], ["yesterday", "Gestern"], ["week", "Diese Woche"],
  ["last_week", "Letzte Woche"], ["month", "Dieser Monat"], ["last_month", "Letzter Monat"],
  ["year", "Dieses Jahr"], ["last_year", "Letztes Jahr"],
];

function rangeFor(preset: Preset) {
  const now = new Date();
  const startDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let from: Date;
  let to: Date;

  switch (preset) {
    case "today": from = startDay(now); to = now; break;
    case "yesterday": { to = startDay(now); from = new Date(to); from.setDate(from.getDate() - 1); break; }
    case "week": { from = startDay(now); const day = (from.getDay() + 6) % 7; from.setDate(from.getDate() - day); to = now; break; }
    case "last_week": { to = startDay(now); const day = (to.getDay() + 6) % 7; to.setDate(to.getDate() - day); from = new Date(to); from.setDate(from.getDate() - 7); break; }
    case "month": from = new Date(now.getFullYear(), now.getMonth(), 1); to = now; break;
    case "last_month": from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "year": from = new Date(now.getFullYear(), 0, 1); to = now; break;
    case "last_year": from = new Date(now.getFullYear() - 1, 0, 1); to = new Date(now.getFullYear(), 0, 1); break;
  }
  return { from: from!.toISOString(), to: to!.toISOString() };
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function format(value: number, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

export default function FounderDashboardPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      const range = rangeFor(preset);
      const { data: result, error: rpcError } = await supabase.rpc("admin_founder_overview_v1", {
        p_from: range.from,
        p_to: range.to,
      });
      if (cancelled) return;
      if (rpcError) { setError(rpcError.message); setData(null); }
      else setData(result as Overview);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [preset]);

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily.map((d) => d.active_users) ?? [1])), [data]);
  const k = data?.kpis ?? {};
  const decisionCtr = data?.decision?.impressions ? (data.decision.opens / data.decision.impressions) * 100 : 0;
  const decisionPositive = data?.decision && data.decision.likes + data.decision.dislikes > 0
    ? (data.decision.likes / (data.decision.likes + data.decision.dislikes)) * 100 : 0;

  return (
    <div className="bi-page">
      <header className="bi-header">
        <div>
          <div className="bi-eyebrow">Founder cockpit</div>
          <h1>Backyrd Intelligence</h1>
          <p>Was heute wichtig ist — Wachstum, Produkt, Community und Systemzustand.</p>
        </div>
        <div className="bi-periods">
          {presets.map(([value, label]) => (
            <button key={value} className={preset === value ? "active" : ""} onClick={() => setPreset(value)}>{label}</button>
          ))}
        </div>
      </header>

      {loading ? <div className="bi-state">Daten werden verdichtet …</div> : null}
      {error ? <div className="bi-error">Migration/RPC fehlt oder ist nicht erreichbar: {error}</div> : null}

      {data ? <>
        <section className="bi-briefing">
          <div>
            <span className="bi-kicker">Daily briefing</span>
            <h2>{k.active_users > 0 ? `${format(k.active_users)} aktive Nutzer im Zeitraum.` : "Noch keine messbare Aktivität im Zeitraum."}</h2>
            <p>{k.reviews > 0 ? `${format(k.reviews)} Reviews wurden erstellt.` : "Noch keine neuen Reviews."} {data.decision.sessions > 0 ? `${format(data.decision.sessions)} Decisions wurden gestartet.` : ""}</p>
          </div>
          <div className="bi-briefingSignal"><span /> Intelligence online</div>
        </section>

        <section className="bi-kpiGrid">
          <Kpi label="Registrierungen" value={format(k.signups)} delta={change(k.signups, k.signups_previous)} />
          <Kpi label="Aktivierte Nutzer" value={format(k.activated_users)} delta={change(k.activated_users, k.activated_users_previous)} />
          <Kpi label="Aktive Nutzer" value={format(k.active_users)} delta={change(k.active_users, k.active_users_previous)} />
          <Kpi label="DAU / MAU" value={format(k.stickiness, "%")} hint={`${format(k.dau)} / ${format(k.mau)}`} />
          <Kpi label="Reviews" value={format(k.reviews)} delta={change(k.reviews, k.reviews_previous)} />
          <Kpi label="Reviews / User" value={format(k.reviews_per_active_user)} />
          <Kpi label="Partner-Spots" value={format(k.partner_spots)} hint={`${format(k.pending_claims)} offene Claims`} />
          <Kpi label="App Errors" value={format(k.errors)} tone={k.errors > 0 ? "danger" : "normal"} />
        </section>

        <section className="bi-gridTwo">
          <article className="bi-card bi-chartCard">
            <div className="bi-cardHead"><div><span className="bi-kicker">Engagement</span><h3>Aktive Nutzer</h3></div></div>
            <div className="bi-bars">
              {data.daily.map((d) => <div key={d.day} className="bi-barCol" title={`${d.day}: ${d.active_users}`}>
                <div className="bi-bar" style={{ height: `${Math.max(4, (d.active_users / maxDaily) * 100)}%` }} />
                <span>{new Date(d.day).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })}</span>
              </div>)}
            </div>
          </article>

          <article className="bi-card">
            <div className="bi-cardHead"><div><span className="bi-kicker">Decision</span><h3>Recommendation Funnel</h3></div></div>
            <Funnel label="Sessions" value={data.decision.sessions} base={data.decision.sessions} />
            <Funnel label="Impressions" value={data.decision.impressions} base={data.decision.impressions} />
            <Funnel label="Spot Opens" value={data.decision.opens} base={data.decision.impressions} />
            <Funnel label="Likes" value={data.decision.likes} base={data.decision.likes + data.decision.dislikes} />
            <div className="bi-miniStats"><span>CTR <b>{format(decisionCtr, "%")}</b></span><span>Positive Rate <b>{format(decisionPositive, "%")}</b></span></div>
          </article>
        </section>

        <section className="bi-gridThree">
          <Ranking title="Top Screens" empty="Screen Tracking startet mit dem neuen Analytics Client." rows={data.top_screens.map((x) => ({ title: x.screen_name, value: x.views, detail: `${x.users} Nutzer` }))} />
          <Ranking title="Top Spots" empty="Spot-Aufrufe werden künftig zentral getrackt." rows={data.top_spots.map((x) => ({ title: x.name || "Unbekannter Spot", value: x.views, detail: `${x.users} Nutzer` }))} />
          <article className="bi-card">
            <div className="bi-cardHead"><div><span className="bi-kicker">Health</span><h3>Neueste Fehler</h3></div></div>
            {data.latest_errors.length === 0 ? <Empty text="Keine Fehler im Zeitraum." /> : data.latest_errors.map((e) => <div className="bi-rowItem" key={e.id}><div><strong>{e.message}</strong><small>{e.screen_name || "Unbekannter Screen"} · {e.app_version || "Version unbekannt"}</small></div><span className={`bi-severity ${e.severity}`}>{e.severity}</span></div>)}
          </article>
        </section>
      </> : null}
    </div>
  );
}

function Kpi({ label, value, delta, hint, tone = "normal" }: { label: string; value: string; delta?: number; hint?: string; tone?: "normal" | "danger" }) {
  return <article className={`bi-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><div>{delta !== undefined ? <em className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "↗" : "↘"} {Math.abs(delta).toFixed(1)}%</em> : null}{hint ? <small>{hint}</small> : null}</div></article>;
}
function Funnel({ label, value, base }: { label: string; value: number; base: number }) {
  const pct = base > 0 ? Math.min(100, (value / base) * 100) : 0;
  return <div className="bi-funnel"><div><span>{label}</span><b>{value}</b></div><div className="bi-track"><i style={{ width: `${pct}%` }} /></div></div>;
}
function Ranking({ title, rows, empty }: { title: string; rows: Array<{ title: string; value: number; detail: string }>; empty: string }) {
  return <article className="bi-card"><div className="bi-cardHead"><div><span className="bi-kicker">Performance</span><h3>{title}</h3></div></div>{rows.length === 0 ? <Empty text={empty} /> : rows.map((r, i) => <div className="bi-rowItem" key={`${r.title}-${i}`}><div><strong>{i + 1}. {r.title}</strong><small>{r.detail}</small></div><b>{r.value}</b></div>)}</article>;
}
function Empty({ text }: { text: string }) { return <div className="bi-empty">{text}</div>; }
