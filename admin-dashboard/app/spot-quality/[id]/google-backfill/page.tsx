"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Spot = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  google_place_id: string | null;
};

type Candidate = {
  googlePlaceId: string;
  name: string;
  address: string | null;
  distanceMeters: number | null;
  confidence: number;
  scoreDetails: {
    name: number;
    address: number;
    distance: number;
  };
  businessStatus: string | null;
  primaryTypeLabel: string | null;
  website: string | null;
  phone: string | null;
  googleMapsUri: string | null;
  imageUrl: string | null;
  photoAttribution: string | null;
};

type BackfillResponse = {
  ok: boolean;
  candidates?: Candidate[];
  error?: string;
};

export default function GoogleBackfillPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const spotId = params?.id;

  const [spot, setSpot] = useState<Spot | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingSpot, setLoadingSpot] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSpot();
  }, [spotId]);

  async function loadSpot() {
    if (!spotId) return;

    setLoadingSpot(true);
    setError("");

    const { data, error: spotError } = await supabase
      .from("spots")
      .select("id,name,address,city,country,google_place_id")
      .eq("id", spotId)
      .maybeSingle();

    if (spotError || !data) {
      setError(spotError?.message || "Spot wurde nicht gefunden.");
      setLoadingSpot(false);
      return;
    }

    const loaded = data as Spot;
    setSpot(loaded);

    const initialQuery = [
      loaded.name,
      loaded.address || loaded.city,
      loaded.country,
    ]
      .filter(Boolean)
      .join(", ");

    setQuery(initialQuery);
    setLoadingSpot(false);

    if (!loaded.google_place_id) {
      await searchGoogle(loaded.id, initialQuery);
    }
  }

  async function callBackfill<T>(
    body: Record<string, unknown>,
  ): Promise<T> {
    const { data, error: functionError } =
      await supabase.functions.invoke<T>("spot-google-backfill", {
        body,
      });

    if (functionError) {
      throw new Error(functionError.message);
    }

    return data as T;
  }

  async function searchGoogle(
    id = spot?.id,
    searchQuery = query,
  ) {
    if (!id) return;

    setLoadingSearch(true);
    setError("");

    try {
      const result = await callBackfill<BackfillResponse>({
        action: "search",
        spotId: id,
        query: searchQuery,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Google-Suche fehlgeschlagen.");
      }

      setCandidates(result.candidates ?? []);
    } catch (searchError: any) {
      setCandidates([]);
      setError(searchError?.message || "Google-Suche fehlgeschlagen.");
    } finally {
      setLoadingSearch(false);
    }
  }

  async function accept(candidate: Candidate) {
    if (!spot) return;

    setBusyId(candidate.googlePlaceId);
    setError("");

    try {
      const result = await callBackfill<BackfillResponse>({
        action: "accept",
        spotId: spot.id,
        googlePlaceId: candidate.googlePlaceId,
      });

      if (!result?.ok) {
        throw new Error(
          result?.error || "Treffer konnte nicht übernommen werden.",
        );
      }

      router.push("/spot-quality");
      router.refresh();
    } catch (acceptError: any) {
      setError(
        acceptError?.message ||
          "Treffer konnte nicht übernommen werden.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reject(candidate: Candidate) {
    if (!spot) return;

    setBusyId(candidate.googlePlaceId);
    setError("");

    try {
      const result = await callBackfill<BackfillResponse>({
        action: "reject",
        spotId: spot.id,
        googlePlaceId: candidate.googlePlaceId,
        reason: "Rejected in separate Google Backfill page",
      });

      if (!result?.ok) {
        throw new Error(
          result?.error || "Treffer konnte nicht abgelehnt werden.",
        );
      }

      setCandidates((current) =>
        current.filter(
          (item) => item.googlePlaceId !== candidate.googlePlaceId,
        ),
      );
    } catch (rejectError: any) {
      setError(
        rejectError?.message ||
          "Treffer konnte nicht abgelehnt werden.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loadingSpot) {
    return <div className="bi-state">Spot wird geladen …</div>;
  }

  if (!spot) {
    return (
      <div className="bi-page">
        <div className="bi-error">
          {error || "Spot wurde nicht gefunden."}
        </div>
        <Link href="/spot-quality" className="bi-actionButton">
          ← Zurück
        </Link>
      </div>
    );
  }

  return (
    <div className="bi-page sqb-page">
      <Link href="/spot-quality" className="sqb-back">
        ← Spot Quality Engine
      </Link>

      <header className="sqb-hero">
        <div>
          <span className="bi-eyebrow">Google Backfill</span>
          <h1>{spot.name}</h1>
          <p>{spot.address || spot.city || "Adresse unbekannt"}</p>
        </div>

        <span className="sqb-status">
          {spot.google_place_id
            ? "Bereits verknüpft"
            : "Google Place ID fehlt"}
        </span>
      </header>

      <section className="bi-card sqb-search">
        <div>
          <span className="bi-kicker">Google-Suche</span>
          <h3>Den richtigen Betrieb finden</h3>
          <p>
            Name, Adresse und Distanz werden automatisch verglichen.
          </p>
        </div>

        <div className="sqb-searchRow">
          <input
            className="bi-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchGoogle();
              }
            }}
          />

          <button
            type="button"
            className="bi-primaryButton"
            disabled={loadingSearch}
            onClick={() => void searchGoogle()}
          >
            {loadingSearch ? "Suche läuft …" : "Google durchsuchen"}
          </button>
        </div>
      </section>

      {error ? <div className="bi-error">{error}</div> : null}

      {loadingSearch ? (
        <div className="bi-state">
          Google-Treffer werden geprüft …
        </div>
      ) : candidates.length === 0 ? (
        <div className="bi-card sqb-empty">
          Keine passenden Treffer gefunden. Passe den Suchbegriff an.
        </div>
      ) : (
        <section className="sqb-grid">
          {candidates.map((candidate, index) => (
            <article
              className={`sqb-card ${
                index === 0 ? "sqb-cardBest" : ""
              }`}
              key={candidate.googlePlaceId}
            >
              <div className="sqb-media">
                {candidate.imageUrl ? (
                  <img
                    src={candidate.imageUrl}
                    alt=""
                    className="sqb-image"
                  />
                ) : (
                  <div className="sqb-placeholder">
                    {candidate.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <span className="sqb-rank">Treffer {index + 1}</span>

                {candidate.photoAttribution ? (
                  <span className="sqb-attribution">
                    Foto: {candidate.photoAttribution} · Google
                  </span>
                ) : null}
              </div>

              <div className="sqb-body">
                <div className="sqb-title">
                  <div>
                    <h2>{candidate.name}</h2>
                    <p>{candidate.address || "Adresse unbekannt"}</p>
                  </div>

                  <div
                    className={`sqb-confidence sqb-${tone(
                      candidate.confidence,
                    )}`}
                  >
                    <strong>{candidate.confidence}%</strong>
                    <span>Match</span>
                  </div>
                </div>

                <div className="sqb-meta">
                  <span>{distance(candidate.distanceMeters)}</span>
                  {candidate.primaryTypeLabel ? (
                    <span>{candidate.primaryTypeLabel}</span>
                  ) : null}
                  {candidate.businessStatus ? (
                    <span>{candidate.businessStatus}</span>
                  ) : null}
                </div>

                <div className="sqb-scores">
                  <Score label="Name" value={candidate.scoreDetails.name} />
                  <Score
                    label="Adresse"
                    value={candidate.scoreDetails.address}
                  />
                  <Score
                    label="Distanz"
                    value={candidate.scoreDetails.distance}
                  />
                </div>

                <div className="sqb-facts">
                  {candidate.website ? (
                    <span>Website vorhanden</span>
                  ) : null}
                  {candidate.phone ? (
                    <span>Telefon vorhanden</span>
                  ) : null}
                  {candidate.imageUrl ? (
                    <span>Google-Foto vorhanden</span>
                  ) : null}
                </div>

                <div className="sqb-actions">
                  <button
                    type="button"
                    className="bi-primaryButton"
                    disabled={busyId === candidate.googlePlaceId}
                    onClick={() => void accept(candidate)}
                  >
                    {busyId === candidate.googlePlaceId
                      ? "Wird übernommen …"
                      : "Treffer übernehmen"}
                  </button>

                  <button
                    type="button"
                    className="bi-actionButton"
                    disabled={busyId === candidate.googlePlaceId}
                    onClick={() => void reject(candidate)}
                  >
                    Ablehnen
                  </button>

                  {candidate.googleMapsUri ? (
                    <a
                      className="bi-action"
                      href={candidate.googleMapsUri}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google Maps ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function tone(value: number) {
  if (value >= 90) return "excellent";
  if (value >= 75) return "good";
  if (value >= 55) return "warning";
  return "critical";
}

function distance(value: number | null) {
  if (value === null) return "Distanz unbekannt";
  if (value < 1000) return `${value} m entfernt`;
  return `${(value / 1000).toFixed(1).replace(".", ",")} km entfernt`;
}

function Score({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="sqb-score">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="sqb-track">
        <div
          className="sqb-fill"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
