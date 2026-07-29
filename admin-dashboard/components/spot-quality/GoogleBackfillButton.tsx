"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SpotForBackfill = {
  spot_id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
};

type GoogleCandidate = {
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
  candidates?: GoogleCandidate[];
  error?: string;
};

export function GoogleBackfillButton({
  spot,
  onCompleted,
}: {
  spot: SpotForBackfill;
  onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GoogleCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyCandidate, setBusyCandidate] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function invokeBackfill<T>(
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

  async function openModal() {
    const initialQuery = [
      spot.name,
      spot.address || spot.city,
      spot.country,
    ]
      .filter(Boolean)
      .join(", ");

    setOpen(true);
    setQuery(initialQuery);
    setCandidates([]);
    setError("");

    await searchGoogle(initialQuery);
  }

  async function searchGoogle(queryOverride?: string) {
    setLoading(true);
    setError("");

    try {
      const result = await invokeBackfill<BackfillResponse>({
        action: "search",
        spotId: spot.spot_id,
        query: queryOverride ?? query,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Google-Suche fehlgeschlagen.");
      }

      setCandidates(result.candidates ?? []);
    } catch (searchError: any) {
      setCandidates([]);
      setError(searchError?.message || "Google-Suche fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  async function acceptCandidate(candidate: GoogleCandidate) {
    setBusyCandidate(candidate.googlePlaceId);
    setError("");

    try {
      const result = await invokeBackfill<BackfillResponse>({
        action: "accept",
        spotId: spot.spot_id,
        googlePlaceId: candidate.googlePlaceId,
      });

      if (!result?.ok) {
        throw new Error(
          result?.error || "Treffer konnte nicht übernommen werden.",
        );
      }

      closeModal();
      onCompleted();
    } catch (acceptError: any) {
      setError(
        acceptError?.message ||
          "Treffer konnte nicht übernommen werden.",
      );
    } finally {
      setBusyCandidate(null);
    }
  }

  async function rejectCandidate(candidate: GoogleCandidate) {
    setBusyCandidate(candidate.googlePlaceId);
    setError("");

    try {
      const result = await invokeBackfill<BackfillResponse>({
        action: "reject",
        spotId: spot.spot_id,
        googlePlaceId: candidate.googlePlaceId,
        reason: "Rejected in Spot Quality dashboard",
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
      setBusyCandidate(null);
    }
  }

  function closeModal() {
    setOpen(false);
    setQuery("");
    setCandidates([]);
    setLoading(false);
    setBusyCandidate(null);
    setError("");
  }

  return (
    <>
      <button
        type="button"
        className="bi-primaryButton"
        onClick={() => void openModal()}
      >
        Google finden
      </button>

      {open ? (
        <div className="sq-backfillOverlay" role="presentation">
          <div
            className="sq-backfillBackdrop"
            onClick={closeModal}
            role="presentation"
          />

          <section
            className="sq-backfillModal"
            role="dialog"
            aria-modal="true"
            aria-label="Google Place Backfill"
          >
            <header className="sq-backfillHeader">
              <div>
                <span className="bi-kicker">Google Backfill</span>
                <h2>{spot.name}</h2>
                <p>{spot.address || spot.city || "Adresse unbekannt"}</p>
              </div>

              <button
                type="button"
                className="sq-closeButton"
                onClick={closeModal}
                aria-label="Schliessen"
              >
                ×
              </button>
            </header>

            <div className="sq-backfillSearch">
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
                placeholder="Google-Suchbegriff anpassen …"
              />

              <button
                type="button"
                className="bi-primaryButton"
                disabled={loading}
                onClick={() => void searchGoogle()}
              >
                {loading ? "Suche läuft …" : "Google durchsuchen"}
              </button>
            </div>

            {error ? <div className="bi-error">{error}</div> : null}

            {loading ? (
              <div className="bi-state">
                Google-Treffer werden geprüft …
              </div>
            ) : candidates.length === 0 ? (
              <div className="sq-backfillEmpty">
                Keine offenen Treffer. Passe den Suchbegriff an und suche
                erneut.
              </div>
            ) : (
              <div className="sq-candidateList">
                {candidates.map((candidate, index) => (
                  <article
                    className="sq-candidateCard"
                    key={candidate.googlePlaceId}
                  >
                    <div className="sq-candidateMedia">
                      {candidate.imageUrl ? (
                        <img
                          src={candidate.imageUrl}
                          alt=""
                          className="sq-candidateImage"
                        />
                      ) : (
                        <div className="sq-candidatePlaceholder">
                          {candidate.name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <span className="sq-candidateRank">
                        Treffer {index + 1}
                      </span>

                      {candidate.photoAttribution ? (
                        <span className="sq-candidateAttribution">
                          Foto: {candidate.photoAttribution} · Google
                        </span>
                      ) : null}
                    </div>

                    <div className="sq-candidateBody">
                      <div className="sq-candidateTopline">
                        <div>
                          <h3>{candidate.name}</h3>
                          <p>
                            {candidate.address || "Adresse unbekannt"}
                          </p>
                        </div>

                        <div
                          className={`sq-confidence sq-confidence-${confidenceTone(
                            candidate.confidence,
                          )}`}
                        >
                          <strong>{candidate.confidence}%</strong>
                          <span>Match</span>
                        </div>
                      </div>

                      <div className="sq-candidateMeta">
                        <span>
                          {formatDistance(candidate.distanceMeters)}
                        </span>
                        {candidate.primaryTypeLabel ? (
                          <span>{candidate.primaryTypeLabel}</span>
                        ) : null}
                        {candidate.businessStatus ? (
                          <span>{candidate.businessStatus}</span>
                        ) : null}
                      </div>

                      <div className="sq-matchDetails">
                        <MatchBar label="Name" value={candidate.scoreDetails.name} />
                        <MatchBar label="Adresse" value={candidate.scoreDetails.address} />
                        <MatchBar label="Distanz" value={candidate.scoreDetails.distance} />
                      </div>

                      <div className="sq-candidateFacts">
                        {candidate.website ? <span>Website vorhanden</span> : null}
                        {candidate.phone ? <span>Telefon vorhanden</span> : null}
                        {candidate.imageUrl ? <span>Google-Foto vorhanden</span> : null}
                      </div>

                      <div className="sq-candidateActions">
                        <button
                          type="button"
                          className="bi-primaryButton"
                          disabled={busyCandidate === candidate.googlePlaceId}
                          onClick={() => void acceptCandidate(candidate)}
                        >
                          {busyCandidate === candidate.googlePlaceId
                            ? "Wird übernommen …"
                            : "Treffer übernehmen"}
                        </button>

                        <button
                          type="button"
                          className="bi-actionButton"
                          disabled={busyCandidate === candidate.googlePlaceId}
                          onClick={() => void rejectCandidate(candidate)}
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
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function confidenceTone(confidence: number) {
  if (confidence >= 90) return "excellent";
  if (confidence >= 75) return "good";
  if (confidence >= 55) return "warning";
  return "critical";
}

function formatDistance(distance: number | null) {
  if (distance === null) return "Distanz unbekannt";
  if (distance < 1000) return `${distance} m entfernt`;
  return `${(distance / 1000).toFixed(1).replace(".", ",")} km entfernt`;
}

function MatchBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="sq-matchBar">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="sq-matchTrack">
        <div
          className="sq-matchFill"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
          }}
        />
      </div>
    </div>
  );
}
