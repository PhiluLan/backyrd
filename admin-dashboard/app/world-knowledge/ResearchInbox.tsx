"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxSpot } from "@/lib/researchInbox";
import { ResearchTaskReview } from "./ResearchTaskReview";

import styles from "./ResearchInbox.module.css";
type SpotSummary=Omit<InboxSpot,"tasks"> & {needsReview:boolean};
type SpotDetail=InboxSpot & {needsReview:boolean};
type Snapshot={spots:SpotSummary[];checkedAt:string};
type InboxTab = "recent" | "older" | "done";
const recentWindow = 7 * 24 * 60 * 60 * 1000;
const pageSize = 20;
const researchStatusTitle = {
  QUEUED: "Recherche in der Warteschlange",
  RUNNING: "Recherche läuft",
} as const;
const reportDate = new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeZone: "Europe/Zurich" });
export function ResearchInbox({request,post,onTools}:{request(body?:unknown,spotId?:string):Promise<unknown>;post(body:unknown):Promise<unknown>;onTools():void}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [tab, setTab] = useState<InboxTab>("recent");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [selected,setSelected]=useState<string|null>(null);
  const [spotDetail,setSpotDetail]=useState<SpotDetail|null>(null);
  const [detailError,setDetailError]=useState("");
  const selectedRef=useRef<string|null>(null);
  const detailsRevision=useRef(0);
  const verifiedSummaries=useRef(new Map<string,{needsReview:boolean;updatedAt:string}>());
  const [reviewEditing,setReviewEditing]=useState(false);
  const [activeTask,setActiveTask]=useState<string|null>(null);
  const pauseRefresh=useRef(false);
  const sequence=useRef(0),working=useRef(false),detailRef=useRef<HTMLElement>(null);
  const refresh=useCallback(async()=>{
    if(working.current)return;working.current=true;const current=++sequence.current;await Promise.resolve();setBusy(true);
    try {const result=await request() as Snapshot;if(current===sequence.current){
      setSnapshot({...result,spots:result.spots.map(spot=>{
        const verified=verifiedSummaries.current.get(spot.spotId);
        return verified?.updatedAt===spot.updatedAt?{...spot,needsReview:verified.needsReview}:spot;
      })});setError("");
    }}
    catch{if(current===sequence.current)setError("Die Aufgaben konnten nicht aktualisiert werden. Bitte erneut versuchen. Angezeigte Angaben können veraltet sein.");}
    finally{working.current=false;setBusy(false);}
  },[request]);
  const invalidate=useCallback(()=>{sequence.current++;},[]);
  const updateSummary=useCallback((spot:SpotDetail)=>{
    const {tasks,...summary}=spot;
    const needsReview=tasks.length>0;
    verifiedSummaries.current.set(spot.spotId,{needsReview,updatedAt:spot.updatedAt});
    setSnapshot(previous=>previous && {...previous,spots:previous.spots.map(item=>
      item.spotId===spot.spotId?{...summary,needsReview}:item)});
  },[]);
  const loadDetail=useCallback(async(spotId:string)=>{
    const revision=++detailsRevision.current;
    try {
      const result=await request(undefined,spotId) as {spot:SpotDetail};
      if(selectedRef.current!==spotId || detailsRevision.current!==revision)return;
      if(!result.spot || result.spot.spotId!==spotId)throw new Error("Ungültiger Recherchebericht.");
      setSpotDetail(result.spot);setDetailError("");updateSummary(result.spot);
    } catch {
      if(selectedRef.current===spotId && detailsRevision.current===revision) {
        setDetailError("Die Aufgaben für diesen Ort konnten nicht aktualisiert werden. Bitte versuche es erneut.");
      }
    }
  },[request,updateSummary]);
  const refreshVisible=useCallback(()=>{
    const current=selectedRef.current;
    if(current)void loadDetail(current);
    else void refresh();
  },[loadDetail,refresh]);
  const close=()=>{
    selectedRef.current=null;detailsRevision.current++;setSelected(null);setSpotDetail(null);
    setDetailError("");setActiveTask(null);setNotice("");
  };
  useEffect(()=>{
    void Promise.resolve().then(()=>refresh());
    const visible=()=>{if(!pauseRefresh.current && document.visibilityState==="visible")refreshVisible();};
    const timer=setInterval(visible,30_000);window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);window.addEventListener("backyrd:spot-profile-updated",visible);
    return()=>{invalidate();clearInterval(timer);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);window.removeEventListener("backyrd:spot-profile-updated",visible);};
  },[refresh,refreshVisible,invalidate]);
  const spots = snapshot?.spots ?? [];
  const groups: Record<InboxTab, SpotSummary[]> = { recent: [], older: [], done: [] };
  const cutoff = snapshot ? Date.parse(snapshot.checkedAt) - recentWindow : 0;
  for (const item of spots) {
    const open = item.needsReview || item.researchStatus || item.failed || item.unavailable;
    if (!open) groups.done.push(item);
    else if (Date.parse(item.latestReportAt) >= cutoff) groups.recent.push(item);
    else groups.older.push(item);
  }
  const query = search.trim().toLocaleLowerCase("de-CH");
  const results = groups[tab].filter(item => item.name.toLocaleLowerCase("de-CH").includes(query));
  const selectTab = (next: InboxTab) => {
    setTab(next);
    close();
    setVisibleCount(pageSize);
  };
  const spot=spots.find(item=>item.spotId===selected);
  const detail=spotDetail?.spotId===selected?spotDetail:null;
  const recover=async(file:File)=>{
    if(file.size>2_000_000){setError("Bitte eine Recherchedatei bis 2 MB wählen.");return;}
    if(working.current)return;working.current=true;setBusy(true);setError("");
    try{const result=await request({action:"recover",document:JSON.parse(await file.text())}) as {message:string};setNotice(result.message);working.current=false;await refresh();}
    catch{setError("Die offenen Angaben konnten nicht nachgetragen werden. Bitte die ursprüngliche Recherchedatei wählen und erneut versuchen.");}finally{working.current=false;setBusy(false);}
  };
  const focusTask=()=>requestAnimationFrame(()=>{detailRef.current?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});detailRef.current?.focus();});
  const open=(spotId:string)=>{
    selectedRef.current=spotId;setSelected(spotId);setSpotDetail(null);setDetailError("");
    setActiveTask(null);setReviewEditing(false);setNotice("");
    void loadDetail(spotId);focusTask();
  };
  const task=detail?.tasks.find(item=>item.fingerprint===activeTask) ?? detail?.tasks[0];
  const taskIndex=detail?.tasks.findIndex(item=>item.fingerprint===task?.fingerprint) ?? -1;
  const researchStatus=detail?.researchStatus;
  const shouldPauseRefresh=reviewEditing || (!!selected && (!researchStatus || !!task));
  useEffect(()=>{pauseRefresh.current=shouldPauseRefresh;},[shouldPauseRefresh]);
  const jumpToTask=(fingerprint:string)=>{setActiveTask(fingerprint);focusTask();};
  const decided=(message:string)=>{
    if(!detail || !task)return;
    const remaining=detail.tasks.filter(item=>item.fingerprint!==task.fingerprint);
    const next=remaining[taskIndex] ?? remaining[0];
    const updated={...detail,tasks:remaining,needsReview:remaining.length>0};
    detailsRevision.current++;
    setNotice(message);setSpotDetail(updated);updateSummary(updated);
    setActiveTask(next?.fingerprint ?? null);setReviewEditing(false);focusTask();
    if(!next || remaining.some(item=>item.attributeKey===task.attributeKey))void loadDetail(detail.spotId);
  };
  return <section className={styles.shell}>
    <header className={styles.header}><span className={styles.eyebrow}>WISSEN & QUALITÄT</span><h1>{spot?spot.name:"Deine Aufgaben"}</h1><p>{spot?"Eine Angabe nach der anderen: prüfen, entscheiden, weiter.":"Hier siehst du, welche Angaben du prüfen oder ergänzen kannst."}</p><div className={styles.actions}><button onClick={refreshVisible} disabled={busy || reviewEditing}>{busy?"Wird aktualisiert …":"Aktualisieren"}</button><button disabled={reviewEditing} onClick={onTools}>Neue Recherche</button></div>{snapshot && <small>Übersicht geladen um {new Date(snapshot.checkedAt).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}</small>}</header>
    {error ? <div role="alert" className={`${styles.error} ${styles.toast}`}><span>{error}</span><button aria-label="Meldung schliessen" onClick={()=>setError("")}>×</button></div> : notice && <div role="status" aria-atomic="true" className={`${styles.success} ${styles.toast}`}><span>{notice}</span><button aria-label="Meldung schliessen" onClick={()=>setNotice("")}>×</button></div>}
    {!spot && (
      <nav className={styles.tabs} aria-label="Aufgaben anzeigen">
        <button disabled={reviewEditing} aria-pressed={tab === "recent"} onClick={() => selectTab("recent")}>Aktuell {snapshot ? `(${groups.recent.length})` : ""}</button>
        <button disabled={reviewEditing} aria-pressed={tab === "older"} onClick={() => selectTab("older")}>Älter {snapshot ? `(${groups.older.length})` : ""}</button>
        <button disabled={reviewEditing} aria-pressed={tab === "done"} onClick={() => selectTab("done")}>Erledigt {snapshot ? `(${groups.done.length})` : ""}</button>
      </nav>
    )}
    {!snapshot && !error && <p role="status">Deine Aufgaben werden geladen …</p>}
    {snapshot && <>
      {!spot && <>
        <p className={styles.summary}>{tab === "recent"
          ? "Rechercheberichte der letzten 7 Tage. Beim Öffnen werden die Angaben mit dem Ortprofil abgeglichen."
          : tab === "older" ? "Frühere Rechercheberichte zur Prüfung."
            : "Diese Berichte brauchen aktuell keine weitere Entscheidung."}</p>
        <label className={styles.search}>
          Spot suchen
          <input type="search" value={search} onChange={event => {
            setSearch(event.target.value);
            setVisibleCount(pageSize);
          }} />
        </label>
        {results.length === 0 ? (
          <section className={styles.empty}>
            <h2>{query ? "Keine passenden Spots" : tab === "done" ? "Noch keine erledigten Berichte" : "Hier ist nichts offen"}</h2>
            {tab === "recent" && !query && groups.older.length > 0 &&
              <button onClick={() => selectTab("older")}>Ältere offene Aufgaben ansehen</button>}
          </section>
        ) : (
          <>
            <div className={styles.list}>{results.slice(0, visibleCount).map(item => {
              return <article className={styles.card} key={item.spotId}>
                <div>
                  <h2>{item.name}</h2>
                  <p>{item.unavailable ? "Profil konnte nicht abgeglichen werden" : item.researchStatus ? researchStatusTitle[item.researchStatus]
                    : item.failed ? "Verarbeitung noch nicht vollständig bestätigt" : item.needsReview
                      ? "Angaben zur Prüfung" : "Keine offene Entscheidung"}</p>
                  <small>Letzter Recherchebericht vom {reportDate.format(new Date(item.latestReportAt))}</small>
                </div>
                <button disabled={reviewEditing} className={styles.primary} onClick={() => open(item.spotId)}>
                  {tab === "done" ? "Ansehen" : "Aufgaben ansehen"} <span aria-hidden="true">→</span>
                </button>
              </article>;
            })}</div>
            {results.length > visibleCount && <div className={styles.more}>
              <span>{visibleCount} von {results.length} Spots</span>
              <button onClick={() => setVisibleCount(count => count + pageSize)}>Weitere Spots anzeigen</button>
            </div>}
          </>
        )}
      </>}
      {spot && <section className={styles.detail} ref={detailRef} tabIndex={-1} aria-label={`Aufgaben für ${spot.name}`}>
        <div className={styles.detailHeading}><button disabled={reviewEditing} onClick={close}>← Alle Orte</button><a href={`/spots/${spot.spotId}/edit`}>Ortprofil öffnen ↗</a></div>
        {detailError && <p className={styles.error} role="alert">{detailError}</p>}
        {!detail && !detailError && <p role="status">Ortprofil wird abgeglichen …</p>}
        {detail && <>
          {researchStatus && <div className={styles.pending} role="status">
            <h3>{researchStatusTitle[researchStatus]}</h3>
            <p>{task
              ? "Die offenen Aufgaben aus bisherigen Berichten kannst du bereits prüfen."
              : "Sobald Ergebnisse zur Prüfung vorliegen, erscheinen sie hier automatisch."}</p>
          </div>}
          {spot.failed && !researchStatus && <p className={styles.error} role="status">
            {task ? "Die Recherche wurde nicht vollständig abgeschlossen. Die gefundenen Angaben kannst du trotzdem prüfen."
              : "Die Recherche wurde nicht vollständig abgeschlossen. Es liegen keine Angaben zur Prüfung vor."}
          </p>}
          {task?<><div className={styles.taskProgress}><strong>Aufgabe {taskIndex+1} von {detail.tasks.length}</strong><span>{detail.tasks.length} noch offen</span></div>
            <ResearchTaskReview key={`${spot.spotId}:${task.fingerprint}:${task.claimId ?? "none"}`} spotId={spot.spotId} task={task} request={request} post={post} onDecision={decided} onEditingChange={setReviewEditing}/>
            <nav className={styles.taskNavigation} aria-label="Zwischen Aufgaben wechseln"><button disabled={reviewEditing || taskIndex<=0} onClick={()=>jumpToTask(detail.tasks[taskIndex-1].fingerprint)}>← Vorherige</button><button disabled={reviewEditing} onClick={()=>{if(taskIndex+1<detail.tasks.length)jumpToTask(detail.tasks[taskIndex+1].fingerprint);else close();setNotice("Die vorige Frage bleibt offen. Du kannst sie später weiterprüfen.");}}>Später prüfen →</button></nav>
          </>:!researchStatus && !spot.failed && <div className={styles.success}><h3>Keine offenen Aufgaben</h3><p>Für diesen Ort liegt derzeit nichts zur Prüfung vor.</p><button onClick={close}>Zurück zur Übersicht</button></div>}
        </>}
      </section>}
    </>}
    <details className={styles.recovery}><summary>Offene Angaben aus einem früheren Bericht nachtragen</summary><p>Falls ein früherer Dateiimport seine offenen Fragen noch nicht hier abgelegt hat: Lade den ursprünglichen Bericht. Profilangaben werden dabei nicht verändert.</p><label>Recherchedatei auswählen<input disabled={busy || reviewEditing} type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void recover(file);event.target.value="";}}/></label></details>
  </section>;
}
