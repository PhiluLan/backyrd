"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxSpot } from "@/lib/researchInbox";
import { ResearchTaskReview } from "./ResearchTaskReview";

import styles from "./ResearchInbox.module.css";
type Snapshot={spots:InboxSpot[];checkedAt:string};
export function ResearchInbox({request,post,onTools}:{request(body?:unknown):Promise<unknown>;post(body:unknown):Promise<unknown>;onTools():void}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);const [tab,setTab]=useState<"open"|"done">("open");
  const [selected,setSelected]=useState<string|null>(null);
  const [reviewEditing,setReviewEditing]=useState(false);
  const [activeTask,setActiveTask]=useState<string|null>(null);
  const editingRef=useRef(false);
  useEffect(()=>{editingRef.current=!!selected || reviewEditing;},[selected,reviewEditing]);
  const activeRead=useRef<Promise<unknown>|null>(null);
  const sequence=useRef(0),working=useRef(false),detailRef=useRef<HTMLElement>(null);
  const refresh=useCallback(async(force=false)=>{
    if(force && activeRead.current)await activeRead.current.catch(()=>undefined);
    if(working.current && !force)return;working.current=true;const current=++sequence.current;await Promise.resolve();setBusy(true);
    try {const operation=request();activeRead.current=operation;const result=await operation as Snapshot;if(current===sequence.current){setSnapshot(result);setError("");}}
    catch{if(current===sequence.current)setError("Die Aufgaben konnten nicht aktualisiert werden. Bitte erneut versuchen. Angezeigte Angaben können veraltet sein.");}
    finally{activeRead.current=null;working.current=false;setBusy(false);}
  },[request]);
  const invalidate=useCallback(()=>{sequence.current++;},[]);
  useEffect(()=>{
    void Promise.resolve().then(()=>refresh());
    const visible=()=>{if(!editingRef.current && document.visibilityState==="visible")void refresh();};
    const timer=setInterval(visible,30_000);window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);window.addEventListener("backyrd:spot-profile-updated",visible);
    return()=>{invalidate();clearInterval(timer);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);window.removeEventListener("backyrd:spot-profile-updated",visible);};
  },[refresh,invalidate]);
  const spots=snapshot?.spots ?? [],pending=spots.filter(spot=>spot.tasks.length || spot.running || spot.failed || spot.unavailable),done=spots.filter(spot=>!pending.includes(spot));
  const spot=spots.find(item=>item.spotId===selected);
  const recover=async(file:File)=>{
    if(file.size>2_000_000){setError("Bitte eine Recherchedatei bis 2 MB wählen.");return;}
    if(working.current)return;working.current=true;setBusy(true);setError("");
    try{const result=await request({action:"recover",document:JSON.parse(await file.text())}) as {message:string};setNotice(result.message);working.current=false;await refresh();}
    catch{setError("Die offenen Angaben konnten nicht nachgetragen werden. Bitte die ursprüngliche Recherchedatei wählen und erneut versuchen.");}finally{working.current=false;setBusy(false);}
  };
  const open=(spotId:string)=>{setSelected(spotId);setActiveTask(null);setReviewEditing(false);setNotice("");requestAnimationFrame(()=>{detailRef.current?.scrollIntoView({block:"start",behavior:"smooth"});detailRef.current?.focus();});};
  const task=spot?.tasks.find(item=>item.fingerprint===activeTask) ?? spot?.tasks[0];
  const taskIndex=spot?.tasks.findIndex(item=>item.fingerprint===task?.fingerprint) ?? -1;
  const focusTask=()=>requestAnimationFrame(()=>{detailRef.current?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});detailRef.current?.focus();});
  const jumpToTask=(fingerprint:string)=>{setActiveTask(fingerprint);focusTask();};
  const decided=async(message:string)=>{setNotice(message);setActiveTask(null);await refresh(true);setReviewEditing(false);focusTask();};
  return <section className={styles.shell}>
    <header className={styles.header}><span className={styles.eyebrow}>WISSEN & QUALITÄT</span><h1>{spot?spot.name:"Deine Aufgaben"}</h1><p>{spot?"Eine Angabe nach der anderen: prüfen, entscheiden, weiter.":"Hier siehst du, welche Angaben du prüfen oder ergänzen kannst."}</p><div className={styles.actions}><button onClick={()=>void refresh()} disabled={busy || reviewEditing}>{busy?"Wird aktualisiert …":"Aktualisieren"}</button><button disabled={reviewEditing} onClick={onTools}>Neue Recherche</button></div>{snapshot && <small>Mit den Profilen abgeglichen: {new Date(snapshot.checkedAt).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}</small>}</header>
    {error ? <div role="alert" className={`${styles.error} ${styles.toast}`}><span>{error}</span><button aria-label="Meldung schliessen" onClick={()=>setError("")}>×</button></div> : notice && <div role="status" aria-atomic="true" className={`${styles.success} ${styles.toast}`}><span>{notice}</span><button aria-label="Meldung schliessen" onClick={()=>setNotice("")}>×</button></div>}
    {!spot && <nav className={styles.tabs} aria-label="Aufgaben anzeigen"><button disabled={reviewEditing} aria-pressed={tab==="open"} onClick={()=>{setTab("open");setSelected(null);}}>Offen {snapshot?`(${pending.length})`:""}</button><button disabled={reviewEditing} aria-pressed={tab==="done"} onClick={()=>{setTab("done");setSelected(null);}}>Erledigt {snapshot?`(${done.length})`:""}</button></nav>}
    {!snapshot && !error && <p role="status">Deine Aufgaben werden mit den aktuellen Profilen abgeglichen …</p>}
    {snapshot && <>
      {!spot && <><p className={styles.summary}>{tab==="open" ? `${pending.reduce((n,item)=>n+item.tasks.filter(task=>task.kind==="REVIEW").length,0)} Vorschläge prüfen · ${pending.reduce((n,item)=>n+item.tasks.filter(task=>task.kind==="MISSING").length,0)} Angaben ergänzen` : "Diese Berichte brauchen aktuell keine weitere Entscheidung."}</p>
      {(tab==="open"?pending:done).length===0 && <section className={styles.empty}><h2>{tab==="open"?"Alles erledigt.":"Noch keine erledigten Berichte."}</h2><p>{tab==="open"?"Zu den geladenen Rechercheberichten ist momentan nichts zu prüfen oder zu ergänzen.":"Abgeschlossene Aufgaben findest du später hier."}</p></section>}
      <div className={styles.list}>{(tab==="open"?pending:done).map(item=><article className={styles.card} key={item.spotId}><div><h2>{item.name}</h2><p>{item.unavailable?"Profil konnte nicht abgeglichen werden":item.running?"Recherche läuft …":item.failed?"Verarbeitung noch nicht vollständig bestätigt":item.tasks.length?`${item.tasks.filter(task=>task.kind==="REVIEW").length} prüfen · ${item.tasks.filter(task=>task.kind==="MISSING").length} ergänzen`:"Keine offene Entscheidung"}</p><small>Letzte Änderung: {new Date(item.updatedAt).toLocaleString("de-CH",{dateStyle:"short",timeStyle:"short"})}</small></div><button disabled={reviewEditing} className={styles.primary} onClick={()=>open(item.spotId)}>{tab==="open"?"Aufgaben ansehen":"Ansehen"} <span aria-hidden="true">→</span></button></article>)}</div>
      </>}
      {spot && <section className={styles.detail} ref={detailRef} tabIndex={-1} aria-label={`Aufgaben für ${spot.name}`}>
        <div className={styles.detailHeading}><button disabled={reviewEditing} onClick={()=>{setSelected(null);setActiveTask(null);setNotice("");}}>← Alle Orte</button><a href={`/spots/${spot.spotId}/edit`}>Ortprofil öffnen ↗</a></div>
        {spot.unavailable?<p role="alert">Das aktuelle Ortprofil konnte nicht geladen werden. Bitte aktualisiere die Seite. Es wurde nichts als erledigt markiert.</p>:<>
          {spot.failed && <p className={styles.error}>Ein früherer Recherchelauf ist nicht vollständig abgeschlossen. Die gefundenen Angaben kannst du hier trotzdem prüfen.</p>}
          {task?<><div className={styles.taskProgress}><strong>Aufgabe {taskIndex+1} von {spot.tasks.length}</strong><span>{spot.tasks.length} noch offen</span></div>
            <ResearchTaskReview key={`${spot.spotId}:${task.fingerprint}:${task.claimId ?? "none"}`} spotId={spot.spotId} task={task} request={request} post={post} onDecision={decided} onEditingChange={setReviewEditing}/>
            <nav className={styles.taskNavigation} aria-label="Zwischen Aufgaben wechseln"><button disabled={reviewEditing || taskIndex<=0} onClick={()=>jumpToTask(spot.tasks[taskIndex-1].fingerprint)}>← Vorherige</button><button disabled={reviewEditing} onClick={()=>{if(taskIndex+1<spot.tasks.length)jumpToTask(spot.tasks[taskIndex+1].fingerprint);else {setSelected(null);setActiveTask(null);}setNotice("Die vorige Frage bleibt offen. Du kannst sie später weiterprüfen.");}}>Später prüfen →</button></nav>
          </>:<div className={styles.success}><h3>Für diesen Ort ist alles bearbeitet.</h3><p>Angaben wurden gespeichert oder bewusst nicht übernommen. Weitere unbekannte Eigenschaften werden dadurch nicht als bestätigt ausgegeben.</p><button onClick={()=>setSelected(null)}>Zurück zur Übersicht</button></div>}
        </>}
      </section>}
    </>}
    <details className={styles.recovery}><summary>Offene Angaben aus einem früheren Bericht nachtragen</summary><p>Falls ein früherer Dateiimport seine offenen Fragen noch nicht hier abgelegt hat: Lade den ursprünglichen Bericht. Profilangaben werden dabei nicht verändert.</p><label>Recherchedatei auswählen<input disabled={busy || reviewEditing} type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void recover(file);event.target.value="";}}/></label></details>
  </section>;
}
