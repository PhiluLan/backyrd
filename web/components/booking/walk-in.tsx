"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { bookingError, bookingWriteUncertain, createWalkIn, readWalkInSlots, restaurantDate, restaurantTime, type BookingSlot, type BookingSnapshot, type WalkInPreview } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export function WalkIn({ spotId, snapshot, serviceId, areaId, onClose, onSaved, onBusy }: {
  spotId: string; snapshot: BookingSnapshot; serviceId: string; areaId: string;
  onClose: (uncertain: boolean) => void; onSaved: (date: string, slot: BookingSlot) => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const initialParty = Math.min(2, snapshot.settings?.max_party_size ?? 8);
  const [party, setParty] = useState(String(initialParty));
  const [duration, setDuration] = useState(String(snapshot.settings?.duration_minutes ?? 120));
  const [service, setService] = useState(serviceId);
  const [area, setArea] = useState(areaId);
  const [preview, setPreview] = useState<WalkInPreview | null>(null);
  const [choice, setChoice] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const partySize = Number(party), minutes = Number(duration);
  const maxParty = snapshot.settings?.max_party_size ?? 8;
  const valid = party.trim() !== "" && duration.trim() !== "" && Number.isInteger(partySize) && partySize >= 1 && partySize <= maxParty
    && Number.isInteger(minutes) && minutes >= 30 && minutes <= 480;
  const available = preview?.slots.filter((slot) => (!service || slot.service_id === service) && (!area || slot.area_id === area)) ?? [];
  const chosen = available.find((slot) => slot.service_id + ":" + slot.table_id === choice);
  const areas = [...new Map(preview?.slots.map((slot) => [slot.area_id, slot.area_name]) ?? []).entries()];
  function clearPreview() { generation.current += 1; setPreview(null); setChoice(""); setSlotError(null); }
  const check = useCallback(async () => {
    if (!valid || uncertain) return;
    const current = ++generation.current;
    setChecking(true); setSlotError(null); setPreview(null); setChoice("");
    try {
      const result = await readWalkInSlots(spotId, partySize, minutes);
      if (current !== generation.current) return;
      setPreview(result);
      setService((value) => value && !result.services.some((service) => service.id === value) ? "" : value);
    } catch (error) { if (current === generation.current) setSlotError(bookingError(error)); }
    finally { if (current === generation.current) setChecking(false); }
  }, [spotId, partySize, minutes, valid, uncertain]);
  useEffect(() => {
    if (!valid || uncertain) { setChecking(false); return; }
    const timer = window.setTimeout(() => void check(), 250);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [check, valid, uncertain, refresh]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || uncertain) event.preventDefault(); };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty, uncertain]);
  useEffect(() => () => { generation.current += 1; }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !valid || !chosen) return;
    const payload = { serviceId: chosen.service_id, tableId: chosen.table_id, partySize, duration: minutes, name, contact, note };
    // Preview time is not identity or a client-controlled admission time.
    const key = JSON.stringify(payload);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    try {
      const result = await createWalkIn(spotId, { ...payload, requestId: request.current.id });
      await onSaved(restaurantDate(new Date(result.slot.starts_at)), result.slot);
    } catch (error) {
      const unknown = bookingWriteUncertain(error);
      setUncertain(unknown); setError(bookingError(error));
      if (!unknown && error && typeof error === "object" && "message" in error && error.message === "booking_slot_unavailable") { clearPreview(); setRefresh((value) => value + 1); }
    } finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }

  return <ConsolePanel title="Walk-in platzieren" dirty={dirty} busy={busy} uncertain={uncertain} onClose={() => onClose(uncertain)}>
    <form className={styles.editorForm} onSubmit={submit} onChange={() => setDirty(true)}><fieldset className={styles.fieldset} disabled={busy}>
      {error && <div className={styles.writeWarning} role="alert">{uncertain ? "Das Speicherergebnis ist unklar. Der Walk-in kann bereits erfasst sein. Wiederhole dieselbe Anfrage unverändert, bevor du einen neuen Vorgang beginnst." : error}</div>}
      <div className={styles.drawerBody}><fieldset className={styles.fieldset} disabled={uncertain}>
        <p className={styles.editorContext}>Für jetzt · Europe/Zurich{preview ? " · geprüft um " + restaurantTime(preview.observedAt) : ""}</p>
        <p className={styles.help}>Der Besuch wird direkt als «Am Tisch» erfasst. Die aktuelle Zeit wird beim Speichern vom Server festgelegt.</p>
        <div className={styles.fields}><div className={styles.partyPicker}><label>Personen<input type="number" inputMode="numeric" required min={1} max={maxParty} step={1} value={party} onChange={(event) => { setParty(event.target.value); clearPreview(); }} /></label><div className={styles.partyChoices} role="group" aria-label="Personenzahl schnell wählen">{[1, 2, 3, 4, 6, 8].filter((count) => count <= maxParty).map((count) => <button data-initial-focus={count === initialParty ? "" : undefined} key={count} type="button" aria-label={count + (count === 1 ? " Person" : " Personen")} aria-pressed={partySize === count} onClick={() => { setParty(String(count)); clearPreview(); setDirty(true); }}>{count}</button>)}</div></div></div>
        <div className={styles.fields}><label>Dauer in Minuten<input type="number" inputMode="numeric" required min={30} max={480} step={1} value={duration} onChange={(event) => { setDuration(event.target.value); clearPreview(); }} /></label></div>
        <div className={styles.durationChoices} role="group" aria-label="Dauer schnell wählen">{[30, 60, 90, 120].map((value) => <button key={value} type="button" className={styles.secondary} aria-pressed={minutes === value} onClick={() => { setDuration(String(value)); clearPreview(); setDirty(true); }}>{value} Minuten</button>)}</div>
        {preview && <div className={styles.fields}><label>Aktueller Service<select value={service} onChange={(event) => { setService(event.target.value); setChoice(""); }}><option value="">Alle aktuellen Services</option>{preview.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Bereich<select value={area} onChange={(event) => { setArea(event.target.value); setChoice(""); }}><option value="">Alle Bereiche</option>{area && !areas.some(([id]) => id === area) && <option value={area}>{snapshot.areas.find((item) => item.id === area)?.name ?? "Gewählter Bereich"}</option>}{areas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>}
        {checking && <p className={styles.help} role="status">Aktuelle Zuteilungen werden geprüft …</p>}
        {slotError && <p className={styles.error} role="alert">{slotError} <button type="button" className={styles.secondary} onClick={() => setRefresh((value) => value + 1)}>Erneut prüfen</button></p>}
        {preview && !available.length && <div className={styles.emptyCompact}><h3>{preview.services.length ? "Gerade kein passender Tisch frei." : "Für diese Dauer läuft gerade kein Service."}</h3><p>Prüfe Personenzahl, Dauer und laufende Besuche. Es wurde niemand platziert.</p>{(service || area) && preview.slots.length > 0 && <button type="button" className={styles.secondary} onClick={() => { setService(""); setArea(""); setChoice(""); }}>Alle aktuellen Zuteilungen anzeigen</button>}</div>}
        <div className={styles.walkInTables} role="group" aria-label="Verfügbare Tische">{available.map((slot) => { const key = slot.service_id + ":" + slot.table_id; return <button key={key} type="button" aria-label={"Tisch " + slot.table_label + " im Bereich " + slot.area_name + " für " + slot.service_name + " wählen"} aria-pressed={choice === key} onClick={() => { setChoice(key); setDirty(true); }}><strong>{slot.table_label}</strong><span>{slot.area_name} · {slot.seats} Plätze</span><small>{slot.service_name} · geplant bis {restaurantTime(slot.ends_at)}</small></button>; })}</div>
        <details className={styles.editorDetails}><summary>Gastangaben ergänzen</summary><label>Gastname (optional)<input maxLength={120} value={name} autoComplete="off" onChange={(event) => setName(event.target.value)} /><span className={styles.help}>Ohne Namen wird der Besuch als «Walk-in» geführt.</span></label><label>Telefon oder E-Mail (optional)<input maxLength={320} value={contact} autoComplete="off" onChange={(event) => setContact(event.target.value)} /></label><label>Interner Hinweis (optional)<textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /><span className={styles.help}>Nur notwendige organisatorische Angaben erfassen.</span></label></details>
        <p className={styles.help}>Vorschläge reservieren keinen Tisch. Beim Speichern wird die Zuteilung erneut geprüft. Es wird keine Nachricht versendet.</p>
      </fieldset></div><footer className={styles.editorFooter}><span>{chosen ? partySize + " Personen · " + chosen.table_label + " · " + minutes + " Minuten" : "Aktuellen Tisch wählen"}</span><button type="submit" className={styles.primary} disabled={busy || checking || !valid || !chosen}>{busy ? "Platziert …" : uncertain ? "Unverändert erneut versuchen" : "Walk-in platzieren"}</button></footer>
    </fieldset></form>
  </ConsolePanel>;
}
