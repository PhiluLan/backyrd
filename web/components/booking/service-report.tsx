"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { bookingError, bookingReadDenied, readBookingReport, restaurantDate, shiftBookingDate, type BookingService } from "@/lib/booking-api";
import { bookingReportCsv, reportStatuses, validateReportScope, type BookingReport, type ReportCounts, type ReportScope } from "@/lib/booking-report";
import { ConsolePanel } from "./console-panel";
import { statusLabels, sourceLabels } from "./reservation-labels";
import styles from "./console.module.css";

function StatusCounts({ counts, label }: { counts: ReportCounts; label: string }) {
  return <table className={styles.reportTable}><caption>{label}</caption><thead><tr><th scope="col">Status</th><th scope="col">Buchungen</th><th scope="col">Personen</th></tr></thead><tbody>{reportStatuses.map(status=><tr key={status}><th scope="row">{statusLabels[status]}</th><td>{counts.statuses[status].reservations}</td><td>{counts.statuses[status].guests}</td></tr>)}</tbody><tfoot><tr><th scope="row">Gesamt</th><td>{counts.reservations}</td><td>{counts.guests}</td></tr></tfoot></table>;
}
const dateLabel = (date:string) => new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",day:"numeric",month:"short",year:"numeric"}).format(new Date(date+"T12:00:00Z"));

export function ServiceReport({ spotId, date, serviceId, services, online, isCurrent, onDenied, onClose }: {
  spotId: string; date: string; serviceId: string; services: BookingService[]; online: boolean; isCurrent: () => boolean; onDenied: () => void; onClose: () => void;
}) {
  const [filtersOpen,setFiltersOpen]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null),errorHeading=useRef<HTMLParagraphElement>(null),focusPending=useRef(false);
  const [from,setFrom]=useState(()=>shiftBookingDate(date,-6)),[to,setTo]=useState(date),[service,setService]=useState(serviceId);
  const [request,setRequest]=useState<{scope:ReportScope}|null>(()=>{try{return {scope:validateReportScope({from:shiftBookingDate(date,-6),to:date,serviceId:serviceId||null})};}catch{return null;}});
  const [response,setResponse]=useState<{request:NonNullable<typeof request>;generation:number;report?:BookingReport;error?:string}|null>(null),[downloadError,setDownloadError]=useState<string|null>(null);
  const generation=useRef(0),controller=useRef<AbortController|null>(null);
  const data=response?.request===request&&response?.report?{report:response.report,generation:response.generation}:null;
  const error=response?.request===request?response?.error:null;
  const loading=!!request&&online&&response?.request!==request;
  let scope:ReportScope|null=null;try{scope=validateReportScope({from,to,serviceId:service||null});}catch{/* Editing can temporarily leave either date empty. */}
  function clear() { focusPending.current=false;generation.current++;controller.current?.abort();setRequest(null);setResponse(null);setDownloadError(null); }
  useEffect(()=>{
    const invalidate=()=>{generation.current++;controller.current?.abort();setResponse(null);setDownloadError(null);setRequest(current=>current?{scope:current.scope}:null);};
    window.addEventListener("offline",invalidate);window.addEventListener("online",invalidate);
    return ()=>{window.removeEventListener("offline",invalidate);window.removeEventListener("online",invalidate);};
  },[]);
  useEffect(()=>{
    const current=++generation.current;controller.current?.abort();const readController=new AbortController();controller.current=readController;let active=true;
    if(request&&online&&isCurrent()){
      void readBookingReport(spotId,request.scope,readController.signal).then(report=>{if(active&&current===generation.current&&isCurrent())setResponse({request,generation:current,report});}).catch(error=>{if(active&&current===generation.current&&isCurrent()){if(bookingReadDenied(error))onDenied();else setResponse({request,generation:current,error:bookingError(error)});}});
    }
    return ()=>{active=false;readController.abort();};
  },[spotId,request,online,isCurrent,onDenied]);
  useEffect(()=>{if(response&&focusPending.current&&isCurrent()){focusPending.current=false;if(response.report)heading.current?.focus();else if(response.error)errorHeading.current?.focus();}},[response,isCurrent]);
  function retry() { if(!request||!online||!isCurrent())return;const scope=request.scope;clear();focusPending.current=true;setRequest({scope}); }
  function submit(event:FormEvent) { event.preventDefault();if(!scope||!online||!isCurrent())return;clear();focusPending.current=true;setFiltersOpen(false);setRequest({scope}); }
  function preset(days:number) { clear();const end=restaurantDate();setTo(end);setFrom(shiftBookingDate(end,1-days)); }
  function download() {
    if(!data||data.generation!==generation.current||!online||!navigator.onLine||loading||!isCurrent())return;
    try{const report=data.report,url=URL.createObjectURL(new Blob([bookingReportCsv(report,{statuses:statusLabels,sources:sourceLabels})],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`backyrd-booking-${report.scope.from}_${report.scope.to}.csv`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setDownloadError(null);}
    catch{setDownloadError("Die CSV-Datei konnte nicht erstellt werden. Versuche den Download erneut.");}
  }
  const report=online?data?.report:null;
  return <ConsolePanel title="Auswertungen" onClose={onClose}>
    <div className={styles.drawerBody}>
      <p className={styles.help}>Buchungen nach Beginn in Europe/Zurich · alle Status und Bereiche.</p>
      <details className={styles.editorDetails} open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}><summary data-initial-focus>Zeitraum und Service ändern</summary>
      <form className={styles.searchForm} onSubmit={submit}>
        <div className={styles.fields}><label>Von<input required type="date" min="0001-01-01" max="9999-12-30" value={from} onChange={event=>{clear();setFrom(event.target.value);}}/></label><label>Bis<input required type="date" min="0001-01-01" max="9999-12-30" value={to} onChange={event=>{clear();setTo(event.target.value);}}/></label></div>
        <label>Service im Bericht<select value={service} onChange={event=>{clear();setService(event.target.value);}}><option value="">Alle Services</option>{services.map(service=><option key={service.id} value={service.id}>{service.name}{service.is_active?"":" (inaktiv)"}</option>)}</select></label>
        <div className={styles.actions}><button type="button" className={styles.secondary} onClick={()=>preset(7)}>7 Tage bis heute</button><button type="button" className={styles.secondary} onClick={()=>preset(30)}>30 Tage bis heute</button></div>
        <p className={styles.help}>{scope?"Bis zu 31 Kalendertage. Lade nach einer Änderung die neue Auswahl.":"Wähle einen gültigen Zeitraum mit höchstens 31 Tagen."}</p>
        <button type="submit" className={styles.primary} disabled={!scope||!online||loading}>{loading?"Lädt …":"Auswertung laden"}</button>
      </form></details>
      {!online&&<p role="status" className={styles.help}>Offline · Verbinde dich, um aktuelle Auswertungen zu laden oder eine CSV-Datei herunterzuladen.</p>}
      {error&&<><p ref={errorHeading} tabIndex={-1} role="alert" className={styles.error}>{error}</p><button type="button" className={styles.secondary} disabled={!online||loading} onClick={retry}>Erneut laden</button></>}
      {!request&&scope&&online&&<p role="status" className={styles.help}>Die Auswahl wurde geändert. Lade den Bericht für diesen Zeitraum.</p>}
      {loading&&<p role="status" className={styles.help}>Die Auswertung wird geladen …</p>}
      {report&&<section aria-label="Geladene Auswertung" className={styles.reportResults}>
        <h3 ref={heading} tabIndex={-1}>{dateLabel(report.scope.from)} – {dateLabel(report.scope.to)}</h3>
        <p className={styles.help}>{report.scope.serviceId?report.services[0].name:"Alle Services"} · Datenstand {new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",dateStyle:"medium",timeStyle:"medium"}).format(new Date(report.observedAt))} · Europe/Zurich</p>
        <div className={styles.actions}><button type="button" className={styles.secondary} disabled={loading||!online} onClick={download}>CSV herunterladen</button><button type="button" className={styles.secondary} disabled={loading||!online} onClick={retry}>Bericht aktualisieren</button></div>{downloadError&&<p role="alert" className={styles.error}>{downloadError}</p>}

        <div className={styles.reportMetrics}><div><strong>{report.totals.reservations}</strong><span>Reservierungen</span></div><div><strong>{report.totals.guests}</strong><span>Summierte Personen</span></div></div>
        <p className={styles.help}>Personen = Summe der gebuchten Gruppengrössen.</p>
        {report.totals.reservations===0&&<p role="status" className={styles.help}>Keine gespeicherten Reservierungen in dieser Auswahl.</p>}
        <StatusCounts counts={report.totals} label="Status im ausgewählten Zeitraum"/>
        <section className={styles.cardCopy} aria-label="Tageswerte"><h4>Nach Tag</h4>{report.days.map(day=><details className={styles.editorDetails} key={day.date}><summary>{dateLabel(day.date)} · {day.reservations} Buchungen · {day.guests} Personen</summary><StatusCounts counts={day} label={`Status am ${dateLabel(day.date)}`}/></details>)}</section>
        <section className={styles.cardCopy} aria-label="Servicewerte"><h4>Nach Service</h4><p className={styles.help}>Servicenamen und ihre Aktivierung entsprechen der aktuellen Einrichtung.</p>{report.services.length?report.services.map(service=><details className={styles.editorDetails} key={service.id}><summary>{service.name}{service.isActive?"":" (inaktiv)"} · {service.reservations} Buchungen · {service.guests} Personen</summary><StatusCounts counts={service} label={`Status für ${service.name}`}/></details>):<p className={styles.help}>Für diesen Zeitraum sind keine Servicebuchungen gespeichert.</p>}</section>
        <table className={styles.reportTable}><caption>Buchungsquellen wie erfasst</caption><thead><tr><th scope="col">Quelle</th><th scope="col">Buchungen</th><th scope="col">Personen</th></tr></thead><tbody>{report.sources.map(source=><tr key={source.source}><th scope="row">{sourceLabels[source.source]}</th><td>{source.reservations}</td><td>{source.guests}</td></tr>)}</tbody></table>

        <details className={styles.editorDetails}><summary>Zählweise und CSV-Export</summary><p className={styles.help}>Die Summen zeigen den aktuell gespeicherten Stand. Spätere Umbuchungen oder Statusänderungen verändern auch frühere Zeiträume. Jede Reservierung zählt einmal, auch bei mehreren Tischen. Die Personenzahl zählt Gruppengrössen; aus einer Reservierung wird kein Besuch abgeleitet.</p><p className={styles.help}>Die CSV-Datei enthält Zeitraum, Datenstand, aggregierte Tages-, Status-, Service- und Quellwerte sowie die konfigurierten Servicenamen.</p></details>
      </section>}
    </div>
  </ConsolePanel>;
}
