"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { bookingError, bookingReadDenied, bookingWriteUncertain, readBookingPublicConfig, saveBookingPublicConfig, parseBookingPublicIntent, type BookingPublicConfig, type BookingPublicIntent, type BookingPublicValues, type BookingSnapshot } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";
export function PublicBookingSettings({ spotId, snapshot, onClose, onBusy, onDenied, onSaved }: { spotId: string; snapshot: BookingSnapshot; onClose: (uncertain?: boolean) => void; onBusy: (value: boolean) => void; onDenied: () => void; onSaved: () => Promise<void> }) {
  const [config, setConfig] = useState<BookingPublicConfig | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false), [services, setServices] = useState<string[]>([]), [notice, setNotice] = useState("60"), [horizon, setHorizon] = useState("90"), [cancellation, setCancellation] = useState("120");
  const [confirmation, setConfirmation] = useState<"confirmed" | "pending">("pending"), [privacy, setPrivacy] = useState(""), [guestNotice, setGuestNotice] = useState("");
  const [conflict, setConflict] = useState(false), [blocked, setBlocked] = useState(false), [noticeText, setNoticeText] = useState("");
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [copied, setCopied] = useState(false);
  const request = useRef<AbortController | null>(null), mounted = useRef(false), inFlight = useRef(false), frozen = useRef<BookingPublicIntent | null>(null);
  const storage = (actor: string) => `booking.public-settings.v1:${actor}:${spotId}`;
  function values(p: BookingPublicValues | null) { setEnabled(p?.enabled ?? false); setServices(p?.serviceIds ?? snapshot.services.filter(s => s.is_active).slice(0,30).map(s => s.id)); setNotice(String(p?.noticeMinutes ?? 60)); setHorizon(String(p?.horizonDays ?? 90)); setCancellation(String(p?.cancellationMinutes ?? 120)); setConfirmation(p?.confirmationStatus ?? "pending"); setPrivacy(p?.privacyContact ?? ""); setGuestNotice(p?.guestNotice ?? "");
  }
  function hydrate(next: BookingPublicConfig) { setConfig(next); values(next.settings); setDirty(false); }
  useEffect(() => {
    mounted.current = true; const controller = new AbortController(); request.current = controller;
    void readBookingPublicConfig(spotId,controller.signal).then(next => {
      if (controller.signal.aborted) return;
      hydrate(next);
      try { const raw = sessionStorage.getItem(storage(next.actorId)); if (raw) { if (raw.length>8192) throw new Error("large_intent"); const old = parseBookingPublicIntent(JSON.parse(raw)); frozen.current = old; values(old.settings); setDirty(true); setUncertain(true); } }
      catch { setBlocked(true); setError("Ein gespeicherter Regel-Auftrag konnte nicht gelesen werden. Prüfe den Restaurantstand, bevor du andere Regeln speicherst."); }
    }).catch(failure => { if (!controller.signal.aborted) { if (bookingReadDenied(failure)) onDenied(); else setError(bookingError(failure)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
    // A new restaurant gets a new panel; dirty drafts must not hydrate on parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);
  const valid = !!config && [notice,horizon,cancellation].every(v => v.trim() !== "") && Number.isInteger(Number(notice)) && Number(notice)>=15 && Number(notice)<=10080 && Number.isInteger(Number(horizon)) && Number(horizon)>=1 && Number(horizon)<=365 && Number.isInteger(Number(cancellation)) && Number(cancellation)>=0 && Number(cancellation)<=10080 && services.length>0 && services.length<=30 && services.every(id => snapshot.services.some(s => s.id===id && (!enabled || s.is_active))) && privacy.trim().length>=3;
  async function submit(e: FormEvent) { e.preventDefault(); await act(false); }
  async function act(recover: boolean) {
    if (inFlight.current || !config || blocked || conflict || (!frozen.current && (!valid || !dirty))) return;
    let operation = frozen.current;
    const wasUncertain = uncertain;
    if (!operation) {
      operation = { requestId: crypto.randomUUID(), revision: config.revision, settings: { enabled, serviceIds: services, noticeMinutes: Number(notice), horizonDays: Number(horizon), cancellationMinutes: Number(cancellation), confirmationStatus: confirmation, privacyContact: privacy.trim(), guestNotice: guestNotice.trim() } };
      try { const raw=JSON.stringify(operation); sessionStorage.setItem(storage(config.actorId),raw); if(sessionStorage.getItem(storage(config.actorId))!==raw) throw new Error("storage_unavailable"); }
      catch { setError("Der Browser kann deinen Speicherauftrag nicht sicher ablegen. Es wurden keine Regeln angefordert."); return; }
      frozen.current=operation;
    }
    let acknowledged=false;
    inFlight.current=true; setBusy(true); onBusy(true); setError(null); setNoticeText("");
    try {
      const outcome=await saveBookingPublicConfig(spotId,operation,recover);
      if (!mounted.current) return;
      if (!outcome) { setUncertain(true); setError("Noch kein sicheres Ergebnis gefunden. Eine frühere Anfrage kann weiterhin gespeichert werden. Wiederhole ausschliesslich denselben Auftrag."); return; }
      if (outcome.notCommitted) {
        try { sessionStorage.removeItem(storage(config.actorId)); } catch { setBlocked(true); }
        frozen.current=null; setUncertain(false); setConflict(true); setError("Dein Auftrag wurde nicht ausgeführt. Die Restaurantregeln wurden inzwischen geändert. Deine Eingaben bleiben sichtbar, bis du den gespeicherten Stand ausdrücklich lädst."); return;
      }
      acknowledged=true;
      const next=await readBookingPublicConfig(spotId);
      if (!mounted.current) return;
      try { const key=storage(config.actorId); sessionStorage.removeItem(key); if(sessionStorage.getItem(key)!==null) throw new Error("storage_unavailable"); } catch { setUncertain(true); setError("Dein Auftrag wurde gespeichert, konnte aber noch nicht aus dem Tab-Speicher entfernt werden. Prüfe denselben Auftrag erneut."); return; }
      frozen.current=null; setUncertain(false); setConflict(false); hydrate(next); setNoticeText("Dein Speicherauftrag wurde bestätigt. Angezeigt sind die aktuell geladenen Regeln; die öffentliche Betriebsfreigabe bleibt separat.");
      await onSaved();
    } catch(failure) {
      if (!mounted.current) return;
      if (bookingReadDenied(failure)) { onDenied(); return; }
      setError(bookingError(failure));
      if (acknowledged || wasUncertain || bookingWriteUncertain(failure)) setUncertain(true);
      else { try { sessionStorage.removeItem(storage(config.actorId)); } catch { setBlocked(true); } frozen.current=null; }
    } finally { inFlight.current=false; if(mounted.current) setBusy(false); onBusy(false); }
  }
  async function reload() {
    if (inFlight.current || uncertain) return;
    inFlight.current=true; setLoading(true); setError(null);
    try { const next=await readBookingPublicConfig(spotId); if(!mounted.current)return; hydrate(next); setConflict(false); }
    catch(failure) { if(mounted.current) { if(bookingReadDenied(failure))onDenied();else setError(bookingError(failure)); } }
    finally { inFlight.current=false; if(mounted.current)setLoading(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/booking/${spotId}`); setCopied(true); } catch { setError("Der Link konnte nicht kopiert werden. Du kannst die angezeigte Adresse manuell übernehmen."); }
  }
  return <ConsolePanel title="Online-Buchungen" dirty={dirty} busy={busy} uncertain={uncertain} uncertainHelp="Die Buchungsregeln können bereits gespeichert sein. Prüfe den aktuellen Stand, bevor du andere Regeln speicherst." onClose={() => onClose(uncertain)}>
    <form className={styles.editorForm} onSubmit={submit} onChange={() => setDirty(true)}><div className={styles.drawerBody}>
      <p className={styles.note}>Hier bereitest du die Online-Regeln deines Restaurants vor. Öffentliche Buchungen bleiben bis zur Betriebsfreigabe von Backyrd Booking gesperrt. Ein gespeicherter Schalter bestätigt keine öffentliche Freischaltung.</p>
      {loading && <p role="status">Buchungsregeln werden geladen …</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}{noticeText && <p role="status" className={styles.success}>{noticeText}</p>}
      {!loading && !config && <button type="button" className={styles.secondary} onClick={() => void reload()}>Erneut laden</button>}
      {config && !dirty && !uncertain && <p className={styles.help}>Stand {new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(config.observedAt))} · <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void reload()}>Regeln aktualisieren</button></p>}
      {config && <fieldset className={styles.fieldset} disabled={loading || busy || uncertain || blocked || conflict}>
        <label className={styles.checkbox}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Restaurant für Online-Buchungen vorbereiten</label>
        <p className={styles.help}>Ausgeschaltet werden keine neuen Online-Buchungen angenommen. Bestehende Buchungen und ihre zugesagten Bedingungen bleiben erhalten.</p>
        <fieldset className={styles.fieldset}><legend>Online buchbare Services</legend>{snapshot.services.map(s => <label key={s.id} className={styles.checkbox}><input type="checkbox" disabled={enabled && !s.is_active && !services.includes(s.id)} checked={services.includes(s.id)} onChange={e => setServices(current => e.target.checked ? [...current,s.id] : current.filter(id => id!==s.id))} />{s.name}{!s.is_active ? " (inaktiv)" : ""}</label>)}</fieldset>
        <label>Bestätigung<select value={confirmation} onChange={e => setConfirmation(e.target.value as "pending" | "confirmed")}><option value="pending">Anfragen zuerst prüfen</option><option value="confirmed">Reservierungen sofort bestätigen</option></select></label>
        <div className={styles.fields}><label>Vorlauf in Minuten<input required type="number" min={15} max={10080} inputMode="numeric" value={notice} onChange={e => setNotice(e.target.value)} /></label><label>Im Voraus buchbar · Tage<input required type="number" min={1} max={365} inputMode="numeric" value={horizon} onChange={e => setHorizon(e.target.value)} /></label></div>
        <label>Online stornierbar · Minuten vor Beginn<input required type="number" min={0} max={10080} inputMode="numeric" value={cancellation} onChange={e => setCancellation(e.target.value)} /><span className={styles.help}>0 bedeutet bis zum Beginn. Bei späteren Absagen kontaktiert der Gast das Restaurant. Änderungen gelten für neue Buchungen.</span></label>
        <label>Datenschutzkontakt des Restaurants<input required maxLength={254} value={privacy} onChange={e => setPrivacy(e.target.value)} placeholder="datenschutz@restaurant.ch" /></label>
        <label>Buchungshinweise für Gäste<textarea rows={5} maxLength={1000} value={guestNotice} onChange={e => setGuestNotice(e.target.value)} /><span className={styles.help}>Organisatorische Hinweise und Bedingungen. Neue Gäste sehen diese vor dem Absenden; bestehende Buchungen behalten ihre gespeicherten Hinweise.</span></label>
      </fieldset>}
      {uncertain && <section className={styles.confirmation}><h3>Speicherstatus unklar</h3><p>Die Eingaben bleiben gesperrt. Erneutes Speichern wiederholt dieselben Regeln. Die Statusprüfung verändert keine Regeln. Ein fehlendes Ergebnis gibt den Auftrag nicht für andere Eingaben frei.</p><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void act(true)}>Speicherauftrag prüfen</button></section>}
      {conflict && <section className={styles.confirmation}><h3>Eingaben verwerfen und aktuellen Stand laden?</h3><p>Die hier eingegebenen Regeln wurden nicht gespeichert. Beim Laden werden sie durch die gespeicherten Regeln ersetzt.</p><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void reload()}>Verwerfen und gespeicherte Regeln laden</button></section>}
      {config && <section className={styles.note}><h3>Dein Buchungslink</h3><p className={styles.help}>{`/booking/${spotId}`}</p><button type="button" className={styles.secondary} onClick={() => void copy()}>{copied ? "Link kopiert" : "Buchungslink kopieren"}</button><p className={styles.help}>Der Link nimmt erst nach der Betriebsfreigabe und mit passenden aktiven Services Buchungen an. Es werden hier keine Testgäste oder Nachrichten angelegt.</p></section>}
    </div><footer className={styles.editorFooter}><span>{"Buchungsregeln · Schweizer Zeit"}</span><button className={styles.primary} disabled={busy || loading || blocked || conflict || (!uncertain && (!dirty || !valid))}>{busy ? "Speichert …" : uncertain ? "Denselben Speicherauftrag wiederholen" : "Buchungsregeln speichern"}</button></footer></form>
  </ConsolePanel>;
}
