"use client";

import { useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, bookingWriteUncertain, readReservationGuest, writeReservationGuest, type BookingReservation, type ReservationGuestDetails, type ReservationGuestIntent } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import { ReservationGuestPicker } from "./reservation-guest-picker";
import styles from "./console.module.css";

export function ReservationGuest({ spotId, actorId, reservation, online, canWrite, isCurrent, onDenied, onBusy, onClose, onSaved, onReload }: {
  spotId: string; actorId: string; reservation: BookingReservation; online: boolean; canWrite: boolean; isCurrent: () => boolean;
  onDenied: () => void; onBusy: (busy: boolean) => void; onClose: (uncertain: boolean) => void; onSaved: () => Promise<void>; onReload: () => Promise<void>;
}) {
  const [details, setDetails] = useState<ReservationGuestDetails | null>(null), [readError, setReadError] = useState<string | null>(null), [refresh, setRefresh] = useState(0);
  const [candidate, setCandidate] = useState<{ id: string; revision: number; name: string } | null>(null), [action, setAction] = useState<"assign" | "detach" | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState<string | null>(null), [needsReload, setNeedsReload] = useState(false);
  const active = useRef(true), inFlight = useRef(false), frozen = useRef<{ id: string; intent: ReservationGuestIntent; dispatched: boolean } | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true; const controller = new AbortController(); setDetails(null); setReadError(null);
    if (online && isCurrent()) void readReservationGuest(spotId,reservation.id,controller.signal).then(value => { if (current && isCurrent()) setDetails(value); }).catch(error => { if (current && isCurrent()) { if (bookingReadDenied(error)) onDenied(); else setReadError(bookingError(error)); } });
    return () => { current = false; controller.abort(); };
  }, [spotId,reservation.id,online,refresh,isCurrent,onDenied]);
  async function execute() {
    if (!online || !canWrite || !isCurrent() || inFlight.current || (!frozen.current && (!details || !action || (action === "assign" && !candidate)))) return;
    const request = frozen.current ?? { id: crypto.randomUUID(), dispatched: false, intent: {kind:action!,reservation_id:reservation.id,reservation_revision:reservation.revision ?? 0,link_revision:details!.revision,guest_id:action === "assign" ? candidate!.id : null,guest_revision:action === "assign" ? candidate!.revision : null} };
    frozen.current = request; inFlight.current = true; setBusy(true); onBusy(true); setError(null); let acknowledged = false;
    try {
      let result = await writeReservationGuest(spotId,request.id,request.intent,actorId,true);
      if (!active.current || !isCurrent()) return;
      if (!result) { request.dispatched = true; result = await writeReservationGuest(spotId,request.id,request.intent,actorId,false); }
      if (!active.current || !isCurrent() || !result) return;
      acknowledged = true; frozen.current = null; setUncertain(false); await onSaved();
    } catch (error) {
      if (!active.current || !isCurrent()) return;
      if (bookingReadDenied(error)) { onDenied(); return; }
      if (acknowledged) setError("Die Zuordnung ist gespeichert. Der aktuelle Stand konnte noch nicht geladen werden.");
      else { setError(bookingError(error)); if (uncertain || (request.dispatched && bookingWriteUncertain(error))) setUncertain(true); else { frozen.current = null; setNeedsReload(!!error && typeof error === "object" && "message" in error && ["booking_guest_changed","booking_guest_link_changed","booking_reservation_changed"].includes(String(error.message))); } }
    } finally { inFlight.current = false; if (active.current) setBusy(false); onBusy(false); }
  }
  async function reload() { if (!isCurrent() || busy || uncertain) return; setAction(null); setCandidate(null); setError(null); setNeedsReload(false); await onReload(); if (active.current && isCurrent()) setRefresh(value => value+1); }
  const guest = online ? details?.guest : null;
  return <ConsolePanel title="Gästekarte zur Reservierung" dirty={!!action} busy={busy} uncertain={uncertain} uncertainHelp="Die Zuordnung kann bereits gespeichert sein. Prüfe nach dem Verlassen die aktuelle Zuordnung dieser Reservierung, bevor du einen neuen Auftrag erfasst." onClose={() => onClose(uncertain)}>
    <div className={styles.drawerBody}>
      <h3>{reservation.guest_name}</h3><p className={styles.help}>Die Zuordnung bestimmt, in welcher Gästekarte diese Buchung erscheint. Name, Kontakt, Status, Zeit und Tisch der gespeicherten Reservierung bleiben erhalten.</p>
      {!online && <p role="status" className={styles.help}>Offline · dein Zuordnungsentwurf bleibt erhalten. Speichern ist mit bestehender Verbindung möglich.</p>}
      {readError && <p role="alert" className={styles.error}>{readError}</p>}
      {!details && online && !readError && <p role="status" className={styles.help}>Aktuelle Zuordnung wird geladen …</p>}
      {details && online && <><p className={styles.note}>{guest ? `Zugeordnet: ${guest.name ?? "Archivierte Gästekarte"}${guest.is_archived ? " · archiviert" : ""}` : "Dieser Reservierung ist keine Gästekarte zugeordnet."}</p>
        {canWrite && !uncertain && <fieldset className={styles.fieldset} disabled={busy || needsReload}>
          <ReservationGuestPicker purpose="associate" spotId={spotId} online={online} disabled={busy || needsReload} isCurrent={isCurrent} onDenied={onDenied} onCopy={copy => { setCandidate({...copy.card,name:copy.name}); setAction("assign"); }} />
          {guest && <button type="button" className={styles.secondary} onClick={() => { setCandidate(null); setAction("detach"); }}>Zuordnung aufheben</button>}
        </fieldset>}
        {action && <section aria-label="Zuordnung prüfen" className={styles.cardCopy}><h4>{action === "assign" ? `Zuordnen: ${candidate?.name}` : "Zuordnung aufheben"}</h4><p className={styles.help}>{action === "assign" ? "Prüfe, ob diese Reservierung zur gewählten Person gehört. Sie wird im Verlauf dieser Karte sichtbar." : "Die Buchung verschwindet aus dem Reservierungsverlauf der Karte. Sie bleibt im Buchungsbuch erhalten."} Die Änderung wird mit einem privaten Änderungsverlauf gespeichert.</p>{!uncertain && <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setAction(null); setCandidate(null); }}>Auswahl verwerfen</button>}</section>}
        <details className={styles.editorDetails}><summary>Zuordnungsverlauf</summary><p className={styles.help}>Höchstens 20 Änderungen · frühere Kontaktwerte werden hier nicht gespeichert.</p>{details.events.length ? <ul className={styles.cardEvents}>{details.events.map(event => <li key={event.id}><strong>{event.guest_id === null ? "Zuordnung aufgehoben" : event.previous_guest_id === null ? "Gästekarte zugeordnet" : "Zuordnung korrigiert"}</strong><span>{new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</span></li>)}</ul> : <p className={styles.help}>Noch keine Zuordnungsänderungen erfasst.</p>}</details>
      </>}
      {error && <p role="alert" className={styles.error}>{error}{uncertain && " Der Speicherstatus ist unklar. Eingaben bleiben gesperrt; geprüft wird ausschliesslich dieselbe Anfrage."}</p>}
      {!uncertain && (readError || error) && <button type="button" className={styles.secondary} disabled={busy || !online} onClick={() => void reload()}>Aktuelle Zuordnung neu laden</button>}
    </div>
    {canWrite && <footer className={styles.editorFooter}><span>Bewusste Zuordnung · keine Zusammenführung</span><button type="button" className={styles.primary} disabled={busy || !online || (!uncertain && (!details || !action || needsReload))} onClick={() => void execute()}>{busy ? "Speichert …" : uncertain ? "Zuordnungsanfrage prüfen" : "Zuordnung speichern"}</button></footer>}
  </ConsolePanel>;
}
