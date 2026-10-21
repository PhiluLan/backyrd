"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { bookingError, bookingReadDenied, readArrivalReview, validateArrivalReviewDate, type ArrivalReview } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

const timeLabel=(instant:string)=>new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",hour:"2-digit",minute:"2-digit",timeZoneName:"shortOffset",hourCycle:"h23"}).format(new Date(instant));
const dayLabel=(date:string)=>new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",day:"numeric",month:"long",year:"numeric"}).format(new Date(date+"T12:00:00Z"));
export function ArrivalReviewPanel({spotId,date:initialDate,online,canManage,isCurrent,onDenied,onClose,onEdit}:{
  spotId:string;date:string;online:boolean;canManage:boolean;isCurrent:()=>boolean;onDenied:()=>void;onClose:()=>void;onEdit:()=>void;
}){
  const [date,setDate]=useState(initialDate),[showEmpty,setShowEmpty]=useState(false),[filtersOpen,setFiltersOpen]=useState(false);
  const [request,setRequest]=useState<{date:string}|null>({date:initialDate});
  const [response,setResponse]=useState<{request:NonNullable<typeof request>;data?:ArrivalReview;error?:string}|null>(null);
  const generation=useRef(0),controller=useRef<AbortController|null>(null),heading=useRef<HTMLHeadingElement>(null),focusPending=useRef(false);
  let valid=false;try{validateArrivalReviewDate(date);valid=true;}catch{/* A date can be empty during editing. */}
  const loading=!!request&&online&&response?.request!==request;
  const data=online&&response?.request===request?response?.data:null,error=response?.request===request?response?.error:null;
  function clear(){generation.current++;controller.current?.abort();setResponse(null);setRequest(null);focusPending.current=false;}
  useEffect(()=>{
    const invalidate=()=>{generation.current++;controller.current?.abort();setResponse(null);setRequest(current=>current?{date:current.date}:null);};
    window.addEventListener("offline",invalidate);window.addEventListener("online",invalidate);return()=>{window.removeEventListener("offline",invalidate);window.removeEventListener("online",invalidate);};
  },[]);
  useEffect(()=>{
    const current=++generation.current,readController=new AbortController();controller.current=readController;let active=true;
    if(request&&online&&isCurrent())void readArrivalReview(spotId,request.date,readController.signal).then(data=>{if(active&&current===generation.current&&isCurrent())setResponse({request,data});}).catch(failure=>{if(active&&current===generation.current&&isCurrent()){if(bookingReadDenied(failure))onDenied();else setResponse({request,error:bookingError(failure)});}});
    return()=>{active=false;readController.abort();};
  },[spotId,request,online,isCurrent,onDenied]);
  useEffect(()=>{if(response&&focusPending.current&&isCurrent()){focusPending.current=false;heading.current?.focus();}},[response,isCurrent]);
  function load(event?:FormEvent){event?.preventDefault();if(!valid||!online||!navigator.onLine||!isCurrent())return;clear();setFiltersOpen(false);focusPending.current=true;setRequest({date});}
  const windows=data?.windows.filter(w=>showEmpty||w.reservations+w.excludedReservations>0)??[];
  const limit=data?.policy.maxGuests??null,over=data?.windows.filter(w=>limit!==null&&w.guests>limit).length??0,full=data?.windows.filter(w=>limit!==null&&w.guests===limit).length??0;
  return <ConsolePanel title="Zeitfenster prüfen" onClose={onClose}><div className={styles.drawerBody}>
    <p className={styles.help}>Ganzes Restaurant · alle Services und Bereiche.</p>
    <details className={styles.editorDetails} open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}><summary data-initial-focus>Tag ändern</summary><form className={styles.searchForm} onSubmit={load}><label>Tag der Zeitfenster<input type="date" required min="1970-01-01" max="9999-12-30" value={date} onChange={event=>{clear();setDate(event.target.value);}}/></label><button type="submit" className={styles.secondary} disabled={!valid||!online||loading}>{loading?"Lädt …":"Tag laden"}</button></form></details>
    <h3 ref={heading} tabIndex={-1}>{data?dayLabel(data.date):"Buchungsbeginn prüfen"}</h3><button type="button" className={styles.secondary} disabled={!valid||!online||loading} onClick={()=>load()}>{loading?"Lädt …":data?"Stand aktualisieren":"Zeitfenster laden"}</button>
    {!online&&<p role="status" className={styles.help}>Offline · Verbinde dich, um den aktuellen Gästeandrang zu laden.</p>}
    {loading&&<p role="status" className={styles.help}>Zeitfenster werden geladen …</p>}
    {!request&&online&&<p role="status" className={styles.help}>Wähle einen Tag und lade den neuen Stand.</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {data&&<section aria-label="Geladene Zeitfenster" className={styles.reportResults}>
      <p className={styles.detailTime}>{limit===null?"Kein Gäste-Limit":`${limit} ${limit===1?"Gast":"Gäste"} pro ${data.policy.windowMinutes} Minuten`}<span>Aktuelle Regel · Datenstand {new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",dateStyle:"medium",timeStyle:"medium"}).format(new Date(data.observedAt))} · Europe/Zurich</span></p>
      <div className={styles.arrivalTotals}><div><strong>{data.totals.reservations}</strong><span>Buchungen berücksichtigt</span></div><div><strong>{data.totals.guests}</strong><span>Summierte Gruppengrössen</span></div></div>
      {limit!==null&&<p role="status" className={over?styles.writeWarning:styles.help}>{over} Zeitfenster über dem Limit · {full} am Limit. Bestehende Reservierungen bleiben erhalten.</p>}
      <p className={styles.help}>Gezählt wird der gespeicherte Buchungsbeginn. Der Abstand zum Limit sagt nicht, ob ein Tisch oder Service verfügbar ist.</p>
      {data.totals.reservations+data.totals.excludedReservations===0&&<p role="status">Keine gespeicherten Reservierungen an diesem Tag.</p>}
      <label className={styles.checkbox}><input type="checkbox" checked={showEmpty} onChange={event=>setShowEmpty(event.target.checked)}/>Leere Zeitfenster anzeigen</label>
      <ol className={styles.arrivalWindows} aria-label="Zeitfenster des Tages">{windows.map(w=><li key={w.startsAt}>
        <h4>{timeLabel(w.startsAt)} – {timeLabel(w.endsAt)}</h4><p>{w.reservations} {w.reservations===1?"Buchung":"Buchungen"} · {w.guests} {w.guests===1?"Gast":"Gäste"} berücksichtigt</p>
        <strong>{limit===null?"Kein Limit":w.guests>limit?`${w.guests-limit} ${w.guests-limit===1?"Gast":"Gäste"} über dem Limit`:w.guests===limit?"Limit erreicht":"Unter dem Limit"}</strong>
        {w.excludedReservations>0&&<p className={styles.help}>{w.excludedReservations} {w.excludedReservations===1?"Buchung":"Buchungen"} mit {w.excludedGuests} {w.excludedGuests===1?"Gast":"Gästen"} ausgeschlossen: storniert, abgelehnt oder nicht erschienen.</p>}
      </li>)}</ol>
      <details className={styles.editorDetails}><summary>Zählweise</summary><p className={styles.help}>Angefragt, bestätigt, angekommen, am Tisch und beendet zählen mit ihrer Gruppengrösse. Kombinierte Tische zählen ihre Reservierung einmal. Es wird keine tatsächliche Anwesenheit abgeleitet.</p><p className={styles.help}>Es gelten feste Zeitfenster und die jetzt geladene Regel, auch für frühere Tage. Spätere Umbuchungen oder Statusänderungen verändern die Werte. Ein Zeitfenster endet direkt vor dem nächsten; die beiden Herbststunden sind über ihre Zeitzone unterscheidbar.</p><p className={styles.help}>{data.totals.excludedReservations} ausgeschlossene Buchungen · {data.totals.excludedGuests} summierte Gäste in ausgeschlossenen Buchungen.</p></details>
      {canManage&&<button type="button" className={styles.secondary} onClick={()=>{if(online&&navigator.onLine&&isCurrent())onEdit();}}>Regel bearbeiten</button>}
    </section>}
  </div></ConsolePanel>;
}
