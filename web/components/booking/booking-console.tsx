"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { bookingTableIds, bookingAllocationLabel, bookingAtLocalTime, bookingError, ownerBookingAccess, readBookingAccess, readBookingSpots, bookingReadDenied, occupiesInventory as active, readBookingConsole, restaurantDate, restaurantTime, saveBookingSetup, type BookingSpecialHours, type BookingClosure, type BookingSpot, type BookingSetup, type BookingSnapshot } from "@/lib/booking-api";
import { SetupForm } from "./setup-form";
import { NewReservation, type CreatedBooking } from "./new-reservation";
import { ReservationDetails, statusLabels } from "./reservation-details";
import { TablePlan, TablePlanEditor } from "./table-plan";
import { ClosureEditor, WeekOverview, closureLabel } from "./week-planning";
import { TeamConsole, teamRoleLabels } from "./team-console";
import { ServiceHoursEditor, hoursLabel } from "./service-hours";
import { TableCombinations } from "./table-combinations";
import { WalkIn } from "./walk-in";
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

export function BookingConsole({ initialSpotId }: { initialSpotId?: string } = {}) {
  const [entry, setEntry] = useState<EntryState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [spots, setSpots] = useState<BookingSpot[]>([]);
  const [spotId, setSpotId] = useState("");
  const [date, setDate] = useState(restaurantDate);
  const [snapshotState, setSnapshotState] = useState<{ spotId: string; date: string; data: BookingSnapshot; receivedAt: number } | null>(null);
  const snapshot = snapshotState?.spotId === spotId && snapshotState.date === date ? snapshotState.data : null;
  const access = snapshot?.access ?? ownerBookingAccess;
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamReview, setTeamReview] = useState(false);
  const [accessWarning, setAccessWarning] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bookPeriod, setBookPeriod] = useState<"day" | "week">("day");
  const [combinationsOpen, setCombinationsOpen] = useState(false);
  const [hoursEditor, setHoursEditor] = useState<{ date: string; hours?: BookingSpecialHours } | null>(null);
  const [closureEditor, setClosureEditor] = useState<{ date: string; closure?: BookingClosure } | null>(null);
  const [view, setView] = useState<View>("book");
  const [service, setService] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [time, setTime] = useState("");
  const [editor, setEditor] = useState<{ tableId: string } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planVisible, setPlanVisible] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [uncertainWrite, setUncertainWrite] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const entryGeneration = useRef(0);
  const actorId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const createdNotice = useRef<string | null>(null);
  const followOperatingDate = useRef(false);
  const reconnectPending = useRef(false);

  useEffect(() => {
    let mounted = true;
    const request = ++entryGeneration.current;
    function clearPrivateState() {
      generation.current += 1; inFlight.current = false; setSpots([]); setSpotId(""); setSnapshotState(null); setEditor(null); setSelectedId(null); setWalkInOpen(false); setPlanOpen(false); setClosureEditor(null); setHoursEditor(null); setCombinationsOpen(false); setTeamOpen(false); setTeamReview(false); setAccessWarning(false); setBookPeriod("day"); setUncertainWrite(false); setSyncFailed(false); followOperatingDate.current = false;
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
        const rows = await readBookingSpots();
        if (!mounted || request !== entryGeneration.current) return;
        setSpots(rows); setSpotId(rows.find((spot) => spot.spot_id === initialSpotId)?.spot_id ?? rows[0]?.spot_id ?? ""); setEntry("ready");
      } catch { if (mounted && request === entryGeneration.current) setEntry("error"); }
    }
    void loadEntry();
    return () => { mounted = false; generation.current += 1; subscription.unsubscribe(); };
  }, [attempt, initialSpotId]);

  const reload = useCallback(async () => {
    if (!spotId || !date) return;
    const request = ++generation.current;
    setLoading(true); setError(null);
    try {
      const data = await readBookingConsole(spotId, date);
      if (!data.capabilities?.team_access && spots.some((spot) => spot.spot_id === spotId && spot.access_role !== "owner")) throw new Error("booking_team_backend_required");
      if (request !== generation.current) return;
      if (followOperatingDate.current && data.operating_date && date !== data.operating_date) { followOperatingDate.current = false; setDate(data.operating_date); return; }
      followOperatingDate.current = false;
      setSnapshotState({ spotId, date, data, receivedAt: Date.now() }); setSyncFailed(false); reconnectPending.current = false;
      if (!data.settings) setView("setup");
    } catch (error) { if (request === generation.current) { setSnapshotState(null); setError(bookingError(error)); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [spotId, date, spots]);

  useEffect(() => {
    setSnapshotState(null); setSyncFailed(false); setDirty(false); setNotice(createdNotice.current); createdNotice.current = null;
    setSelectedId(null); setEditor(null); setWalkInOpen(false); setPlanOpen(false); setClosureEditor(null); setHoursEditor(null); setCombinationsOpen(false); setTeamOpen(false); void reload();
  }, [reload]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const changed = () => { reconnectPending.current = true; setSyncFailed(true); setOnline(navigator.onLine); };
    changed(); window.addEventListener("online", changed); window.addEventListener("offline", changed);
    return () => { window.removeEventListener("online", changed); window.removeEventListener("offline", changed); };
  }, []);
  const denyAccess = useCallback(() => {
    generation.current += 1; entryGeneration.current += 1; inFlight.current = false;
    setSnapshotState(null); setEditor(null); setSelectedId(null); setWalkInOpen(false); setPlanOpen(false); setClosureEditor(null); setHoursEditor(null); setCombinationsOpen(false); setTeamOpen(false); setTeamReview(false);
    setLoading(false); setBusy(false); setDirty(false); setNotice(null);
    setError("Der Betreiberzugriff ist nicht mehr verfügbar. Prüfe deinen Kontostatus oder melde dich erneut an.");
  }, []);
  const receivedAt = snapshotState?.spotId === spotId && snapshotState.date === date ? snapshotState.receivedAt : null;
  const canRefresh = entry === "ready" && !!receivedAt && online && !loading && !busy && !dirty && view !== "setup" && !editor && !walkInOpen && !planOpen && !closureEditor && !hoursEditor && !combinationsOpen && !teamOpen && !selectedId && !error;
  useEffect(() => {
    if (!canRefresh) return;
    let active = true;
    let controller: AbortController | null = null;
    const actor = actorId.current, entry = entryGeneration.current, readGeneration = generation.current;
    async function refresh() {
      if (!active || controller || document.visibilityState !== "visible" || !navigator.onLine) return;
      controller = new AbortController();
      try {
        const data = await readBookingConsole(spotId, date, controller.signal);
        if (!active || actor !== actorId.current || entry !== entryGeneration.current || readGeneration !== generation.current) return;
        setSnapshotState({ spotId, date, data, receivedAt: Date.now() }); setSyncFailed(false); reconnectPending.current = false;
      } catch (error) {
        if (!active || controller?.signal.aborted || actor !== actorId.current || entry !== entryGeneration.current || readGeneration !== generation.current) return;
        if (bookingReadDenied(error)) denyAccess();
        else setSyncFailed(true);
      } finally { controller = null; }
    }
    const resume = () => { if (document.visibilityState === "hidden") { controller?.abort(); return; } void refresh(); };
    const interval = window.setInterval(() => void refresh(), 30_000);
    // Reopening a long-running editor/setup refreshes the canonical read model.
    if (reconnectPending.current || (receivedAt && Date.now() - receivedAt >= 30_000)) void refresh();
    window.addEventListener("focus", resume); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { active = false; controller?.abort(); window.clearInterval(interval); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [canRefresh, receivedAt, spotId, date, denyAccess]);

  const teamCapability = !!snapshot?.capabilities?.team_access;
  useEffect(() => {
    if (!teamCapability || !snapshot || canRefresh || busy || loading || !online || error) return;
    let active = true; let controller: AbortController | null = null;
    const actor = actorId.current, entry = entryGeneration.current;
    async function check() {
      if (!active || controller || document.visibilityState !== "visible" || !navigator.onLine) return;
      controller = new AbortController();
      try {
        const next = await readBookingAccess(spotId, controller.signal);
        if (!active || actor !== actorId.current || entry !== entryGeneration.current) return;
        setAccessWarning(false);
        if (next.role !== access.role) {
          generation.current += 1; entryGeneration.current += 1; inFlight.current = false;
          setEditor(null); setSelectedId(null); setPlanOpen(false); setClosureEditor(null); setHoursEditor(null); setCombinationsOpen(false); setWalkInOpen(false); setTeamOpen(false); setTeamReview(false); setDirty(false); setBusy(false); setSnapshotState(null); setView("book");
          createdNotice.current = null; followOperatingDate.current = false;
          setNotice("Deine Teamrechte wurden geändert. Offene Eingaben wurden geschlossen; der aktuelle Stand wird neu geladen."); await reload();
        }
      } catch (error) { if (active && !controller?.signal.aborted && actor === actorId.current && entry === entryGeneration.current) { if (bookingReadDenied(error)) denyAccess(); else setAccessWarning(true); } }
      finally { controller = null; }
    }
    const resume = () => { if (document.visibilityState === "hidden") controller?.abort(); else void check(); };
    const interval = window.setInterval(() => void check(), 30_000);
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { active = false; controller?.abort(); window.clearInterval(interval); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [teamCapability, snapshot, canRefresh, busy, loading, online, error, spotId, access.role, reload, denyAccess]);

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
    finally { if (actor === actorId.current && request === entryGeneration.current) { inFlight.current = false; setBusy(false); } }
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
  const unclosed = snapshot?.unclosed_visits ?? [];
  const currentSeated = snapshot?.capabilities?.current_seating && date === snapshot.operating_date ? [...snapshot.reservations, ...unclosed].filter((row) => row.status === "seated") : [];
  const selected = snapshot?.reservations.find((reservation) => reservation.id === selectedId) ?? unclosed.find((reservation) => reservation.id === selectedId);
  const currentActor = actorId.current;
  const currentEntry = entryGeneration.current;
  function actorBusy(value: boolean) { if (currentActor === actorId.current && currentEntry === entryGeneration.current) setBusy(value); }
  // Native modal dialogs make the workspace inert while preserving the
  // launching control as a valid focus-return target.
  const waitingForSnapshot = entry === "ready" && !!spotId && !snapshot && !error;
  const navigationDisabled = busy || loading || waitingForSnapshot || dirty;
  const writeUnavailable = !online || syncFailed;
  const isWeek = view === "book" && bookPeriod === "week" && !!snapshot?.capabilities?.week_planning;
  const dayClosures = snapshot?.closures?.filter((closure) => (!validService || !closure.service_id || closure.service_id === validService) && (!validArea || !closure.area_id || closure.area_id === validArea)) ?? [];
  const closedDay = !!snapshot?.closures?.some((closure) => !closure.start_time && !closure.service_id && !closure.area_id);
  const readyToBook = !!snapshot?.settings && snapshot.tables.some((table) => table.is_active && snapshot.areas.some((area) => area.id === table.area_id && area.is_active)) && snapshot.services.some((service) => service.is_active);
  const canCreate = date >= restaurantDate() && date <= shiftDate(restaurantDate(), 365);
  function clearFilters() { setService(""); setArea(""); setStatus("all"); setQuery(""); }
  function reviewUncertain(targetDate: string = date) {
    if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return;
    setEditor(null); setSelectedId(null); setUncertainWrite(true); setNotice(null); clearFilters(); setView("book");
    if (targetDate !== date) setDate(targetDate); else void reload();
  }
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
              <div className={styles.heading}><div><p className={styles.kicker}>DEIN SERVICE. DEIN ÜBERBLICK.</p><h1>{spots.find((spot) => spot.spot_id === spotId)?.name ?? "Booking Console"}</h1></div>{spots.length > 1 && <label>Restaurant<select value={spotId} disabled={navigationDisabled} onChange={(event) => { clearFilters(); setSpotId(event.target.value); }}>{spots.map((spot) => <option value={spot.spot_id} key={spot.spot_id}>{spot.name}{spot.city ? " · " + spot.city : ""}</option>)}</select></label>}<button type="button" className={styles.secondary} aria-label="Aktualisieren" title="Aktualisieren" disabled={navigationDisabled} onClick={() => { setNotice(null); void reload(); }}>↻</button>{snapshot?.capabilities?.team_access && access.can_manage_team && <button className={styles.secondary + " " + styles.teamEntry} disabled={navigationDisabled} onClick={() => setTeamOpen(true)}>Team verwalten</button>}</div>
              <nav className={styles.tabs} aria-label="Booking Bereiche">{([["book", "Reservierungsbuch"], ["tables", "Tischübersicht"], ["setup", "Einrichtung"]] as const).filter(([key]) => key !== "setup" || access.can_manage).map(([key, label]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} disabled={navigationDisabled} onClick={() => setView(key)}>{label}{key === "setup" && dirty ? " · ungespeichert" : ""}</button>)}</nav>
              {snapshot?.capabilities?.team_access && <p className={styles.help}>Dein Zugang: {teamRoleLabels[access.role]}</p>}
              {accessWarning && <p className={styles.error} role="status">Der Zugriff konnte gerade nicht erneut geprüft werden. Jede Änderung wird weiterhin im Backend geprüft.</p>}
              {teamReview && <section className={styles.error} role="alert"><p>Eine Teamänderung kann bereits gespeichert sein. Prüfe die aktuellen Teamzugänge, bevor du sie nochmals änderst.</p><button className={styles.secondary} disabled={navigationDisabled} onClick={() => setTeamOpen(true)}>Team prüfen</button><button className={styles.secondary} onClick={() => setTeamReview(false)}>Teamstand geprüft</button></section>}
              {error && <div className={styles.error} role="alert">{error}<button className={styles.secondary} disabled={busy || dirty} onClick={() => void reload()}>Neu laden</button></div>}
              {snapshot && <section className={styles.help} aria-label="Datenstand"><p>{receivedAt ? "Zuletzt geladen: " + new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(receivedAt)) : ""} · automatische Prüfung alle 30 Sekunden bei geöffneter Übersicht.</p>{!online ? <p role="status">Offline · Du siehst den zuletzt geladenen Stand. Neue Erfassungen sind bis zur Aktualisierung gesperrt.</p> : syncFailed ? <p role="status">Aktualisierung fehlgeschlagen · Der angezeigte Stand kann veraltet sein. Lade die Übersicht neu, bevor du erneut erfasst.</p> : !canRefresh && <p>Automatische Aktualisierung während Einrichtung oder geöffnetem Dialog pausiert.</p>}</section>}
              {notice && <p className={styles.success} role="status">{notice}</p>}
              {uncertainWrite && <section className={styles.error} role="alert"><p>Eine Buchungsanfrage oder Änderung kann bereits gespeichert sein. Prüfe Buchungen, Tischkombinationen, Sperren und Sonderzeiten an den betroffenen Tagen, bei Nachtservices auch den Folgetag, bevor du erneut erfasst oder änderst.</p><div className={styles.actions}><button className={styles.secondary} disabled={navigationDisabled} onClick={() => void reload()}>Stand aktualisieren</button><button className={styles.secondary} onClick={() => setUncertainWrite(false)}>Stand geprüft</button></div></section>}
              {(loading || waitingForSnapshot) && <p role="status" className={styles.help}>Daten werden geladen …</p>}
              {snapshot && <>
                <div hidden={view !== "setup"}>{access.can_manage && <SetupForm key={spotId + ":" + (snapshot.settings?.revision ?? "new")} snapshot={snapshot} busy={busy || loading} onSave={save} onDirty={setDirty} />}</div>
                <div hidden={view === "setup"}>
                  <section className={styles.serviceBar} aria-label="Tageskontext">
                    <div className={styles.dateNavigation}><button className={styles.secondary} aria-label={isWeek ? "Vorherige Woche" : "Vorheriger Tag"} disabled={navigationDisabled} onClick={() => setDate(shiftDate(date, isWeek ? -7 : -1))}>←</button><label>Datum · Europe/Zurich<input type="date" required value={date} disabled={navigationDisabled} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label><button className={styles.secondary} aria-label={isWeek ? "Nächste Woche" : "Nächster Tag"} disabled={navigationDisabled} onClick={() => setDate(shiftDate(date, isWeek ? 7 : 1))}>→</button>{date !== restaurantDate() && <button className={styles.secondary} disabled={navigationDisabled} onClick={() => setDate(restaurantDate())}>Heute</button>}</div>
                    <div className={styles.contextFilters}><label>Service<select value={validService} disabled={navigationDisabled} onChange={(event) => setService(event.target.value)}><option value="">Alle Services</option>{snapshot.services.map((service) => <option key={service.id} value={service.id}>{service.name}{!service.is_active ? " (inaktiv)" : ""}</option>)}</select></label><label>Bereich<select value={validArea} disabled={navigationDisabled} onChange={(event) => setArea(event.target.value)}><option value="">Alle Bereiche</option>{snapshot.areas.map((area) => <option key={area.id} value={area.id}>{area.name}{!area.is_active ? " (inaktiv)" : ""}</option>)}</select></label></div>
                    {access.can_write && (readyToBook ? <button className={styles.primary} disabled={navigationDisabled || writeUnavailable || !canCreate || closedDay} title={!canCreate ? "Neue Buchungen sind für heute und die nächsten 365 Tage möglich." : undefined} onClick={() => setEditor({ tableId: "" })}>+ Neue Reservierung</button> : <button className={styles.primary} disabled={navigationDisabled || !access.can_manage} onClick={() => setView("setup")}>Einrichtung abschliessen</button>)}
                    {access.can_write && readyToBook && snapshot.capabilities?.walk_ins && <button className={styles.secondary} disabled={navigationDisabled || writeUnavailable} onClick={() => setWalkInOpen(true)}>+ Walk-in für jetzt</button>}
                  </section>
                  {unclosed.length > 0 && <section className={styles.unclosed} aria-label="Offene Besuche früherer Tage"><h2>Frühere Besuche prüfen</h2><p>Diese Besuche sind noch als «Am Tisch» erfasst. Prüfe, ob die Gäste noch da sind, und beende abgeschlossene Besuche. Ganzes Restaurant · zusätzlich zum gewählten Tag.</p><div className={styles.actions}>{unclosed.map((row) => <button className={styles.secondary} key={row.id} onClick={() => setSelectedId(row.id)}>{row.guest_name} · {bookingAllocationLabel(row, snapshot)} · {restaurantDate(new Date(row.starts_at))}</button>)}</div></section>}
                  {snapshot.capabilities?.table_combinations && access.can_manage && <button className={styles.secondary} disabled={navigationDisabled || writeUnavailable} onClick={() => setCombinationsOpen(true)}>Tischkombinationen verwalten</button>}
                  {view === "book" && snapshot.capabilities?.week_planning && <div className={styles.actions}><button className={styles.secondary} aria-pressed={!isWeek} onClick={() => setBookPeriod("day")}>Tag</button><button className={styles.secondary} aria-pressed={isWeek} onClick={() => setBookPeriod("week")}>Woche</button>{!isWeek && access.can_manage && <button className={styles.secondary} disabled={navigationDisabled || writeUnavailable || !canCreate || !access.can_manage} onClick={() => setClosureEditor({ date })}>+ Buchungssperre</button>}</div>}
                  {!isWeek && snapshot.capabilities?.special_hours && <section className={styles.hoursSummary} aria-label="Sonderzeiten im Tageskontext"><h2>Sonderzeiten</h2><p className={styles.help}>Services mit Beginn heute oder mit Fortsetzung aus dem Vortag. Reguläre Wochenzeiten gelten, wenn kein Eintrag angezeigt wird.</p>{snapshot.special_hours?.filter((h) => (!validService || h.service_id === validService) && (h.book_date === date || (h.next_day && h.ends_at && restaurantDate(new Date(h.ends_at)) >= date && restaurantTime(h.ends_at) !== "00:00"))).map((h) => <button className={styles.closureCard} key={h.id} disabled={navigationDisabled || writeUnavailable || !access.can_manage || h.book_date < shiftDate(restaurantDate(), -1)} onClick={() => setHoursEditor({ date: h.book_date, hours: h })}>{hoursLabel(h, snapshot)}</button>)}{access.can_manage && <button className={styles.secondary} disabled={navigationDisabled || writeUnavailable || !canCreate} onClick={() => setHoursEditor({ date })}>+ Sonderzeiten</button>}</section>}
                  {!isWeek && dayClosures.length > 0 && <section className={styles.unclosed} aria-label="Buchungssperren dieses Tages"><h2>Buchungssperren</h2><p>Bestehende Reservierungen bleiben erhalten. Neue Zuteilungen berücksichtigen diese Sperren.</p>{dayClosures.map((closure) => <button className={styles.closureCard} key={closure.id} disabled={navigationDisabled || writeUnavailable || !canCreate || !access.can_manage} onClick={() => setClosureEditor({ date, closure })}><strong>{closureLabel(closure, snapshot)}</strong>{closure.note && <span>{closure.note}</span>}<span>{closure.affected_reservations} bestehende aktive Reservierungen</span></button>)}</section>}
                  {isWeek ? <WeekOverview spotId={spotId} date={date} snapshot={snapshot} serviceId={validService} areaId={validArea} disabled={navigationDisabled || writeUnavailable || !access.can_manage} onDenied={denyAccess} onDate={(targetDate) => { setBookPeriod("day"); if (targetDate === date) void reload(); else setDate(targetDate); }} onHours={(date, hours) => setHoursEditor({ date, hours })} onEdit={(date, closure) => setClosureEditor({ date, closure })} /> : <>
                  <div className={styles.workspaceSummary}><div className={styles.workspaceHeading}><div><p className={styles.kicker}>{displayDate(date)}</p><h2>{view === "tables" ? "Deine Tische" : "Dein Reservierungsbuch"}</h2></div><p className={styles.help}>{filtered ? "Auswahl" : "Ganzer Tag"} · gespeicherte Buchungen</p></div>
                  <div className={styles.metrics} aria-label="Buchungsübersicht der Auswahl"><div><strong>{activeRows.length}</strong><span>Aktive Reservierungen</span></div><div><strong>{activeRows.reduce((sum, row) => sum + row.party_size, 0)}</strong><span>Gäste in aktiven Reservierungen</span></div><div><strong>{rows.filter((row) => row.status === "pending").length}</strong><span>Offene Anfragen</span></div></div></div>
                  {snapshot.capabilities?.service_lifecycle && <div className={styles.serviceProgress} aria-label="Service in der Auswahl">{(["arrived", "seated", "completed"] as const).map((stage) => <span key={stage}><strong>{rows.filter((row) => row.status === stage).reduce((sum, row) => sum + row.party_size, 0)}</strong> {stage === "arrived" ? "Gäste angekommen" : stage === "seated" ? "Gäste am Tisch" : "Gäste verabschiedet"}</span>)}<small>Manuell erfasster Servicestatus · Auswahl</small></div>}
                  {view === "book" && <div className={styles.bookFilters}><label>Gast suchen<input type="search" autoComplete="off" placeholder="Name suchen …" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="active">Aktive Reservierungen</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{filtered && <button className={styles.secondary} onClick={clearFilters}>Alle anzeigen</button>}</div>}
                  {view === "book" ? <section className={styles.book} aria-label="Reservierungen">
                    <div className={styles.bookColumns} aria-hidden="true"><span>Zeit</span><span>Gast</span><span>Personen</span><span>Bereich / Tisch</span><span>Status</span><span /></div>
                    {!visible.length ? <div className={styles.empty}><p className={styles.emptySymbol} aria-hidden="true">↗</p><h3>{filtered && snapshot.reservations.length ? "Keine Treffer für diese Filter." : "Ein freier Anfang."}</h3><p>{filtered && snapshot.reservations.length ? "Es gibt Buchungen an diesem Tag. Passe deine Auswahl an." : "Für diesen Tag wurden noch keine Reservierungen erfasst."}</p>{filtered && <button className={styles.secondary} onClick={clearFilters}>Filter zurücksetzen</button>}</div>
                      : <ul className={styles.bookRows}>{visible.map((row) => {
                        const table = snapshot.tables.find((table) => table.id === row.table_id);
                        return <li key={row.id}><button className={styles.bookRow} aria-label={"Reservierung von " + row.guest_name + " öffnen"} aria-describedby={"booking-time-" + row.id + " booking-party-" + row.id + " booking-table-" + row.id + " booking-status-" + row.id} onClick={() => setSelectedId(row.id)}><span id={"booking-time-" + row.id} className={styles.rowTime}><strong>{restaurantTime(row.starts_at, row.ends_at)}</strong><small>bis {restaurantTime(row.ends_at, row.starts_at)}</small></span><span className={styles.rowGuest}><strong>{row.guest_name}</strong><small>{row.note ? "Interner Hinweis" : row.source === "phone" ? "Telefon" : row.source === "email" ? "E-Mail" : row.source === "walk_in" ? "Vor Ort" : row.source === "website" ? "Online-Buchung" : "Betreiber"}</small></span><span id={"booking-party-" + row.id} className={styles.rowParty}>{row.party_size}<small> Personen</small></span><span id={"booking-table-" + row.id} className={styles.rowTable}>{bookingAllocationLabel(row, snapshot)}<small>{snapshot.areas.find((area) => area.id === table?.area_id)?.name ?? "Bereich"}</small>{row.allocation_ends_at && <small>Umplatziert · Belegung bis {restaurantTime(row.allocation_ends_at, row.allocation_starts_at ?? row.starts_at)}</small>}</span><span id={"booking-status-" + row.id} className={styles.status} data-status={row.status}>{statusLabels[row.status]}</span><span className={styles.rowArrow} aria-hidden="true">↗</span></button></li>;
                      })}</ul>}
                  </section> : <section aria-label="Tischübersicht">
                    <div className={styles.tableToolbar}><label>Belegung um<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>{time && <button className={styles.secondary} onClick={() => setTime("")}>Ganzer Tag</button>}<p className={styles.help}>{time ? "Geplante Belegung mit verbleibender Dauer nach Tischwechseln. Bei der Zeitumstellung werden beide Vorkommen der gewählten Uhrzeit berücksichtigt. Der Servicestatus zeigt den letzten gespeicherten Stand." : "Aktive Reservierungen über den ganzen Tag. Freie Buchungszeiten werden bei der Erfassung geprüft."}</p></div>
                    {filtered && <button className={styles.secondary} onClick={clearFilters}>Alle Bereiche und Services</button>}
                    {snapshot.capabilities?.table_layouts && <><div className={styles.actions}><button className={styles.secondary} aria-pressed={!planVisible} onClick={() => setPlanVisible(false)}>Tischkarten</button><button className={styles.secondary} aria-pressed={planVisible} onClick={() => setPlanVisible(true)}>Tischplan</button></div>{planVisible && <TablePlan snapshot={snapshot} areaId={validArea} onEdit={() => setPlanOpen(true)} describe={(id) => { const seated = currentSeated.find((row) => bookingTableIds(row).includes(id)); const planned = context.filter((row) => bookingTableIds(row).includes(id) && active(row.status) && bookingAtLocalTime(row, date, time)); return (seated ? "Am Tisch · letzter gespeicherter Servicestatus. " : "") + planned.length + " geplante Reservierungen"; }} />}</>}
                    {snapshot.areas.filter((area) => !validArea || area.id === validArea).map((area) => <section className={styles.areaSection} key={area.id}><h3>{area.name}{!area.is_active ? " · nicht buchbar" : ""}</h3><div className={styles.tableGrid}>{snapshot.tables.filter((table) => table.area_id === area.id).map((table) => {
                      const reservations = context.filter((row) => bookingTableIds(row).includes(table.id) && active(row.status) && bookingAtLocalTime(row, date, time));
                      const seated = currentSeated.find((row) => bookingTableIds(row).includes(table.id));
                      return <article className={styles.tableCard} key={table.id} data-occupied={!!reservations.length || !!seated}><div className={styles.panelHeading}><h4>{table.label}</h4><span>{table.seats} Plätze</span></div><p>{!table.is_active || !area.is_active ? "Nicht buchbar" : reservations.length ? reservations.length + (reservations.length === 1 ? " Reservierung" : " Reservierungen") : seated ? "Servicestatus bitte prüfen" : "Keine Reservierung"}</p>{seated && <button className={styles.tableBooking} aria-label={"Laufenden Besuch von " + seated.guest_name + " öffnen"} onClick={() => setSelectedId(seated.id)}><strong>Am Tisch · {seated.guest_name}</strong><span>{seated.party_size} Personen{bookingTableIds(seated).length > 1 ? " in der Tischgruppe" : ""} · letzter gespeicherter Servicestatus</span>{seated.allocation_ends_at && <span>Umplatziert · voraussichtlich bis {restaurantTime(seated.allocation_ends_at, seated.allocation_starts_at ?? seated.starts_at)}</span>}</button>}{reservations.map((row) => <button key={row.id} className={styles.tableBooking} onClick={() => setSelectedId(row.id)}><strong>{restaurantTime(row.allocation_starts_at ?? row.starts_at, row.allocation_ends_at ?? row.ends_at)} · {row.guest_name}</strong><span>{row.party_size} Personen{bookingTableIds(row).length > 1 ? " in der Tischgruppe" : ""} · {statusLabels[row.status]}</span></button>)}<button className={styles.secondary} disabled={navigationDisabled || writeUnavailable || !access.can_write || !canCreate || !readyToBook || !table.is_active || !area.is_active} onClick={() => setEditor({ tableId: table.id })}>Zeit für {table.label} prüfen</button></article>;
                    })}</div></section>)}
                    {!snapshot.areas.length && <div className={styles.empty}><h3>Noch keine Bereiche.</h3><p>Lege Bereiche und Tische in der Einrichtung an.</p></div>}
                  </section>}
                  </>}
                </div>
                {combinationsOpen && access.can_manage && <TableCombinations spotId={spotId} snapshot={snapshot} onBusy={actorBusy} onDenied={denyAccess} onReload={async () => { if (currentActor === actorId.current && currentEntry === entryGeneration.current) await reload(); }} onClose={(uncertain) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setCombinationsOpen(false); if (uncertain) { setUncertainWrite(true); setNotice(null); } void reload(); }} />}
                {teamOpen && access.can_manage_team && <TeamConsole spotId={spotId} onDenied={denyAccess} onBusy={actorBusy} onClose={(uncertain) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setTeamOpen(false); if (uncertain) setTeamReview(true); void reload(); }} />}
                {closureEditor && access.can_manage && <ClosureEditor spotId={spotId} date={closureEditor.date} closure={closureEditor.closure} snapshot={snapshot} onBusy={actorBusy} onClose={(uncertain, targetDate) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setClosureEditor(null); setHoursEditor(null); setCombinationsOpen(false); if (uncertain) { setUncertainWrite(true); setNotice(null); if (targetDate !== date) { setDate(targetDate); return; } } void reload(); }} onSaved={async (targetDate, removed) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setClosureEditor(null); setHoursEditor(null); setCombinationsOpen(false); const message = removed ? "Die Buchungssperre wurde aufgehoben." : "Die Buchungssperre wurde gespeichert. Bestehende Reservierungen bleiben erhalten."; if (targetDate !== date) { createdNotice.current = message; setDate(targetDate); } else { setNotice(message); await reload(); } }} />}
                {hoursEditor && access.can_manage && <ServiceHoursEditor key={spotId + ":" + (hoursEditor.hours?.id ?? hoursEditor.date)} spotId={spotId} date={hoursEditor.date} hours={hoursEditor.hours} serviceId={validService} snapshot={snapshot} onBusy={actorBusy} onDenied={denyAccess} onClose={(uncertain, targetDate) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setHoursEditor(null); setCombinationsOpen(false); if (uncertain) { setUncertainWrite(true); setNotice(null); if (targetDate !== date) { setDate(targetDate); return; } } void reload(); }} onSaved={async (targetDate, archived) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setHoursEditor(null); setCombinationsOpen(false); const message = archived ? "Der Sonderzeiten-Eintrag wurde aufgehoben." : "Die Sonderzeiten wurden gespeichert. Bestehende Reservierungen bleiben erhalten."; if (targetDate !== date) { createdNotice.current = message; setDate(targetDate); } else { setNotice(message); await reload(); } }} />}
                {planOpen && access.can_manage && <TablePlanEditor spotId={spotId} snapshot={snapshot} initialArea={validArea} onBusy={actorBusy} onClose={() => { setPlanOpen(false); void reload(); }} onSaved={async () => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setPlanOpen(false); setNotice("Der Tischplan wurde gespeichert."); await reload(); }} />}
                {editor && access.can_write && <NewReservation spotId={spotId} date={date} serviceId={validService} areaId={validArea} tableId={editor.tableId} time={time} snapshot={snapshot} onClose={(uncertain, date) => { if (uncertain) reviewUncertain(date); else setEditor(null); }} onBusy={actorBusy} onCreated={(booking) => savedBooking(booking, "Die Reservierung wurde gespeichert.")} />}
                {walkInOpen && access.can_write && <WalkIn spotId={spotId} snapshot={snapshot} serviceId={validService} areaId={validArea} onBusy={actorBusy} onClose={(uncertain) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setWalkInOpen(false); if (uncertain) { setUncertainWrite(true); setNotice(null); clearFilters(); setView("book"); followOperatingDate.current = true; void reload(); } }} onSaved={async (date, slot) => { if (currentActor !== actorId.current || currentEntry !== entryGeneration.current) return; setWalkInOpen(false); await savedBooking({ date, slot }, "Der Walk-in wurde erfasst."); }} />}
                {selected && <ReservationDetails onTransferred={async () => { if (currentActor === actorId.current && currentEntry === entryGeneration.current) { setNotice("Der Gast wurde umplatziert."); await reload(); } }} onDenied={denyAccess} onUncertain={reviewUncertain} key={selected.id} spotId={spotId} reservation={selected} snapshot={snapshot} onClose={() => setSelectedId(null)} onBusy={actorBusy} onAmended={(date, slot) => savedBooking({ date, slot }, "Die Änderungen wurden gespeichert.")} onReload={async () => { if (currentActor === actorId.current && currentEntry === entryGeneration.current) await reload(); }} onSaved={async () => { if (currentActor === actorId.current && currentEntry === entryGeneration.current) { setNotice("Der Status wurde gespeichert."); await reload(); } }} />}
              </>}
            </>}
    </div>
  </main>;
}
