"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { bookingError, bookingReadDenied, restaurantDate, restaurantTime, searchBookingReservations, validateBookingSearchScope, type BookingSearchPage, type BookingSearchRow } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import { statusLabels } from "./reservation-details";
import styles from "./console.module.css";

function yearAfter(date: string) { return new Date(Date.parse(date + "T12:00:00Z") + 365 * 86400_000).toISOString().slice(0, 10); }
export function ReservationSearch({ spotId, date, online, onClose, onOpen, onDenied }: {
  spotId: string; date: string; online: boolean; onClose: () => void; onOpen: (row: BookingSearchRow) => void; onDenied: () => void;
}) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(date), [to, setTo] = useState(() => yearAfter(date));
  const [page, setPage] = useState<BookingSearchPage | null>(null), [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!online) { generation.current++; controller.current?.abort(); setBusy(false); setPage(null); setError("Offline. Stelle die Verbindung wieder her und suche erneut."); }
    else setError(null);
  }, [online]);
  let valid = true;
  try { validateBookingSearchScope({ query, from, to }); } catch { valid = false; }
  function changed() { generation.current++; controller.current?.abort(); setBusy(false); setPage(null); setError(null); setOffset(0); }
  async function search(more = false) {
    if (!online || !valid || busy || (more && !page?.next_cursor)) return;
    const request = ++generation.current;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy(true); setError(null); if (!more) { setPage(null); setOffset(0); }
    try {
      const next = await searchBookingReservations(spotId, { query, from, to }, more ? page!.next_cursor : null, controller.current.signal);
      if (request !== generation.current) return;
      setPage(next); if (more) setOffset(value => value + 25);
    } catch (error) {
      if (request !== generation.current) return;
      if (bookingReadDenied(error)) { setPage(null); onDenied(); }
      else setError(bookingError(error));
    } finally { if (request === generation.current) setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void search(); }
  return <ConsolePanel focusFallbackSelector="[data-booking-workspace-focus]" title="Reservierungen finden" onClose={onClose}>
    <div className={styles.drawerBody}>
      <p className={styles.help}>Suche in diesem Restaurant nach Name, E-Mail oder Telefonnummer. Jede Zeile ist eine einzelne Reservierung; gleiche Kontaktdaten bedeuten nicht automatisch denselben Gast.</p>
      <form className={styles.searchForm} onSubmit={submit}>
        <label>Name oder Kontakt<input data-initial-focus type="search" value={query} autoComplete="off" maxLength={240} onChange={event => { changed(); setQuery(event.target.value); }} /></label>
        <div className={styles.fields}><label>Von<input type="date" value={from} required onChange={event => { changed(); setFrom(event.target.value); }} /></label><label>Bis<input type="date" value={to} required onChange={event => { changed(); setTo(event.target.value); }} /></label></div>
        <p className={styles.help}>Mindestens 3 Zeichen · höchstens 366 Kalendertage · alle Status, unabhängig von den Filtern im Buch.</p>
        <button className={styles.primary} type="submit" disabled={!valid || !online || busy}>{busy ? "Suche läuft …" : "Reservierungen suchen"}</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div role="status" className={styles.help}>{page && (page.reservations.length ? `Treffer ${offset + 1}–${offset + page.reservations.length}${page.next_cursor ? " · weitere vorhanden" : ""}` : "Keine Reservierungen für diese Suche gefunden.")}</div>
      {page && <ul className={styles.searchResults}>{page.reservations.map(row => <li key={row.id}><button type="button" className={styles.secondary} disabled={busy || !online} onClick={() => onOpen(row)} aria-label={`Reservierung von ${row.guest_name} am ${restaurantDate(new Date(row.starts_at))} öffnen`}>
        <strong>{row.guest_name}</strong><span>{new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium" }).format(new Date(row.starts_at))} · {restaurantTime(row.starts_at, row.ends_at)}</span>
        <span>{row.party_size} Personen · {statusLabels[row.status]}</span>{row.guest_contact && <span>{row.guest_contact}</span>}
      </button></li>)}</ul>}
      <div className={styles.actions}>{page?.next_cursor && <button type="button" className={styles.secondary} disabled={busy || !online} onClick={() => void search(true)}>Nächste 25 Treffer</button>}{offset > 0 && <button type="button" className={styles.secondary} disabled={busy || !online} onClick={() => void search()}>Zur ersten Seite</button>}</div>
    </div>
  </ConsolePanel>;
}
