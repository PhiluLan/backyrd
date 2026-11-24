"use client";

import { useEffect, useRef, useState } from "react";
import { bookingAllocationLabel, bookingError, bookingReadDenied, bookingWriteUncertain, saveBookingCombination, type BookingCombination, type BookingSnapshot } from "@/lib/booking-api";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

type Definition = Omit<BookingCombination, "is_available">;
export function TableCombinations({ spotId, snapshot, onClose, onBusy, onDenied, onReload }: {
  spotId: string; snapshot: BookingSnapshot; onClose: (uncertain: boolean) => void; onBusy: (busy: boolean) => void; onDenied: () => void; onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<BookingCombination | null | undefined>(undefined);
  const groups = snapshot.combinations ?? [];
  if (editing !== undefined) return <CombinationEditor spotId={spotId} snapshot={snapshot} existing={editing} onBusy={onBusy} onDenied={onDenied} onClose={(uncertain) => { if (uncertain) onClose(true); else setEditing(undefined); }} onSaved={async () => { await onReload(); setEditing(undefined); }} />;
  const item = (g: BookingCombination) => <button key={g.id} type="button" className={styles.closureCard} onClick={() => setEditing(g)}><strong>{g.name}</strong><span>{bookingAllocationLabel({ table_id: g.primary_table_id, table_ids: g.table_ids }, snapshot)} · bis {g.max_party_size} Personen</span><span>{g.is_active ? g.is_available ? "Aktiv für neue Zuteilungen" : "Konfiguration prüfen" : "Aufgehoben"}</span></button>;
  return <ConsolePanel title="Tischkombinationen" onClose={() => onClose(false)}><div className={styles.drawerBody}>
    <p className={styles.help}>Lege fest, welche Tische im selben Bereich gemeinsam genutzt werden können. Jede Buchung belegt alle zugehörigen Tische. Änderungen an einer Definition verschieben keine bestehenden Reservationen.</p>
    <button type="button" data-initial-focus className={styles.primary} onClick={() => setEditing(null)}>Neue Kombination</button>
    {groups.some((g) => g.is_active) ? groups.filter((g) => g.is_active).map(item) : <p className={styles.help}>Noch keine aktiven Kombinationen.</p>}
    {groups.some((g) => !g.is_active) && <details className={styles.editorDetails}><summary>Aufgehobene Kombinationen</summary>{groups.filter((g) => !g.is_active).map(item)}{(snapshot.archived_combination_count ?? 0) > 100 && <p className={styles.help}>Angezeigt werden die 100 zuletzt aufgehobenen Einträge.</p>}</details>}
  </div></ConsolePanel>;
}
function CombinationEditor({ spotId, snapshot, existing, onClose, onBusy, onDenied, onSaved }: {
  spotId: string; snapshot: BookingSnapshot; existing: BookingCombination | null; onClose: (uncertain: boolean) => void; onBusy: (busy: boolean) => void; onDenied: () => void; onSaved: () => Promise<void>;
}) {
  const [original] = useState<Definition>(() => existing ? { ...existing } : { id: crypto.randomUUID(), name: "", primary_table_id: "", table_ids: [], max_party_size: Math.min(snapshot.settings?.max_party_size ?? 8, 8), is_active: true });
  const [revision] = useState(snapshot.settings?.revision ?? 0);
  const [name, setName] = useState(original.name);
  const [ids, setIds] = useState(original.table_ids);
  const [primary, setPrimary] = useState(original.primary_table_id);
  const [size, setSize] = useState(String(original.max_party_size));
  const [active, setActive] = useState(original.is_active);
  const [area, setArea] = useState(snapshot.tables.find((t) => t.id === primary)?.area_id ?? snapshot.areas.find((a) => a.is_active)?.id ?? "");
  const [archive, setArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const frozen = useRef<Definition | null>(null), inFlight = useRef(false), mounted = useRef(false);
  const payload: Definition = { id: original.id, name, primary_table_id: primary, table_ids: ids, max_party_size: Number(size), is_active: active };
  const dirty = name !== original.name || primary !== original.primary_table_id || JSON.stringify(ids) !== JSON.stringify(original.table_ids) || size !== String(original.max_party_size) || active !== original.is_active;
  const selected = snapshot.tables.filter((t) => ids.includes(t.id));
  const chairs = selected.reduce((sum, t) => sum + t.seats, 0);
  const valid = !!name.trim() && ids.length >= 2 && ids.length <= 4 && ids.includes(primary) && size.trim() !== "" && Number.isInteger(Number(size)) && Number(size) >= 1 && Number(size) <= 30 && (!active || (Number(size) <= chairs && selected.length === ids.length && selected.every((t) => t.is_active && t.area_id === area) && !!snapshot.areas.find((a) => a.id === area && a.is_active)));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty || uncertain || busy) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, uncertain, busy]);
  async function save() {
    if (inFlight.current || (!frozen.current && !archive && !valid)) return;
    const operation = frozen.current ?? (archive ? { ...original, is_active: false } : payload);
    inFlight.current = true; setBusy(true); onBusy(true); setError(null);
    try { await saveBookingCombination(spotId, revision, operation); if (mounted.current) await onSaved(); }
    catch (failure) { if (!mounted.current) return; if (bookingReadDenied(failure)) { onDenied(); return; } setError(bookingError(failure)); if (uncertain || bookingWriteUncertain(failure)) { frozen.current = operation; setUncertain(true); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); onBusy(false); }
  }
  return <ConsolePanel title={existing ? "Kombination bearbeiten" : "Neue Tischkombination"} dirty={dirty || archive} busy={busy} uncertain={uncertain} uncertainHelp="Die Kombination kann bereits gespeichert sein. Prüfe nach dem Verlassen ihre aktuelle Definition, bevor du erneut erfasst." onClose={() => onClose(uncertain)}>
    <form className={styles.editorForm} onSubmit={(event) => { event.preventDefault(); void save(); }}><fieldset className={styles.fieldset} disabled={busy || uncertain || archive}><div className={styles.drawerBody}>
      <label>Name der Kombination<input data-initial-focus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Bereich der Kombination<select value={area} onChange={(event) => { setArea(event.target.value); setIds([]); setPrimary(""); }}>{snapshot.areas.filter((a) => a.is_active || a.id === area).map((a) => <option key={a.id} value={a.id}>{a.name}{!a.is_active ? " (inaktiv)" : ""}</option>)}</select></label>
      <fieldset className={styles.fieldset}><legend>Zwei bis vier Tische wählen</legend>{snapshot.tables.filter((t) => (t.area_id === area && t.is_active) || ids.includes(t.id)).map((t) => <label className={styles.checkbox} key={t.id}><input type="checkbox" checked={ids.includes(t.id)} disabled={!ids.includes(t.id) && ids.length >= 4} onChange={(event) => { const next = event.target.checked ? [...ids, t.id].sort() : ids.filter((id) => id !== t.id); setIds(next); if (!next.includes(primary)) setPrimary(next[0] ?? ""); }} />{t.label} · {t.seats} Plätze{!t.is_active ? " (inaktiv)" : t.area_id !== area ? " (anderer Bereich)" : ""}</label>)}</fieldset>
      <p className={styles.help}>{ids.length} Tische gewählt · {chairs} vorhandene Plätze. Kombiniere nur Tische, die im Betrieb gemeinsam genutzt werden können.</p>
      <label>Maximale Personen dieser Kombination<input type="number" inputMode="numeric" min={1} max={30} step={1} required value={size} onChange={(event) => setSize(event.target.value)} /></label>
      <label className={styles.checkbox}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Für neue Zuteilungen aktiv</label>
      <p className={styles.help}>Die Gruppengrösse darf die vorhandenen Plätze nicht überschreiten. Bestehende Reservationen behalten ihre gespeicherten Tische, auch wenn du diese Definition änderst oder aufhebst.</p>
    </div></fieldset>
    {error && <p role="alert" className={styles.writeWarning}>{error}{uncertain ? " Der Ausgang ist unklar. Wiederholen sendet ausschliesslich dieselbe Definition." : ""}</p>}
    {existing?.is_active && !uncertain && <div className={styles.hoursConfirmation}><button type="button" className={styles.secondary} disabled={busy} onClick={() => setArchive(!archive)}>{archive ? "Weiter bearbeiten" : "Kombination aufheben"}</button>{archive && <p role="status">Kombination aufheben? Neue Buchungen können sie danach nicht mehr wählen. Bestehende Reservationen bleiben unverändert.</p>}</div>}
    <footer className={styles.editorFooter}><span>{archive ? "Bestehende Tischzuordnungen bleiben erhalten" : `${ids.length} Tische · bis ${size || "–"} Personen`}</span><button type="submit" className={styles.primary} disabled={busy || (!uncertain && !archive && !valid)}>{busy ? "Speichert …" : uncertain ? "Unverändert erneut versuchen" : archive ? "Aufheben bestätigen" : "Kombination speichern"}</button></footer>
    </form>
  </ConsolePanel>;
}
