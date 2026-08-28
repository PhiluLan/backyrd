import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rechtliches",
  description: "Datenschutz, Nutzungsbedingungen und Einwilligungen bei Backyrd.",
  alternates: { canonical: "/legal" },
};
export default function LegalPage() {
  return (
    <div className="b-narrow b-main">
      <p className="b-kicker">Rechtliches</p>
      <h1 className="b-display b-page-title" style={{ marginTop: 10 }}>
        KLAR & NACHVOLLZIEHBAR.
      </h1>
      <div className="b-marker" />
      <p className="b-muted">
        Die für dein Konto gültigen, versionierten Dokumente und deinen
        Einwilligungsverlauf findest du im Privacy Center. Backyrd verändert
        hier keine Zustimmung und wählt nichts vor.
      </p>
      <div className="b-form-actions">
        <Link className="b-button b-button-primary" href="/settings/history">
          Dokumente öffnen
        </Link>
        <a
          className="b-button b-button-secondary"
          href="mailto:hello@backyrd.ch"
        >
          Datenschutzkontakt
        </a>
      </div>
    </div>
  );
}
