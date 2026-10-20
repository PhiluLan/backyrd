"use client";

import { useRef, useState } from "react";
import { bookingError, restaurantTime, setBookingStatus, type BookingReservation, type BookingSnapshot, type BookingStatus } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export const statusLabels: Record<BookingStatus, string> = { pending: "Anfrage offen", confirmed: "Bestätigt", cancelled: "Storniert", declined: "Abgelehnt", no_show: "Nicht erschienen" };
const sources = { phone: "Telefon", email: "E-Mail", walk_in: "Vor Ort", operator: "Betreiber" };

export function ReservationDetails({ spotId, reservation: r, snapshot, onClose, onSaved, onBusy }: {
  spotId: string; reservation: BookingReservation; snapshot: BookingSnapshot;
  onClose: () => void; onSaved: () => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [target, setTarget] = useState<BookingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const table = snapshot.tables.find((table) => table.id === r.table_id);
  const area = snapshot.areas.find((area) => area.id === table?.area_id);
  async function save() {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); onBusy(true); setError(null);
    try { await setBookingStatus(spotId, r, target); setTarget(null); await onSaved(); }
    catch (error) { setError(bookingError(error)); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  return <ConsolePanel title="Reservierung" busy={busy} onClose={onClose}>
    <div className={styles.drawerBody}>
      <div className={styles.detailHeading}><h3>{r.guest_name}</h3><span className={styles.status} data-status={r.status}>{statusLabels[r.status]}</span></div>
      <p className={styles.detailTime}>{restaurantTime(r.starts_at)}–{restaurantTime(r.ends_at)} <span>· {r.party_size} {r.party_size === 1 ? "Person" : "Personen"}</span></p>
      <dl className={styles.detailGrid}><div><dt>Bereich / Tisch</dt><dd>{area?.name ?? "Bereich"} · {table?.label ?? "Tisch"}</dd></div><div><dt>Service</dt><dd>{snapshot.services.find((s) => s.id === r.service_id)?.name ?? "Service"}</dd></div><div><dt>Kontakt</dt><dd>{r.guest_contact || "Nicht hinterlegt"}</dd></div><div><dt>Quelle</dt><dd>{sources[r.source]}</dd></div></dl>
      {r.note && <section className={styles.note}><h3>Interner Hinweis</h3><p>{r.note}</p></section>}
      <p className={styles.help}>Referenz #{r.id.slice(0, 8).toUpperCase()}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {target ? <section className={styles.confirmation} aria-label="Statuswechsel bestätigen"><h3>{statusLabels[target]}?</h3><p>Der Statuswechsel wird im Buchungsverlauf protokolliert.</p><div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void save()}>Status speichern</button><button className={styles.secondary} disabled={busy} onClick={() => setTarget(null)}>Zurück</button></div></section> : <div className={styles.detailActions}>
        {r.status === "pending" && <><button className={styles.primary} onClick={() => setTarget("confirmed")}>Bestätigen</button><button className={styles.secondary} onClick={() => setTarget("declined")}>Ablehnen</button></>}
        {(r.status === "confirmed" || r.status === "pending") && <button className={styles.secondary} onClick={() => setTarget("cancelled")}>Stornieren</button>}
        {r.status === "confirmed" && Date.parse(r.starts_at) <= Date.now() && <button className={styles.secondary} onClick={() => setTarget("no_show")}>Nicht erschienen</button>}
      </div>}
    </div>
  </ConsolePanel>;
}
