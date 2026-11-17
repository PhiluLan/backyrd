"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, EmptyState, ErrorState, FilterBar, LoadingState, SectionCard, StatusBadge } from "@/components/admin/AdminUi";
import { WorldResearchBatchSizeSelect } from "@/components/admin/WorldResearchBatchSizeSelect";
import { useWorldResearchBatchSize } from "@/lib/useWorldResearchBatchSize";
import { supabase } from "@/lib/supabaseClient";

type Facts = { name: string; lat: number; lng: number; category: string; label?: string; address?: string; city?: string; phone?: string; website?: string; hours?: string; equipment: string[]; external_id?: string; attribution?: string[] };
type State = "NEW" | "MATCHED" | "REVIEW" | "MISSING";
type ReviewState = "OPEN" | "REVIEWED" | "DISMISSED" | "EXISTING" | "IMPORTED";
type ReviewAction = "REVIEWED" | "REOPENED";
type Category = { id: string; name: string };
type Filter = ReviewState | "ALL";
type Row = {
  review_state: ReviewState; review_fingerprint: string; review_revision: string;
  imported_spot_id?: string | null; category_id?: string | null; source_id: number; state: State; facts: Facts; previous_facts: Facts | null; checked_at: string;
  spots: { id: string; name: string; address: string | null; status: string; distance_m: number }[];
};
type Run = {
  id: number; status: "FETCHING" | "COMPLETE" | "FAILED"; started_at: string; finished_at: string | null;
  source_count: number | null; release_version?: string | null; outcome: "FETCH_FAILED" | "SNAPSHOT_REJECTED" | null;
};
type Cadence = "DAILY" | "WEEKLY" | "MANUAL";
type SourceSettings = { key: string; enabled: boolean; cadence: Cadence; revision: string; schedule_time_utc: string };
type Preview = { runs: Run[]; rows: Row[]; source: SourceSettings; next_after?: number | null };
type SettingsDraft = Pick<SourceSettings, "enabled" | "cadence">;

const sources = {
  BASEL_PLAYGROUNDS: { label: "Spielplätze", dataset: "100462", credit: "Stadtgärtnerei Basel-Stadt", coverage: "Öffentliche Spielplätze" },
  BASEL_POI: { label: "Kultur, Ausflug & Unterkunft", dataset: "100015", credit: "Geodaten Kanton Basel-Stadt", coverage: "Museen, Bühnen, Aussichtspunkte, Picknickplätze und Unterkünfte" },
  BASEL_SPORT: { label: "Sportanlagen", dataset: "100151", credit: "Geodaten Kanton Basel-Stadt", coverage: "Sporthallen, Schwimmbäder, Eisbahnen, Skateanlagen und Sportplätze" },
  BASEL_OVERTURE: { label: "Overture · Gastro & Nachtleben", dataset: null, credit: "Overture Maps Foundation", coverage: "Restaurants, Cafés, Bars und Clubs in der Stadt Basel" },
} as const;
type SourceKey = keyof typeof sources;
const labels: Record<State, string> = { NEW: "Neuer Vorschlag", MATCHED: "Bereits in Backyrd", REVIEW: "Zuordnung prüfen", MISSING: "Fehlt aktuell in der Quelle" };
const reviewViews: readonly [Filter, string][] = [
  ["OPEN", "Offen"], ["REVIEWED", "Zum Prüfen"], ["IMPORTED", "Angelegt"], ["DISMISSED", "Ausgeblendet"], ["ALL", "Alle"],
];
const cadenceLabels: Record<Cadence, string> = { DAILY: "Täglich", WEEKLY: "Wöchentlich (Montag)", MANUAL: "Nur manuell" };
const overtureCategoryLabels: Readonly<Record<string, string>> = { RESTAURANT: "Restaurant", CAFE: "Café", BAR: "Bar", NIGHTCLUB: "Club" };
const formatTime = new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });

function changes(row: Row) {
  const { facts, previous_facts: before } = row;
  if (!before) return [];
  const fields = [
    { label: "Name", before: before.name, after: facts.name },
    { label: "Koordinaten", before: `${before.lat}, ${before.lng}`, after: `${facts.lat}, ${facts.lng}` },
    { label: "Adresse", before: before.address, after: facts.address },
    { label: "Ort", before: before.city, after: facts.city },
    { label: "Telefon", before: before.phone, after: facts.phone },
    { label: "Website", before: before.website, after: facts.website },
    { label: "Kategorie", before: before.label, after: facts.label },
    { label: "Öffnungszeiten", before: before.hours, after: facts.hours },
    { label: "Ausstattung", before: before.equipment.join(", "), after: facts.equipment.join(", ") },
  ];
  return fields.filter(field => field.before !== field.after);
}

function SourceControls({ settings, onSave, manualSnapshot }: {
  manualSnapshot: boolean;
  settings: SourceSettings;
  onSave: (draft: SettingsDraft) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [cadence, setCadence] = useState(settings.cadence);
  const [saving, setSaving] = useState(false);
  const changed = enabled !== settings.enabled || cadence !== settings.cadence;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    try { await onSave({ enabled, cadence }); }
    finally { setSaving(false); }
  }

  return <form onSubmit={event => void submit(event)}>
    <FilterBar>
      <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={saving} /> Quelle aktiv</label>
      {!manualSnapshot ? <label>Abruf{" "}
        <select aria-label="Abruf" value={cadence} onChange={event => setCadence(event.target.value as Cadence)} disabled={saving}>
          {Object.entries(cadenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label> : null}
      <button className="bi-actionButton" type="submit" disabled={!changed || saving}>{saving ? "Speichert …" : "Einstellungen speichern"}</button>
    </FilterBar>
    {manualSnapshot ? <p>Importiert einen vorbereiteten Monatsstand. Ist die Quelle ausgeschaltet, kann kein neuer Stand übernommen werden.</p>
      : <p>Automatische Abrufe starten um {settings.schedule_time_utc} UTC. Eine ausgeschaltete Quelle pausiert auch manuelle Abrufe.</p>}
  </form>;
}

export default function SpotImportPage() {
  const [sourceKey, setSourceKey] = useState<SourceKey>("BASEL_PLAYGROUNDS");
  return <SourceImport key={sourceKey} sourceKey={sourceKey} onSourceChange={setSourceKey} />;
}

function SourceImport({ sourceKey, onSourceChange }: { sourceKey: SourceKey; onSourceChange: (key: SourceKey) => void }) {
  const metadata = sources[sourceKey];
  const [researchSize, setResearchSize] = useWorldResearchBatchSize();
  const manualSnapshot = sourceKey === "BASEL_OVERTURE";
  const source = manualSnapshot ? "https://docs.overturemaps.org/guides/places/" : `https://data.bs.ch/explore/dataset/${metadata.dataset}/`;
  const license = manualSnapshot ? "https://docs.overturemaps.org/attribution/" : "https://creativecommons.org/licenses/by/4.0/";
  const sourceEntry = (row: Row) => manualSnapshot ? source : sourceKey === "BASEL_POI"
    ? `${source}?q=${encodeURIComponent(row.facts.name)}` : `${source}?refine.id=${row.source_id}`;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pages, setPages] = useState([0]);
  const [uploading, setUploading] = useState(false);
  const cursor = pages.at(-1) ?? 0;
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryChoices, setCategoryChoices] = useState<Record<number, string>>({});
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [heldName, setHeldName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const busy = reviewingId !== null || creatingId !== null;

  useEffect(() => {
    const request = new AbortController();
    void supabase.from("categories").select("id,name").order("name").abortSignal(request.signal).then(({ data }) => {
      if (data && !request.signal.aborted) setCategories(data);
    });
    return () => request.abort();
  }, []);

  const applyPreview = useCallback(({ data, error: failure }: { data: unknown; error: unknown }) => {
    if (failure) setError("Die Importübersicht konnte nicht geladen werden.");
    else { setPreview(data as Preview); setError(""); }
  }, []);
  const requestPreview = useCallback(() => manualSnapshot
    ? supabase.rpc("admin_basel_overture_preview_v1", { p_after: cursor })
    : supabase.rpc("admin_basel_place_source_preview_v1", { p_key: sourceKey }),
  [cursor, manualSnapshot, sourceKey]);
  const reload = useCallback(async () => {
    applyPreview(await requestPreview());
  }, [applyPreview, requestPreview]);

  useEffect(() => {
    const request = new AbortController();
    void requestPreview().abortSignal(request.signal).then(result => {
      if (!request.signal.aborted) applyPreview(result);
    });
    return () => request.abort();
  }, [applyPreview, requestPreview]);

  const fetching = preview?.runs[0]?.status === "FETCHING";
  useEffect(() => {
    if (!fetching) return;
    const timer = window.setInterval(() => { void reload(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [fetching, reload]);

  async function uploadSnapshot(file: File) {
    setUploading(true);
    setError("");
    try {
      if (file.size > 1_800_000) throw new Error("invalid_snapshot");
      const snapshot: unknown = JSON.parse(await file.text());
      if (!snapshot || typeof snapshot !== "object" || !("release" in snapshot)
        || typeof snapshot.release !== "string" || !("rows" in snapshot) || !Array.isArray(snapshot.rows)) {
        throw new Error("invalid_snapshot");
      }
      const { error: failure } = await supabase.rpc("admin_basel_overture_import_v1", {
        p_release: snapshot.release, p_rows: snapshot.rows,
      });
      if (failure) {
        setError(failure.message === "overture_snapshot_release_not_newer"
          ? "Dieser Datenstand ist älter oder unterscheidet sich vom bereits importierten Stand derselben Version."
          : failure.message === "overture_snapshot_incomplete"
          ? "Der neue Stand enthält deutlich weniger Orte. Prüfe den Export, bevor du ihn erneut importierst."
          : "Der Overture-Stand konnte nicht übernommen werden. Prüfe die Datei und ob die Quelle aktiv ist.");
        return;
      }
      if (cursor === 0) await reload();
      else { setPreview(null); setPages([0]); }
    } catch {
      setError("Wähle eine gültige Overture-JSON-Datei mit höchstens 1,8 MB.");
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    setStarting(true);
    try {
      const { error: failure } = await supabase.rpc("admin_basel_place_source_start_v1", { p_key: sourceKey });
      if (failure) throw failure;
      await reload();
    } catch (failure) {
      if (failure && typeof failure === "object" && "code" in failure && failure.code === "55000") {
        await reload();
        setError("Diese Quelle ist ausgeschaltet.");
      } else {
        setError("Der Abruf konnte nicht gestartet werden.");
      }
    } finally {
      setStarting(false);
    }
  }

  async function saveSourceSettings(draft: SettingsDraft) {
    const settings = preview?.source;
    if (!settings) return;
    setError("");
    try {
      const { error: failure } = await supabase.rpc("admin_basel_spot_source_settings_v1", {
        p_source_key: settings.key, p_enabled: draft.enabled, p_cadence: draft.cadence, p_revision: settings.revision,
      });
      if (failure?.code === "40001") {
        await reload();
        setError("Die Einstellungen wurden inzwischen geändert. Bitte prüfe den aktuellen Stand.");
      } else if (failure) {
        setError("Die Einstellungen konnten nicht gespeichert werden.");
      } else {
        await reload();
      }
    } catch {
      setError("Die Einstellungen konnten nicht gespeichert werden.");
    }
  }

  async function createSpot(row: Row) {
    if (busy) return;
    setCreatingId(row.source_id);
    setError("");
    setCreated(null);
    setHeldName(null);
    try {
      const { data, error: failure } = await supabase.rpc("admin_basel_place_source_create_spot_v1", {
        p_key: sourceKey,
        p_source_id: row.source_id,
        p_fingerprint: row.review_fingerprint,
        p_revision: row.review_revision,
        p_category_id: row.category_id ?? categoryChoices[row.source_id] ?? null,
      });
      if (failure?.code === "40001") {
        await reload();
        setError("Der Vorschlag hat sich geändert. Prüfe die aktuellen Angaben und mögliche Duplikate.");
      } else if (failure?.message === "spot_import_category_required") {
        setError("Bitte wähle eine Backyrd-Kategorie für diesen Spot.");
      } else if (failure || typeof data !== "string") {
        setError("Die Übernahme konnte nicht bestätigt werden. Lade die Liste neu oder versuche es erneut.");
      } else {
        setCreated({ id: data, name: row.facts.name });
        await reload();
      }
    } catch {
      setError("Die Übernahme konnte nicht bestätigt werden. Lade die Liste neu oder versuche es erneut.");
    } finally {
      setCreatingId(null);
    }
  }

  async function setReview(row: Row, disposition: ReviewAction) {
    if (busy) return;
    setReviewingId(row.source_id);
    setError("");
    setCreated(null);
    setHeldName(null);
    try {
      const { error: failure } = await supabase.rpc("admin_basel_place_source_review_v1", {
        p_key: sourceKey,
        p_source_id: row.source_id,
        p_fingerprint: row.review_fingerprint,
        p_revision: row.review_revision,
        p_disposition: disposition,
      });
      if (failure?.code === "40001") {
        await reload();
        setError("Der Eintrag wurde inzwischen geändert. Bitte prüfe den aktuellen Stand.");
      } else if (failure) {
        setError("Die Auswahl konnte nicht gespeichert werden.");
      } else {
        if (disposition === "REVIEWED") setHeldName(row.facts.name);
        await reload();
      }
    } catch {
      setError("Die Auswahl konnte nicht gespeichert werden.");
    } finally {
      setReviewingId(null);
    }
  }

  const latest = preview?.runs?.[0];
  const rows = preview?.rows.filter(row => filter === "ALL" || row.review_state === filter) ?? [];
  return (
    <div className="bi-page admin-page">
      <AdminPageHeader eyebrow="Spots" title="Ortsimporte"
        description="Grundangaben aus Ortsquellen prüfen und neue Spots direkt übernehmen."
        actions={<>
          <Link className="bi-actionButton" href="/spots">Zu den Spots</Link>
          <Link className="bi-actionButton" href="/world-knowledge">Zur Spot-Recherche</Link>
          {!manualSnapshot ? <button className="bi-primaryButton" type="button" disabled={starting || fetching || !preview?.source.enabled}
            onClick={() => void start()}>{starting || fetching ? "Abruf läuft …" : "Jetzt abrufen"}</button> : null}
        </>} />
      <FilterBar>
        <label>Quelle{" "}
          <select aria-label="Quelle" value={sourceKey} onChange={event => onSourceChange(event.target.value as SourceKey)}>
            {Object.entries(sources).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
      </FilterBar>
      <SectionCard title="Spot-Recherche" description="Diese Einstellung gilt für den automatischen Recherche-Durchlauf. Beim Quellenabruf wird der gesamte Datensatz eingelesen.">
        <FilterBar><WorldResearchBatchSizeSelect size={researchSize} onChange={setResearchSize} /></FilterBar>
      </SectionCard>
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {created ? <p className="by-alert" role="status"><strong>{created.name}</strong> ist freigegeben. <Link href={`/spots/${created.id}/edit`}>Spot öffnen</Link></p> : null}
      {heldName ? <p className="by-alert" role="status"><strong>{heldName}</strong> liegt jetzt unter «Zum Prüfen».</p> : null}
      {!preview && !error ? <LoadingState /> : null}
      {preview ? <>
        <SectionCard title={metadata.label} description={metadata.coverage}>
          <p><a href={source}>Datensatz aufrufen</a> · {metadata.credit} · <a href={license}>{manualSnapshot ? "Lizenzen und Quellen" : "CC BY 4.0"}</a></p>
          <StatusBadge tone={preview.source.enabled ? "success" : "neutral"}>{preview.source.enabled ? "Aktiv" : "Ausgeschaltet"}</StatusBadge>
          <SourceControls key={preview.source.revision} settings={preview.source} onSave={saveSourceSettings} manualSnapshot={manualSnapshot} />
          {manualSnapshot ? <label>Overture-Stand importieren{" "}
            <input type="file" accept=".json,application/json" disabled={uploading || !preview.source.enabled} onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadSnapshot(file);
            }} />
            {uploading ? <span role="status">Wird importiert …</span> : null}
          </label> : null}
          {latest ? <p role="status">
            {formatTime.format(new Date(latest.started_at))} · {latest.status === "FETCHING" ? "Abruf läuft"
              : latest.status === "COMPLETE" ? `${latest.source_count} Einträge eingelesen${latest.release_version ? ` · Stand ${latest.release_version}` : ""}`
              : latest.outcome === "SNAPSHOT_REJECTED" ? "Quelle war unvollständig oder lieferte ungültige Daten. Letzter vollständiger Stand bleibt sichtbar."
              : "Abruf fehlgeschlagen. Letzter vollständiger Stand bleibt sichtbar."}
          </p> : <p>{manualSnapshot ? "Der erste Import steht noch aus." : "Der erste Abruf steht noch aus."}</p>}
        </SectionCard>

          <FilterBar resultLabel={`${rows.length} Einträge${manualSnapshot ? " auf dieser Seite" : ""}`}>
            {manualSnapshot ? <>
              <button className="bi-actionButton" type="button" disabled={pages.length <= 1} onClick={() => { setPreview(null); setPages(pages.slice(0, -1)); }}>Zurück</button>
              <span>Seite {pages.length}</span>
              <button className="bi-actionButton" type="button" disabled={!preview.next_after} onClick={() => {
                const next = preview.next_after;
                if (next) { setPreview(null); setPages([...pages, next]); }
              }}>Weiter</button>
            </> : null}
            <label>Ansicht{" "}
              <select value={filter} onChange={event => setFilter(event.target.value as Filter)}>
                {reviewViews.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </FilterBar>
          {rows.length === 0 ? <EmptyState title={filter === "OPEN" ? "Keine offenen Vorschläge" : "Keine Einträge in dieser Ansicht"}
              description={manualSnapshot ? "Auf dieser Seite gibt es in der gewählten Ansicht keine Einträge." : filter === "OPEN" ? "Neue oder geänderte Vorschläge siehst du beim nächsten erfolgreichen Abruf hier." : "In dieser Ansicht sind gerade keine Vorschläge."} />
            : <SectionCard title="Vorschläge">
              {rows.map(row => <details key={row.source_id}>
                <summary>
                  <strong>{row.facts.name}</strong>{" "}
                  {row.review_state !== "IMPORTED" ? <StatusBadge tone={row.state === "REVIEW" ? "warning" : row.state === "NEW" ? "info" : "neutral"}>{labels[row.state]}</StatusBadge> : null}
                  {row.previous_facts ? <> <StatusBadge tone="info">Quellenänderung</StatusBadge></> : null}
                  {row.review_state === "REVIEWED" ? <> <StatusBadge tone="warning">Zum Prüfen</StatusBadge></> : null}
                  {row.review_state === "DISMISSED" ? <> <StatusBadge>Ausgeblendet</StatusBadge></> : null}
                  {row.review_state === "IMPORTED" ? <> <StatusBadge tone="success">Angelegt</StatusBadge></> : null}
                </summary>
                <p>{row.facts.label ?? overtureCategoryLabels[row.facts.category] ?? row.facts.category} · {row.facts.lat.toFixed(5)}, {row.facts.lng.toFixed(5)} · geprüft am {formatTime.format(new Date(row.checked_at))}</p>
                <p>Öffnungszeiten gemäss Quelle: {row.facts.hours ?? "Keine Angabe"}</p>
                {row.facts.address || row.facts.city ? <p>{[row.facts.address, row.facts.city].filter(Boolean).join(", ")}</p> : null}
                {row.facts.phone ? <p>Telefon gemäss Quelle: {row.facts.phone}</p> : null}
                {row.facts.website ? <p>Website gemäss Quelle: {row.facts.website}</p> : null}
                {row.facts.equipment.length > 0 ? <p>Ausstattung: {row.facts.equipment.join(", ")}</p> : null}
                <p><a href={sourceEntry(row)}>{manualSnapshot ? "Datensatz ansehen" : "Quelleneintrag ansehen"}</a>{row.facts.external_id ? <> · GERS-ID {row.facts.external_id}</> : null}</p>
                <p>{row.facts.attribution?.join(", ") || metadata.credit} · <a href={license}>Lizenzhinweise</a></p>
                {changes(row).map(field => <p key={field.label}>{field.label}: {field.before || "Keine Angabe"} → {field.after || "Keine Angabe"}</p>)}
                {row.spots.filter(spot => spot.id !== row.imported_spot_id).map(spot => <p key={spot.id}>
                  <Link href={`/spots/${spot.id}/edit`}>{spot.name}</Link> · {spot.address ?? "Keine Adresse"} · {spot.distance_m} m{spot.status === "archived" ? " · Archiviert" : ""}
                </p>)}
                {row.state === "NEW" && !row.category_id && (row.review_state === "OPEN" || row.review_state === "REVIEWED") ? (
                  <p><label>Backyrd-Kategorie{" "}
                    <select value={categoryChoices[row.source_id] ?? ""} disabled={busy}
                      onChange={event => setCategoryChoices({ ...categoryChoices, [row.source_id]: event.target.value })}>
                      <option value="">Bitte auswählen</option>
                      {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label></p>
                ) : null}
                <div className="admin-pageActions" aria-busy={reviewingId === row.source_id || creatingId === row.source_id}>
                  {row.imported_spot_id ? (
                    <Link className="bi-actionButton" href={`/spots/${row.imported_spot_id}/edit`}>Spot öffnen</Link>
                  ) : null}
                  {row.review_state === "OPEN" ? (
                    <button className="bi-actionButton" type="button" disabled={busy}
                      onClick={() => void setReview(row, "REVIEWED")}>{reviewingId === row.source_id ? "Speichert …" : "On hold"}</button>
                  ) : null}
                  {row.review_state === "REVIEWED" || row.review_state === "DISMISSED" ? (
                    <button className="bi-actionButton" type="button" disabled={busy}
                      onClick={() => void setReview(row, "REOPENED")}>Zurück zu Offen</button>
                  ) : null}
                  {row.state === "NEW" && (row.review_state === "OPEN" || row.review_state === "REVIEWED") ? (
                    <button className="bi-primaryButton" type="button"
                      disabled={busy || !(row.category_id ?? categoryChoices[row.source_id])}
                      onClick={() => void createSpot(row)}>{creatingId === row.source_id ? "Wird angelegt …" : "Spot anlegen"}</button>
                  ) : null}
                </div>
                {row.state === "NEW" && (row.review_state === "OPEN" || row.review_state === "REVIEWED") ? (
                  <p>Der Spot erscheint sofort als freigegeben in der Spotliste.</p>
                ) : null}
              </details>)}
            </SectionCard>}
      </> : null}
    </div>
  );
}
