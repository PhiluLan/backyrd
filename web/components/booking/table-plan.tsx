"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { bookingError, bookingWriteUncertain, saveBookingLayout, type BookingSnapshot, type BookingTable } from "@/lib/booking-api";
import { layoutsOverlap, moveTable, validTableLayout, type TableLayout } from "@/lib/booking-table-layout";
import { ConsolePanel } from "./console-panel";
import styles from "./console.module.css";

type Entry = { table_id: string; area_id: string; layout: TableLayout | null };
type Fields = { x: string; y: string; width: string; height: string; shape: "rectangle" | "round" };
const fieldsOf = (layout: TableLayout): Fields => ({ x: String(layout.x), y: String(layout.y), width: String(layout.width), height: String(layout.height), shape: layout.shape });

function Plan({ tables, selected, onSelect, onMove, describe }: { tables: BookingTable[]; selected?: string; onSelect: (id: string) => void; onMove?: (id: string, layout: TableLayout) => void; describe?: (id: string) => string }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; layout: TableLayout } | null>(null);
  function point(event: PointerEvent<SVGGElement>) {
    const matrix = svg.current?.getScreenCTM()?.inverse();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix) : null;
  }
  return <svg ref={svg} className={styles.floorPlan} viewBox="0 0 1000 700" role="group" aria-label={onMove ? "Tische positionieren" : "Gespeicherter Tischplan"}>
    <rect width="1000" height="700" rx="16" fill="var(--surface, #18171d)" />
    {tables.filter((table) => table.layout).map((table) => {
      const layout = table.layout!;
      return <g key={table.id} role="button" tabIndex={0} aria-label={table.label + " · " + table.seats + " Plätze" + (describe ? " · " + describe(table.id) : "")} aria-pressed={selected === table.id} className={styles.planTable} data-selected={selected === table.id} data-active={table.is_active} style={{ touchAction: onMove ? "none" : "auto" }}
        onClick={() => onSelect(table.id)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(table.id); }
          if (!onMove || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); onSelect(table.id); const step = event.shiftKey ? 25 : 5;
          onMove(table.id, moveTable(layout, layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)));
        }} onPointerDown={(event) => {
          if (!onMove || event.button !== 0) return; const p = point(event); if (!p) return;
          onSelect(table.id); drag.current = { id: table.id, x: p.x, y: p.y, layout }; event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={(event) => { const d = drag.current, p = point(event); if (onMove && d && p) onMove(d.id, moveTable(d.layout, d.layout.x + p.x - d.x, d.layout.y + p.y - d.y)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {layout.shape === "round" ? <ellipse cx={layout.x + layout.width / 2} cy={layout.y + layout.height / 2} rx={layout.width / 2} ry={layout.height / 2} /> : <rect x={layout.x} y={layout.y} width={layout.width} height={layout.height} rx="12" />}
        <text x={layout.x + layout.width / 2} y={layout.y + layout.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(18, layout.width / 6)} pointerEvents="none">{table.label.length > 12 ? table.label.slice(0, 11) + "…" : table.label}</text>
        {describe && <text x={layout.x + layout.width / 2} y={layout.y + layout.height / 2 + Math.min(20, layout.height / 3)} textAnchor="middle" fontSize={Math.min(12, layout.width / 8)} pointerEvents="none">{describe(table.id).startsWith("Am Tisch") ? "Am Tisch" : describe(table.id).split(" ")[0] + " Res."}</text>}
      </g>;
    })}
  </svg>;
}

export function TablePlan({ snapshot, areaId, describe, onEdit }: { snapshot: BookingSnapshot; areaId: string; describe: (id: string) => string; onEdit: () => void }) {
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState("1");
  return <section aria-label="Grafischer Tischplan">
    <div className={styles.actions}><button className={styles.secondary} onClick={onEdit}>Tischplan bearbeiten</button><label>Plan vergrössern<select value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="1">100 %</option><option value="2">200 %</option><option value="3">300 %</option></select></label></div>
    <p className={styles.help}>Schematischer Plan · Die Tischkarten darunter zeigen Reservierungen und Servicestatus. Die Anordnung verändert keine Buchungen.</p>
    {snapshot.areas.filter((area) => !areaId || area.id === areaId).map((area) => {
      const tables = snapshot.tables.filter((table) => table.area_id === area.id);
      return <section key={area.id} className={styles.areaSection}><h3>{area.name}</h3><div className={styles.planScroll} tabIndex={0} aria-label={"Plan " + area.name}><div style={{ width: Number(zoom) * 100 + "%" }}><Plan tables={tables} selected={selected} onSelect={setSelected} describe={describe} /></div></div><div className={styles.actions}>{tables.map((table) => <button className={styles.secondary} aria-pressed={selected === table.id} key={table.id} onClick={() => setSelected(table.id)}>{table.label}{!table.layout ? " · noch nicht positioniert" : ""}</button>)}</div></section>;
    })}
    {snapshot.tables.some((table) => table.id === selected && (!areaId || table.area_id === areaId)) && <p role="status">{snapshot.tables.find((table) => table.id === selected)?.label} · {describe(selected)} · Details in der Tischkarte.</p>}
  </section>;
}

export function TablePlanEditor({ spotId, snapshot, initialArea, onBusy, onClose, onSaved }: { spotId: string; snapshot: BookingSnapshot; initialArea: string; onBusy: (value: boolean) => void; onClose: () => void; onSaved: () => Promise<void> }) {
  const [initial] = useState(() => snapshot.tables.map((table): Entry => ({ table_id: table.id, area_id: table.area_id, layout: table.layout ?? null })));
  const [revision] = useState(snapshot.settings?.revision ?? 0);
  const [entries, setEntries] = useState(initial);
  const [area, setArea] = useState(initialArea || snapshot.areas[0]?.id || "");
  const [selected, setSelected] = useState("");
  const [fields, setFields] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const tables = snapshot.tables.filter((table) => table.area_id === area).map((table) => ({ ...table, layout: entries.find((entry) => entry.table_id === table.id)?.layout ?? null }));
  const current = tables.find((table) => table.id === selected);
  const dirty = JSON.stringify(entries) !== JSON.stringify(initial);
  const validFields = !fields || validTableLayout({ x: fields.x.trim() === "" ? NaN : Number(fields.x), y: fields.y.trim() === "" ? NaN : Number(fields.y), width: fields.width.trim() === "" ? NaN : Number(fields.width), height: fields.height.trim() === "" ? NaN : Number(fields.height), shape: fields.shape });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || !validFields || uncertain) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, validFields, uncertain]);
  const overlap = tables.some((a, index) => a.layout && tables.slice(index + 1).some((b) => b.layout && layoutsOverlap(a.layout!, b.layout)));
  function select(id: string) { setSelected(id); const layout = entries.find((entry) => entry.table_id === id)?.layout; setFields(layout ? fieldsOf(layout) : null); }
  function update(id: string, layout: TableLayout | null) {
    if (busy || uncertain) return;
    setEntries((rows) => rows.map((row) => row.table_id === id ? { ...row, layout } : row));
    setSelected(id); setFields(layout ? fieldsOf(layout) : null);
  }
  function change(key: keyof Fields, value: string) {
    if (!fields || !current) return;
    const next = { ...fields, [key]: value }; setFields(next);
    const layout = { x: next.x.trim() === "" ? NaN : Number(next.x), y: next.y.trim() === "" ? NaN : Number(next.y), width: next.width.trim() === "" ? NaN : Number(next.width), height: next.height.trim() === "" ? NaN : Number(next.height), shape: next.shape };
    if (validTableLayout(layout)) setEntries((rows) => rows.map((row) => row.table_id === current.id ? { ...row, layout } : row));
  }
  async function save() {
    if (saving.current || !validFields || !dirty) return;
    saving.current = true; setBusy(true); onBusy(true); setError(null);
    try { await saveBookingLayout(spotId, revision, entries.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(initial[index]))); await onSaved(); }
    catch (error) { setError(bookingError(error)); if (bookingWriteUncertain(error)) setUncertain(true); }
    finally { saving.current = false; setBusy(false); onBusy(false); }
  }
  return <ConsolePanel title="Tischplan bearbeiten" dirty={dirty || !validFields} busy={busy} uncertain={uncertain} onClose={onClose}>
    <form className={styles.drawerBody} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <p className={styles.help}>Verschiebe Tische im Plan oder nutze die Positionsfelder. Pfeiltasten verschieben um 5, Umschalt + Pfeiltaste um 25 Einheiten. Fläche: 1000 × 700. Sitzplätze und Reservierungen bleiben unverändert.</p>
      {error && <p role="alert" className={styles.error}>{error} Bei einem Versionskonflikt schliesse den Editor, lade die Übersicht neu und öffne den Plan erneut.</p>}
      {uncertain && <p role="alert">Der Speicherstatus ist unklar. Du kannst dieselbe Anfrage erneut senden oder den Editor verlassen und den gespeicherten Plan prüfen.</p>}
      <fieldset disabled={busy || uncertain} className={styles.planFields}>
        <label>Bereich im Plan<select data-initial-focus value={area} onChange={(event) => { setArea(event.target.value); setSelected(""); setFields(null); }}>{snapshot.areas.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Tisch auswählen<select value={selected} onChange={(event) => select(event.target.value)}><option value="">Tisch wählen</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.label}{!table.layout ? " · ohne Position" : ""}</option>)}</select></label>
        <button type="button" className={styles.secondary} disabled={!tables.length} onClick={() => {
          const cols = Math.ceil(Math.sqrt(tables.length * 1000 / 700)), rows = Math.ceil(tables.length / cols);
          const width = Math.min(120, Math.max(40, Math.floor(1000 / cols) - 10)), height = Math.min(90, Math.max(40, Math.floor(700 / rows) - 10));
          setEntries((entries) => entries.map((entry) => { const index = tables.findIndex((table) => table.id === entry.table_id); return index < 0 ? entry : { ...entry, layout: { x: Math.floor((index % cols) * 1000 / cols) + 5, y: Math.floor(Math.floor(index / cols) * 700 / rows) + 5, width, height, shape: entry.layout?.shape ?? "rectangle" } }; }));
          setSelected(""); setFields(null);
        }}>Bereich als Raster anordnen</button>
        <p className={styles.help}>Das Raster ist ein Vorschlag und wird erst mit «Tischplan speichern» übernommen.</p>
        <div className={styles.planScroll}><Plan tables={tables} selected={selected} onSelect={select} onMove={busy || uncertain ? undefined : update} /></div>
        {current && !current.layout && <button type="button" className={styles.secondary} onClick={() => update(current.id, { x: 20, y: 20, width: 120, height: 90, shape: "rectangle" })}>Tisch im Plan platzieren</button>}
        {current?.layout && fields && <><div className={styles.planNumbers}>{([['x', 'Position X'], ['y', 'Position Y'], ['width', 'Breite'], ['height', 'Höhe']] as const).map(([key, label]) => <label key={key}>{label}<input type="text" inputMode="numeric" pattern="[0-9]*" value={fields[key]} aria-invalid={!validFields} onChange={(event) => change(key, event.target.value)} /></label>)}</div><label>Tischform<select value={fields.shape} onChange={(event) => change("shape", event.target.value)}><option value="rectangle">Rechteckig</option><option value="round">Rund / oval</option></select></label><button type="button" className={styles.secondary} onClick={() => update(current.id, null)}>Position entfernen</button></>}
        {!validFields && <p role="alert">Gib ganze Zahlen ein. Breite und Höhe: 40–300. Der Tisch muss vollständig innerhalb der Planfläche liegen.</p>}
        {overlap && <p role="status">Tische überlappen sich. Prüfe, ob diese Anordnung deinem Raum entspricht.</p>}
      </fieldset>
      <button className={styles.primary} type="submit" disabled={busy || !dirty || !validFields}>{busy ? "Wird gespeichert …" : uncertain ? "Identisches Speichern wiederholen" : "Tischplan speichern"}</button>
    </form>
  </ConsolePanel>;
}
