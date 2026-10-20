"use client";

import { useRef, useState, type FormEvent } from "react";
import { bookingError, createBooking, readBookingSlots, restaurantTime, type BookingSlot, type BookingSnapshot, type BookingSource } from "@/lib/booking-api";
import styles from "./console.module.css";

export function NewReservation({ spotId, date, snapshot, onCreated, onBusy }: {
  spotId: string; date: string; snapshot: BookingSnapshot; onCreated: () => Promise<void>; onBusy: (value: boolean) => void;
}) {
  const [party, setParty] = useState("2");
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<BookingSource>("phone");
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const partySize = Number(party);
  const maxPartySize = snapshot.settings?.max_party_size ?? 8;
  const validParty = party.trim() !== "" && Number.isInteger(partySize) && partySize >= 1 && partySize <= maxPartySize;

  function changeParty(value: string) {
    setParty(value); setSlots([]); setSelected(""); setChecked(false);
    requestId.current = null; setSuccess(null);
  }

  async function checkSlots() {
    if (inFlight.current || !validParty) return;
    inFlight.current = true;
    setBusy(true); onBusy(true); setError(null); setSuccess(null); setSelected(""); setSlots([]); setChecked(false);
    try { setSlots(await readBookingSlots(spotId, date, partySize)); setChecked(true); }
    catch (e) { setError(bookingError(e)); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const slot = slots[Number(selected)];
    if (inFlight.current || !validParty || selected === "" || !slot) return;
    inFlight.current = true;
    setBusy(true); onBusy(true); setError(null); setSuccess(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const id = await createBooking(spotId, { requestId: requestId.current, slot, partySize, name, contact, note, source, status });
      setSuccess(`Reservierung ${id.slice(0, 8).toUpperCase()} wurde gespeichert.`);
      requestId.current = null;
      setSlots([]); setSelected(""); setChecked(false); setName(""); setContact(""); setNote("");
      await onCreated();
    } catch (e) { setError(bookingError(e)); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }

  return <section className={styles.panel} aria-labelledby="new-reservation-title">
    <div className={styles.panelHeading}><div><p className={styles.kicker}>DIREKT ERFASSEN</p><h2 id="new-reservation-title">Neue Reservierung</h2></div></div>
    <p className={styles.help}>Erfasse Telefon- und E-Mail-Buchungen. Freie Zeiten werden für das gewählte Datum geprüft. Bestätigungen werden in dieser Version im System gespeichert; es wird keine Nachricht an Gäste versendet.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {success && <p className={styles.success} role="status">{success}</p>}
    <form onSubmit={submit} onChange={() => { requestId.current = null; setSuccess(null); }}>
      <fieldset disabled={busy} className={styles.fieldset}>
        <div className={styles.fields}>
          <div className={styles.partyPicker}>
            <label>Personen<input type="number" inputMode="numeric" min={1} max={maxPartySize} step={1} required value={party} onChange={(e) => changeParty(e.target.value)} /></label>
            <div className={styles.partyChoices} role="group" aria-label="Personenzahl schnell wählen">
              {[1, 2, 3, 4, 6, 8].filter((count) => count <= maxPartySize).map((count) => <button key={count} type="button" aria-label={`${count} ${count === 1 ? "Person" : "Personen"}`} aria-pressed={validParty && partySize === count} onClick={() => changeParty(String(count))}>{count}</button>)}
            </div>
          </div>
          <button type="button" className={styles.secondary} disabled={!validParty} onClick={() => void checkSlots()}>{busy ? "Prüft …" : "Freie Zeiten prüfen"}</button>
        </div>
        {checked && !slots.length && <p className={styles.help}>Für diese Personenzahl ist an diesem Tag kein Tisch im Service verfügbar. Prüfe Datum, Servicezeiten und Tischgrössen.</p>}
        {!!slots.length && <>
          <label>Uhrzeit und Tisch<select required value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Freie Zeit auswählen</option>{slots.map((slot, index) => <option key={`${slot.service_id}-${slot.table_id}-${slot.starts_at}`} value={index}>{restaurantTime(slot.starts_at)}–{restaurantTime(slot.ends_at)} · {snapshot.tables.find((t) => t.id === slot.table_id)?.label} · {snapshot.services.find((s) => s.id === slot.service_id)?.name}</option>)}</select></label>
          <div className={styles.fields}>
            <label>Gastname<input required maxLength={120} value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} /></label>
            <label>Telefon oder E-Mail (optional)<input maxLength={320} value={contact} autoComplete="off" onChange={(e) => setContact(e.target.value)} /></label>
          </div>
          <div className={styles.fields}>
            <label>Quelle<select value={source} onChange={(e) => setSource(e.target.value as BookingSource)}><option value="phone">Telefon</option><option value="email">E-Mail</option><option value="walk_in">Vor Ort</option><option value="operator">Betreiber</option></select></label>
            <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as "pending" | "confirmed")}><option value="confirmed">Bestätigt</option><option value="pending">Anfrage offen</option></select></label>
          </div>
          <label>Interner Hinweis (optional)<textarea maxLength={1000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /><span className={styles.help}>Nur notwendige organisatorische Angaben erfassen.</span></label>
          <div className={styles.actions}><button className={styles.primary} disabled={!name.trim() || selected === ""}>{busy ? "Speichert …" : "Reservierung speichern"}</button></div>
        </>}
      </fieldset>
    </form>
  </section>;
}
