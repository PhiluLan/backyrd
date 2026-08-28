"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import {
  getPublicCitySpots,
  getPublicTopMoments,
  type PublicCitySpot,
  type PublicMoment,
} from "@/lib/public-web-api";
import { ArrowIcon, MomentsIcon, PlacesIcon, SparkIcon } from "./icons";
import { Button, ButtonLink, StateView } from "./ui";
import { ConsumerSpotCard } from "./spot-card";

function date(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
export function HomeExperience() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [spots, setSpots] = useState<PublicCitySpot[]>([]);
  const [moments, setMoments] = useState<PublicMoment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [spotRows, momentRows] = await Promise.all([
        getPublicCitySpots("Basel", 12),
        getPublicTopMoments(6),
      ]);
      setSpots(spotRows);
      setMoments(momentRows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const hero = useMemo(() => spots[0] ?? null, [spots]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    router.push(
      value
        ? `/decision?mode=free&query=${encodeURIComponent(value)}`
        : "/decision",
    );
  }
  return (
    <>
      <section className="b-hero">
        <div className="b-container b-hero-grid">
          <div className="b-hero-copy">
            <p className="b-kicker">Basel · jetzt entdecken</p>
            <h1 className="b-display b-display-xl">WOHIN GEHT&apos;S HEUTE?</h1>
            <div className="b-marker" />
            <p
              className="b-body b-muted"
              style={{ maxWidth: 620, fontSize: 18 }}
            >
              Sag Backyrd, was zu deinem Moment passt. Oder schau, welche Orte
              und Erlebnisse Basel gerade lebendig machen.
            </p>
            <form className="b-decision-entry" onSubmit={submit}>
              <SparkIcon />
              <label htmlFor="home-decision" className="sr-only">
                Was möchtest du jetzt erleben?
              </label>
              <input
                id="home-decision"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zum Beispiel: ruhig essen, aber nicht langweilig …"
              />
              <Button type="submit">
                Für jetzt <ArrowIcon />
              </Button>
            </form>
          </div>
          {hero ? (
            <CanonicalSpotImage
              className="b-hero-media"
              ownerAdminImageUrl={hero.photo_url}
              spotId={hero.spot_id}
              spotName={hero.name}
            >
              <div
                style={{
                  position: "absolute",
                  inset: "auto 0 0",
                  padding: "clamp(24px,4vw,48px)",
                  background: "linear-gradient(transparent,rgba(5,5,6,.9))",
                }}
              >
                <p className="b-kicker">
                  {hero.category_name || "Basel entdecken"}
                </p>
                <h2
                  className="b-display b-page-title"
                  style={{ marginTop: 10 }}
                >
                  {hero.name}
                </h2>
                <ButtonLink href={`/spots/${hero.spot_id}`} variant="secondary">
                  Spot ansehen <ArrowIcon />
                </ButtonLink>
              </div>
            </CanonicalSpotImage>
          ) : (
            <div className="b-hero-media b-skeleton" />
          )}
        </div>
      </section>
      <section className="b-section">
        <div className="b-container">
          <div className="b-section-header">
            <div className="b-section-copy">
              <p className="b-kicker">01 · Orte</p>
              <h2 className="b-section-title" style={{ marginTop: 8 }}>
                Basel entdecken
              </h2>
              <p className="b-muted">
                Bildstarke Orte, die sich nach Basel anfühlen – nicht nach einem
                Verzeichnis.
              </p>
            </div>
            <ButtonLink href="/places" variant="tertiary">
              Alle Orte <PlacesIcon />
            </ButtonLink>
          </div>
          {loading ? (
            <div className="b-grid b-grid-4">
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
              title="Basel bleibt gerade kurz verborgen"
              message="Die Orte konnten nicht geladen werden. Versuch es gleich nochmals."
              actionLabel="Erneut versuchen"
              onAction={() => void load()}
            />
          ) : (
            <div className="b-grid b-grid-4">
              {spots.slice(0, 8).map((spot) => (
                <ConsumerSpotCard
                  key={spot.spot_id}
                  spot={{
                    id: spot.spot_id,
                    name: spot.name,
                    city: spot.city,
                    category: spot.category_name,
                    image: spot.photo_url,
                    moods: spot.top_moods,
                    reviews: spot.review_count,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="b-section b-section-contrast">
        <div className="b-container">
          <div className="b-section-header">
            <div>
              <p className="b-kicker">02 · Momente</p>
              <h2 className="b-display b-page-title" style={{ marginTop: 10 }}>
                SO FÜHLT SICH DIE STADT AN.
              </h2>
            </div>
            <ButtonLink href="/moments" variant="secondary">
              Momente öffnen <MomentsIcon />
            </ButtonLink>
          </div>
          <div className="b-grid b-grid-3">
            {moments.slice(0, 6).map((moment) => (
              <article
                className="b-surface"
                key={moment.review_id}
                style={{ padding: 22 }}
              >
                <div className="b-moment-head">
                  <span className="b-avatar b-avatar-sm">
                    {(moment.first_name || "B").slice(0, 1)}
                  </span>
                  <div>
                    <strong>{moment.first_name || "Backyrd User"}</strong>
                    <div className="b-meta">
                      {moment.spot_name} · {date(moment.created_at)}
                    </div>
                  </div>
                </div>
                {moment.text ? (
                  <p className="b-moment-copy">{moment.text}</p>
                ) : null}
                <div className="b-spot-card-moods">
                  {[moment.mood_a, moment.mood_b]
                    .filter((mood): mood is string => Boolean(mood))
                    .map((mood) => (
                      <span className="b-chip" key={mood}>
                        {mood}
                      </span>
                    ))}
                </div>
                <Link
                  href={`/spots/${moment.spot_id}`}
                  className="b-moment-spot"
                >
                  <span>
                    <span className="b-kicker">Ort</span>
                    <strong style={{ display: "block", marginTop: 3 }}>
                      {moment.spot_name}
                    </strong>
                  </span>
                  <ArrowIcon />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
