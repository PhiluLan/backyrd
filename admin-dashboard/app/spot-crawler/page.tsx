"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, SectionCard, StatusBadge } from "@/components/admin/AdminUi";
import { supabase } from "@/lib/supabaseClient";
import {
  spotCrawlerCategories, spotCrawlerDistricts, type CrawlerCandidate, type CrawlerOverview,
  type CrawlerSettings, type SavedCrawlerSettings,
} from "@/lib/spotCrawler";
import styles from "./page.module.css";

type CrawlerPageData = {
  settings: SavedCrawlerSettings;
  overview: CrawlerOverview;
  searchConfigured: boolean;
  scheduleConfigured: boolean;
};
type Category = { id: string; name: string };
const timestamp = new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });
const categoryKeys = Object.keys(spotCrawlerCategories) as CrawlerSettings["categories"];
const statusLabels = { FETCHING: "Läuft", COMPLETE: "Abgeschlossen", FAILED: "Fehlgeschlagen" };
const errors: Record<string, string> = {
  SETTINGS_CHANGED: "Die Einstellungen wurden inzwischen geändert. Lade sie neu.",
  INVALID_SETTINGS: "Wähle mindestens eine Kategorie und ein Suchgebiet. Prüfe auch das Suchbudget.",
  RUN_ACTIVE: "Es läuft bereits eine Suche.",
  BUDGET_REACHED: "Für diesen Lauf reicht das verbleibende monatliche Suchbudget nicht.",
  APPROVAL_CATEGORY_REQUIRED: "Wähle zuerst eine Backyrd-Kategorie für diesen Spot.",
  APPROVAL_CHANGED: "Der Fund hat sich geändert. Prüfe die aktualisierten Angaben.",
  APPROVAL_FAILED: "Die Freigabe konnte nicht bestätigt werden. Lade den aktuellen Stand und versuche es erneut.",
  SEARCH_NOT_CONFIGURED: "Der Suchdienst ist noch nicht eingerichtet.",
};

async function crawlerRequest<T>(url: string, input?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Bitte melde dich erneut an.");
  const response = await fetch(url, {
    method: input === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(errors[data.error] ?? "Der Crawler konnte die Aktion gerade nicht ausführen.");
  return data as T;
}

function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

export default function SpotCrawlerPage() {
  const [data, setData] = useState<CrawlerPageData | null>(null);
  const [draft, setDraft] = useState<SavedCrawlerSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState<Record<number, string>>({});
  const [cursor, setCursor] = useState(0);
  const [back, setBack] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (after: number, resetSettings = false) => {
    const result = await crawlerRequest<CrawlerPageData>(`/api/spot-crawler?after=${after}`);
    setData(result);
    setDraft(current => !current || resetSettings ? result.settings : current);
  }, []);

  useEffect(() => {
    let disposed = false;
    void crawlerRequest<CrawlerPageData>(`/api/spot-crawler?after=${cursor}`).then(result => {
      if (disposed) return;
      setData(result);
      setDraft(current => current ?? result.settings);
    }).catch((failure: Error) => {
      if (!disposed) setError(failure.message);
    });
    return () => { disposed = true; };
  }, [cursor]);

  useEffect(() => {
    void supabase.from("categories").select("id,name").order("name").then(result => {
      if (result.data) setCategories(result.data);
    });
  }, []);

  const run = data?.overview.runs[0];
  const isRunning = run?.status === "FETCHING";
  const researchRunning = data?.overview.rows.some(row => row.research_status === "QUEUED" || row.research_status === "RUNNING");
  useEffect(() => {
    if (!isRunning && !researchRunning) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(cursor).catch((failure: Error) => setError(failure.message));
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [cursor, isRunning, load, researchRunning]);

  async function act(operation: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await operation());
      await load(cursor);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Die Aktion ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function update(values: Partial<CrawlerSettings>) {
    setDraft(current => current && { ...current, ...values });
  }

  function reviewCandidate(row: CrawlerCandidate, action: "DISMISSED" | "REOPENED") {
    void act(async () => {
      const { error: failure } = await supabase.rpc("admin_basel_place_source_review_v1", {
        p_key: "BASEL_WEB", p_source_id: row.source_id,
        p_fingerprint: row.review_fingerprint, p_revision: row.review_revision, p_disposition: action,
      });
      if (failure?.code === "40001") {
        await load(cursor);
        throw new Error(errors.APPROVAL_CHANGED);
      }
      if (failure) throw new Error("Die Entscheidung konnte nicht gespeichert werden.");
      setConfirmed(current => ({ ...current, [row.source_id]: "" }));
      return action === "DISMISSED" ? `${row.facts.name} wurde abgelehnt.` : `${row.facts.name} ist wieder offen.`;
    });
  }

  function approveAndResearch(row: CrawlerCandidate) {
    void act(async () => {
      try {
        const { researchQueued } = await crawlerRequest<{ spotId: string; researchQueued: boolean }>("/api/spot-crawler/approval",
          row.imported_spot_id ? { action: "research", sourceId: row.source_id } : {
            action: "approve", sourceId: row.source_id, fingerprint: row.review_fingerprint, revision: row.review_revision,
            categoryId: row.category_id ?? choices[row.source_id] ?? null, confirmDistinct: confirmed[row.source_id] === row.review_fingerprint,
          });
        if (researchQueued) return `${row.facts.name} ist freigegeben. Die Recherche steht unter «Aufgaben & Recherche».`;
        return `${row.facts.name} ist freigegeben. Die Recherche konnte noch nicht gestartet werden.`;
      } finally {
        setConfirmed(current => ({ ...current, [row.source_id]: "" }));
      }
    });
  }

  const changed = JSON.stringify(data?.settings) !== JSON.stringify(draft);
  return (
    <div className={styles.page}>
      <AdminPageHeader title="Backyrd Crawler" description="Entdeckt neue Basler Orte im Web und sammelt belegte Funde für die Spotliste." />
      {error && <p role="alert" className={styles.notice}>{error}</p>}
      {message && <p role="status" className={styles.notice}>{message}</p>}
      <div className={styles.layout}>
        <SectionCard title="Suche einstellen">
          {!draft ? <p>Die Einstellungen werden geladen.</p> : (
            <form className={styles.form} onSubmit={event => {
              event.preventDefault();
              void act(async () => {
                const response = await crawlerRequest<{ settings: SavedCrawlerSettings }>("/api/spot-crawler",
                  { action: "save", settings: draft, revision: draft.revision });
                setDraft(response.settings);
                return "Einstellungen gespeichert.";
              });
            }}>
              <fieldset><legend>Kategorien</legend>
                <div className={styles.options}>{categoryKeys.map(key => (
                  <label key={key}><input type="checkbox" checked={draft.categories.includes(key)}
                    onChange={() => update({ categories: toggle(draft.categories, key) })} />{spotCrawlerCategories[key]}</label>
                ))}</div>
              </fieldset>
              <fieldset><legend>Suchgebiete</legend>
                <div className={styles.options}>{spotCrawlerDistricts.map(district => (
                  <label key={district}><input type="checkbox" checked={draft.districts.includes(district)}
                    onChange={() => update({ districts: toggle(draft.districts, district) })} />{district}</label>
                ))}</div>
                <small>Die Auswahl beeinflusst die Websuche. Alle Funde müssen eine Basler Adresse haben.</small>
              </fieldset>
              <div className={styles.controls}>
                <label>Maximal neue Funde
                  <select value={draft.limit} onChange={event => update({ limit: Number(event.target.value) })}>
                    {[10, 20, 30, 40, 50].map(amount => <option key={amount}>{amount}</option>)}
                  </select>
                </label>
                <label>Websuchen pro Lauf
                  <input type="number" min={2} max={24} value={draft.searches} required
                    onChange={event => update({ searches: Number(event.target.value) })} />
                </label>
                <label>Wiederholung
                  <select value={draft.schedule} onChange={event => update({ schedule: event.target.value as CrawlerSettings["schedule"] })}>
                    <option value="MANUAL">Manuell</option><option value="DAILY">Täglich</option><option value="WEEKLY">Montags</option>
                  </select>
                </label>
                {draft.schedule !== "MANUAL" && <label>Startzeit in der Schweiz
                  <input type="time" step={900} value={draft.time} required onChange={event => update({ time: event.target.value })} />
                </label>}
                <label>Monatliches Suchbudget in USD
                  <input type="number" min={0} max={100} step={0.01} value={draft.monthBudgetCents / 100} required
                    onChange={event => update({ monthBudgetCents: Math.round(Number(event.target.value) * 100) })} />
                </label>
              </div>
              {!data?.searchConfigured && <p className={styles.notice}>Der Suchdienst ist noch nicht eingerichtet.</p>}
              {!data?.scheduleConfigured && draft.schedule !== "MANUAL" && <p className={styles.notice}>Der Zeitplan wartet auf die Aktivierung des Server-Takts.</p>}
              <div className={styles.actions}>
                <button type="submit" className="bi-actionButton" disabled={busy || !changed}>Speichern</button>
                <button type="button" className="bi-primaryButton" disabled={busy || changed || isRunning || !data?.searchConfigured}
                  onClick={() => void act(async () => {
                    await crawlerRequest("/api/spot-crawler", { action: "start" });
                    return "Die Websuche wurde gestartet.";
                  })}>Suche starten</button>
              </div>
              {changed && <small>Speichere deine Einstellungen vor dem Start.</small>}
            </form>
          )}
        </SectionCard>
        <SectionCard title="Letzte Suchläufe">
          {run ? <ul className={styles.runs}>{data?.overview.runs.map(item => (
            <li key={item.id}><div><strong>{timestamp.format(new Date(item.started_at))}</strong>
              <span>{item.status === "COMPLETE" ? `${item.source_count ?? 0} neue Funde`
                : item.status === "FAILED" ? (["RUN_TIMEOUT", "RUN_TIME_LIMIT"].includes(item.outcome ?? "") ? "Zeitlimit erreicht" : "Die Quellen konnten nicht verarbeitet werden")
                  : "Websuche und Quellenprüfung"}</span></div>
              <StatusBadge tone={item.status === "FAILED" ? "danger" : item.status === "COMPLETE" ? "success" : "info"}>{statusLabels[item.status]}</StatusBadge></li>
          ))}</ul> : <p>Noch kein Suchlauf vorhanden.</p>}
          <button className="bi-actionButton" type="button" disabled={busy} onClick={() => void act(async () => {
            await load(cursor, true);
            return "Aktueller Stand geladen.";
          })}>Aktualisieren</button>
        </SectionCard>
      </div>
      <SectionCard title="Gefundene Orte">
        {data && !data.overview.rows.length && <p>{isRunning ? "Die Suche läuft. Neue Funde erscheinen hier nach dem Abgleich." : "Hier erscheinen neue Funde nach dem Abgleich mit der Spotliste."}</p>}
        <div className={styles.results}>{data?.overview.rows.map(row => {
          const { facts } = row;
          const awaitingDecision = ["OPEN", "REVIEWED", "EXISTING"].includes(row.review_state) && !row.imported_spot_id;
          const needsConfirmation = row.state === "REVIEW" && row.can_confirm_distinct === true;
          const canCreate = awaitingDecision && (row.state === "NEW" || needsConfirmation) && row.review_state !== "EXISTING";
          const status = row.imported_spot_id ? "Freigegeben"
            : row.review_state === "DISMISSED" ? "Abgelehnt"
              : row.review_state === "EXISTING" || row.state === "MATCHED" ? "Bereits im Katalog"
                : row.state === "NEW" ? "Neu" : "Ähnliche Orte gefunden";
          return <article className={styles.result} key={row.source_id}>
            <div className={styles.resultHeader}><div><h3>{facts.name}</h3><p>{spotCrawlerCategories[facts.category]} · {facts.address}</p></div>
              <StatusBadge>{status}</StatusBadge></div>
            {(facts.phone || facts.email) && <p>{[facts.phone, facts.email].filter(Boolean).join(" · ")}</p>}
            {facts.hours && <p>Öffnungszeiten laut Website · {facts.hours}</p>}
            {facts.price_hint && <p>Preisangabe laut Website · {facts.price_hint}</p>}
            {!row.imported_spot_id && row.spots.length > 0 && <p>Ähnliche oder nahe Spots · {row.spots.map(spot => spot.name).join(", ")}</p>}
            {canCreate && needsConfirmation && <label className={styles.confirm}>
              <input type="checkbox" checked={confirmed[row.source_id] === row.review_fingerprint} disabled={busy}
                onChange={event => setConfirmed(current => ({ ...current, [row.source_id]: event.target.checked ? row.review_fingerprint : "" }))} />
              Das ist ein eigenständiger Spot.
            </label>}
            {row.imported_spot_id && <p role="status">{row.research_status === "QUEUED" ? "Recherche eingereiht"
              : row.research_status === "RUNNING" ? "Recherche läuft"
                : row.research_status === "READY_FOR_REVIEW" ? "Rechercheergebnis verfügbar"
                  : row.research_status === "FAILED" ? "Recherche fehlgeschlagen" : "Recherche ausstehend"}</p>}
            <div className={styles.actions}>
              <a className="bi-actionButton" href={facts.source_url} rel="noreferrer" target="_blank">Quelle prüfen ↗</a>
              {row.imported_spot_id && <>
                <Link className="bi-actionButton" href={`/spots/${row.imported_spot_id}`}>Spot öffnen</Link>
                {row.research_status && row.research_status !== "FAILED" && <Link className="bi-actionButton" href="/world-knowledge">Aufgaben & Recherche</Link>}
                {(!row.research_status || row.research_status === "FAILED") && <button type="button" className="bi-actionButton"
                  disabled={busy} onClick={() => approveAndResearch(row)}>Recherche starten</button>}
              </>}
              {awaitingDecision && <button className="bi-actionButton" type="button"
                disabled={busy} onClick={() => reviewCandidate(row, "DISMISSED")}>Ablehnen</button>}
              {row.review_state === "DISMISSED" && <button className="bi-actionButton" type="button" disabled={busy}
                onClick={() => reviewCandidate(row, "REOPENED")}>Wieder öffnen</button>}
              {canCreate && !row.category_id && <select aria-label={`Kategorie für ${facts.name}`} value={choices[row.source_id] ?? ""}
                onChange={event => setChoices(current => ({ ...current, [row.source_id]: event.target.value }))}>
                <option value="">Backyrd-Kategorie wählen</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>}
              {canCreate && <button className="bi-primaryButton" type="button" disabled={busy || !(row.category_id ?? choices[row.source_id]) || (needsConfirmation && confirmed[row.source_id] !== row.review_fingerprint)}
                onClick={() => approveAndResearch(row)}>Freigeben und recherchieren</button>}
            </div>
          </article>;
        })}</div>
        <div className={styles.actions}>
          {!!back.length && <button className="bi-actionButton" type="button" disabled={busy} onClick={() => {
            setCursor(back.at(-1) ?? 0);
            setBack(previous => previous.slice(0, -1));
          }}>Zurück</button>}
          {typeof data?.overview.next_after === "number" && <button className="bi-actionButton" type="button" disabled={busy} onClick={() => {
            if (data.overview.next_after === null) return;
            setBack(previous => [...previous, cursor]);
            setCursor(data.overview.next_after);
          }}>Weitere Funde</button>}
        </div>
      </SectionCard>
    </div>
  );
}
