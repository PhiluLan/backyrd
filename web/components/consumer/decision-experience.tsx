"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CanonicalSpotImage } from "@/components/canonical-spot-image";
import { supabase } from "@/lib/supabase/client";
import {
  DecisionWebClarification,
  DecisionWebDialogue,
  recordDecisionInteraction,
  runWebDecision,
  type DecisionAction,
  type DecisionResult,
  type DecisionRun,
} from "@/lib/decision-web-api";
import {
  clearOtherWohinHistories,
  readWohinHistory,
  writeWohinHistory,
  WOHIN_HISTORY_EVENT,
  type WohinHistoryEntry,
} from "@/lib/wohin-history";
import {
  wohinAvailability,
  wohinClarificationQuery,
  wohinConsiderations,
  wohinFollowUp,
  wohinMessageKind,
  wohinOffTopicMessage,
  wohinPlaceMeta,
  wohinRecommendation,
} from "../../../mobile/lib/decision/wohinModel";
import { ArrowIcon, SparkIcon } from "./icons";
import { Button, Dialog } from "./ui";
import styles from "./wohin.module.css";

async function identityDeadline<T>(operation: PromiseLike<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("identity_unavailable")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

type Conversation = {
  wish: string;
  turns: { question: string | null; answer: string }[];
};
type Identity = { actor: string | null; name: string | null; ready: boolean };
type Attempt = {
  text: string;
  draftToClear?: string;
  conversation: Conversation;
  action?: DecisionAction;
  reply?: string;
};

function ResultCard({
  current,
  run,
}: {
  current: DecisionResult;
  run: DecisionRun;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || current.presentation.event) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recorded = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          entry.intersectionRatio >= 0.5 &&
          !timer &&
          !recorded
        ) {
          timer = setTimeout(() => {
            timer = undefined;
            recorded = true;
            void recordDecisionInteraction(
              run.decisionId,
              current.spotId,
              "candidate_impression",
            ).catch(() => {
              recorded = false;
            });
          }, 750);
        } else if (!entry.isIntersecting || entry.intersectionRatio < 0.5) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [current, run.decisionId]);
  const event = current.presentation.event;
  const href = event
    ? `/events/${event.eventId}?occurrence=${event.occurrenceId}`
    : `/spots/${current.spotId}?from=decision`;
  const image = event?.imageStoragePath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-images/${event.imageStoragePath}`
    : current.presentation.imageUrl;
  const notes = wohinConsiderations(current, run.personalized);
  return (
    <article ref={ref} className={styles.result}>
      <Link
        href={href}
        className={styles.artwork}
        aria-label={`${current.presentation.name} entdecken`}
        onClick={() => {
          if (!event)
            void recordDecisionInteraction(
              run.decisionId,
              current.spotId,
              "candidate_opened",
            ).catch(() => undefined);
        }}
      >
        <CanonicalSpotImage
          ownerAdminImageUrl={image}
          spotId={current.spotId}
          spotName={current.presentation.name}
        >
          <div className={styles.photoCopy}>
            <p>{wohinPlaceMeta(current)}</p>
            <h3>{current.presentation.name}</h3>
            <span>{event ? "Event ansehen" : "Ort ansehen"} ↗</span>
          </div>
        </CanonicalSpotImage>
      </Link>
      <p className={styles.reason}>
        {wohinRecommendation(current, run.interpretation, false)}
      </p>
      <details className={styles.notes}>
        <summary>
          Gut zu wissen <span aria-hidden="true">＋</span>
        </summary>
        <p>{wohinAvailability(current)}</p>
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </details>
    </article>
  );
}

export function DecisionExperience() {
  const params = useSearchParams();
  const initial = (params.get("query") ?? "").slice(0, 2000);
  const [identity, setIdentity] = useState<Identity>({
    actor: null,
    name: null,
    ready: false,
  });
  const actor = useRef<string | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const identityRetry = useRef<() => void>(() => {});
  const [city, setCity] = useState("");
  const [draft, setDraft] = useState(initial);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [run, setRun] = useState<DecisionRun | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offTopic, setOffTopic] = useState(false);
  const [newPlan, setNewPlan] = useState<string | null>(null);
  const [history, setHistory] = useState<WohinHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(params.get("history") === "1");
  const [removing, setRemoving] = useState<string | "all" | null>(null);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const pending = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const response = useRef<HTMLElement>(null);
  const [responseRevision, setResponseRevision] = useState(0);
  const historyRows = useRef<WohinHistoryEntry[]>([]);
  useEffect(() => {
    if (params.get("history") === "1") setHistoryOpen(true);
  }, [params]);
  const historyFailed = useRef(false);
  const historyRevision = useRef(0);

  const loadHistory = useCallback((id: string) => {
    try {
      const rows = readWohinHistory(id);
      historyRows.current = rows;
      setHistory(rows);
      historyFailed.current = false;
      setHistoryError(false);
    } catch {
      historyFailed.current = true;
      setHistoryError(true);
      historyRows.current = [];
      setHistory([]);
    }
  }, []);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const lifecycle = { revision, request };
    async function sync() {
      const version = ++generation;
      setIdentityError(false);
      try {
        const { data, error: authError } = await identityDeadline(
          supabase.auth.getUser(),
        );
        if (!active || version !== generation) return;
        if (authError && authError.name !== "AuthSessionMissingError")
          throw authError;
        const id = data.user?.id ?? null;
        const changedActor = id !== actor.current;
        if (changedActor) {
          revision.current++;
          request.current?.abort();
          pending.current = false;
          setLoading(false);
          setRun(null);
          setConversation(null);
          setQuestion(null);
          setSubmitted("");
          setNewPlan(null);
          setOffTopic(false);
          setError(null);
          if (actor.current) setDraft("");
          setIdentity({ actor: id, name: null, ready: false });
          actor.current = id;
          historyRows.current = [];
          setHistory([]);
          attempt.current = null;
        }
        try {
          clearOtherWohinHistories(id ?? undefined);
        } catch {
          setHistoryError(true);
        }
        if (!id) {
          setIdentity({ actor: null, name: null, ready: true });
          return;
        }
        const { data: profile } = await identityDeadline(
          supabase
            .from("profiles")
            .select("first_name,display_name,city")
            .eq("id", id)
            .maybeSingle(),
        );
        if (!active || version !== generation || actor.current !== id) return;
        if (changedActor)
          setCity(typeof profile?.city === "string" ? profile.city : "");
        setIdentity({
          actor: id,
          name: profile?.first_name || profile?.display_name || null,
          ready: true,
        });
        loadHistory(id);
      } catch {
        if (!active || version !== generation) return;
        revision.current++;
        request.current?.abort();
        pending.current = false;
        actor.current = null;
        setLoading(false);
        setRun(null);
        setConversation(null);
        setQuestion(null);
        setSubmitted("");
        setHistory([]);
        historyRows.current = [];
        setIdentity({ actor: null, name: null, ready: true });
        setIdentityError(true);
      }
    }
    identityRetry.current = () => {
      void sync();
    };
    void sync();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        if (active) void sync();
      }, 0);
    });
    return () => {
      active = false;
      generation++;
      lifecycle.revision.current++;
      lifecycle.request.current?.abort();
      subscription.unsubscribe();
      identityRetry.current = () => {};
    };
  }, [loadHistory]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if (event.type === "storage") historyRevision.current++;
      if (actor.current) loadHistory(actor.current);
    };
    window.addEventListener("storage", refresh);
    window.addEventListener(WOHIN_HISTORY_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(WOHIN_HISTORY_EVENT, refresh);
    };
  }, [loadHistory]);
  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [loading]);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(132, input.current.scrollHeight)}px`;
    }
  }, [draft]);
  useEffect(() => {
    if (!responseRevision) return;
    response.current?.focus({ preventScroll: true });
    response.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [responseRevision]);

  function saveHistory(id: string, row: WohinHistoryEntry) {
    if (actor.current !== id || historyFailed.current) return;
    try {
      writeWohinHistory(id, [
        row,
        ...historyRows.current.filter(
          (old) =>
            old.id !== row.id &&
            !(old.query === row.query && old.city === row.city),
        ),
      ]);
    } catch {
      historyFailed.current = true;
      setHistoryError(true);
    }
  }
  async function search(next: Attempt) {
    if (
      pending.current ||
      !identity.actor ||
      identity.actor !== actor.current ||
      !city.trim()
    )
      return;
    const id = actor.current;
    const version = ++revision.current;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    pending.current = true;
    attempt.current = next;
    setError(null);
    setOffTopic(false);
    setNewPlan(null);
    setLoading(true);
    setElapsed(0);
    input.current?.blur();
    const historyEntry: WohinHistoryEntry = {
      id: crypto.randomUUID(),
      query: next.text,
      city: city.trim(),
      at: Date.now(),
      completed: false,
    };
    const historyVersion = historyRevision.current;
    saveHistory(id, historyEntry);
    setResponseRevision((value) => value + 1);
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const result = await runWebDecision(
        { city, rawFreeText: next.text },
        next.action,
        {
          signal: controller.signal,
          supportsDialogueChoice: Boolean(next.reply),
        },
      );
      if (version !== revision.current || id !== actor.current) return;
      if (controller.signal.aborted) throw new Error("wohin_request_cancelled");
      setConversation(next.conversation);
      setSubmitted(next.text);
      setRun(result);
      setQuestion(result.clarification ?? null);
      if (next.draftToClear !== undefined)
        setDraft((current) => (current === next.draftToClear ? "" : current));
      if (historyVersion === historyRevision.current)
        saveHistory(id, { ...historyEntry, completed: true });
    } catch (cause) {
      if (version !== revision.current || id !== actor.current) return;
      if (cause instanceof DecisionWebClarification) {
        setConversation(next.conversation);
        setSubmitted(next.text);
        setQuestion(cause.question);
        setRun(null);
        if (next.draftToClear !== undefined)
          setDraft((current) => (current === next.draftToClear ? "" : current));
      } else if (cause instanceof DecisionWebDialogue && next.reply) {
        if (cause.route === "NEW_PLAN") setNewPlan(next.reply);
        else setOffTopic(true);
      } else if (
        cause instanceof Error &&
        cause.message === "decision_nuknuk_unresolved"
      ) {
        setOffTopic(true);
      } else
        setError(
          "Das hat gerade nicht geklappt. Dein Wunsch bleibt hier — versuch es noch einmal.",
        );
    } finally {
      clearTimeout(timeout);
      if (version === revision.current && id === actor.current) {
        pending.current = false;
        setLoading(false);
        setResponseRevision((value) => value + 1);
      }
    }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending.current) return;
    const kind = wohinMessageKind(text, conversation?.wish);
    if (kind === "OFF_TOPIC") {
      setOffTopic(true);
      setResponseRevision((value) => value + 1);
      return;
    }
    if (conversation && kind === "NEW_PLAN") {
      setNewPlan(text);
      setResponseRevision((value) => value + 1);
      return;
    }
    const refined = conversation
      ? wohinClarificationQuery(submitted, question, text)
      : text;
    if (!refined || refined.length > 2000) return;
    void search({
      text: refined,
      draftToClear: draft,
      conversation: conversation
        ? {
            ...conversation,
            turns: [...conversation.turns, { question, answer: text }],
          }
        : { wish: text, turns: [] },
      reply: conversation ? text : undefined,
    });
  }
  function reset(text = "", nextCity?: string) {
    revision.current++;
    request.current?.abort();
    pending.current = false;
    attempt.current = null;
    setLoading(false);
    setRun(null);
    setConversation(null);
    setQuestion(null);
    setSubmitted("");
    setError(null);
    setOffTopic(false);
    setNewPlan(null);
    setDraft(text);
    setHistoryOpen(false);
    if (nextCity) setCity(nextCity);
    input.current?.focus();
  }
  function removeHistory() {
    if (!actor.current || !removing) return;
    try {
      historyRevision.current++;
      writeWohinHistory(
        actor.current,
        removing === "all"
          ? []
          : historyRows.current.filter((row) => row.id !== removing),
      );
      setRemoving(null);
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    }
  }
  const replyLimit = conversation
    ? Math.max(
        0,
        2000 -
          submitted.length -
          (question
            ? question.length + "\nRückfrage: \nAntwort: ".length
            : "\nErgänzung: ".length),
      )
    : 2000;
  const valid =
    identity.ready &&
    Boolean(identity.actor) &&
    identity.actor === actor.current &&
    draft.trim().length >= (conversation ? 1 : 3) &&
    draft.length <= replyLimit &&
    Boolean(city.trim());
  const date = (value: number) =>
    new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "short" }).format(
      new Date(value),
    );
  const empty =
    run && !run.results.length
      ? wohinFollowUp({ limitations: run.limitations, candidates: run.results })
      : null;
  const reuse = (row: WohinHistoryEntry) => {
    if (
      (draft.trim() || conversation) &&
      !window.confirm(
        "Aktuellen Plan verlassen? Die gewählte Anfrage wird als Entwurf übernommen und noch nicht gesendet.",
      )
    )
      return;
    reset(row.query, row.city);
  };
  const ideas = [
    {
      title: "Feierabend nach Gefühl",
      detail: "Ein guter Drink. Gute Gesellschaft.",
      query: `Wo kann ich heute Abend in ${city || "Basel"} gemütlich etwas trinken?`,
    },
    {
      title: "Morgen mal raus",
      detail: "Etwas erleben statt lange planen.",
      query: `Was kann ich morgen in ${city || "Basel"} unternehmen?`,
    },
    {
      title: "Anders abbiegen",
      detail: "Deine Stadt von einer neuen Seite.",
      query: `Zeig mir etwas Besonderes in ${city || "Basel"}.`,
    },
  ];
  return (
    <div className={styles.experience}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="Zurück zu Entdecken">
          ←
        </Link>
        <h1>
          Wohin<span>?</span>
        </h1>
        <Button
          variant="tertiary"
          onClick={() => setHistoryOpen(true)}
          aria-label="Deine Anfragen öffnen"
        >
          Verlauf
        </Button>
      </header>
      <div
        className={styles.layout}
        data-active={Boolean(conversation || loading)}
      >
        <aside className={styles.intro}>
          <p className={styles.greeting}>
            {identity.name ? `Hey ${identity.name}.` : "Hey, schön bist du da."}
          </p>
          <h2>
            Zeit für
            <br />
            was <span>Gutes.</span>
          </h2>
          <p className={styles.invitation}>
            Worauf hast du Lust? Ein Gedanke reicht. Wir machen einen Plan
            draus.
          </p>
          {identityError ? (
            <p className={styles.storage} role="alert">
              Deine Anmeldung konnte gerade nicht geprüft werden.{" "}
              <button onClick={() => identityRetry.current()}>
                Anmeldung erneut prüfen
              </button>
            </p>
          ) : !identity.ready ? (
            <p role="status">Dein Backyrd wird geladen …</p>
          ) : !identity.actor ? (
            <p className={styles.storage}>
              Melde dich an, damit wir nach deinem Wunsch suchen können.{" "}
              <Link
                href={`/login?next=${encodeURIComponent(`/decision?query=${encodeURIComponent(draft)}`)}`}
              >
                Anmelden
              </Link>
            </p>
          ) : null}
          <label className={styles.city}>
            Deine Suchregion
            <input
              aria-label="Suchregion"
              value={city}
              maxLength={160}
              placeholder={identity.ready ? "Stadt eingeben" : "Wird geladen …"}
              disabled={!identity.ready || loading || Boolean(conversation)}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>
          {!conversation && (
            <div className={styles.ideas} aria-label="Ein Gedanke zum Loslegen">
              {ideas.map((idea) => (
                <button
                  key={idea.title}
                  onClick={() => {
                    setDraft(idea.query);
                    input.current?.focus();
                  }}
                  disabled={loading}
                >
                  <span>{idea.title} ↗</span>
                  <small>{idea.detail}</small>
                </button>
              ))}
            </div>
          )}
          {conversation && (
            <Button
              variant="tertiary"
              onClick={() => {
                if (
                  !draft.trim() ||
                  window.confirm(
                    "Entwurf verwerfen und einen neuen Plan starten?",
                  )
                )
                  reset();
              }}
            >
              Neuer Plan ↗
            </Button>
          )}
          {identity.actor && !conversation && (
            <section className={styles.recent} aria-label="Letzte Anfragen">
              <div>
                <h3>Zuletzt mit NukNuk</h3>
                <button onClick={() => setHistoryOpen(true)}>
                  Alle ansehen
                </button>
              </div>
              {history.slice(0, 2).map((row) => (
                <button key={row.id} onClick={() => reuse(row)}>
                  <small>{date(row.at)}</small>
                  <span>{row.query}</span>
                </button>
              ))}
              {!history.length && !historyError && (
                <p>Deine nächsten Anfragen findest du hier wieder.</p>
              )}
            </section>
          )}
        </aside>
        <div className={styles.journey}>
          <section
            className={styles.response}
            aria-label="Dein Plan mit NukNuk"
            aria-busy={loading}
          >
            {conversation && (
              <>
                <p className={styles.you}>Du</p>
                <p className={styles.wish}>{conversation.wish}</p>
                {conversation.turns.map((turn, index) => (
                  <div className={styles.turn} key={index}>
                    {turn.question && (
                      <p>
                        <strong>NukNuk</strong>
                        {turn.question}
                      </p>
                    )}
                    <p>
                      <strong>Du</strong>
                      {turn.answer}
                    </p>
                  </div>
                ))}
              </>
            )}
            <section
              ref={response}
              tabIndex={-1}
              className={styles.answer}
              aria-label="NukNuks Antwort"
            >
              {loading && (!conversation || attempt.current?.reply) && (
                <>
                  <p className={styles.you}>Du</p>
                  <p className={styles.wish}>
                    {attempt.current?.reply ??
                      attempt.current?.conversation.wish}
                  </p>
                </>
              )}
              {loading ? (
                <div className={styles.wait} role="status">
                  <span className={styles.orbit} aria-hidden="true" />
                  <p className={styles.speaker}>NukNuk</p>
                  <h2>Schauen wir, was zu dir passt.</h2>
                  <p>
                    {elapsed >= 10
                      ? "Ich bin noch dran. Dein Wunsch bleibt hier."
                      : "Ein guter Plan fängt mit deiner Idee an."}
                  </p>
                  <button
                    onClick={() => {
                      revision.current++;
                      request.current?.abort();
                      pending.current = false;
                      setLoading(false);
                    }}
                  >
                    Suche abbrechen
                  </button>
                </div>
              ) : (
                <>
                  {error && (
                    <div role="alert" className={styles.notice}>
                      <p>{error}</p>
                      <Button
                        onClick={() => {
                          if (attempt.current) void search(attempt.current);
                        }}
                      >
                        Erneut versuchen
                      </Button>
                    </div>
                  )}
                  {offTopic && (
                    <div className={styles.notice} role="status">
                      <p className={styles.speaker}>NukNuk</p>
                      <p>{wohinOffTopicMessage}</p>
                    </div>
                  )}
                  {newPlan && (
                    <div className={styles.notice} role="status">
                      <p>
                        Das klingt nach einem zweiten Plan. Sollen wir dafür neu
                        suchen?
                      </p>
                      <Button
                        onClick={() => {
                          const text = newPlan;
                          reset(text);
                          void search({
                            text,
                            draftToClear: text,
                            conversation: { wish: text, turns: [] },
                          });
                        }}
                      >
                        Für den neuen Plan suchen
                      </Button>
                      <Button
                        variant="tertiary"
                        onClick={() => {
                          setNewPlan(null);
                          input.current?.focus();
                        }}
                      >
                        Beim bisherigen Plan bleiben
                      </Button>
                    </div>
                  )}
                  {question && (
                    <div className={styles.question}>
                      <p className={styles.speaker}>NukNuk</p>
                      <h2>{question}</h2>
                      <p>
                        Antworte einfach unten. Dein bisheriger Wunsch bleibt
                        dabei.
                      </p>
                    </div>
                  )}
                  {empty && !question && (
                    <div className={styles.question}>
                      <p className={styles.speaker}>NukNuk</p>
                      <h2>Schauen wir noch einmal hin.</h2>
                      <p>{empty.message}</p>
                    </div>
                  )}
                  {run && run.results.length > 0 && (
                    <>
                      <p className={styles.speaker}>NukNuk</p>
                      <h2 className={styles.resultsTitle}>
                        {error
                          ? "Deine bisherigen Vorschläge"
                          : "Das könnte dein Plan werden."}
                      </h2>
                      <p className={styles.resultCount}>
                        {run.results.length}{" "}
                        {run.results.length === 1 ? "Idee" : "Ideen"} für deinen
                        Moment
                      </p>
                      <div className={styles.results}>
                        {run.results.map((current) => (
                          <ResultCard
                            key={`${run.decisionId}:${current.spotId}`}
                            current={current}
                            run={run}
                          />
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        disabled={!run.alternativeAvailable}
                        onClick={() => {
                          if (conversation)
                            void search({
                              text: submitted,
                              conversation,
                              action: {
                                alternativeRequested: true,
                                previouslyPresentedCandidateIds: [
                                  ...new Set([
                                    ...run.presentedCandidateIds,
                                    ...run.results.map((row) => row.spotId),
                                  ]),
                                ],
                                rejectedCandidateIds: run.rejectedCandidateIds,
                              },
                            });
                        }}
                      >
                        Andere Vorschläge ansehen
                      </Button>
                      <p className={styles.afterword}>
                        Noch nicht ganz deins? Sag mir unten, was anders sein
                        soll.
                      </p>
                    </>
                  )}
                  {!conversation && !run && !error && !offTopic && !newPlan && (
                    <div className={styles.start}>
                      <SparkIcon />
                      <p>Du musst noch keinen fertigen Plan haben.</p>
                      <span>
                        Was du vorhast. Mit wem. Oder einfach, wie es sich
                        anfühlen soll.
                      </span>
                    </div>
                  )}
                </>
              )}
            </section>
          </section>
          {historyError && (
            <p className={styles.storage} role="status">
              Dein Verlauf konnte in diesem Browser nicht gelesen oder
              gespeichert werden. Deine Suche funktioniert weiter.{" "}
              <button
                onClick={() => {
                  if (actor.current) loadHistory(actor.current);
                }}
              >
                Erneut prüfen
              </button>
            </p>
          )}
          {conversation && replyLimit < 1 && (
            <p className={styles.storage}>
              Dieser Plan ist schon sehr lang. Starte einen neuen Plan, um
              weiterzusuchen.
            </p>
          )}
          <form className={styles.composer} onSubmit={send}>
            <label className="sr-only" htmlFor="wohin-message">
              {conversation ? "Nachricht an NukNuk" : "Was hast du im Kopf?"}
            </label>
            <textarea
              ref={input}
              id="wohin-message"
              rows={1}
              value={draft}
              maxLength={Math.max(0, replyLimit)}
              placeholder={
                conversation
                  ? question
                    ? "Deine Antwort …"
                    : "Was darf noch anders sein?"
                  : "Was hast du im Kopf?"
              }
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              aria-label={conversation ? "Nachricht senden" : "Wunsch senden"}
              disabled={!valid || loading}
            >
              <ArrowIcon />
            </button>
          </form>
        </div>
      </div>
      <Dialog
        open={historyOpen}
        title="Deine Anfragen"
        onClose={() => {
          setHistoryOpen(false);
          setRemoving(null);
        }}
      >
        <div className={styles.history}>
          <p>
            Nur in diesem Browser gespeichert, getrennt pro Konto. Bis zu 20
            Anfragen für 30 Tage. Beim Abmelden wird der Verlauf entfernt.
          </p>
          <p>
            <Link href="/settings/decision-history?legacy=1">
              Frühere historische Einträge ansehen
            </Link>
          </p>
          {!identity.actor ? (
            <p>Melde dich an, um deine Anfragen zu sehen.</p>
          ) : (
            <>
              {historyError && (
                <p role="alert">
                  Dein gespeicherter Verlauf ist gerade nicht verfügbar.{" "}
                  <button onClick={() => loadHistory(identity.actor!)}>
                    Erneut prüfen
                  </button>
                </p>
              )}
              {!history.length && !historyError && (
                <p>Noch keine Anfragen. Deine nächste Idee wartet auf dich.</p>
              )}
              {history.map((row) => (
                <article key={row.id}>
                  <button
                    aria-label={`Anfrage übernehmen: ${row.query}`}
                    onClick={() => reuse(row)}
                  >
                    <small>
                      {date(row.at)} · {row.city}
                      {row.completed ? "" : " · Anfrage"}
                    </small>
                    <span>{row.query}</span>
                  </button>
                  <button
                    aria-label={`Anfrage löschen: ${row.query}`}
                    onClick={() => setRemoving(row.id)}
                  >
                    Löschen
                  </button>
                </article>
              ))}
              {history.length > 0 && (
                <Button variant="tertiary" onClick={() => setRemoving("all")}>
                  Verlauf löschen
                </Button>
              )}
              {removing && (
                <div className={styles.notice}>
                  <p>
                    {removing === "all"
                      ? "Alle gespeicherten Anfragen in diesem Browser löschen?"
                      : "Diese Anfrage aus deinem Verlauf löschen?"}
                  </p>
                  <Button variant="danger" onClick={removeHistory}>
                    Ja, löschen
                  </Button>
                  <Button variant="tertiary" onClick={() => setRemoving(null)}>
                    Behalten
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
