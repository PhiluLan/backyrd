"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { bookingError, bookingReadDenied, bookingWriteUncertain, readGuestCard, readGuestCards, validateGuestCardIntent, writeGuestCard, type BookingAccess, type BookingGuestCard, type GuestCardDetails, type GuestCardIntent, type GuestCardOutcome, type GuestCardPage } from "@/lib/booking-api";
import { GuestReservationHistory } from "./guest-reservation-history";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

export type GuestContactCopy = { name: string; contact: string; card?: { id: string; revision: number } };
const displayTime = (value: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(value));
const uncertainHelp = "Die Gästekarte kann bereits gespeichert sein. Beim Verlassen werden nur die lokalen Eingaben entfernt. Prüfe danach die aktuelle Gästeliste.";

function useGuestMutation(spotId: string, actorId: string, isCurrent: () => boolean, onBusy: (busy: boolean) => void, onDenied: () => void, onSaved: (outcome: GuestCardOutcome) => void) {
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef(true), inFlight = useRef(false), frozen = useRef<{ requestId: string; intent: GuestCardIntent; dispatched: boolean } | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function execute(input: GuestCardIntent) {
    if (inFlight.current || !isCurrent()) return;
    if (!frozen.current) {
      try { frozen.current = { requestId: crypto.randomUUID(), intent: validateGuestCardIntent(input), dispatched: false }; }
      catch { setError("Prüfe Name, E-Mail und Telefon."); return; }
    }
    const request = frozen.current;
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    let acknowledged = false;
    try {
      const prior = await writeGuestCard(spotId, request.requestId, request.intent, actorId, true);
      if (!active.current || !isCurrent()) return;
      let result = prior;
      if (!result) { request.dispatched = true; result = await writeGuestCard(spotId, request.requestId, request.intent, actorId); }
      if (!active.current || !result) return;
      acknowledged = true; setUncertain(false); onSaved(result);
    } catch (error) {
      if (!active.current || !isCurrent()) return;
      if (bookingReadDenied(error)) { onDenied(); return; }
      if (acknowledged) setError("Die Anfrage ist gespeichert. Der aktuelle Stand konnte noch nicht geladen werden.");
      else {
        setError(bookingError(error));
        if (uncertain || (request.dispatched && bookingWriteUncertain(error))) setUncertain(true);
        else frozen.current = null;
      }
    } finally { inFlight.current = false; if (active.current) setBusy(false); onBusy(false); }
  }
  return { busy, uncertain, error, execute, clearError: () => setError(null), retry: () => { if (frozen.current) void execute(frozen.current.intent); } };
}

export function GuestCards({ spotId, actorId, isCurrent, online, access, canBook, historyEnabled, onReservation, onClose, onUse, onBusy, onDenied }: {
  spotId: string; actorId: string; isCurrent: () => boolean; online: boolean; access: BookingAccess; canBook: boolean; historyEnabled: boolean; onReservation: (row: { id: string; starts_at: string }) => void; onClose: () => void; onUse: (copy: GuestContactCopy) => void; onBusy: (busy: boolean) => void; onDenied: () => void;
}) {
  const [mode, setMode] = useState<"list" | "detail" | "edit">("list"), [selected, setSelected] = useState<BookingGuestCard | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(""), queryRef = useRef("");
  const [archived, setArchived] = useState(false), [refresh, setRefresh] = useState(0), [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState<GuestCardPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const cancelRead = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const load = useCallback(async (q: string, isArchived: boolean, cursor: GuestCardPage["next_cursor"]) => {
    if (!isCurrent()) return;
    const request = ++generation.current; controller.current?.abort(); controller.current = new AbortController();
    setLoading(true); setError(null);
    try { const result = await readGuestCards(spotId, q, isArchived, cursor, controller.current.signal); if (request === generation.current && isCurrent()) setPage(result); }
    catch (error) { if (request === generation.current && isCurrent()) { if (bookingReadDenied(error)) onDenied(); else setError(bookingError(error)); } }
    finally { if (request === generation.current && isCurrent()) setLoading(false); }
  }, [spotId, onDenied, isCurrent]);
  useEffect(() => {
    if (mode !== "list") return;
    setPage(null);
    if (online) void load(queryRef.current, archived, null);
    else { setLoading(false); setError("Offline. Verbinde dich, um aktuelle Gästekarten zu laden."); }
    return cancelRead;
  }, [mode, online, archived, refresh, load, cancelRead]);
  const back = (unknown = false) => { setMode("list"); setSelected(null); setRefresh(value => value + 1); setNotice(unknown ? "Der Speicherstatus einer Anfrage ist unklar. Prüfe die aktuelle Gästeliste, bevor du eine weitere Karte anlegst." : null); };
  const saved = (outcome: GuestCardOutcome) => { setSelectedId(outcome.id); setSelected(null); setMode("detail"); setRefresh(value => value + 1); setNotice("Die Anfrage zur Gästekarte wurde gespeichert."); };
  if (mode === "edit") return <GuestCardEditor key={selected?.id ?? "new"} spotId={spotId} actorId={actorId} isCurrent={isCurrent} guest={selected} online={online} onBusy={onBusy} onDenied={onDenied} onSaved={saved} onBack={unknown => { if (selected && !unknown) { setMode("detail"); setRefresh(value => value + 1); } else back(unknown); }} />;
  if (mode === "detail" && selectedId) return <GuestCardView historyEnabled={historyEnabled} onReservation={onReservation} key={`${selectedId}:${refresh}`} spotId={spotId} actorId={actorId} isCurrent={isCurrent} id={selectedId} online={online} access={access} canBook={canBook} notice={notice} onBusy={onBusy} onDenied={onDenied} onSaved={saved} onBack={back} onEdit={guest => { setSelected(guest); setMode("edit"); }} onUse={onUse} />;
  function submit(event: FormEvent) { event.preventDefault(); setRefresh(value => value + 1); }
  return <ConsolePanel title="Gästekarten" onClose={onClose}>
    <div className={styles.drawerBody}>
      <p className={styles.help}>Kontaktdaten für dieses Restaurant · gleiche Namen oder Kontakte werden nicht automatisch zusammengeführt. Angaben sind vom Team erfasst.</p>
      {notice && <p role="status" className={styles.help}>{notice}</p>}
      <form className={styles.searchForm} onSubmit={submit}><label>Name oder Kontakt<input data-initial-focus type="search" autoComplete="off" value={query} maxLength={640} onChange={event => { queryRef.current = event.target.value; setQuery(event.target.value); generation.current++; controller.current?.abort(); setPage(null); setLoading(false); setError(null); }} /></label><div className={styles.actions}><button type="submit" className={styles.secondary} disabled={!online || loading}>Gästekarten suchen</button>{access.can_write && <button type="button" className={styles.primary} disabled={!online} onClick={() => { setSelected(null); setMode("edit"); }}>+ Gästekarte</button>}</div></form>
      {access.can_manage && <label className={styles.checkbox}><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Archivierte Karten anzeigen</label>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p role="status" className={styles.help}>{loading ? "Gästekarten werden geladen …" : page ? page.guests.length ? `${page.guests.length} Karten auf dieser Seite · zuletzt geändert zuerst${page.next_cursor ? " · weitere vorhanden" : ""}` : "Keine Gästekarten für diese Auswahl vorhanden." : "Suche, um aktuelle Gästekarten zu laden."}</p>
      {page && <ul className={styles.searchResults}>{page.guests.map(guest => <li key={guest.id}><button type="button" className={styles.secondary} disabled={loading || !online} aria-label={`Gästekarte von ${guest.name} öffnen`} onClick={() => { setSelectedId(guest.id); setNotice(null); setMode("detail"); }}><strong>{guest.name}</strong>{guest.email && <span>{guest.email}</span>}{guest.phone && <span>{guest.phone}</span>}{!guest.email && !guest.phone && <span>Keine Kontaktdaten erfasst</span>}<span>Geändert: {displayTime(guest.updated_at)}</span></button></li>)}</ul>}
      <div className={styles.actions}>{page?.next_cursor && <button type="button" className={styles.secondary} disabled={loading || !online} onClick={() => void load(queryRef.current, archived, page.next_cursor)}>Nächste 25 Karten</button>}{page && <button type="button" className={styles.secondary} disabled={loading || !online} onClick={() => setRefresh(value => value + 1)}>Liste neu laden</button>}</div>
    </div>
  </ConsolePanel>;
}

function GuestCardEditor({ spotId, actorId, isCurrent, guest, online, onBusy, onDenied, onSaved, onBack }: {
  spotId: string; actorId: string; isCurrent: () => boolean; guest: BookingGuestCard | null; online: boolean; onBusy: (busy: boolean) => void; onDenied: () => void; onSaved: (outcome: GuestCardOutcome) => void; onBack: (unknown: boolean) => void;
}) {
  const [id] = useState(() => guest?.id ?? crypto.randomUUID());
  const [name, setName] = useState(guest?.name ?? ""), [email, setEmail] = useState(guest?.email ?? ""), [phone, setPhone] = useState(guest?.phone ?? ""), [dirty, setDirty] = useState(false);
  const mutation = useGuestMutation(spotId, actorId, isCurrent, onBusy, onDenied, onSaved);
  const intent: GuestCardIntent = { kind: "save", id, revision: guest?.revision ?? null, name, email: email || null, phone: phone || null };
  let valid = true; try { validateGuestCardIntent(intent); } catch { valid = false; }
  function submit(event: FormEvent) { event.preventDefault(); if (online && (valid || mutation.uncertain)) void mutation.execute(intent); }
  return <ConsolePanel title={guest ? "Gästekarte bearbeiten" : "Neue Gästekarte"} dirty={dirty} busy={mutation.busy} uncertain={mutation.uncertain} uncertainHelp={uncertainHelp} onClose={() => onBack(mutation.uncertain)}>
    <form className={styles.editorForm} onSubmit={submit}>
      <div className={styles.drawerBody}><p className={styles.help}>Erfasse nur die Angaben, die du für die Betreuung dieses Gastes benötigst. Die Karte wird in diesem Restaurant gespeichert.</p>
        <fieldset className={styles.fieldset} disabled={mutation.busy || mutation.uncertain}><div className={styles.searchForm}>
          <label>Name<input data-initial-focus value={name} required maxLength={240} autoComplete="off" onChange={event => { setName(event.target.value); setDirty(true); }} /></label>
          <label>E-Mail<input type="email" value={email} maxLength={640} autoComplete="off" onChange={event => { setEmail(event.target.value); setDirty(true); }} /></label>
          <label>Telefon<input type="tel" value={phone} maxLength={160} autoComplete="off" onChange={event => { setPhone(event.target.value); setDirty(true); }} /></label>
        </div></fieldset>
        {!online && <p className={styles.help} role="status">Offline · deine Eingaben bleiben erhalten. Speichern ist mit bestehender Verbindung möglich.</p>}
        {mutation.error && <p className={styles.error} role="alert">{mutation.error}{mutation.uncertain && " Der Speicherstatus ist unklar. Eingaben bleiben gesperrt; geprüft oder wiederholt wird ausschliesslich dieselbe Anfrage."}</p>}
        {mutation.error && !mutation.uncertain && <button type="button" className={styles.secondary} disabled={mutation.busy} onClick={() => onBack(false)}>Entwurf verwerfen und aktuellen Stand öffnen</button>}
      </div>
      <footer className={styles.editorFooter}><span>Kontaktdaten · ohne automatische Buchungszuordnung</span><button className={styles.primary} type="submit" disabled={mutation.busy || !online || (!mutation.uncertain && !valid)}>{mutation.busy ? "Speichert …" : mutation.uncertain ? "Anfrage prüfen" : "Gästekarte speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}

function GuestCardView({ spotId, actorId, isCurrent, id, online, access, canBook, notice, historyEnabled, onReservation, onBusy, onDenied, onSaved, onBack, onEdit, onUse }: {
  spotId: string; actorId: string; isCurrent: () => boolean; id: string; online: boolean; access: BookingAccess; canBook: boolean; notice: string | null; historyEnabled: boolean; onReservation: (row: { id: string; starts_at: string }) => void; onBusy: (busy: boolean) => void; onDenied: () => void; onSaved: (outcome: GuestCardOutcome) => void; onBack: (unknown: boolean) => void; onEdit: (guest: BookingGuestCard) => void; onUse: (copy: GuestContactCopy) => void;
}) {
  const [details, setDetails] = useState<GuestCardDetails | null>(null), [error, setError] = useState<string | null>(null), [refresh, setRefresh] = useState(0), [archiveReview, setArchiveReview] = useState(false), [contactChoice, setContactChoice] = useState("phone");
  const mutation = useGuestMutation(spotId, actorId, isCurrent, onBusy, onDenied, onSaved);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    if (!online || !isCurrent()) return;
    void readGuestCard(spotId, id, controller.signal).then(result => { if (active && isCurrent()) { setDetails(result); setError(null); } }).catch(error => { if (active && isCurrent()) { if (bookingReadDenied(error)) onDenied(); else setError(bookingError(error)); } });
    return () => { active = false; controller.abort(); };
  }, [spotId, id, online, refresh, onDenied, isCurrent]);
  useEffect(() => {
    const offline = () => { setDetails(null); setError(null); };
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);
  const readError = online ? error : "Offline. Verbinde dich, um die aktuelle Gästekarte zu laden.";
  const guest = online ? details?.guest : null;
  const chosen = contactChoice === "email" && guest?.email ? "email" : guest?.phone ? "phone" : "email";
  const contact = chosen === "phone" ? guest?.phone ?? "" : guest?.email ?? "";
  const actionLabels = { created: "Gästekarte angelegt", updated: "Kontaktdaten geändert", archived: "Gästekarte archiviert", restored: "Gästekarte wiederhergestellt" };
  const fieldLabels = { name: "Name", email: "E-Mail", phone: "Telefon", is_archived: "Archivstatus" };
  return <ConsolePanel title="Gästekarte" busy={mutation.busy} uncertain={mutation.uncertain} uncertainHelp={uncertainHelp} onClose={() => onBack(mutation.uncertain)}>
    <div className={styles.drawerBody}>
      {notice && <p role="status" className={styles.help}>{notice}</p>}
      {readError && <div><p role="alert" className={styles.error}>{readError}</p><button type="button" className={styles.secondary} disabled={!online || mutation.busy} onClick={() => { setDetails(null); setError(null); setRefresh(value => value + 1); }}>Gästekarte neu laden</button></div>}
      {mutation.error && <p id="guest-card-write-error" role="alert" className={styles.error}>{mutation.error}{mutation.uncertain && " Der Speicherstatus ist unklar. Prüfe dieselbe Anfrage, bevor du weitere Aktionen ausführst."}</p>}
      {mutation.uncertain && <button autoFocus type="button" className={styles.primary} aria-describedby="guest-card-write-error" disabled={mutation.busy || !online} onClick={mutation.retry}>Anfrage prüfen</button>}
      {mutation.error && !mutation.uncertain && !readError && <button type="button" className={styles.primary} disabled={mutation.busy || !online} onClick={() => { mutation.clearError(); setArchiveReview(false); setDetails(null); setError(null); setRefresh(value => value + 1); }}>Gästekarte neu laden</button>}
      {!guest && !readError && <p role="status" className={styles.help}>Gästekarte wird geladen …</p>}
      {guest && <><h3 className={styles.cardHeading}>{guest.name}</h3><p className={styles.help}>{guest.is_archived ? "Archiviert · Daten bleiben gespeichert" : "Aktive Gästekarte"} · vom Team erfasste Angaben</p><dl className={styles.cardContact}><dt>E-Mail</dt><dd>{guest.email ?? "Nicht erfasst"}</dd><dt>Telefon</dt><dd>{guest.phone ?? "Nicht erfasst"}</dd><dt>Zuletzt geändert</dt><dd>{displayTime(guest.updated_at)}</dd></dl>
        {!mutation.uncertain && <>
          {!guest.is_archived && access.can_write && <button type="button" className={styles.secondary} disabled={mutation.busy || !online} onClick={() => onEdit(guest)}>Gästekarte bearbeiten</button>}
          {!guest.is_archived && access.can_write && !archiveReview && <section className={styles.cardCopy} aria-label="Kontaktdaten übernehmen"><h4>Neue Reservierung</h4><p className={styles.help}>Die Angaben werden in die neue Reservierung kopiert und können dort angepasst werden. Bestehende Reservierungen behalten ihre Angaben.</p>{guest.email && guest.phone && <fieldset className={styles.fieldset}><legend>Kontakt für die Reservierung</legend><div className={styles.actions}><label className={styles.checkbox}><input type="radio" name="guest-contact-copy" value="phone" checked={chosen === "phone"} onChange={() => setContactChoice("phone")} />Telefon</label><label className={styles.checkbox}><input type="radio" name="guest-contact-copy" value="email" checked={chosen === "email"} onChange={() => setContactChoice("email")} />E-Mail</label></div></fieldset>}<button type="button" className={styles.primary} disabled={!canBook || !online || mutation.busy} onClick={() => onUse({ name: guest.name, contact, card: { id: guest.id, revision: guest.revision } })}>Für Reservierung übernehmen</button>{!canBook && <p className={styles.help}>Öffne einen buchbaren Tag im aktuellen Reservierungsbuch, um diese Angaben zu übernehmen.</p>}</section>}
          {access.can_manage && <section className={styles.cardCopy} aria-label="Gästekarte archivieren oder wiederherstellen"><button type="button" className={styles.secondary} disabled={mutation.busy || !online} onClick={() => setArchiveReview(value => !value)}>{guest.is_archived ? "Wiederherstellen" : "Archivieren"}</button>{archiveReview && <div><p className={styles.help}>{guest.is_archived ? "Die Karte erscheint wieder in der aktiven Gästeliste." : "Die Karte verschwindet aus der aktiven Gästeliste. Die Daten bleiben gespeichert; Manager und Inhaber können sie wiederherstellen."} Bestehende Reservierungen bleiben unverändert.</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={mutation.busy || !online || !!mutation.error} onClick={() => void mutation.execute({ kind: "archive", id, revision: guest.revision, archived: !guest.is_archived })}>{guest.is_archived ? "Wiederherstellen bestätigen" : "Archivieren bestätigen"}</button><button type="button" className={styles.secondary} disabled={mutation.busy} onClick={() => setArchiveReview(false)}>Abbrechen</button></div></div>}</section>}
        </>}
        {historyEnabled && <GuestReservationHistory spotId={spotId} guestId={id} online={online} disabled={mutation.busy || mutation.uncertain} isCurrent={isCurrent} onDenied={onDenied} onOpen={onReservation} />}
        <details className={styles.editorDetails}><summary>Letzte Änderungen</summary><section aria-label="Letzte Änderungen der Gästekarte"><p className={styles.help}>Höchstens 20 Einträge · frühere Kontaktwerte werden hier nicht gespeichert.</p>{details!.events.length ? <ul className={styles.cardEvents}>{details!.events.map(event => <li key={event.id}><strong>{actionLabels[event.action]}</strong><span>{event.changed_fields.map(field => fieldLabels[field]).join(", ")} · {displayTime(event.created_at)}</span></li>)}</ul> : <p className={styles.help}>Noch keine Änderungen erfasst.</p>}</section></details>
      </>}
    </div>
  </ConsolePanel>;
}
