"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { bookingError, bookingWriteUncertain, inspectBookingInvite, type BookingInvitePreview } from "@/lib/booking-api";
import { BookingConsole } from "./booking-console";
import { teamRoleHelp, teamRoleLabels } from "./team-console";
import styles from "./console.module.css";

const pendingKey = "backyrd.booking.pending-invitation.v1";
const pendingLifetime = 60 * 60_000;
function clearPending() { try { sessionStorage.removeItem(pendingKey); } catch { /* Storage may be disabled. */ } history.replaceState(null, "", location.pathname + location.search); }
type Entry = { kind: "checking" | "console" | "invalid" | "expired" } | { kind: "invite"; token: string; retained: boolean; expiresAt: number };
export function BookingEntry() {
  const [entry, setEntry] = useState<Entry>({ kind: "checking" });
  const [initialSpot, setInitialSpot] = useState<string | undefined>();
  useEffect(() => {
    // Read browser-only handoff state after hydration; cancel queued work on cleanup.
    const initialize = () => {
    const fragment = location.hash;
    const match = /^#invite=([0-9a-f]{64})$/.exec(fragment);
    if (fragment.startsWith("#invite=") && !match) { clearPending(); setEntry({ kind: "invalid" }); return; }
    if (match) {
      let retained = false;
      try { sessionStorage.setItem(pendingKey, JSON.stringify({ token: match[1], receivedAt: Date.now() })); retained = true; } catch { /* Keep the in-memory fragment flow usable. */ }
      if (retained) history.replaceState(null, "", location.pathname + location.search);
      setEntry({ kind: "invite", token: match[1], retained, expiresAt: Date.now() + pendingLifetime }); return;
    }
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
      if (raw && typeof raw === "object" && "token" in raw && "receivedAt" in raw && typeof raw.token === "string" && /^[0-9a-f]{64}$/.test(raw.token)
        && typeof raw.receivedAt === "number" && Number.isSafeInteger(raw.receivedAt) && raw.receivedAt <= Date.now() && Date.now() - raw.receivedAt < pendingLifetime) {
        setEntry({ kind: "invite", token: raw.token, retained: true, expiresAt: raw.receivedAt + pendingLifetime }); return;
      }
      sessionStorage.removeItem(pendingKey);
    } catch { /* Invalid or blocked tab storage does not grant access. */ }
    setEntry({ kind: "console" });
    };
    const task = window.setTimeout(initialize, 0);
    window.addEventListener("hashchange", initialize);
    return () => { window.clearTimeout(task); window.removeEventListener("hashchange", initialize); };
  }, []);
  useEffect(() => {
    if (entry.kind !== "invite") return;
    const expire = () => { if (Date.now() >= entry.expiresAt) { clearPending(); setEntry({ kind: "expired" }); } };
    const timeout = window.setTimeout(expire, Math.max(0, entry.expiresAt - Date.now()));
    window.addEventListener("focus", expire); document.addEventListener("visibilitychange", expire);
    return () => { window.clearTimeout(timeout); window.removeEventListener("focus", expire); document.removeEventListener("visibilitychange", expire); };
  }, [entry]);
  if (entry.kind === "checking") return <main className={styles.page}><div className={styles.state} role="status">Booking wird geladen …</div></main>;
  if (entry.kind === "expired") return <main className={styles.page}><section className={styles.state}><h1>Einladung erneut öffnen.</h1><p>Die einstündige Übergabe für diesen Tab ist abgelaufen. Öffne den ursprünglichen Betreiberlink erneut oder prüfe einen bereits angenommenen Zugang in der Konsole.</p><button className={styles.secondary} onClick={() => setEntry({ kind: "console" })}>Zur Booking Console</button></section></main>;
  if (entry.kind === "invalid") return <main className={styles.page}><section className={styles.state}><h1>Einladungslink unvollständig.</h1><p>Öffne den vollständigen Link des Betreibers erneut.</p><button className={styles.secondary} onClick={() => setEntry({ kind: "console" })}>Zur Booking Console</button></section></main>;
  if (entry.kind === "invite") return <TeamInvitation key={entry.token} token={entry.token} retained={entry.retained} onClose={() => { clearPending(); setEntry({ kind: "console" }); }} onAccepted={(spotId) => { clearPending(); setInitialSpot(spotId); setEntry({ kind: "console" }); }} />;
  return <BookingConsole initialSpotId={initialSpot} />;
}
function TeamInvitation({ token, retained, onClose, onAccepted }: { token: string; retained: boolean; onClose: () => void; onAccepted: (spotId: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<{ id: string; email: string } | null>(null);
  const [preview, setPreview] = useState<BookingInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      generation.current += 1; inFlight.current = false; setBusy(false); setPreview(null); setAccount(null); setUncertain(false); setAttempt((value) => value + 1);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const request = ++generation.current; setLoading(true); setError(null); setPreview(null);
    async function load() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (request !== generation.current) return;
        if (error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) throw error;
        if (error || !data.user) { setAccount(null); return; }
        setAccount({ id: data.user.id, email: data.user.email ?? "" });
        const invitation = await inspectBookingInvite(token, false);
        if (request === generation.current) setPreview(invitation);
      } catch (error) { if (request === generation.current) setError(bookingError(error)); }
      finally { if (request === generation.current) setLoading(false); }
    }
    void load(); return () => { generation.current += 1; };
  }, [token, attempt]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (busy || uncertain) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [busy, uncertain]);
  async function accept() {
    if (inFlight.current || !preview || !account) return;
    inFlight.current = true; setBusy(true); setError(null);
    const request = generation.current;
    try { const accepted = await inspectBookingInvite(token, true); if (request === generation.current) onAccepted(accepted.spot_id); }
    catch (error) { if (request === generation.current) { setError(bookingError(error)); if (uncertain || bookingWriteUncertain(error)) setUncertain(true); } }
    finally { if (request === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  return <main className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/booking">backyrd<span>booking</span></Link></header><section className={styles.state}>
    <p className={styles.kicker}>TEAM-EINLADUNG</p><h1>{preview?.spot_name ?? "Dein Zugang zum Restaurantteam."}</h1>
    {loading ? <p role="status">Einladung wird geprüft …</p> : !account ? <><p>Melde dich mit der bestätigten eingeladenen E-Mail-Adresse an. Danach kannst du Restaurant und Rolle prüfen und die Einladung ausdrücklich annehmen.</p>{!retained && <p role="status">Dein Browser speichert die Einladung nicht für diesen Tab. Öffne den ursprünglichen Link nach der Anmeldung erneut.</p>}<div className={styles.actions}><Link className={styles.primary} href="/login?next=%2Fbooking%2Fconsole">Mit Backyrd anmelden</Link><Link className={styles.secondary} href="/signup?next=%2Fbooking%2Fconsole">Konto erstellen</Link></div></> : <>
      <p>Angemeldet als {account.email || "Backyrd-Konto"}</p>
      {preview && <><h2>{teamRoleLabels[preview.role]}</h2><p>{teamRoleHelp[preview.role]}</p><p className={styles.help}>Es werden keine anderen Restaurants oder Owner-Funktionen freigegeben.</p><button className={styles.primary} disabled={busy} onClick={() => preview.accepted ? onAccepted(preview.spot_id) : void accept()}>{busy ? "Wird angenommen …" : preview.accepted ? "Zur Booking Console" : uncertain ? "Annahme unverändert wiederholen" : "Einladung annehmen"}</button></>}
      {!preview && !loading && <button className={styles.secondary} disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Einladung erneut prüfen</button>}
      <button className={styles.secondary} disabled={busy || uncertain} onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) setError("Die Abmeldung ist fehlgeschlagen. Bitte erneut versuchen."); }}>Mit anderem Konto anmelden</button>
    </>}
    {error && <p role="alert" className={styles.error}>{error}{uncertain ? " Die Annahme kann bereits gespeichert sein. Wiederholen prüft denselben Link erneut und stellt keine entzogenen Rechte wieder her." : ""}</p>}
    <p className={styles.help}>Die Anmeldung kann in diesem Tab eine Stunde lang wiederaufgenommen werden. Danach musst du den Betreiberlink erneut öffnen; er läuft nach sieben Tagen ab.</p>
    {confirmExit && <section className={styles.confirmation} role="alert"><h2>Annahmestatus unklar</h2><p>Der Zugang kann bereits bestehen. Bewahre den ursprünglichen Betreiberlink auf, um ihn bei Bedarf erneut zu prüfen.</p><div className={styles.actions}><button className={styles.primary} onClick={onClose}>Schliessen und Konsole prüfen</button><button className={styles.secondary} onClick={() => setConfirmExit(false)}>Bei der Annahme bleiben</button></div></section>}
    <button className={styles.secondary} disabled={busy} onClick={() => uncertain ? setConfirmExit(true) : onClose()}>Einladung schliessen</button>
  </section></main>;
}
