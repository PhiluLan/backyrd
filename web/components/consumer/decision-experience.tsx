"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { supabase } from "@/lib/supabase/client";
import {
  AUDIENCE_OPTIONS,
  DIRECTION_OPTIONS,
  MOOD_OPTIONS,
  recordDecisionInteraction,
  runWebDecision,
  type DecisionInputMode,
  type DecisionResult,
  type DecisionRun,
} from "@/lib/decision-web-api";
import { ArrowIcon, RouteIcon, SparkIcon } from "./icons";
import { Button, Chip, StateView } from "./ui";

type Status = "input" | "loading" | "results" | "error" | "empty";
function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
function image(spot: DecisionResult) {
  return spot.presentation.imageUrl;
}
function category(spot: DecisionResult) {
  return spot.presentation.categoryLabel || "Backyrd Spot";
}
function maps(spot: DecisionResult) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([spot.presentation.name, spot.presentation.locality].filter(Boolean).join(", "))}`;
}
export function DecisionExperience() {
  const router = useRouter();
  const params = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<DecisionInputMode>(
    params.get("mode") === "free" ? "free" : "guided",
  );
  const [city, setCity] = useState("Basel");
  const [freeText, setFreeText] = useState(params.get("query") ?? "");
  const [directions, setDirections] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [status, setStatus] = useState<Status>("input");
  const [run, setRun] = useState<DecisionRun | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const resultElement = useRef<HTMLElement | null>(null);
  const impressed = useRef(new Set<string>());
  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  const canRun = useMemo(
    () =>
      city.trim().length > 1 &&
      (mode === "free"
        ? freeText.trim().length >= 3
        : directions.length + audiences.length + moods.length > 0),
    [city, mode, freeText, directions, audiences, moods],
  );
  const current = run?.results[index] ?? null;
  useEffect(() => {
    const element = resultElement.current;
    if (status !== "results" || !run || !current || !element) return;
    const key = `${run.decisionId}:${current.spotId}`;
    if (impressed.current.has(key)) return;
    let timer: number | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && timer === null) {
        timer = window.setTimeout(() => {
          timer = null;
          void recordDecisionInteraction(run.decisionId, current.spotId, "candidate_impression")
            .then(() => impressed.current.add(key))
            .catch(() => undefined);
        }, 750);
      } else if ((!entry.isIntersecting || entry.intersectionRatio < 0.5) && timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }, { threshold: [0.5] });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [current, run, status]);
  const decisionInput = useCallback(() => ({
    city,
    inputMode: mode,
    rawFreeText: freeText,
    directions,
    audiences,
    moods,
  }), [audiences, city, directions, freeText, mode, moods]);
  const acceptRun = useCallback((value: DecisionRun) => {
    setRun(value);
    const primaryIndex = value.primaryCandidateId
      ? value.results.findIndex((candidate) => candidate.spotId === value.primaryCandidateId)
      : -1;
    setIndex(primaryIndex >= 0 ? primaryIndex : 0);
    setStatus(value.results.length && value.primaryCandidateId ? "results" : "empty");
  }, []);
  const start = useCallback(async () => {
    if (!userId) {
      setError(
        "Melde dich an, damit Backyrd dieselbe sichere Decision wie in der App nutzen kann.",
      );
      setStatus("error");
      return;
    }
    if (!canRun) return;
    setStatus("loading");
    setError("");
    try {
      const value = await runWebDecision(decisionInput());
      acceptRun(value);
    } catch {
      setError("Deine Vorschläge konnten gerade nicht geladen werden.");
      setStatus("error");
    }
  }, [acceptRun, canRun, decisionInput, userId]);
  async function alternative() {
    if (!run || !current || busy.current) return;
    busy.current = true;
    setStatus("loading");
    try {
      const presented = Array.from(new Set([...run.presentedCandidateIds, current.spotId]));
      acceptRun(await runWebDecision(decisionInput(), {
        alternativeRequested: true,
        previouslyPresentedCandidateIds: presented,
        rejectedCandidateIds: run.rejectedCandidateIds,
      }));
    } catch {
      setError("Eine sichere Alternative ist gerade nicht verfügbar.");
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }
  async function reject() {
    if (!run || !current || busy.current) return;
    busy.current = true;
    setStatus("loading");
    try {
      const rejected = Array.from(new Set([...run.rejectedCandidateIds, current.spotId]));
      const presented = Array.from(new Set([...run.presentedCandidateIds, current.spotId]));
      acceptRun(await runWebDecision(decisionInput(), {
        alternativeRequested: false,
        previouslyPresentedCandidateIds: presented,
        rejectedCandidateIds: rejected,
      }));
    } catch {
      setError("Die kontextuelle Abwahl konnte nicht sicher verarbeitet werden.");
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }
  return (
    <div className="b-decision-layout">
      <aside className="b-decision-form-panel">
        <p className="b-kicker">Backyrd Decision</p>
        <h1 className="b-display b-page-title" style={{ marginTop: 12 }}>
          DEIN / JETZT.
        </h1>
        <div className="b-marker" />
        <p className="b-muted">
          Beschreib deinen Moment. Backyrd führt dich ruhig zu Orten, die jetzt
          passen – du entscheidest, was sich richtig anfühlt.
        </p>
        <div className="b-input-group" style={{ marginTop: 28 }}>
          <label className="b-label" htmlFor="decision-city">
            Wo?
          </label>
          <input
            id="decision-city"
            className="b-input"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </div>
        <div className="b-tabs" role="tablist" style={{ marginTop: 18 }}>
          <button
            type="button"
            className="b-tab"
            role="tab"
            aria-selected={mode === "guided"}
            onClick={() => setMode("guided")}
          >
            Geführt
          </button>
          <button
            type="button"
            className="b-tab"
            role="tab"
            aria-selected={mode === "free"}
            onClick={() => setMode("free")}
          >
            Freitext
          </button>
        </div>
        {mode === "free" ? (
          <div className="b-input-group" style={{ marginTop: 20 }}>
            <label className="b-label" htmlFor="decision-free">
              Was passt jetzt?
            </label>
            <textarea
              id="decision-free"
              className="b-textarea"
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              placeholder="Freier Tag mit meiner Tochter, irgendetwas Besonderes …"
            />
            <Button
              disabled={!canRun || status === "loading"}
              onClick={() => void start()}
            >
              Vorschläge finden <SparkIcon />
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 24 }}>
            <div className="b-progress">Moment {stage} / 3</div>
            <h2 className="b-section-title" style={{ marginTop: 10 }}>
              {stage === 1
                ? "Was hast du vor?"
                : stage === 2
                  ? "Mit wem bist du unterwegs?"
                  : "Wie soll es sich anfühlen?"}
            </h2>
            <p className="b-muted">
              {stage === 1
                ? "Wähl einfach, worauf du Lust hast."
                : "Optional – ein Gefühl genügt."}
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              {(stage === 1
                ? DIRECTION_OPTIONS
                : stage === 2
                  ? AUDIENCE_OPTIONS
                  : MOOD_OPTIONS
              ).map((option) => (
                <Chip
                  key={option.key}
                  active={(stage === 1
                    ? directions
                    : stage === 2
                      ? audiences
                      : moods
                  ).includes(option.key)}
                  onClick={() =>
                    stage === 1
                      ? setDirections((value) => toggle(value, option.key))
                      : stage === 2
                        ? setAudiences((value) => toggle(value, option.key))
                        : setMoods((value) => toggle(value, option.key))
                  }
                >
                  {option.label}
                </Chip>
              ))}
            </div>
            <div className="b-form-actions" style={{ marginTop: 26 }}>
              {stage > 1 ? (
                <Button
                  variant="secondary"
                  onClick={() => setStage((stage - 1) as 1 | 2 | 3)}
                >
                  Zurück
                </Button>
              ) : null}
              {stage < 3 ? (
                <Button onClick={() => setStage((stage + 1) as 1 | 2 | 3)}>
                  Weiter <ArrowIcon />
                </Button>
              ) : (
                <Button
                  disabled={!canRun || status === "loading"}
                  onClick={() => void start()}
                >
                  Vorschläge finden <SparkIcon />
                </Button>
              )}
            </div>
          </div>
        )}
      </aside>
      <section className="b-decision-stage">
        {status === "input" ? (
          <div>
            <p className="b-kicker">Ruhig intelligent</p>
            <h2 className="b-display b-display-lg" style={{ marginTop: 16 }}>
              DU BESCHREIBST DEN MOMENT. BACKYRD FINDET DEN ORT.
            </h2>
          </div>
        ) : status === "loading" ? (
          <div className="b-state">
            <div className="b-state-inner">
              <div className="b-state-icon">
                <SparkIcon />
              </div>
              <h2>Backyrd sucht.</h2>
              <p>
                Nicht nach dem beliebtesten Ort – nach dem, der zu deinem Moment
                passt.
              </p>
            </div>
          </div>
        ) : status === "error" ? (
          <StateView
            title="Kurz gestolpert"
            message={error}
            actionLabel={userId ? "Erneut versuchen" : "Anmelden"}
            onAction={() =>
              userId
                ? void start()
                : router.push(`/login?next=${encodeURIComponent("/decision")}`)
            }
          />
        ) : status === "empty" ? (
          <StateView
            title="Noch kein passender Treffer"
            message="Formuliere deinen Moment etwas offener oder ändere eine Auswahl."
            actionLabel="Auswahl anpassen"
            onAction={() => setStatus("input")}
          />
        ) : current && run ? (
          <article className="b-decision-result" ref={resultElement}>
            <CanonicalSpotImage
              ownerAdminImageUrl={image(current)}
              spotId={current.spotId}
              spotName={current.presentation.name}
            >
              <div style={{ position: "absolute", left: 24, top: 24 }}>
                <span className="b-chip b-chip-lime">{category(current)}</span>
              </div>
            </CanonicalSpotImage>
            <div className="b-decision-content">
              <div className="b-progress">
                Treffer {index + 1} von {run.results.length}
              </div>
              <h2 className="b-display b-page-title" style={{ marginTop: 16 }}>
                {current.presentation.name}
              </h2>
              <p className="b-kicker" style={{ marginTop: 18 }}>
                {current.actualAvailability === "open"
                  ? "Jetzt geöffnet"
                  : current.actualAvailability === "closed"
                    ? "Aktuell geschlossen"
                    : current.presentation.locality || "Öffnungsstatus nicht bestätigt"}
              </p>
              <div style={{ marginTop: 30 }}>
                <p className="b-label">Warum dieser Treffer?</p>
                <p className="b-body" style={{ fontSize: 18 }}>
                  {current.reasons
                    .filter((reason) => reason.confirmed)
                    .map((reason) => reason.statement)
                    .slice(0, 3)
                    .join(" ") || "Für diesen Treffer liegt noch keine bestätigte Begründung vor."}
                </p>
                {[...current.limitations, ...run.limitations].length ? (
                  <p className="b-meta" style={{ marginTop: 14 }}>
                    Grenzen: {Array.from(new Set([...current.limitations, ...run.limitations])).join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="b-decision-actions">
                <div className="b-form-actions">
                  <Link
                    href={`/spots/${current.spotId}?from=decision`}
                    className="b-button b-button-secondary"
                    onClick={() => {
                      void recordDecisionInteraction(run.decisionId, current.spotId, "candidate_opened").catch(() => undefined);
                    }}
                  >
                    Spot ansehen
                  </Link>
                  <a
                    className="b-button b-button-secondary"
                    href={maps(current)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <RouteIcon /> Route
                  </a>
                </div>
                <Button
                  disabled={!run.alternativeAvailable}
                  onClick={() => void alternative()}
                >
                  Alternative <ArrowIcon />
                </Button>
                <div className="b-decision-feedback">
                  <Button
                    variant="tertiary"
                    onClick={() => void reject()}
                  >
                    Für diese Anfrage nicht passend
                  </Button>
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  );
}
