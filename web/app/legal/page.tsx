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
      <section id="decision" aria-labelledby="decision-privacy-title" style={{ marginTop: 32, marginBottom: 28 }}>
        <h2 id="decision-privacy-title">Datenschutz zur KI-Suche</h2>
        <p className="b-muted">
          Wenn du nach Orten suchst, übermittelt Backyrd deinen Suchwunsch und die
          gewählten Suchangaben, zum Beispiel Stadt, Budget oder Begleitung, an
          OpenAI. Dazu kommen das Bezugsdatum und die Zeitzone, damit Angaben wie
          „morgen“ verstanden werden. Die KI hilft, deine Anfrage zu verstehen;
          passende Orte wählt Backyrd anhand seiner Spot- und Eventangaben aus.
        </p>
        <p className="b-muted">
          Deine Konto-ID und E-Mail-Adresse werden dabei nicht an OpenAI gesendet.
          Angaben, die du selbst in das Suchfeld schreibst, sind Teil der Anfrage.
          Bitte gib deshalb keine vertraulichen Daten oder Namen anderer Personen
          ein. Backyrd fordert keine dauerhafte Speicherung der Modellantwort bei
          OpenAI an. Technische Protokolle beim Anbieter sind davon getrennt.
        </p>
        <p className="b-muted">
          Die Verarbeitung durch OpenAI kann ausserhalb der Schweiz stattfinden.
          Persönliche Vorlieben berücksichtigt Backyrd nur mit deiner entsprechenden
          Einwilligung. Du kannst sie im Privacy Center verwalten. Fragen oder
          Anliegen zum Datenschutz: hello@backyrd.ch.
        </p>
      </section>
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
