import Link from "next/link";
export default function VerifyPage() {
  return (
    <div className="b-narrow b-main">
      <div className="b-state">
        <div className="b-state-inner">
          <p className="b-kicker">E-Mail bestätigen</p>
          <h1 className="b-display b-page-title" style={{ marginTop: 14 }}>
            FAST DABEI.
          </h1>
          <p>
            Öffne den Link in deiner E-Mail. Danach führt Backyrd dich sicher zu
            deinem Profil.
          </p>
          <Link
            className="b-button b-button-secondary"
            href="/login"
            style={{ marginTop: 22 }}
          >
            Zur Anmeldung
          </Link>
        </div>
      </div>
    </div>
  );
}
