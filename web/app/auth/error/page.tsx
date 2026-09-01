import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="b-narrow b-main">
      <div className="b-state">
        <div className="b-state-inner">
          <p className="b-kicker">BACKYRD ACCOUNT</p>
          <h1 className="b-display b-page-title" style={{ marginTop: 14 }}>LINK NICHT MEHR GÜLTIG.</h1>
          <p>Der sichere Link ist abgelaufen, wurde bereits verwendet oder ist unvollständig. Fordere bitte einen neuen Link an.</p>
          <Link className="b-button b-button-primary" href="/forgot-password" style={{ marginTop: 22 }}>Neuen Link anfordern</Link>
          <Link className="b-button b-button-secondary" href="/login" style={{ marginTop: 10 }}>Zur Anmeldung</Link>
        </div>
      </div>
    </div>
  );
}
