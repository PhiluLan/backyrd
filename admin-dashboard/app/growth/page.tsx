"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import { supabase } from "@/lib/supabaseClient";
import "./growth.css";

const REFRESH_MS = 30_000;

type Summary = {
  registrations: number; measurableRegistrations: number; activated: number; activationRate: number | null;
  measuredActiveUsers: number; returningUsers: number; successfulDecisions: number; decisionUsers: number;
  candidateOpens: number; medianTimeToValueMinutes: number | null;
  d1Retention: number | null; d1Eligible: number; d7Retention: number | null; d7Eligible: number;
  d30Retention: number | null; d30Eligible: number;
};

type GrowthData = {
  contractVersion: "backyrd.admin-growth-intelligence@2.0"; generatedAt: string; freshForSeconds: number;
  range: { from: string; to: string };
  product: { effectiveState: "ON" | "OFF"; engine: string; route: string; singleRoute: boolean; legacyFallback: boolean; successfulDecisions24h: number; activeDecisionUsers24h: number; lastSuccessfulDecisionAt: string | null; errorTelemetryStatus: string };
  summary: Summary;
  coverage: { registeredUsers: number; analyticsConsentedUsers: number; analyticsConsentPercent: number; decisionSuccessSource: string; candidateOpenSource: string; historicalCompleteness: string };
  daily: Array<{ metric_date: string; registrations: number; measured_active_users: number; successful_decisions: number; candidate_opens: number }>;
  funnel: Array<{ step_order: number; step_name: string; users: number; coverage: string }>;
  cohorts: Array<{ cohort_week: string; cohort_size: number; measurable_users: number; activated: number; d1_eligible: number; d1_retained: number; d7_eligible: number; d7_retained: number; d30_eligible: number; d30_retained: number }>;
  acquisition: Array<{ source: string; users: number }>;
  definitions: Array<{ key: string; label: string; definition: string }>;
  limitations: string[];
  privacy: { aggregateOnly: boolean; rawDecisionTextIncluded: boolean; userIdentityIncluded: boolean; serviceCredentialsIncluded: boolean; adminAuthorityRequired: boolean };
};

export default function GrowthPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [data, setData] = useState<GrowthData | null>(null);
  const [previous, setPrevious] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const range = rangeFor(preset);
    const before = previousRange(range);
    const [currentResult, previousResult] = await Promise.all([
      supabase.rpc("admin_growth_intelligence_v2", { p_from: range.from, p_to: range.to }),
      supabase.rpc("admin_growth_intelligence_v2", { p_from: before.from, p_to: before.to }),
    ]);
    if (currentResult.error || !isGrowthData(currentResult.data)) {
      console.error("Growth intelligence could not be loaded", currentResult.error);
      setError("Die Live-Wachstumsdaten konnten gerade nicht sicher geladen werden. Bestehende Werte werden nicht als aktuell ausgegeben.");
    } else {
      setData(currentResult.data);
      setPrevious(isGrowthData(previousResult.data) ? previousResult.data : null);
      setError("");
    }
    setCheckedAt(Date.now());
    setLoading(false);
    setRefreshing(false);
  }, [preset]);

  useEffect(() => {
    let active = true;
    const run = () => { if (active && document.visibilityState === "visible") void load(true); };
    const initial = window.setTimeout(run, 0);
    const interval = window.setInterval(run, REFRESH_MS);
    document.addEventListener("visibilitychange", run);
    return () => { active = false; window.clearTimeout(initial); window.clearInterval(interval); document.removeEventListener("visibilitychange", run); };
  }, [load]);

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily ?? []).flatMap((day) => [day.registrations, day.measured_active_users, day.successful_decisions])), [data]);
  const stale = data ? checkedAt - Date.parse(data.generatedAt) > data.freshForSeconds * 1_000 : false;

  if (loading) return <div className="gr-page"><div className="gr-loading">Product Growth wird aus Live-Daten aufgebaut …</div></div>;
  if (!data) return <div className="gr-page"><div className="gr-error">{error || "Product Growth ist nicht verfügbar."}</div></div>;

  const briefing = founderBriefing(data, previous);
  const funnelMax = Math.max(1, data.funnel[0]?.users ?? 0);

  return (
    <div className="gr-page">
      <header className="gr-header">
        <div><span className="gr-overline">BACKYRD · PRODUCT GROWTH</span><h1>Wachstum,<br />das etwas bedeutet.</h1><p>Von der Registrierung bis zur erfolgreichen Decision vNext – mit sichtbarer Messabdeckung und ohne erfundene Gewissheit.</p></div>
        <div className="gr-headerControls">
          <DateRangeSelector value={preset} onChange={setPreset} />
          <div className="gr-freshnessRow"><span className={`gr-freshness ${stale ? "stale" : "fresh"}`}><i />{stale ? "Daten älter als erwartet" : "Live-Daten aktuell"}</span><button type="button" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Aktualisiert …" : "Jetzt aktualisieren"}</button></div>
          <small>Automatisch alle 30 Sekunden · Stand {dateTime(data.generatedAt)}</small>
        </div>
      </header>
      {error ? <div className="gr-inlineError">{error}</div> : null}

      <section className={`gr-briefing ${briefing.tone}`}><div><span>Founder Briefing</span><h2>{briefing.title}</h2><p>{briefing.detail}</p></div><div className="gr-briefingSignal"><strong>{briefing.signal}</strong><small>{briefing.signalLabel}</small></div></section>

      <section className="gr-productStrip">
        <div className={`gr-productState ${data.product.effectiveState === "ON" ? "on" : "off"}`}><span>Decision vNext</span><strong>{data.product.effectiveState}</strong><small>{data.product.singleRoute && !data.product.legacyFallback ? "Einzige Product Engine · kein Fallback" : "Product-Vertrag prüfen"}</small></div>
        <ProductFact label="Erfolgreiche Decisions · 24 h" value={number(data.product.successfulDecisions24h)} />
        <ProductFact label="Decision-Nutzer · 24 h" value={number(data.product.activeDecisionUsers24h)} />
        <ProductFact label="Letzter Erfolg" value={data.product.lastSuccessfulDecisionAt ? timeAgo(data.product.lastSuccessfulDecisionAt, checkedAt) : "Noch keiner"} />
        <ProductFact label="Fehlerquote" value={data.product.errorTelemetryStatus === "NOT_CANONICALLY_AVAILABLE" ? "Noch nicht messbar" : data.product.errorTelemetryStatus} muted />
      </section>

      <section className="gr-metricGrid" aria-label="Wachstumskennzahlen">
        <GrowthMetric label="Registrierungen" value={number(data.summary.registrations)} delta={delta(data.summary.registrations, previous?.summary.registrations)} detail="Alle neuen Konten" />
        <GrowthMetric label="Aktivierungsrate" value={nullablePercent(data.summary.activationRate)} delta={delta(data.summary.activationRate, previous?.summary.activationRate, "pp")} detail={`${number(data.summary.activated)} von ${number(data.summary.measurableRegistrations)} messbaren Neuzugängen`} />
        <GrowthMetric label="Erfolgreiche Decisions" value={number(data.summary.successfulDecisions)} delta={delta(data.summary.successfulDecisions, previous?.summary.successfulDecisions)} detail={`${number(data.summary.decisionUsers)} eindeutige Nutzer`} />
        <GrowthMetric label="Vorschlag geöffnet" value={number(data.summary.candidateOpens)} delta={delta(data.summary.candidateOpens, previous?.summary.candidateOpens)} detail="Consent-gebundene Product-Interaktion" />
        <GrowthMetric label="Time to Value" value={data.summary.medianTimeToValueMinutes === null ? "Noch nicht messbar" : `${number(data.summary.medianTimeToValueMinutes, 1)} Min.`} detail="Median bis zur ersten erfolgreichen Decision" />
        <GrowthMetric label="D7 Retention" value={nullablePercent(data.summary.d7Retention)} detail={data.summary.d7Eligible ? `${number(data.summary.d7Eligible)} auswertbare Nutzer` : "Noch keine reife Kohorte"} />
      </section>

      <div className="gr-gridMain">
        <section className="gr-card gr-chartCard">
          <SectionHead overline="Momentum" title="Product Growth im Zeitverlauf" detail="Keine künstlichen Balken für Nullwerte." />
          <div className="gr-legend"><span className="active" />Messbar aktiv<span className="decision" />Decision vNext<span className="registration" />Registriert</div>
          <div className="gr-chart" role="img" aria-label="Zeitverlauf für aktive Nutzer, erfolgreiche Decisions und Registrierungen">
            {data.daily.map((day, index) => <div className="gr-day" key={day.metric_date} title={`${shortDate(day.metric_date)} · ${day.measured_active_users} aktiv · ${day.successful_decisions} Decisions · ${day.registrations} Registrierungen`}><div className="gr-bars"><i className="active" style={barHeight(day.measured_active_users, maxDaily)} /><i className="decision" style={barHeight(day.successful_decisions, maxDaily)} /><i className="registration" style={barHeight(day.registrations, maxDaily)} /></div>{(data.daily.length <= 14 || index % Math.ceil(data.daily.length / 8) === 0 || index === data.daily.length - 1) ? <small>{shortDate(day.metric_date)}</small> : <small aria-hidden="true" />}</div>)}
          </div>
        </section>
        <section className="gr-card gr-coverageCard">
          <SectionHead overline="Datenqualität" title="Was wir wirklich messen" />
          <div className="gr-coverageDial" style={{ "--coverage": `${data.coverage.analyticsConsentPercent}%` } as CSSProperties}><strong>{number(data.coverage.analyticsConsentPercent, 1)}%</strong><span>Analytics-Einwilligung</span></div>
          <dl className="gr-coverageFacts"><div><dt>Registrierte Nutzer</dt><dd>{number(data.coverage.registeredUsers)}</dd></div><div><dt>Davon messbar</dt><dd>{number(data.coverage.analyticsConsentedUsers)}</dd></div><div><dt>Historie</dt><dd>Ab jetzt vollständig</dd></div></dl>
          <p>Aktivität, Aktivierung und Retention beziehen sich ausschließlich auf Nutzer mit gültiger optionaler Analytics-Einwilligung. Gesamtregistrierungen und der versiegelte 24-h-Product-Stand bleiben davon getrennt.</p>
        </section>
      </div>

      <div className="gr-grid2">
        <section className="gr-card">
          <SectionHead overline="Activation" title="Der echte Product-Funnel" detail="Jede Stufe ist strenger als die vorherige." />
          <div className="gr-funnel">{data.funnel.map((step) => <div className="gr-funnelStep" key={step.step_order}><div><span>{step.step_order.toString().padStart(2, "0")}</span><strong>{step.step_name}</strong><b>{number(step.users)}</b></div><div className="gr-funnelTrack"><i style={{ width: step.users ? `${Math.max(3, (step.users / funnelMax) * 100)}%` : "0%" }} /></div><small>{coverageLabel(step.coverage)}</small></div>)}</div>
        </section>
        <section className="gr-card">
          <SectionHead overline="Acquisition" title="Wo aktive Nutzer herkommen" detail="Unbekannte Quellen werden nicht schöngerechnet." />
          {data.acquisition.length ? <div className="gr-sourceList">{data.acquisition.map((source, index) => <div key={`${source.source}-${index}`}><span>{index + 1}</span><strong>{source.source}</strong><b>{number(source.users)}</b></div>)}</div> : <div className="gr-empty">Noch keine messbaren Quellen in diesem Zeitraum.</div>}
          {data.acquisition.length === 1 && data.acquisition[0]?.source === "Direkt / unbekannt" ? <div className="gr-note">Acquisition ist noch nicht entscheidungsfähig: Der aktuelle App-Pfad liefert keine differenzierten Source-Parameter.</div> : null}
        </section>
      </div>

      <section className="gr-card gr-cohortCard">
        <SectionHead overline="Retention" title="Wöchentliche Kohorten" detail="Unreife Kohorten erscheinen als ‚noch nicht messbar‘ statt als falsche 0 %." />
        <div className="gr-tableWrap"><table className="gr-table"><thead><tr><th>Kohorte</th><th>Nutzer</th><th>Messbar</th><th>Aktiviert</th><th>D1</th><th>D7</th><th>D30</th></tr></thead><tbody>{data.cohorts.map((cohort) => <tr key={cohort.cohort_week}><td><strong>Woche {longDate(cohort.cohort_week)}</strong></td><td>{number(cohort.cohort_size)}</td><td>{number(cohort.measurable_users)}</td><td>{number(cohort.activated)}</td><RetentionCell retained={cohort.d1_retained} eligible={cohort.d1_eligible} /><RetentionCell retained={cohort.d7_retained} eligible={cohort.d7_eligible} /><RetentionCell retained={cohort.d30_retained} eligible={cohort.d30_eligible} /></tr>)}</tbody></table></div>
        {!data.cohorts.length ? <div className="gr-empty">Für diesen Zeitraum gibt es noch keine Registrierungskohorte.</div> : null}
      </section>

      <div className="gr-grid2 gr-footerGrid">
        <section className="gr-card"><SectionHead overline="Definitionen" title="Was die Kennzahlen bedeuten" /><div className="gr-definitionList">{data.definitions.map((item) => <article key={item.key}><strong>{item.label}</strong><p>{item.definition}</p></article>)}</div></section>
        <section className="gr-card"><SectionHead overline="Transparenz" title="Bekannte Messgrenzen" /><ul className="gr-limitations">{data.limitations.map((item) => <li key={item}>{item}</li>)}</ul><div className="gr-privacy">Nur Aggregate · keine Nutzeridentitäten · keine rohen Decision-Texte · keine Service-Credentials</div></section>
      </div>
    </div>
  );
}

function SectionHead({ overline, title, detail }: { overline: string; title: string; detail?: string }) { return <header className="gr-sectionHead"><div><span>{overline}</span><h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div></header>; }
function ProductFact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) { return <div className={`gr-productFact ${muted ? "muted" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }
function GrowthMetric({ label, value, detail, delta: change }: { label: string; value: string; detail: string; delta?: { label: string; direction: "up" | "down" | "same" } | null }) { return <article className="gr-metric"><div><span>{label}</span>{change ? <em className={change.direction}>{change.label}</em> : null}</div><strong>{value}</strong><p>{detail}</p></article>; }
function RetentionCell({ retained, eligible }: { retained: number; eligible: number }) { if (!eligible) return <td><span className="gr-notReady">Noch nicht messbar</span></td>; const percentage = (retained * 100) / eligible; return <td><strong>{number(percentage, 1)}%</strong><small>{number(retained)} von {number(eligible)}</small></td>; }
function isGrowthData(value: unknown): value is GrowthData { return !!value && typeof value === "object" && (value as Record<string, unknown>).contractVersion === "backyrd.admin-growth-intelligence@2.0"; }
function previousRange(range: { from: string; to: string }) { const from = Date.parse(range.from); const to = Date.parse(range.to); const duration = to - from; return { from: new Date(from - duration).toISOString(), to: new Date(from).toISOString() }; }
function nullablePercent(value: number | null) { return value === null ? "Noch nicht messbar" : `${number(value, 1)}%`; }
function shortDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }); }
function longDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function dateTime(value: string) { return new Date(value).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function barHeight(value: number, max: number): CSSProperties { return { height: value > 0 ? `${Math.max(4, (value / max) * 100)}%` : "0%" }; }

function delta(current: number | null, prior: number | null | undefined, unit = "%") {
  if (current === null || prior === null || prior === undefined) return null;
  if (unit === "pp") { const change = current - prior; return { label: `${change > 0 ? "+" : ""}${number(change, 1)} pp`, direction: change > 0 ? "up" as const : change < 0 ? "down" as const : "same" as const }; }
  if (prior === 0) return current === 0 ? { label: "unverändert", direction: "same" as const } : { label: "neu messbar", direction: "up" as const };
  const change = ((current - prior) / prior) * 100;
  return { label: `${change > 0 ? "+" : ""}${number(change, 1)}${unit}`, direction: change > 0 ? "up" as const : change < 0 ? "down" as const : "same" as const };
}

function founderBriefing(data: GrowthData, previous: GrowthData | null) {
  if (data.product.effectiveState !== "ON") return { tone: "critical", title: "Product Growth ist blockiert", detail: "Decision vNext ist nicht wirksam ON. Wachstumswerte dürfen nicht als gesunder Product-Betrieb interpretiert werden.", signal: "OFF", signalLabel: "Product-Control" };
  if (!data.summary.measurableRegistrations) return { tone: "neutral", title: "Noch keine belastbare Aktivierungskohorte", detail: "Im gewählten Zeitraum gibt es keine neuen Nutzer mit messbarer optionaler Analytics-Einwilligung. Der Live-Product-Stand bleibt davon getrennt sichtbar.", signal: number(data.product.successfulDecisions24h), signalLabel: "versiegelte Decisions · 24 h" };
  const activation = data.summary.activationRate; const prior = previous?.summary.activationRate ?? null; const direction = activation !== null && prior !== null ? activation - prior : null;
  return { tone: direction !== null && direction < 0 ? "warning" : "good", title: activation === null ? "Aktivierung noch nicht messbar" : `${number(activation, 1)}% erreichen die erste erfolgreiche Decision`, detail: direction === null ? "Die aktuelle Kohorte wird gegen den echten Product-v1-Meilenstein gemessen." : `Gegenüber der Vorperiode sind das ${direction >= 0 ? "+" : ""}${number(direction, 1)} Prozentpunkte.`, signal: number(data.summary.successfulDecisions), signalLabel: "erfolgreiche Decisions im Zeitraum" };
}

function coverageLabel(value: string) { if (value === "ALL_ACCOUNTS") return "Alle Konten"; if (value === "ANALYTICS_AND_PERSONALIZATION_CONSENT") return "Nur bei Analytics- und Personalisierungs-Consent messbar"; return "Nur bei optionalem Analytics-Consent messbar"; }
function timeAgo(value: string, reference: number) { const minutes = Math.max(0, Math.floor((reference - Date.parse(value)) / 60_000)); if (minutes < 1) return "Gerade eben"; if (minutes < 60) return `vor ${minutes} Min.`; const hours = Math.floor(minutes / 60); if (hours < 24) return `vor ${hours} Std.`; return `vor ${Math.floor(hours / 24)} T.`; }
