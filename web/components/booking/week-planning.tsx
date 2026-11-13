"use client";

import { useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, bookingWeekStart, bookingWriteUncertain, readBookingWeek, restaurantDate, saveBookingClosure, shiftBookingDate, type BookingClosure, type BookingSnapshot, type BookingWeek, type ClosureChange } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

function dateLabel(date: string) { return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "short" }).format(new Date(date + "T12:00:00Z")); }
export function closureLabel(closure: BookingClosure, snapshot: BookingSnapshot) {
  return (closure.start_time ? closure.start_time + "–" + closure.end_time : "Ganztägig") + " · " + (snapshot.services.find((service) => service.id === closure.service_id)?.name ?? "Alle Services") + " · " + (snapshot.areas.find((area) => area.id === closure.area_id)?.name ?? "Alle Bereiche");
}
export function WeekOverview({ spotId, date, snapshot, serviceId, areaId, disabled, onDate, onEdit, onDenied }: {
  spotId: string; date: string; snapshot: BookingSnapshot; serviceId: string; areaId: string; disabled: boolean;
  onDate: (date: string) => void; onEdit: (date: string, closure?: BookingClosure) => void; onDenied: () => void;
}) {
  const start = bookingWeekStart(date), key = spotId + start + serviceId + areaId;
  const [state, setState] = useState<{ key: string; source: BookingSnapshot; week?: BookingWeek; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    async function load() {
      try { const week = await readBookingWeek(spotId, start, serviceId, areaId, controller.signal); if (active) setState({ key, source: snapshot, week }); }
      catch (error) { if (!active) return; if (bookingReadDenied(error)) onDenied(); else setState({ key, source: snapshot, error: bookingError(error) }); }
    }
    void load(); return () => { active = false; controller.abort(); };
  }, [spotId, start, serviceId, areaId, snapshot, key, retry, onDenied]);
  const current = state?.key === key && state.source === snapshot ? state : null;
  const week = current?.week;
  const configChanged = !!week && week.revision !== snapshot.settings?.revision;
  const canEdit = (day: string) => !disabled && !configChanged && day >= restaurantDate() && day <= shiftBookingDate(restaurantDate(), 365);
  return <section aria-label="Wochenübersicht">
    <div className={styles.workspaceHeading}><div><p className={styles.kicker}>PLANUNG</p><h2>{dateLabel(start)} – {dateLabel(shiftBookingDate(start, 6))}</h2></div></div>
    <p className={styles.help}>Gespeicherte Reservierungen · aktuelle Service- und Bereichsauswahl. Diese Zahlen sind keine Auslastungsquote.</p>
    {!current ? <p role="status">Woche wird geladen …</p> : current.error ? <div role="alert" className={styles.error}>{current.error}<button className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Woche erneut laden</button></div> : <>
      {configChanged && <p role="status">Die Einrichtung wurde inzwischen geändert. Aktualisiere die Übersicht, bevor du eine Sperre bearbeitest.</p>}
      <div className={styles.weekGrid}>{week?.days.map((day) => <article key={day.date} className={styles.weekDay} data-selected={day.date === date} aria-label={dateLabel(day.date)}>
        <button className={styles.weekDate} onClick={() => onDate(day.date)}><strong>{dateLabel(day.date)}</strong><span>Tagesbuch öffnen ↗</span></button>
        {day.closed && <p className={styles.status}>Für neue Buchungen gesperrt</p>}
        <p><strong>{day.active_guests}</strong> Gäste · {day.active_reservations} {day.active_reservations === 1 ? "aktive Reservierung" : "aktive Reservierungen"}</p>
        <p className={styles.help}>{day.pending} {day.pending === 1 ? "Anfrage" : "Anfragen"} · {day.completed} beendet · {day.cancelled} storniert/abgelehnt · {day.no_show} nicht erschienen</p>
        {day.closures.map((closure) => <button key={closure.id} className={styles.closureCard} disabled={!canEdit(day.date)} onClick={() => onEdit(day.date, closure)}><strong>{closureLabel(closure, snapshot)}</strong>{closure.note && <span>{closure.note}</span>}<span>{closure.affected_reservations} bestehende aktive Reservierungen bleiben erhalten</span></button>)}
        {(snapshot.access?.can_manage ?? true) && <button className={styles.secondary} disabled={!canEdit(day.date)} onClick={() => onEdit(day.date)}>+ Buchungssperre</button>}
      </article>)}</div>
      {week && <p className={styles.help}>Wochenstand: {new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(week.observed_at))} · Bestehende Reservierungen werden durch Sperren nicht storniert.</p>}
    </>}
  </section>;
}

export function ClosureEditor({ spotId, date: initialDate, closure, snapshot, onBusy, onClose, onSaved }: {
  spotId: string; date: string; closure?: BookingClosure; snapshot: BookingSnapshot; onBusy: (busy: boolean) => void;
  onClose: (uncertain: boolean, date: string) => void; onSaved: (date: string, removed: boolean) => Promise<void>;
}) {
  const [id] = useState(() => closure?.id ?? crypto.randomUUID());
  const [revision] = useState(snapshot.settings?.revision ?? 0);
  const [date, setDate] = useState(initialDate);
  const [fullDay, setFullDay] = useState(!closure?.start_time);
  const [start, setStart] = useState(closure?.start_time ?? "18:00");
  const [end, setEnd] = useState(closure?.end_time ?? "23:00");
  const [service, setService] = useState(closure?.service_id ?? "");
  const [area, setArea] = useState(closure?.area_id ?? "");
  const [note, setNote] = useState(closure?.note ?? "");
  const [keep, setKeep] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [affected, setAffected] = useState(closure?.affected_reservations ?? 0);
  const inFlight = useRef(false);
  const frozen = useRef<ClosureChange | null>(null);
  const valid = date >= restaurantDate() && date <= shiftBookingDate(restaurantDate(), 365) && (fullDay || (!!start && !!end && start < end));
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (edited || uncertain || busy) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [edited, uncertain, busy]);
  async function save() {
    if (inFlight.current || (!frozen.current && ((!removing && !valid) || (affected > 0 && !keep && !removing)))) return;
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    const change = frozen.current ?? { id, date, startTime: fullDay ? null : start, endTime: fullDay ? null : end, serviceId: service || null, areaId: area || null, note, keepExisting: keep, remove: removing };
    try { await saveBookingClosure(spotId, revision, change); await onSaved(change.date, change.remove); }
    catch (error) {
      setError(bookingError(error));
      if (uncertain || bookingWriteUncertain(error)) { frozen.current = change; setUncertain(true); }
      else if (error && typeof error === "object" && "message" in error && error.message === "booking_closure_has_reservations") {
        const details = "details" in error && typeof error.details === "string" ? Number(error.details) : NaN;
        setAffected(Number.isSafeInteger(details) && details > 0 ? details : 1); setKeep(false);
      }
    } finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  return <ConsolePanel title="Buchungssperre" busy={busy} dirty={edited || removing} uncertain={uncertain} onClose={() => onClose(uncertain, frozen.current?.date ?? date)}>
    <form className={styles.editorForm} onChange={() => setEdited(true)} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset className={styles.fieldset} disabled={busy || uncertain || removing}><div className={styles.drawerBody}>
        <p className={styles.help}>Sperren stoppen neue Zuteilungen. Bestehende Reservierungen bleiben erhalten; es wird keine Nachricht an Gäste versendet.</p>
        <label>Datum der Sperre<input data-initial-focus type="date" required min={restaurantDate()} max={shiftBookingDate(restaurantDate(), 365)} value={date} onChange={(event) => { setDate(event.target.value); setAffected(0); setKeep(false); }} /></label>
        <label className={styles.checkbox}><input type="checkbox" checked={fullDay} onChange={(event) => { setFullDay(event.target.checked); setAffected(0); setKeep(false); }} />Ganzer Tag</label>
        {!fullDay && <div className={styles.fields}><label>Beginn der Sperre<input type="time" required value={start} onChange={(event) => { setStart(event.target.value); setAffected(0); setKeep(false); }} /></label>{end !== "24:00" ? <label>Ende der Sperre<input type="time" required value={end} onChange={(event) => { setEnd(event.target.value); setAffected(0); setKeep(false); }} /></label> : <p className={styles.help}>Bis 00:00 des Folgetags</p>}<label className={styles.checkbox}><input type="checkbox" checked={end === "24:00"} onChange={(event) => { setEnd(event.target.checked ? "24:00" : "23:00"); setAffected(0); setKeep(false); }} />Bis Tagesende</label></div>}
        <div className={styles.fields}><label>Service der Sperre<select value={service} onChange={(event) => { setService(event.target.value); setAffected(0); setKeep(false); }}><option value="">Alle Services</option>{snapshot.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Bereich der Sperre<select value={area} onChange={(event) => { setArea(event.target.value); setAffected(0); setKeep(false); }}><option value="">Alle Bereiche</option>{snapshot.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label></div>
        <label>Organisatorischer Grund (optional)<input maxLength={160} value={note} onChange={(event) => setNote(event.target.value)} /><span className={styles.help}>Keine Gästedaten erfassen.</span></label>
        <p className={styles.help}>Europe/Zurich. Nicht existierende Ortszeiten werden abgewiesen. Bei mehrdeutigen Grenzen umfasst die Sperre den Zeitraum vom frühesten Beginn bis zum spätesten Ende.</p>
        {affected > 0 && <p className={styles.help}>{affected} bestehende aktive Reservierungen sind betroffen.</p>}
        <label className={styles.checkbox}><input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />Bestehende Reservierungen ausdrücklich beibehalten</label>
      </div></fieldset>
      {error && <p role="alert" className={styles.writeWarning}>{error}{uncertain ? " Der Speicherstatus ist unklar. Wiederholen sendet dieselbe Änderung; prüfe nach dem Verlassen die Sperren dieses Tages." : ""}</p>}
      {closure && !uncertain && <div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => setRemoving((value) => !value)}>{removing ? "Weiter bearbeiten" : "Sperre aufheben"}</button></div>}
      {removing && <p role="status" className={styles.writeWarning}>Sperre aufheben? Neue Buchungen können danach wieder zugeteilt werden. Gespeicherte Reservierungen bleiben unverändert. Bestätige mit «Aufheben bestätigen».</p>}
      <footer className={styles.editorFooter}><span>Keine automatische Stornierung</span><button type="submit" className={styles.primary} disabled={busy || (!uncertain && !removing && (!valid || (affected > 0 && !keep)))}>{busy ? "Wird gespeichert …" : uncertain ? "Unverändert erneut versuchen" : removing ? "Aufheben bestätigen" : "Buchungssperre speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}
