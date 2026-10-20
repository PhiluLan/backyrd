"use client";

import { useRef, useState } from "react";
import { bookingError, restaurantDate, restaurantTime, setBookingStatus, type BookingReservation, type BookingSlot, type BookingSnapshot, type BookingStatus } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import { EditReservation } from "./edit-reservation";
import styles from "./console.module.css";

export const statusLabels: Record<BookingStatus, string> = { pending: "Anfrage offen", confirmed: "Bestätigt", arrived: "Angekommen", seated: "Am Tisch", completed: "Besuch beendet", cancelled: "Storniert", declined: "Abgelehnt", no_show: "Nicht erschienen" };
const sources = { phone: "Telefon", email: "E-Mail", walk_in: "Vor Ort", operator: "Betreiber" };

export function ReservationDetails({ spotId, reservation: r, snapshot, onClose, onSaved, onAmended, onReload, onBusy }: {
  spotId: string; reservation: BookingReservation; snapshot: BookingSnapshot;
  onClose: () => void; onSaved: () => Promise<void>; onReload: () => Promise<void>; onBusy: (busy: boolean) => void;
  onAmended: (date: string, slot: BookingSlot) => Promise<void>;
}) {
  const [target, setTarget] = useState<BookingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const inFlight = useRef(false);
  const table = snapshot.tables.find((table) => table.id === r.table_id);
  const area = snapshot.areas.find((area) => area.id === table?.area_id);
  const lifecycle = snapshot.capabilities?.service_lifecycle === true;
  const isToday = restaurantDate(new Date(r.starts_at)) === restaurantDate();
  async function save() {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); onBusy(true); setError(null);
    try { await setBookingStatus(spotId, r, target); setTarget(null); await onSaved(); }
    catch (error) { setError(bookingError(error)); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusy(true);
    try { await onReload(); setTarget(null); setError(null); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  if (editing) return <EditReservation spotId={spotId} reservation={r} snapshot={snapshot} onClose={() => setEditing(false)} onBusy={onBusy} onReload={onReload} onSaved={async (date, slot) => { await onAmended(date, slot); setEditing(false); }} />;
  return <ConsolePanel title="Reservierung" busy={busy} onClose={onClose}>
    <div className={styles.drawerBody}>
      <div className={styles.detailHeading}><h3>{r.guest_name}</h3><span className={styles.status} data-status={r.status}>{statusLabels[r.status]}</span></div>
      <p className={styles.help}>{new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(new Date(r.starts_at))}</p>
      <p className={styles.detailTime}>{restaurantTime(r.starts_at)}–{restaurantTime(r.ends_at)} <span>· {r.party_size} {r.party_size === 1 ? "Person" : "Personen"}</span></p>
      <dl className={styles.detailGrid}><div><dt>Bereich / Tisch</dt><dd>{area?.name ?? "Bereich"} · {table?.label ?? "Tisch"}</dd></div><div><dt>Service</dt><dd>{snapshot.services.find((s) => s.id === r.service_id)?.name ?? "Service"}</dd></div><div><dt>Kontakt</dt><dd>{r.guest_contact || "Nicht hinterlegt"}</dd></div><div><dt>Quelle</dt><dd>{sources[r.source]}</dd></div></dl>
      {r.note && <section className={styles.note}><h3>Interner Hinweis</h3><p>{r.note}</p></section>}
      <p className={styles.help}>Referenz #{r.id.slice(0, 8).toUpperCase()}</p>
      {snapshot.capabilities?.reservation_amendments && ["pending", "confirmed", "arrived", "seated"].includes(r.status) && <button className={styles.secondary} onClick={() => setEditing(true)}>Reservierung bearbeiten</button>}
      {lifecycle && <section className={styles.note} aria-label="Serviceverlauf"><h3>Serviceverlauf</h3><dl className={styles.detailGrid}>{([["Angekommen", r.arrived_at], ["Am Tisch", r.seated_at], ["Besuch beendet", r.completed_at]] as const).map(([label, at]) => <div key={label}><dt>{label}</dt><dd>{at ? new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(at)) : "Noch nicht erfasst"}</dd></div>)}</dl><p className={styles.help}>Die geplante Reservierungszeit bleibt erhalten. Ein beendeter Besuch gibt den Tisch für neue Buchungen frei.</p></section>}
      {error && <div className={styles.error}><p role="alert">{error}</p><button className={styles.secondary} disabled={busy} onClick={() => void refresh()}>Reservierung neu laden</button></div>}
      {target ? <section className={styles.confirmation} aria-label="Statuswechsel bestätigen"><h3>{statusLabels[target]}?</h3><p>Der Statuswechsel wird im Buchungsverlauf protokolliert.</p><div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void save()}>Status speichern</button><button className={styles.secondary} disabled={busy} onClick={() => setTarget(null)}>Zurück</button></div></section> : <div className={styles.detailActions}>
        {r.status === "pending" && <><button className={styles.primary} onClick={() => setTarget("confirmed")}>Bestätigen</button><button className={styles.secondary} onClick={() => setTarget("declined")}>Ablehnen</button></>}
        {lifecycle && isToday && r.status === "confirmed" && <button className={styles.primary} onClick={() => setTarget("arrived")}>Gast angekommen</button>}
        {lifecycle && isToday && (r.status === "confirmed" || r.status === "arrived") && <button className={r.status === "arrived" ? styles.primary : styles.secondary} onClick={() => setTarget("seated")}>Am Tisch platzieren</button>}
        {lifecycle && r.status === "seated" && <button className={styles.primary} onClick={() => setTarget("completed")}>Besuch beenden</button>}
        {(r.status === "confirmed" || r.status === "pending" || r.status === "arrived") && <button className={styles.secondary} onClick={() => setTarget("cancelled")}>Stornieren</button>}
        {r.status === "confirmed" && Date.parse(r.starts_at) <= Date.now() && <button className={styles.secondary} onClick={() => setTarget("no_show")}>Nicht erschienen</button>}
      </div>}
    </div>
  </ConsolePanel>;
}
