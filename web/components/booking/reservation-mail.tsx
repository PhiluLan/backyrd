"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, readBookingMail, type BookingMail, type BookingMailMessage } from "@/lib/booking-api";
import styles from "./console.module.css";

const dateTime = (value: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(value));
const states = {
  pending: "In der Warteschlange", leased: "Wird vorbereitet", sending: "Versandergebnis noch unklar",
  accepted: "Vom Mailanbieter angenommen", delivered: "Beim empfangenden Mailserver zugestellt",
  bounced: "Unzustellbar", complained: "Als unerwünscht gemeldet", failed: "Versand fehlgeschlagen",
  suppressed: "Versand angehalten", review_required: "Manuelle Prüfung erforderlich",
};
function Message({ message: m }: { message: BookingMailMessage }) {
  return <li className={styles.historyEvent}><article>
    <h4>{{ created: "Buchungseingang", changed: "Buchungsänderung", cancelled: "Stornierungsnachricht" }[m.kind]}</h4>
    <p><strong>{states[m.state]}</strong>{m.delayed && " · Zustellung verzögert"}</p>
    <p className={styles.help}>Erfasst <time dateTime={m.createdAt}>{dateTime(m.createdAt)}</time></p>
    <p className={styles.help}>Status aktualisiert <time dateTime={m.updatedAt}>{dateTime(m.updatedAt)}</time> · {m.attempts} {m.attempts === 1 ? "Versandversuch" : "Versandversuche"}</p>
    {m.state === "pending" && <p>{m.firstAttemptAt ? "Ein früherer Versuch ist nicht abschliessend bestätigt. Wiederholungen verwenden dieselbe Nachricht." : "Es wurde noch kein Versandversuch gestartet."} {m.nextAttemptAt && <>Frühester nächster Versuch: {dateTime(m.nextAttemptAt)}. Der tatsächliche Start hängt vom Versanddienst ab.</>}</p>}
    {m.state === "sending" && <p>Der Versand wurde gestartet. Eine Annahme oder Zustellung ist noch nicht bestätigt. Die Nachricht kann bereits unterwegs sein.</p>}
    {m.state === "accepted" && <p>Der Anbieter hat die Nachricht angenommen. Die Zustellung ist noch nicht bestätigt.</p>}
    {m.state === "delivered" && <p>Dies bestätigt keine Öffnung oder Kenntnisnahme durch den Gast.</p>}
    {m.state === "review_required" && <p>{m.firstAttemptAt ? "Die Nachricht wurde möglicherweise bereits versendet." : "Für diese Nachricht wurde noch kein Versandversuch gestartet."} Vor einem neuen Versand muss der Vorgang geprüft werden. Kontaktiere den Gast bei Bedarf über die hinterlegten Kontaktdaten.</p>}
    {m.state === "suppressed" && <p>{m.firstAttemptAt ? "Weitere Versuche sind angehalten. Ein früherer Versuch kann den Gast trotzdem erreicht haben." : "Diese Nachricht wurde vor dem ersten Versandversuch angehalten."}</p>}
    {m.superseded && <p>Diese Nachricht ist durch eine Änderung überholt. Ein bereits gestarteter Versand kann nicht zurückgerufen werden.</p>}
  </article></li>;
}

export function ReservationMail({ spotId, reservationId, revision, onDenied, onReload }: { spotId: string; reservationId: string; revision: number; onDenied: () => void; onReload: () => Promise<void> }) {
  const [mail, setMail] = useState<BookingMail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const load = useCallback(async (beforeId: string | null = null) => {
    if (inFlight.current) return;
    const request = new AbortController(); active.current = request; inFlight.current = true;
    setLoading(true); setError(null);
    try {
      const page = await readBookingMail(spotId, reservationId, beforeId, request.signal);
      if (request.signal.aborted) return;
      setMail((previous) => {
        if (!beforeId || !previous) return page;
        const seen = new Set(previous.messages.map((m) => m.id));
        return { ...previous, revision: page.revision, guestAccess: page.guestAccess, deliveryBlocked: page.deliveryBlocked, nextCursor: page.nextCursor, messages: [...previous.messages, ...page.messages.filter((m) => !seen.has(m.id))] };
      });
    } catch (failure) {
      if (request.signal.aborted) return;
      if (bookingReadDenied(failure)) { setMail(null); onDenied(); } else setError(bookingError(failure));
    } finally { if (!request.signal.aborted) { setLoading(false); inFlight.current = false; } }
  }, [spotId, reservationId, onDenied]);
  useEffect(() => {
    void load();
    return () => { active.current?.abort(); inFlight.current = false; };
  }, [load]);
  return <section className={styles.note} aria-label="Gastnachrichten">
    <div className={styles.historyHeading}><h3>Gastnachrichten</h3><button type="button" className={styles.secondary} disabled={loading} onClick={() => void load()}>Versandstatus aktualisieren</button></div>
    <p className={styles.help}>Neueste Nachrichten zuerst. Die Anzeige aktualisiert sich auf Abruf; eine fehlende Rückmeldung bestätigt keine Zustellung.</p>
    {loading && <p role="status">Versandstatus wird geladen …</p>}
    {error && <p role="alert" className={styles.error}>{error} {mail ? "Die bisherigen Angaben sind möglicherweise nicht mehr aktuell." : "Der Versandstatus ist nicht bekannt."}</p>}
    {mail && <>
      <p className={styles.help}>Neueste Nachrichten geprüft: {dateTime(mail.observedAt)}</p>
      {mail.revision !== revision && <div className={styles.confirmation}><p>Die Reservierung wurde inzwischen geändert.</p><button type="button" className={styles.secondary} onClick={() => void onReload()}>Reservierung neu laden</button></div>}
      {mail.guestAccess === "revoked" && <p>Der bisherige Gastlink wurde ungültig gemacht. Eine neue Bestätigung mit neuem Link ist noch nicht bereitgestellt.</p>}
      {mail.guestAccess === "expired" && <p>Der Gastlink ist abgelaufen.</p>}
      {mail.deliveryBlocked && <p>Weitere Nachrichten für diese Buchung sind wegen einer Zustellrückmeldung gesperrt. Der Gastlink wird dadurch nicht automatisch ungültig.</p>}
      {mail.messages.length ? <ol className={styles.historyList}>{mail.messages.map((m) => <Message key={m.id} message={m} />)}</ol> : <p>Für diese Reservierung ist keine Gastnachricht protokolliert.</p>}
      {mail.nextCursor && <button type="button" className={styles.secondary} disabled={loading} onClick={() => void load(mail.nextCursor)}>Ältere Nachrichten laden</button>}
    </>}
  </section>;
}
