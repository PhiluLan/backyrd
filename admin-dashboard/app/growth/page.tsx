"use client";

import { useEffect, useMemo, useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";

type Summary = {
  registrations: number;
  activated: number;
  active_users: number;
  returning_users: number;
  new_active_users: number;
  activation_rate: number;
  median_time_to_value_minutes: number;
  d1_retention: number;
  d7_retention: number;
  d30_retention: number;
};

type Daily = {
  metric_date: string;
  registrations: number;
  activations: number;
  active_users: number;
  reviews: number;
  decisions: number;
};

type Cohort = {
  cohort_week: string;
  cohort_size: number;
  activated: number;
  d1_retained: number;
  d7_retained: number;
  d30_retained: number;
};

type FunnelStep = { step_order: number; step_name: string; users: number };
type Acquisition = { source: string; users: number };
type GrowthData = { summary: Summary; daily: Daily[]; cohorts: Cohort[]; funnel: FunnelStep[]; acquisition: Acquisition[] };

const pct = (value: number) => `${number(value, 1)}%`;
const ratio = (value: number, total: number) => (total > 0 ? `${number((value * 100) / total, 1)}%` : "0%");

export default function GrowthPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const range = rangeFor(preset);
      const { data: result, error: rpcError } = await supabase.rpc("admin_growth_intelligence_v1", {
        p_from: range.from,
        p_to: range.to,
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setData(null);
      } else {
        setData(result as GrowthData);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [preset]);

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily ?? []).map((x) => Math.max(x.active_users, x.registrations, x.activations))), [data]);
  const funnelMax = data?.funnel?.[0]?.users || 1;

  return (
    <div className="bi-page">
      <header className="bi-header">
        <div>
          <div className="bi-eyebrow">Growth intelligence</div>
          <h1>Growth & Retention</h1>
          <p>Von Registrierung bis Gewohnheit: Aktivierung, Rückkehr und Time-to-First-Value.</p>
        </div>
        <DateRangeSelector value={preset} onChange={setPreset} />
      </header>

      {error && <div className="bi-error">{error}</div>}
      {loading && <div className="bi-state">Growth-Daten werden berechnet …</div>}

      {data && (
        <>
          <section className="bi-kpiGrid bi-kpiGridGrowth">
            <Metric label="Registrierungen" value={data.summary.registrations} />
            <Metric label="Aktiviert" value={data.summary.activated} detail={`${pct(data.summary.activation_rate)} Activation Rate`} />
            <Metric label="Aktive Nutzer" value={data.summary.active_users} detail={`${number(data.summary.returning_users)} returning`} />
            <Metric label="Time to Value" value={`${number(data.summary.median_time_to_value_minutes, 1)} min`} detail="Median" />
            <Metric label="D1 Retention" value={pct(data.summary.d1_retention)} />
            <Metric label="D7 Retention" value={pct(data.summary.d7_retention)} />
            <Metric label="D30 Retention" value={pct(data.summary.d30_retention)} />
            <Metric label="Neue aktive Nutzer" value={data.summary.new_active_users} />
          </section>

          <section className="bi-card bi-pad">
            <div className="bi-sectionHead">
              <div><div className="bi-kicker">Momentum</div><h2>Wachstum im Zeitverlauf</h2></div>
              <div className="bi-chartLegend"><span className="is-pink" />Aktiv<span className="is-cream" />Registriert<span className="is-green" />Aktiviert</div>
            </div>
            <div className="bi-growthChart">
              {data.daily.map((day) => (
                <div className="bi-growthDay" key={day.metric_date} title={`${day.metric_date}: ${day.active_users} aktiv`}>
                  <div className="bi-growthBars">
                    <i className="active" style={{ height: `${Math.max(4, day.active_users / maxDaily * 100)}%` }} />
                    <i className="registered" style={{ height: `${Math.max(2, day.registrations / maxDaily * 100)}%` }} />
                    <i className="activated" style={{ height: `${Math.max(2, day.activations / maxDaily * 100)}%` }} />
                  </div>
                  <small>{new Date(`${day.metric_date}T12:00:00`).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })}</small>
                </div>
              ))}
            </div>
          </section>

          <div className="bi-grid2">
            <section className="bi-card bi-pad">
              <div className="bi-sectionHead"><div><div className="bi-kicker">Activation</div><h2>Lifecycle Funnel</h2></div></div>
              <div className="bi-funnelList">
                {data.funnel.map((step) => (
                  <div className="bi-funnelStep" key={step.step_order}>
                    <div><strong>{step.step_name}</strong><span>{number(step.users)} Nutzer · {ratio(step.users, funnelMax)}</span></div>
                    <div className="bi-funnelTrack"><i style={{ width: `${Math.max(2, step.users / funnelMax * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bi-card bi-pad">
              <div className="bi-sectionHead"><div><div className="bi-kicker">Acquisition</div><h2>Quellen</h2></div></div>
              {data.acquisition.length ? <div className="bi-list">
                {data.acquisition.map((item, index) => <div className="bi-listRow" key={`${item.source}-${index}`}><div><strong>{index + 1}. {item.source}</strong><small>Aktive Nutzer im Zeitraum</small></div><b>{number(item.users)}</b></div>)}
              </div> : <div className="bi-emptyInline">Noch keine Source-Parameter vorhanden. Direkte App-Nutzung wird als unbekannt gebündelt.</div>}
            </section>
          </div>

          <section className="bi-card bi-pad">
            <div className="bi-sectionHead"><div><div className="bi-kicker">Retention</div><h2>Wöchentliche Kohorten</h2></div></div>
            <div className="bi-tableWrap">
              <table className="bi-table bi-cohortTable">
                <thead><tr><th>Kohorte</th><th>Nutzer</th><th>Aktiviert</th><th>D1</th><th>D7</th><th>D30</th></tr></thead>
                <tbody>{data.cohorts.map((cohort) => (
                  <tr key={cohort.cohort_week}>
                    <td><strong>Woche {new Date(`${cohort.cohort_week}T12:00:00`).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}</strong></td>
                    <td>{number(cohort.cohort_size)}</td>
                    <CohortCell value={cohort.activated} total={cohort.cohort_size} />
                    <CohortCell value={cohort.d1_retained} total={cohort.cohort_size} />
                    <CohortCell value={cohort.d7_retained} total={cohort.cohort_size} />
                    <CohortCell value={cohort.d30_retained} total={cohort.cohort_size} />
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {!data.cohorts.length && <div className="bi-emptyInline">Für diesen Zeitraum gibt es noch keine Registrierungs-Kohorten.</div>}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="bi-kpi"><span>{label}</span><strong>{typeof value === "number" ? number(value) : value}</strong><div>{detail || ""}</div></div>;
}

function CohortCell({ value, total }: { value: number; total: number }) {
  const percentage = total ? (value * 100) / total : 0;
  return <td><div className="bi-cohortCell" style={{ "--retention": `${Math.max(0.06, percentage / 100)}` } as React.CSSProperties}><strong>{number(percentage, 1)}%</strong><small>{number(value)}</small></div></td>;
}
