"use client";
import { useEffect, useRef, useState } from "react";
import { mailContactHash, mailReissueActor, MailReissueError, reissueBookingMail, type MailReissueIntent } from "@/lib/booking-mail-reissue-client";
import { parseMailReissueRequest } from "@/lib/booking-mail-reissue-contract";
import type { BookingReservation } from "@/lib/booking-api";
import styles from "./console.module.css";

export function ReissueGuestLink({ spotId, reservation, onBusy, onPending, onDenied, onSaved }: { spotId: string; reservation: BookingReservation; onBusy: (value: boolean) => void; onPending: (value: boolean) => void; onDenied: () => void; onSaved: (queued: boolean) => Promise<void> }) {
  const [actor, setActor] = useState<string | null>(null);
  const [intent, setIntent] = useState<MailReissueIntent | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false), inFlight = useRef(false);
  const pending = useRef<MailReissueIntent | null>(null);
  const storage = (id: string) => `booking.mail-reissue.v1:${id}:${spotId}:${reservation.id}`;
  useEffect(() => {
    mounted.current = true;
    void mailReissueActor().then(id => {
      if (!mounted.current) return;
      if (!id) { onDenied(); return; }
      setActor(id);
      try {
        const value = sessionStorage.getItem(storage(id));
        if (!value) return;
        const restored = parseMailReissueRequest(JSON.parse(value));
        if (restored.spotId !== spotId || restored.reservationId !== reservation.id) throw new Error("wrong_scope");
        pending.current = restored; setIntent(restored); onPending(true);
      } catch { setBlocked(true); setError("Ein gespeicherter Auftrag konnte nicht gelesen werden. Prüfe den Versandverlauf, bevor du einen neuen Auftrag startest."); setConfirm(false); }
    }).catch(() => { if (mounted.current) { setBlocked(true); setError("Deine Anmeldung konnte nicht geprüft werden. Öffne die Reservierung erneut."); } });
    return () => { mounted.current = false; };
    // The component is keyed by reservation/revision. Callbacks must not reload its persisted intent during a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId, reservation.id]);
  async function run(recover = false) {
    if (!actor || inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusy(true); setError(null); setNotice(null);
    const wasPending = pending.current !== null;
    try {
      let operation = pending.current;
      if (!operation) {
        const next: MailReissueIntent = { spotId, reservationId: reservation.id, requestId: crypto.randomUUID(), revision: reservation.revision ?? 0, contactHash: await mailContactHash(reservation.guest_contact ?? "") };
        if (!mounted.current) return;
        const encoded = JSON.stringify({ ...next, operation: "issue" });
        // Persist before any write; a reload must never manufacture a fresh nonce.
        try { sessionStorage.setItem(storage(actor), encoded); if (sessionStorage.getItem(storage(actor)) !== encoded) throw new Error("storage_unavailable"); }
        catch { throw new MailReissueError("Der Browser kann den Auftrag nicht sicher speichern. Es wurde kein neuer Gastlink angefordert. Nutze einen Browser mit verfügbarem Tab-Speicher.", false); }
        operation = next; pending.current = next; setIntent(next); onPending(true);
      }
      if (!mounted.current) return;
      const result = await reissueBookingMail(operation, actor, recover);
      if (result === null) {
        if (mounted.current) setNotice("Noch kein Ergebnis gefunden. Eine laufende Anfrage kann weiterhin ankommen. Ein erneuter Versuch verwendet denselben Auftrag.");
        return;
      }
      try { sessionStorage.removeItem(storage(actor)); } catch { /* The committed nonce still safely replays if retained. */ }
      pending.current = null;
      if (!mounted.current) return;
      setIntent(null); setConfirm(false); onPending(false);
      setNotice(null);
      try { await onSaved(!("not_committed" in result)); } catch { if (mounted.current) setError("Der Auftrag wurde geprüft, aber die Reservierung konnte nicht neu geladen werden. Prüfe den aktuellen Stand."); }
    } catch (failure) {
      if (!mounted.current) return;
      const uncertain = wasPending || !(failure instanceof MailReissueError) || failure.uncertain;
      if (!uncertain) { try { sessionStorage.removeItem(storage(actor)); } catch { /* A retained nonce cannot duplicate a committed intent. */ } pending.current = null; setIntent(null); onPending(false); }
      setError(failure instanceof Error ? failure.message : "Der Auftragsstatus ist unklar.");
      if (failure instanceof MailReissueError && (failure.status === 401 || failure.status === 403)) onDenied();
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  const eligible = reservation.source === "website" && ["pending", "confirmed"].includes(reservation.status) && Date.parse(reservation.starts_at) > Date.now();
  if (!eligible && !intent) return null;
  return <section className={styles.note} aria-label="Gastlink neu ausstellen">
    <h3>Neue Bestätigung mit Gastlink</h3>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {intent ? <><p>Für diese Reservierung ist noch ein Auftrag offen. Ein alter Link könnte bereits ersetzt worden sein. Starte keinen weiteren Auftrag.</p><div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy || !actor} onClick={() => void run(true)}>Auftragsstatus prüfen</button><button type="button" className={styles.secondary} disabled={busy || !actor} onClick={() => void run()}>Denselben Auftrag wiederholen</button></div></> : confirm ? <><p>Neue Bestätigung an <strong>{reservation.guest_contact || "keine hinterlegte Adresse"}</strong> vorbereiten?</p><p>Der bisherige Gastlink wird ungültig. Eine bereits gestartete Nachricht kann noch ankommen; weitere Versuche werden angehalten. Die bisherigen Stornierungsbedingungen bleiben erhalten.</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || !actor} onClick={() => void run()}>Ja, neuen Gastlink vorbereiten</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirm(false)}>Zurück</button></div></> : <button type="button" className={styles.secondary} disabled={!actor || busy || blocked} onClick={() => setConfirm(true)}>Neuen Gastlink vorbereiten</button>}
  </section>;
}
