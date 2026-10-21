"use client";

import { useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, readGuestCard, readGuestCards, type BookingGuestCard, type GuestCardPage } from "@/lib/booking-api";
import styles from "./console.module.css";

/** Read-only selection: copying values neither links identities nor edits a card. */
export function ReservationGuestPicker({ spotId, online, disabled, isCurrent, onDenied, onCopy, purpose = "copy" }: {
  purpose?: "copy" | "associate"; spotId: string; online: boolean; disabled: boolean; isCurrent: () => boolean;
  onDenied: () => void; onCopy: (copy: { name: string; contact: string; card: { id: string; revision: number } }) => void;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [page, setPage] = useState<GuestCardPage | null>(null), [guest, setGuest] = useState<BookingGuestCard | null>(null);
  const [choice, setChoice] = useState("phone"), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), launcher = useRef<HTMLButtonElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null);
  function cancel() { generation.current++; controller.current?.abort(); }
  function clear() { cancel(); setPage(null); setGuest(null); setError(null); setLoading(false); }
  useEffect(() => {
    if (!online || disabled) { generation.current++; controller.current?.abort(); setPage(null); setGuest(null); setError(null); setLoading(false); }
  }, [online, disabled]);
  useEffect(() => { if (guest) reviewHeading.current?.focus(); }, [guest]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  async function load(cursor: GuestCardPage["next_cursor"] = null) {
    if (!online || disabled || !isCurrent()) return;
    cancel(); const current = generation.current; controller.current = new AbortController();
    setPage(null); setGuest(null); setLoading(true); setError(null);
    try { const result = await readGuestCards(spotId, query, false, cursor, controller.current.signal); if (current === generation.current && isCurrent()) setPage(result); }
    catch (error) { if (current === generation.current && isCurrent()) { if (bookingReadDenied(error)) onDenied(); else setError(bookingError(error)); } }
    finally { if (current === generation.current && isCurrent()) setLoading(false); }
  }
  async function review(id: string) {
    if (!online || disabled || !isCurrent()) return;
    cancel(); const current = generation.current; controller.current = new AbortController();
    setGuest(null); setLoading(true); setError(null);
    try {
      const result = await readGuestCard(spotId, id, controller.current.signal);
      if (current !== generation.current || !isCurrent()) return;
      if (result.guest.is_archived) { setError("Diese Gästekarte ist archiviert. Suche eine aktive Karte."); return; }
      setGuest(result.guest); setChoice(result.guest.phone ? "phone" : "email");
    } catch (error) { if (current === generation.current && isCurrent()) { if (bookingReadDenied(error)) onDenied(); else setError(bookingError(error)); } }
    finally { if (current === generation.current && isCurrent()) setLoading(false); }
  }
  function close() { clear(); setOpen(false); launcher.current?.focus(); }
  return <section aria-label="Gespeicherte Gäste" className={styles.editorDetails} onChange={event => event.stopPropagation()} onKeyDown={event => { if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={launcher} type="button" className={styles.secondary} disabled={disabled || !online} aria-expanded={open} onClick={() => { if (open) close(); else setOpen(true); }}>Gespeicherten Gast auswählen</button>
    {open && <div className={styles.searchForm}>
      <p className={styles.help}>{purpose === "associate" ? "Suche die passende aktive Gästekarte. Die Zuordnung verändert keine gespeicherten Buchungsangaben oder Kontaktwerte." : "Suche in den aktiven Gästekarten dieses Restaurants. Die Übernahme ersetzt Gastname und Kontakt in diesem Entwurf. Die Karte und bisherige Buchungen bleiben erhalten."}</p>
      <label>Gästekarte suchen<input type="search" maxLength={320} autoComplete="off" value={query} disabled={disabled || !online} onChange={event => { clear(); setQuery(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void load(); } }} /></label>
      <div className={styles.actions}><button type="button" className={styles.secondary} disabled={disabled || !online || loading} onClick={() => void load()}>Gäste suchen</button><button type="button" className={styles.secondary} onClick={close}>Auswahl schliessen</button></div>
      {!online && <p role="status" className={styles.help}>Offline · Verbinde dich, um aktuelle Gästekarten auszuwählen. Dein Reservierungsentwurf bleibt erhalten.</p>}
      {loading && <p role="status" className={styles.help}>Gästekarten werden geprüft …</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {guest ? <div className={styles.searchForm + " " + styles.cardCopy} aria-label="Kontaktdaten prüfen">
        <h3 ref={reviewHeading} tabIndex={-1}>{guest.name}</h3><p className={styles.help}>Vom Team erfasste Angaben · bitte mit dem Gast abgleichen.</p>
        {purpose === "associate" && <p className={styles.help}>{guest.phone ?? "Kein Telefon"} · {guest.email ?? "Keine E-Mail"}</p>}
        {purpose === "copy" && guest.phone && <label className={styles.checkbox}><input type="radio" name="reservation-guest-contact" checked={choice === "phone"} onChange={() => setChoice("phone")} />Telefon: {guest.phone}</label>}
        {purpose === "copy" && guest.email && <label className={styles.checkbox}><input type="radio" name="reservation-guest-contact" checked={choice === "email"} onChange={() => setChoice("email")} />E-Mail: {guest.email}</label>}
        {purpose === "copy" && !guest.phone && !guest.email && <p className={styles.help}>Keine Kontaktdaten erfasst. Bei der Übernahme wird das Kontaktfeld geleert.</p>}
        <button type="button" className={styles.secondary} disabled={disabled || !online || loading} onClick={() => { if (!isCurrent()) return; onCopy({ name: guest.name, contact: (choice === "phone" ? guest.phone : guest.email) ?? "", card: { id: guest.id, revision: guest.revision } }); close(); }}>{purpose === "associate" ? "Diese Gästekarte auswählen" : "Gastname und Kontakt übernehmen"}</button>
      </div> : page && !loading && <>
        <p role="status" className={styles.help}>{page.guests.length ? `${page.guests.length} aktive Karten auf dieser Seite · gleiche Kontakte können zu verschiedenen Karten gehören.` : "Keine aktive Gästekarte gefunden. Du kannst den Gast direkt im Reservierungsformular erfassen."}</p>
        <ul className={styles.searchResults}>{page.guests.map(card => <li key={card.id}><button type="button" className={styles.secondary} disabled={disabled || !online || loading} onClick={() => void review(card.id)}><strong>{card.name}</strong>{card.phone && <span>{card.phone}</span>}{card.email && <span>{card.email}</span>}<span>Kontaktdaten prüfen</span></button></li>)}</ul>
        {page.next_cursor && <button type="button" className={styles.secondary} disabled={disabled || !online || loading} onClick={() => void load(page.next_cursor)}>Weitere Gäste</button>}
      </>}
    </div>}
  </section>;
}
