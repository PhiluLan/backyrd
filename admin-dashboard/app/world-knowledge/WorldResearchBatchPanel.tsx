"use client";

import { useRef, useState } from "react";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import { findResearchPlaces, type ResearchPlace } from "./WorldAddressPicker";
import { refreshResearchDocument } from "./researchBatchRefresh.mjs";
import type { ResearchReview } from "@backyrd/world-knowledge-core";

type Spot = ProductAdminSpotSearch["spots"][number];
type Report = { batchId: string; mode: string; totals: Record<string, number>; perSpot: Array<{ spotId: string; name: string; ready: string[]; imported: string[]; skipped: string[]; conflicts: string[]; invalid: string[]; unresolved: string[]; reviews: ResearchReview[]; blocked: string[]; derived: string[]; manifestHash?: string; location?: { message: string; automatic: string | null; query?: string; candidates: Array<{ placeId: string; name: string; address: string; latitude: number; longitude: number; token: string; sourceUrl: string }> } }> };

export function WorldResearchBatchPanel(props: {
  search(query: string): Promise<ProductAdminSpotSearch>;
  post(body: unknown): Promise<unknown>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Spot[]>([]);
  const [selected, setSelected] = useState<Spot[]>([]);
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<Report | null>(null);
  const [reviewOptions, setReviewOptions] = useState<Record<string, ResearchReview[]>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, Record<string, string>>>({});
  const [reviewChanged, setReviewChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [completion, setCompletion] = useState<{ imported: number; spots: number } | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

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
    setCompletion(null);
    const document = await props.post({ action: "export", spotIds: selected.map((spot) => spot.spotId) });
    const text = JSON.stringify(document, null, 2); setJson(text); setPreview(null); setReviewOptions({}); setConfirmations({}); setReviewChanged(false);
    const link = documentElement(text, `world-research-${(document as { batch?: { batchId?: string } }).batch?.batchId ?? "batch"}.json`);
    link.click(); URL.revokeObjectURL(link.href);
    setMessage("Export erstellt. Recherchiere extern und füge das vollständige JSON danach wieder ein.");
  });
  const parse = () => { try { return JSON.parse(json) as unknown; } catch { throw new Error("Das eingefügte JSON ist nicht gültig."); } };
  const loadPreview = async (document: unknown, choices: typeof confirmations, preserveReviews: boolean) => {
    if (!preserveReviews) { setPreview(null); setReviewOptions({}); setLocations({}); }
    let report = await props.post({ action: "preview", document, confirmations: choices }) as Report;
    const pending = report.perSpot.filter((spot) => spot.location?.query);
    if (pending.length) {
      const browserPlaces: Record<string, ResearchPlace[] | null> = {};
      for (const spot of pending) {
        try { browserPlaces[spot.spotId] = await findResearchPlaces(spot.location!.query!); }
        catch { browserPlaces[spot.spotId] = null; }
      }
      report = await props.post({ action: "preview", document, browserPlaces, confirmations: choices }) as Report;
    }
    setPreview(report);
    setReviewOptions((current) => Object.fromEntries(report.perSpot.map((spot) => {
      const previous = preserveReviews ? current[spot.spotId] ?? [] : [];
      return [spot.spotId, [...previous, ...spot.reviews.filter((review) => !previous.some((item) => item.attributeKey === review.attributeKey))]];
    })));
    setReviewChanged(false);
    setLocations(Object.fromEntries(report.perSpot.flatMap((spot) => {
      const candidate = spot.location?.candidates.find((item) => item.placeId === spot.location?.automatic);
      return candidate ? [[spot.spotId, candidate.token]] : [];
    })));
  };
  const previewBatch = (choices = confirmations, preserveReviews = false) => run(() => loadPreview(parse(), choices, preserveReviews));
  const refreshBatch = () => run(async () => {
    const previous = parse() as { batch?: { spots?: Array<{ spotId: string }> } };
    const spotIds = previous.batch?.spots?.map((spot) => spot.spotId);
    if (!spotIds?.length) throw new Error("Die Spot-Auswahl fehlt. Bitte die Recherche-Datei erneut hochladen.");
    const current = await props.post({ action: "export", spotIds });
    const refreshed = refreshResearchDocument(previous, current);
    setJson(JSON.stringify(refreshed, null, 2));
    setConfirmations({});
    setReviewChanged(false);
    await loadPreview(refreshed, {}, false);
    setMessage("Aktueller World-Stand geladen. Deine recherchierten Vorschläge sind erhalten und wurden neu geprüft. Bitte die angezeigten Entscheidungen erneut kontrollieren.");
  });
  const chooseReview = (spotId: string, review: ResearchReview, accept: boolean) => {
    const next = { ...confirmations, [spotId]: { ...confirmations[spotId], [review.attributeKey]: accept ? review.current.claimId : "" } };
    setConfirmations(next);
    setReviewChanged(true);
    void previewBatch(next, true);
  };
  const importBatch = () => run(async () => {
    const report = await props.post({ action: "commit", document: parse(), locations, confirmations }) as Report;
    if (report.mode === "COMMIT" && report.totals.imported > 0 && report.totals.invalid === 0 && report.totals.conflicts === 0 && report.totals.blocked === 0 && report.perSpot.every((spot) => spot.imported.length === 0 || !!spot.manifestHash)) {
      setCompletion({ imported: report.totals.imported, spots: report.perSpot.filter((spot) => spot.imported.length > 0).length });
      setQuery(""); setResults([]); setSelected([]); setJson(""); setPreview(null); setReviewOptions({}); setLocations({}); setConfirmations({}); setReviewChanged(false); setUploadKey((current) => current + 1);
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
      return;
    }
    setPreview(report);
    setMessage(report.totals.invalid > 0 ? "Ein Spot-Import oder sein Neuaufbau ist fehlgeschlagen. Bitte den Bericht prüfen; innerhalb eines fehlgeschlagenen Spot-Batches wurde nichts teilweise gespeichert." : report.totals.conflicts || report.totals.blocked ? `${report.totals.imported > 0 ? "Ein Teil wurde übernommen." : "Noch nichts übernommen."} Offene Reviews und abhängige Felder bleiben unten sichtbar.` : "Der Import ist noch nicht vollständig verifiziert. Bitte den Bericht prüfen.");
  });
  const driftedSpots = preview?.perSpot.filter((spot) => spot.conflicts.includes("EXPORT_OR_MANIFEST_DRIFT")) ?? [];

  return <section className="wk-research-panel" ref={panelRef}>
    <div className="wk-research-heading"><div><span className="wk-eyebrow">Recherche Spot</span><h2>Spot-Wissen recherchieren und importieren</h2><p>Bis zu zehn Spots auswählen, JSON extern recherchieren lassen, Vorschau prüfen und erst danach in World Knowledge übernehmen. Der Export enthält nur bestehendes World-Wissen; alte Spot-Felder werden nicht als Fakten übernommen. Einzelne Spots pflegst du unter Spots → Pflegen.</p></div><strong>{selected.length}/10</strong></div>
    {completion && <div className="wk-research-completion" role="status"><span aria-hidden="true">✓</span><div><strong>Import erfolgreich abgeschlossen</strong><p>{completion.imported} {completion.imported === 1 ? "Angabe" : "Angaben"} für {completion.spots} {completion.spots === 1 ? "Spot" : "Spots"} übernommen und im World-Reader verifiziert. Du kannst jetzt einen neuen Batch auswählen.</p></div></div>}
    <div className="wk-research-steps"><span>1 · Export</span><span>2 · Recherche</span><span>3 · Prüfen</span><span>4 · Import</span></div>
    <div className="wk-research-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Spot suchen, z. B. Nomad Eatery & Bar" onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><button disabled={busy} onClick={() => void search()}>Suchen</button></div>
    {!!results.length && <div className="wk-research-results">{results.map((spot) => <label key={spot.spotId}><input type="checkbox" checked={selected.some((item) => item.spotId === spot.spotId)} disabled={!selected.some((item) => item.spotId === spot.spotId) && selected.length >= 10} onChange={() => toggle(spot)} /><span><b>{spot.name}</b><small>{spot.city ?? "Ort nicht gepflegt"}</small></span></label>)}</div>}
    {!!selected.length && <div className="wk-research-selection">{selected.map((spot) => <button key={spot.spotId} onClick={() => toggle(spot)}>{spot.name} ×</button>)}</div>}
    <button className="wk-research-primary" disabled={busy || !selected.length} onClick={() => void exportBatch()}>Recherche-JSON herunterladen</button>
    <div className="wk-research-instructions"><b>Danach in ChatGPT oder Sol:</b><span>Datei anhängen, öffentliche Quellen recherchieren lassen und verlangen, dass ausschließlich das vollständige JSON zurückgegeben wird. Nicht belegte Angaben müssen unter <code>unresolved</code> bleiben.</span></div>
    <label className="wk-research-upload">Recherchiertes JSON hochladen<input key={uploadKey} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { setCompletion(null); setJson(text); setPreview(null); setReviewOptions({}); setConfirmations({}); }); }} /></label>
    <details className="wk-research-json-details" open={!!json && !preview}><summary>JSON ansehen oder einfügen</summary><textarea className="wk-research-json" value={json} onChange={(event) => { setCompletion(null); setJson(event.target.value); setPreview(null); setReviewOptions({}); setConfirmations({}); }} placeholder="Oder vollständiges recherchiertes JSON hier einfügen …" spellCheck={false} /></details>
    <div className="wk-research-actions"><button disabled={busy || !json} onClick={() => void previewBatch()}>{preview ? "Import erneut prüfen" : "JSON prüfen"}</button></div>
    {message && <p className="wk-research-message" role="status">{message}</p>}
    {preview && <div className="wk-research-report"><div className="wk-research-review-state" role="status">{busy || reviewChanged ? "Deine Auswahl wird automatisch geprüft …" : driftedSpots.length ? `Die Recherche-Datei ist für ${driftedSpots.map((spot) => spot.name).join(" und ")} veraltet. Das ist keine bearbeitbare Angabe: World Knowledge hat sich seit dem Export geändert.` : preview.mode === "COMMIT" ? "Import abgeschlossen. Das Ergebnis steht unten." : preview.totals.invalid > 0 ? "Fehler gefunden. Bitte den Bericht prüfen; es wird noch nichts übernommen." : preview.totals.conflicts > 0 ? `${preview.totals.conflicts} Angabe(n) brauchen deine Entscheidung. Bestätigte Angaben werden automatisch neu geprüft.` : preview.totals.ready > 0 ? `${preview.totals.ready} Angabe(n) geprüft und bereit. Du kannst sie jetzt übernehmen.` : preview.totals.skipped > 0 ? "Die recherchierten Angaben sind bereits im aktuellen World Knowledge vorhanden. Es gibt nichts Neues zu übernehmen." : "Keine neue Angabe zur Übernahme gefunden."}</div>
    {!!driftedSpots.length && <div className="wk-research-drift"><strong>Deine Recherche ist nicht verloren.</strong><p>Wir laden den aktuellen Stand dieser Spots und prüfen deine Vorschläge dagegen erneut. Nichts wird dabei gespeichert. Prüfe danach mögliche neue Abweichungen bewusst.</p><button className="wk-research-primary" disabled={busy} onClick={() => void refreshBatch()}>Aktuellen Stand laden und erneut prüfen</button></div>}
    {!driftedSpots.length && <div className="wk-research-totals">{Object.entries(preview.totals).filter(([key, value]) => value > 0 && key !== "blocked").map(([key, value]) => <span key={key}><b>{value}</b>{key}</span>)}</div>}{preview.perSpot.map((spot) => <article key={spot.spotId}><h3>{spot.name}</h3>{spot.conflicts.includes("EXPORT_OR_MANIFEST_DRIFT") ? <p className="wk-research-spot-drift">Stand seit dem Export geändert. Für diesen Spot wurde nichts neu übernommen. Lade oben den aktuellen Stand und prüfe deine Vorschläge erneut.</p> : <><p>Übernommen: {spot.imported.length} · Bereit: {spot.ready.length} · Übersprungen: {spot.skipped.length} · Konflikte: {spot.conflicts.length} · Ungelöst: {spot.unresolved.length} · Ungültig: {spot.invalid.length}</p>{!!spot.conflicts.length && <small>Review nötig: {spot.conflicts.join(", ")}</small>}</>}{!!spot.invalid.length && <small>Fehler: {spot.invalid.join(", ")}</small>}
      {!!spot.ready.length && <p>Bereit: {spot.ready.join(", ")}</p>}
      {!!spot.blocked?.length && <p>Zurückgehalten: {spot.blocked.join(" · ")}</p>}
      {!!spot.derived?.length && <p>Zeitzone: Europe/Zurich, aus dem bestätigten Schweizer Standort abgeleitet. Ein bestehender unbekannter Wert benötigt ebenfalls deine Bestätigung.</p>}
      {(reviewOptions[spot.spotId] ?? spot.reviews ?? []).map((review) => { const accepted = confirmations[spot.spotId]?.[review.attributeKey] === review.current.claimId; return <section className="wk-research-review-card" key={review.attributeKey} aria-label={`Prüfung ${review.attributeKey}`}><div className="wk-research-review-heading"><span>Angabe prüfen</span><strong>{review.attributeKey === "classification.primary_category" ? "Hauptkategorie" : review.attributeKey === "purpose.primary_visit" ? "Hauptzweck" : review.attributeKey.replaceAll(".", " · ").replaceAll("_", " ")}</strong></div><div className="wk-research-compare"><div><small>Bisher</small><p>{review.current.knowledgeState === "UNKNOWN" ? "Noch unbekannt" : JSON.stringify(review.current.value)}</p></div><div><small>Neu recherchiert</small><p>{JSON.stringify(review.proposed.value)}</p></div></div><p className="wk-research-evidence">{review.proposed.source.evidence}</p><a href={review.proposed.source.url} target="_blank" rel="noreferrer">Originalquelle prüfen</a><div className="wk-research-review-choice" role="group" aria-label={`Entscheidung für ${review.attributeKey}`}><button type="button" className={accepted ? "is-selected" : ""} aria-pressed={accepted} disabled={busy || preview.mode !== "PREVIEW"} onClick={() => chooseReview(spot.spotId, review, true)}>Neue Angabe übernehmen</button><button type="button" className={!accepted && confirmations[spot.spotId]?.[review.attributeKey] === "" ? "is-selected" : ""} aria-pressed={!accepted && confirmations[spot.spotId]?.[review.attributeKey] === ""} disabled={busy || preview.mode !== "PREVIEW"} onClick={() => chooseReview(spot.spotId, review, false)}>Bisherige behalten</button></div><small>{accepted ? "Neue Angabe ausgewählt; die bisherige bleibt in der Historie." : confirmations[spot.spotId]?.[review.attributeKey] === "" ? "Bisherige Angabe bleibt bestehen; diese neue Angabe wird nicht importiert." : "Bitte entscheide bewusst. Noch wurde nichts gespeichert."}</small></section>; })}
      {spot.location && <fieldset><legend>Standortabgleich · Google Maps</legend><p>{spot.location.message}</p>
        {spot.location.candidates.map((candidate) => <label key={candidate.placeId} style={{ display: "block", padding: "12px 0" }}><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={locations[spot.spotId] === candidate.token} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: candidate.token }))} /> <b>{candidate.name}</b> · {candidate.address}<br /><small>{candidate.latitude}, {candidate.longitude} · </small><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Auf Google Maps prüfen</a></label>)}
        {!!spot.location.candidates.length && <label><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={!locations[spot.spotId]} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: "" }))} /> Koordinaten vorerst unverändert lassen</label>}
        {locations[spot.spotId] && <p>Zusätzlich zu den Rechercheangaben werden zwei Koordinaten übernommen. Die Auswahl ist 15 Minuten gültig.</p>}
      </fieldset>}
    </article>)}{preview.mode === "PREVIEW" && !driftedSpots.length && preview.totals.ready > 0 && <div className="wk-research-footer"><div><strong>{busy || reviewChanged ? "Prüfung läuft" : `${preview.totals.ready} bereit zur Übernahme`}</strong><small>{preview.totals.conflicts > 0 ? `${preview.totals.conflicts} offene Angaben bleiben unverändert.` : "Keine offenen Abweichungen."}</small></div><button className="wk-research-primary" disabled={busy || reviewChanged || preview.totals.invalid > 0} onClick={() => void importBatch()}>Jetzt {preview.totals.ready} geprüfte Angabe(n) übernehmen</button></div>}</div>}
  </section>;
}

function documentElement(text: string, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = filename;
  return link;
}
