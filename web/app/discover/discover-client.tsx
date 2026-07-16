"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  runWebDecision,
  type DecisionContext,
  type DecisionResult,
} from "@/lib/decision-web-api";
import styles from "./discover.module.css";

const suggestions = [
  "Gemütlich, Drinks, nicht zu laut",
  "Etwas Besonderes für ein Date",
  "Lebendig mit Freunden",
  "Gutes Essen, unkompliziert",
  "Spontan noch etwas erleben",
];

function getPhoto(result: DecisionResult): string | null {
  return (
    result.detail?.photos?.[0]?.url ||
    result.detail?.spot?.header_photo_path ||
    null
  );
}

function getCategory(result: DecisionResult): string {
  return result.detail?.spot?.category?.name || "Spot";
}

function scoreLabel(score: number | null): string | null {
  if (score === null) return null;
  const normalized = Math.max(0, Math.min(99, Math.round(score * 100)));
  return `${normalized}% Match`;
}

export function DiscoverClient() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Basel");
  const [context, setContext] = useState<DecisionContext | null>(null);
  const [results, setResults] = useState<DecisionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => query.trim().length >= 3 && !loading, [query, loading]);

  async function submitDecision(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const data = await runWebDecision({
        city,
        query,
        limit: 6,
      });
      setContext(data.context);
      setResults(data.results);
    } catch (err: unknown) {
      setContext(null);
      setResults([]);
      setError(
        err instanceof Error
          ? err.message
          : "Backyrd konnte gerade keine Entscheidung treffen."
      );
    } finally {
      setLoading(false);
    }
  }

  function chooseSuggestion(value: string) {
    setQuery(value);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || "#app-download";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          backyrd
        </Link>

        <div className={styles.headerActions}>
          <Link href="/login?next=/owner" className={styles.ownerLink}>
            Owner Login
          </Link>
          <a href={appUrl} className={styles.appLink}>
            App laden
          </a>
        </div>
      </header>

      <section className={styles.decision}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Backyrd Decision</p>
          <h1>Worauf hast du gerade Lust?</h1>
          <p>
            Beschreibe deinen Moment. Backyrd findet Orte, die jetzt zu dir
            passen – nicht einfach die mit den meisten Sternen.
          </p>
        </div>

        <form className={styles.form} onSubmit={submitDecision}>
          <div className={styles.inputWrap}>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Zum Beispiel: gemütlich, Drinks, nicht zu laut…"
              rows={3}
              autoFocus
            />

            <div className={styles.formFooter}>
              <label>
                <span>Ort</span>
                <select value={city} onChange={(event) => setCity(event.target.value)}>
                  <option value="Basel">Basel</option>
                  <option value="Zürich">Zürich</option>
                  <option value="Bern">Bern</option>
                  <option value="Luzern">Luzern</option>
                  <option value="Genf">Genf</option>
                </select>
              </label>

              <button type="submit" disabled={!canSubmit}>
                {loading ? "Backyrd entscheidet…" : "Entscheidung starten"}
              </button>
            </div>
          </div>
        </form>

        {!hasSearched && (
          <div className={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => chooseSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading && (
        <section className={styles.loading}>
          <div className={styles.loader} />
          <p>Backyrd sucht nach dem richtigen Ort für jetzt.</p>
        </section>
      )}

      {!loading && error && (
        <section className={styles.state}>
          <p className={styles.eyebrow}>Gerade nicht verfügbar</p>
          <h2>Die Entscheidung konnte nicht geladen werden.</h2>
          <p>{error}</p>
          <button type="button" onClick={() => submitDecision()}>
            Erneut versuchen
          </button>
        </section>
      )}

      {!loading && hasSearched && !error && (
        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.eyebrow}>
                {context?.decision_mode === "strong_personalized"
                  ? "Für dich"
                  : "Backyrd Auswahl"}
              </p>
              <h2>{context?.title || "Wohin jetzt?"}</h2>
              <p>
                {context?.body ||
                  "Diese Orte passen am besten zu deiner aktuellen Suche."}
              </p>
            </div>

            <button
              type="button"
              className={styles.newDecision}
              onClick={() => {
                setHasSearched(false);
                setResults([]);
                setContext(null);
                setQuery("");
              }}
            >
              Neue Entscheidung
            </button>
          </div>

          {results.length === 0 ? (
            <div className={styles.empty}>
              <h3>Noch kein passender Ort gefunden.</h3>
              <p>
                Versuche es etwas offener, zum Beispiel mit „gemütlich und lokal“.
              </p>
            </div>
          ) : (
            <div className={styles.grid}>
              {results.map((result, index) => {
                const photo = getPhoto(result);
                const match = scoreLabel(result.final_score);

                return (
                  <Link
                    href={`/spots/${result.spot_id}?from=decision`}
                    className={styles.card}
                    key={result.spot_id}
                  >
                    <div
                      className={`${styles.cardImage} ${
                        photo ? "" : styles.cardImageFallback
                      }`}
                      style={
                        photo
                          ? {
                              backgroundImage: `linear-gradient(180deg, transparent 35%, rgba(7,7,8,.88)), url("${photo}")`,
                            }
                          : undefined
                      }
                    >
                      <span className={styles.rank}>0{index + 1}</span>
                      {match && <span className={styles.match}>{match}</span>}

                      <div className={styles.cardTitle}>
                        <span>
                          {getCategory(result)}
                          {result.city ? ` · ${result.city}` : ""}
                        </span>
                        <h3>{result.name}</h3>
                      </div>
                    </div>

                    <div className={styles.cardBody}>
                      <p>
                        {result.why_this ||
                          "Passt besonders gut zu deiner aktuellen Stimmung."}
                      </p>

                      <div className={styles.cardMeta}>
                        <div>
                          {result.is_open_now !== null && (
                            <span
                              className={
                                result.is_open_now
                                  ? styles.open
                                  : styles.closed
                              }
                            >
                              {result.is_open_now ? "Jetzt geöffnet" : "Gerade geschlossen"}
                            </span>
                          )}
                        </div>
                        <span className={styles.cardArrow}>↗</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section id="app-download" className={styles.appGate}>
        <div>
          <p className={styles.eyebrow}>Mehr in der App</p>
          <h2>Dein Backyrd wird persönlich.</h2>
          <p>
            Moments erstellen, Spots speichern, Menschen folgen, Journeys
            planen und Empfehlungen erhalten, die mit dir besser werden.
          </p>
        </div>

        <a href={appUrl}>Backyrd App herunterladen</a>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand}>
          backyrd
        </Link>
        <span>Orte nach Gefühl. Nicht nur nach Sternen.</span>
        <Link href="/login?next=/owner">Owner Login</Link>
      </footer>
    </main>
  );
}
