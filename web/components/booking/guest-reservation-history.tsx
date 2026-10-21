"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, readGuestReservations, type GuestReservations, type BookingSearchCursor } from "@/lib/booking-api";
import { statusLabels } from "./reservation-labels";
import styles from "./console.module.css";

export function GuestReservationHistory({ spotId, guestId, online, disabled, isCurrent, onDenied, onOpen }: {
  spotId: string; guestId: string; online: boolean; disabled: boolean; isCurrent: () => boolean; onDenied: () => void; onOpen: (row: { id: string; starts_at: string }) => void;
}) {
  const [open, setOpen] = useState(false), [page, setPage] = useState<GuestReservations | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const load = useCallback(async (cursor: BookingSearchCursor | null) => {
    if (!online || !isCurrent()) return;
    cancel(); const current = generation.current; controller.current = new AbortController(); setLoading(true); setPage(null); setError(null);
    try { const value = await readGuestReservations(spotId,guestId,cursor,controller.current.signal); if (current === generation.current && isCurrent()) setPage(value); }
    catch (error) { if (current === generation.current && isCurrent()) { if (bookingReadDenied(error)) onDenied(); else setError(bookingError(error)); } }
    finally { if (current === generation.current && isCurrent()) setLoading(false); }
  }, [spotId,guestId,online,isCurrent,onDenied,cancel]);
  useEffect(() => { setPage(null); setError(null); if (open && online) void load(null); return cancel; }, [open,online,load,cancel]);
  return <section className={styles.cardCopy} aria-label="Zugeordnete Reservierungen">
    <button type="button" className={styles.secondary} disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Reservierungen ausblenden" : "Zugeordnete Reservierungen anzeigen"}</button>
    {open && <><p className={styles.help}>Bewusst vom Team zugeordnete Buchungen · neueste Buchungszeit zuerst. Stornierte oder zukünftige Reservierungen bestätigen keinen Besuch. Aufgehobene Zuordnungen erscheinen hier nicht.</p>
      {!online && <p role="status" className={styles.help}>Offline · Verbinde dich für den aktuellen Verlauf.</p>}
      {loading && <p role="status" className={styles.help}>Zugeordnete Reservierungen werden geladen …</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {online && page && <><p role="status" className={styles.help}>{page.reservations.length ? `${page.reservations.length} Reservierungen auf dieser Seite` : "Noch keine Reservierungen zugeordnet."}</p><ul className={styles.searchResults}>{page.reservations.map(row => <li key={row.id}><button type="button" className={styles.secondary} disabled={disabled || loading} onClick={() => { if (isCurrent()) onOpen(row); }}><strong>{new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",dateStyle:"medium",timeStyle:"short"}).format(new Date(row.starts_at))}</strong><span>{row.guest_name} · {row.party_size} Personen</span><span>{statusLabels[row.status]}</span><span>Reservierung öffnen</span></button></li>)}</ul>{page.next_cursor && <button type="button" className={styles.secondary} disabled={disabled || loading} onClick={() => void load(page.next_cursor)}>Weitere zugeordnete Reservierungen</button>}</>}
      {online && !loading && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => void load(null)}>Verlauf neu laden</button>}
    </>}
  </section>;
}
