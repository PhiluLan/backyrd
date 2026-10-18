"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { loadSpotBrowseMoods, loadSpotReviewCounts } from "@/lib/mood-catalog";
import { moodExpressionKey, type BrowseMood } from "../../../packages/shared/src/presentation/mood";
import { MoodSignature } from "./mood-signature";
import moodStyles from "./mood-experience.module.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { getCatalog, type CatalogSpot } from "@/lib/consumer-api";
import { ArrowIcon, ListIcon, MapIcon, SearchIcon } from "./icons";
import { Chip, StateView } from "./ui";
import { ConsumerSpotCard } from "./spot-card";
import { MapCanvas } from "./map-canvas";

export function PlacesExperience() {
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [mood, setMood] = useState<string | null>(null);
  const [moodRows, setMoodRows] = useState<BrowseMood[]>([]);
  const [moodLoading, setMoodLoading] = useState(true);
  const [moodFailed, setMoodFailed] = useState(false);
  const [moodRevision, setMoodRevision] = useState(0);
  useEffect(() => { setMood(new URLSearchParams(window.location.search).get("mood")); }, []);
  const [spots, setSpots] = useState<CatalogSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [queryMoodLoading, setQueryMoodLoading] = useState(false);
  const [queryMood, setQueryMood] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setQueryMood(null);
    setQueryMoodLoading(Boolean(query.trim()));
    const timer = setTimeout(() => {
      if (!query.trim()) return;
      void (async () => {
        const timeout = setTimeout(() => abort.abort(), 8000);
        try {
          const { data, error } = await supabase.rpc("backyrd_resolve_mood_input_v2", { p_input: query.trim() }).abortSignal(abort.signal);
          if (active && !error && data?.status === "RESOLVED" && typeof data.conceptKey === "string") setQueryMood(data.conceptKey);
        } catch { /* Plain text search remains available if Mood resolution fails. */ }
        finally { clearTimeout(timeout); if (active) setQueryMoodLoading(false); }
      })();
    }, 200);
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  }, [query]);
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<CatalogSpot | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSpots(await getCatalog({ city: "Basel", limit: 500 }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    setMoodFailed(false);
    setMoodLoading(true);
    setReviewCounts({});
    void loadSpotReviewCounts(spots.map(spot => spot.id)).then(rows => { if (active) setReviewCounts(rows); }).catch(() => {});
    void loadSpotBrowseMoods(spots.map(spot => spot.id)).then(rows => { if (active) setMoodRows(rows); }).catch(() => { if (active) setMoodFailed(true); }).finally(() => { if (active) setMoodLoading(false); });
    return () => { active = false; };
  }, [spots, moodRevision]);
  const moodOptions = useMemo(() => [...new Set(moodRows.map(row => row.label))].sort((a, b) => a.localeCompare(b, "de")), [moodRows]);
  const moodLabels = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of moodRows) map.set(row.spot_id, [...(map.get(row.spot_id) ?? []), row.label]);
    return map;
  }, [moodRows]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          spots
            .map((spot) => spot.category_name)
            .filter((value): value is string => Boolean(value)),
        ),
      )
        .sort()
        .slice(0, 12),
    [spots],
  );
  const visible = useMemo(
    () =>
      spots.filter((spot) => {
        const term = query.trim().toLowerCase();
        return (
          (!term || (queryMood ? moodRows.some(row => row.spot_id === spot.id && row.concept_key === queryMood) :
            [spot.name, spot.address, spot.category_name, ...(moodLabels.get(spot.id) ?? [])].some((value) =>
              value?.toLowerCase().includes(term),
            ))) &&
          (!category || spot.category_name === category) &&
          (!mood || (moodLabels.get(spot.id) ?? []).some(label => moodExpressionKey(label) === moodExpressionKey(mood)))
        );
      }),
    [spots, query, category, mood, moodLabels, queryMood, moodRows],
  );
  const activeSelected =
    selected && visible.some((spot) => spot.id === selected.id)
      ? selected
      : null;
  return (
    <div className="b-places-layout" data-view={view}>
      <section className="b-places-panel">
        <div className="b-section-header">
          <div>
            <p className="b-kicker">Basel · {visible.length} Orte</p>
            <h1 className="b-display b-page-title" style={{ marginTop: 9 }}>
              ORTE
            </h1>
          </div>
          <div className="b-tabs" role="tablist">
            <button
              type="button"
              className="b-tab"
              role="tab"
              aria-selected={view === "list"}
              onClick={() => setView("list")}
            >
              <ListIcon /> Liste
            </button>
            <button
              type="button"
              className="b-tab"
              role="tab"
              aria-selected={view === "map"}
              onClick={() => setView("map")}
            >
              <MapIcon /> Karte
            </button>
          </div>
        </div>
        <div className="b-input-group">
          <label className="b-label" htmlFor="places-search">
            Orte durchsuchen
          </label>
          <div style={{ position: "relative" }}>
            <SearchIcon
              style={{
                position: "absolute",
                left: 15,
                top: 16,
                color: "var(--muted)",
              }}
            />
            <input
              id="places-search"
              className="b-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, Kategorie oder Adresse"
              style={{ paddingLeft: 46 }}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "16px 0 22px",
          }}
        >
          <Chip active={!category} onClick={() => setCategory(null)}>
            Alle
          </Chip>
          {categories.map((item) => (
            <Chip
              key={item}
              active={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </Chip>
          ))}
        </div>
        <section aria-label="Orte nach Atmosphäre entdecken" style={{ paddingBottom: 24 }}>
          <h2 className="b-card-title">Welche Atmosphäre suchst du?</h2>
          <p className={moodStyles.hint} style={{ margin: "8px 0 14px" }}>Von Gästen beschrieben. Wähle einen Mood und entdecke Orte mit diesem Eindruck.</p>
          <div className={moodStyles.chips}>
            <button type="button" className={`${moodStyles.chip} ${!mood ? moodStyles.active : ""}`} aria-pressed={!mood} onClick={() => setMood(null)}>Alle Atmosphären</button>
            {moodOptions.map(label => <button type="button" key={label} className={`${moodStyles.chip} ${mood === label ? moodStyles.active : ""}`} aria-pressed={mood === label} onClick={() => setMood(current => current === label ? null : label)}>{label}</button>)}
            {mood && !moodOptions.includes(mood) ? <button type="button" className={`${moodStyles.chip} ${moodStyles.active}`} onClick={() => setMood(null)}>{mood} ×</button> : null}
          </div>
          {mood ? <p className={moodStyles.hint} style={{ marginTop: 12 }}>Orte ohne diesen Community-Eindruck sind ausgeblendet. Mit „Alle Atmosphären“ siehst du auch Orte ohne Mood-Angaben.</p> : null}
          {moodLoading ? <p role="status" className={moodStyles.hint}>Mood-Eindrücke werden geladen …</p> : null}
          {moodFailed ? <p role="status" className={moodStyles.hint}>Die Community-Moods konnten nicht geladen werden. <button type="button" className={moodStyles.textButton} onClick={() => setMoodRevision(v => v + 1)}>Erneut laden</button></p> : null}
        </section>
        {loading || (mood && moodLoading) ? (
          <div className="b-grid b-grid-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="b-skeleton"
                style={{ aspectRatio: "4/3", borderRadius: 22 }}
              />
            ))}
          </div>
        ) : error ? (
          <StateView
            title="Orte konnten nicht geladen werden"
            message="Die Verbindung zu Basels Orten ist gerade unterbrochen."
            actionLabel="Erneut versuchen"
            onAction={() => void load()}
          />
        ) : moodFailed && mood ? (
          <StateView title="Mood-Eindrücke gerade nicht verfügbar" message="Dein Filter bleibt erhalten. Lade die Eindrücke erneut oder wähle alle Atmosphären." actionLabel="Erneut laden" onAction={() => setMoodRevision(v => v + 1)} />
        ) : queryMoodLoading && visible.length === 0 ? (
          <p className="b-muted" role="status">Suche läuft …</p>
        ) : visible.length === 0 ? (
          <StateView
            title={mood ? "Noch kein passender Mood-Eindruck" : "Kein Ort passt zu dieser Suche"}
            message={mood ? "Für diese Suche ist dieser Mood noch nicht hinterlegt. Entferne den Mood-Filter, um auch Orte ohne Eindrücke zu sehen." : "Entferne einen Filter oder probiere einen anderen Begriff."}
            actionLabel="Filter zurücksetzen"
            onAction={() => {
              setQuery("");
              setCategory(null);
              setMood(null);
            }}
          />
        ) : view === "list" ? (
          <div className="b-grid b-grid-2">
            {visible.map((spot) => (
              <ConsumerSpotCard
                key={spot.id}
                spot={{
                  id: spot.id,
                  name: spot.name,
                  address: spot.address,
                  category: spot.category_name,
                  image: spot.header_photo_url,
                  moods: moodLabels.get(spot.id),
                  reviews: reviewCounts[spot.id],
                }}
              />
            ))}
          </div>
        ) : (
          <p className="b-muted">
            Die Karte ist rechts aktiv. Wähle einen Marker, um den Ort näher
            anzusehen.
          </p>
        )}
      </section>
      <section
        className="b-places-map"
        style={{ display: view === "map" ? "block" : "none" }}
      >
        {view === "map" ? (
          <MapCanvas
            spots={visible}
            selectedId={activeSelected?.id ?? null}
            onSelect={setSelected}
          />
        ) : null}
        {activeSelected ? (
          <article className="b-map-preview">
            <CanonicalSpotImage
              ownerAdminImageUrl={activeSelected.header_photo_url}
              spotId={activeSelected.id}
              spotName={activeSelected.name}
            />
            <div className="b-map-preview-body">
              <h2 className="b-card-title" style={{ marginTop: 7 }}>
                {activeSelected.name}
              </h2>
              <MoodSignature labels={moodLabels.get(activeSelected.id) ?? []} reviewCount={reviewCounts[activeSelected.id]} compact />
              <p className="b-kicker">{activeSelected.category_name || "Backyrd Spot"}</p>
              <p className="b-meta" style={{ marginTop: 7 }}>
                {activeSelected.address || "Basel"}
              </p>
              <Link
                href={`/spots/${activeSelected.id}`}
                className="b-button b-button-primary"
                style={{ marginTop: 14 }}
              >
                Spot ansehen <ArrowIcon />
              </Link>
            </div>
          </article>
        ) : null}
      </section>
      {view === "list" ? (
        <button
          type="button"
          className="b-button b-button-primary"
          style={{ position: "fixed", right: 24, bottom: 30, zIndex: 40 }}
          onClick={() => setView("map")}
        >
          <MapIcon /> Karte öffnen
        </button>
      ) : null}
    </div>
  );
}
