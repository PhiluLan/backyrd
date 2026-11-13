"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { bookingAllocationLabel, bookingError, bookingReadDenied, bookingWriteUncertain, readTransferChoices, restaurantTime, transferBooking, type BookingReservation, type BookingSnapshot, type BookingTransfer, type TransferPreview } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export function TransferReservation({ spotId, reservation, snapshot, onClose, onBusy, onDenied, onSaved, onReload }: {
  spotId: string; reservation: BookingReservation; snapshot: BookingSnapshot; onClose: (uncertain: boolean) => void;
  onBusy: (busy: boolean) => void; onDenied: () => void; onSaved: () => Promise<void>; onReload: () => Promise<void>;
}) {
  const [duration, setDuration] = useState("60"), [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [checking, setChecking] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [changed, setChanged] = useState(false), [reloadConfirm, setReloadConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null), [readError, setReadError] = useState<string | null>(null);
  const generation = useRef(0), inFlight = useRef(false), mounted = useRef(false), frozen = useRef<BookingTransfer | null>(null);
  const minutes = Number(duration), valid = duration.trim() !== "" && Number.isInteger(minutes) && minutes >= 15 && minutes <= 480;
  const stale = preview !== null && preview.revision !== (reservation.revision ?? 0);
  const choice = selected === "" ? undefined : preview?.choices[Number(selected)];
  const load = useCallback(async () => {
    if (!valid || uncertain) return;
    const request = ++generation.current; setChecking(true); setReadError(null); setPreview(null); setSelected("");
    try { const result = await readTransferChoices(spotId, reservation.id, minutes); if (mounted.current && request === generation.current) setPreview(result); }
    catch (failure) { if (!mounted.current || request !== generation.current) return; if (bookingReadDenied(failure)) onDenied(); else setReadError(bookingError(failure)); }
    finally { if (mounted.current && request === generation.current) setChecking(false); }
  }, [spotId, reservation.id, minutes, valid, uncertain, onDenied]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => { if (!valid || uncertain) { setChecking(false); return; } const timer = window.setTimeout(() => void load(), 250); return () => { window.clearTimeout(timer); generation.current += 1; }; }, [load, valid, uncertain]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (selected || uncertain || busy) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [selected, uncertain, busy]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || reloadConfirm || (!frozen.current && (!valid || !choice || checking || stale || changed))) return;
    const operation = frozen.current ?? { requestId: crypto.randomUUID(), reservationId: reservation.id, revision: reservation.revision ?? 0, duration: minutes, choice: choice! };
    inFlight.current = true; setBusy(true); onBusy(true); setError(null); frozen.current = operation;
    try { await transferBooking(spotId, operation); if (mounted.current) await onSaved(); }
    catch (failure) {
      if (!mounted.current) return;
      if (bookingReadDenied(failure)) { onDenied(); return; }
      setError(bookingError(failure));
      if (failure && typeof failure === "object" && "code" in failure && failure.code === "40001") setChanged(true);
      if (uncertain || bookingWriteUncertain(failure)) { setUncertain(true); generation.current += 1; }
      else { frozen.current = null; if (failure && typeof failure === "object" && "message" in failure && failure.message === "booking_slot_unavailable") void load(); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusy(true);
    try { await onReload(); if (mounted.current) onClose(false); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  return <ConsolePanel title="Gast umplatzieren" busy={busy} dirty={!!selected} uncertain={uncertain} uncertainHelp="Der Tischwechsel kann bereits gespeichert sein. Beim Verlassen wird die aktuelle Belegung neu geladen. Prüfe beide Tischgruppen, bevor du erneut umplatzierst." onClose={() => onClose(uncertain)}>
    <form className={styles.editorForm} onSubmit={(event) => void save(event)}><fieldset className={styles.fieldset} disabled={busy || uncertain || reloadConfirm}><div className={styles.drawerBody}>
      <p><strong>{reservation.guest_name}</strong> · {reservation.party_size} Personen</p><p className={styles.help}>Aktuell: {bookingAllocationLabel(reservation, snapshot)}. Die ursprüngliche Reservierungszeit und die Ankunft bleiben erhalten.</p>
      <label>Verbleibende Dauer (Minuten)<input data-initial-focus type="number" inputMode="numeric" min={15} max={480} required value={duration} onChange={(event) => { generation.current += 1; setDuration(event.target.value); setSelected(""); setPreview(null); }} /></label>
      <p className={styles.help}>Der neue Tisch wird ab dem tatsächlichen Speichern für diese Dauer eingeplant. Ein laufender Besuch bleibt bis zum Beenden physisch belegt.</p>
      {checking ? <p role="status">Freie Tische werden geprüft …</p> : readError ? <div><p role="alert">{readError}</p><button type="button" className={styles.secondary} onClick={() => void load()}>Erneut prüfen</button></div> : stale ? <p role="alert">Diese Reservierung wurde inzwischen geändert. Verlasse den Entwurf und lade die Reservierung neu.</p> : preview && <>
        <p className={styles.help}>Geprüft um {restaurantTime(preview.observed_at)} · voraussichtlich bis {restaurantTime(preview.ends_at, preview.observed_at)}.</p>
        {preview.choices.length ? <label>Neuer Tisch<select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Tisch wählen</option>{preview.choices.map((c, index) => <option key={`${c.combination_id ?? c.table_id}`} value={String(index)}>{c.allocation_label} · bis {c.seats} Personen · {snapshot.areas.find((a) => a.id === c.area_id)?.name ?? "Bereich"}</option>)}</select></label> : <p role="status">Für diese Gruppengrösse und verbleibende Dauer ist kein anderer Tisch verfügbar.</p>}
      </>}
      {choice && <p className={styles.note}>Wechsel zu {choice.allocation_label}. Nicht weiter benötigte Tische werden frei. Alle gewählten Tische werden gemeinsam belegt.</p>}
    </div></fieldset>
    {error && <p role="alert" className={styles.writeWarning}>{error}{uncertain ? " Das Speicherergebnis ist unklar. Wiederhole ausschliesslich denselben Tischwechsel oder prüfe nach dem Verlassen die Belegung." : ""}</p>}
    {(stale || changed) && !uncertain && <section className={styles.confirmation} aria-label="Aktuellen Stand laden"><button type="button" className={styles.secondary} disabled={busy} onClick={() => setReloadConfirm(true)}>Aktuelle Reservierung laden</button>{reloadConfirm && <><p>Die ungespeicherte Tischwahl und Dauer verwerfen und die aktuelle Reservierung laden?</p><button type="button" className={styles.primary} disabled={busy} onClick={() => void refresh()}>Entwurf verwerfen und neu laden</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setReloadConfirm(false)}>Weiter bearbeiten</button></>}</section>}
    <footer className={styles.editorFooter}><span>Keine Nachricht an den Gast</span><button type="submit" className={styles.primary} disabled={busy || reloadConfirm || (!uncertain && (!valid || !choice || checking || stale || changed))}>{busy ? "Speichert …" : uncertain ? "Unverändert erneut versuchen" : "Tischwechsel speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}
