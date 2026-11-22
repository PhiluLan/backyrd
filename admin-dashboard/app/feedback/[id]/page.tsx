"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dateTime } from "@/lib/intelligence";
import { feedbackError, feedbackKinds, feedbackSentiments, feedbackStatuses, parseFeedbackDetail, reviewValidation, type FeedbackDetail, type FeedbackKind, type FeedbackStatus } from "@/lib/productFeedback";
import styles from "../feedback.module.css";

export default function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FeedbackDetailContent key={id} id={id} />;
}

function FeedbackDetailContent({ id }: { id: string }) {
  const [detail, setDetail] = useState<FeedbackDetail | null>(null), [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState<FeedbackStatus>("new"), [kind, setKind] = useState<FeedbackKind | "">("");
  const [note, setNote] = useState(""), [issueRef, setIssueRef] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("admin_product_feedback_detail_v1", { p_id: id }).abortSignal(controller.signal);
        if (rpcError) throw rpcError;
        const result = parseFeedbackDetail(data);
        if (controller.signal.aborted) return;
        setDetail(result); setStatus(result.feedback.review_status); setKind(result.feedback.issue_kind ?? "");
        setNote(result.feedback.internal_note); setIssueRef(result.feedback.issue_ref);
      } catch (failure) { if (!controller.signal.aborted) setError(feedbackError(failure)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [id, refresh]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || saving) return;
    const validation = reviewValidation(status, note, issueRef);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_review_product_feedback_v1", {
        p_id: id, p_expected_revision: detail.feedback.review_revision, p_status: status,
        p_kind: kind || null, p_note: note.trim(), p_issue_ref: issueRef.trim(),
      });
      if (rpcError) throw rpcError;
      if (typeof data !== "number" || !Number.isSafeInteger(data)) throw new Error("feedback_receipt_missing");
      setNotice("Gespeichert. Die Einordnung verändert keine Empfehlungen.");
      setLoading(true);
      setRefresh(value => value + 1);
    } catch (failure) { setError(feedbackError(failure)); }
    finally { setSaving(false); }
  }
  const f = detail?.feedback, context = f?.decision_context;
  return <div className="bi-page">
    <Link className="bi-back" href="/feedback">← Zum Feedback-Eingang</Link>
    <header className="bi-header"><div><div className="bi-eyebrow">Produktqualität</div><h1>Rückmeldung verstehen</h1><p>Einordnen, prüfen und die nächste Verbesserung festhalten.</p></div></header>
    {error && <div className="bi-error" role="alert">{error}<div className={styles.actions}><button className="bi-button" disabled={loading || saving} onClick={() => { setLoading(true); setError(""); setDetail(null); setNotice(""); setRefresh(v => v + 1); }}>Aktuellen Stand laden · Eingaben verwerfen</button></div></div>}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {loading && <div className="bi-state" role="status">Rückmeldung wird geladen …</div>}
    {f && !loading && <>
      <div className="bi-grid2"><section className="bi-card"><div className="bi-kicker">Die Rückmeldung</div><h2>{feedbackSentiments[f.sentiment]} – {f.sentiment === "helpful" ? "die Vorschläge haben geholfen" : f.sentiment === "almost" ? "fast passend" : "nicht hilfreich"}</h2>
        <p className={styles.message}>{f.message || "Es wurde kein Kommentar mitgeschickt."}</p>
        <dl className={styles.meta}><dt>Eingegangen</dt><dd>{dateTime(f.created_at)}</dd><dt>Bereich</dt><dd>{f.surface === "decision" ? "Decision / Wohin" : f.surface}</dd><dt>App</dt><dd>{f.client_context.platform || "Unbekannte Plattform"} · {f.client_context.app_version || "Version unbekannt"}</dd></dl>
        <div className={styles.context}><h3>Suchkontext</h3>{context ? <>
          <p className={styles.muted}>Beim Absenden gesicherte Zusammenfassung. Der ursprüngliche Suchtext und Teilnehmerdetails werden hier nicht gespeichert.</p>
          <dl className={styles.meta}><dt>Stadt</dt><dd>{context.city || "Nicht bekannt"}</dd><dt>Verstandene Absicht</dt><dd>{context.intent || "Nicht bekannt"}</dd><dt>Tageszeit</dt><dd>{context.day_phase || "Nicht angegeben"}</dd><dt>Kandidaten im Ergebnis</dt><dd>{context.candidate_count}</dd></dl>
          <h3>Gerankte Vorschläge · maximal 5</h3>{context.ranked_candidates.length ? <ul>{context.ranked_candidates.map((candidate, index) => <li className={styles.context} key={index}><strong>{candidate.name || "Name nicht verfügbar"}</strong><small className={styles.muted}> · {candidate.tier === "ELIGIBLE_CONFIRMED" ? "Passung bestätigt" : "Passung noch unbestätigt"}</small></li>)}</ul> : <p className={styles.muted}>Keine gerankten Vorschläge im gesicherten Kontext. Mögliche Abklärungsorte werden hier nicht als bestätigte Empfehlungen dargestellt.</p>}
        </> : <p className={styles.muted}>Für diese Rückmeldung wurde kein Suchkontext gesichert. Bei älteren Einträgen lässt sich die damalige Suche nicht zuverlässig rekonstruieren.</p>}</div>
        <details className={styles.context}><summary>Technische Zuordnung</summary><dl className={styles.meta}><dt>Feedback-ID</dt><dd>{f.id}</dd><dt>Decision-ID</dt><dd>{f.decision_id || "Keine"}</dd><dt>App-Update</dt><dd>{f.client_context.update_id || "Nicht angegeben"}</dd><dt>Ranking-Version</dt><dd>{context?.ranking_version || "Nicht erfasst"}</dd></dl></details>
      </section><section className="bi-card"><div className="bi-kicker">Nächster Schritt</div><h2>Bearbeitung</h2><p className={styles.muted}>Ein „Nein“ ist ein Hinweis zur gesamten Suche, keine negative Bewertung eines Ortes.</p>
        <form className={styles.form} onSubmit={save}>
          <label>Status<select aria-label="Status" className="bi-select" value={status} disabled={saving} onChange={e => setStatus(e.target.value as FeedbackStatus)}>{Object.entries(feedbackStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Woran lag es?<select aria-label="Woran lag es?" className="bi-select" value={kind} disabled={saving} onChange={e => setKind(e.target.value as FeedbackKind | "")}><option value="">Noch nicht eingeordnet</option>{Object.entries(feedbackKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Interne Notiz<textarea className="bi-textarea" maxLength={2000} value={note} disabled={saving} onChange={e => setNote(e.target.value)} placeholder="Was wurde geprüft? Was verbessern wir? Zum Erledigen bitte eine kurze Begründung festhalten." /></label>
          <label>Thema oder Ticket<input className="bi-input" maxLength={120} value={issueRef} disabled={saving} onChange={e => setIssueRef(e.target.value)} placeholder="Optional, z. B. Öffnungszeiten oder BACK-42" /></label>
          <small className={styles.muted}>Wiederkehrende Fälle lassen sich mit derselben Referenz bündeln und im Eingang suchen. Es wird kein externes Ticket automatisch erstellt.</small>
          <button className="bi-button" type="submit" disabled={saving}>{saving ? "Wird gespeichert …" : "Einordnung speichern"}</button>
        </form>
      </section></div>
      <section className="bi-card"><div className="bi-kicker">Nachvollziehbarkeit</div><h2>Bearbeitungsverlauf</h2><p className={styles.muted}>Die letzten 50 Änderungen. Die ursprüngliche Rückmeldung bleibt unverändert.</p>
        {detail.history.length ? detail.history.map(entry => <article className={styles.history} key={entry.revision}>
          <strong>{feedbackStatuses[entry.before_review.status]} → {feedbackStatuses[entry.after_review.status]}</strong><p>{entry.after_review.kind ? feedbackKinds[entry.after_review.kind] : "Ohne Ursachen-Zuordnung"}{entry.after_review.issue_ref ? ` · ${entry.after_review.issue_ref}` : ""}</p><p className={styles.message}>{entry.after_review.note || "Keine interne Notiz"}</p><small>{dateTime(entry.created_at)} · Admin {entry.actor_id || "nicht mehr verfügbar"} · Änderung {entry.revision}</small>
        </article>) : <p className={styles.muted}>Noch keine Bearbeitung. Neue Rückmeldungen starten im Status „Neu“.</p>}
      </section>
    </>}
  </div>;
}
