"use client";

import { useEffect, useState } from "react";
import styles from "./WorldResearchBatchPanel.module.css";
import { type NuknukDraft } from "@/lib/nuknukResearchDraft";
import { ResearchActionFeedback } from "./ResearchActionFeedback";
import type { ResearchFeedback } from "@/lib/researchSaveFeedback";
import { ResearchFieldEditor } from "./ResearchFieldEditor";
import { AUTHORING_FIELDS } from "@backyrd/world-knowledge-core/browser";
import { ResearchValue, researchFieldLabel, researchGapReason } from "./ResearchValue";

export type DraftReviewState = { fields:Array<{attributeKey:string;covered:boolean;claimId:string|null;currentValue?:unknown}>;manifestHash:string };

export function NuknukDraftPreview({ draft, onClose, onSave, saved, saving, error, onPrepare, preparing = false, post, onRecover, reviewState, onComplete, onReviewRefresh, archived = false }: {
  draft: NuknukDraft; onClose: () => void; onSave: () => void; saved: boolean; saving: boolean; error: string;
  reviewState?: DraftReviewState | null; onComplete?: (kept:Record<string,string|null>,manifestHash:string)=>Promise<void>; onReviewRefresh?:()=>Promise<void>; archived?:boolean;
  onPrepare?: (reviewedKeys: string[]) => void; preparing?: boolean; post?: (body:unknown)=>Promise<unknown>; onRecover?: (file:File)=>Promise<void>;
}) {
  const [kept,setKept] = useState<Record<string,string|null>>({});
  const [closing,setClosing] = useState(false);
  const [closeError,setCloseError] = useState("");
  const [profileAnswers,setProfileAnswers] = useState<Record<string,{knowledgeState:string;value:unknown}>>({});
  const [profileError,setProfileError] = useState(false);
  useEffect(() => {
    if(!post)return;
    let active=true;
    void post({action:"edit-field",spotId:draft.spotId}).then(value=>{if(active){setProfileAnswers((value as {answers:typeof profileAnswers}).answers);setProfileError(false);}}).catch(()=>{if(active)setProfileError(true);});
    return ()=>{active=false;};
  },[post,draft.spotId]);
  const [saveNotice,setSaveNotice] = useState<ResearchFeedback | null>(null);
  const [editing,setEditing] = useState<string | null>(null);
  const [ownSaved,setOwnSaved] = useState<Record<string,unknown>>({});
  const [recovering,setRecovering] = useState(false);
  const [recoveryError,setRecoveryError] = useState("");
  const needsRecovery = draft.results.some(result => result.status === "REQUIRES_REVIEW" && result.citations?.some(citation => !citation.observedAt));
  const [filter, setFilter] = useState<"ALL" | "PROPOSED" | "OPEN">("ALL");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const proposed = draft.results.filter(item => item.value !== undefined && item.status === "REQUIRES_REVIEW" && !reviewState?.fields.find(field=>field.attributeKey === item.attributeKey)?.covered);
  const open = draft.results.filter(item => !proposed.includes(item) && !reviewState?.fields.find(field=>field.attributeKey === item.attributeKey)?.covered && !Object.hasOwn(ownSaved,item.attributeKey) && (!profileAnswers[item.attributeKey] || profileAnswers[item.attributeKey].knowledgeState === "UNKNOWN"));
  const visible = draft.results.filter(item => (filter === "ALL" || (filter === "PROPOSED" ? proposed.includes(item) : open.includes(item)))
    && researchFieldLabel(item.attributeKey).toLocaleLowerCase("de-CH").includes(query.toLocaleLowerCase("de-CH")));
  const busy = saving || preparing || recovering || closing || editing !== null;
  const remaining = reviewState?.fields.filter(field => !field.covered) ?? [];
  const canClose = !!reviewState && remaining.every(field => Object.hasOwn(kept,field.attributeKey) && kept[field.attributeKey] === field.claimId);
  return <div className={styles.draft}>
    <header className={styles.draftHeader}>
      <span className={styles.eyebrow}>RECHERCHEBERICHT</span><h3>{draft.name}</h3>
      <p>Prüfe die Vorschläge und ihre Quellen. Erst nach dem Abgleich mit dem bestehenden Profil entscheidest du, was übernommen wird.</p>
      <div className={styles.summaryGrid}><div><strong>{proposed.length}</strong><span>Angaben mit Vorschlag</span></div><div><strong>{open.length}</strong><span>Noch offen</span></div><div><strong>{archived ? "Archiviert" : saved ? "Gesichert" : "Lokal"}</strong><span>{archived ? "Prüfung abgeschlossen" : saved ? "Bericht im Admin gespeichert" : "Bericht noch nicht gespeichert"}</span></div></div>
      <p className={styles.note}>Ein gespeicherter Bericht ändert noch keine Profilangaben. Die Anzahl der Vorschläge ist kein Vollständigkeitswert. Der Profilabgleich zeigt, was bereits gespeichert ist.</p>
    </header>
    {needsRecovery && <section className={styles.partialNote} aria-label="Originalbelege ergänzen"><strong>Dem alten Bericht fehlen Abrufzeitpunkte.</strong><p>Die Inhalte sind sichtbar, können aber erst mit den Originalbelegen als Recherche übernommen werden. Lade die ursprüngliche JSON-Datei erneut. Nur fehlende Zeitpunkte identischer Belege werden ergänzt; die Profilangaben bleiben unverändert.</p>
      {onRecover && <label>Originalbericht laden<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
        const file=event.target.files?.[0];event.target.value="";if(!file)return;
        setRecovering(true);setRecoveryError("");try{await onRecover(file);setSelected([]);}catch(cause){setRecoveryError(cause instanceof Error?cause.message:"Originalbericht konnte nicht geladen werden.");}finally{setRecovering(false);}
      }}/></label>}{recovering && <p role="status">Originalbelege werden geprüft …</p>}{recoveryError && <p role="alert">{recoveryError}</p>}</section>}
    {profileError && <p className={styles.partialNote}>Der gespeicherte Profilstand konnte nicht geladen werden. Die Anzeige zeigt den Recherchebericht; beim Bearbeiten und Profilabgleich wird der aktuelle Stand erneut geprüft.</p>}
    {saveNotice && <ResearchActionFeedback feedback={saveNotice} focus/>}
    <div className={styles.knowledgeToolbar}>
      <label>Wissen durchsuchen<input type="search" disabled={busy} value={query} onChange={event => setQuery(event.target.value)} placeholder="Zum Beispiel Öffnungszeiten"/></label>
      <div role="group" aria-label="Angaben filtern">{([['ALL','Alle'],['PROPOSED','Vorschläge'],['OPEN','Offen']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={filter === key} disabled={busy} onClick={() => setFilter(key)}>{label} {key === "ALL" ? draft.results.length : key === "PROPOSED" ? proposed.length : open.length}</button>)}</div>
    </div>
    <div className={styles.knowledgeList}>
      {visible.map(result => {
        const covered = reviewState?.fields.find(field => field.attributeKey === result.attributeKey)?.covered === true;
        const eligible = proposed.includes(result) && !covered;
        const own = Object.hasOwn(ownSaved,result.attributeKey);
        const missingTime = !result.citations?.length || result.citations.some(citation => !citation.observedAt);
        const existing = !eligible && profileAnswers[result.attributeKey]?.knowledgeState !== "UNKNOWN" ? profileAnswers[result.attributeKey] : undefined;
        const title = researchFieldLabel(result.attributeKey);
        const citations = (result.citations ?? []).filter((citation,index,items) => items.findIndex(item => item.url === citation.url && item.evidence === citation.evidence && item.observedAt === citation.observedAt) === index);
        return <article className={styles.knowledgeCard} key={result.attributeKey} aria-label={title}>
          <header><h4>{title}</h4><span className={styles.stateBadge}>{own ? "Im Profil gespeichert" : covered ? "Im Profil bestätigt" : eligible ? "Recherchevorschlag" : existing ? "Im Profil vorhanden" : "Noch offen"}</span></header>
          {result.partialProfile && <p className={styles.partialNote}>Teilprofil: Belegte Angebote und Bereiche werden ergänzt. Bestehende Angaben bleiben erhalten; abweichende Merkmale brauchen eine eigene Prüfung.</p>}
          {result.partialHours && <p className={styles.partialNote}>Teilweiser Wochenplan: Nicht belegte Wochentage bleiben unverändert.</p>}
          {covered ? <><ResearchValue attributeKey={result.attributeKey} value={profileAnswers[result.attributeKey]?.value ?? result.value}/><p className={styles.note}>Mit dem gespeicherten Profil abgeglichen. Hier ist nichts mehr zu übernehmen.</p></> : eligible ? <ResearchValue attributeKey={result.attributeKey} value={result.value}/> : existing ? <><ResearchValue attributeKey={result.attributeKey} value={existing.value}/><p className={styles.note}>Bereits im Profil gespeichert. Die Recherche selbst hatte hierfür keinen Vorschlag.</p></> : <p className={styles.note}>{researchGapReason(result.reason)}</p>}
          {!!citations.length && <details className={styles.sourceDetails}><summary>Quellen & Belege ({citations.length})</summary>{citations.map((citation,index) => <blockquote key={index}><p>{citation.evidence}</p><a href={citation.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a>{citation.observedAt && <small>Abruf: {citation.observedAt.slice(0,10)}</small>}{citation.layoutReviewRequired && <small>Bild- oder PDF-Layout im Original prüfen.</small>}</blockquote>)}</details>}
          {own && <div className={styles.partialNote}><strong>Eigene Angabe im Profil gespeichert</strong><ResearchValue attributeKey={result.attributeKey} value={ownSaved[result.attributeKey]}/><p>Der Recherchevorschlag darüber bleibt als ursprünglicher Bericht erhalten.</p></div>}
          {!archived && post && AUTHORING_FIELDS.some(field => field.attributeKey === result.attributeKey) && (editing === result.attributeKey ? <ResearchFieldEditor spotId={draft.spotId} result={result} post={post}
            onClose={() => setEditing(null)} onSaved={(value,knowledgeState) => {setSaveNotice({kind:"success",title:`${title} gespeichert`,message:knowledgeState === "UNKNOWN" ? `Die Angabe ist im Profil von ${draft.name} bewusst als unbekannt hinterlegt.` : `Die Angabe ist jetzt im Profil von ${draft.name} hinterlegt. Der gespeicherte Wert wurde erfolgreich zurückgelesen.`});setOwnSaved(current=>({...current,[result.attributeKey]:value}));setSelected(current=>current.filter(key=>key!==result.attributeKey));setEditing(null);void onReviewRefresh?.().catch(()=>setCloseError("Die Angabe ist gespeichert. Der Abschlussstand konnte noch nicht aktualisiert werden; bitte den Bericht neu öffnen."));}}/>
            : <button type="button" className={styles.secondary} disabled={busy} onClick={()=>{setSaveNotice(null);setEditing(result.attributeKey);}}>{eligible || own || covered ? "Angabe bearbeiten" : "Angabe selbst ergänzen"}</button>)}
          {!archived && eligible && onPrepare && !own && <label className={styles.reviewSelection}><input type="checkbox" disabled={busy || missingTime} checked={selected.includes(result.attributeKey)} onChange={event => setSelected(current => event.target.checked ? [...current,result.attributeKey] : current.filter(key => key !== result.attributeKey))}/><span>{missingTime ? "Originalbelege mit Abrufzeitpunkt zuerst ergänzen" : "Inhalt und Belege geprüft · für den Profilabgleich auswählen"}</span></label>}
        </article>;
      })}
      {!visible.length && <p className={styles.note} role="status">Keine Angaben für diesen Filter gefunden.</p>}
    </div>
    {!archived && saved && reviewState && onComplete && <section className={styles.stage} aria-label="Prüfung abschliessen">
      <h4>{remaining.length ? `${remaining.length} ${remaining.length === 1 ? "Abweichung" : "Abweichungen"} noch entscheiden` : "Alle Vorschläge im Profil abgeglichen"}</h4>
      <p>{remaining.length ? "Übernimm oder bearbeite die Angaben oben. Du kannst stattdessen ausdrücklich den gespeicherten Profilstand behalten oder einen noch nicht gespeicherten Vorschlag verwerfen." : "Die recherchierten Vorschläge sind im gespeicherten Profil enthalten. Schliesse die Prüfung ab, um den Bericht zu archivieren."}</p>
      {remaining.map(field => <article className={styles.review} key={field.attributeKey}><h5>{researchFieldLabel(field.attributeKey)}</h5><small>Aktuell im Profil</small>{field.claimId ? <ResearchValue attributeKey={field.attributeKey} value={field.currentValue}/> : <p>Keine gespeicherte Angabe.</p>}<label className={styles.reviewSelection}><input type="checkbox" disabled={busy} checked={Object.hasOwn(kept,field.attributeKey) && kept[field.attributeKey] === field.claimId} onChange={event=>setKept(current=>{const next={...current};if(event.target.checked)next[field.attributeKey]=field.claimId;else delete next[field.attributeKey];return next;})}/><span>{field.claimId ? "Gespeicherte Angabe bewusst behalten" : "Diesen Recherchevorschlag nicht übernehmen"}</span></label></article>)}
      <p>Offene Recherchefragen bleiben offen. Archivieren ändert keine Profilangaben; der Bericht bleibt im Archiv erhalten.</p>
      <button type="button" className={styles.primary} disabled={busy || !canClose} onClick={async()=>{setClosing(true);setCloseError("");try{await onComplete(kept,reviewState.manifestHash);}catch(cause){setCloseError(cause instanceof Error ? cause.message : "Der Abschluss konnte nicht bestätigt werden.");}finally{setClosing(false);}}}>{closing ? "Abschluss wird geprüft …" : "Prüfung abschliessen und archivieren"}</button>
      {closeError && <p role="alert" className={styles.error}>{closeError}</p>}
    </section>}
    <section className={styles.stage} aria-label="Recherchebericht verwalten">
      <p className={styles.note}>{draft.version} · {draft.requests ?? "?"} Quellenabrufe · {draft.modelCalls ?? "?"} Modellaufrufe</p>
      {!!draft.sourceFailures?.length && <details className={styles.details}><summary>Nicht erreichbare Quellen ({draft.sourceFailures.length})</summary><ul>{draft.sourceFailures.map((failure,index) => <li key={index}><a href={failure.url} target="_blank" rel="noreferrer">Quelle öffnen</a> · {researchGapReason(failure.reason)}</li>)}</ul></details>}
      {!!draft.limitations?.length && <p className={styles.note}>Die Recherche ist kein Nachweis vollständiger Angaben. Nicht ausgewertete Bilder und PDF-Layouts können weitere Informationen enthalten.</p>}
      {saved ? <p className={styles.note} role="status">Recherchebericht gesichert. Profilangaben werden erst mit ihrer jeweiligen Bestätigung gespeichert.</p> : <button type="button" className={styles.secondary} disabled={busy} onClick={onSave}>{saving ? "Bericht wird gespeichert …" : "Bericht im Admin sichern"}</button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Zurück zur Recherche</button>
    </section>
    {!archived && onPrepare && editing === null && <div className={styles.footer}><span>{selected.length} Angaben ausgewählt · der Abgleich speichert noch nichts</span><button type="button" className={styles.primary} disabled={busy || !selected.length} onClick={() => onPrepare(selected)}>{preparing ? "Profil wird abgeglichen …" : "Auswahl mit Spotprofil abgleichen"}</button></div>}
  </div>;
}
