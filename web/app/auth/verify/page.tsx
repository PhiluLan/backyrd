import Link from "next/link";

export default function AppEmailVerifyPage() {
  return (
    <main className="b-narrow b-main">
      <div className="b-state">
        <div className="b-state-inner">
          <p className="b-kicker">BACKYRD · E-MAIL BESTÄTIGEN</p>
          <h1 className="b-display b-page-title" style={{ marginTop: 14 }}>
            NUR NOCH EIN SCHRITT.
          </h1>
          <p>
            Öffne Backyrd und gib den sechsstelligen Code aus deiner E-Mail ein.
            Der Link bestätigt deine Adresse nicht automatisch.
          </p>
          <a className="b-button b-button-primary" href="backyrd://auth/verify" style={{ marginTop: 22 }}>
            Backyrd öffnen
          </a>
          <p style={{ marginTop: 22 }}>
            Falls die App nicht geöffnet wird, starte Backyrd selbst und wähle
            „E-Mail bestätigen“.
          </p>
          <Link className="b-button b-button-secondary" href="/login" style={{ marginTop: 22 }}>
            Zur Anmeldung
          </Link>
        </div>
      </div>
    </main>
  );
}
