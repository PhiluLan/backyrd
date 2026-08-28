"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import Supercluster from "supercluster";
import type { CatalogSpot } from "@/lib/consumer-api";

type SpotProperties = { spotId: string; name: string };
type ClusterProperties = Supercluster.ClusterProperties & SpotProperties;

function buildIndex(spots: CatalogSpot[]) {
  const features: Array<Supercluster.PointFeature<SpotProperties>> = spots
    .filter((spot) => Number.isFinite(spot.lng) && Number.isFinite(spot.lat))
    .map((spot) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(spot.lng), Number(spot.lat)] },
      properties: { spotId: spot.id, name: spot.name },
    }));
  return new Supercluster<SpotProperties, ClusterProperties>({
    radius: 52,
    maxZoom: 15,
    minPoints: 2,
  }).load(features);
}

export function MapCanvas({ spots, selectedId, onSelect }: {
  spots: CatalogSpot[];
  selectedId: string | null;
  onSelect: (spot: CatalogSpot) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const spotIndex = useRef(new Map<string, CatalogSpot>());
  const clusterIndex = useRef(buildIndex([]));
  const selectedRef = useRef<string | null>(null);
  const renderMarkers = useRef<(() => void) | null>(null);
  const selectSpot = useEffectEvent(onSelect);
  const nextClusterIndex = useMemo(() => buildIndex(spots), [spots]);

  useEffect(() => {
    spotIndex.current = new Map(spots.map((spot) => [spot.id, spot]));
    clusterIndex.current = nextClusterIndex;
    selectedRef.current = selectedId;
    renderMarkers.current?.();
  }, [nextClusterIndex, selectedId, spots]);

  useEffect(() => {
    if (!root.current || map.current) return;
    const instance = new maplibregl.Map({
      container: root.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors · © CARTO",
          },
        },
        layers: [
          { id: "backyrd-map-background", type: "background", paint: { "background-color": "#0d0d10" } },
          { id: "carto-dark", type: "raster", source: "carto-dark", paint: { "raster-opacity": 0.82 } },
        ],
      },
      center: [7.5886, 47.5596],
      zoom: 12.4,
      attributionControl: false,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    const render = () => {
      const bounds = instance.getBounds();
      const clusters = clusterIndex.current.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        Math.round(instance.getZoom()),
      );
      markers.current.forEach((marker) => marker.remove());
      markers.current = clusters.map((feature) => {
        const properties = feature.properties;
        const element = document.createElement("button");
        element.type = "button";
        if ("cluster" in properties && properties.cluster) {
          element.className = "b-map-cluster";
          element.textContent = String(properties.point_count_abbreviated);
          element.setAttribute("aria-label", `${properties.point_count} Orte in diesem Kartenausschnitt`);
          element.addEventListener("click", () => {
            const zoom = clusterIndex.current.getClusterExpansionZoom(properties.cluster_id);
            instance.easeTo({
              center: feature.geometry.coordinates as [number, number],
              zoom,
              duration: 420,
            });
          });
        } else {
          const spot = spotIndex.current.get(properties.spotId);
          element.className = "b-map-marker";
          element.dataset.selected = String(properties.spotId === selectedRef.current);
          element.setAttribute("aria-label", `${properties.name} auf der Karte auswählen`);
          if (spot) element.addEventListener("click", () => selectSpot(spot));
        }
        return new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .addTo(instance);
      });
      if (root.current) {
        root.current.dataset.mapReady = "true";
        root.current.dataset.mapRenderedCount = String(markers.current.length);
        root.current.dataset.mapFeatureCount = String(spotIndex.current.size);
      }
    };
    renderMarkers.current = render;
    instance.on("load", render);
    instance.on("moveend", render);
    map.current = instance;
    return () => {
      renderMarkers.current = null;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const selected = spots.find((spot) => spot.id === selectedId);
    if (selected && map.current && Number.isFinite(selected.lng) && Number.isFinite(selected.lat)) {
      map.current.easeTo({
        center: [Number(selected.lng), Number(selected.lat)],
        duration: 420,
        padding: { bottom: 180 },
      });
    }
  }, [selectedId, spots]);

  return (
    <div
      ref={root}
      className="b-map"
      role="region"
      aria-label="Interaktive Karte von Basel. Alle Orte sind auch in der Liste erreichbar."
    />
  );
}
