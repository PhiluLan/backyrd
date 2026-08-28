"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { supabase } from "@/lib/supabase/client";
import {
  AUDIENCE_OPTIONS,
  DIRECTION_OPTIONS,
  MOOD_OPTIONS,
  continueWebDecision,
  recordDecisionFeedback,
  recordVisibleDecisionImpression,
  runWebDecision,
  type DecisionInputMode,
  type DecisionResult,
  type DecisionRun,
} from "@/lib/decision-web-api";
import { ArrowIcon, RouteIcon, SparkIcon } from "./icons";
import { Button, ButtonLink, Chip, StateView, Toast } from "./ui";

type Status = "input" | "loading" | "results" | "error" | "empty";
function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
function image(spot: DecisionResult) {
  return spot.detail?.spot?.header_photo_path ?? null;
}
function category(spot: DecisionResult) {
  return (
    spot.category_name || spot.detail?.spot?.category?.name || "Backyrd Spot"
  );
}
function maps(spot: DecisionResult) {
  const place = spot.detail?.spot;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place?.address || spot.name)}`;
}
export function DecisionExperience() {
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
  const [exposureReady, setExposureReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
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
    setExposureReady(false);
    if (status !== "results" || !run || !current) return;
    const key = `${run.decisionId}:${current.spot_id}`;
    if (seen.current.has(key)) {
      setExposureReady(true);
      return;
    }
    const id = window.setTimeout(() => {
      void recordVisibleDecisionImpression(
        run.decisionId,
        current.spot_id,
        run.page,
        index + 1,
      )
        .then(() => {
          seen.current.add(key);
          setExposureReady(true);
        })
        .catch(() => setToast("Die Ansicht konnte nicht bestätigt werden."));
    }, 750);
    return () => window.clearTimeout(id);
  }, [status, run, current, index]);
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
      const value = await runWebDecision({
        city,
        inputMode: mode,
        rawFreeText: freeText,
        directions,
        audiences,
        moods,
      });
      setRun(value);
      setIndex(0);
      setStatus(value.results.length ? "results" : "empty");
    } catch {
      setError("Deine Vorschläge konnten gerade nicht geladen werden.");
      setStatus("error");
    }
  }, [userId, canRun, city, mode, freeText, directions, audiences, moods]);
  async function advance(action: "next" | "like" | "dislike") {
    if (!run || !current || busy.current) return;
    busy.current = true;
    try {
      if (action !== "next") {
        if (!exposureReady) {
          setToast(
            "Einen kurzen Moment – der Treffer wird noch sichtbar bestätigt.",
          );
          return;
        }
        await recordDecisionFeedback(run.decisionId, current.spot_id, action);
      }
      setIndex((value) => value + 1);
    } catch {
      setToast("Die Aktion konnte nicht gespeichert werden.");
    } finally {
      busy.current = false;
    }
  }
  async function more() {
    if (!run || run.exhausted) return;
    setStatus("loading");
    try {
      const next = await continueWebDecision(
        run.decisionId,
        crypto.randomUUID(),
      );
      setRun(next);
      setIndex(0);
      setStatus(next.results.length ? "results" : "empty");
    } catch {
      setToast("Weitere Vorschläge konnten nicht geladen werden.");
      setStatus("results");
    }
  }
  const finished = Boolean(run && index >= run.results.length);
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
                : location.assign(
                    `/login?next=${encodeURIComponent("/decision")}`,
                  )
            }
          />
        ) : status === "empty" ? (
          <StateView
            title="Noch kein passender Treffer"
            message="Formuliere deinen Moment etwas offener oder ändere eine Auswahl."
            actionLabel="Auswahl anpassen"
            onAction={() => setStatus("input")}
          />
        ) : finished ? (
          <StateView
            title={
              run?.exhausted
                ? "Das waren die passendsten Vorschläge."
                : "Noch nicht das Richtige?"
            }
            message={
              run?.exhausted
                ? "Passe deinen Moment an und starte eine neue Suche."
                : "Backyrd kann weitere Vorschläge aus derselben Decision laden."
            }
            actionLabel={
              run?.exhausted ? "Moment anpassen" : "Weitere Vorschläge"
            }
            onAction={() => (run?.exhausted ? setStatus("input") : void more())}
          />
        ) : current && run ? (
          <article className="b-decision-result">
            <CanonicalSpotImage
              ownerAdminImageUrl={image(current)}
              spotId={current.spot_id}
              spotName={current.name}
            >
              <div style={{ position: "absolute", left: 24, top: 24 }}>
                <span className="b-chip b-chip-lime">{category(current)}</span>
              </div>
            </CanonicalSpotImage>
            <div className="b-decision-copy">
              <div className="b-progress">
                Treffer {index + 1} von {run.results.length}
              </div>
              <h2 className="b-display b-page-title" style={{ marginTop: 16 }}>
                {current.name}
              </h2>
              <p className="b-kicker" style={{ marginTop: 18 }}>
                {current.is_open_now === true
                  ? "Jetzt geöffnet"
                  : current.city || "Basel"}
              </p>
              <div style={{ marginTop: 30 }}>
                <p className="b-label">Warum dieser Treffer?</p>
                <p className="b-body" style={{ fontSize: 18 }}>
                  {current.human_reason ||
                    current.technical_why_this ||
                    "Dieser Ort passt zu den Signalen deines aktuellen Moments."}
                </p>
              </div>
              <div className="b-decision-actions">
                <div className="b-form-actions">
                  <ButtonLink
                    href={`/spots/${current.spot_id}?from=decision`}
                    variant="secondary"
                  >
                    Spot ansehen
                  </ButtonLink>
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
                  disabled={!exposureReady}
                  onClick={() => void advance("next")}
                >
                  Weiter <ArrowIcon />
                </Button>
                <div className="b-decision-feedback">
                  <Button
                    variant="secondary"
                    disabled={!exposureReady}
                    onClick={() => void advance("like")}
                  >
                    Passt
                  </Button>
                  <Button
                    variant="tertiary"
                    disabled={!exposureReady}
                    onClick={() => void advance("dislike")}
                  >
                    Nicht passend
                  </Button>
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </section>
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
