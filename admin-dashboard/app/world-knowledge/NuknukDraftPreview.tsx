"use client";

import { useState } from "react";
import styles from "./WorldResearchBatchPanel.module.css";
import { type NuknukDraft } from "@/lib/nuknukResearchDraft";
import { ResearchValue, researchFieldLabel, researchGapReason } from "./ResearchValue";

export function NuknukDraftPreview({ draft, onClose, onSave, saved, saving, error, onPrepare, preparing = false }: {
  draft: NuknukDraft; onClose: () => void; onSave: () => void; saved: boolean; saving: boolean; error: string;
  onPrepare?: (reviewedKeys: string[]) => void; preparing?: boolean;
}) {
  const [filter, setFilter] = useState<"ALL" | "PROPOSED" | "OPEN">("ALL");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const proposed = draft.results.filter(item => item.value !== undefined && item.status === "REQUIRES_REVIEW");
  const open = draft.results.filter(item => !proposed.includes(item));
  const visible = draft.results.filter(item => (filter === "ALL" || (filter === "PROPOSED" ? proposed.includes(item) : open.includes(item)))
    && researchFieldLabel(item.attributeKey).toLocaleLowerCase("de-CH").includes(query.toLocaleLowerCase("de-CH")));
  const busy = saving || preparing;
  return <div className={styles.draft}>
    <header className={styles.draftHeader}>
      <span className={styles.eyebrow}>RECHERCHEBERICHT</span><h3>{draft.name}</h3>
      <p>Prüfe die Vorschläge und ihre Quellen. Erst nach dem Abgleich mit dem bestehenden Profil entscheidest du, was übernommen wird.</p>
      <div className={styles.summaryGrid}><div><strong>{proposed.length}</strong><span>Angaben mit Vorschlag</span></div><div><strong>{open.length}</strong><span>Noch offen</span></div><div><strong>{saved ? "Gesichert" : "Lokal"}</strong><span>{saved ? "Bericht im Admin gespeichert" : "Bericht noch nicht gespeichert"}</span></div></div>
      <p className={styles.note}>Ein gespeicherter Bericht ändert noch keine Profilangaben. Die Anzahl der Vorschläge ist kein Vollständigkeitswert. Der Profilabgleich zeigt, was bereits gespeichert ist.</p>
    </header>
    <div className={styles.knowledgeToolbar}>
      <label>Wissen durchsuchen<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Zum Beispiel Öffnungszeiten"/></label>
      <div role="group" aria-label="Angaben filtern">{([['ALL','Alle'],['PROPOSED','Vorschläge'],['OPEN','Offen']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} {key === "ALL" ? draft.results.length : key === "PROPOSED" ? proposed.length : open.length}</button>)}</div>
    </div>
    <div className={styles.knowledgeList}>
      {visible.map(result => {
        const eligible = proposed.includes(result);
        const title = researchFieldLabel(result.attributeKey);
        const citations = (result.citations ?? []).filter((citation,index,items) => items.findIndex(item => item.url === citation.url && item.evidence === citation.evidence && item.observedAt === citation.observedAt) === index);
        return <article className={styles.knowledgeCard} key={result.attributeKey} aria-label={title}>
          <header><h4>{title}</h4><span className={styles.stateBadge}>{eligible ? "Recherchevorschlag" : "Noch offen"}</span></header>
          {result.partialProfile && <p className={styles.partialNote}>Teilprofil: Belegte Angebote und Bereiche werden ergänzt. Bestehende Angaben bleiben erhalten; abweichende Merkmale brauchen eine eigene Prüfung.</p>}
          {result.partialHours && <p className={styles.partialNote}>Teilweiser Wochenplan: Nicht belegte Wochentage bleiben unverändert.</p>}
          {eligible ? <ResearchValue attributeKey={result.attributeKey} value={result.value}/> : <p className={styles.note}>{researchGapReason(result.reason)}</p>}
          {!!citations.length && <details className={styles.sourceDetails}><summary>Quellen & Belege ({citations.length})</summary>{citations.map((citation,index) => <blockquote key={index}><p>{citation.evidence}</p><a href={citation.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a>{citation.observedAt && <small>Abruf: {citation.observedAt.slice(0,10)}</small>}{citation.layoutReviewRequired && <small>Bild- oder PDF-Layout im Original prüfen.</small>}</blockquote>)}</details>}
          {eligible && onPrepare && <label className={styles.reviewSelection}><input type="checkbox" disabled={busy} checked={selected.includes(result.attributeKey)} onChange={event => setSelected(current => event.target.checked ? [...current,result.attributeKey] : current.filter(key => key !== result.attributeKey))}/><span>Inhalt und Belege geprüft · für den Profilabgleich auswählen</span></label>}
        </article>;
      })}
      {!visible.length && <p className={styles.note} role="status">Keine Angaben für diesen Filter gefunden.</p>}
    </div>
    <section className={styles.stage} aria-label="Recherchebericht verwalten">
      <p className={styles.note}>{draft.version} · {draft.requests ?? "?"} Quellenabrufe · {draft.modelCalls ?? "?"} Modellaufrufe</p>
      {!!draft.sourceFailures?.length && <details className={styles.details}><summary>Nicht erreichbare Quellen ({draft.sourceFailures.length})</summary><ul>{draft.sourceFailures.map((failure,index) => <li key={index}><a href={failure.url} target="_blank" rel="noreferrer">Quelle öffnen</a> · {researchGapReason(failure.reason)}</li>)}</ul></details>}
      {!!draft.limitations?.length && <p className={styles.note}>Die Recherche ist kein Nachweis vollständiger Angaben. Nicht ausgewertete Bilder und PDF-Layouts können weitere Informationen enthalten.</p>}
      {saved ? <p className={styles.note} role="status">Recherchebericht im Admin gespeichert. Das Profil wird dadurch noch nicht geändert.</p> : <button type="button" className={styles.secondary} disabled={busy} onClick={onSave}>{saving ? "Bericht wird gespeichert …" : "Bericht im Admin sichern"}</button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Zurück zur Recherche</button>
    </section>
    {onPrepare && <div className={styles.footer}><span>{selected.length} Angaben ausgewählt · der Abgleich speichert noch nichts</span><button type="button" className={styles.primary} disabled={busy || !selected.length} onClick={() => onPrepare(selected)}>{preparing ? "Profil wird abgeglichen …" : "Auswahl mit Spotprofil abgleichen"}</button></div>}
  </div>;
}
