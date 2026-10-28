import Link from "next/link";
import type { SpotProfileStatus } from "@/lib/spotProfileStatus";

export function ProfileCompleteness({ profile, spotId, name }: { profile?: SpotProfileStatus; spotId: string; name: string }) {
  const score = profile?.completeness;
  const href = `/spots/${spotId}/edit`;
  if (!score) return <div className="admin-profileStatus" role="status"><strong>{profile?.label ?? "Profilstand wird geladen …"}</strong><small>{profile?.detail ?? "Gespeicherte Angaben werden abgerufen"}</small>{profile?.state === "unavailable" && <Link href={href}>Profil öffnen</Link>}</div>;
  const missing = score.sections.flatMap(section => section.checks.filter(check => !check.complete));
  return <div className="admin-profileStatus admin-profileCoverage">
    <div className="admin-profileCoverageHeader"><span>Profil ausgefüllt</span><strong>{score.percent}<span>%</span></strong></div>
    <div className="admin-profileCoverageTrack" role="progressbar" aria-label={`Profil von ${name} ausgefüllt`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.percent} aria-valuetext={`${score.percent} Prozent, ${score.completed} von ${score.total} passenden Angaben`}><span style={{ width: `${score.percent}%` }}/></div>
    {profile.state === "attention" && <p className="admin-profileCoverageNotice">{profile.label}: {profile.detail}</p>}
    <small>{score.completed} von {score.total} passenden Angaben</small>
    {missing.length > 0 ? <p className="admin-profileCoverageNext">Noch offen: {missing.slice(0, 2).map(check => check.label).join(" · ")}{missing.length > 2 ? ` · +${missing.length - 2} weitere` : ""}</p> : <p className="admin-profileCoverageNext">Alle berücksichtigten Angaben sind ausgefüllt.</p>}
    <details className="admin-profileCoverageDetails"><summary>{missing.length ? "Was fehlt noch?" : "So wird gerechnet"}</summary>
      <p>Gezählt werden gespeicherte Profilangaben und passende Detailfragen zu Angeboten und Bereichen. „Nein“ und ausdrücklich „nicht zutreffend“ zählen als beantwortet; unbekannte, ungültige oder zurückgehaltene Angaben bleiben offen. Mehr Angebote können neue Detailfragen hinzufügen.</p>
      <p>100 % bedeutet ausgefüllt, nicht auf Richtigkeit geprüft. Bilder, Moods, Bewertungen, zusätzliche Social-Media-Kanäle und Sonderöffnungszeiten zählen nicht mit.</p>
      {score.sections.map(section => {
        const open = section.checks.filter(check => !check.complete);
        return <details key={section.id} className="admin-profileCoverageSection"><summary>{section.label}<span>{section.checks.length - open.length}/{section.checks.length}</span></summary>{open.length ? <ul>{open.map(check => <li key={check.id}>{check.label}</li>)}</ul> : <p>Ausgefüllt</p>}</details>;
      })}
      <Link className="admin-profileCoverageAction" href={href}>Profil ergänzen →</Link>
    </details>
  </div>;
}
