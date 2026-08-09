"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { founderDate } from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderEngineering } from "@/types/founder";

export function EngineeringPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<FounderEngineering | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Die Admin-Sitzung ist nicht verfügbar. Bitte erneut anmelden.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/admin/founder/engineering", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await response.json()) as FounderEngineering | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "engineering_unavailable");
      }
      setData(body);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Entwicklungsdaten konnten gerade nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 45_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  return (
    <section className="fcc-panel fcc-engineering">
      <div className="fcc-panelHead">
        <div>
          <span className="fcc-overline">System · GitHub</span>
          <h2>Entwicklung</h2>
        </div>
        <Link href="/founder/engineering">Entwicklung öffnen →</Link>
      </div>

      {loading ? <div className="fcc-inlineState">Live-Entwicklungsstand wird geladen …</div> : null}
      {error ? <div className="fcc-inlineError">{founderEngineeringError(error)}</div> : null}
      {data ? (
        <>
          <div className={`fcc-engineeringSummary ${data.main.ciStatus}`}>
            <span aria-hidden="true">{data.main.ciStatus === "pass" ? "✓" : data.main.ciStatus === "fail" ? "!" : "·"}</span>
            <p>{mainSummary(data)}</p>
          </div>
          <div className="fcc-engineeringMain">
            <div>
              <span>Aktueller Hauptstand</span>
              <a href={data.main.url} target="_blank" rel="noreferrer">{data.main.shortSha}</a>
              <small>{data.main.message} · {founderDate(data.main.committedAt)}</small>
            </div>
            <div>
              <span>Aktueller Schwerpunkt</span>
              <strong>{data.inferredArea}</strong>
              <small>Aus letzter Änderung und offenen Arbeitsständen abgeleitet</small>
            </div>
            <div>
              <span>Letzte abgeschlossene Änderung</span>
              {data.latestMerge ? (
                <>
                  <a href={data.latestMerge.url} target="_blank" rel="noreferrer">#{data.latestMerge.number}</a>
                  <small>{data.latestMerge.title} · {founderDate(data.latestMerge.mergedAt)}</small>
                </>
              ) : (
                <><strong>—</strong><small>Keine abgeschlossene Änderung gefunden.</small></>
              )}
            </div>
            <div>
              <span>Offene Änderungen</span>
              <strong>{data.openPullRequests.length}</strong>
              <small>Aktualisiert {founderDate(data.refreshedAt)}</small>
            </div>
          </div>

          {!compact || data.openPullRequests.length > 0 ? (
            <div className="fcc-prList">
              {data.openPullRequests.length === 0 ? (
                <div className="fcc-empty">Derzeit gibt es keine offenen Änderungen.</div>
              ) : data.openPullRequests.slice(0, compact ? 4 : 20).map((pull) => (
                <a className="fcc-pr" href={pull.url} target="_blank" rel="noreferrer" key={pull.number}>
                  <span className="fcc-prNumber">#{pull.number}</span>
                  <div><strong>{pull.title}{pull.draft ? <em className="fcc-draft">Entwurf</em> : null}</strong><small>{pull.branch} · {founderDate(pull.updatedAt)}</small></div>
                  <span className={`fcc-ci ${pull.ciStatus}`}>{ciLabel(pull.ciStatus)}</span>
                  <span className={`fcc-merge ${pull.mergeability}`}>{mergeabilityLabel(pull.mergeability)}</span>
                </a>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function founderEngineeringError(error: string): string {
  if (error === "github_not_configured") return "GitHub-Verbindung fehlt. Das Entwicklungs-Dashboard kann derzeit keine Live-Daten laden.";
  if (error === "github_api_403") return "GitHub konnte nicht gelesen werden. Bitte Berechtigung des Tokens prüfen.";
  if (/^github_api_5\d\d$/.test(error)) return "GitHub ist momentan nicht erreichbar. Wir versuchen es beim nächsten Aktualisieren erneut.";
  if (error.includes("Admin-Sitzung") || error.includes("GitHub") || error.includes("Entwicklungsdaten")) return error;
  return "Entwicklungsdaten konnten gerade nicht geladen werden.";
}

function ciLabel(status: FounderEngineering["main"]["ciStatus"]): string {
  if (status === "pass") return "Prüfungen erfolgreich";
  if (status === "fail") return "Prüfungen fehlgeschlagen";
  if (status === "pending") return "Prüfungen laufen";
  return "Prüfstatus offen";
}

function mergeabilityLabel(status: FounderEngineering["openPullRequests"][number]["mergeability"]): string {
  if (status === "mergeable") return "Bereit";
  if (status === "conflicting") return "Konflikt – Aktualisierung nötig";
  return "Wird geprüft";
}

function mainSummary(data: FounderEngineering): string {
  if (data.main.ciStatus === "pass") return "Alle automatischen Prüfungen des aktuellen Hauptstands sind erfolgreich.";
  if (data.main.ciStatus === "fail") return "Der aktuelle Hauptstand hat fehlgeschlagene automatische Prüfungen und benötigt Aufmerksamkeit.";
  if (data.main.ciStatus === "pending") return "Die automatischen Prüfungen des aktuellen Hauptstands laufen noch.";
  return "Für den aktuellen Hauptstand liegt noch kein eindeutiges Prüfergebnis vor.";
}
