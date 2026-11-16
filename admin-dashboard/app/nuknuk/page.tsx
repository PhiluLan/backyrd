"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AdminNuknukStatus, NuknukCheck } from "../../../packages/decision-vnext-core/src/admin-nuknuk-status";
import Activity from "./Activity";
import styles from "./status.module.css";

const states: Record<AdminNuknukStatus["state"], { title: string; detail: string; tone: string }> = {
  disabled: { title: "Deaktiviert", detail: "Die produktive Konfiguration verwendet NukNuk derzeit nicht für Suchanfragen.", tone: "warning" },
  configuration: { title: "Konfiguration prüfen", detail: "Die produktive NukNuk-Konfiguration ist unvollständig oder ungültig.", tone: "critical" },
  connected: { title: "HTTPS-Verbindung erreichbar", detail: "Der Endpunkt antwortet. Ein Modelltest zeigt, ob NukNuk auch Antworten erzeugt.", tone: "warning" },
  unreachable: { title: "Verbindung fehlgeschlagen", detail: "Das Backend konnte den konfigurierten Endpunkt nicht erfolgreich erreichen.", tone: "critical" },
  timeout: { title: "Zeitlimit erreicht", detail: "Innerhalb der Prüffrist kam keine vollständige Antwort an.", tone: "critical" },
  rejected: { title: "Anfrage abgewiesen", detail: "Der Endpunkt hat die Testanfrage abgewiesen. Der HTTP-Status hilft bei der Eingrenzung.", tone: "critical" },
  upstream: { title: "Fehler beim Modelltest", detail: "Der Endpunkt meldet einen Serverfehler bei der Modellanfrage.", tone: "critical" },
  invalid_reply: { title: "Antwort unbrauchbar", detail: "Der Endpunkt hat keine gültige Antwort auf den Modelltest geliefert.", tone: "critical" },
  healthy: { title: "Modelltest bestanden", detail: "NukNuk hat über den produktiven Endpunkt die erwartete Testantwort geliefert.", tone: "good" },
};

const scopes: Record<AdminNuknukStatus["scope"], string> = {
  off: "Ausgeschaltet",
  personal: "Ein freigegebenes Konto",
  all: "Alle berechtigten Konten",
  invalid: "Unbekannt",
};

function swissTime(timestamp: string) {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "medium",
  }).format(new Date(timestamp));
}

const validStatus = (data: AdminNuknukStatus | null): data is AdminNuknukStatus =>
  !!data &&
  Object.hasOwn(states, data.state) &&
  Object.hasOwn(scopes, data.scope) &&
  typeof data.checkedAt === "string" &&
  Number.isFinite(Date.parse(data.checkedAt)) &&
  (data.model === null || typeof data.model === "string") &&
  (data.durationMs === null || Number.isFinite(data.durationMs)) &&
  (data.httpStatus === null || Number.isInteger(data.httpStatus));

export default function NuknukPage() {
  const [busy, setBusy] = useState<NuknukCheck | null>("connection");
  const [status, setStatus] = useState<AdminNuknukStatus | null>(null);
  const [error, setError] = useState(false);

  const check = useCallback((mode: NuknukCheck, signal?: AbortSignal) =>
    supabase.functions.invoke<AdminNuknukStatus>("decision-admin-diagnostic", {
      body: { nuknukStatus: mode },
      headers: { "x-region": "eu-central-2" },
      signal,
    }).then(result => {
      if (signal?.aborted) return;
      if (result.error || !validStatus(result.data)) throw new Error("status_unavailable");
      setStatus(result.data);
    }).catch(() => {
      if (signal?.aborted) return;
      setStatus(null);
      setError(true);
    }).finally(() => {
      if (!signal?.aborted) setBusy(null);
    }), []);

  useEffect(() => {
    const controller = new AbortController();
    void check("connection", controller.signal);
    return () => controller.abort();
  }, [check]);

  const requestCheck = (mode: NuknukCheck) => {
    setBusy(mode);
    setError(false);
    void check(mode);
  };

  const result = status ? states[status.state] : null;
  return <div className="bi-page">
    <header className="bi-header">
      <div>
        <h1>NukNuk</h1>
        <p>Verfügbarkeit und Modellzugang für «Wohin?»</p>
      </div>
    </header>

    <section className={`bi-card ${styles.summary}`} aria-label="Betriebsstatus" aria-busy={busy !== null} data-tone={!busy ? result?.tone : undefined}>
      <div className={styles.summaryBody} role="status">
        <h2>{busy ? busy === "model" ? "Modelltest läuft …" : "Verbindung wird geprüft …" : result?.title ?? "Status nicht verfügbar"}</h2>
        <p>{busy ? "Das Backend fragt den produktiven NukNuk-Endpunkt ab." : result?.detail ?? "Die Admin-Diagnose hat keine gültige Statusantwort geliefert."}</p>
        {!busy && status && <time dateTime={status.checkedAt}>Geprüft am {swissTime(status.checkedAt)} Uhr</time>}
        {error && <p>Versuche es erneut oder prüfe, ob du noch im Admin angemeldet bist.</p>}
      </div>
    </section>

    {!busy && status && <dl className={styles.metrics}>
      <div className="bi-card"><dt>Freigabe</dt><dd>{scopes[status.scope]}</dd></div>
      <div className="bi-card"><dt>Konfiguriertes Modell</dt><dd>{status.model ?? "–"}</dd></div>
      <div className="bi-card"><dt>Antwortzeit</dt><dd>{status.durationMs === null ? "–" : `${status.durationMs.toLocaleString("de-CH")} ms`}</dd></div>
      <div className="bi-card"><dt>HTTP-Status</dt><dd>{status.httpStatus ?? "–"}</dd></div>
    </dl>}

    <section className={`bi-card ${styles.actions}`}>
      <div>
        <h2>Verbindung und Modell prüfen</h2>
        <p>Der Modelltest sendet eine kurze Beispielanfrage an NukNuk.</p>
      </div>
      <div className={styles.buttons}>
        <button type="button" disabled={busy !== null} onClick={() => requestCheck("connection")}>Verbindung prüfen</button>
        <button type="button" disabled={busy !== null || status?.state === "disabled" || status?.state === "configuration"} onClick={() => requestCheck("model")}>Modell testen</button>
      </div>
    </section>
    <Activity />
    <div className={styles.links}>
      <Link className="bi-back" href="/decision-diagnostics">Decision-Diagnose →</Link>
      <Link className="bi-back" href="/system">Systemstatus →</Link>
    </div>
  </div>;
}
