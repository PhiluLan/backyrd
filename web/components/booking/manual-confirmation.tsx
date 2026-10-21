"use client";
import { useEffect, useRef, useState } from "react";
import { bookingMailActor, BookingStaffMailError, prepareBookingSummary } from "@/lib/booking-mail-summary-client";
import { parseMailSummaryRequest, type MailSummaryIntent } from "@/lib/booking-mail-summary-contract";
import { guestWhen } from "@/lib/booking-guest-time";
import type { BookingReservation } from "@/lib/booking-api";
import styles from "./console.module.css";
export function ManualConfirmation({spotId,reservation:r,onPending,onBusy,onDenied,onQueued,onReload}:{spotId:string;reservation:BookingReservation;onPending:(value:boolean)=>void;onBusy:(value:boolean)=>void;onDenied:()=>void;onQueued:()=>Promise<void>;onReload:()=>Promise<void>}){
  const [actor,setActor]=useState<string|null>(null),[ready,setReady]=useState(false),[blocked,setBlocked]=useState(false);
  const [open,setOpen]=useState(false),[review,setReview]=useState<number|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const [message,setMessage]=useState(""),[complete,setComplete]=useState(false);
  const [email,setEmail]=useState(()=>{const value=r.guest_contact?.trim()??"";return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value)?value:"";});
  const pending=useRef<MailSummaryIntent|null>(null),mounted=useRef(false),writing=useRef(false);
  const storage=(id:string)=>`booking.manual-summary.v1:${id}:${spotId}:${r.id}`;
  useEffect(()=>{
    mounted.current=true;let cancelled=false;
    void bookingMailActor().then(id=>{
      if(cancelled)return;
      if(!id){onDenied();return;}setActor(id);
      try{
        const raw=sessionStorage.getItem(storage(id));
        if(raw){if(raw.length>4096)throw new Error("invalid_intent");const {operation,...intent}=parseMailSummaryRequest({...JSON.parse(raw),operation:"prepare"});void operation;
          if(intent.spotId!==spotId||intent.reservationId!==r.id)throw new Error("invalid_intent");pending.current=intent;setEmail(intent.email);setUncertain(true);setOpen(true);onPending(true);
        }
      }catch{setBlocked(true);setOpen(true);onPending(true);setMessage("Ein gespeicherter Nachrichtenauftrag konnte nicht gelesen werden. Prüfe den Versandstatus und kläre den Auftrag, bevor du eine weitere Nachricht vorbereitest.");}
      setReady(true);
    }).catch(()=>{if(!cancelled){setBlocked(true);setReady(true);onPending(true);setMessage("Deine Anmeldung konnte nicht geprüft werden. Bitte lade die Reservierung erneut.");}});
    return()=>{cancelled=true;mounted.current=false;};
    // Each restaurant/reservation/actor gets a new parent dialog; never rehydrate an edited draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[spotId,r.id]);
  function forget(id:string){try{const key=storage(id);sessionStorage.removeItem(key);return sessionStorage.getItem(key)===null;}catch{return false;}}
  async function act(recover:boolean){
    if(!actor||!ready||blocked||writing.current)return;
    let intent=pending.current;
    const wasUncertain=uncertain;
    if(!intent){
      if(recover||review!==r.revision||Date.parse(r.starts_at)<=Date.now())return;
      try{const {operation,...parsed}=parseMailSummaryRequest({operation:"prepare",spotId,reservationId:r.id,requestId:crypto.randomUUID(),revision:r.revision,email});void operation;intent=parsed;
        const raw=JSON.stringify(intent);sessionStorage.setItem(storage(actor),raw);if(sessionStorage.getItem(storage(actor))!==raw)throw new Error("storage_unavailable");
      }catch{setMessage("Der Browser kann den Auftrag nicht sicher speichern. Es wurde keine Nachricht angefordert. Prüfe die E-Mail-Adresse oder verwende einen Browser mit verfügbarem Tab-Speicher.");return;}
      pending.current=intent;
    }
    writing.current=true;setBusy(true);onBusy(true);setMessage("");onPending(true);let acknowledged=false;
    try{
      const result=await prepareBookingSummary(intent,actor,recover);
      if(!mounted.current)return;
      if(!result){setUncertain(true);setMessage("Noch kein sicheres Ergebnis gefunden. Eine frühere Anfrage kann weiterhin gespeichert werden. Wiederhole nur denselben Auftrag.");return;}
      acknowledged=!('not_committed' in result);
      if(!forget(actor)){setUncertain(true);setMessage(acknowledged?"Dein Auftrag wurde vorbereitet, konnte aber noch nicht aus dem Tab-Speicher entfernt werden. Prüfe denselben Auftrag erneut.":"Der Auftrag wurde nicht ausgeführt, konnte aber noch nicht aus dem Tab-Speicher entfernt werden. Prüfe denselben Auftrag erneut.");return;}
      pending.current=null;setUncertain(false);setReview(null);onPending(false);
      if('not_committed' in result){setMessage("Dein Auftrag wurde nicht ausgeführt. Lade die geänderte Reservierung und prüfe den Empfänger erneut.");try{await onReload();}catch{if(mounted.current)setMessage("Dein Auftrag wurde nicht ausgeführt. Die aktuelle Reservierung konnte nicht geladen werden; öffne sie bitte erneut.");}return;}
      setComplete(true);setOpen(false);setMessage("Die Gastnachricht wurde vorbereitet. Den aktuellen Versand- und Zustellstand findest du unter Gastnachrichten.");try{await onQueued();}catch{if(mounted.current)setMessage("Die Nachricht wurde vorbereitet, der aktuelle Versandstatus konnte aber nicht geladen werden. Öffne die Reservierung erneut und prüfe Gastnachrichten, bevor du einen weiteren Auftrag anlegst.");}
    }catch(error){
      if(!mounted.current)return;
      if(error instanceof BookingStaffMailError&&(error.status===401||error.status===403)){onDenied();return;}
      setMessage(error instanceof BookingStaffMailError?error.message:"Der Auftragsstatus konnte nicht sicher geprüft werden.");
      if(acknowledged||wasUncertain||!(error instanceof BookingStaffMailError)||error.uncertain)setUncertain(true);
      else{if(!forget(actor)){setUncertain(true);}else{pending.current=null;onPending(false);}setReview(null);}
    }finally{writing.current=false;if(mounted.current)setBusy(false);onBusy(false);}
  }
  const eligible=typeof r.revision==="number"&&["pending","confirmed","cancelled","declined"].includes(r.status)&&Date.parse(r.starts_at)>Date.now();
  const valid=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email.trim())&&email.trim().length<=254&&!/[\u0000-\u001f\u007f]/u.test(email);
  return <section className={styles.note} aria-label="Manuelle Gastnachricht">
    <h3>Buchungsstand per E-Mail</h3><p className={styles.help}>Für telefonisch, per E-Mail oder vom Team erfasste Buchungen. Es werden keine Buchungsbedingungen oder Selbstbedienungsrechte nachträglich hinzugefügt.</p>
    {message&&<p role={uncertain||blocked?"alert":"status"}>{message}</p>}
    {!ready&&<p role="status">Gespeicherte Aufträge werden geprüft …</p>}
    {ready&&!open&&!complete&&<button type="button" className={styles.secondary} disabled={busy||blocked||!eligible} onClick={()=>setOpen(true)}>E-Mail vorbereiten</button>}
    {open&&!uncertain&&!blocked&&<>
      <label>E-Mail-Adresse des Gasts<input type="email" inputMode="email" autoComplete="off" maxLength={254} value={email} disabled={busy} onChange={e=>{setEmail(e.target.value);setReview(null);}} /></label>
      <p className={styles.help}>Vorhandene Kontaktdaten bleiben unverändert. Der gewählte Empfänger wird in der Nachrichtenübersicht protokolliert. Für sichere Wiederholungen liegt dieser Auftrag vorübergehend im Tab-Speicher.</p>
      {review!==null&&review===r.revision?<div className={styles.confirmation}><h4>Empfänger und Buchung prüfen</h4><p><strong>{email.trim()}</strong></p><p>{r.guest_name} · {r.party_size} Personen<br/>{guestWhen(r.starts_at)}</p><p>{r.status==="pending"?"Diese Nachricht bestätigt nur den Eingang der Anfrage. Der Platz ist noch nicht bestätigt.":r.status==="cancelled"?"Diese Nachricht informiert über die Stornierung.":r.status==="declined"?"Diese Nachricht informiert über die abgelehnte Anfrage.":"Diese Nachricht bestätigt den gespeicherten Buchungsstand."}</p><p>Bereits gestartete Nachrichten können weiterhin ankommen. Für Änderungen und Absagen verweist die Nachricht auf das Restaurant.</p><button type="button" className={styles.primary} disabled={busy} onClick={()=>void act(false)}>Ja, Buchungsstand vorbereiten</button><button type="button" className={styles.secondary} disabled={busy} onClick={()=>setReview(null)}>Empfänger ändern</button></div>:<button type="button" className={styles.secondary} disabled={busy||!valid||!eligible} onClick={()=>setReview(r.revision??null)}>Nachricht prüfen</button>}
      <button type="button" className={styles.secondary} disabled={busy} onClick={()=>{setOpen(false);setReview(null);}}>Schliessen</button>
    </>}
    {uncertain&&<><p>Der frühere Auftrag bleibt gespeichert. Andere Änderungen bleiben gesperrt, bis sein Ausgang geklärt ist.</p><button type="button" className={styles.secondary} disabled={busy||blocked} onClick={()=>void act(true)}>Auftragsstatus prüfen</button><button type="button" className={styles.secondary} disabled={busy||blocked} onClick={()=>void act(false)}>Denselben Nachrichtenauftrag wiederholen</button></>}
  </section>;
}
