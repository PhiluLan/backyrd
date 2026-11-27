"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { learningStarters } from "../../../../packages/shared/src/nuknuk-learning-starters";
import {
  learningTopics,
  learningSplits,
  learningStates,
  learningError,
  learningLocalTime,
  learningReferenceTime,
  parseLearningPage,
  parseLearningDetail,
  parseLearningRuns,
  parseLearningDocument,
  parseLearningReport,
  verifyLearningExport,
  targetCards,
  type LearningCase,
  type LearningDocument,
  type LearningEvent,
  type LearningRun,
  type LearningTopic,
  type LearningSplit,
  type LearningState,
  type CoverageRow,
} from "@/lib/nuknukLearning";
import styles from "./workshop.module.css";

type Tab = "situations" | "review" | "coverage" | "runs";
const time = (value: string) =>
  new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const emptyDocument = (): LearningDocument => ({
  query: "",
  notes: "",
  obligations: [],
  forbidden: [],
  tags: [],
  locale: "de-CH",
  reference: { now: new Date().toISOString(), timezone: "Europe/Zurich" },
  source: "authored",
  dataPolicy: "SYNTHETIC_OR_REDACTED",
});
async function rpc(
  action: string,
  id: string | null = null,
  revision: number | null = null,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await supabase.rpc("admin_nuknuk_learning_v1", {
    p_action: action,
    p_id: id,
    p_expected_revision: revision,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}
const eventLabel: Record<string, string> = {
  created: "Situation angelegt",
  save: "Inhalt geändert · Freigabe zurückgesetzt",
  review: "Prüfentscheidung",
  comment: "Kommentar",
  translated: "KI-Übersetzung vorbereitet",
  variant: "Ungeprüfte Variante angelegt",
};
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function LearningWorkshop({
  initialFeedback = null,
}: {
  initialFeedback?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("situations"),
    [refresh, setRefresh] = useState(0),
    [operation, setBusy] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [loadedRequest, setLoadedRequest] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [rows, setRows] = useState<LearningCase[]>([]),
    [coverage, setCoverage] = useState<CoverageRow[]>([]),
    [runs, setRuns] = useState<LearningRun[]>([]);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [state, setState] = useState(""),
    [topic, setTopic] = useState(""),
    [split, setSplit] = useState("");
  const [before, setBefore] = useState<{
      before: string;
      beforeId: string;
    } | null>(null),
    [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<LearningCase | null>(null),
    [history, setHistory] = useState<LearningEvent[]>([]),
    [editing, setEditing] = useState(Boolean(initialFeedback)),
    [creating, setCreating] = useState(Boolean(initialFeedback));
  const [doc, setDoc] = useState<LearningDocument>(() => ({
      ...emptyDocument(),
      source: initialFeedback ? "feedback_redacted" : "authored",
    })),
    [familyTitle, setFamilyTitle] = useState(""),
    [newTopic, setNewTopic] = useState<LearningTopic>("everyday"),
    [newSplit, setNewSplit] = useState<LearningSplit>("TRAIN"),
    [parent, setParent] = useState<string | null>(null),
    [feedback, setFeedback] = useState<string | null>(initialFeedback),
    [privacy, setPrivacy] = useState(false);
  const [note, setNote] = useState(""),
    [checks, setChecks] = useState({
      meaning: false,
      roles: false,
      nothingInvented: false,
      privacy: false,
    }),
    [queue, setQueue] = useState<string[]>([]),
    [runTitle, setRunTitle] = useState(""),
    [adapterHash, setAdapterHash] = useState("");
  const detailGeneration = useRef(0),
    operationLock = useRef(false),
    batchAbort = useRef<AbortController | null>(null);
  const [batchActive, setBatchActive] = useState(false);
  const busy = operation || detailLoading;
  const open = useCallback(async (id: string) => {
    const request = ++detailGeneration.current;
    setDetailLoading(true);
    setError("");
    try {
      const value = parseLearningDetail(await rpc("detail", id));
      if (request !== detailGeneration.current) return;
      setSelected(value.case);
      setHistory(value.history);
      setDoc(value.case.document);
      setEditing(false);
      setCreating(false);
      setParent(null);
      setFeedback(null);
      setPrivacy(false);
      setNote("");
      setChecks({
        meaning: false,
        roles: false,
        nothingInvented: false,
        privacy: false,
      });
    } catch (failure) {
      if (request === detailGeneration.current)
        setError(learningError(failure));
    } finally {
      if (request === detailGeneration.current) setDetailLoading(false);
    }
  }, []);
  async function task(work: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError(learningError(failure));
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }
  const reload = () => {
    setError("");
    setBefore(null);
    setRefresh((x) => x + 1);
  };
  const requestKey = JSON.stringify({
    refresh,
    search,
    state,
    topic,
    split,
    tab,
    before,
  });
  const loading = loadedRequest !== requestKey;
  useEffect(() => {
    let active = true;
    void Promise.all([
      rpc("list", null, null, {
        search,
        state: tab === "review" ? "review" : state,
        topic,
        split,
        ...(before ?? {}),
      }),
      rpc("runs"),
    ])
      .then(([list, runData]) => {
        if (!active) return;
        setError("");
        const p = parseLearningPage(list);
        setRows((previous) =>
          before ? [...previous, ...p.rows.slice(0, 50)] : p.rows.slice(0, 50),
        );
        setHasMore(p.rows.length > 50);
        setCoverage(p.coverage);
        setRuns(parseLearningRuns(runData));
      })
      .catch((e) => {
        if (active) setError(learningError(e));
      })
      .finally(() => {
        if (active) setLoadedRequest(requestKey);
      });
    return () => {
      active = false;
    };
  }, [refresh, search, state, topic, split, tab, before, requestKey]);
  function newCase(parentRow?: LearningCase) {
    detailGeneration.current++;
    setSelected(null);
    setHistory([]);
    setCreating(true);
    setEditing(true);
    setDoc(
      parentRow
        ? { ...parentRow.document, query: "", source: "authored" }
        : emptyDocument(),
    );
    setParent(parentRow?.id ?? null);
    setFamilyTitle(parentRow?.family_title ?? "");
    setNewTopic(parentRow?.topic ?? "everyday");
    setNewSplit(parentRow?.split ?? "TRAIN");
    setPrivacy(false);
    setFeedback(null);
    setNotice("");
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await task(async () => {
      if (!privacy) throw Error("privacy_confirmation_required");
      const document = parseLearningDocument({
        ...doc,
        obligations: doc.obligations.map((s) => s.trim()).filter(Boolean),
        forbidden: doc.forbidden.map((s) => s.trim()).filter(Boolean),
      });
      const result = await rpc(
        creating ? "create" : "save",
        creating ? crypto.randomUUID() : (selected?.id ?? null),
        selected?.revision ?? null,
        creating
          ? {
              document,
              familyTitle,
              topic: newTopic,
              split: newSplit,
              parentId: parent,
              feedbackId: feedback,
            }
          : { document, note: "Im Admin überarbeitet." },
      );
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        typeof result.id !== "string"
      )
        throw Error("learning_receipt_missing");
      await open(result.id);
      reload();
      setNotice(
        "Gespeichert. Als Nächstes die erwartete Bedeutung vorbereiten und prüfen.",
      );
    });
  }
  async function propose(action: "translate" | "variants") {
    if (!selected) return;
    await task(async () => {
      const { data, error: failure } = await supabase.functions.invoke(
        "nuknuk-learning",
        { body: { action, id: selected.id, revision: selected.revision } },
      );
      if (failure || !data?.result) {
        let code = "";
        try {
          const context =
            failure && "context" in failure ? failure.context : null;
          if (context instanceof Response)
            code = (await context.json()).error ?? "";
        } catch {
          /* Keep error honest. */
        }
        setError(
          code === "revision_conflict"
            ? "Zwischenzeitlich geändert. Lade die aktuelle Situation."
            : code === "quota_exhausted"
              ? "Das KI-Limit ist erreicht. Bitte später erneut versuchen."
              : code === "proposal_timeout"
                ? "Die Übersetzung hat zu lange gedauert. Es wurde keine Freigabe erteilt."
                : "Die KI-Vorbereitung ist nicht verfügbar oder die Übersetzung hat die technische Prüfung nicht bestanden. Deine Situation bleibt gespeichert.",
        );
        return;
      }
      const id = selected.id;
      await open(id);
      reload();
      setNotice(
        action === "translate"
          ? "Vorschlag gespeichert. Prüfe die tatsächliche Bedeutung unten – technisch gültig bedeutet noch nicht fachlich richtig."
          : `${Number(data.result.variantsCreated) || 0} neue, ungeprüfte Varianten angelegt. Sie bleiben in derselben Familie.`,
      );
    });
  }
  async function prepareReviewBatch() {
    await task(async () => {
      const controller = new AbortController();
      batchAbort.current = controller;
      setBatchActive(true);
      try {
        const page = parseLearningPage(
          await rpc("list", null, null, {
            state: "draft",
            topic,
            split,
            search,
          }),
        );
        const candidates = page.rows.slice(0, 10),
          ready: string[] = [];
        let failed = 0;
        if (!candidates.length) {
          setNotice(
            "Keine weiteren Entwürfe in dieser Auswahl. Bereits vorbereitete Karten findest du unten.",
          );
          return;
        }
        for (const row of candidates) {
          if (controller.signal.aborted) break;
          setNotice(
            `KI-Vorbereitung ${ready.length + 1} von ${candidates.length} … Noch keine menschlichen Freigaben.`,
          );
          const result = await supabase.functions.invoke("nuknuk-learning", {
            body: { action: "translate", id: row.id, revision: row.revision },
            signal: controller.signal,
          });
          if (result.error || !result.data?.result) {
            failed++;
            break;
          } else ready.push(row.id);
        }
        reload();
        setQueue(ready);
        if (ready[0]) await open(ready[0]);
        setNotice(
          `${ready.length} Karten vorbereitet; ${failed} ohne bestätigten Vorschlag. ${controller.signal.aborted ? "Vorbereitung angehalten. " : ""}Nicht bestätigte Fälle werden beim nächsten Laden anhand des gespeicherten Stands angezeigt.`,
        );
      } finally {
        batchAbort.current = null;
        setBatchActive(false);
      }
    });
  }
  async function suggestSituations() {
    await task(async () => {
      const result = await supabase.functions.invoke("nuknuk-learning", {
        body: { action: "situations", topic: newTopic, split: newSplit },
      });
      if (result.error || !result.data?.result) {
        setError(
          "Die Situationsvorschläge konnten nicht bestätigt werden. Es wurde nichts freigegeben. Prüfe bei einem Verbindungsabbruch zuerst den aktuellen Bestand.",
        );
        return;
      }
      reload();
      setNotice(
        `${Number(result.data.result.situationsCreated) || 0} neue synthetische Situationen als Entwürfe angelegt. Bitte auch ihre Verschiedenheit zu bestehenden Familien prüfen.`,
      );
    });
  }
  async function review(next: LearningState) {
    if (!selected) return;
    await task(async () => {
      await rpc("review", selected.id, selected.revision, {
        state: next,
        note:
          note.trim() ||
          (next === "approved"
            ? "Bedeutung, Personenbezüge und Datenverwendung geprüft."
            : ""),
        checks,
      });
      const id = selected.id;
      await open(id);
      reload();
      setNotice(
        next === "approved"
          ? "Diese Version ist freigegeben. Es wurde kein Training gestartet."
          : next === "blocked"
            ? "Als unklar markiert. Dieser Fall kann nicht ins Training."
            : "Prüfentscheidung gespeichert.",
      );
      if (queue[0] === id) {
        const remaining = queue.slice(1);
        setQueue(remaining);
        if (remaining[0]) await open(remaining[0]);
      }
    });
  }
  async function starters() {
    await task(async () => {
      let created = 0,
        existing = 0;
      for (const seed of learningStarters) {
        try {
          await rpc("create", seed.id, null, { ...seed, feedbackId: null });
          created++;
        } catch (e) {
          if (e && typeof e === "object" && "code" in e && e.code === "23505") {
            existing++;
            continue;
          }
          setNotice(
            `${created} Entwürfe angelegt; ${existing} bereits vorhanden. Der Import kann ohne doppelte Situationen wiederholt werden.`,
          );
          throw e;
        }
      }
      reload();
      setNotice(
        `${created} Entwürfe angelegt; ${existing} bereits vorhanden. Alle sind synthetische Ausgangspunkte und benötigen Prüfung.`,
      );
    });
  }
  async function prepare(kind: "TRAIN_DEV" | "TEST") {
    await task(async () => {
      if (!runTitle.trim()) throw Error("title_required");
      await rpc("prepare", null, null, {
        title: runTitle.trim(),
        kind,
        ...(kind === "TEST" ? { adapterHash } : {}),
      });
      reload();
      setNotice(
        "Unveränderliches Paket vorbereitet. Es wurden keine Rechner oder Pods gestartet.",
      );
    });
  }
  async function exportRun(run: LearningRun) {
    await task(async () => {
      const value = await verifyLearningExport(await rpc("export", run.id));
      download(`nuknuk-${run.id}.json`, value);
      reload();
      setNotice(
        "Paket mit geprüfter Prüfsumme heruntergeladen. Der Export startet kein Training.",
      );
    });
  }
  async function importReport(run: LearningRun, file: File) {
    await task(async () => {
      if (file.size > 900000) throw Error("report_too_large");
      const report = parseLearningReport(
        JSON.parse(await file.text()),
        run.manifest_hash,
      );
      await rpc("report", run.id, null, {
        manifestHash: run.manifest_hash,
        report,
      });
      reload();
      setNotice(
        "Bericht gespeichert. Er ist als eingereichter Nachweis gekennzeichnet und aktiviert kein Modell.",
      );
    });
  }
  const approved = coverage.reduce((n, c) => n + c.approved, 0),
    total = coverage.reduce((n, c) => n + c.situations, 0);
  const generator = (
    <section className="bi-card">
      <h2>Neue Alltagssituationen vorschlagen lassen</h2>
      <p className={styles.help}>
        Wähle einen Bereich, in dem uns Fälle fehlen. Die KI entwirft fünf
        unterschiedliche Ausgangssituationen. Du prüfst sie anschliessend in
        kleinen Paketen – einschliesslich der Frage, ob sie wirklich neue
        Situationen sind.
      </p>
      <div className={styles.toolbar}>
        <label>
          Bereich für neue Vorschläge
          <select
            className="bi-select"
            disabled={busy || editing}
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value as LearningTopic)}
          >
            {Object.entries(learningTopics).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Verwendung der neuen Familien
          <select
            className="bi-select"
            disabled={busy || editing}
            value={newSplit}
            onChange={(e) => setNewSplit(e.target.value as LearningSplit)}
          >
            {Object.entries(learningSplits).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          className="bi-button"
          disabled={busy || editing}
          onClick={() => void suggestSituations()}
        >
          5 neue Situationen entwerfen
        </button>
      </div>
      <p className={styles.meta}>
        Synthetische Vorschläge, keine Freigaben oder bewiesene Unabhängigkeit.
        Verwendet den bestehenden Modellzugang und dieselben Anfragelimits.
      </p>
    </section>
  );
  const form = (
    <form className={styles.form} onSubmit={save}>
      <fieldset disabled={busy} className={styles.fields}>
        {creating && !parent && (
          <>
            <label>
              Worum geht es in dieser Situation?
              <input
                className="bi-input"
                value={familyTitle}
                maxLength={160}
                required
                onChange={(e) => setFamilyTitle(e.target.value)}
                placeholder="Zum Beispiel: Ausflug mit kleinem Kind"
              />
            </label>
            <div className="bi-grid2">
              <label>
                Bereich
                <select
                  className="bi-select"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value as LearningTopic)}
                >
                  {Object.entries(learningTopics).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Verwendung
                <select
                  className="bi-select"
                  value={newSplit}
                  onChange={(e) => setNewSplit(e.target.value as LearningSplit)}
                >
                  {Object.entries(learningSplits).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.split}>
              Die Verwendung gilt für die gesamte Familie samt Varianten und
              wird nach dem Anlegen nicht verschoben. Abschlussprüfungen werden
              nie in Trainingspakete aufgenommen.
            </p>
          </>
        )}
        {parent && (
          <p className={styles.split}>
            Neue Variante von „{familyTitle}“. Familie und Verwendung bleiben
            erhalten; die Variante braucht eine eigene Prüfung.
          </p>
        )}
        {feedback && (
          <p className={styles.split}>
            Aus Rückmeldung vorbereitet. Es wurde kein Originaltext übernommen.
            Formuliere unten eine anonymisierte Alltagssituation ohne Namen,
            Kontaktdaten oder genaue Privatadressen.
          </p>
        )}
        <label>
          So würde ein Mensch fragen
          <textarea
            className="bi-textarea"
            value={doc.query}
            maxLength={2000}
            minLength={3}
            required
            onChange={(e) => setDoc({ ...doc, query: e.target.value })}
            placeholder="Morgen Abend mit meiner vierjährigen Tochter etwas drinnen machen …"
          />
        </label>
        <label>
          Das muss verstanden werden · eine Aussage pro Zeile
          <textarea
            className="bi-textarea"
            value={doc.obligations.join("\n")}
            onChange={(e) =>
              setDoc({ ...doc, obligations: e.target.value.split("\n") })
            }
            placeholder="Die Tochter ist vier Jahre alt.\nDrinnen ist Pflicht."
          />
        </label>
        <label>
          Das darf nicht hineininterpretiert werden · eine Aussage pro Zeile
          <textarea
            className="bi-textarea"
            value={doc.forbidden.join("\n")}
            onChange={(e) =>
              setDoc({ ...doc, forbidden: e.target.value.split("\n") })
            }
            placeholder="Keine gemeinsame Teilnahme bei einem Geschenk erfinden."
          />
        </label>
        <label>
          Hinweis oder Korrektur in deinen Worten
          <textarea
            className="bi-textarea"
            value={doc.notes}
            maxLength={2000}
            onChange={(e) => setDoc({ ...doc, notes: e.target.value })}
            placeholder="Zum Beispiel: Das Alter gehört zur Tochter, nicht zur anfragenden Person."
          />
        </label>
        <div className="bi-grid2">
          <label>
            Sprache
            <select
              className="bi-select"
              value={doc.locale}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  locale: e.target.value as LearningDocument["locale"],
                })
              }
            >
              <option value="de-CH">Deutsch (Schweiz)</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label>
            Bezugszeit für „heute“ / „morgen“
            <input
              className="bi-input"
              type="datetime-local"
              required
              value={learningLocalTime(doc.reference.now)}
              onChange={(e) => {
                if (e.target.value) {
                  try {
                    setDoc({
                      ...doc,
                      reference: {
                        ...doc.reference,
                        now: learningReferenceTime(e.target.value),
                      },
                    });
                  } catch {
                    setError(
                      "Diese Schweizer Uhrzeit ist nicht gültig. Bitte prüfe Datum und Zeitumstellung.",
                    );
                  }
                }
              }}
            />
            <small className={styles.meta}>
              Schweizer Zeit: {time(doc.reference.now)}.
            </small>
          </label>
        </div>
        <div className={styles.checks}>
          <label>
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              required
            />
            Die Situation ist erfunden oder ausreichend anonymisiert. Es dürfen
            keine privaten Nutzerdaten zum Modell oder ins Training gelangen.
          </label>
        </div>
        <div className={styles.actions}>
          <button className="bi-button" disabled={busy} type="submit">
            {busy ? "Wird gespeichert …" : "Entwurf speichern"}
          </button>
          <button
            className="bi-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setCreating(false);
              if (selected) setDoc(selected.document);
            }}
          >
            Bearbeitung abbrechen
          </button>
        </div>
      </fieldset>
    </form>
  );
  return (
    <div className="bi-page">
      <Link className="bi-back" href="/nuknuk">
        ← NukNuk-Betrieb
      </Link>
      <header className="bi-header">
        <div>
          <div className="bi-eyebrow">Verstehen lernen</div>
          <h1>NukNuk-Lernwerkstatt</h1>
          <p>
            Alltagssituationen prüfen. Bedeutung festhalten. Verbesserungen
            nachweisen.
          </p>
        </div>
        <button
          className="bi-button"
          disabled={busy || editing}
          onClick={() => newCase()}
        >
          Neue Situation
        </button>
      </header>
      <p className={styles.help}>
        Du brauchst keinen Code. Beschreibe den Wunsch und prüfe, was NukNuk
        daraus lernen soll. Freigaben gelten für eine konkrete Fassung; Training
        und Live-Aktivierung sind eigene Schritte.
      </p>
      <nav className={styles.tabs} role="tablist" aria-label="Lernwerkstatt">
        {(
          [
            ["situations", "Situationen"],
            ["review", "Prüfpakete"],
            ["coverage", "Abdeckung"],
            ["runs", "Trainingsläufe"],
          ] as [Tab, string][]
        ).map(([k, v]) => (
          <button
            type="button"
            className="bi-button"
            key={k}
            aria-selected={tab === k}
            role="tab"
            id={`learning-tab-${k}`}
            aria-controls="learning-panel"
            tabIndex={tab === k ? 0 : -1}
            onKeyDown={(event) => {
              const order: Tab[] = ["situations", "review", "coverage", "runs"];
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const index = order.indexOf(k),
                next =
                  event.key === "Home"
                    ? order[0]
                    : event.key === "End"
                      ? order[3]
                      : order[
                          (index + (event.key === "ArrowRight" ? 1 : 3)) % 4
                        ];
              setTab(next);
              setBefore(null);
              document.getElementById(`learning-tab-${next}`)?.focus();
            }}
            disabled={busy || editing}
            onClick={() => {
              setTab(k);
              setBefore(null);
            }}
          >
            {v}
          </button>
        ))}
      </nav>
      <div
        id="learning-panel"
        role="tabpanel"
        aria-labelledby={`learning-tab-${tab}`}
      >
        {error && (
          <div className="bi-error" role="alert">
            {error}
            <div className={styles.actions}>
              <button className="bi-button" disabled={busy} onClick={reload}>
                Übersicht erneut laden
              </button>
              {selected && (
                <button
                  className="bi-button"
                  disabled={busy}
                  onClick={() => void open(selected.id)}
                >
                  Aktuelle Situation laden · Eingaben verwerfen
                </button>
              )}
            </div>
          </div>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {loading && <p role="status">Lernwerkstatt wird geladen …</p>}
        {tab === "situations" && !editing && (
          <details className={styles.advanced}>
            <summary>
              Ohne selbst zu schreiben: neue Situationen entwerfen
            </summary>
            {generator}
          </details>
        )}
        {(tab === "situations" || tab === "review") && (
          <>
            {!loading && total === 0 && !error && (
              <section className="bi-card">
                <h2>Mit echten Alltagssituationen beginnen</h2>
                <p>
                  30 synthetische Ausgangspunkte zu Personen, Budget, Zeit,
                  Ernährung und offenen Wünschen. Noch keine Freigaben und keine
                  behauptete Modellqualität.
                </p>
                <button
                  className="bi-button"
                  disabled={busy}
                  onClick={() => void starters()}
                >
                  30 Startentwürfe anlegen
                </button>
              </section>
            )}
            {total > 0 && tab === "situations" && (
              <details>
                <summary>
                  Startpaket ergänzen oder unterbrochenen Import fortsetzen
                </summary>
                <p>
                  Die 30 Ausgangspunkte bleiben ungeprüfte Entwürfe; bereits
                  vorhandene werden übersprungen.
                </p>
                <button
                  className="bi-button"
                  disabled={busy || editing}
                  onClick={() => void starters()}
                >
                  Startpaket ergänzen
                </button>
              </details>
            )}
            {tab === "review" && (
              <section className={styles.queue}>
                <h2>Zehn Karten statt tausend Zeilen</h2>
                <p>
                  Prüfe ein kleines Paket aus der aktuellen Auswahl. Unklare
                  Fälle bleiben ausserhalb des Trainings.
                </p>
                <div className={styles.actions}>
                  <button
                    className="bi-button"
                    disabled={busy || editing}
                    onClick={() => void prepareReviewBatch()}
                  >
                    Bis zu 10 Entwürfe mit KI vorbereiten
                  </button>
                  {batchActive && (
                    <button
                      className="bi-button"
                      onClick={() => batchAbort.current?.abort()}
                    >
                      Vorbereitung anhalten
                    </button>
                  )}
                  <button
                    className="bi-button"
                    disabled={busy || editing || !rows.length}
                    onClick={() => {
                      const ids = rows.slice(0, 10).map((r) => r.id);
                      setQueue(ids);
                      if (ids[0]) void open(ids[0]);
                    }}
                  >
                    Prüfpaket mit bis zu 10 Karten beginnen
                  </button>
                </div>
                <p className={styles.meta}>
                  KI-Vorbereitung nutzt den bestehenden Modellzugang, bis zu 30
                  Vorgänge pro Admin und Stunde. Die anschliessende Prüfung und
                  Freigabe bleibt bei dir.
                </p>
                {queue.length > 0 && (
                  <p>
                    Noch {queue.length} Karten in diesem Paket. Freigeben,
                    Unklar oder Verwerfen führt zur nächsten Karte.
                  </p>
                )}
              </section>
            )}
            <form
              className={styles.toolbar}
              onSubmit={(e) => {
                e.preventDefault();
                setBefore(null);
                setSearch(query.trim());
              }}
            >
              <label>
                Situationen suchen
                <input
                  className="bi-input"
                  value={query}
                  maxLength={120}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                className="bi-button"
                type="submit"
                disabled={busy || editing}
              >
                Suchen
              </button>
              <label>
                Bereich
                <select
                  className="bi-select"
                  disabled={editing}
                  value={topic}
                  onChange={(e) => {
                    setBefore(null);
                    setTopic(e.target.value);
                  }}
                >
                  <option value="">Alle</option>
                  {Object.entries(learningTopics).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Verwendung
                <select
                  className="bi-select"
                  disabled={editing}
                  value={split}
                  onChange={(e) => {
                    setBefore(null);
                    setSplit(e.target.value);
                  }}
                >
                  <option value="">Alle</option>
                  {Object.entries(learningSplits).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {tab === "situations" && (
                <label>
                  Bearbeitung
                  <select
                    className="bi-select"
                    disabled={editing}
                    value={state}
                    onChange={(e) => {
                      setBefore(null);
                      setState(e.target.value);
                    }}
                  >
                    <option value="">Alle</option>
                    {Object.entries(learningStates).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </form>
            <div className={styles.layout}>
              <section className={styles.list} aria-label="Situationsliste">
                {rows.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className={styles.item}
                    disabled={busy || editing}
                    aria-current={selected?.id === row.id}
                    onClick={() => void open(row.id)}
                  >
                    <span className={styles.badge} data-state={row.state}>
                      {learningStates[row.state]}
                    </span>
                    <strong>{row.document.query}</strong>
                    <span className={styles.meta}>
                      {learningTopics[row.topic]} · {learningSplits[row.split]}
                      <br />
                      {row.document.source === "synthetic"
                        ? "Synthetischer Entwurf"
                        : row.document.source === "feedback_redacted"
                          ? "Anonymisierter Feedback-Fall"
                          : "Redaktionell angelegt"}{" "}
                      · Fassung {row.revision}
                    </span>
                  </button>
                ))}
                {!rows.length && !loading && (
                  <p className={styles.empty}>
                    Keine Situationen in dieser Auswahl.
                  </p>
                )}
                {hasMore && (
                  <button
                    className="bi-button"
                    disabled={loading || busy || editing}
                    onClick={() => {
                      const r = rows.at(-1);
                      if (r)
                        setBefore({ before: r.updated_at, beforeId: r.id });
                    }}
                  >
                    Weitere laden
                  </button>
                )}
              </section>
              <section className="bi-card" aria-label="Situation prüfen">
                {editing ? (
                  form
                ) : selected ? (
                  <>
                    <div className={styles.topline}>
                      <span
                        className={styles.badge}
                        data-state={selected.state}
                      >
                        {learningStates[selected.state]}
                      </span>
                      <small className={styles.meta}>
                        Fassung {selected.revision} ·{" "}
                        {time(selected.updated_at)}
                      </small>
                    </div>
                    <h2>{selected.family_title}</h2>
                    <p className={styles.comment}>{selected.document.query}</p>
                    <p className={styles.meta}>
                      {learningSplits[selected.split]} · Bezugszeit{" "}
                      {time(selected.document.reference.now)} · Europe/Zurich
                    </p>
                    <h3>Das muss verstanden werden</h3>
                    {selected.document.obligations.length ? (
                      <ul>
                        {selected.document.obligations.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        Noch keine Erwartungen festgehalten. Vor einer Freigabe
                        ergänzen.
                      </p>
                    )}
                    {selected.document.forbidden.length > 0 && (
                      <>
                        <h3>Das darf nicht hineininterpretiert werden</h3>
                        <ul>
                          {selected.document.forbidden.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {selected.document.notes && (
                      <p className={styles.split}>{selected.document.notes}</p>
                    )}
                    <div className={styles.actions}>
                      <button
                        className={`bi-button ${styles.secondary}`}
                        disabled={busy}
                        onClick={() => {
                          setDoc(selected.document);
                          setPrivacy(false);
                          setEditing(true);
                        }}
                      >
                        In eigenen Worten ändern
                      </button>
                      <button
                        className={`bi-button ${styles.secondary}`}
                        disabled={busy}
                        onClick={() => newCase(selected)}
                      >
                        Eigene Variante
                      </button>
                      <button
                        className={`bi-button ${styles.secondary}`}
                        disabled={busy}
                        onClick={() => void propose("variants")}
                      >
                        5 Formulierungen vorschlagen
                      </button>
                    </div>
                    <h3>So wird es tatsächlich übersetzt</h3>
                    <p className={styles.meta}>
                      Diese Karten werden direkt aus dem technischen Lernziel
                      erzeugt. Prüfe Werte, Personenbezüge, Pflicht und Wunsch.
                      Eine gültige Struktur allein ist keine fachliche Freigabe.
                    </p>
                    {selected.target ? (
                      <div className={styles.cards}>
                        {targetCards(selected.target).map((card, i) => (
                          <article className={styles.meaning} key={i}>
                            <strong>{card.title}</strong>
                            {card.facts.map((f, j) => (
                              <p key={j}>{f}</p>
                            ))}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.split}>
                        Noch keine technisch geprüfte Übersetzung. Dein Entwurf
                        ist gespeichert und wird noch nicht fürs Training
                        verwendet.
                      </p>
                    )}
                    <button
                      className="bi-button"
                      disabled={busy || selected.state === "approved"}
                      onClick={() => void propose("translate")}
                    >
                      {busy
                        ? "Vorbereitung läuft …"
                        : selected.target
                          ? "Übersetzung neu vorbereiten"
                          : "Erwartete Bedeutung vorbereiten"}
                    </button>
                    <h3>Deine Prüfung</h3>
                    <div className={styles.checks}>
                      {(
                        [
                          [
                            "meaning",
                            "Alle genannten Wünsche und Einschränkungen sind enthalten.",
                          ],
                          [
                            "roles",
                            "Personen, Alter, Gruppen und Bezüge stimmen.",
                          ],
                          [
                            "nothingInvented",
                            "Es wurde nichts hinzugefügt oder aus einem Wunsch eine Pflicht gemacht.",
                          ],
                          [
                            "privacy",
                            "Die Fassung ist datenschutzgerecht und darf als Lern- oder Prüffall verwendet werden.",
                          ],
                        ] as [keyof typeof checks, string][]
                      ).map(([k, v]) => (
                        <label key={k}>
                          <input
                            type="checkbox"
                            disabled={busy || !selected.target}
                            checked={checks[k]}
                            onChange={(e) =>
                              setChecks({ ...checks, [k]: e.target.checked })
                            }
                          />
                          {v}
                        </label>
                      ))}
                    </div>
                    <label className={styles.form}>
                      Kommentar oder Begründung
                      <textarea
                        className="bi-textarea"
                        value={note}
                        disabled={busy}
                        maxLength={2000}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Was stimmt? Was müssen wir noch klären?"
                      />
                    </label>
                    <div className={styles.actions}>
                      <button
                        className="bi-button"
                        disabled={
                          busy ||
                          !selected.target ||
                          !selected.document.obligations.length ||
                          !Object.values(checks).every(Boolean)
                        }
                        onClick={() => void review("approved")}
                      >
                        Passt · diese Fassung freigeben
                      </button>
                      <button
                        className="bi-button"
                        disabled={busy || note.trim().length < 3}
                        onClick={() => void review("blocked")}
                      >
                        Unklar
                      </button>
                      <button
                        className="bi-button"
                        disabled={busy || note.trim().length < 3}
                        onClick={() => void review("rejected")}
                      >
                        Verwerfen
                      </button>
                    </div>
                    <button
                      className="bi-button"
                      disabled={busy || !note.trim()}
                      onClick={() =>
                        void task(async () => {
                          await rpc("comment", selected.id, selected.revision, {
                            note,
                          });
                          await open(selected.id);
                          setNotice("Kommentar gespeichert.");
                        })
                      }
                    >
                      Nur Kommentar speichern
                    </button>
                    <details className={styles.advanced}>
                      <summary>Technischer Nachweis</summary>
                      <p className={styles.meta}>
                        Freigabe: {selected.approval_hash ?? "keine"}
                        <br />
                        Übersetzung: {selected.target_policy ?? "noch keine"}
                      </p>
                      <pre>{JSON.stringify(selected.target, null, 2)}</pre>
                    </details>
                    <h3>Austausch & Verlauf</h3>
                    {history.map((event) => (
                      <article className={styles.history} key={event.id}>
                        <strong>
                          {eventLabel[event.event] ?? event.event}
                        </strong>
                        <p className={styles.comment}>{event.note}</p>
                        <small className={styles.meta}>
                          {time(event.created_at)} · Fassung {event.revision} ·{" "}
                          {event.actor_id ? "Admin" : "System"}
                        </small>
                      </article>
                    ))}
                  </>
                ) : (
                  <div className={styles.empty}>
                    <h2>Eine Situation auswählen</h2>
                    <p>
                      Hier prüfst du Bedeutung und Freigabe oder legst eine neue
                      Situation an.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
        {tab === "coverage" && (
          <>
            <section className="bi-kpiGrid">
              {[
                ["Situationen", total],
                ["Freigegebene Fassungen", approved],
                ["Familien", coverage.reduce((n, c) => n + c.families, 0)],
                ["Bitte prüfen", coverage.reduce((n, c) => n + c.review, 0)],
              ].map(([label, value]) => (
                <div className="bi-kpi" key={String(label)}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <p className={styles.help}>
              Eine Familie zählt als eine Basissituation, auch mit mehreren
              Formulierungen. Diese Zahlen messen den Bestand, keine
              Verständnisquote. „Synthetisch“ beschreibt die Herkunft; eine
              spätere menschliche Freigabe bleibt zusätzlich sichtbar.
            </p>
            <div
              className="bi-card bi-tableWrap"
              tabIndex={0}
              role="region"
              aria-label="Abdeckungstabelle"
            >
              <table className="bi-table">
                <caption>Abdeckung nach Bereich und Verwendung</caption>
                <thead>
                  <tr>
                    {[
                      "Bereich",
                      "Verwendung",
                      "Familien",
                      "Situationen",
                      "Freigegeben",
                      "Prüfen",
                      "Unklar",
                      "Synthetisch",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(learningTopics).flatMap(
                    ([topicKey, label]) => {
                      const found = coverage.filter(
                        (c) => c.topic === topicKey,
                      );
                      return (
                        found.length
                          ? found
                          : [
                              {
                                topic: topicKey,
                                split: "TRAIN",
                                families: 0,
                                situations: 0,
                                approved: 0,
                                review: 0,
                                blocked: 0,
                                synthetic: 0,
                              } as CoverageRow,
                            ]
                      ).map((c) => (
                        <tr key={c.topic + c.split}>
                          <td>{label}</td>
                          <td>{learningSplits[c.split]}</td>
                          <td>{c.families}</td>
                          <td>{c.situations}</td>
                          <td>{c.approved}</td>
                          <td>{c.review}</td>
                          <td>{c.blocked}</td>
                          <td>{c.synthetic}</td>
                        </tr>
                      ));
                    },
                  )}
                </tbody>
              </table>
            </div>
            <p className={styles.meta}>
              Fehlende Bereiche werden mit null gezeigt. Die Modellqualität wird
              erst durch echte, getrennte Modelltests nachgewiesen.
            </p>
            {generator}
          </>
        )}
        {tab === "runs" && (
          <>
            <section className="bi-card">
              <h2>Ein geprüftes Paket vorbereiten</h2>
              <p className={styles.help}>
                Nur aktuell freigegebene Fassungen werden unveränderlich
                gesichert. Das Lernpaket enthält Lern- und Entwicklungsbestand,
                niemals Abschlussprüfungen. Vor dem Training prüft der Mac
                dieselben Ziele nochmals gegen den aktuellen NukNuk-Vertrag.
              </p>
              <label className={styles.form}>
                Name des Pakets
                <input
                  className="bi-input"
                  value={runTitle}
                  maxLength={160}
                  onChange={(e) => setRunTitle(e.target.value)}
                  placeholder="Zum Beispiel: Personen und Gruppen · Runde 1"
                />
              </label>
              <div className={styles.actions}>
                <button
                  className="bi-button"
                  disabled={busy || !runTitle.trim()}
                  onClick={() => void prepare("TRAIN_DEV")}
                >
                  Freigegebenes Lernpaket einfrieren
                </button>
              </div>
              <p className={styles.meta}>
                Mindestens eine freigegebene Lern- und eine Entwicklungsfamilie
                sind erforderlich. Keine Cloud-Kosten, kein Training und keine
                Änderung an der Live-App durch diesen Schritt.
              </p>
              <details className={styles.advanced}>
                <summary>Unabhängige Abschlussprüfung vorbereiten</summary>
                <p>
                  Erst nach der Auswahl eines eingefrorenen Kandidaten öffnen.
                  Dieser Bestand darf nicht zur Optimierung oder
                  Kandidatenauswahl genutzt werden. Ein hier geöffneter Test
                  gilt danach nicht mehr als frisch.
                </p>
                <label className={styles.form}>
                  Identität des eingefrorenen Modellkandidaten
                  <input
                    className="bi-input"
                    value={adapterHash}
                    maxLength={64}
                    onChange={(e) => setAdapterHash(e.target.value)}
                    placeholder="SHA-256 aus dem gesicherten Modellnachweis"
                  />
                </label>
                <button
                  className="bi-button"
                  disabled={
                    busy ||
                    !runTitle.trim() ||
                    !/^[a-f0-9]{64}$/.test(adapterHash)
                  }
                  onClick={() => void prepare("TEST")}
                >
                  Abschlussprüfung an diesen Kandidaten binden
                </button>
              </details>
            </section>
            <h2>Pakete & eingereichte Ergebnisse</h2>
            {runs.length === 0 && !loading && (
              <p className={styles.empty}>
                Noch keine Trainingspakete. Beginne mit Situationen und ihren
                Freigaben.
              </p>
            )}
            {runs.map((run) => (
              <article className={styles.run} key={run.id}>
                <div className={styles.topline}>
                  <h3>{run.title}</h3>
                  <span className={styles.badge}>
                    {run.state === "prepared"
                      ? "Vorbereitet"
                      : run.state === "exported"
                        ? "Exportiert · Ausführung nicht bestätigt"
                        : "Bericht eingereicht"}
                  </span>
                </div>
                <p>
                  {run.case_count} Fassungen ·{" "}
                  {run.kind === "TEST"
                    ? "Gebundene Abschlussprüfung"
                    : "Lernen + Entwicklungsprüfung"}{" "}
                  · {time(run.created_at)}
                </p>
                <div className={styles.actions}>
                  <button
                    className="bi-button"
                    disabled={busy}
                    onClick={() => void exportRun(run)}
                  >
                    Paket für den Mac herunterladen
                  </button>
                  {!run.report && (
                    <label className={styles.file}>
                      Ergebnisbericht vom Mac
                      <input
                        type="file"
                        accept="application/json,.json"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void importReport(run, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {run.report && (
                  <>
                    <p className={styles.split}>
                      Eingereichter Nachweis – keine automatische
                      Qualitätsfreigabe oder Live-Aktivierung.
                    </p>
                    <RunReport
                      report={run.report}
                      onSelect={(id) => {
                        setTab("situations");
                        void open(id);
                      }}
                    />
                  </>
                )}
                <details className={styles.advanced}>
                  <summary>Nachweis & Ausführung</summary>
                  <p className={styles.meta}>
                    Paket-Prüfsumme: {run.manifest_hash}
                  </p>
                  <p>
                    Der versionierte Mac-Runner prüft den Export, erzeugt die
                    Trainingsdateien und führt echte Modellvergleiche durch.
                    GPU-Läufe bleiben dem begrenzten, separat autorisierten
                    Trainingsprozess vorbehalten.
                  </p>
                  <pre>
                    node
                    scripts/decision-diagnostics/nuknuk-learning-workshop.mjs
                    prepare EXPORT.json AUSGABEORDNER {run.manifest_hash}
                  </pre>
                </details>
              </article>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
function RunReport({
  report,
  onSelect,
}: {
  report: Record<string, unknown>;
  onSelect: (id: string) => void;
}) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const labels: Record<string, string> = {
    EXPECTED_GRAPH_MATCH_NOT_HUMAN_ACCEPTANCE:
      "Lernziel strukturell getroffen · fachliche Prüfung offen",
    SEMANTIC_REVIEW_REQUIRED: "Bedeutung prüfen",
    HANDOFF_REJECTED: "Übergabe zurückgewiesen",
    INFERENCE_FAILED: "Keine vollständige Antwort",
  };
  const cards = (value: unknown) =>
    Array.isArray(value)
      ? value.map((c, i) => {
          if (!c || typeof c !== "object") return null;
          const card = c as Record<string, unknown>;
          return (
            <article className={styles.meaning} key={i}>
              <strong>{String(card.title ?? "Angabe")}</strong>
              {Array.isArray(card.facts) &&
                card.facts.map((f, j) => <p key={j}>{String(f)}</p>)}
            </article>
          );
        })
      : null;
  return (
    <>
      <p>
        {report.kind === "TRAINING_RECEIPT"
          ? report.trainingStatus === "FAILED"
            ? "Trainingslauf fehlgeschlagen."
            : report.trainingStatus === "TIMED_OUT"
              ? "Trainingslauf am Zeitlimit beendet."
              : "Trainingsnachweis · Modell muss noch auf neuen Anfragen geprüft werden."
          : `Lokaler Modellvergleich · ${rows.length} protokollierte Fälle`}
      </p>
      <p className={styles.meta}>
        Verständnisprüfung am eingefrorenen Paket. Keine Aussage über aktuelle
        Ortsdaten oder die gesamte Live-Suche.
      </p>
      {rows.length > 0 && (
        <details>
          <summary>Wünsche und Ergebnisse vergleichen</summary>
          {rows.map((r, i) => {
            if (!r || typeof r !== "object") return null;
            const x = r as Record<string, unknown>;
            return (
              <div className={styles.history} key={i}>
                <h3>{String(x.query ?? `Fall ${i + 1}`)}</h3>
                <p>
                  {labels[String(x.status)] ??
                    String(x.status ?? "Keine Bewertung")}{" "}
                  · {String(x.durationMs ?? "–")} ms
                </p>
                {Array.isArray(x.obligations) && (
                  <ul>
                    {x.obligations.map((o, j) => (
                      <li key={j}>{String(o)}</li>
                    ))}
                  </ul>
                )}
                <div className="bi-grid2">
                  <div>
                    <h4>Vorher</h4>
                    {cards(x.parentCards)}
                  </div>
                  <div>
                    <h4>Neuer Kandidat</h4>
                    {cards(x.candidateCards)}
                  </div>
                </div>
                {typeof x.error === "string" && <p>{x.error}</p>}
                {typeof x.id === "string" && /^[a-f0-9-]{36}$/.test(x.id) && (
                  <button
                    className="bi-button"
                    onClick={() => onSelect(x.id as string)}
                  >
                    Aktuelle Situation prüfen
                  </button>
                )}
              </div>
            );
          })}
        </details>
      )}
    </>
  );
}
