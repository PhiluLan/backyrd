"use client";

import { useState } from "react";
import { DateRangeSelector } from "@/components/intelligence/DateRangeSelector";
import { number, rangeFor, type Preset } from "@/lib/intelligence";
import type { AnalyticsPageViews } from "@/lib/analyticsPages";
import { useAnalyticsReport } from "../useAnalyticsReport";
import styles from "../analytics.module.css";

const dayFormat = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "short", timeZone: "UTC" });

export default function AnalyticsPages() {
  const [preset, setPreset] = useState<Preset>("month");
  const [surface, setSurface] = useState<"Alle" | "App" | "Web">("Alle");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(() => rangeFor("month"));
  const { data, busy, refresh } = useAnalyticsReport<AnalyticsPageViews>(`/api/analytics/pages?${new URLSearchParams(range)}`);
  const rows = data?.pages.filter(row => (surface === "Alle" || row.surface === surface)
    && `${row.label} ${row.route}`.toLocaleLowerCase("de-CH").includes(query.trim().toLocaleLowerCase("de-CH")));
  const maxViews = Math.max(1, ...(data?.daily.map(row => row.views) ?? []));

  return <div className={`bi-page ${styles.stack}`}>
    <header className="bi-header"><div><h1>Seiten & Screens</h1><p>Gemessene Aufrufe in der App und auf der Website</p></div></header>
    <div className={styles.controls}><DateRangeSelector value={preset} onChange={value => { setPreset(value); setRange(rangeFor(value)); }} /><button type="button" className="bi-action" disabled={busy} onClick={() => { setRange(rangeFor(preset)); refresh(); }}>Aktualisieren</button></div>
    {busy && <p role="status">Aufrufe werden geladen …</p>}
    {!busy && !data && <p className="bi-error" role="status">Die Aufrufe konnten gerade nicht geladen werden.</p>}
    {data && <>
      <dl className={styles.metrics}>
        <div className="bi-card"><dt>Gemessene Aufrufe</dt><dd>{number(data.views)}</dd></div>
        <div className="bi-card"><dt>Eindeutige Nutzer</dt><dd>{number(data.viewers)}</dd></div>
        <div className="bi-card"><dt>Tage mit Aufrufen</dt><dd>{number(data.daily.filter(row => row.views > 0).length)}</dd></div>
      </dl>
      <section className="bi-card">
        <h2>Aufrufe im Zeitverlauf</h2>
        {!data.views ? <p>Für diesen Zeitraum wurden keine Aufrufe erfasst.</p> : <div className={styles.graph} role="region" tabIndex={0} aria-label="Tägliche Aufrufe">
          {data.daily.map(({ day, views }) => <div key={day} className={styles.graphRow}>
            <time dateTime={day}>{dayFormat.format(new Date(day))}</time>
            <meter min={0} max={maxViews} value={views} aria-label={`Aufrufe am ${day}`} />
            <strong>{number(views)}</strong>
          </div>)}
        </div>}
      </section>
      <section className="bi-card">
        <h2>Meistaufgerufene Seiten</h2>
        <div className={styles.controls}>
          <label>Plattform <select className="bi-input" value={surface} onChange={event => {
            const value = event.currentTarget.value;
            if (value === "Alle" || value === "App" || value === "Web") setSurface(value);
          }}><option>Alle</option><option>App</option><option>Web</option></select></label>
          <label>Seite suchen <input className="bi-input" value={query} onChange={event => setQuery(event.currentTarget.value)} /></label>
        </div>
        {rows?.length ? <div className={styles.table} role="region" tabIndex={0} aria-label="Aufrufe pro Seite">
          <table><thead><tr><th scope="col">Seite</th><th scope="col">Plattform</th><th scope="col">Aufrufe</th><th scope="col">Eindeutige Nutzer</th></tr></thead>
            <tbody>{rows.map(row => <tr key={`${row.surface}:${row.route}`}><td><strong>{row.label}</strong><small>/{row.route === "home" ? "" : row.route}</small></td><td>{row.surface}</td><td>{number(row.views)}</td><td>{number(row.users)}</td></tr>)}</tbody></table>
        </div> : <p>Die Rangliste enthält für diese Auswahl keine Einträge.</p>}
        <p className={styles.subtle}>Die Rangliste zeigt bekannte Seitengruppen. Web-Aufrufe werden für ausgewählte Seiten von angemeldeten Konten mit Analytics-Einwilligung erfasst. Die Daten sind ab Einführung der Web-Messung verfügbar.</p>
      </section>
    </>}
  </div>;
}
