import Link from "next/link";
import styles from "./landing.module.css";

const principles = [
  {
    title: "Worauf hast du gerade Lust?",
    text: "Backyrd beginnt nicht mit Sternen, sondern mit deinem Moment.",
  },
  {
    title: "Orte, die wirklich passen.",
    text: "Restaurants, Bars, Cafés und Erlebnisse – ausgewählt nach Stimmung und Kontext.",
  },
  {
    title: "Empfehlungen mit Gefühl.",
    text: "Echte Eindrücke von Menschen statt endloser, anonymer Bewertungen.",
  },
];

export default function HomePage() {
  const appDownloadUrl =
    process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || "#download";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Backyrd">
          backyrd
        </Link>

        <nav className={styles.nav} aria-label="Hauptnavigation">
          <a href="#idee">Die Idee</a>
          <a href="#owner">Für Owner</a>
          <Link href="/login?next=/owner" className={styles.login}>
            Owner Login
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.kicker}>Basel fühlt sich gut an.</p>

          <h1>
            Finde nicht irgendeinen Ort.
            <span>Finde den richtigen.</span>
          </h1>

          <p className={styles.intro}>
            Backyrd findet Restaurants, Bars, Cafés und Erlebnisse danach,
            wie sie sich anfühlen – und danach, was gerade zu dir passt.
          </p>

          <div className={styles.actions}>
            <a href={appDownloadUrl} className={styles.primary}>
              App herunterladen
            </a>
            <a href="#idee" className={styles.secondary}>
              Mehr über Backyrd
            </a>
          </div>

          <p className={styles.note}>
            Aktuell in Basel. Weitere Städte folgen.
          </p>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.visualFrame}>
            <span className={styles.visualLabel}>Heute Abend</span>

            <div className={styles.visualQuestion}>
              <small>Worauf hast du Lust?</small>
              <strong>Gemütlich. Lokal. Nicht zu laut.</strong>
            </div>

            <div className={styles.visualResult}>
              <div>
                <small>Backyrd empfiehlt</small>
                <strong>Ein Ort, der jetzt zu dir passt.</strong>
              </div>
              <span>↗</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.manifesto}>
        <p>
          Sterne sagen dir, wie andere einen Ort fanden.
          <strong> Backyrd sagt dir, ob er zu deinem Moment passt.</strong>
        </p>
      </section>

      <section id="idee" className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Die Idee</p>
          <h2>Weniger suchen. Besser entscheiden.</h2>
        </div>

        <div className={styles.principles}>
          {principles.map((item, index) => (
            <article key={item.title} className={styles.principle}>
              <span>0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.moment}>
        <p className={styles.kicker}>Backyrd Moments</p>
        <blockquote>
          Die besten Orte sind nicht immer die bekanntesten.
          Es sind die, an die man sich erinnert.
        </blockquote>
      </section>

      <section id="owner" className={styles.owner}>
        <div>
          <p className={styles.kicker}>Für Gastronomie & Spots</p>
          <h2>Dein Spot auf Backyrd.</h2>
        </div>

        <div className={styles.ownerCopy}>
          <p>
            Im Owner Dashboard pflegst du deinen Auftritt und erhältst einen
            klaren Blick darauf, wie Gäste deinen Spot entdecken und erleben.
          </p>

          <div className={styles.ownerLinks}>
            <Link href="/login?next=/owner" className={styles.primary}>
              Owner Login
            </Link>
            <Link href="/owner" className={styles.ownerTextLink}>
              Zum Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section id="download" className={styles.download}>
        <div>
          <p className={styles.kicker}>Backyrd für iPhone</p>
          <h2>Dein nächster Ort beginnt mit einem Gefühl.</h2>
        </div>

        <a href={appDownloadUrl} className={styles.primary}>
          App herunterladen
        </a>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand}>
          backyrd
        </Link>

        <p>Orte nach Gefühl. Nicht nur nach Sternen.</p>

        <div>
          <Link href="/login?next=/owner">Owner Login</Link>
          <a href="mailto:hello@backyrd.ch">Kontakt</a>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
