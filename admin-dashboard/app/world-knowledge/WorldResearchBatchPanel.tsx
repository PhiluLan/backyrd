"use client";

import { useMemo, useRef, useState } from "react";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import { findResearchPlaces, type ResearchPlace } from "./WorldAddressPicker";
import { refreshResearchDocument } from "./researchBatchRefresh.mjs";
import type { ResearchReview } from "@backyrd/world-knowledge-core";
import styles from "./WorldResearchBatchPanel.module.css";

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
    setMessage("Aktueller World-Stand geladen. Deine recherchierten Vorschläge wurden neu geprüft.");
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
  const alreadyCurrent = preview?.mode === "PREVIEW" && !driftedSpots.length && preview.totals.ready === 0
    && preview.totals.conflicts === 0 && preview.totals.invalid === 0 && preview.totals.blocked === 0 && preview.totals.skipped > 0;
  const catalog = useMemo(() => {
    try {
      const fields = (JSON.parse(json) as { fieldCatalog?: Array<{ attributeKey: string; label: string; allowedValues?: Array<{ value: string; label: string }> }> }).fieldCatalog ?? [];
      return Object.fromEntries(fields.map((field) => [field.attributeKey, field]));
    } catch { return {}; }
  }, [json]);
  const fieldLabel = (key: string) => catalog[key]?.label ?? key.replaceAll(".", " · ").replaceAll("_", " ");
  const displayValue = (key: string, value: unknown) => {
    const labels = new Map(catalog[key]?.allowedValues?.map((option) => [option.value, option.label]) ?? []);
    if (typeof value === "string") return labels.get(value) ?? value;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.map((item) => labels.get(item) ?? item).join(", ");
    return JSON.stringify(value);
  };
  const startNewBatch = () => {
    setQuery(""); setResults([]); setSelected([]); setJson(""); setPreview(null); setReviewOptions({});
    setLocations({}); setConfirmations({}); setReviewChanged(false); setCompletion(null); setMessage("");
    setUploadKey((current) => current + 1);
    panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  return <section className={styles.shell} ref={panelRef}>
    <header className={styles.header}><span className={styles.eyebrow}>RECHERCHE SPOT</span><h2>Wissen ergänzen.</h2><p>Spots auswählen, extern recherchieren und geprüfte Angaben bewusst übernehmen.</p></header>
    <nav className={styles.steps} aria-label="Fortschritt"><span className={!json ? styles.activeStep : ""}>1 <b>Auswählen</b></span><span className={json && !preview ? styles.activeStep : ""}>2 <b>Prüfen</b></span><span className={preview || completion ? styles.activeStep : ""}>3 <b>Übernehmen</b></span></nav>
    {completion ? <div className={styles.outcome} role="status"><span className={styles.outcomeIcon} aria-hidden="true">✓</span><h3>Alles erledigt.</h3><p>{completion.imported} {completion.imported === 1 ? "Angabe" : "Angaben"} für {completion.spots} {completion.spots === 1 ? "Spot" : "Spots"} übernommen und im World-Reader verifiziert.</p><button className={styles.primary} onClick={startNewBatch}>Neue Recherche starten</button></div> : <>
      {!json && <div className={styles.stage}><div className={styles.stageHeading}><div><span className={styles.stepNumber}>01</span><h3>Welche Spots?</h3></div><span>{selected.length} von 10</span></div><p>Wähle bis zu zehn Spots. Der Export enthält den aktuellen World-Stand, nicht alte Spot-Felder.</p><div className={styles.search}><input aria-label="Spot suchen" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Spot suchen" onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><button disabled={busy} onClick={() => void search()}>Suchen</button></div>{!!results.length && <div className={styles.results}>{results.map((spot) => <label key={spot.spotId}><input type="checkbox" checked={selected.some((item) => item.spotId === spot.spotId)} disabled={!selected.some((item) => item.spotId === spot.spotId) && selected.length >= 10} onChange={() => toggle(spot)} /><span><b>{spot.name}</b><small>{spot.city ?? "Ort nicht gepflegt"}</small></span></label>)}</div>}{!!selected.length && <div className={styles.chips}>{selected.map((spot) => <button key={spot.spotId} onClick={() => toggle(spot)} aria-label={`${spot.name} entfernen`}>{spot.name} <span aria-hidden="true">×</span></button>)}</div>}<button className={styles.primary} disabled={busy || !selected.length} onClick={() => void exportBatch()}>Recherche-Datei herunterladen <span aria-hidden="true">↗</span></button></div>}
      {!preview && <div className={styles.stage}><div className={styles.stageHeading}><div><span className={styles.stepNumber}>02</span><h3>Recherche einfügen</h3></div></div><p>Die exportierte Datei extern recherchieren lassen. Nicht belegte Angaben bleiben offen.</p><label className={styles.upload}>Recherchierte JSON-Datei auswählen<input key={uploadKey} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { setCompletion(null); setJson(text); setPreview(null); setReviewOptions({}); setConfirmations({}); }); }} /></label>{!!json && <p className={styles.note}>Datei geladen. Die Recherche wird erst nach deiner Prüfung gespeichert.</p>}<details className={styles.details}><summary>JSON stattdessen einfügen oder ansehen</summary><textarea className={styles.json} value={json} onChange={(event) => { setCompletion(null); setJson(event.target.value); setPreview(null); setReviewOptions({}); setConfirmations({}); }} placeholder="Vollständiges Recherche-JSON einfügen …" spellCheck={false} /></details>{!!json && <><button className={styles.primary} disabled={busy} onClick={() => void previewBatch()}>JSON prüfen</button><button className={styles.secondary} onClick={startNewBatch}>Andere Spots auswählen</button></>}</div>}
      {message && !alreadyCurrent && <p className={styles.message} role="status">{message}</p>}
      {preview && <div className={styles.report}>
        {driftedSpots.length > 0 ? <div className={styles.outcome} role="status"><span className={styles.outcomeIcon} aria-hidden="true">↻</span><h3>Der Stand hat sich geändert.</h3><p>World Knowledge wurde für {driftedSpots.map((spot) => spot.name).join(" und ")} seit dem Export aktualisiert. Deine Recherche bleibt erhalten; wir prüfen sie gegen den neuesten Stand. Dabei wird nichts gespeichert.</p><button className={styles.primary} disabled={busy} onClick={() => void refreshBatch()}>Aktuellen Stand laden</button></div> : alreadyCurrent ? <div className={styles.outcome} role="status"><span className={styles.outcomeIcon} aria-hidden="true">✓</span><h3>Alles bereits aktuell.</h3><p>{preview.totals.skipped} {preview.totals.skipped === 1 ? "Angabe ist" : "Angaben sind"} schon in World Knowledge vorhanden.{preview.totals.unresolved > 0 ? ` ${preview.totals.unresolved} ${preview.totals.unresolved === 1 ? "Angabe bleibt" : "Angaben bleiben"} bewusst offen.` : ""} Du musst nichts mehr übernehmen.</p><button className={styles.primary} onClick={startNewBatch}>Neue Recherche starten</button></div> : <div className={styles.status} role="status"><span>{busy || reviewChanged ? "Wird geprüft" : preview.totals.invalid > 0 ? "Fehler prüfen" : preview.totals.conflicts > 0 ? "Deine Entscheidung ist gefragt" : preview.totals.ready > 0 ? "Bereit zur Übernahme" : "Keine neuen Angaben"}</span><h3>{busy || reviewChanged ? "Einen Moment …" : preview.totals.invalid > 0 ? "Eine Angabe konnte nicht verarbeitet werden." : preview.totals.conflicts > 0 ? `${preview.totals.conflicts} ${preview.totals.conflicts === 1 ? "Angabe braucht" : "Angaben brauchen"} deine Entscheidung.` : preview.totals.ready > 0 ? `${preview.totals.ready} ${preview.totals.ready === 1 ? "Angabe ist" : "Angaben sind"} geprüft.` : "Nichts zu übernehmen."}</h3><p>{preview.totals.conflicts > 0 ? "Vergleiche bisheriges Wissen und Recherche direkt unten. Deine Wahl wird automatisch neu geprüft." : preview.totals.ready > 0 ? "Prüfe die Angaben und übernimm sie dann mit einem Schritt." : "Die Details stehen unten."}</p></div>}
        {!driftedSpots.length && preview.perSpot.map((spot) => <article className={styles.spot} key={spot.spotId}><header><h3>{spot.name}</h3><span>{spot.conflicts.length > 0 ? `${spot.conflicts.length} zu prüfen` : spot.ready.length > 0 ? `${spot.ready.length} bereit` : "Aktuell"}</span></header>{!!spot.invalid.length && <p className={styles.error}>Fehler: {spot.invalid.join(" · ")}</p>}{!!spot.blocked?.length && <p className={styles.note}>Zurückgehalten: {spot.blocked.join(" · ")}</p>}{!!spot.derived?.length && <p className={styles.note}>Zeitzone Europe/Zurich wurde aus dem bestätigten Schweizer Standort abgeleitet. Ein bisher unbekannter Wert braucht deine Bestätigung.</p>}{(reviewOptions[spot.spotId] ?? spot.reviews ?? []).map((review) => { const accepted = confirmations[spot.spotId]?.[review.attributeKey] === review.current.claimId; const kept = confirmations[spot.spotId]?.[review.attributeKey] === ""; return <section className={styles.review} key={review.attributeKey} aria-label={`Prüfung ${review.attributeKey}`}><span className={styles.eyebrow}>ENTSCHEIDUNG</span><h4>{fieldLabel(review.attributeKey)}</h4><div className={styles.comparison}><div><small>Bisher</small><strong>{review.current.knowledgeState === "UNKNOWN" ? "Noch unbekannt" : displayValue(review.attributeKey, review.current.value)}</strong></div><div><small>Recherchiert</small><strong>{displayValue(review.attributeKey, review.proposed.value)}</strong></div></div><p>{review.proposed.source.evidence}</p><a href={review.proposed.source.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a><div className={styles.choices} role="group" aria-label={`Entscheidung für ${fieldLabel(review.attributeKey)}`}><button type="button" className={accepted ? styles.chosen : ""} aria-pressed={accepted} disabled={busy || preview.mode !== "PREVIEW"} onClick={() => chooseReview(spot.spotId, review, true)}>Neue Angabe übernehmen</button><button type="button" className={kept ? styles.chosen : ""} aria-pressed={kept} disabled={busy || preview.mode !== "PREVIEW"} onClick={() => chooseReview(spot.spotId, review, false)}>Bisherige behalten</button></div><small className={styles.note}>{accepted ? "Neu gewählt. Der bisherige Wert bleibt in der Historie." : kept ? "Bisheriger Wert bleibt. Der Vorschlag wird nicht importiert." : "Noch nichts gespeichert."}</small></section>; })}{spot.location && <fieldset className={styles.location}><legend>Standort abgleichen</legend><p>{spot.location.message}</p>{spot.location.candidates.map((candidate) => <label key={candidate.placeId}><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={locations[spot.spotId] === candidate.token} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: candidate.token }))} /><span><b>{candidate.name}</b><small>{candidate.address} · {candidate.latitude}, {candidate.longitude}</small><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Auf Google Maps prüfen ↗</a></span></label>)}{!!spot.location.candidates.length && <label><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={!locations[spot.spotId]} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: "" }))} /><span>Koordinaten unverändert lassen</span></label>}{locations[spot.spotId] && <p className={styles.note}>Die zwei Koordinaten werden mit übernommen. Diese Auswahl ist 15 Minuten gültig.</p>}</fieldset>}{!!spot.ready.length && <details className={styles.details}><summary>{spot.ready.length} {spot.ready.length === 1 ? "bereite Angabe" : "bereite Angaben"} ansehen</summary><ul>{spot.ready.map((key) => <li key={key}>{fieldLabel(key)}</li>)}</ul></details>}{!!spot.unresolved.length && <details className={styles.details}><summary>{spot.unresolved.length} {spot.unresolved.length === 1 ? "offene Angabe" : "offene Angaben"} ansehen</summary><ul>{spot.unresolved.map((key) => <li key={key}>{fieldLabel(key)}</li>)}</ul></details>}</article>)}
        <details className={styles.audit}><summary>Prüfprotokoll ansehen</summary><p>Übernommen: {preview.totals.imported || 0} · Bereit: {preview.totals.ready || 0} · Bereits vorhanden: {preview.totals.skipped || 0} · Konflikte: {preview.totals.conflicts || 0} · Zurückgehalten: {preview.totals.blocked || 0} · Ungültig: {preview.totals.invalid || 0} · Offen: {preview.totals.unresolved || 0}</p>{preview.perSpot.map((spot) => <p key={spot.spotId}>{spot.name}: {spot.conflicts.join(", ") || "keine Konflikte"}</p>)}<button disabled={busy} onClick={() => void previewBatch()}>Import erneut prüfen</button></details>
        {preview.mode === "PREVIEW" && !driftedSpots.length && preview.totals.ready > 0 && <div className={styles.footer}><span>{preview.totals.conflicts > 0 ? `${preview.totals.conflicts} offene Angaben bleiben unverändert.` : "Nur geprüfte Angaben werden gespeichert."}</span><button className={styles.primary} disabled={busy || reviewChanged || preview.totals.invalid > 0} onClick={() => void importBatch()}>Jetzt {preview.totals.ready} geprüfte Angabe(n) übernehmen</button></div>}
      </div>}
    </>}
  </section>;
}

function documentElement(text: string, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = filename;
  return link;
}
