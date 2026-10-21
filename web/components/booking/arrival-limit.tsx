"use client";

import { useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, bookingWriteUncertain, readArrivalLimit, saveArrivalLimit, type ArrivalLimit, type ArrivalLimitIntent } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export function ArrivalLimitEditor({ spotId, actorId, online, isCurrent, onBusy, onDenied, onClose }: {
  spotId: string; actorId: string; online: boolean; isCurrent: () => boolean; onBusy: (busy: boolean) => void; onDenied: () => void; onClose: (uncertain: boolean, reviewed: boolean) => void;
}) {
  const [load,setLoad]=useState(0),[response,setResponse]=useState<{load:number;policy?:ArrivalLimit;error?:string}|null>(null);
  const [windowMinutes,setWindowMinutes]=useState<15|30|60>(15),[maximum,setMaximum]=useState(""),[enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[needsReload,setNeedsReload]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const active=useRef(true),inFlight=useRef(false),heading=useRef<HTMLHeadingElement>(null),focusRead=useRef(false);
  const frozen=useRef<{id:string;intent:ArrivalLimitIntent;dispatched:boolean}|null>(null);
  const policy=response?.load===load?response.policy:null,readError=response?.load===load?response.error:null,loading=response?.load!==load;
  const dirty=!!policy&&(windowMinutes!==policy.windowMinutes || enabled!==(policy.maxGuests!==null) || (enabled&&maximum!==String(policy.maxGuests)));
  const valid=!enabled||(/^\d+$/.test(maximum)&&Number.isSafeInteger(Number(maximum))&&Number(maximum)>=1&&Number(maximum)<=1000);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    let current=true;const controller=new AbortController();
    void readArrivalLimit(spotId,controller.signal).then(policy=>{
      if(!current||!isCurrent())return;
      setResponse({load,policy});setWindowMinutes(policy.windowMinutes);setEnabled(policy.maxGuests!==null);setMaximum(policy.maxGuests===null?"":String(policy.maxGuests));setNeedsReload(false);
      if(focusRead.current){focusRead.current=false;window.requestAnimationFrame(()=>{if(active.current&&isCurrent())heading.current?.focus();});}
    }).catch(failure=>{if(current&&isCurrent()){if(bookingReadDenied(failure))onDenied();else setResponse({load,error:bookingError(failure)});}});
    return()=>{current=false;controller.abort();};
  },[spotId,load,isCurrent,onDenied]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty||busy||uncertain)event.preventDefault();};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty,busy,uncertain]);
  function reload(){if(busy||uncertain||!online||!navigator.onLine||!isCurrent())return;setError(null);setNotice(null);focusRead.current=true;setLoad(value=>value+1);}
  async function save(){
    if(inFlight.current||!isCurrent()||!online||!navigator.onLine||(!frozen.current&&(!policy||!valid||needsReload||!dirty)))return;
    if(!frozen.current)frozen.current={id:crypto.randomUUID(),intent:{revision:policy!.revision,windowMinutes,maxGuests:enabled?Number(maximum):null},dispatched:false};
    const request=frozen.current;inFlight.current=true;setBusy(true);onBusy(true);setError(null);setNotice(null);
    let acknowledged=false;
    try{
      let result=await saveArrivalLimit(spotId,request.id,request.intent,actorId,true);
      if(!active.current||!isCurrent())return;
      if(!result&&!navigator.onLine){if(!request.dispatched)frozen.current=null;setError("Offline · Verbinde dich und prüfe die Anfrage erneut.");return;}
      if(!result){request.dispatched=true;result=await saveArrivalLimit(spotId,request.id,request.intent,actorId);}
      if(!active.current||!isCurrent()||!result)return;
      acknowledged=true;frozen.current=null;setUncertain(false);setNeedsReload(true);
      // An original replay receipt may predate another Manager's later change.
      // Always read the current policy before presenting it as effective.
      const current=await readArrivalLimit(spotId);
      if(!active.current||!isCurrent())return;
      setResponse({load,policy:current});setWindowMinutes(current.windowMinutes);setEnabled(current.maxGuests!==null);setMaximum(current.maxGuests===null?"":String(current.maxGuests));setNeedsReload(false);
      const same=current.revision===result.revision&&current.windowMinutes===result.windowMinutes&&current.maxGuests===result.maxGuests;
      setNotice(same?"Die Regel wurde gespeichert. Bestehende Reservierungen bleiben erhalten.":"Deine Anfrage ist gespeichert. Inzwischen gilt eine neuere Regel; angezeigt wird der aktuelle Stand.");
      heading.current?.focus();
    }catch(failure){
      if(!active.current||!isCurrent())return;
      if(bookingReadDenied(failure)){onDenied();return;}
      if(acknowledged){setError("Die Anfrage ist gespeichert. Der aktuelle Stand konnte noch nicht geladen werden.");setNeedsReload(true);}
      else{
        setError(bookingError(failure));
        if(uncertain||(request.dispatched&&bookingWriteUncertain(failure)))setUncertain(true);
        else{frozen.current=null;if(failure&&typeof failure==="object"&&"code" in failure&&failure.code==="40001")setNeedsReload(true);}
      }
    }finally{inFlight.current=false;if(active.current&&isCurrent()){setBusy(false);onBusy(false);}}
  }
  return <ConsolePanel title="Gästeandrang" dirty={dirty&&!needsReload} busy={busy} uncertain={uncertain} uncertainHelp="Die Regel kann bereits gespeichert sein. Beim Verlassen werden nur die lokalen Eingaben entfernt. Öffne Gästeandrang erneut und lade den aktuellen Stand, bevor du eine neue Änderung erfasst." onClose={()=>onClose(uncertain,!!policy&&!needsReload&&!uncertain&&!error)}>
    <form className={styles.editorForm} onSubmit={event=>{event.preventDefault();void save();}}>
      <div className={styles.drawerBody}>
        <h3 ref={heading} tabIndex={-1} data-initial-focus>Geladene Regel</h3>
        {loading&&<p role="status">Die Regel wird geladen …</p>}
        {readError&&<><p role="alert" className={styles.error}>{readError}</p><button type="button" className={styles.secondary} disabled={!online} onClick={reload}>Erneut laden</button></>}
        {policy&&<><p className={styles.detailTime}>{policy.maxGuests===null?"Kein Gäste-Limit":`${policy.maxGuests} Gäste pro ${policy.windowMinutes} Minuten`}<span>Für das gesamte Restaurant · alle Services und Buchungskanäle.</span></p>
          <p className={styles.help}>Begrenzt die summierten Gruppengrössen nach gespeichertem Buchungsbeginn. Freie Tische können deshalb trotzdem nicht buchbar sein.</p>
          <fieldset className={styles.fieldset} disabled={busy||uncertain||needsReload||!online}>
            <label className={styles.checkbox}><input type="checkbox" checked={enabled} onChange={event=>{setEnabled(event.target.checked);setError(null);setNotice(null);}}/>Gäste-Limit verwenden</label>
            <div className={styles.fields}><label>Zeitfenster<select value={windowMinutes} onChange={event=>{setWindowMinutes(Number(event.target.value) as 15|30|60);setError(null);setNotice(null);}}><option value={15}>15 Minuten</option><option value={30}>30 Minuten</option><option value={60}>60 Minuten</option></select></label>
              <label>Maximale Gäste<input type="number" inputMode="numeric" min={1} max={1000} step={1} required={enabled} disabled={!enabled} value={maximum} aria-describedby="arrival-limit-input-help" onChange={event=>{setMaximum(event.target.value);setError(null);setNotice(null);}}/></label></div>
            <p id="arrival-limit-input-help" className={styles.help}>{enabled?"1 bis 1000 Gäste. Zum Aufheben deaktiviere das Limit.":"Ohne Limit gelten weiterhin Tischverfügbarkeit, Servicezeiten und Buchungssperren."}</p>
          </fieldset>
          <details className={styles.editorDetails}><summary>Wie die Regel zählt</summary><p className={styles.help}>Feste Zeitfenster in Europe/Zurich, zum Beispiel 18:00–18:30 und 18:30–19:00. Die Grenze gehört zum nächsten Fenster. Bei der Zeitumstellung bleiben die beiden gleich benannten Herbststunden getrennt. Dies ist kein rollendes Zeitfenster.</p><p className={styles.help}>Angefragt, bestätigt, angekommen, am Tisch und beendet zählen mit ihrer Gruppengrösse. Storniert, abgelehnt und nicht erschienen zählen nicht. Kombinierte Tische zählen ihre Reservierung einmal. Daraus wird keine Anwesenheit abgeleitet.</p></details>
          {dirty&&<p role="status" className={styles.writeWarning}>{enabled?`${Number(maximum)||"…"} Gäste pro ${windowMinutes} Minuten vorgesehen.`:"Gäste-Limit aufheben?"} Bestehende Reservierungen werden nicht storniert.{enabled?" Bereits überschrittene Fenster bleiben für zusätzliche Gäste gesperrt.":""}</p>}
        </>}
        {!online&&<p role="status" className={styles.help}>Offline · Deine Eingaben bleiben erhalten. Zum Speichern brauchst du eine Verbindung.</p>}
        {error&&<p role="alert" className={styles.error}>{error}{uncertain?" Das Speicherergebnis ist unklar. Prüfen und fortsetzen verwendet ausschliesslich dieselbe Anfrage.":""}</p>}
        {notice&&<p role="status">{notice}</p>}
        {needsReload&&!uncertain&&<button type="button" className={styles.secondary} disabled={busy||!online} onClick={reload}>Aktuellen Stand laden und Eingaben ersetzen</button>}
      </div>
      {policy&&<footer className={styles.editorFooter}><span>Keine automatische Gastnachricht</span><button type="submit" className={styles.primary} disabled={busy||!online||needsReload||(!uncertain&&(!valid||!dirty))}>{busy?"Wird geprüft …":uncertain?"Anfrage prüfen und fortsetzen":"Regel speichern"}</button></footer>}
    </form>
  </ConsolePanel>;
}
