"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { amendBooking, bookingError, bookingWriteUncertain, readAmendmentSlots, restaurantDate, restaurantTime, restaurantSlotTime, type BookingReservation, type BookingSlot, type BookingSnapshot } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export function EditReservation({ spotId, reservation: r, snapshot, onClose, onSaved, onReload, onBusy }: {
  spotId: string; reservation: BookingReservation; snapshot: BookingSnapshot;
  onClose: (uncertain?: boolean, date?: string) => void; onSaved: (date: string, slot: BookingSlot) => Promise<void>;
  onReload: () => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState(r.guest_name);
  const [contact, setContact] = useState(r.guest_contact ?? "");
  const [note, setNote] = useState(r.note ?? "");
  const [allocate, setAllocate] = useState(false);
  const [date, setDate] = useState(restaurantDate(new Date(r.starts_at)));
  const originalDuration = Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000);
  const [party, setParty] = useState(String(r.party_size));
  const [duration, setDuration] = useState(String(originalDuration));
  const [service, setService] = useState(r.service_id);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedTime, setTime] = useState("");
  const [selected, setSelected] = useState("");
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const frozen = useRef<Parameters<typeof amendBooking>[1] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const partySize = Number(party), minutes = Number(duration);
  const maxParty = snapshot.settings?.max_party_size ?? 8;
  const validNumbers = party.trim() !== "" && duration.trim() !== "" && Number.isInteger(partySize) && partySize >= 1 && partySize <= maxParty
    && Number.isInteger(minutes) && minutes >= 30 && minutes <= 480;
  const today = restaurantDate();
  const maxDate = new Date(today + "T12:00:00Z"); maxDate.setUTCDate(maxDate.getUTCDate() + 365);
  const latest = maxDate.toISOString().slice(0, 10);
  const validDate = date >= today && date <= latest;
  const available = slots.filter((slot) => !service || slot.service_id === service);
  const times = [...new Set(available.map((slot) => slot.starts_at))].sort((a, b) => Date.parse(a) - Date.parse(b));
  const chosen = selected === "" ? undefined : slots[Number(selected)];
  const allocationAllowed = r.status === "pending" || r.status === "confirmed";

  function clearSlots() {
    generation.current += 1; setSlots([]); setTime(""); setSelected(""); setChecked(false); setSlotError(null);
  }
  const checkSlots = useCallback(async () => {
    if (!allocate || !validNumbers || !validDate || uncertain) return;
    const current = ++generation.current;
    setChecking(true); setSlotError(null); setChecked(false); setSlots([]); setSelected(""); setTime("");
    try {
      const rows = await readAmendmentSlots(spotId, r.id, date, partySize, minutes);
      if (current !== generation.current) return;
      setSlots(rows); setChecked(true);
    } catch (error) { if (current === generation.current) setSlotError(bookingError(error)); }
    finally { if (current === generation.current) setChecking(false); }
  }, [allocate, validNumbers, validDate, spotId, r.id, date, partySize, minutes, uncertain]);
  useEffect(() => {
    if (!allocate || !validNumbers || !validDate || uncertain) { setChecking(false); return; }
    const timer = window.setTimeout(() => void checkSlots(), 250);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [allocate, validNumbers, validDate, checkSlots, uncertain]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); generation.current += 1; };
  }, [dirty]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || (!frozen.current && (!name.trim() || !dirty || (allocate && (!validNumbers || !validDate || !chosen || !available.includes(chosen)))))) return;
    const slot = allocate ? chosen! : { service_id: r.service_id, table_id: r.table_id, starts_at: r.starts_at, ends_at: r.ends_at };
    const nextParty = allocate ? partySize : r.party_size, nextDuration = allocate ? minutes : originalDuration;
    const payload = { slot, partySize: nextParty, duration: nextDuration, name, contact, note };
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    try {
      const operation = frozen.current ?? { ...payload, requestId: request.current.id, revision: r.revision ?? 0, reservationId: r.id };
      frozen.current = operation;
      await amendBooking(spotId, operation);
      await onSaved(restaurantDate(new Date(operation.slot.starts_at)), operation.slot);
    } catch (error) {
      setError(bookingError(error));
      if (uncertain || bookingWriteUncertain(error)) { setUncertain(true); generation.current += 1; }
      else frozen.current = null;
      if (!uncertain && !bookingWriteUncertain(error) && error && typeof error === "object" && "message" in error && error.message === "booking_slot_unavailable") void checkSlots();
    } finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusy(true);
    try { await onReload(); onClose(); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }

  return <ConsolePanel title="Reservierung bearbeiten" dirty={dirty} busy={busy} uncertain={uncertain} onClose={() => onClose(uncertain, frozen.current ? restaurantDate(new Date(frozen.current.slot.starts_at)) : undefined)}>
    <form className={styles.editorForm} onSubmit={submit} onChange={() => setDirty(true)}>
      <fieldset disabled={busy || uncertain} className={styles.fieldset}><div className={styles.drawerBody}>
        <p className={styles.editorContext}>Bisher: {new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(r.starts_at))} · {restaurantTime(r.starts_at)}–{restaurantTime(r.ends_at)} · {r.party_size} Personen · {snapshot.tables.find((table) => table.id === r.table_id)?.label ?? "Tisch"}</p>
        <div className={styles.fields}><label>Gastname<input data-initial-focus required maxLength={120} value={name} autoComplete="off" onChange={(event) => setName(event.target.value)} /></label></div>
        <div className={styles.fields}><label>Telefon oder E-Mail (optional)<input maxLength={320} value={contact} autoComplete="off" onChange={(event) => setContact(event.target.value)} /></label></div>
        <label>Interner Hinweis (optional)<textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /><span className={styles.help}>Nur notwendige organisatorische Angaben erfassen.</span></label>
        {allocationAllowed ? <label className={styles.checkbox}><input type="checkbox" checked={allocate} onChange={(event) => { setAllocate(event.target.checked); clearSlots(); }} />Zeit, Personen oder Tisch ändern</label> : <p className={styles.help}>Nach der Ankunft kannst du Gastangaben korrigieren. Die Tischzuteilung bleibt erhalten.</p>}
        {allocate && <section aria-label="Umbuchung"><p className={styles.help}>Die ursprüngliche Reservierung bleibt bestehen, bis die neue Zuteilung erfolgreich gespeichert ist.</p>
          <div className={styles.fields}><label>Personen<input type="number" inputMode="numeric" min={1} max={maxParty} step={1} required value={party} onChange={(event) => { setParty(event.target.value); clearSlots(); }} /></label><label>Dauer in Minuten<input type="number" inputMode="numeric" min={30} max={480} step={1} required value={duration} onChange={(event) => { setDuration(event.target.value); clearSlots(); }} /></label></div>
          <div className={styles.fields}><label>Buchungsdatum<input type="date" min={today} max={latest} required value={date} onChange={(event) => { setDate(event.target.value); clearSlots(); }} /></label><label>Service<select value={service} onChange={(event) => { setService(event.target.value); setSelected(""); setTime(""); }}><option value="">Alle Services</option>{snapshot.services.map((service) => <option key={service.id} value={service.id}>{service.name}{!service.is_active ? " (inaktiv)" : ""}</option>)}</select></label></div>
          {checking && <p role="status" className={styles.help}>Alternativen werden geprüft …</p>}
          {slotError && <p role="alert" className={styles.error}>{slotError} <button type="button" className={styles.secondary} onClick={() => void checkSlots()}>Erneut prüfen</button></p>}
          {checked && !available.length && <div className={styles.emptyCompact}><h3>Keine passende Alternative frei.</h3><p>Prüfe Datum, Personenzahl, Dauer oder Service. Die ursprüngliche Reservierung bleibt erhalten.</p></div>}
          {available.length > 0 && <div className={styles.fields}><label>Uhrzeit<select required value={selectedTime} onChange={(event) => { setTime(event.target.value); setSelected(""); }}><option value="">Zeit auswählen</option>{times.map((time) => <option key={time} value={time}>{restaurantSlotTime(time, times)}</option>)}</select></label><label>Tisch<select required disabled={!selectedTime} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Tisch auswählen</option>{available.filter((slot) => slot.starts_at === selectedTime).map((slot) => <option key={slot.service_id + slot.table_id + slot.starts_at} value={slots.indexOf(slot)}>{snapshot.tables.find((table) => table.id === slot.table_id)?.label} · {restaurantTime(slot.starts_at, slot.ends_at)}–{restaurantTime(slot.ends_at, slot.starts_at)} · {snapshot.services.find((service) => service.id === slot.service_id)?.name}</option>)}</select></label></div>}
          {chosen && <p className={styles.slotSummary}>Neu: {partySize} Personen · {restaurantTime(chosen.starts_at)}–{restaurantTime(chosen.ends_at)} · {snapshot.tables.find((table) => table.id === chosen.table_id)?.label}</p>}
        </section>}
        {error && <div className={styles.error}><p role="alert">{error}{uncertain ? " Der Speicherstatus ist unklar. Die Eingaben bleiben gesperrt; erneutes Speichern sendet ausschliesslich dieselbe Änderung. Prüfe nach dem Verlassen beide Buchungstage." : ""}</p><button type="button" className={styles.secondary} onClick={() => setReloadConfirm(true)}>Aktuellen Stand laden</button></div>}
        {reloadConfirm && <section className={styles.confirmation}><h3>Ungespeicherte Änderungen ersetzen?</h3><p>Deine Eingaben werden verworfen und die gespeicherte Reservierung wird neu geladen.</p><div className={styles.actions}><button type="button" className={styles.primary} onClick={() => void refresh()}>Verwerfen und neu laden</button><button type="button" className={styles.secondary} onClick={() => setReloadConfirm(false)}>Weiter bearbeiten</button></div></section>}
        <p className={styles.help}>Änderungen werden protokolliert. Es wird keine Nachricht an den Gast versendet.</p>
      </div></fieldset><footer className={styles.editorFooter}><span>{allocate ? chosen ? restaurantDate(new Date(chosen.starts_at)) + " · " + restaurantTime(chosen.starts_at) + " · " + partySize + " Personen · " + (snapshot.tables.find((table) => table.id === chosen.table_id)?.label ?? "Tisch") : "Neue Zuteilung wählen" : "Gastangaben · Europe/Zurich"}</span><button className={styles.primary} disabled={busy || (!uncertain && (!dirty || !name.trim() || (allocate && (checking || !validNumbers || !validDate || !chosen))))}>{busy ? "Speichert …" : "Änderungen speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}
