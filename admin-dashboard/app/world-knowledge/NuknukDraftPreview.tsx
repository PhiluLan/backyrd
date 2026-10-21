"use client";

import styles from "./WorldResearchBatchPanel.module.css";
import { type NuknukDraft } from "@/lib/nuknukResearchDraft";

type Offer = { name: string; kind: string; properties?: Array<{ key: string; value: unknown }> };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function offers(value: unknown): Offer[] {
  if (!isRecord(value) || !Array.isArray(value.offers)) return [];
  return value.offers.filter((offer): offer is Offer => isRecord(offer) && typeof offer.name === "string" && typeof offer.kind === "string")
    .map(offer => ({ ...offer, properties: Array.isArray(offer.properties) ? offer.properties.filter(property => isRecord(property) && typeof property.key === "string") as Offer["properties"] : [] }));
}

export function NuknukDraftPreview({ draft, onClose, onSave, saved, saving, error }: {
  draft: NuknukDraft; onClose: () => void; onSave: () => void; saved: boolean; saving: boolean; error: string;
}) {
  return <div className={styles.draft}>
    <div className={styles.status} role="status"><span>NUKNUK · LOKALER PRÜFENTWURF</span><h3>{draft.name}</h3><p>Diese Ansicht zeigt den Bericht unverändert als Recherchevorschlag. Er ist nicht importierbar und schreibt nichts in World Knowledge. Prüfe die Originalquellen, insbesondere PDF-Layouts und die Aktualität von Angeboten.</p></div>
    <div className={styles.stage}><p className={styles.note}>{draft.version} · {draft.requests ?? "?"} Quellenabrufe · {draft.modelCalls ?? "?"} Modellaufrufe</p>
      {draft.results.map((result) => <article className={styles.review} key={result.attributeKey}>
        <span className={styles.eyebrow}>{result.status === "REQUIRES_REVIEW" ? "PRÜFUNG NÖTIG" : result.status}</span>
        <h4>{result.attributeKey.replaceAll(".", " · ")}</h4>
        {result.partialProfile && <p className={styles.note}>Teilprofil: Diese Angebote sind keine vollständige Speisekarte und ersetzen kein bestehendes Profil.</p>}
        {offers(result.value).length ? <ul className={styles.draftOffers}>{offers(result.value).map((offer, index) => <li key={`${offer.name}-${index}`}><strong>{offer.name}</strong><small>{offer.kind}</small>{offer.properties?.map((property, propertyIndex) => <p key={propertyIndex}>{property.key}: {String(property.value)}</p>)}</li>)}</ul>
          : result.value !== undefined ? <pre className={styles.draftValue}>{JSON.stringify(result.value, null, 2)}</pre>
          : <p>Bewusst offen: {result.reason ?? "Keine ausreichend belegte Angabe."}</p>}
        {!!result.citations?.length && <details className={styles.details} open><summary>Originalbelege ({result.citations.length})</summary>{result.citations.map((citation, index) => <blockquote className={styles.draftCitation} key={index}><p>{citation.evidence}</p><a href={citation.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a>{citation.layoutReviewRequired && <small>PDF-Layout im Original prüfen</small>}</blockquote>)}</details>}
      </article>)}
      {!!draft.sourceFailures?.length && <details className={styles.details}><summary>Nicht verarbeitete Quellen ({draft.sourceFailures.length})</summary><ul>{draft.sourceFailures.map((failure, index) => <li key={index}>{failure.url}: {failure.reason}</li>)}</ul></details>}
      {!!draft.limitations?.length && <p className={styles.note}>Grenzen: {draft.limitations.join(" · ")}</p>}
      {saved ? <p className={styles.note} role="status">Im Admin gespeichert. Dieser Prüfentwurf ist auch auf anderen Geräten mit Admin-Zugang sichtbar.</p>
        : <button className={styles.primary} disabled={saving} onClick={onSave}>{saving ? "Wird gespeichert …" : "Prüfentwurf im Admin speichern"}</button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.secondary} onClick={onClose}>Zurück zur Recherche</button>
    </div>
  </div>;
}
