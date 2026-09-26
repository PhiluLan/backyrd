"use client";

import { useState } from "react";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import { findResearchPlaceIds } from "./WorldAddressPicker";

type Spot = ProductAdminSpotSearch["spots"][number];
type Report = { batchId: string; mode: string; totals: Record<string, number>; perSpot: Array<{ spotId: string; name: string; ready: string[]; imported: string[]; skipped: string[]; conflicts: string[]; invalid: string[]; unresolved: string[]; manifestHash?: string; location?: { message: string; automatic: string | null; query?: string; candidates: Array<{ placeId: string; name: string; address: string; latitude: number; longitude: number; token: string; sourceUrl: string }> } }> };

export function WorldResearchBatchPanel(props: {
  search(query: string): Promise<ProductAdminSpotSearch>;
  post(body: unknown): Promise<unknown>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Spot[]>([]);
  const [selected, setSelected] = useState<Spot[]>([]);
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<Report | null>(null);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Die Aktion ist fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const search = () => run(async () => { const response = await props.search(query); setResults(response.spots); });
  const toggle = (spot: Spot) => {
    setPreview(null);
    setSelected((current) => current.some((item) => item.spotId === spot.spotId)
      ? current.filter((item) => item.spotId !== spot.spotId)
      : current.length < 10 ? [...current, spot] : current);
  };
  const exportBatch = () => run(async () => {
    const document = await props.post({ action: "export", spotIds: selected.map((spot) => spot.spotId) });
    const text = JSON.stringify(document, null, 2); setJson(text); setPreview(null);
    const link = documentElement(text, `world-research-${(document as { batch?: { batchId?: string } }).batch?.batchId ?? "batch"}.json`);
    link.click(); URL.revokeObjectURL(link.href);
    setMessage("Export erstellt. Recherchiere extern und füge das vollständige JSON danach wieder ein.");
  });
  const parse = () => { try { return JSON.parse(json) as unknown; } catch { throw new Error("Das eingefügte JSON ist nicht gültig."); } };
  const previewBatch = () => run(async () => {
    setPreview(null); setLocations({});
    const document = parse();
    let report = await props.post({ action: "preview", document }) as Report;
    const pending = report.perSpot.filter((spot) => spot.location?.query);
    if (pending.length) {
      const browserPlaceIds: Record<string, string[] | null> = {};
      for (const spot of pending) {
        try { browserPlaceIds[spot.spotId] = await findResearchPlaceIds(spot.location!.query!); }
        catch { browserPlaceIds[spot.spotId] = null; }
      }
      report = await props.post({ action: "preview", document, browserPlaceIds }) as Report;
    }
    setPreview(report);
    setLocations(Object.fromEntries(report.perSpot.flatMap((spot) => {
      const candidate = spot.location?.candidates.find((item) => item.placeId === spot.location?.automatic);
      return candidate ? [[spot.spotId, candidate.token]] : [];
    })));
  });
  const importBatch = () => run(async () => { const report = await props.post({ action: "commit", document: parse(), locations }) as Report; setPreview(report); setMessage(report.totals.invalid > 0 ? "Import teilweise fehlgeschlagen. Bitte die Fehler im Bericht prüfen." : "Import abgeschlossen und geänderte World-Snapshots verifiziert."); });

  return <section className="wk-research-panel">
    <div className="wk-research-heading"><div><span className="wk-eyebrow">Assistierte Recherche</span><h2>Spot-Wissen als geprüfter Zehner-Batch</h2><p>Auswählen, JSON extern recherchieren lassen, Vorschau prüfen und erst danach append-only übernehmen.</p></div><strong>{selected.length}/10</strong></div>
    <div className="wk-research-steps"><span>1 · Export</span><span>2 · Recherche</span><span>3 · Prüfen</span><span>4 · Import</span></div>
    <div className="wk-research-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Spot suchen, z. B. Nomad Eatery & Bar" onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><button disabled={busy} onClick={() => void search()}>Suchen</button></div>
    {!!results.length && <div className="wk-research-results">{results.map((spot) => <label key={spot.spotId}><input type="checkbox" checked={selected.some((item) => item.spotId === spot.spotId)} disabled={!selected.some((item) => item.spotId === spot.spotId) && selected.length >= 10} onChange={() => toggle(spot)} /><span><b>{spot.name}</b><small>{spot.city ?? "Ort nicht gepflegt"}</small></span></label>)}</div>}
    {!!selected.length && <div className="wk-research-selection">{selected.map((spot) => <button key={spot.spotId} onClick={() => toggle(spot)}>{spot.name} ×</button>)}</div>}
    <button className="wk-research-primary" disabled={busy || !selected.length} onClick={() => void exportBatch()}>Recherche-JSON herunterladen</button>
    <div className="wk-research-instructions"><b>Danach in ChatGPT oder Sol:</b><span>Datei anhängen, öffentliche Quellen recherchieren lassen und verlangen, dass ausschließlich das vollständige JSON zurückgegeben wird. Nicht belegte Angaben müssen unter <code>unresolved</code> bleiben.</span></div>
    <label className="wk-research-upload">Recherchiertes JSON hochladen<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { setJson(text); setPreview(null); }); }} /></label>
    <textarea className="wk-research-json" value={json} onChange={(event) => { setJson(event.target.value); setPreview(null); }} placeholder="Oder vollständiges recherchiertes JSON hier einfügen …" spellCheck={false} />
    <div className="wk-research-actions"><button disabled={busy || !json} onClick={() => void previewBatch()}>Import prüfen</button><button className="wk-research-primary" disabled={busy || !preview || preview.mode !== "PREVIEW" || preview.totals.invalid > 0} onClick={() => void importBatch()}>Geprüfte Angaben übernehmen</button></div>
    {message && <p className="wk-research-message">{message}</p>}
    {preview && <div className="wk-research-report"><div className="wk-research-totals">{Object.entries(preview.totals).map(([key, value]) => <span key={key}><b>{value}</b>{key}</span>)}</div>{preview.perSpot.map((spot) => <article key={spot.spotId}><h3>{spot.name}</h3><p>Übernommen: {spot.imported.length} · Bereit: {spot.ready.length} · Übersprungen: {spot.skipped.length} · Konflikte: {spot.conflicts.length} · Ungelöst: {spot.unresolved.length} · Ungültig: {spot.invalid.length}</p>{!!spot.conflicts.length && <small>Review nötig: {spot.conflicts.join(", ")}</small>}{!!spot.invalid.length && <small>Fehler: {spot.invalid.join(", ")}</small>}
      {spot.location && <fieldset><legend>Standortabgleich · Google Maps</legend><p>{spot.location.message}</p>
        {spot.location.candidates.map((candidate) => <label key={candidate.placeId} style={{ display: "block", padding: "12px 0" }}><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={locations[spot.spotId] === candidate.token} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: candidate.token }))} /> <b>{candidate.name}</b> · {candidate.address}<br /><small>{candidate.latitude}, {candidate.longitude} · </small><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Auf Google Maps prüfen</a></label>)}
        {!!spot.location.candidates.length && <label><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={!locations[spot.spotId]} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: "" }))} /> Koordinaten vorerst unverändert lassen</label>}
        {locations[spot.spotId] && <p>Zusätzlich zu den Rechercheangaben werden zwei Koordinaten übernommen. Die Auswahl ist 15 Minuten gültig.</p>}
      </fieldset>}
    </article>)}</div>}
  </section>;
}

function documentElement(text: string, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = filename;
  return link;
}
