"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, EmptyState, ErrorState, FilterBar, LoadingState, SectionCard, StatusBadge } from "@/components/admin/AdminUi";
import { supabase } from "@/lib/supabaseClient";
import { SpotForm } from "../SpotForm";

type Facts = { name: string; lat: number; lng: number; category: "PLAYGROUND"; hours?: string; equipment: string[] };
type State = "NEW" | "MATCHED" | "REVIEW" | "MISSING";
type ReviewState = "OPEN" | "REVIEWED" | "DISMISSED" | "EXISTING";
type ReviewAction = "REVIEWED" | "DISMISSED" | "REOPENED";
type Filter = ReviewState | "ALL";
type Row = {
  review_state: ReviewState; review_fingerprint: string; review_revision: string;
  source_id: number; state: State; facts: Facts; previous_facts: Facts | null; checked_at: string;
  spots: { id: string; name: string; address: string | null; status: string; distance_m: number }[];
};
type Run = {
  id: number; status: "FETCHING" | "COMPLETE" | "FAILED"; started_at: string; finished_at: string | null;
  source_count: number | null; outcome: "FETCH_FAILED" | "SNAPSHOT_REJECTED" | null;
};
type Cadence = "DAILY" | "WEEKLY" | "MANUAL";
type SourceSettings = { key: string; enabled: boolean; cadence: Cadence; revision: string; schedule_time_utc: string };
type Preview = { category_id: string | null; runs: Run[]; rows: Row[]; source: SourceSettings };
type SettingsDraft = Pick<SourceSettings, "enabled" | "cadence">;

const source = "https://data.bs.ch/explore/dataset/100462/";
const labels: Record<State, string> = { NEW: "Neuer Vorschlag", MATCHED: "Bereits in Backyrd", REVIEW: "Zuordnung prüfen", MISSING: "Fehlt aktuell in der Quelle" };
const reviewViews: readonly [Filter, string][] = [
  ["OPEN", "Offen"], ["REVIEWED", "Geprüft"], ["DISMISSED", "Ausgeblendet"], ["ALL", "Alle"],
];
const cadenceLabels: Record<Cadence, string> = { DAILY: "Täglich", WEEKLY: "Wöchentlich (Montag)", MANUAL: "Nur manuell" };
const formatTime = new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });

function changes(row: Row) {
  const { facts, previous_facts: before } = row;
  if (!before) return [];
  const fields = [
    { label: "Name", before: before.name, after: facts.name },
    { label: "Koordinaten", before: `${before.lat}, ${before.lng}`, after: `${facts.lat}, ${facts.lng}` },
    { label: "Öffnungszeiten", before: before.hours, after: facts.hours },
    { label: "Ausstattung", before: before.equipment.join(", "), after: facts.equipment.join(", ") },
  ];
  return fields.filter(field => field.before !== field.after);
}

function SourceControls({ settings, onSave }: {
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
      <label>Abruf{" "}
        <select aria-label="Abruf" value={cadence} onChange={event => setCadence(event.target.value as Cadence)} disabled={saving}>
          {Object.entries(cadenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button className="bi-actionButton" type="submit" disabled={!changed || saving}>{saving ? "Speichert …" : "Einstellungen speichern"}</button>
    </FilterBar>
    <p>Automatische Abrufe starten um {settings.schedule_time_utc} UTC. Eine ausgeschaltete Quelle pausiert auch manuelle Abrufe.</p>
  </form>;
}

export default function SpotImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [selected, setSelected] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  const applyPreview = useCallback(({ data, error: failure }: { data: unknown; error: unknown }) => {
    if (failure) setError("Die Importübersicht konnte nicht geladen werden.");
    else { setPreview(data as Preview); setError(""); }
  }, []);
  const reload = useCallback(async () => {
    applyPreview(await supabase.rpc("admin_basel_spot_source_preview_v3"));
  }, [applyPreview]);

  useEffect(() => {
    const request = new AbortController();
    void supabase.rpc("admin_basel_spot_source_preview_v3").abortSignal(request.signal).then(result => {
      if (!request.signal.aborted) applyPreview(result);
    });
    return () => request.abort();
  }, [applyPreview]);

  const fetching = preview?.runs[0]?.status === "FETCHING";
  useEffect(() => {
    if (!fetching) return;
    const timer = window.setInterval(() => { void reload(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [fetching, reload]);

  async function start() {
    setStarting(true);
    try {
      const { error: failure } = await supabase.rpc("admin_basel_spot_source_start_v1");
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

  async function openDraft(sourceId: number) {
    setOpeningId(sourceId);
    setError("");
    try {
      const { data, error: failure } = await supabase.rpc("admin_basel_spot_source_preview_v3", { p_source_id: sourceId });
      if (failure) throw failure;
      const row = (data as Preview).rows[0];
      if (row?.state !== "NEW") {
        await reload();
        setError("Der Vorschlag hat sich geändert. Prüfe seine Zuordnung in der Übersicht.");
        return;
      }
      setSelected(row);
      window.scrollTo({ top: 0 });
    } catch {
      setError("Der Vorschlag konnte nicht erneut geprüft werden.");
    } finally {
      setOpeningId(null);
    }
  }

  async function setReview(row: Row, disposition: ReviewAction) {
    setReviewingId(row.source_id);
    setError("");
    try {
      const { error: failure } = await supabase.rpc("admin_basel_spot_source_set_review_v1", {
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
        description="Spielplätze aus Basel-Stadt finden, Änderungen prüfen und neue Spots vorbereitet öffnen."
        actions={<>
          <Link className="bi-actionButton" href="/spots">Zu den Spots</Link>
          <button className="bi-primaryButton" type="button" disabled={starting || fetching || !preview?.source.enabled}
            onClick={() => void start()}>{starting || fetching ? "Abruf läuft …" : "Jetzt abrufen"}</button>
        </>} />
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {!preview && !error ? <LoadingState /> : null}
      {preview ? <>
        <SectionCard title="Open Data Basel-Stadt" description="Abdeckung: öffentliche Spielplätze im Kanton Basel-Stadt.">
          <p><a href={source}>Spielen in Basel: Spielplätze</a> · Stadtgärtnerei Basel-Stadt · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p>
          <StatusBadge tone={preview.source.enabled ? "success" : "neutral"}>{preview.source.enabled ? "Aktiv" : "Ausgeschaltet"}</StatusBadge>
          <SourceControls key={preview.source.revision} settings={preview.source} onSave={saveSourceSettings} />
          {latest ? <p role="status">
            {formatTime.format(new Date(latest.started_at))} · {latest.status === "FETCHING" ? "Abruf läuft"
              : latest.status === "COMPLETE" ? `${latest.source_count} Einträge geprüft`
              : latest.outcome === "SNAPSHOT_REJECTED" ? "Quelle war unvollständig oder lieferte ungültige Daten. Letzter vollständiger Stand bleibt sichtbar."
              : "Abruf fehlgeschlagen. Letzter vollständiger Stand bleibt sichtbar."}
          </p> : <p>Der erste Abruf steht noch aus.</p>}
        </SectionCard>

        {selected ? <SectionCard title={`Spot anlegen · ${selected.facts.name}`} description="Der Spot ist zum Prüfen vorausgefüllt. Öffnungszeiten und Ausstattung siehst du mit Quellenbeleg in der Übersicht.">
          <p><button className="bi-actionButton" type="button" onClick={() => setSelected(null)}>Zurück zu den Vorschlägen</button></p>
          <p><a href={`${source}?refine.id=${selected.source_id}`}>Quelle ansehen</a> · Öffnungszeiten gemäss Quelle: {selected.facts.hours ?? "Keine Angabe"}</p>
          <p>Beim Publizieren die Quelle im Spot-Knowledge angeben: Stadtgärtnerei Basel-Stadt, CC BY 4.0.</p>
          {selected.facts.equipment.length > 0 ? <p>Ausstattung: {selected.facts.equipment.join(", ")}</p> : null}
          <SpotForm key={selected.source_id} mode="create" initialValues={{
            name: selected.facts.name, lat: selected.facts.lat, lng: selected.facts.lng, city: null, country: "Switzerland",
            address: null, category_id: preview.category_id, header_photo_path: null, website: null, phone: null, email: null, price_level: null,
            google_place_id: null, google_photo_enabled: false, status: "pending",
          }} onSaved={() => { setSelected(null); void reload(); }} />
        </SectionCard> : <>
          <FilterBar resultLabel={`${rows.length} Einträge`}>
            <label>Ansicht{" "}
              <select value={filter} onChange={event => setFilter(event.target.value as Filter)}>
                {reviewViews.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </FilterBar>
          {rows.length === 0 ? <EmptyState title={filter === "OPEN" ? "Keine offenen Vorschläge" : "Keine Einträge in dieser Ansicht"}
              description={filter === "OPEN" ? "Neue oder geänderte Vorschläge siehst du beim nächsten erfolgreichen Abruf hier." : "In dieser Ansicht sind gerade keine Vorschläge."} />
            : <SectionCard title="Vorschläge">
              {rows.map(row => <details key={row.source_id}>
                <summary>
                  <strong>{row.facts.name}</strong>{" "}
                  <StatusBadge tone={row.state === "REVIEW" ? "warning" : row.state === "NEW" ? "info" : "neutral"}>{labels[row.state]}</StatusBadge>
                  {row.previous_facts ? <> <StatusBadge tone="info">Quellenänderung</StatusBadge></> : null}
                  {row.review_state === "REVIEWED" || row.review_state === "DISMISSED" ? <> <StatusBadge>
                    {row.review_state === "REVIEWED" ? "Geprüft" : "Ausgeblendet"}
                  </StatusBadge></> : null}
                </summary>
                <p>Spielplatz · {row.facts.lat.toFixed(5)}, {row.facts.lng.toFixed(5)} · geprüft am {formatTime.format(new Date(row.checked_at))}</p>
                <p>Öffnungszeiten gemäss Quelle: {row.facts.hours ?? "Keine Angabe"}</p>
                {row.facts.equipment.length > 0 ? <p>Ausstattung: {row.facts.equipment.join(", ")}</p> : null}
                <p><a href={`${source}?refine.id=${row.source_id}`}>Quelleneintrag ansehen</a></p>
                {changes(row).map(field => <p key={field.label}>{field.label}: {field.before || "Keine Angabe"} → {field.after || "Keine Angabe"}</p>)}
                {row.spots.map(spot => <p key={spot.id}>
                  <Link href={`/spots/${spot.id}/edit`}>{spot.name}</Link> · {spot.address ?? "Keine Adresse"} · {spot.distance_m} m{spot.status === "archived" ? " · Archiviert" : ""}
                </p>)}
                <div className="admin-pageActions" aria-busy={reviewingId === row.source_id}>
                  {row.review_state === "OPEN" ? <>
                    <button className="bi-actionButton" type="button" disabled={reviewingId !== null}
                      onClick={() => void setReview(row, "REVIEWED")}>Als geprüft markieren</button>
                    <button className="bi-actionButton" type="button" disabled={reviewingId !== null}
                      onClick={() => void setReview(row, "DISMISSED")}>Ausblenden</button>
                  </> : <button className="bi-actionButton" type="button" disabled={reviewingId !== null}
                    onClick={() => void setReview(row, "REOPENED")}>In die Arbeitsliste</button>}
                </div>
                {row.state === "NEW" && row.review_state === "OPEN" ? <p><button className="bi-actionButton" type="button" disabled={openingId !== null} onClick={() => void openDraft(row.source_id)}>{openingId === row.source_id ? "Wird geprüft …" : "Spot-Editor öffnen"}</button></p> : null}
              </details>)}
            </SectionCard>}
        </>}
      </> : null}
    </div>
  );
}
