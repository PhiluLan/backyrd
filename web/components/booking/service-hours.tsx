"use client";

import { useEffect, useRef, useState } from "react";
import { bookingError, bookingReadDenied, bookingWriteUncertain, restaurantDate, saveBookingHours, shiftBookingDate, type BookingHoursChange, type BookingSnapshot, type BookingSpecialHours } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export function hoursLabel(h: BookingSpecialHours, snapshot: BookingSnapshot) {
  return `${new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "short" }).format(new Date(h.book_date + "T12:00:00Z"))} · ${snapshot.services.find((s) => s.id === h.service_id)?.name ?? "Service"} · ${h.is_closed ? "Service entfällt" : `${h.opens_at}–${h.closes_at}${h.next_day ? " am Folgetag" : ""}`}`;
}
export function ServiceHoursEditor({ spotId, date: initialDate, hours, serviceId, snapshot, onBusy, onDenied, onClose, onSaved }: {
  spotId: string; date: string; hours?: BookingSpecialHours; serviceId: string; snapshot: BookingSnapshot;
  onBusy: (busy: boolean) => void; onDenied: () => void; onClose: (uncertain: boolean, date: string) => void; onSaved: (date: string, archived: boolean) => Promise<void>;
}) {
  const [id] = useState(() => hours?.id ?? crypto.randomUUID());
  const [revision] = useState(snapshot.settings?.revision ?? 0);
  const [date, setDate] = useState(initialDate);
  const [service, setService] = useState(hours?.service_id ?? (snapshot.services.find((s) => s.id === serviceId && s.is_active)?.id ?? snapshot.services.find((s) => s.is_active)?.id ?? ""));
  const [open, setOpen] = useState(hours?.opens_at ?? "18:00");
  const [close, setClose] = useState(hours?.closes_at ?? "23:00");
  const [next, setNext] = useState(hours?.next_day ?? false);
  const [closed, setClosed] = useState(hours?.is_closed ?? false);
  const [interval, setInterval] = useState(String(hours?.interval_minutes ?? 30));
  const [note, setNote] = useState(hours?.note ?? "");
  const [keep, setKeep] = useState(false);
  const [affected, setAffected] = useState(0);
  const [archive, setArchive] = useState(false);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), mounted = useRef(true);
  const frozen = useRef<BookingHoursChange | null>(null);
  const valid = !!service && date >= shiftBookingDate(restaurantDate(), -1) && date <= shiftBookingDate(restaurantDate(), 365) && !!interval.trim() && Number.isInteger(Number(interval)) && Number(interval) >= 15 && Number(interval) <= 120 && (closed || (!!open && !!close && (next ? close <= open && close !== "24:00" : close > open)));
  useEffect(() => { mounted.current = true; const warn = (e: BeforeUnloadEvent) => { if (edited || archive || busy || uncertain) e.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => { mounted.current = false; window.removeEventListener("beforeunload", warn); }; }, [edited, archive, busy, uncertain]);
  function change() { setAffected(0); setKeep(false); setEdited(true); }
  async function save() {
    if (inFlight.current || (!frozen.current && ((!archive && !valid) || (affected > 0 && !keep)))) return;
    const payload = frozen.current ?? { id, serviceId: service, date, opensAt: closed || archive ? null : open, closesAt: closed || archive ? null : close, nextDay: closed || archive ? false : next, closed: closed || archive, interval: archive ? hours?.interval_minutes ?? 30 : Number(interval), note: archive ? hours?.note ?? "" : note, keepExisting: keep, archive };
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    try { await saveBookingHours(spotId, revision, payload); if (mounted.current) await onSaved(payload.date, payload.archive); }
    catch (failure) {
      if (!mounted.current) return;
      if (bookingReadDenied(failure)) { onDenied(); return; }
      setError(bookingError(failure));
      if (uncertain || bookingWriteUncertain(failure)) { frozen.current = payload; setUncertain(true); }
      else if (failure && typeof failure === "object" && "message" in failure && failure.message === "booking_hours_has_reservations") { const n = "details" in failure && typeof failure.details === "string" ? Number(failure.details) : NaN; setAffected(Number.isSafeInteger(n) && n > 0 ? n : 1); setKeep(false); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  return <ConsolePanel title="Sonderzeiten" busy={busy} dirty={edited || archive} uncertain={uncertain} uncertainHelp="Die Sonderzeiten können bereits gespeichert sein. Prüfe nach dem Verlassen den Servicebeginn-Tag und bei Nachtservices auch den Folgetag." onClose={() => onClose(uncertain, frozen.current?.date ?? date)}>
    <form className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset className={styles.fieldset} disabled={busy || uncertain || archive}><div className={styles.drawerBody}>
        <p className={styles.help}>Sonderzeiten ersetzen die Wochenzeiten eines Services für dieses Startdatum. Buchungssperren haben Vorrang. Bestehende Reservierungen bleiben erhalten.</p>
        <label>Tag des Servicebeginns<input data-initial-focus type="date" required disabled={!!hours} min={shiftBookingDate(restaurantDate(), -1)} max={shiftBookingDate(restaurantDate(), 365)} value={date} onChange={(e) => { setDate(e.target.value); change(); }} /></label>
        <label>Service der Sonderzeiten<select required disabled={!!hours} value={service} onChange={(e) => { setService(e.target.value); change(); }}>{snapshot.services.filter((s) => s.is_active || s.id === hours?.service_id).map((s) => <option key={s.id} value={s.id}>{s.name}{!s.is_active ? " (inaktiv)" : ""}</option>)}</select></label>
        <label className={styles.checkbox}><input type="checkbox" checked={closed} onChange={(e) => { setClosed(e.target.checked); change(); }} />Service mit diesem Beginn entfällt</label>
        {!closed && <><div className={styles.fields}><label>Servicebeginn<input type="time" required value={open} onChange={(e) => { setOpen(e.target.value); change(); }} /></label>{close !== "24:00" ? <label>Serviceende<input type="time" required value={close} onChange={(e) => { setClose(e.target.value); change(); }} /></label> : <p className={styles.help}>Ende um 00:00 des Folgetags</p>}</div>
          <label className={styles.checkbox}><input type="checkbox" checked={next} onChange={(e) => { setNext(e.target.checked); if (e.target.checked && close > open) setClose("00:00"); else if (!e.target.checked && close <= open) setClose("23:59"); change(); }} />Ende am Folgetag</label>
          <label className={styles.checkbox}><input type="checkbox" checked={close === "24:00"} onChange={(e) => { setClose(e.target.checked ? "24:00" : "23:00"); setNext(false); change(); }} />Bis Tagesende</label>
        </>}
        <label>Buchungsintervall in Minuten<input type="number" inputMode="numeric" min={15} max={120} step={1} required value={interval} onChange={(e) => { setInterval(e.target.value); change(); }} /></label>
        <label htmlFor="booking-hours-note">Organisatorischer Hinweis (optional)<input id="booking-hours-note" aria-describedby="booking-hours-note-help" maxLength={160} value={note} onChange={(e) => { setNote(e.target.value); change(); }} /></label><p id="booking-hours-note-help" className={styles.help}>Keine Gästedaten erfassen.</p>
        <p className={styles.help}>Europe/Zurich · höchstens 24 Ortsstunden. Nicht existierende Ortszeiten werden abgewiesen. Bei der Zeitumstellung zählt der früheste Beginn bis zum spätesten Ende. Den Vortag kannst du für einen noch laufenden Nachtservice anpassen oder jetzt verlängern. Ein Nachtservice des Vortags bleibt erhalten; für eine Sperre ab 00:00 nutze eine Buchungssperre.</p>
      </div></fieldset>
      <div className={styles.hoursConfirmation}>
        {affected > 0 && <p role="status">{affected} bestehende aktive Reservierungen liegen durch diese Änderung ausserhalb der Servicezeiten.</p>}
        <label className={styles.checkbox}><input type="checkbox" disabled={busy || uncertain} checked={keep} onChange={(e) => { setKeep(e.target.checked); setEdited(true); }} />Bestehende Reservierungen ausdrücklich beibehalten</label>
        {hours && !uncertain && <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setArchive(!archive); setAffected(0); setKeep(false); }}>{archive ? "Weiter bearbeiten" : "Wochenzeiten wieder verwenden"}</button>}
        {archive && <p role="status">Wochenzeiten wieder verwenden? Die Sonderzeiten werden archiviert. Bestehende Reservierungen werden nicht storniert.</p>}
      </div>
      {error && <p role="alert" className={styles.writeWarning}>{error}{uncertain ? " Der Speicherstatus ist unklar. Wiederholen sendet ausschliesslich dieselbe Änderung." : ""}</p>}
      <footer className={styles.editorFooter}><span>Keine automatische Gastnachricht</span><button type="submit" className={styles.primary} disabled={busy || (!uncertain && ((!archive && !valid) || (affected > 0 && !keep)))}>{busy ? "Wird gespeichert …" : uncertain ? "Unverändert erneut versuchen" : archive ? "Wochenzeiten bestätigen" : "Sonderzeiten speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}
