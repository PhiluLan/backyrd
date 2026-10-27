"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxSpot, InboxTask } from "@/lib/researchInbox";
import { ResearchFieldEditor } from "./ResearchFieldEditor";
import { ResearchValue, researchFieldLabel, researchGapReason } from "./ResearchValue";
import styles from "./ResearchInbox.module.css";
type Snapshot={spots:InboxSpot[];checkedAt:string};
export function ResearchInbox({request,post,onTools}:{request(body?:unknown):Promise<unknown>;post(body:unknown):Promise<unknown>;onTools():void}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);const [tab,setTab]=useState<"open"|"done">("open");
  const [selected,setSelected]=useState<string|null>(null);
  const [editing,setEditing]=useState<InboxTask|null>(null);
  const editingRef=useRef(false);
  useEffect(()=>{editingRef.current=!!editing;},[editing]);
  const sequence=useRef(0),working=useRef(false),detailRef=useRef<HTMLElement>(null);
  const refresh=useCallback(async()=>{
    if(working.current)return;working.current=true;const current=++sequence.current;await Promise.resolve();setBusy(true);
    try {const result=await request() as Snapshot;if(current===sequence.current){setSnapshot(result);setError("");}}
    catch{if(current===sequence.current)setError("Die Aufgaben konnten nicht aktualisiert werden. Bitte erneut versuchen. Angezeigte Angaben können veraltet sein.");}
    finally{working.current=false;setBusy(false);}
  },[request]);
  const invalidate=useCallback(()=>{sequence.current++;},[]);
  useEffect(()=>{
    void Promise.resolve().then(refresh);
    const visible=()=>{if(!editingRef.current && document.visibilityState==="visible")void refresh();};
    const timer=setInterval(visible,30_000);window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);window.addEventListener("backyrd:spot-profile-updated",visible);
    return()=>{invalidate();clearInterval(timer);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);window.removeEventListener("backyrd:spot-profile-updated",visible);};
  },[refresh,invalidate]);
  const spots=snapshot?.spots ?? [],pending=spots.filter(spot=>spot.tasks.length || spot.running || spot.failed || spot.unavailable),done=spots.filter(spot=>!pending.includes(spot));
  const spot=spots.find(item=>item.spotId===selected);
  const keep=async(task:InboxTask)=>{
    if(!spot || busy || working.current)return;working.current=true;setBusy(true);setError("");setNotice("");
    try{await request({action:"keep",spotId:spot.spotId,jobIds:task.jobIds,fingerprint:task.fingerprint,claimId:task.claimId});setNotice("Entscheidung gespeichert. Das Profil bleibt unverändert.");working.current=false;await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:"Die Entscheidung konnte nicht gespeichert werden.");}finally{working.current=false;setBusy(false);}
  };
  const recover=async(file:File)=>{
    if(file.size>2_000_000){setError("Bitte eine Recherchedatei bis 2 MB wählen.");return;}
    if(working.current)return;working.current=true;setBusy(true);setError("");
    try{const result=await request({action:"recover",document:JSON.parse(await file.text())}) as {message:string};setNotice(result.message);working.current=false;await refresh();}
    catch{setError("Die offenen Angaben konnten nicht nachgetragen werden. Bitte die ursprüngliche Recherchedatei wählen und erneut versuchen.");}finally{working.current=false;setBusy(false);}
  };
  const open=(spotId:string)=>{setSelected(spotId);setEditing(null);setNotice("");requestAnimationFrame(()=>{detailRef.current?.scrollIntoView({block:"start",behavior:"smooth"});detailRef.current?.focus();});};
  return <section className={styles.shell}>
    <header className={styles.header}><span className={styles.eyebrow}>WISSEN & QUALITÄT</span><h1>Deine Aufgaben</h1><p>Prüfen, ergänzen, fertig. Hier siehst du, was bei deinen Orten noch zu tun ist.</p><div className={styles.actions}><button onClick={()=>void refresh()} disabled={busy || !!editing}>{busy?"Wird aktualisiert …":"Aktualisieren"}</button><button disabled={!!editing} onClick={onTools}>Neue Recherche</button></div>{snapshot && <small>Mit den Profilen abgeglichen: {new Date(snapshot.checkedAt).toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}</small>}</header>
    {error && <div role="alert" className={styles.error}>{error}</div>}{notice && <div role="status" className={styles.success}>{notice}</div>}
    <nav className={styles.tabs} aria-label="Aufgaben anzeigen"><button disabled={!!editing} aria-pressed={tab==="open"} onClick={()=>{setTab("open");setSelected(null);setEditing(null);}}>Offen {snapshot?`(${pending.length})`:""}</button><button disabled={!!editing} aria-pressed={tab==="done"} onClick={()=>{setTab("done");setSelected(null);setEditing(null);}}>Erledigt {snapshot?`(${done.length})`:""}</button></nav>
    {!snapshot && !error && <p role="status">Deine Aufgaben werden mit den aktuellen Profilen abgeglichen …</p>}
    {snapshot && <>
      <p className={styles.summary}>{tab==="open" ? `${pending.reduce((n,item)=>n+item.tasks.filter(task=>task.kind==="REVIEW").length,0)} Vorschläge prüfen · ${pending.reduce((n,item)=>n+item.tasks.filter(task=>task.kind==="MISSING").length,0)} Angaben ergänzen` : "Diese Berichte brauchen aktuell keine weitere Entscheidung."}</p>
      {(tab==="open"?pending:done).length===0 && <section className={styles.empty}><h2>{tab==="open"?"Alles erledigt.":"Noch keine erledigten Berichte."}</h2><p>{tab==="open"?"Zu den geladenen Rechercheberichten ist momentan nichts zu prüfen oder zu ergänzen.":"Abgeschlossene Aufgaben findest du später hier."}</p></section>}
      <div className={styles.list}>{(tab==="open"?pending:done).map(item=><article className={styles.card} key={item.spotId}><div><h2>{item.name}</h2><p>{item.unavailable?"Profil konnte nicht abgeglichen werden":item.running?"Recherche läuft …":item.failed?"Verarbeitung noch nicht vollständig bestätigt":item.tasks.length?`${item.tasks.filter(task=>task.kind==="REVIEW").length} prüfen · ${item.tasks.filter(task=>task.kind==="MISSING").length} ergänzen`:"Keine offene Entscheidung"}</p><small>Letzte Änderung: {new Date(item.updatedAt).toLocaleString("de-CH",{dateStyle:"short",timeStyle:"short"})}</small></div><button disabled={!!editing} className={styles.primary} onClick={()=>open(item.spotId)}>{tab==="open"?"Aufgaben ansehen":"Ansehen"} <span aria-hidden="true">→</span></button></article>)}</div>
      {spot && <section className={styles.detail} ref={detailRef} tabIndex={-1} aria-label={`Aufgaben für ${spot.name}`}><div className={styles.detailHeading}><h2>{spot.name}</h2><button onClick={()=>{if(!editing){setSelected(null);}else setNotice("Bitte zuerst den offenen Editor speichern oder schliessen.");}}>Schliessen</button></div><a href={`/spots/${spot.spotId}/edit`}>Ortprofil öffnen ↗</a>
        {spot.unavailable?<p role="alert">Das Profil konnte nicht geladen werden. Bitte aktualisieren; Aufgaben werden deshalb nicht als erledigt gezählt.</p>:<>
        {spot.failed && <p className={styles.error}>Mindestens ein Recherchelauf konnte nicht vollständig bestätigt werden. Die offenen Angaben bleiben erhalten. Über „Neue Recherche / Datei laden“ kannst du den Lauf erneut prüfen.</p>}
        {!spot.tasks.length && !spot.failed && <p className={styles.success}>Hier ist nichts mehr offen. Angaben sind im Profil enthalten oder wurden bewusst nicht übernommen.</p>}
        {(["REVIEW","MISSING"] as const).map(kind=>spot.tasks.some(task=>task.kind===kind)&&<div key={kind}><h3>{kind==="REVIEW"?"Vorschläge prüfen":"Angaben ergänzen"}</h3>{kind==="MISSING" && <p>Hier hat die Recherche keine eindeutige Angabe gefunden. Du kannst dein Wissen ergänzen oder die Frage ohne Angabe abschliessen.</p>}{spot.tasks.filter(task=>task.kind===kind).map(task=><article key={task.fingerprint} className={styles.task}><h4>{researchFieldLabel(task.attributeKey)}</h4><p>{task.reason?researchGapReason(task.reason):kind==="MISSING"?"Noch kein eindeutiger Beleg gefunden.":"Bitte mit dem bestehenden Profil vergleichen."}</p>{task.value!==undefined && <><span className={styles.eyebrow}>RECHERCHEVORSCHLAG</span><details><summary>Vorschlag ansehen</summary><ResearchValue attributeKey={task.attributeKey} value={task.value}/></details></>}{task.currentValue!==undefined && <details><summary>Aktuell im Profil</summary><ResearchValue attributeKey={task.attributeKey} value={task.currentValue}/></details>}{!!task.citations?.length && <details><summary>Quellen ansehen</summary>{task.citations.map((citation,index)=><blockquote key={index}><p>{citation.evidence}</p><a href={citation.url} rel="noreferrer" target="_blank">Quelle öffnen ↗</a></blockquote>)}</details>}
          {editing?.fingerprint===task.fingerprint ? <ResearchFieldEditor spotId={spot.spotId} result={editing} post={post} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setNotice("Angabe im Profil gespeichert und bestätigt. Die Aufgaben werden neu abgeglichen.");void refresh();}}/>:<div className={styles.actions}><button className={styles.primary} disabled={busy || !!editing} onClick={()=>setEditing(task)}>{kind==="MISSING"?"Angabe ergänzen":"Prüfen & speichern"}</button><button disabled={busy || !!editing} onClick={()=>void keep(task)}>{task.currentValue!==undefined?"Profil so behalten":task.value===undefined?"Ohne Angabe abschliessen":"Nicht übernehmen"}</button></div>}</article>)}</div>)}
        </>}
      </section>}
    </>}
    <details className={styles.recovery}><summary>Offene Angaben aus einem früheren Bericht nachtragen</summary><p>Falls ein früherer Dateiimport seine offenen Fragen noch nicht hier abgelegt hat: Lade den ursprünglichen Bericht. Profilangaben werden dabei nicht verändert.</p><label>Recherchedatei auswählen<input disabled={busy || !!editing} type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void recover(file);event.target.value="";}}/></label></details>
  </section>;
}
