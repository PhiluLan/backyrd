"use client";

import { dateTime, number } from "@/lib/intelligence";
import type { SeoReport } from "@/lib/analyticsSeo";
import { useAnalyticsReport } from "../useAnalyticsReport";
import styles from "../analytics.module.css";

const canonicalLabels = { self: "Eigene URL", other: "Andere URL", missing: "Fehlt" };
const http = (value: number | null) => value === null ? "Unbekannt" : `HTTP ${value}`;
const present = (value: boolean | null) => value === null ? "Unbekannt" : value ? "Vorhanden" : "Fehlt";

export default function AnalyticsSeo() {
  const { data, busy, refresh } = useAnalyticsReport<SeoReport>("/api/analytics/seo");
  return <div className={`bi-page ${styles.stack}`}>
    <header className="bi-header"><div><h1>SEO</h1><p>Technischer Check der öffentlichen Backyrd-Website</p></div>
      <button type="button" className="bi-action" disabled={busy} onClick={refresh}>Erneut prüfen</button>
    </header>
    {busy && <p role="status">Website wird geprüft …</p>}
    {!busy && !data && <p role="status" className="bi-error">Die Website-Prüfung ist gerade nicht verfügbar.</p>}
    {data && <>
      <dl className={styles.metrics}>
        <div className="bi-card"><dt>robots.txt</dt><dd>{http(data.robots.status)}</dd><p>Sitemap-Verweis {present(data.robots.listsSitemap).toLowerCase()}</p></div>
        <div className="bi-card"><dt>sitemap.xml</dt><dd>{http(data.sitemap.status)}</dd><p>{data.sitemap.total === null ? "URL-Anzahl unbekannt" : `${number(data.sitemap.total)} URLs`}</p></div>
        <div className="bi-card"><dt>Spotseiten in der Sitemap</dt><dd>{data.sitemap.spots === null ? "Unbekannt" : number(data.sitemap.spots)}</dd></div>
      </dl>
      <section className="bi-card">
        <h2>Öffentliche Seiten im Check</h2>
        <div className={styles.table} role="region" tabIndex={0} aria-label="Technische SEO-Stichprobe"><table>
          <thead><tr><th scope="col">Seite und Titel</th><th scope="col">Abruf</th><th scope="col">Beschreibung</th><th scope="col">Kanonische URL</th><th scope="col">Indexierungsvorgabe</th></tr></thead>
          <tbody>{data.sample.map(row => <tr key={row.path}><td><a href={`https://www.backyrd.ch${row.path}`} target="_blank" rel="noreferrer">{row.path}</a><small>{row.title ?? "Kein Titel ermittelt"}</small></td>
            <td>{http(row.status)}</td><td>{present(row.descriptionPresent)}</td><td>{row.canonical === null ? "Unbekannt" : canonicalLabels[row.canonical]}</td>
            <td>{row.noindex === null ? "Unbekannt" : row.noindex ? "Noindex gefunden" : "Keine Noindex-Anweisung gefunden"}</td></tr>)}</tbody>
        </table></div>
        <p className={styles.subtle}>Abgerufen am {dateTime(data.checkedAt)}. Antworten können bis zu fünf Minuten im Cache liegen.</p>
      </section>
    </>}
    <section className="bi-card"><h2>Sichtbarkeit in Google</h2><p>Suchbegriffe, Impressionen, Klicks und der tatsächliche Indexierungsstatus sind in der Google Search Console verfügbar.</p>
      <a className="bi-action" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Search Console öffnen</a>
    </section>
  </div>;
}
