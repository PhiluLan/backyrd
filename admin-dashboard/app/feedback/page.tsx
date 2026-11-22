"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dateTime } from "@/lib/intelligence";
import { feedbackError, feedbackKinds, feedbackSentiments, feedbackStatuses, parseFeedbackPage, type FeedbackPage, type FeedbackRow } from "@/lib/productFeedback";
import styles from "./feedback.module.css";

export default function FeedbackInbox() {
  const [status, setStatus] = useState(""), [sentiment, setSentiment] = useState(""), [kind, setKind] = useState("");
  const [period, setPeriod] = useState("30"), [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0), [page, setPage] = useState<FeedbackPage | null>(null);
  const [cursor, setCursor] = useState<Pick<FeedbackRow, "id" | "created_at"> | null>(null);
  const [previous, setPrevious] = useState<FeedbackRow[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [anchor, setAnchor] = useState(() => Date.now());
  const from = useMemo(() => period ? new Date(anchor - Number(period) * 86400000).toISOString() : null, [period, anchor]);
  function reset() { setAnchor(Date.now()); setCursor(null); setPrevious([]); setPage(null); setLoading(true); setError(""); }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("admin_list_product_feedback_v2", {
          p_status: status || null, p_sentiment: sentiment || null, p_kind: kind || null,
          p_from: from,
          p_search: search || null, p_before: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: 30,
        }).abortSignal(controller.signal);
        if (rpcError) throw rpcError;
        const next = parseFeedbackPage(data);
        if (!controller.signal.aborted) setPage(next);
      } catch (failure) { if (!controller.signal.aborted) setError(feedbackError(failure)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [status, sentiment, kind, from, search, refresh, cursor]);
  const current = page?.rows.slice(0, page.page_size) ?? [];
  const rows = [...previous, ...current];
  const more = Boolean(page && page.rows.length > page.page_size);
  return <div className="bi-page">
    <header className="bi-header"><div><div className="bi-eyebrow">Produktqualität</div><h1>Feedback</h1><p>Verstehen, was geholfen hat – und was wir besser machen können.</p></div>
      <button className="bi-button" disabled={loading} onClick={() => { reset(); setRefresh(v => v + 1); }}>Aktualisieren</button></header>
    <section className={`bi-card ${styles.intro}`}><strong>Rückmeldungen zu unseren Vorschlägen</strong><p>Das Feedback bezieht sich auf die gesamte Suche. Es bewertet keinen einzelnen Ort und verändert keine Empfehlungen automatisch.</p></section>
    <form className={`bi-card ${styles.filters}`} onSubmit={event => { event.preventDefault(); reset(); setSearch(query.trim()); setRefresh(v => v + 1); }}>
      <label>Status<select aria-label="Status" className="bi-select" value={status} onChange={e => { reset(); setStatus(e.target.value); }}><option value="">Alle Status</option>{Object.entries(feedbackStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Rückmeldung<select aria-label="Rückmeldung" className="bi-select" value={sentiment} onChange={e => { reset(); setSentiment(e.target.value); }}><option value="">Alle Antworten</option>{Object.entries(feedbackSentiments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Ursache<select aria-label="Ursache" className="bi-select" value={kind} onChange={e => { reset(); setKind(e.target.value); }}><option value="">Alle Ursachen</option>{Object.entries(feedbackKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Zeitraum<select aria-label="Zeitraum" className="bi-select" value={period} onChange={e => { reset(); setPeriod(e.target.value); }}><option value="7">Letzte 7 Tage</option><option value="30">Letzte 30 Tage</option><option value="">Gesamter Zeitraum</option></select></label>
      <label className={styles.search}>Kommentar, Notiz oder Ticket<input className="bi-input" value={query} maxLength={120} onChange={e => setQuery(e.target.value)} placeholder="Zum Beispiel: Öffnungszeiten" /></label><button className="bi-button" type="submit">Suchen</button>
    </form>
    {error && <div className="bi-error" role="alert">{error} <button className="bi-button" disabled={loading} onClick={() => { setLoading(true); setError(""); setRefresh(v => v + 1); }}>Erneut versuchen</button></div>}
    {loading && <div className="bi-state" role="status">Rückmeldungen werden geladen …</div>}
    {page && !loading && !error && <>
      <section className="bi-kpiGrid" aria-label="Rückmeldungen in der aktuellen Auswahl">{[["Rückmeldungen", page.summary.total], ["Neu", page.summary.new], ["In Prüfung", page.summary.reviewing], ["Erledigt", page.summary.done]].map(([label, count]) => <div className="bi-kpi" key={label}><span>{label}</span><strong>{count}</strong><small>Aktuelle Filterauswahl</small></div>)}</section>
      <p className={styles.muted}>Ja: {page.summary.helpful} · Fast: {page.summary.almost} · Nein: {page.summary.not_helpful}. Das sind abgegebene Rückmeldungen, keine Erfolgsquote aller Suchen.</p>
      {rows.length === 0 ? <div className="bi-empty">Für diese Auswahl gibt es noch keine Rückmeldungen. Passe die Filter an oder schau später wieder vorbei.</div> : <section className="bi-card"><div className="bi-tableWrap"><table className="bi-table"><caption className={styles.caption}>Rückmeldungen · neueste zuerst</caption><thead><tr><th scope="col">Antwort</th><th scope="col">Kommentar</th><th scope="col">Bearbeitung</th><th scope="col">Ursache / Ticket</th><th scope="col">Eingegangen</th><th scope="col">Details</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><span className={`bi-badge ${row.sentiment === "helpful" ? "success" : row.sentiment === "almost" ? "warning" : "danger"}`}>{feedbackSentiments[row.sentiment]}</span><small>{row.surface === "decision" ? "Decision" : row.surface}</small></td><td className={styles.comment}>{row.message || "Ohne Kommentar"}</td><td>{feedbackStatuses[row.review_status]}</td><td>{row.issue_kind ? feedbackKinds[row.issue_kind] : "Noch nicht eingeordnet"}<small>{row.issue_ref}</small></td><td>{dateTime(row.created_at)}</td><td><Link className="bi-action" href={`/feedback/${encodeURIComponent(row.id)}`} aria-label={`Rückmeldung ${feedbackSentiments[row.sentiment]} vom ${dateTime(row.created_at)} öffnen`}>Öffnen →</Link></td></tr>)}</tbody></table></div>
        {more && <button className="bi-button" onClick={() => { const last = current.at(-1); if (last) { setLoading(true); setError(""); setPrevious(rows); setPage(null); setCursor({ id: last.id, created_at: last.created_at }); } }}>Weitere laden</button>}</section>}
    </>}
  </div>;
}
