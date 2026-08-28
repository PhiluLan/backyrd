import Link from "next/link";
export default function NotFound() {
  return (
    <div className="b-narrow b-main">
      <div className="b-state">
        <div className="b-state-inner">
          <p className="b-kicker">404</p>
          <h1 className="b-display b-page-title" style={{ marginTop: 12 }}>
            HIER IST GERADE NICHTS.
          </h1>
          <p>Der Ort oder die Seite ist nicht mehr verfügbar.</p>
          <Link
            href="/"
            className="b-button b-button-primary"
            style={{ marginTop: 22 }}
          >
            Zurück zu Entdecken
          </Link>
        </div>
      </div>
    </div>
  );
}
