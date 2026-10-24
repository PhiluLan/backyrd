"use client";

import { useState } from "react";
import styles from "./WorldResearchBatchPanel.module.css";
import { type NuknukDraft } from "@/lib/nuknukResearchDraft";
import { ResearchFieldEditor } from "./ResearchFieldEditor";
import { AUTHORING_FIELDS } from "@backyrd/world-knowledge-core/browser";
import { ResearchValue, researchFieldLabel, researchGapReason } from "./ResearchValue";

export function NuknukDraftPreview({ draft, onClose, onSave, saved, saving, error, onPrepare, preparing = false, post, onRecover }: {
  draft: NuknukDraft; onClose: () => void; onSave: () => void; saved: boolean; saving: boolean; error: string;
  onPrepare?: (reviewedKeys: string[]) => void; preparing?: boolean; post?: (body:unknown)=>Promise<unknown>; onRecover?: (file:File)=>Promise<void>;
}) {
  const [editing,setEditing] = useState<string | null>(null);
  const [ownSaved,setOwnSaved] = useState<Record<string,unknown>>({});
  const [recovering,setRecovering] = useState(false);
  const [recoveryError,setRecoveryError] = useState("");
  const needsRecovery = draft.results.some(result => result.status === "REQUIRES_REVIEW" && result.citations?.some(citation => !citation.observedAt));
  const [filter, setFilter] = useState<"ALL" | "PROPOSED" | "OPEN">("ALL");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const proposed = draft.results.filter(item => item.value !== undefined && item.status === "REQUIRES_REVIEW");
  const open = draft.results.filter(item => !proposed.includes(item));
  const visible = draft.results.filter(item => (filter === "ALL" || (filter === "PROPOSED" ? proposed.includes(item) : open.includes(item)))
    && researchFieldLabel(item.attributeKey).toLocaleLowerCase("de-CH").includes(query.toLocaleLowerCase("de-CH")));
  const busy = saving || preparing || recovering || editing !== null;
  return <div className={styles.draft}>
    <header className={styles.draftHeader}>
      <span className={styles.eyebrow}>RECHERCHEBERICHT</span><h3>{draft.name}</h3>
      <p>Prüfe die Vorschläge und ihre Quellen. Erst nach dem Abgleich mit dem bestehenden Profil entscheidest du, was übernommen wird.</p>
      <div className={styles.summaryGrid}><div><strong>{proposed.length}</strong><span>Angaben mit Vorschlag</span></div><div><strong>{open.length}</strong><span>Noch offen</span></div><div><strong>{saved ? "Gesichert" : "Lokal"}</strong><span>{saved ? "Bericht im Admin gespeichert" : "Bericht noch nicht gespeichert"}</span></div></div>
      <p className={styles.note}>Ein gespeicherter Bericht ändert noch keine Profilangaben. Die Anzahl der Vorschläge ist kein Vollständigkeitswert. Der Profilabgleich zeigt, was bereits gespeichert ist.</p>
    </header>
    {needsRecovery && <section className={styles.partialNote} aria-label="Originalbelege ergänzen"><strong>Dem alten Bericht fehlen Abrufzeitpunkte.</strong><p>Die Inhalte sind sichtbar, können aber erst mit den Originalbelegen als Recherche übernommen werden. Lade die ursprüngliche JSON-Datei erneut. Nur fehlende Zeitpunkte identischer Belege werden ergänzt; die Profilangaben bleiben unverändert.</p>
      {onRecover && <label>Originalbericht laden<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
        const file=event.target.files?.[0];event.target.value="";if(!file)return;
        setRecovering(true);setRecoveryError("");try{await onRecover(file);setSelected([]);}catch(cause){setRecoveryError(cause instanceof Error?cause.message:"Originalbericht konnte nicht geladen werden.");}finally{setRecovering(false);}
      }}/></label>}{recovering && <p role="status">Originalbelege werden geprüft …</p>}{recoveryError && <p role="alert">{recoveryError}</p>}</section>}
    <div className={styles.knowledgeToolbar}>
      <label>Wissen durchsuchen<input type="search" disabled={busy} value={query} onChange={event => setQuery(event.target.value)} placeholder="Zum Beispiel Öffnungszeiten"/></label>
      <div role="group" aria-label="Angaben filtern">{([['ALL','Alle'],['PROPOSED','Vorschläge'],['OPEN','Offen']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={filter === key} disabled={busy} onClick={() => setFilter(key)}>{label} {key === "ALL" ? draft.results.length : key === "PROPOSED" ? proposed.length : open.length}</button>)}</div>
    </div>
    <div className={styles.knowledgeList}>
      {visible.map(result => {
        const eligible = proposed.includes(result);
        const own = Object.hasOwn(ownSaved,result.attributeKey);
        const missingTime = !result.citations?.length || result.citations.some(citation => !citation.observedAt);
        const title = researchFieldLabel(result.attributeKey);
        const citations = (result.citations ?? []).filter((citation,index,items) => items.findIndex(item => item.url === citation.url && item.evidence === citation.evidence && item.observedAt === citation.observedAt) === index);
        return <article className={styles.knowledgeCard} key={result.attributeKey} aria-label={title}>
          <header><h4>{title}</h4><span className={styles.stateBadge}>{eligible ? "Recherchevorschlag" : "Noch offen"}</span></header>
          {result.partialProfile && <p className={styles.partialNote}>Teilprofil: Belegte Angebote und Bereiche werden ergänzt. Bestehende Angaben bleiben erhalten; abweichende Merkmale brauchen eine eigene Prüfung.</p>}
          {result.partialHours && <p className={styles.partialNote}>Teilweiser Wochenplan: Nicht belegte Wochentage bleiben unverändert.</p>}
          {eligible ? <ResearchValue attributeKey={result.attributeKey} value={result.value}/> : <p className={styles.note}>{researchGapReason(result.reason)}</p>}
          {!!citations.length && <details className={styles.sourceDetails}><summary>Quellen & Belege ({citations.length})</summary>{citations.map((citation,index) => <blockquote key={index}><p>{citation.evidence}</p><a href={citation.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a>{citation.observedAt && <small>Abruf: {citation.observedAt.slice(0,10)}</small>}{citation.layoutReviewRequired && <small>Bild- oder PDF-Layout im Original prüfen.</small>}</blockquote>)}</details>}
          {own && <div className={styles.partialNote}><strong>Eigene Angabe im Profil gespeichert</strong><ResearchValue attributeKey={result.attributeKey} value={ownSaved[result.attributeKey]}/><p>Der Recherchevorschlag darüber bleibt als ursprünglicher Bericht erhalten.</p></div>}
          {post && AUTHORING_FIELDS.some(field => field.attributeKey === result.attributeKey) && (editing === result.attributeKey ? <ResearchFieldEditor spotId={draft.spotId} result={result} post={post}
            onClose={() => setEditing(null)} onSaved={value => {setOwnSaved(current=>({...current,[result.attributeKey]:value}));setSelected(current=>current.filter(key=>key!==result.attributeKey));setEditing(null);}}/>
            : <button type="button" className={styles.secondary} disabled={busy} onClick={()=>setEditing(result.attributeKey)}>{eligible || own ? "Angabe bearbeiten" : "Angabe selbst ergänzen"}</button>)}
          {eligible && onPrepare && !own && <label className={styles.reviewSelection}><input type="checkbox" disabled={busy || missingTime} checked={selected.includes(result.attributeKey)} onChange={event => setSelected(current => event.target.checked ? [...current,result.attributeKey] : current.filter(key => key !== result.attributeKey))}/><span>{missingTime ? "Originalbelege mit Abrufzeitpunkt zuerst ergänzen" : "Inhalt und Belege geprüft · für den Profilabgleich auswählen"}</span></label>}
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
