import Link from "next/link";

const ownerLogin = "/login?next=%2Fowner";
const ownerContact = "mailto:hello@backyrd.ch?subject=Owner-Zugang%20f%C3%BCr%20meinen%20Spot";

export function OwnerLanding() {
  return (
    <main className="owner-public">
      <header className="owner-public-header">
        <Link href="/" className="owner-public-brand" aria-label="backyrd Startseite">
          <span className="owner-public-mark" aria-hidden="true">b</span>
          <span>backyrd<span className="owner-public-brand-detail"> / für Betreiber:innen</span></span>
        </Link>
        <div className="owner-public-header-actions">
          <Link href="/" className="owner-public-back">Zur Website</Link>
          <Link href={ownerLogin} className="owner-public-signin">Anmelden</Link>
        </div>
      </header>

      <section className="owner-public-hero">
        <div className="owner-public-hero-copy">
          <p className="owner-public-kicker">DEIN ORT AUF backyrd</p>
          <h1>Dein Ort hat <em>mehr</em> zu erzählen.</h1>
          <p className="owner-public-lead">
            Zeig, was ihn besonders macht – mit aktuellen Informationen und echtem Kontext
            für Menschen, zu deren Moment er passt.
          </p>
          <div className="owner-public-actions">
            <Link href={ownerLogin} className="owner-public-primary">Zum Owner-Bereich</Link>
            <a href={ownerContact} className="owner-public-secondary">Zugang anfragen</a>
          </div>
          <p className="owner-public-hint">Bereits verbunden? Melde dich mit deinem bestehenden backyrd-Konto an.</p>
        </div>
        <div className="owner-public-art" aria-hidden="true">
          <div className="owner-public-art-glow" />
          <div className="owner-public-art-orbit owner-public-art-orbit-one" />
          <div className="owner-public-art-orbit owner-public-art-orbit-two" />
          <div className="owner-public-art-core">
            <span className="owner-public-art-small">ECHTE ORTE. ECHTE MOMENTE.</span>
            <span className="owner-public-art-word">Dein<br />backyrd.</span>
            <span className="owner-public-art-line" />
            <span className="owner-public-art-bottom">Dein Ort bleibt unverwechselbar.</span>
          </div>
        </div>
      </section>

      <section className="owner-public-benefits" aria-label="Was der Owner-Bereich bietet">
        <div className="owner-public-benefits-intro">
          <p className="owner-public-kicker">WAS DU HIER TUN KANNST</p>
          <h2>Ein guter Auftritt beginnt mit echten Angaben.</h2>
        </div>
        <div className="owner-public-benefit-grid">
          <article><span>01</span><h3>Deinen Ort pflegen</h3><p>Basisdaten, Kontakt und Besonderheiten aktuell halten.</p></article>
          <article><span>02</span><h3>Kontext ergänzen</h3><p>Beschreibe, wann dein Ort wirklich passt. Neue Angaben werden geprüft.</p></article>
          <article><span>03</span><h3>Einblicke erhalten</h3><p>Sieh verfügbare Signale zu deinem Spot – ohne Sterne-Ranking.</p></article>
        </div>
      </section>

      <section className="owner-public-trust">
        <div><p className="owner-public-kicker">UNSER VERSPRECHEN</p><h2>Authentizität ist nicht käuflich.</h2></div>
        <p>Owner-Angaben helfen, einen Ort besser zu verstehen. Sie werden geprüft und kaufen keine bessere Position in Empfehlungen.</p>
      </section>

      <footer className="owner-public-footer">
        <span>© backyrd</span>
        <span>Fragen zu deinem Spot? <a href={ownerContact}>hello@backyrd.ch</a></span>
      </footer>
    </main>
  );
}
