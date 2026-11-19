"use client";

import { useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, readBookingHistory, restaurantTime, type BookingHistory, type BookingHistoryEvent, type BookingHistoryState } from "@/lib/booking-api";
import styles from "./console.module.css";

import { statusLabels as status } from "./reservation-labels";
const dateTime = (value: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(value));
function title(e: BookingHistoryEvent) {
  if (e.action === "reservation_created") return "Reservierung erstellt";
  if (e.action === "walk_in_created") return "Walk-in platziert";
  if (e.action === "reservation_amended") return "Reservierung bearbeitet";
  const next = e.action.split("_to_")[1];
  return next && Object.hasOwn(status, next) ? status[next as keyof typeof status] : "Änderung protokolliert";
}
function changes(before: BookingHistoryState | null, after: BookingHistoryState): { label: string; before: string | null; after: string }[] {
  const rows: { label: string; before: string | null; after: string }[] = [];
  function add(label: string, previous: string | null, next: string) { if (previous !== next) rows.push({ label, before: previous, after: next }); }
  add("Status", before ? status[before.status] : null, status[after.status]);
  add("Personen", before ? String(before.party_size) : null, String(after.party_size));
  const period = (s: BookingHistoryState) => `${dateTime(s.starts_at)} – ${restaurantTime(s.ends_at, s.starts_at)}`;
  if (!before || before.starts_at !== after.starts_at || before.ends_at !== after.ends_at) add("Termin", before ? period(before) : null, period(after));
  if (!before || before.table_id !== after.table_id) add("Tisch", before?.table_label ?? null, after.table_label);
  if (!before || before.service_id !== after.service_id) add("Service", before?.service_name ?? null, after.service_name);
  for (const [label, key] of [["Angekommen", "arrived_at"], ["Platziert", "seated_at"], ["Besuch beendet", "completed_at"]] as const) {
    if (after[key] && before?.[key] !== after[key]) add(label, before?.[key] ? dateTime(before[key]) : null, dateTime(after[key]));
  }
  return rows;
}
function Event({ event }: { event: BookingHistoryEvent }) {
  const details = event.details;
  const role = details ? { owner: "Betreiber", host: "Service", manager: "Management", viewer: "Nur lesen" }[details.actor_role] : "Konto";
  return <li className={styles.historyEvent}><article>
    <h4>{title(event)}</h4><p className={styles.help}><time dateTime={event.at}>{dateTime(event.at)}</time> · {event.actor_is_you ? "Du" : event.actor_id ? `${role} · ${event.actor_id.slice(0, 8).toUpperCase()}` : "Konto nicht mehr hinterlegt"}</p>
    {details ? <><dl className={styles.historyDiff}>{changes(details.before, details.after).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.before !== null && <><span className={styles.help}>Vorher: {row.before}</span></>}Jetzt: {row.after}</dd></div>)}</dl>
      {details.changed_fields.length > 0 && <p>{details.changed_fields.map((field) => ({ guest_name: "Name aktualisiert", guest_contact: "Kontakt aktualisiert", note: "Interne Notiz aktualisiert" })[field]).join(" · ")}</p>}
    </> : <p className={styles.help}>Für diesen älteren Eintrag sind keine Detailwerte gespeichert.</p>}
  </article></li>;
}
export function ReservationHistory({ spotId, reservationId, revision, onDenied, onReload }: { spotId: string; reservationId: string; revision: number; onDenied: () => void; onReload: () => Promise<void> }) {
  const [history, setHistory] = useState<BookingHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const request = new AbortController(); controller.current = request; inFlight.current = true;
    void readBookingHistory(spotId, reservationId, null, request.signal).then((data) => { if (!request.signal.aborted) setHistory(data); }).catch((failure: unknown) => {
      if (request.signal.aborted) return;
      if (bookingReadDenied(failure)) { setHistory(null); onDenied(); } else setError(bookingError(failure));
    }).finally(() => { if (!request.signal.aborted) { setLoading(false); inFlight.current = false; } });
    return () => { mounted.current = false; request.abort(); controller.current?.abort(); };
  }, [spotId, reservationId, onDenied]);
  async function loadMore(refresh = false) {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true); setError(null);
    const request = new AbortController(); controller.current = request;
    try {
      const page = await readBookingHistory(spotId, reservationId, refresh ? null : history?.nextCursor ?? null, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      setHistory((current) => {
        if (refresh || !current) return page;
        const seen = new Set(current.events.map((e) => e.id));
        return { ...page, events: [...current.events, ...page.events.filter((e) => !seen.has(e.id))] };
      });
    } catch (failure) { if (!mounted.current || request.signal.aborted) return; if (bookingReadDenied(failure)) { setHistory(null); onDenied(); } else setError(bookingError(failure)); }
    finally { if (mounted.current && !request.signal.aborted) { setLoading(false); inFlight.current = false; } }
  }
  return <section className={styles.note} aria-label="Änderungsverlauf">
    <div className={styles.historyHeading}><h3>Änderungsverlauf</h3><button type="button" className={styles.secondary} disabled={loading} onClick={() => void loadMore(true)}>Verlauf aktualisieren</button></div>
    <p className={styles.help}>Neueste Änderungen zuerst. Bei Gästedaten wird nur die Änderung vermerkt.</p>
    {loading && <p role="status">Verlauf wird geladen …</p>}
    {error && <p role="alert" className={styles.error}>{error} {history ? "Die bisherigen Einträge bleiben sichtbar und sind möglicherweise nicht aktuell." : "Es konnte kein Verlauf geladen werden."}</p>}
    {history && history.revision !== revision && <div className={styles.confirmation}><p>Die Reservierung wurde inzwischen geändert. Lade die aktuellen Reservierungsdaten, bevor du weiterarbeitest.</p><button type="button" className={styles.secondary} onClick={() => void onReload()}>Reservierung neu laden</button></div>}
    {history && <><p className={styles.help}>Stand {dateTime(history.observedAt)}</p>{history.events.length ? <ol className={styles.historyList}>{history.events.map((e) => <Event event={e} key={e.id} />)}</ol> : <p>Für diese Reservierung sind noch keine Einträge vorhanden.</p>}{history.nextCursor && <button type="button" className={styles.secondary} disabled={loading} onClick={() => void loadMore()}>Ältere Einträge laden</button>}</>}
  </section>;
}
