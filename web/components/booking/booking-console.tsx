"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getOwnerSpots, type OwnerSpotListItem } from "@/lib/owner-api";
import { bookingError, occupiesInventory as active, readBookingConsole, restaurantDate, restaurantTime, saveBookingSetup, type BookingSetup, type BookingSnapshot } from "@/lib/booking-api";
import { SetupForm } from "./setup-form";
import { NewReservation, type CreatedBooking } from "./new-reservation";
import { ReservationDetails, statusLabels } from "./reservation-details";
import styles from "./console.module.css";

type EntryState = "loading" | "guest" | "ready" | "error";
type View = "book" | "tables" | "setup";
function shiftDate(date: string, days: number) {
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function displayDate(date: string) {
  return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long" }).format(new Date(date + "T12:00:00Z"));
}

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
  const [view, setView] = useState<View>("book");
  const [service, setService] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [time, setTime] = useState("");
  const [editor, setEditor] = useState<{ tableId: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const entryGeneration = useRef(0);
  const actorId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const createdNotice = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const request = ++entryGeneration.current;
    function clearPrivateState() {
      generation.current += 1; setSpots([]); setSpotId(""); setSnapshot(null); setEditor(null); setSelectedId(null);
      setQuery(""); setService(""); setArea(""); setStatus("all"); setTime(""); setError(null); setNotice(null); setDirty(false); setBusy(false); setLoading(false); createdNotice.current = null;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        entryGeneration.current += 1; actorId.current = null; clearPrivateState(); setEntry("guest");
      } else if (_event !== "INITIAL_SESSION" && actorId.current !== session.user.id) {
        entryGeneration.current += 1; actorId.current = session.user.id; clearPrivateState(); setEntry("loading"); setAttempt((value) => value + 1);
      }
    });
    async function loadEntry() {
      setEntry("loading");
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (!mounted || request !== entryGeneration.current) return;
        if (authError && authError.name !== "AuthSessionMissingError" && authError.status !== 401 && authError.status !== 403) throw authError;
        if (authError || !data.user) { setEntry("guest"); return; }
        actorId.current = data.user.id;
        const rows = await getOwnerSpots(100);
        if (!mounted || request !== entryGeneration.current) return;
        setSpots(rows); setSpotId(rows[0]?.spot_id ?? ""); setEntry("ready");
      } catch { if (mounted && request === entryGeneration.current) setEntry("error"); }
    }
    void loadEntry();
    return () => { mounted = false; generation.current += 1; subscription.unsubscribe(); };
  }, [attempt]);

  const reload = useCallback(async () => {
    if (!spotId || !date) return;
    const request = ++generation.current;
    setLoading(true); setError(null);
    try {
      const data = await readBookingConsole(spotId, date);
      if (request !== generation.current) return;
      setSnapshot(data);
      if (!data.settings) setView("setup");
    } catch (error) { if (request === generation.current) { setSnapshot(null); setError(bookingError(error)); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [spotId, date]);

  useEffect(() => {
    setSnapshot(null); setDirty(false); setNotice(createdNotice.current); createdNotice.current = null;
    setSelectedId(null); setEditor(null); void reload();
  }, [reload]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function save(setup: BookingSetup) {
    if (inFlight.current || !snapshot) return;
    const actor = actorId.current;
    const request = entryGeneration.current;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await saveBookingSetup(spotId, snapshot.settings?.revision ?? 0, setup);
      if (actor !== actorId.current || request !== entryGeneration.current) return;
      setDirty(false); setNotice("Die Einrichtung wurde gespeichert."); await reload();
    } catch (error) { if (actor === actorId.current && request === entryGeneration.current) setError(bookingError(error)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const validService = snapshot?.services.some((s) => s.id === service) ? service : "";
  const validArea = snapshot?.areas.some((a) => a.id === area) ? area : "";
  const context = snapshot?.reservations.filter((reservation) => (!validService || reservation.service_id === validService)
    && (!validArea || snapshot.tables.some((table) => table.id === reservation.table_id && table.area_id === validArea))) ?? [];
  const visible = context.filter((reservation) => (status === "all" || (status === "active" ? active(reservation.status) : reservation.status === status))
    && (!query.trim() || reservation.guest_name.toLocaleLowerCase("de-CH").includes(query.trim().toLocaleLowerCase("de-CH"))));
  const rows = view === "tables" ? context : visible;
  const activeRows = rows.filter((reservation) => active(reservation.status));
  const filtered = !!validService || !!validArea || (view === "book" && (status !== "all" || !!query.trim()));
  const selected = snapshot?.reservations.find((reservation) => reservation.id === selectedId);
  const currentActor = actorId.current;
  const currentEntry = entryGeneration.current;
  // Native modal dialogs make the workspace inert while preserving the
  // launching control as a valid focus-return target.
  const navigationDisabled = busy || loading || dirty;
  const readyToBook = !!snapshot?.settings && snapshot.tables.some((table) => table.is_active && snapshot.areas.some((area) => area.id === table.area_id && area.is_active)) && snapshot.services.some((service) => service.is_active);
  const canCreate = date >= restaurantDate() && date <= shiftDate(restaurantDate(), 365);
  function clearFilters() { setService(""); setArea(""); setStatus("all"); setQuery(""); }
  async function savedBooking(booking: CreatedBooking, message: string) {
    if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return;
    setEditor(null); setStatus("all"); setQuery("");
    if (validService) setService(booking.slot.service_id);
    if (validArea) setArea(snapshot?.tables.find((table) => table.id === booking.slot.table_id)?.area_id ?? "");
    if (booking.date !== date) { createdNotice.current = message + " " + displayDate(booking.date); setDate(booking.date); }
    else { setNotice(message); await reload(); }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/booking" className={styles.brand}>backyrd<span>booking</span></Link><div className={styles.actions}><span className={styles.consoleTag}>CONSOLE</span><Link href="/owner">Owner-Bereich ↗</Link></div></header>
    <div className={styles.container}>
      {entry === "loading" ? <div className={styles.state} role="status">Booking Console wird geladen …</div>
        : entry === "guest" ? <section className={styles.state}><p className={styles.kicker}>FÜR RESTAURANTS</p><h1>Dein Service beginnt hier.</h1><p>Melde dich mit deinem Betreiberkonto an, um dein Restaurant einzurichten und Reservierungen zu verwalten.</p><Link className={styles.primary} href="/login?next=%2Fbooking%2Fconsole">Zur Booking Console anmelden</Link></section>
          : entry === "error" ? <section className={styles.state}><h1>Zugang konnte nicht geladen werden.</h1><p>Bitte prüfe deine Verbindung und versuche es erneut.</p><button className={styles.secondary} onClick={() => setAttempt((value) => value + 1)}>Erneut versuchen</button></section>
            : !spots.length ? <section className={styles.state}><h1>Verbinde dein Restaurant.</h1><p>Deinem Konto ist noch kein Spot zugeordnet. Wir prüfen den Betreiberzugang persönlich, bevor du Reservierungen verwalten kannst.</p><a className={styles.primary} href="mailto:hello@backyrd.ch?subject=Booking%20Betreiberzugang">Betreiberzugang anfragen</a></section> : <>
              <div className={styles.heading}><div><p className={styles.kicker}>DEIN SERVICE. DEIN ÜBERBLICK.</p><h1>{spots.find((spot) => spot.spot_id === spotId)?.name ?? "Booking Console"}</h1></div>{spots.length > 1 && <label>Restaurant<select value={spotId} disabled={navigationDisabled} onChange={(event) => { clearFilters(); setSpotId(event.target.value); }}>{spots.map((spot) => <option value={spot.spot_id} key={spot.spot_id}>{spot.name}{spot.city ? " · " + spot.city : ""}</option>)}</select></label>}<button type="button" className={styles.secondary} aria-label="Aktualisieren" title="Aktualisieren" disabled={navigationDisabled} onClick={() => { setNotice(null); void reload(); }}>↻</button></div>
              <nav className={styles.tabs} aria-label="Booking Bereiche">{([["book", "Reservierungsbuch"], ["tables", "Tischübersicht"], ["setup", "Einrichtung"]] as const).map(([key, label]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} disabled={navigationDisabled} onClick={() => setView(key)}>{label}{key === "setup" && dirty ? " · ungespeichert" : ""}</button>)}</nav>
              {error && <div className={styles.error} role="alert">{error}<button className={styles.secondary} disabled={busy || dirty} onClick={() => void reload()}>Neu laden</button></div>}
              {notice && <p className={styles.success} role="status">{notice}</p>}
              {loading && <p role="status" className={styles.help}>Daten werden geladen …</p>}
              {snapshot && <>
                <div hidden={view !== "setup"}><SetupForm key={spotId + ":" + (snapshot.settings?.revision ?? "new")} snapshot={snapshot} busy={busy || loading} onSave={save} onDirty={setDirty} /></div>
                <div hidden={view === "setup"}>
                  <section className={styles.serviceBar} aria-label="Tageskontext">
                    <div className={styles.dateNavigation}><button className={styles.secondary} aria-label="Vorheriger Tag" disabled={navigationDisabled} onClick={() => setDate(shiftDate(date, -1))}>←</button><label>Datum · Europe/Zurich<input type="date" required value={date} disabled={navigationDisabled} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label><button className={styles.secondary} aria-label="Nächster Tag" disabled={navigationDisabled} onClick={() => setDate(shiftDate(date, 1))}>→</button>{date !== restaurantDate() && <button className={styles.secondary} disabled={navigationDisabled} onClick={() => setDate(restaurantDate())}>Heute</button>}</div>
                    <div className={styles.contextFilters}><label>Service<select value={validService} disabled={navigationDisabled} onChange={(event) => setService(event.target.value)}><option value="">Alle Services</option>{snapshot.services.map((service) => <option key={service.id} value={service.id}>{service.name}{!service.is_active ? " (inaktiv)" : ""}</option>)}</select></label><label>Bereich<select value={validArea} disabled={navigationDisabled} onChange={(event) => setArea(event.target.value)}><option value="">Alle Bereiche</option>{snapshot.areas.map((area) => <option key={area.id} value={area.id}>{area.name}{!area.is_active ? " (inaktiv)" : ""}</option>)}</select></label></div>
                    {readyToBook ? <button className={styles.primary} disabled={navigationDisabled || !canCreate} title={!canCreate ? "Neue Buchungen sind für heute und die nächsten 365 Tage möglich." : undefined} onClick={() => setEditor({ tableId: "" })}>+ Neue Reservierung</button> : <button className={styles.primary} disabled={navigationDisabled} onClick={() => setView("setup")}>Einrichtung abschliessen</button>}
                  </section>
                  <div className={styles.workspaceSummary}><div className={styles.workspaceHeading}><div><p className={styles.kicker}>{displayDate(date)}</p><h2>{view === "tables" ? "Deine Tische" : "Dein Reservierungsbuch"}</h2></div><p className={styles.help}>{filtered ? "Auswahl" : "Ganzer Tag"} · gespeicherte Buchungen</p></div>
                  <div className={styles.metrics} aria-label="Buchungsübersicht der Auswahl"><div><strong>{activeRows.length}</strong><span>Aktive Reservierungen</span></div><div><strong>{activeRows.reduce((sum, row) => sum + row.party_size, 0)}</strong><span>Gäste in aktiven Reservierungen</span></div><div><strong>{rows.filter((row) => row.status === "pending").length}</strong><span>Offene Anfragen</span></div></div></div>
                  {snapshot.capabilities?.service_lifecycle && <div className={styles.serviceProgress} aria-label="Service in der Auswahl">{(["arrived", "seated", "completed"] as const).map((stage) => <span key={stage}><strong>{rows.filter((row) => row.status === stage).reduce((sum, row) => sum + row.party_size, 0)}</strong> {stage === "arrived" ? "Gäste angekommen" : stage === "seated" ? "Gäste am Tisch" : "Gäste verabschiedet"}</span>)}<small>Manuell erfasster Servicestatus · Auswahl</small></div>}
                  {view === "book" && <div className={styles.bookFilters}><label>Gast suchen<input type="search" autoComplete="off" placeholder="Name suchen …" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="active">Aktive Reservierungen</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{filtered && <button className={styles.secondary} onClick={clearFilters}>Alle anzeigen</button>}</div>}
                  {view === "book" ? <section className={styles.book} aria-label="Reservierungen">
                    <div className={styles.bookColumns} aria-hidden="true"><span>Zeit</span><span>Gast</span><span>Personen</span><span>Bereich / Tisch</span><span>Status</span><span /></div>
                    {!visible.length ? <div className={styles.empty}><p className={styles.emptySymbol} aria-hidden="true">↗</p><h3>{filtered && snapshot.reservations.length ? "Keine Treffer für diese Filter." : "Ein freier Anfang."}</h3><p>{filtered && snapshot.reservations.length ? "Es gibt Buchungen an diesem Tag. Passe deine Auswahl an." : "Für diesen Tag wurden noch keine Reservierungen erfasst."}</p>{filtered && <button className={styles.secondary} onClick={clearFilters}>Filter zurücksetzen</button>}</div>
                      : <ul className={styles.bookRows}>{visible.map((row) => {
                        const table = snapshot.tables.find((table) => table.id === row.table_id);
                        return <li key={row.id}><button className={styles.bookRow} aria-label={"Reservierung von " + row.guest_name + " öffnen"} onClick={() => setSelectedId(row.id)}><span className={styles.rowTime}><strong>{restaurantTime(row.starts_at)}</strong><small>bis {restaurantTime(row.ends_at)}</small></span><span className={styles.rowGuest}><strong>{row.guest_name}</strong><small>{row.note ? "Interner Hinweis" : row.source === "phone" ? "Telefon" : row.source === "email" ? "E-Mail" : row.source === "walk_in" ? "Vor Ort" : "Betreiber"}</small></span><span className={styles.rowParty}>{row.party_size}<small> Personen</small></span><span className={styles.rowTable}>{table?.label ?? "Tisch"}<small>{snapshot.areas.find((area) => area.id === table?.area_id)?.name ?? "Bereich"}</small></span><span className={styles.status} data-status={row.status}>{statusLabels[row.status]}</span><span className={styles.rowArrow} aria-hidden="true">↗</span></button></li>;
                      })}</ul>}
                  </section> : <section aria-label="Tischübersicht">
                    <div className={styles.tableToolbar}><label>Belegung um<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>{time && <button className={styles.secondary} onClick={() => setTime("")}>Ganzer Tag</button>}<p className={styles.help}>{time ? "Geplante Reservierungszeiten. Der manuell erfasste Servicestatus zeigt den letzten gespeicherten Stand." : "Aktive Reservierungen über den ganzen Tag. Freie Buchungszeiten werden bei der Erfassung geprüft."}</p></div>
                    {filtered && <button className={styles.secondary} onClick={clearFilters}>Alle Bereiche und Services</button>}
                    {snapshot.areas.filter((area) => !validArea || area.id === validArea).map((area) => <section className={styles.areaSection} key={area.id}><h3>{area.name}{!area.is_active ? " · nicht buchbar" : ""}</h3><div className={styles.tableGrid}>{snapshot.tables.filter((table) => table.area_id === area.id).map((table) => {
                      const reservations = context.filter((row) => row.table_id === table.id && active(row.status) && (!time || (restaurantDate(new Date(row.starts_at)) + "T" + restaurantTime(row.starts_at) <= date + "T" + time && restaurantDate(new Date(row.ends_at)) + "T" + restaurantTime(row.ends_at) > date + "T" + time)));
                      return <article className={styles.tableCard} key={table.id} data-occupied={!!reservations.length}><div className={styles.panelHeading}><h4>{table.label}</h4><span>{table.seats} Plätze</span></div><p>{!table.is_active || !area.is_active ? "Nicht buchbar" : reservations.length ? reservations.length + (reservations.length === 1 ? " Reservierung" : " Reservierungen") : "Keine Reservierung"}</p>{reservations.map((row) => <button key={row.id} className={styles.tableBooking} onClick={() => setSelectedId(row.id)}><strong>{restaurantTime(row.starts_at)} · {row.guest_name}</strong><span>{row.party_size} Personen · {statusLabels[row.status]}</span></button>)}<button className={styles.secondary} disabled={navigationDisabled || !canCreate || !readyToBook || !table.is_active || !area.is_active} onClick={() => setEditor({ tableId: table.id })}>Zeit für {table.label} prüfen</button></article>;
                    })}</div></section>)}
                    {!snapshot.areas.length && <div className={styles.empty}><h3>Noch keine Bereiche.</h3><p>Lege Bereiche und Tische in der Einrichtung an.</p></div>}
                  </section>}
                </div>
                {editor && <NewReservation spotId={spotId} date={date} serviceId={validService} areaId={validArea} tableId={editor.tableId} time={time} snapshot={snapshot} onClose={() => setEditor(null)} onBusy={setBusy} onCreated={(booking) => savedBooking(booking, "Die Reservierung wurde gespeichert.")} />}
                {selected && <ReservationDetails key={selected.id} spotId={spotId} reservation={selected} snapshot={snapshot} onClose={() => setSelectedId(null)} onBusy={setBusy} onAmended={(date, slot) => savedBooking({ date, slot }, "Die Änderungen wurden gespeichert.")} onReload={async () => { if (currentActor === actorId.current && currentEntry === entryGeneration.current) await reload(); }} onSaved={async () => { if (currentActor === actorId.current && currentEntry === entryGeneration.current) { setNotice("Der Status wurde gespeichert."); await reload(); } }} />}
              </>}
            </>}
    </div>
  </main>;
}
