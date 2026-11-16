"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { NuknukActivityOverview, NuknukActivityRow } from "../../../packages/decision-vnext-core/src/admin-nuknuk-activity";
import styles from "./status.module.css";

const outcomes: Record<NuknukActivityRow["outcome"], string> = {
  MATCHES: "Vorschläge",
  PROVISIONAL: "Orte zum Abklären",
  EMPTY: "Keine Vorschläge",
  CLARIFICATION: "Rückfrage",
  NEW_PLAN: "Neuer Suchwunsch",
  OFF_TOPIC: "Ausserhalb der Ortssuche",
  UNRESOLVED: "Suchwunsch unklar",
  TIMEOUT: "Zeitlimit",
  ERROR: "Fehler",
};

const paths: Record<NuknukActivityRow["path"], string> = {
  SIMPLE: "Kurzverarbeitung",
  FULL: "Vollverarbeitung",
  SIMPLE_TO_FULL: "Kurz → Voll",
  DIALOGUE: "Folgeanfrage",
  NO_MODEL_CALL: "Ohne Modellaufruf",
};

const failureStages: Record<NonNullable<NuknukActivityRow["failure_stage"]>, string> = {
  INTERPRETATION: "NukNuk",
  EVALUATION: "Bibliothekar",
  RESPONSE_BUILD: "Antwortaufbau",
  IDEMPOTENCY: "Anfragesicherung",
  LEARNING: "Lernsignal",
  FINAL_OUTPUT: "Ausgabe",
};

const numbers = new Intl.NumberFormat("de-CH");
const seconds = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 });
const localTime = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "medium" });
const time = (ms: number | null) => ms === null ? "–" : ms < 1000 ? `${numbers.format(ms)} ms` : `${seconds.format(ms / 1000)} s`;

function RequestRow({ row }: { row: NuknukActivityRow }) {
  return <tr>
    <td><time dateTime={row.recorded_at}>{localTime.format(new Date(row.recorded_at))}</time></td>
    <td>
      <strong data-outcome={row.outcome}>{outcomes[row.outcome]}</strong>
      {row.clarification && row.outcome !== "CLARIFICATION" && <small>Mit Rückfrage</small>}
      {row.failure_stage && <small>Bei {failureStages[row.failure_stage]}</small>}
    </td>
    <td>{paths[row.path]}<small>{row.model_calls} {row.model_calls === 1 ? "Modellaufruf" : "Modellaufrufe"}</small></td>
    <td>{time(row.model_ms)}</td>
    <td>{time(row.librarian_ms)}</td>
    <td>{time(row.total_ms)}</td>
    <td>{row.candidate_count ?? "–"}</td>
  </tr>;
}

export default function Activity() {
  const [refresh, setRefresh] = useState(0);
  const [activity, setActivity] = useState<NuknukActivityOverview | null>(null);
  const [checkedRefresh, setCheckedRefresh] = useState(-1);
  const busy = refresh !== checkedRefresh;

  useEffect(() => {
    const controller = new AbortController();
    void supabase.functions.invoke<NuknukActivityOverview>("decision-admin-diagnostic", {
      body: { nuknukActivity: "recent" },
      headers: { "x-region": "eu-central-2" },
      signal: controller.signal,
    }).then(({ data, error }) => {
      if (!controller.signal.aborted) setActivity(!error && data?.totals && Array.isArray(data.recent) ? data : null);
    }).catch(() => {
      if (!controller.signal.aborted) setActivity(null);
    }).finally(() => {
      if (!controller.signal.aborted) setCheckedRefresh(refresh);
    });
    return () => controller.abort();
  }, [refresh]);

  const totals = activity?.totals;
  const metrics = totals ? [
    ["Anfragen", numbers.format(totals.requests)],
    ["Mit Vorschlägen", numbers.format(totals.matches)],
    ["Orte zum Abklären", numbers.format(totals.provisional)],
    ["Mit Rückfrage", numbers.format(totals.clarifications)],
    ["Fehler / Zeitlimit", numbers.format(totals.errors)],
    ["Median", time(totals.medianMs)],
    ["95 % innerhalb von", time(totals.p95Ms)],
  ] : [];

  return <section className={styles.activity} aria-labelledby="nuknuk-activity-title" aria-busy={busy}>
    <div className={styles.activityHeader}>
      <div>
        <h2 id="nuknuk-activity-title">Anfragen und Verarbeitung</h2>
        <p>Letzte 24 Stunden · Anfragen, die an NukNuk geroutet wurden</p>
      </div>
      <div className={styles.buttons}><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={busy}>Aktualisieren</button></div>
    </div>
    {busy && <p role="status">Anfragen werden geladen …</p>}
    {!busy && !activity && <div className="bi-card" role="status">Die Anfragen konnten nicht geladen werden. Versuche es erneut.</div>}
    {!busy && activity && <>
      <dl className={styles.metrics}>{metrics.map(([label, value]) => <div key={label} className="bi-card"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {activity.recent.length
        ? <div className={`bi-card ${styles.requestTable}`} role="region" tabIndex={0} aria-label="Letzte NukNuk-Anfragen">
          <table>
            <caption>Letzte {activity.recent.length} Anfragen</caption>
            <thead><tr>{["Schweizer Zeit", "Ergebnis", "Verarbeitung", "NukNuk", "Bibliothekar", "Gesamt", "Spots"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{activity.recent.map(row => <RequestRow key={row.id} row={row} />)}</tbody>
          </table>
        </div>
        : <div className="bi-card">In den letzten 24 Stunden wurden keine NukNuk-Anfragen erfasst.</div>}
      <p className={styles.activityNote}>Stand {localTime.format(new Date(activity.checkedAt))} Uhr. Die Zeiten werden im Backend gemessen.</p>
    </>}
  </section>;
}
