"use client";

import { useRef, useState } from "react";
import { bookingAllocationLabel, bookingError, restaurantDate, restaurantTime, setBookingStatus, type BookingReservation, type BookingSlot, type BookingSnapshot, type BookingStatus } from "@/lib/booking-api";
import { ReservationGuest } from "./reservation-guest";
import { ConsolePanel } from "./console-panel";
import { ManualConfirmation } from "./manual-confirmation";
import { ReissueGuestLink } from "./reissue-guest-link";
import { ReservationMail } from "./reservation-mail";
import { ReservationHistory } from "./reservation-history";
import { TransferReservation } from "./transfer-reservation";
import { EditReservation } from "./edit-reservation";
import styles from "./console.module.css";

export { statusLabels } from "./reservation-labels";
import { statusLabels } from "./reservation-labels";
const sources = { phone: "Telefon", email: "E-Mail", walk_in: "Vor Ort", operator: "Betreiber", website: "Online-Buchung" };

export function ReservationDetails({ spotId, reservation: r, snapshot, onClose, onDenied, onSaved, onAmended, onReload, onTransferred, onBusy, onUncertain, actorId, online, isCurrent }:  {
  actorId: string; online: boolean; isCurrent: () => boolean;
  spotId: string; reservation: BookingReservation; snapshot: BookingSnapshot;
  onClose: () => void; onDenied: () => void; onSaved: () => Promise<void>; onTransferred: () => Promise<void>; onReload: () => Promise<void>; onBusy: (busy: boolean) => void;
  onUncertain: (date: string) => void;
  onAmended: (date: string, slot: BookingSlot) => Promise<void>;
}) {
  const [target, setTarget] = useState<BookingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [associationOpen, setAssociationOpen] = useState(false);
  const [associationNotice, setAssociationNotice] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mailNotice, setMailNotice] = useState<string | null>(null);
  const [mailPending, setMailPending] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const inFlight = useRef(false);
  const table = snapshot.tables.find((table) => table.id === r.table_id);
  const area = snapshot.areas.find((area) => area.id === table?.area_id);
  const writeAccess = snapshot.access?.can_write ?? true;
  const canWrite = writeAccess && !mailPending;
  const lifecycle = snapshot.capabilities?.service_lifecycle === true;
  const isToday = restaurantDate(new Date(r.starts_at)) === restaurantDate();
  async function save() {
    if (!canWrite || !target || inFlight.current) return;
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
  if (associationOpen) return <ReservationGuest key={`${spotId}:${r.id}:${r.revision}`} spotId={spotId} actorId={actorId} reservation={r} online={online} canWrite={canWrite} isCurrent={isCurrent} onDenied={onDenied} onBusy={onBusy} onReload={onReload} onClose={uncertain => { if (uncertain) onUncertain(restaurantDate(new Date(r.starts_at))); else setAssociationOpen(false); }} onSaved={async () => { setAssociationNotice(true); setAssociationOpen(false); await onReload(); }} />;
  if (transferring) return <TransferReservation spotId={spotId} reservation={r} snapshot={snapshot} onClose={(uncertain) => { if (uncertain) onUncertain(snapshot.operating_date ?? restaurantDate()); else setTransferring(false); }} onBusy={onBusy} onDenied={onDenied} onReload={onReload} onSaved={async () => { await onTransferred(); setTransferring(false); }} />;
  if (editing) return <EditReservation spotId={spotId} reservation={r} snapshot={snapshot} onClose={(uncertain, date) => { if (uncertain) onUncertain(date ?? restaurantDate(new Date(r.starts_at))); else setEditing(false); }} onBusy={onBusy} onReload={onReload} onSaved={async (date, slot) => { await onAmended(date, slot); setEditing(false); }} />;
  return <ConsolePanel focusFallbackSelector="[data-booking-workspace-focus]" title="Reservierung" busy={busy} uncertain={mailPending} uncertainHelp="Ein Gastlink-Auftrag ist noch offen. Beim erneuten Öffnen in diesem Tab kannst du ausschliesslich denselben Auftrag prüfen oder wiederholen." onClose={onClose}>
    <div className={styles.drawerBody}>
      <div className={styles.detailHeading}><h3>{r.guest_name}</h3><span className={styles.status} data-status={r.status}>{statusLabels[r.status]}</span></div>
      <p className={styles.help}>{new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(new Date(r.starts_at))}</p>
      <p className={styles.detailTime}>{restaurantTime(r.starts_at, r.ends_at)}–{restaurantTime(r.ends_at, r.starts_at)} <span>· {r.party_size} {r.party_size === 1 ? "Person" : "Personen"}</span></p>
      {r.allocation_starts_at && r.allocation_ends_at && <p className={styles.note}>Tischwechsel um {restaurantTime(r.allocation_starts_at)} · neue Belegung voraussichtlich bis {restaurantTime(r.allocation_ends_at, r.allocation_starts_at)}. Die oben angezeigte Zeit ist die ursprüngliche Reservierung.</p>}
      <dl className={styles.detailGrid}><div><dt>Bereich / Tisch</dt><dd>{area?.name ?? "Bereich"} · {bookingAllocationLabel(r, snapshot)}</dd></div><div><dt>Service</dt><dd>{snapshot.services.find((s) => s.id === r.service_id)?.name ?? "Service"}</dd></div><div><dt>Kontakt</dt><dd>{r.guest_contact || "Nicht hinterlegt"}</dd></div><div><dt>Quelle</dt><dd>{r.is_walk_in ? "Walk-in · sofortige Platzierung" : sources[r.source]}</dd></div></dl>
      {r.note && <section className={styles.note}><h3>Interner Hinweis</h3><p>{r.note}</p></section>}
      <p className={styles.help}>Referenz #{r.id.slice(0, 8).toUpperCase()}</p>
      {canWrite && r.status === "seated" && snapshot.capabilities?.seated_transfers && <button type="button" className={styles.secondary} onClick={() => setTransferring(true)}>Gast umplatzieren</button>}
      {canWrite && snapshot.capabilities?.reservation_amendments && ["pending", "confirmed", "arrived", "seated"].includes(r.status) && <button className={styles.secondary} onClick={() => setEditing(true)}>Reservierung bearbeiten</button>}
      {lifecycle && <section className={styles.note} aria-label="Serviceverlauf"><h3>Serviceverlauf</h3><dl className={styles.detailGrid}>{([["Angekommen", r.arrived_at], ["Am Tisch", r.seated_at], ["Besuch beendet", r.completed_at]] as const).map(([label, at]) => <div key={label}><dt>{label}</dt><dd>{at ? new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(at)) : "Noch nicht erfasst"}</dd></div>)}</dl><p className={styles.help}>Die geplante Reservierungszeit bleibt erhalten. Ein beendeter Besuch gibt den Tisch für neue Buchungen frei.</p></section>}
      {error && <div className={styles.error}><p role="alert">{error}</p><button className={styles.secondary} disabled={busy} onClick={() => void refresh()}>Reservierung neu laden</button></div>}
      {canWrite && (target ? <section className={styles.confirmation} aria-label="Statuswechsel bestätigen"><h3>{statusLabels[target]}?</h3><p>Der Statuswechsel wird im Buchungsverlauf protokolliert.</p><div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void save()}>Status speichern</button><button className={styles.secondary} disabled={busy} onClick={() => setTarget(null)}>Zurück</button></div></section> : <div className={styles.detailActions}>
        {r.status === "pending" && <><button className={styles.primary} onClick={() => setTarget("confirmed")}>Bestätigen</button><button className={styles.secondary} onClick={() => setTarget("declined")}>Ablehnen</button></>}
        {lifecycle && isToday && r.status === "confirmed" && <button className={styles.primary} onClick={() => setTarget("arrived")}>Gast angekommen</button>}
        {lifecycle && isToday && (r.status === "confirmed" || r.status === "arrived") && <button className={r.status === "arrived" ? styles.primary : styles.secondary} onClick={() => setTarget("seated")}>Am Tisch platzieren</button>}
        {lifecycle && r.status === "seated" && <button className={styles.primary} onClick={() => setTarget("completed")}>Besuch beenden</button>}
        {(r.status === "confirmed" || r.status === "pending" || r.status === "arrived") && <button className={styles.secondary} onClick={() => setTarget("cancelled")}>Stornieren</button>}
        {r.status === "confirmed" && Date.parse(r.starts_at) <= Date.now() && <button className={styles.secondary} onClick={() => setTarget("no_show")}>Nicht erschienen</button>}
      </div>)}
      {mailNotice && <p role="status" className={styles.note}>{mailNotice}</p>}
      {writeAccess && r.source==="website" && snapshot.capabilities?.guest_link_reissue && <ReissueGuestLink key={`${spotId}:${r.id}:${r.revision}`} spotId={spotId} reservation={r} onBusy={(value) => { setBusy(value); onBusy(value); }} onPending={setMailPending} onDenied={onDenied} onSaved={async (queued) => { setMailNotice(queued ? "Die neue Bestätigung wurde zur Vorbereitung eingereiht. Das bestätigt noch keinen Versand. Prüfe den Versandstatus." : "Der frühere Auftrag wurde nicht ausgeführt. Die Reservierung wurde inzwischen geändert; der aktuelle Stand wird geladen."); await onReload(); }} />}
      {writeAccess&&snapshot.capabilities?.manual_guest_mail&&["phone","email","operator"].includes(r.source)&&<ManualConfirmation key={`${spotId}:${r.id}`} spotId={spotId} reservation={r} onBusy={value=>{setBusy(value);onBusy(value);}} onPending={setMailPending} onDenied={onDenied} onQueued={async()=>{setMailNotice("Die Gastnachricht wurde vorbereitet. Prüfe den aktuellen Versand- und Zustellstand unter Gastnachrichten.");setMailOpen(true);await onReload();}} onReload={onReload} />}
      {associationNotice && <p role="status" className={styles.note}>Die Zuordnung wurde gespeichert. Die Buchungsangaben bleiben erhalten.</p>}
      {snapshot.capabilities?.guest_history && <div className={styles.historySection}><button type="button" className={styles.secondary} disabled={busy || mailPending || !online} onClick={() => setAssociationOpen(true)}>Gästekarte zur Reservierung</button></div>}
      {snapshot.capabilities?.guest_mail && <div className={styles.historySection}><button type="button" className={styles.secondary} aria-expanded={mailOpen} onClick={() => setMailOpen(!mailOpen)}>{mailOpen ? "Gastnachrichten ausblenden" : "Gastnachrichten anzeigen"}</button>{mailOpen && <ReservationMail key={`${spotId}:${r.id}:${r.revision}`} spotId={spotId} reservationId={r.id} revision={r.revision ?? 0} manual={snapshot.capabilities?.manual_guest_mail===true} onDenied={onDenied} onReload={onReload} />}</div>}
      {snapshot.capabilities?.reservation_history && <div className={styles.historySection}><button type="button" className={styles.secondary} aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? "Änderungsverlauf ausblenden" : "Änderungsverlauf anzeigen"}</button>{historyOpen && <ReservationHistory key={`${spotId}:${r.id}:${r.revision}`} spotId={spotId} reservationId={r.id} revision={r.revision ?? 0} onDenied={onDenied} onReload={onReload} />}</div>}
    </div>
  </ConsolePanel>;
}
