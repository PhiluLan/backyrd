"use client";
import { useState } from "react";
import type { PipelineReport } from "@/lib/server/researchSafeImport";
import { researchFieldLabel } from "./ResearchValue";
import styles from "./WorldResearchBatchPanel.module.css";
export function ResearchPipelinePanel({
  spot,
  post,
  openReview,
}: {
  spot: { spotId: string; name: string } | null;
  post: (body: unknown) => Promise<unknown>;
  openReview: (jobId: string) => void;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [report, setReport] = useState<PipelineReport | null>(null),
    [enabled, setEnabled] = useState<boolean | null>(null);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Die Verarbeitung konnte nicht bestätigt werden.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportTask = () =>
    run(async () => {
      if (!spot) return;
      const result = (await post({
        action: "export",
        spotId: spot.spotId,
      })) as { document: unknown; automaticImportEnabled: boolean };
      setEnabled(result.automaticImportEnabled);
      setReport(null);
      const json = JSON.stringify(result.document, null, 2);
      setText(json);
      const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `backyrd-grundinformationen-${spot.spotId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(
        "Auftrag für die 16 Grundinformationen erstellt. Die vollständige recherchierte Datei anschliessend hier laden.",
      );
    });
  const process = () =>
    run(async () => {
      const document = JSON.parse(text) as unknown;
      const result = (await post({ action: "process", document })) as {
        report: PipelineReport;
      };
      setReport(result.report);
    });
  return (
    <div className={styles.stage}>
      <h3>Recherche mit sicherer Übernahme</h3>
      <p>
        Die 16 Grundinformationen recherchieren lassen. Eindeutig belegte neue
        Kontaktangaben werden zusätzlich an der offiziellen Website geprüft,
        gespeichert und im Profil zurückgelesen. Alle übrigen Vorschläge kommen
        in die Prüfliste.
      </p>
      <p className={styles.note}>
        Bestehende Angaben werden nicht automatisch ersetzt. Zunächst
        freigegeben: öffentliche E-Mail, Telefon und offiziell verlinkte
        Socialprofile. Keine automatische Übernahme aufgrund einer
        KI-Vertrauenszahl.
      </p>
      <button
        className={styles.secondary}
        disabled={busy || !spot}
        onClick={() => void exportTask()}
      >
        {spot
          ? `Rechercheauftrag für ${spot.name}`
          : "Genau einen Spot oben auswählen"}
      </button>
      <label className={styles.upload}>
        Recherchiertes Ergebnis laden
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 2_000_000) {
              setMessage("Die Datei ist zu gross. Maximal 2 MB.");
              return;
            }
            void file
              .text()
              .then((value) => {
                setText(value);
                setReport(null);
                setMessage(
                  "Recherche geladen. Bereit für Quellenprüfung und sichere Übernahme.",
                );
              })
              .catch(() =>
                setMessage("Die Datei konnte nicht gelesen werden."),
              );
          }}
        />
      </label>
      <details className={styles.details}>
        <summary>Recherche-JSON ansehen oder einfügen</summary>
        <textarea
          aria-label="Recherche für sichere Übernahme"
          className={styles.json}
          value={text}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            setReport(null);
          }}
          spellCheck={false}
        />
      </details>
      {enabled === false && (
        <p role="status">
          Die automatische Übernahme ist bis zum Abschluss der Freigabetests
          ausgeschaltet. Die bestehende manuelle Prüfung bleibt verfügbar.
        </p>
      )}
      <button
        className={styles.primary}
        disabled={busy || !text || enabled === false}
        onClick={() => void process()}
      >
        {busy
          ? "Quellen prüfen und Profil abgleichen …"
          : "Quellen prüfen und sichere Angaben speichern"}
      </button>
      {!!message && <p role="status">{message}</p>}
      {report && (
        <div
          className={styles.outcome}
          role={report.errors.length ? "alert" : "status"}
        >
          <h3>
            {report.saveState === "SAVED_UNVERIFIED"
              ? "Speicherstand noch nicht bestätigt"
              : report.stored.length
                ? `${report.stored.length} Angaben gespeichert und im Profil bestätigt`
                : report.state === "FAILED"
                  ? "Verarbeitung nicht abgeschlossen"
                  : "Keine neuen sicheren Angaben zu speichern"}
          </h3>
          {!!report.stored.length && (
            <p>{report.stored.map(researchFieldLabel).join(" · ")}</p>
          )}
          <p>
            {report.unchanged.length} bereits unverändert vorhanden ·{" "}
            {report.review.length} Vorschläge zur Prüfung ·{" "}
            {report.unresolved.length} Angaben offen.
          </p>
          {!!report.sourceFailures?.length && (
            <p>
              Die offizielle Website konnte nicht gelesen werden. Es wurde
              daraus nichts automatisch übernommen; die Angaben bleiben zur
              Prüfung erhalten.
            </p>
          )}
          {!!report.errors.length && (
            <p>
              Die Verarbeitung ist nicht vollständig abgeschlossen:{" "}
              {report.errors.join(" · ")}. Derselbe Auftrag kann erneut
              verarbeitet werden; bestätigte Schreibschritte werden nicht
              dupliziert.
            </p>
          )}
          {!!report.review.length && (
            <ul>
              {report.review.map((item) => (
                <li key={item.attributeKey}>
                  {researchFieldLabel(item.attributeKey)}:{" "}
                  {item.reason === "EXISTING_VALUE_PROTECTED"
                    ? "Die bestehende Angabe bleibt erhalten; bitte den Unterschied prüfen."
                    : item.reason === "FIELD_REQUIRES_REVIEW"
                      ? "Für dieses Feld ist eine Prüfung vorgesehen."
                      : "Quelle oder Zuordnung konnte nicht eindeutig bestätigt werden."}
                </li>
              ))}
            </ul>
          )}
          {(report.review.length > 0 || report.unresolved.length > 0) &&
            !report.errors.length && (
              <button
                className={styles.secondary}
                onClick={() => openReview(report.jobId)}
              >
                Offene Angaben prüfen
              </button>
            )}
        </div>
      )}
    </div>
  );
}
