"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { getCatalog, type CatalogSpot } from "@/lib/consumer-api";
import { ArrowIcon, ListIcon, MapIcon, SearchIcon } from "./icons";
import { Chip, StateView } from "./ui";
import { ConsumerSpotCard } from "./spot-card";
import { MapCanvas } from "./map-canvas";

export function PlacesExperience() {
  const [spots, setSpots] = useState<CatalogSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
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
          (!term ||
            [spot.name, spot.address, spot.category_name].some((value) =>
              value?.toLowerCase().includes(term),
            )) &&
          (!category || spot.category_name === category)
        );
      }),
    [spots, query, category],
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
        {loading ? (
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
        ) : visible.length === 0 ? (
          <StateView
            title="Kein Ort passt zu dieser Suche"
            message="Entferne einen Filter oder probiere einen anderen Begriff."
            actionLabel="Filter zurücksetzen"
            onAction={() => {
              setQuery("");
              setCategory(null);
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
              <p className="b-kicker">
                {activeSelected.category_name || "Backyrd Spot"}
              </p>
              <h2 className="b-card-title" style={{ marginTop: 7 }}>
                {activeSelected.name}
              </h2>
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
