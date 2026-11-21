"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getCatalog, type CatalogSpot } from "@/lib/consumer-api";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import styles from "./spot-profile.module.css";

type Nearby = CatalogSpot & { distance: number };
function distance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
export function SpotNearby({
  spotId,
  city,
  latitude,
  longitude,
}: {
  spotId: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  const element = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    rows: Nearby[];
    failed: boolean;
  } | null>(null);
  const key = `${spotId}:${city}:${latitude}:${longitude}:${attempt}`;
  const coordinates =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  useEffect(() => {
    if (!element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !coordinates || !city) return;
    let active = true;
    // Reuse the governed public discovery catalog and curated header projection.
    // This is a bounded browse selection, not a Decision ranking or a complete geo index.
    void getCatalog({ city, limit: 200 })
      .then((rows) => {
        const nearby = rows
          .flatMap((row) =>
            row.id !== spotId &&
            typeof row.lat === "number" &&
            typeof row.lng === "number" &&
            Number.isFinite(row.lat) &&
            Number.isFinite(row.lng) &&
            Math.abs(row.lat) <= 90 &&
            Math.abs(row.lng) <= 180
              ? [
                  {
                    ...row,
                    distance: distance(latitude!, longitude!, row.lat, row.lng),
                  },
                ]
              : [],
          )
          .filter((row) => row.distance <= 5)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 6);
        if (active) setState({ key, rows: nearby, failed: false });
      })
      .catch(() => {
        if (active) setState({ key, rows: [], failed: true });
      });
    return () => {
      active = false;
    };
  }, [visible, coordinates, city, spotId, latitude, longitude, key]);
  const current = state?.key === key ? state : null;
  return (
    <section
      ref={element}
      className="b-detail-section"
      aria-label="Rund um diesen Ort"
    >
      <h2 className="b-section-title">Rund um diesen Ort</h2>
      {!coordinates || !city ? (
        <p className="b-muted">
          Entdecke weitere Orte, die zu deinem nächsten Moment passen.
        </p>
      ) : !current ? (
        <p className="b-muted" role="status">
          Orte in der Umgebung werden geladen …
        </p>
      ) : current.failed ? (
        <div>
          <p className="b-muted" role="status">
            Die Orte in der Umgebung konnten gerade nicht geladen werden.
          </p>
          <button
            className="b-button b-button-secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Erneut versuchen
          </button>
        </div>
      ) : current.rows.length ? (
        <div className={styles.nearby}>
          {current.rows.map((row) => (
            <Link href={`/spots/${row.id}`} key={row.id}>
              <CanonicalSpotImage
                spotId={row.id}
                spotName={row.name}
                ownerAdminImageUrl={row.header_photo_url}
              />
              <strong>{row.name}</strong>
              <span>
                {new Intl.NumberFormat("de-CH", {
                  maximumFractionDigits: 1,
                }).format(row.distance)}{" "}
                km vom Ort
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="b-muted">
          Hier sind noch keine weiteren Orte aus der Umgebung hinterlegt.
        </p>
      )}
      <Link href="/places" className={styles.textLink}>
        Weitere Orte entdecken →
      </Link>
    </section>
  );
}
