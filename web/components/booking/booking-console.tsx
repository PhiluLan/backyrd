"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getOwnerSpots, type OwnerSpotListItem } from "@/lib/owner-api";
import { bookingError, readBookingConsole, restaurantDate, restaurantTime, saveBookingSetup, setBookingStatus, type BookingReservation, type BookingSetup, type BookingSnapshot, type BookingStatus } from "@/lib/booking-api";
import { SetupForm } from "./setup-form";
import { NewReservation } from "./new-reservation";
import styles from "./console.module.css";

const statusLabels: Record<BookingStatus, string> = { pending: "Anfrage offen", confirmed: "Bestätigt", cancelled: "Storniert", declined: "Abgelehnt", no_show: "Nicht erschienen" };
type EntryState = "loading" | "guest" | "ready" | "error";

export function BookingConsole() {
  const [entry, setEntry] = useState<EntryState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [spots, setSpots] = useState<OwnerSpotListItem[]>([]);
  const [spotId, setSpotId] = useState("");
  const [date, setDate] = useState(restaurantDate);
  const [snapshot, setSnapshot] = useState<BookingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"reservations" | "setup">("reservations");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<{ reservation: BookingReservation; status: BookingStatus } | null>(null);
  const generation = useRef(0);
  const entryGeneration = useRef(0);
  const actorId = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    const entryRequest = ++entryGeneration.current;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) {
        entryGeneration.current += 1;
        actorId.current = null;
        generation.current += 1;
        setEntry("guest"); setSpots([]); setSpotId(""); setSnapshot(null); setError(null); setNotice(null); setAction(null); setDirty(false);
      } else if (active && session && actorId.current && actorId.current !== session.user.id) {
        entryGeneration.current += 1; generation.current += 1;
        actorId.current = session.user.id;
        setEntry("loading"); setSpots([]); setSpotId(""); setSnapshot(null); setError(null); setNotice(null); setAction(null); setDirty(false);
        setAttempt((value) => value + 1);
      }
    });
    async function loadEntry() {
      setEntry("loading");
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!active || entryRequest !== entryGeneration.current) return;
        if (authError && authError.name !== "AuthSessionMissingError" && authError.status !== 401 && authError.status !== 403) throw authError;
        if (authError || !data.user) { setEntry("guest"); return; }
        actorId.current = data.user.id;
        const rows = await getOwnerSpots(100);
        if (!active || entryRequest !== entryGeneration.current) return;
        setSpots(rows); setSpotId(rows[0]?.spot_id ?? ""); setEntry("ready");
      } catch { if (active && entryRequest === entryGeneration.current) setEntry("error"); }
    }
    void loadEntry();
    return () => { active = false; generation.current += 1; subscription.unsubscribe(); };
  }, [attempt]);

  const reload = useCallback(async () => {
    if (!spotId || !date) return;
    const request = ++generation.current;
    setLoading(true); setError(null);
    try {
      const data = await readBookingConsole(spotId, date);
      if (request !== generation.current) return;
      setSnapshot(data);
      if (!data.settings) setTab("setup");
    } catch (e) { if (request === generation.current) { setSnapshot(null); setError(bookingError(e)); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [spotId, date]);

  useEffect(() => { setSnapshot(null); setDirty(false); setNotice(null); setAction(null); void reload(); }, [reload]);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function save(setup: BookingSetup) {
    if (inFlight.current || !snapshot) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await saveBookingSetup(spotId, snapshot.settings?.revision ?? 0, setup);
      setDirty(false); setNotice("Die Einrichtung wurde gespeichert.");
      await reload();
    } catch (e) { setError(bookingError(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function changeStatus() {
    if (inFlight.current || !action) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await setBookingStatus(spotId, action.reservation, action.status);
      setAction(null); setNotice("Der Status wurde gespeichert."); await reload();
    } catch (e) { setAction(null); setError(bookingError(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const selectedSpot = spots.find((s) => s.spot_id === spotId);
  const activeReservations = snapshot?.reservations.filter((r) => r.status === "confirmed" || r.status === "pending") ?? [];

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/booking" className={styles.brand}>backyrd<span>booking</span></Link>
      <div className={styles.actions}><span className={styles.consoleTag}>CONSOLE</span><Link href="/owner">Owner-Bereich</Link></div>
    </header>
    <div className={styles.container}>
      {entry === "loading" ? <div className={styles.state} role="status">Booking Console wird geladen …</div> : entry === "guest" ? <section className={styles.state}><p className={styles.kicker}>FÜR RESTAURANTS</p><h1>Dein Service beginnt hier.</h1><p>Melde dich mit deinem Betreiberkonto an, um dein Restaurant einzurichten und Reservierungen zu verwalten.</p><Link className={styles.primary} href="/login?next=%2Fbooking%2Fconsole">Zur Booking Console anmelden</Link></section> : entry === "error" ? <section className={styles.state}><h1>Zugang konnte nicht geladen werden.</h1><p>Bitte prüfe deine Verbindung und versuche es erneut.</p><button className={styles.secondary} onClick={() => setAttempt((n) => n + 1)}>Erneut versuchen</button></section> : !spots.length ? <section className={styles.state}><h1>Verbinde dein Restaurant.</h1><p>Deinem Konto ist noch kein Spot zugeordnet. Wir prüfen den Betreiberzugang persönlich, bevor du Reservierungen verwalten kannst.</p><a className={styles.primary} href="mailto:hello@backyrd.ch?subject=Booking%20Betreiberzugang">Betreiberzugang anfragen</a></section> : <>
        <div className={styles.heading}><div><p className={styles.kicker}>DEIN RESTAURANTBETRIEB</p><h1>{selectedSpot?.name ?? "Booking Console"}</h1><p>Reservierungen und Verfügbarkeit. An einem Ort.</p></div><label>Restaurant<select value={spotId} disabled={busy || dirty || loading} onChange={(e) => setSpotId(e.target.value)}>{spots.map((s) => <option value={s.spot_id} key={s.spot_id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>)}</select></label></div>
        <nav className={styles.tabs} aria-label="Booking Bereiche">
          <button type="button" aria-current={tab === "reservations" ? "page" : undefined} disabled={busy || dirty} onClick={() => setTab("reservations")}>Reservierungen</button>
          <button type="button" aria-current={tab === "setup" ? "page" : undefined} disabled={busy} onClick={() => setTab("setup")}>Einrichtung{dirty ? " · ungespeichert" : ""}</button>
          <button type="button" className={styles.refresh} disabled={loading || busy || dirty} onClick={() => { setNotice(null); void reload(); }}>Aktualisieren</button>
        </nav>
        {error && <div className={styles.error} role="alert">{error}<button type="button" className={styles.secondary} disabled={busy || dirty} onClick={() => void reload()}>Neu laden</button></div>}
        {notice && <p className={styles.success} role="status">{notice}</p>}
        {loading && <p role="status" className={styles.help}>Daten werden geladen …</p>}
        {snapshot && <>
          <div hidden={tab !== "setup"}>
            <SetupForm key={`${spotId}:${snapshot.settings?.revision ?? "new"}`} snapshot={snapshot} busy={busy || loading} onSave={save} onDirty={setDirty} />
          </div>
          <div hidden={tab !== "reservations"}>
            <div className={styles.toolbar}><label>Datum · Europe/Zurich<input type="date" required value={date} disabled={busy || dirty || loading} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /></label><span>{activeReservations.length} aktive Reservierungen · {activeReservations.reduce((sum, r) => sum + r.party_size, 0)} Gäste</span></div>
            <section className={styles.panel} aria-labelledby="reservations-title"><div className={styles.panelHeading}><h2 id="reservations-title">Dein Tagesbuch</h2><span>{snapshot.reservations.length} Einträge</span></div>
              {!snapshot.reservations.length ? <div className={styles.empty}><h3>Ein freier Anfang.</h3><p>Für diesen Tag wurden noch keine Reservierungen erfasst.</p></div> : <div className={styles.reservations}>{snapshot.reservations.map((r) => <article className={styles.reservation} key={r.id}>
                <div><strong className={styles.time}>{restaurantTime(r.starts_at)}</strong><span className={styles.help}>bis {restaurantTime(r.ends_at)}</span></div>
                <div><h3>{r.guest_name}</h3><p>{r.party_size} {r.party_size === 1 ? "Person" : "Personen"} · {snapshot.tables.find((t) => t.id === r.table_id)?.label ?? "Tisch"}</p>{r.guest_contact && <p>{r.guest_contact}</p>}{r.note && <p className={styles.note}>{r.note}</p>}<small>#{r.id.slice(0, 8).toUpperCase()}</small></div>
                <div className={styles.reservationActions}><span className={styles.status} data-status={r.status}>{statusLabels[r.status]}</span><div className={styles.actions}>
                  {r.status === "pending" && <><button type="button" disabled={busy || loading} onClick={() => setAction({ reservation: r, status: "confirmed" })}>Bestätigen</button><button type="button" disabled={busy || loading} onClick={() => setAction({ reservation: r, status: "declined" })}>Ablehnen</button></>}
                  {(r.status === "pending" || r.status === "confirmed") && <button type="button" disabled={busy || loading} onClick={() => setAction({ reservation: r, status: "cancelled" })}>Stornieren</button>}
                  {r.status === "confirmed" && Date.parse(r.starts_at) <= Date.now() && <button type="button" disabled={busy || loading} onClick={() => setAction({ reservation: r, status: "no_show" })}>Nicht erschienen</button>}
                </div></div>
              </article>)}</div>}
            </section>
            {action && <section className={styles.panel} aria-label="Statuswechsel bestätigen"><h2>{statusLabels[action.status]}: {action.reservation.guest_name}</h2><p>Der neue Status wird gespeichert und im Buchungsverlauf protokolliert.</p><div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void changeStatus()}>Status speichern</button><button className={styles.secondary} disabled={busy} onClick={() => setAction(null)}>Zurück</button></div></section>}
            {snapshot.settings ? <NewReservation key={`${spotId}:${date}:${snapshot.settings.revision}:${snapshot.reservations.length}`} spotId={spotId} date={date} snapshot={snapshot} onBusy={setBusy} onCreated={async () => { setNotice("Die Reservierung wurde gespeichert."); await reload(); }} /> : <div className={styles.panel}><h2>Einrichtung zuerst speichern.</h2><p>Lege Bereiche, Tische und Servicezeiten an, damit freie Zeiten zuverlässig geprüft werden können.</p><button className={styles.primary} onClick={() => setTab("setup")}>Restaurant einrichten</button></div>}
          </div>
        </>}
      </>}
    </div>
  </main>;
}
