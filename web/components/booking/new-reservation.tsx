"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { bookingAllocationLabel, bookingTableIds, bookingError, bookingWriteUncertain, bookingReadDenied, createBooking, readBookingSlots, restaurantDate, restaurantTime, restaurantSlotTime, type BookingSlot, type BookingSnapshot, type ConsoleBookingSource } from "@/lib/booking-api";
import { ReservationGuestPicker } from "./reservation-guest-picker";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export type CreatedBooking = { date: string; slot: BookingSlot };

export function NewReservation({ spotId, date, snapshot, serviceId = "", areaId = "", tableId = "", time = "", initialGuest, actorId, online, isCurrent, onDenied, onCreated, onBusy, onClose }: {
  spotId: string; date: string; snapshot: BookingSnapshot; serviceId?: string; areaId?: string; tableId?: string; time?: string; initialGuest?: { name: string; contact: string; card?: { id: string; revision: number } };
  actorId: string;
  online: boolean; isCurrent: () => boolean; onDenied: () => void;
  onCreated: (booking: CreatedBooking) => Promise<void>; onBusy: (value: boolean) => void; onClose: (uncertain?: boolean, date?: string) => void;
}) {
  const [bookingDate, setDate] = useState(date);
  const [preferredTime, setPreferredTime] = useState("");
  const [party, setParty] = useState(() => String(Math.min(2, snapshot.settings?.max_party_size ?? 8)));
  const [service, setService] = useState(serviceId);
  const [area, setArea] = useState(areaId);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedTime, setTime] = useState("");
  const [selected, setSelected] = useState("");
  const [name, setName] = useState(initialGuest?.name ?? "");
  const [contact, setContact] = useState(initialGuest?.contact ?? "");
  const [candidate, setCandidate] = useState(initialGuest?.card ? { ...initialGuest.card, name: initialGuest.name } : null);
  const [associate, setAssociate] = useState(false);
  const guestContext = snapshot.capabilities?.guest_history ? { actorId, card: associate && candidate ? { id: candidate.id, revision: candidate.revision } : null } : undefined;
  const [copiedGuest, setCopiedGuest] = useState(!!initialGuest);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<ConsoleBookingSource>(initialGuest ? "operator" : "phone");
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const frozen = useRef<{ booking: Parameters<typeof createBooking>[1]; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [edited, setEdited] = useState(!!initialGuest);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const combinations = !!snapshot.capabilities?.table_combinations;
  const queryService = combinations ? service : "", queryArea = combinations ? area : "";
  const partySize = Number(party);
  const maxPartySize = snapshot.settings?.max_party_size ?? 8;
  const validParty = party.trim() !== "" && Number.isInteger(partySize) && partySize >= 1 && partySize <= maxPartySize;
  const today = restaurantDate();
  const lastDate = new Date(today + "T12:00:00Z");
  lastDate.setUTCDate(lastDate.getUTCDate() + 365);
  const latest = lastDate.toISOString().slice(0, 10);
  const validDate = bookingDate >= today && bookingDate <= latest;
  const available = slots.filter((slot) => (!service || slot.service_id === service)
    && (!tableId || bookingTableIds(slot).includes(tableId))
    && (!area || snapshot.tables.some((table) => table.id === slot.table_id && table.area_id === area)));
  const times = [...new Set(available.map((slot) => slot.starts_at))].sort((a, b) => Date.parse(a) - Date.parse(b));
  const tableSlots = available.filter((slot) => slot.starts_at === selectedTime);
  const slot = selected === "" ? undefined : slots[Number(selected)];

  function clearAvailability() {
    generation.current += 1; setSlots([]); setTime(""); setSelected(""); setChecked(false); setSlotError(null);
  }
  const checkSlots = useCallback(async () => {
    if (!validParty || !validDate || uncertain) return;
    const current = ++generation.current;
    setChecking(true); setSlotError(null); setSlots([]); setSelected(""); setChecked(false);
    try {
      const rows = await readBookingSlots(spotId, bookingDate, partySize, { combinations, serviceId: queryService, areaId: queryArea, time: preferredTime });
      if (current !== generation.current) return;
      setSlots(rows); setChecked(true);
      setTime(rows.find((slot) => restaurantTime(slot.starts_at, slot.ends_at) === time)?.starts_at ?? "");
    } catch (error) { if (current === generation.current) setSlotError(bookingError(error)); }
    finally { if (current === generation.current) setChecking(false); }
  }, [spotId, bookingDate, partySize, validParty, validDate, time, uncertain, combinations, queryService, queryArea, preferredTime]);

  useEffect(() => {
    if (!validParty || !validDate || uncertain) { setChecking(false); return; }
    const timer = window.setTimeout(() => void checkSlots(), 250);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [checkSlots, validParty, validDate, uncertain]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (edited) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [edited]);
  useEffect(() => () => { generation.current += 1; }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!online || !isCurrent() || inFlight.current || (!frozen.current && (!validParty || !validDate || !slot || !available.includes(slot) || !name.trim()))) return;
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    const key = JSON.stringify({ slot, partySize, name, contact, note, source, status, guestContext });
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    try {
      const operation = frozen.current ?? { booking: { requestId: request.current.id, slot: slot!, partySize, name, contact, note, source, status, guestContext }, date: bookingDate };
      frozen.current = operation;
      await createBooking(spotId, operation.booking);
      await onCreated({ date: operation.date, slot: operation.booking.slot });
    } catch (error) {
      if (!isCurrent()) return;
      if (bookingReadDenied(error)) { onDenied(); return; }
      setError(bookingError(error));
      if (uncertain || bookingWriteUncertain(error)) { setUncertain(true); generation.current += 1; }
      else frozen.current = null;
      // Preserve guest text and the request identity for a retry after an
      // uncertain response. A conflict still requires fresh availability.
      if (!uncertain && !bookingWriteUncertain(error) && error && typeof error === "object" && "message" in error && error.message === "booking_slot_unavailable") void checkSlots();
    } finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }

  return <ConsolePanel title="Neue Reservierung" dirty={edited} busy={busy} uncertain={uncertain} onClose={() => onClose(uncertain, frozen.current?.date)}>
    <form className={styles.editorForm} onSubmit={submit} onChange={() => setEdited(true)}>
      <fieldset disabled={busy || uncertain} className={styles.fieldset}>
        <div className={styles.drawerBody}>{copiedGuest && <p className={styles.help}>Kontaktdaten aus einer Gästekarte übernommen. Prüfe die Angaben für diese Reservierung. Änderungen hier betreffen diese Buchung.</p>}
          <p className={styles.editorContext}>{snapshot.services.find((s) => s.id === service)?.name ?? "Alle Services"} · {snapshot.areas.find((a) => a.id === area)?.name ?? "Alle Bereiche"}{tableId ? " · " + snapshot.tables.find((t) => t.id === tableId)?.label : ""}</p>
          {snapshot.capabilities?.guest_cards && <ReservationGuestPicker spotId={spotId} online={online} disabled={busy || uncertain} isCurrent={isCurrent} onDenied={onDenied} onCopy={copy => { setName(copy.name); setContact(copy.contact); setCandidate({ ...copy.card, name: copy.name }); setAssociate(false); setCopiedGuest(true); setEdited(true); }} />}
          <div className={styles.fields}>
            <label>Gastname<input data-initial-focus required maxLength={120} placeholder="Für wen reservieren wir?" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} /></label>
          </div>
          <label>Telefon oder E-Mail (optional)<input maxLength={320} value={contact} autoComplete="off" onChange={(e) => setContact(e.target.value)} /></label>
          {snapshot.capabilities?.guest_history && candidate && <section className={styles.cardCopy} aria-label="Gästekarte zuordnen"><p className={styles.help}>Gewählte Gästekarte: {candidate.name}</p><label className={styles.checkbox}><input type="checkbox" checked={associate} onChange={event => setAssociate(event.target.checked)} />Reservierung dieser Gästekarte zuordnen</label><p className={styles.help}>{associate ? "Die Buchung erscheint nach dem Speichern in den zugeordneten Reservierungen dieser Karte. Prüfe die Personenzuordnung; Name und Kontakt dieser Buchung bleiben eigene Angaben." : "Nur Kontaktdaten übernehmen. Ohne Zuordnung erscheint diese Buchung nicht im Verlauf der Karte."}</p></section>}
          <div className={styles.fields}>
            <div className={styles.partyPicker}><label>Personen<input type="number" inputMode="numeric" min={1} max={maxPartySize} step={1} required value={party} onChange={(e) => { setParty(e.target.value); clearAvailability(); }} /></label>
              <div className={styles.partyChoices} role="group" aria-label="Personenzahl schnell wählen">
                {[1, 2, 3, 4, 6, 8].filter((count) => count <= maxPartySize).map((count) => <button key={count} type="button" aria-label={count + (count === 1 ? " Person" : " Personen")} aria-pressed={validParty && partySize === count} onClick={() => { setParty(String(count)); clearAvailability(); setEdited(true); }}>{count}</button>)}
              </div>
            </div>
          </div>
          <div className={styles.fields}>
            <label>Buchungsdatum<input type="date" min={today} max={latest} required value={bookingDate} onChange={(e) => { setDate(e.target.value); clearAvailability(); }} /></label>
            <label>Service<select value={service} onChange={(e) => { setService(e.target.value); setTime(""); setSelected(""); }}>{<option value="">Alle Services</option>}{snapshot.services.map((s) => <option key={s.id} value={s.id}>{s.name}{!s.is_active ? " (inaktiv)" : ""}</option>)}</select></label>
          </div>
          {combinations && <label>Uhrzeit eingrenzen (optional)<input type="time" value={preferredTime} onChange={(event) => { setPreferredTime(event.target.value); clearAvailability(); }} /></label>}
          {checking && <p className={styles.help} role="status">Freie Zeiten werden geprüft …</p>}
          {slotError && <p className={styles.error} role="alert">{slotError} <button type="button" className={styles.secondary} onClick={() => void checkSlots()}>Erneut prüfen</button></p>}
          {!validParty && <p className={styles.help}>Wähle zwischen 1 und {maxPartySize} Personen.</p>}
          {checked && !available.length && <div className={styles.emptyCompact}><h3>Keine passende Zeit frei.</h3><p>Prüfe Personenzahl, Datum oder Service. Es wurde nichts reserviert.</p></div>}
          {available.length > 0 && <div className={styles.fields}>
            <label>Uhrzeit<select required value={selectedTime} onChange={(e) => { setTime(e.target.value); setSelected(""); }}><option value="">Zeit auswählen</option>{times.map((start) => <option key={start} value={start}>{restaurantSlotTime(start, times)}</option>)}</select></label>
            <label>Tisch<select required disabled={!selectedTime} value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Tisch auswählen</option>{tableSlots.map((slot) => <option key={slot.service_id + (slot.combination_id ?? slot.table_id) + slot.starts_at} value={slots.indexOf(slot)}>{bookingAllocationLabel(slot, snapshot)} · {restaurantTime(slot.starts_at, slot.ends_at)}–{restaurantTime(slot.ends_at, slot.starts_at)}{!service ? " · " + snapshot.services.find((s) => s.id === slot.service_id)?.name : ""}</option>)}</select></label>
          </div>}
          {slot && <p className={styles.slotSummary}>{partySize} Personen · {restaurantTime(slot.starts_at, slot.ends_at)}–{restaurantTime(slot.ends_at, slot.starts_at)} · {bookingAllocationLabel(slot, snapshot)}</p>}
          <details className={styles.editorDetails}><summary>Weitere Angaben</summary>
            {!tableId && <label>Bereich<select value={area} onChange={(e) => { setArea(e.target.value); setTime(""); setSelected(""); }}><option value="">Alle Bereiche</option>{snapshot.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
            <div className={styles.fields}><label>Quelle<select value={source} onChange={(e) => setSource(e.target.value as ConsoleBookingSource)}><option value="phone">Telefon</option><option value="email">E-Mail</option><option value="walk_in">Vor Ort</option><option value="operator">Betreiber</option></select></label><label>Status<select value={status} onChange={(e) => setStatus(e.target.value as "pending" | "confirmed")}><option value="confirmed">Bestätigt</option><option value="pending">Anfrage offen</option></select></label></div>
            <label>Interner Hinweis (optional)<textarea maxLength={1000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /><span className={styles.help}>Nur notwendige organisatorische Angaben erfassen.</span></label>
          </details>
          {error && <p role="alert" className={styles.error}>{error}{uncertain ? " Der Speicherstatus ist unklar. Die Eingaben bleiben gesperrt; erneutes Speichern sendet ausschliesslich dieselbe Anfrage. Prüfe nach dem Verlassen den gespeicherten Stand." : ""}</p>}
          <p className={styles.help}>Die Bestätigung wird im System gespeichert. Es wird keine Nachricht an den Gast versendet.</p>
        </div>
      </fieldset>
        <footer className={styles.editorFooter}><span>Europe/Zurich · {status === "confirmed" ? "Bestätigt" : "Anfrage offen"}</span><button className={styles.primary} disabled={busy || !online || (!uncertain && (checking || !validParty || !validDate || !slot || !name.trim()))}>{busy ? "Speichert …" : "Reservierung speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}
