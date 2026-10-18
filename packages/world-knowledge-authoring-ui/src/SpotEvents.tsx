"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const categories = { MUSIC: "Musik", NIGHTLIFE: "Party & Nachtleben", ART: "Kunst", THEATRE: "Theater", FILM: "Film", FOOD_DRINK: "Essen & Trinken", FAMILY: "Familie", SPORT: "Sport", ACTIVITY: "Mitmachen", LEISURE: "Freizeit", MARKET: "Markt", WORKSHOP: "Workshop", COMMUNITY: "Zusammenkommen", OTHER: "Sonstiges" };
type Recurrence = { startDate: string; startTime: string; endTime: string; frequency: string; interval: number; until: string | null };
type SpotEvent = {
  requestId?: string; id: string; title: string; description: string | null; status: string; submitted: boolean | null;
  updatedAt: string; editable: boolean; categories: string[]; activities: string[]; tags: string[];
  free: boolean | null; price: number | null; minimumAge: number | null; familyFriendly: boolean | null;
  organizer: string | null; externalUrl: string | null; recurrence: Recurrence | null;
};
export type SpotEventRpc = (name: "list_spot_events_v1" | "save_spot_event_v1", args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const blank = (): SpotEvent => ({ requestId: crypto.randomUUID(), id: "", title: "", description: "", status: "DRAFT", submitted: false, updatedAt: "", editable: true, categories: [], activities: [], tags: [], free: null, price: null, minimumAge: null, familyFriendly: null, organizer: "", externalUrl: "", recurrence: { startDate: localToday(), startTime: "18:00", endTime: "22:00", frequency: "ONCE", interval: 1, until: null } });
const statusLabel = (row: SpotEvent) => row.status === "DRAFT" ? row.submitted ? "Wartet auf Freigabe" : "Entwurf" : ({ PUBLISHED: "Veröffentlicht", SCHEDULED: "Veröffentlicht", CANCELLED: "Abgesagt", ENDED: "Beendet", POSTPONED: "Verschoben" }[row.status] ?? row.status);
const failure = (message: string) => message.includes("spot_event_changed") ? "Dieses Event wurde inzwischen geändert. Lade die Liste neu, bevor du es erneut bearbeitest. Dein Entwurf bleibt erhalten." : message.includes("forbidden") || message.includes("not allowed") ? "Du darfst dieses Event nicht bearbeiten. Prüfe, ob dir der Spot noch zugeordnet ist." : "Das Event konnte nicht gespeichert werden. Prüfe Datum und Angaben und versuche es erneut. Dein Entwurf bleibt erhalten.";
function parseRows(value: unknown): SpotEvent[] {
  const text = (input: unknown): input is string => typeof input === "string";
  const strings = (input: unknown): input is string[] => Array.isArray(input) && input.every(text);
  const nullableText = (input: unknown): input is string | null => input === null || text(input);
  const nullableNumber = (input: unknown): input is number | null => input === null || typeof input === "number" && Number.isFinite(input);
  const nullableBoolean = (input: unknown): input is boolean | null => input === null || typeof input === "boolean";
  if (!Array.isArray(value)) throw new Error("invalid_event_list");
  return value.map((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid_event_list");
    const row = input as Record<string, unknown>;
    const rule = row.recurrence;
    let recurrence: Recurrence | null = null;
    if (rule !== null) {
      if (!rule || typeof rule !== "object") throw new Error("invalid_event_schedule");
      const r = rule as Record<string, unknown>;
      if (!text(r.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(r.startDate) || !Number.isFinite(Date.parse(r.startDate)) || !text(r.startTime) || !text(r.endTime) || !text(r.frequency) || typeof r.interval !== "number" || !nullableText(r.until)) throw new Error("invalid_event_schedule");
      recurrence = { startDate: r.startDate, startTime: r.startTime, endTime: r.endTime, frequency: r.frequency, interval: r.interval, until: r.until };
    }
    if (!text(row.id) || !text(row.title) || !text(row.status) || !text(row.updatedAt) || typeof row.editable !== "boolean" || !nullableText(row.description) || !strings(row.categories) || !strings(row.activities) || !strings(row.tags) || !nullableBoolean(row.submitted) || !nullableBoolean(row.free) || !nullableBoolean(row.familyFriendly) || !nullableNumber(row.price) || !nullableNumber(row.minimumAge) || !nullableText(row.organizer) || !nullableText(row.externalUrl)) throw new Error("invalid_event_list");
    return { id: row.id, title: row.title, status: row.status, updatedAt: row.updatedAt, editable: row.editable, description: row.description, categories: row.categories, activities: row.activities, tags: row.tags, submitted: row.submitted, free: row.free, familyFriendly: row.familyFriendly, price: row.price, minimumAge: row.minimumAge, organizer: row.organizer, externalUrl: row.externalUrl, recurrence };
  });
}

export function SpotEvents({ spotId, admin, rpc, formatTags }: { spotId: string; admin: boolean; rpc: SpotEventRpc; formatTags: Readonly<Record<string, string>> }) {
  const [rows, setRows] = useState<SpotEvent[]>([]);
  const [draft, setDraft] = useState<SpotEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const loadVersion = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const result = await rpc("list_spot_events_v1", { p_spot_id: spotId });
      if (version !== loadVersion.current) return false;
      if (result.error) throw result.error;
      setRows(parseRows(result.data));
      return true;
    } catch { if (version !== loadVersion.current) return false; setError("Die Events konnten nicht geladen werden. Bitte versuche es erneut."); return false; }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [spotId, rpc]);
  useEffect(() => { setDraft(null); setRows([]); setError(""); void load(); return () => { loadVersion.current += 1; }; }, [load]);
  useEffect(() => {
    if (!draft) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [draft]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(""), 2000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [draft?.id]);
  const set = <K extends keyof SpotEvent>(key: K, value: SpotEvent[K]) => setDraft(current => current ? { ...current, [key]: value } : null);
  const schedule = (patch: Partial<Recurrence>) => setDraft(current => current ? { ...current, recurrence: { ...blank().recurrence!, ...current.recurrence, ...patch } } : null);
  function open(row: SpotEvent) { setError(""); setDraft({ ...row, recurrence: row.recurrence ?? blank().recurrence }); }
  async function save(action: "DRAFT" | "SUBMIT" | "PUBLISH" | "CANCEL") {
    if (!draft || busy) return;
    if (action !== "CANCEL" && (!draft.title.trim() || !draft.categories.length || !draft.recurrence?.startDate || !draft.recurrence.startTime || !draft.recurrence.endTime)) return setError("Bitte ergänze Titel, Kategorie, Datum und Uhrzeiten.");
    if (action !== "CANCEL" && (draft.categories.length > 12 || draft.activities.filter(a => a.trim()).length > 32 || draft.activities.some(a => a.trim().length > 160))) return setError("Wähle höchstens 12 Kategorien und trage maximal 32 Aktivitäten mit jeweils bis zu 160 Zeichen ein.");
    if (action === "CANCEL" && !window.confirm("Dieses Event und alle zugehörigen Termine absagen?")) return;
    setBusy(true); setError("");
    try {
      const { data, error: saveError } = await rpc("save_spot_event_v1", { p_spot_id: spotId, p_event_id: draft.id || null, p_expected_updated_at: draft.updatedAt || null, p_action: action, p_input: { ...draft, activities: draft.activities.map(a => a.trim()).filter(Boolean) } });
      if (saveError || typeof data !== "string") throw saveError ?? new Error("invalid_save_result");
      setDraft(null);
      setMessage(action === "SUBMIT" ? "Zur Prüfung eingereicht." : action === "PUBLISH" ? "Event veröffentlicht." : action === "CANCEL" ? "Event abgesagt." : "Entwurf gespeichert.");
      await load();
    } catch (e) { setError(failure(e && typeof e === "object" && "message" in e ? String(e.message) : "")); }
    finally { setBusy(false); }
  }
  return <section className="spot-events" aria-label="Events & Veranstaltungen">
    <header><div><span className="spot-events-eyebrow">BEI DIESEM SPOT</span><h2>Events & Veranstaltungen</h2><p>Was steht an? Halte einzelne Termine und regelmässige Veranstaltungen hier fest.</p></div>{!draft && <button type="button" className="spot-events-primary" disabled={loading} onClick={() => open(blank())}>+ Event hinzufügen</button>}</header>
    <p className="spot-events-help">{admin ? "Veröffentlichte Events erscheinen in der App und können bei passenden Suchanfragen vorgeschlagen werden." : "Speichere zunächst einen Entwurf oder reiche dein Event zur Prüfung ein. Nach der Freigabe erscheint es in der App und kann in passenden Suchanfragen auftauchen."}</p>
    {error && <div role="alert" className="spot-events-error">{error}<button type="button" disabled={busy} onClick={() => { setError(""); void load(); }}>Liste neu laden</button></div>}
    {message && <p role="status" className="spot-events-success">{message}</p>}
    {loading && <p role="status">Events werden geladen …</p>}
    {!loading && !draft && !rows.length && !error && <div className="spot-events-empty"><h3>Noch kein Event eingetragen</h3><p>Zum Beispiel ein Konzert, ein Spieleabend oder ein Brunch mit festem Termin. Regelmässige Angebote ohne Termin gehören weiterhin unter „Angebote“.</p></div>}
    {!draft && rows.map(row => <article key={row.id} className="spot-events-row"><div><span className="spot-events-status">{statusLabel(row)}</span><h3>{row.title}</h3><p>{row.recurrence ? `${new Date(row.recurrence.startDate + "T12:00:00Z").toLocaleDateString("de-CH")} · ${row.recurrence.startTime.slice(0, 5)}–${row.recurrence.endTime.slice(0, 5)}${row.recurrence.frequency !== "ONCE" ? " · wiederkehrend" : ""}` : "Termin separat gepflegt"}{row.free === true ? " · Gratis" : row.price !== null ? ` · ab CHF ${row.price}` : ""}</p></div>{row.editable ? <button type="button" onClick={() => open(row)}>Bearbeiten</button> : <span>{admin ? <a href={`/events/${row.id}/edit`}>In der Eventverwaltung bearbeiten →</a> : "Von Backyrd verwaltet"}</span>}</article>)}
    {draft && <form onSubmit={e => { e.preventDefault(); void save(admin ? "PUBLISH" : "SUBMIT"); }} className="spot-events-form">
      <h3 ref={heading} tabIndex={-1}>{draft.id ? "Event bearbeiten" : "Neues Event"}</h3>
      <p>Der Veranstaltungsort ist bereits mit diesem Spot verknüpft. Alle Zeiten gelten für die Schweiz.</p>
      {!admin && draft.status === "PUBLISHED" && <p className="spot-events-help">Wenn du Änderungen speicherst, wird das Event bis zur erneuten Freigabe ausgeblendet.</p>}
      <fieldset disabled={busy} className="spot-events-controls"><legend className="spot-events-sr-only">Eventangaben</legend>
      <label>Wie heisst das Event?<input required maxLength={300} value={draft.title} onChange={e => set("title", e.target.value)} placeholder="Zum Beispiel: Open Court – freies Tischtennis" /></label>
      <label>Was erwartet die Gäste?<textarea maxLength={600} rows={3} value={draft.description ?? ""} onChange={e => set("description", e.target.value)} placeholder="Beschreibe kurz, was stattfindet und was Gäste wissen sollten." /></label>
      <fieldset><legend>Wann findet es statt?</legend><div className="spot-events-grid"><label>Datum<input required type="date" value={draft.recurrence?.startDate ?? ""} onChange={e => schedule({ startDate: e.target.value })}/></label><label>Beginn<input required type="time" value={draft.recurrence?.startTime.slice(0, 5) ?? ""} onChange={e => schedule({ startTime: e.target.value })}/></label><label>Ende<input required type="time" value={draft.recurrence?.endTime.slice(0, 5) ?? ""} onChange={e => schedule({ endTime: e.target.value })}/></label></div><small>Ein Ende nach Mitternacht zählt zum nächsten Tag.</small>
      <label>Wiederholung<select value={draft.recurrence?.frequency ?? "ONCE"} onChange={e => schedule({ frequency: e.target.value })}><option value="ONCE">Einmalig</option><option value="WEEKLY">Wöchentlich am selben Wochentag</option><option value="MONTHLY">Monatlich am selben Datum</option></select></label>
      {draft.recurrence?.frequency !== "ONCE" && <div className="spot-events-grid"><label>Alle wie viele {draft.recurrence?.frequency === "MONTHLY" ? "Monate" : "Wochen"}?<input type="number" min={1} max={52} required value={draft.recurrence?.interval ?? 1} onChange={e => schedule({ interval: Number(e.target.value) })}/></label><label>Letztes Datum (optional)<input type="date" value={draft.recurrence?.until ?? ""} onChange={e => schedule({ until: e.target.value || null })}/></label></div>}</fieldset>
      <fieldset><legend>Wozu passt das Event?</legend><div className="spot-events-choices">{Object.entries(categories).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.categories.includes(key)} onChange={e => set("categories", e.target.checked ? [...draft.categories, key] : draft.categories.filter(c => c !== key))}/>{label}</label>)}</div></fieldset>
      <label>Was können Gäste hier machen?<textarea rows={3} value={draft.activities.join("\n")} onChange={e => set("activities", e.target.value.split("\n"))} placeholder={"Tischtennis spielen\nTanzen"}/><small>Eine Aktivität pro Zeile. Diese Angaben helfen, das Event in der Suche zu finden.</small></label>
      <fieldset><legend>Musik & Format (optional)</legend><div className="spot-events-choices">{Object.entries(formatTags).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.tags.includes(key)} onChange={e => set("tags", e.target.checked ? [...draft.tags, key] : draft.tags.filter(t => t !== key))}/>{label}</label>)}</div></fieldset>
      <div className="spot-events-grid"><label>Eintritt<select value={draft.free === null ? "unknown" : draft.free ? "free" : "paid"} onChange={e => { set("free", e.target.value === "unknown" ? null : e.target.value === "free"); set("price", null); }}><option value="unknown">Noch offen</option><option value="free">Gratis</option><option value="paid">Kostenpflichtig</option></select></label>{draft.free === false && <label>Preis ab (CHF, optional)<input type="number" min={0} max={100000} step="0.01" value={draft.price ?? ""} onChange={e => set("price", e.target.value === "" ? null : Number(e.target.value))}/></label>}<label>Mindestalter (optional)<input type="number" min={0} max={99} value={draft.minimumAge ?? ""} onChange={e => set("minimumAge", e.target.value === "" ? null : Number(e.target.value))}/><small>Leer lassen, wenn unbekannt; 0 bedeutet ohne Altersbeschränkung.</small></label><label>Für Familien geeignet?<select value={draft.familyFriendly === null ? "unknown" : draft.familyFriendly ? "yes" : "no"} onChange={e => set("familyFriendly", e.target.value === "unknown" ? null : e.target.value === "yes")}><option value="unknown">Noch offen</option><option value="yes">Ja</option><option value="no">Nein</option></select></label></div>
      <label>Veranstalter (optional)<input maxLength={300} value={draft.organizer ?? ""} onChange={e => set("organizer", e.target.value)}/></label>
      <label>Website oder Ticketlink (optional)<input type="url" placeholder="https://…" maxLength={2000} value={draft.externalUrl ?? ""} onChange={e => set("externalUrl", e.target.value)}/></label>
      <footer><button type="submit" className="spot-events-primary" disabled={busy}>{busy ? "Speichert …" : admin ? "Veröffentlichen" : "Zur Prüfung einreichen"}</button><button type="button" disabled={busy} onClick={() => void save("DRAFT")}>Entwurf speichern</button><button type="button" disabled={busy} onClick={() => { if (window.confirm("Bearbeitung schliessen? Ungespeicherte Änderungen gehen verloren.")) setDraft(null); }}>Schliessen</button>{draft.id && draft.status !== "CANCELLED" && <button type="button" disabled={busy} onClick={() => void save("CANCEL")}>Event absagen</button>}</footer></fieldset>
    </form>}
  </section>;
}
