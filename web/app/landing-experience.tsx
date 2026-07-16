"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  runWebDecision,
  type DecisionContext,
  type DecisionResult,
} from "@/lib/decision-web-api";
import {
  getPublicCitySpots,
  getPublicTopMoments,
  getPublicTopSpots,
  type PublicCitySpot,
  type PublicMoment,
} from "@/lib/public-web-api";
import styles from "./landing.module.css";

const suggestions = [
  "Cozy Sunday aber kein Plan was machen",
  "Etwas Besonderes für ein Date",
  "Lebendig mit Freunden",
  "Gutes Essen, unkompliziert",
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function decisionPhoto(result: DecisionResult): string | null {
  return (
    result.detail?.photos?.[0]?.url ||
    result.detail?.spot?.header_photo_path ||
    null
  );
}

function decisionCategory(result: DecisionResult): string {
  return result.detail?.spot?.category?.name || "Spot";
}

function scoreLabel(score: number | null): string | null {
  if (score === null) return null;
  const raw = score <= 1 ? score * 100 : score;
  return `${Math.max(1, Math.min(99, Math.round(raw)))}% Match`;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", {
      day: "2-digit",
      month: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function LandingExperience() {
  const [heroSpots, setHeroSpots] = useState<PublicCitySpot[]>([]);
  const [heroSpotIndex, setHeroSpotIndex] = useState(0);
  const [topSpots, setTopSpots] = useState<PublicCitySpot[]>([]);
  const [moments, setMoments] = useState<PublicMoment[]>([]);

  const [heroLoading, setHeroLoading] = useState(true);
  const [spotsLoading, setSpotsLoading] = useState(true);
  const [momentsLoading, setMomentsLoading] = useState(true);
  const [spotsError, setSpotsError] = useState<string | null>(null);
  const [momentsError, setMomentsError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [context, setContext] = useState<DecisionContext | null>(null);
  const [results, setResults] = useState<DecisionResult[]>([]);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [hasDecision, setHasDecision] = useState(false);

  const decisionRef = useRef<HTMLElement | null>(null);
  const currentSpot = heroSpots[heroSpotIndex] ?? null;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || "#app-download";

  const loadHeroSpots = useCallback(async () => {
    setHeroLoading(true);
    try {
      const rows = await getPublicCitySpots("Basel", 18);
      setHeroSpots(shuffle(rows).slice(0, 5));
      setHeroSpotIndex(0);
    } catch {
      setHeroSpots([]);
      setHeroSpotIndex(0);
    } finally {
      setHeroLoading(false);
    }
  }, []);

  const loadTopSpots = useCallback(async () => {
    setSpotsLoading(true);
    setSpotsError(null);
    try {
      setTopSpots(await getPublicTopSpots("Basel", 9));
    } catch (error: unknown) {
      setTopSpots([]);
      setSpotsError(
        error instanceof Error
          ? error.message
          : "Die Basel-Spots konnten nicht geladen werden."
      );
    } finally {
      setSpotsLoading(false);
    }
  }, []);

  const loadMoments = useCallback(async () => {
    setMomentsLoading(true);
    setMomentsError(null);
    try {
      setMoments(await getPublicTopMoments(5));
    } catch (error: unknown) {
      setMoments([]);
      setMomentsError(
        error instanceof Error
          ? error.message
          : "Moments konnten nicht geladen werden."
      );
    } finally {
      setMomentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHeroSpots();
    void loadTopSpots();
    void loadMoments();
  }, [loadHeroSpots, loadTopSpots, loadMoments]);

  useEffect(() => {
    if (heroSpots.length <= 1) return;
    const timer = window.setInterval(() => {
      setHeroSpotIndex((value) => (value + 1) % heroSpots.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heroSpots]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadMoments();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadMoments]);

  const canSubmit = useMemo(
    () => query.trim().length >= 3 && !decisionLoading,
    [query, decisionLoading]
  );

  async function submitDecision(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit) return;

    setDecisionLoading(true);
    setDecisionError(null);
    setHasDecision(true);

    try {
      const data = await runWebDecision({
        city: "Basel",
        query,
        limit: 6,
      });
      setContext(data.context);
      setResults(data.results);
    } catch (error: unknown) {
      setContext(null);
      setResults([]);
      setDecisionError(
        error instanceof Error
          ? error.message
          : "Backyrd konnte gerade keine Entscheidung treffen."
      );
    } finally {
      setDecisionLoading(false);
    }
  }

  function scrollToDecision() {
    decisionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          backyrd
        </Link>

        <nav className={styles.nav}>
          <button type="button" onClick={scrollToDecision}>
            Entscheiden
          </button>
          <a href="#spots">Spots</a>
          <a href="#moments">Moments</a>
          <a href="#owner">Für Owner</a>
          <Link href="/login?next=/owner" className={styles.login}>
            Owner Login
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>
            Finde nicht irgendeinen Ort.
            <span>Finde den richtigen.</span>
          </h1>

          <p className={styles.intro}>
            Backyrd findet Restaurants, Bars, Cafés und Erlebnisse danach,
            wie sie sich anfühlen – und danach, was gerade zu dir passt.
          </p>

          <div className={styles.heroActions}>
            <button
              type="button"
              onClick={scrollToDecision}
              className={styles.primaryButton}
            >
              Entscheidung starten
            </button>
            <a href={appUrl} className={styles.secondaryButton}>
              App herunterladen
            </a>
          </div>
        </div>

        <div className={styles.heroSpotStage}>
          {heroLoading ? (
            <div className={styles.heroSkeleton} aria-label="Spots werden geladen" />
          ) : currentSpot ? (
            <>
              <Link
                href={`/spots/${currentSpot.spot_id}`}
                className={styles.heroSpotCard}
              >
                <div
                  className={`${styles.heroSpotImage} ${
                    currentSpot.photo_url ? "" : styles.imageFallback
                  }`}
                  style={
                    currentSpot.photo_url
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgba(7,7,8,.08), rgba(7,7,8,.92)), url("${currentSpot.photo_url}")`,
                        }
                      : undefined
                  }
                >
                  <div className={styles.heroSpotTop}>
                    <span>Basel</span>
                    <span>
                      {String(heroSpotIndex + 1).padStart(2, "0")} /{" "}
                      {String(heroSpots.length).padStart(2, "0")}
                    </span>
                  </div>

                  <div className={styles.heroSpotBottom}>
                    <div>
                      <span>{currentSpot.category_name || "Spot"}</span>
                      <h2>{currentSpot.name}</h2>
                    </div>
                    <span className={styles.heroArrow}>↗</span>
                  </div>
                </div>

                <div className={styles.heroSpotMeta}>
                  <div>
                    {currentSpot.top_moods.slice(0, 2).map((mood) => (
                      <span key={mood}>{mood}</span>
                    ))}
                  </div>
                  <small>{currentSpot.review_count} Moments</small>
                </div>
              </Link>

              <div className={styles.heroDots}>
                {heroSpots.map((spot, index) => (
                  <button
                    key={spot.spot_id}
                    type="button"
                    aria-label={`Spot ${index + 1} anzeigen`}
                    className={
                      index === heroSpotIndex ? styles.activeDot : ""
                    }
                    onClick={() => setHeroSpotIndex(index)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className={styles.heroEmpty}>
              <span>Basel</span>
              <h2>Neue Orte folgen.</h2>
              <button type="button" onClick={() => void loadHeroSpots()}>
                Erneut laden
              </button>
            </div>
          )}
        </div>
      </section>

      <section
        ref={decisionRef}
        id="decision"
        className={styles.decisionSection}
      >
        <div className={styles.sectionHeading}>
          <p className={styles.decisionKicker}>Backyrd Decision</p>
          <h2>Wohin soll es heute gehen?</h2>
          <p>
            Beschreibe deinen Moment. Backyrd zeigt dir Orte, die jetzt
            dazu passen.
          </p>
        </div>

        <form className={styles.decisionForm} onSubmit={submitDecision}>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cozy Sunday aber kein Plan was machen"
            rows={2}
            aria-label="Beschreibe deinen Moment"
          />

          <div className={styles.decisionFormBottom}>
            <span>Basel</span>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!canSubmit}
            >
              {decisionLoading
                ? "Backyrd entscheidet…"
                : "Entscheidung starten"}
            </button>
          </div>
        </form>

        {!hasDecision && (
          <div className={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => setQuery(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {decisionLoading && (
          <div className={styles.decisionLoading}>
            <span />
            <p>Backyrd sucht nach dem richtigen Ort für jetzt.</p>
          </div>
        )}

        {!decisionLoading && decisionError && (
          <div className={styles.decisionState}>
            <h3>Die Entscheidung konnte nicht geladen werden.</h3>
            <p>{decisionError}</p>
            <button
              type="button"
              onClick={() => void submitDecision()}
              disabled={!canSubmit}
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {!decisionLoading &&
          hasDecision &&
          !decisionError &&
          results.length === 0 && (
            <div className={styles.decisionState}>
              <h3>Noch kein passender Ort gefunden.</h3>
              <p>
                Probiere es etwas offener, zum Beispiel mit „gemütlich und
                lokal“.
              </p>
            </div>
          )}

        {!decisionLoading && results.length > 0 && (
          <div className={styles.decisionResults}>
            <div className={styles.resultsIntro}>
              <div>
                <p className={styles.eyebrow}>Backyrd Auswahl</p>
                <h3>{context?.title || "Wohin jetzt?"}</h3>
                <p>
                  {context?.body ||
                    "Diese Orte passen am besten zu deinem Moment."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setHasDecision(false);
                  setResults([]);
                  setContext(null);
                }}
              >
                Neue Entscheidung
              </button>
            </div>

            <div className={styles.decisionGrid}>
              {results.map((result, index) => {
                const photo = decisionPhoto(result);
                const match = scoreLabel(result.final_score);

                return (
                  <Link
                    href={`/spots/${result.spot_id}?from=decision`}
                    className={styles.decisionCard}
                    key={result.spot_id}
                  >
                    <div
                      className={`${styles.decisionImage} ${
                        photo ? "" : styles.imageFallback
                      }`}
                      style={
                        photo
                          ? {
                              backgroundImage: `linear-gradient(180deg, transparent 35%, rgba(7,7,8,.9)), url("${photo}")`,
                            }
                          : undefined
                      }
                    >
                      <div className={styles.cardTop}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        {match && <span>{match}</span>}
                      </div>
                      <div>
                        <small>
                          {decisionCategory(result)}
                          {result.city ? ` · ${result.city}` : ""}
                        </small>
                        <h4>{result.name}</h4>
                      </div>
                    </div>

                    <div className={styles.decisionCardBody}>
                      <p>
                        {result.why_this ||
                          "Passt besonders gut zu deiner aktuellen Stimmung."}
                      </p>
                      <div>
                        <span
                          className={
                            result.is_open_now ? styles.open : styles.closed
                          }
                        >
                          {result.is_open_now === null
                            ? ""
                            : result.is_open_now
                            ? "Jetzt geöffnet"
                            : "Gerade geschlossen"}
                        </span>
                        <span>↗</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section id="spots" className={styles.spotsSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.spotsKicker}>Basel auf Backyrd</p>
          <h2>Spots, die gerade auffallen.</h2>
          <p>
            Orte mit starken Mood-Signalen und besonders vielen echten
            Moments.
          </p>
        </div>

        {spotsLoading ? (
          <div className={styles.cardSkeletonGrid}>
            {Array.from({ length: 9 }).map((_, index) => (
              <div className={styles.cardSkeleton} key={index} />
            ))}
          </div>
        ) : spotsError ? (
          <div className={styles.sectionState}>
            <p>{spotsError}</p>
            <button type="button" onClick={() => void loadTopSpots()}>
              Erneut laden
            </button>
          </div>
        ) : topSpots.length === 0 ? (
          <div className={styles.sectionState}>
            Noch keine öffentlichen Top-Spots verfügbar.
          </div>
        ) : (
          <div className={styles.topSpotsGrid}>
            {topSpots.map((spot, index) => (
              <Link
                href={`/spots/${spot.spot_id}`}
                className={styles.topSpotCard}
                key={spot.spot_id}
              >
                <div
                  className={`${styles.topSpotImage} ${
                    spot.photo_url ? "" : styles.imageFallback
                  }`}
                  style={
                    spot.photo_url
                      ? {
                          backgroundImage: `linear-gradient(180deg, transparent 35%, rgba(7,7,8,.9)), url("${spot.photo_url}")`,
                        }
                      : undefined
                  }
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{spot.category_name || "Spot"} · Basel</small>
                    <h3>{spot.name}</h3>
                  </div>
                </div>
                <div className={styles.topSpotFooter}>
                  <div>
                    {spot.top_moods.slice(0, 2).map((mood) => (
                      <span key={mood}>{mood}</span>
                    ))}
                  </div>
                  <small>{spot.review_count} Moments</small>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="moments" className={styles.momentsSection}>
        <div className={styles.momentsHeading}>
          <div>
            <h2>Moments</h2>
            <p>Die stärksten öffentlichen Eindrücke der letzten sieben Tage.</p>
          </div>
          <button type="button" onClick={() => void loadMoments()}>
            Aktualisieren
          </button>
        </div>

        {momentsLoading ? (
          <div className={styles.momentSkeletonRail}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div className={styles.momentSkeleton} key={index} />
            ))}
          </div>
        ) : momentsError ? (
          <div className={styles.sectionState}>
            <p>{momentsError}</p>
            <button type="button" onClick={() => void loadMoments()}>
              Erneut laden
            </button>
          </div>
        ) : moments.length === 0 ? (
          <div className={styles.sectionState}>
            <p>In den letzten sieben Tagen wurden noch keine Moments geteilt.</p>
            <button type="button" onClick={() => void loadMoments()}>
              Jetzt neu prüfen
            </button>
          </div>
        ) : (
          <div className={styles.momentsRail}>
            {moments.map((moment) => (
              <Link
                href={`/spots/${moment.spot_id}`}
                className={styles.momentCard}
                key={moment.review_id}
              >
                {moment.photo_url && (
                  <div
                    className={styles.momentImage}
                    style={{
                      backgroundImage: `linear-gradient(180deg, transparent, rgba(7,7,8,.72)), url("${moment.photo_url}")`,
                    }}
                  />
                )}

                <div className={styles.momentBody}>
                  <div className={styles.momentMoods}>
                    {moment.mood_a && <span>{moment.mood_a}</span>}
                    {moment.mood_b && <span>{moment.mood_b}</span>}
                  </div>

                  <blockquote>
                    {moment.text || "Ein Moment auf Backyrd."}
                  </blockquote>

                  <div className={styles.momentFooter}>
                    <div>
                      <strong>{moment.spot_name}</strong>
                      <span>
                        {moment.first_name || "Backyrd User"} ·{" "}
                        {formatDate(moment.created_at)}
                      </span>
                    </div>
                    <div>
                      <span>♥ {moment.likes_count}</span>
                      <span>◌ {moment.comments_count}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="app-download" className={styles.downloadSection}>
        <div>
          <p className={styles.eyebrow}>Backyrd App</p>
          <h2>Dein Backyrd wird persönlich.</h2>
          <p>
            Eigene Moments, Favoriten, Journeys und Empfehlungen, die mit
            deinem Geschmack besser werden.
          </p>
        </div>
        <a href={appUrl} className={styles.primaryButton}>
          App herunterladen
        </a>
      </section>

      <section id="owner" className={styles.ownerSection}>
        <div>
          <p className={styles.eyebrow}>Für Gastronomie & Spots</p>
          <h2>Dein Spot auf Backyrd.</h2>
        </div>
        <div>
          <p>
            Pflege deinen Auftritt und verstehe, wie Gäste deinen Spot
            entdecken und erleben.
          </p>
          <div className={styles.ownerActions}>
            <Link
              href="/login?next=/owner"
              className={styles.primaryButton}
            >
              Owner Login
            </Link>
            <Link href="/owner">Zum Dashboard</Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand}>
          backyrd
        </Link>
        <span>Orte nach Gefühl. Nicht nur nach Sternen.</span>
        <div>
          <button type="button" onClick={scrollToDecision}>
            Entscheiden
          </button>
          <Link href="/login?next=/owner">Owner Login</Link>
          <a href="mailto:hello@backyrd.ch">Kontakt</a>
        </div>
      </footer>
    </main>
  );
}
