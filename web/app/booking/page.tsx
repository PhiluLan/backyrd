import type { Metadata } from "next";
import Link from "next/link";
import styles from "./booking.module.css";

export const metadata: Metadata = {
  title: "Backyrd Booking",
  description: "Backyrd Booking entsteht: die Buchungsinfrastruktur für Restaurants und später weitere Spots.",
  alternates: { canonical: "/booking" },
};

const capabilities = [
  ["01", "Tische", "Echte Verfügbarkeit statt Anfrage-Chaos. Bereiche, Tische und Services bleiben synchron."],
  ["02", "Gäste", "Bestätigungen, Hinweise und Buchungshistorie an einem Ort – ohne fremde Marktplatzbeziehung."],
  ["03", "Überall buchbar", "Direkt auf der Website, über einen Link, QR-Code und später direkt in Backyrd."],
];

export default function BookingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Backyrd Startseite">
          backyrd<span>booking</span>
        </Link>
        <nav>
          <a href="#produkt">Produkt</a>
          <a href="#restaurants">Für Restaurants</a>
          <Link href="/booking/console" className={styles.login}>Booking Console</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>BACKYRD BOOKING · RESTAURANT PILOT</p>
        <h1>Dein Spot.<br /><em>Deine Buchungen.</em></h1>
        <p className={styles.intro}>
          Wir entwickeln die Buchungsbasis für deinen Restaurantbetrieb: Tische,
          Servicezeiten und Reservierungen an einem Ort. Direktbuchungen auf deiner
          Website stehen dabei im Mittelpunkt.
        </p>
        <div className={styles.actions}>
          <a href="mailto:hello@backyrd.ch?subject=Backyrd%20Booking%20Restaurant-Pilot" className={styles.primary}>Pilot anfragen <span>↗</span></a>
          <a href="#produkt" className={styles.secondary}>So funktioniert&apos;s</a>
        </div>
      </section>

      <section id="produkt" className={styles.productFrame}>
        <div className={styles.productHead}>
          <div><span className={styles.liveDot} /> BOOKING CONSOLE · VORSCHAU</div>
          <span>Restaurant · Zürich</span>
        </div>
        <div className={styles.productBody}>
          <aside>
            <strong>Heute</strong>
            <span className={styles.activeNav}>Reservierungen</span>
            <span>Tischplan</span>
            <span>Services</span>
            <span>Gäste</span>
          </aside>
          <div className={styles.schedule}>
            <div className={styles.scheduleTitle}><div><small>BEISPIEL · ABENDSERVICE</small><h2>Dein Abend im Überblick</h2></div></div>
            <div className={styles.servicePill}><span>Abendservice</span><span>18:00 – 23:00</span></div>
            <div className={styles.reservationGrid}>
              <article><span>18:30</span><strong>Anna Keller</strong><small>2 Gäste · Tisch 04</small><b>Bestätigt</b></article>
              <article><span>19:00</span><strong>Marc &amp; Team</strong><small>4 Gäste · Tisch 12</small><b>Bestätigt</b></article>
              <article><span>20:15</span><strong>Léa Martin</strong><small>2 Gäste · Tisch 07</small><b className={styles.pending}>Anfrage</b></article>
            </div>
          </div>
        </div>
        <div className={styles.productFooter}>Produktvorschau mit erfundenen Beispieldaten. Reservierungen und Einrichtung sind noch nicht freigeschaltet.</div>
      </section>

      <section id="restaurants" className={styles.capabilities}>
        <div className={styles.sectionIntro}><p className={styles.eyebrow}>STARTING WITH RESTAURANTS</p><h2>Wir starten mit deinem Abendservice.</h2></div>
        <div className={styles.capabilityList}>
          {capabilities.map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
        </div>
      </section>

      <section className={styles.promise}>
        <p>Backyrd Booking ist kein Marktplatz, der deinen Betrieb überdeckt.</p>
        <h2>Es ist die Buchungsbasis<br />deines Spots.</h2>
        <a href="mailto:hello@backyrd.ch?subject=Backyrd%20Booking%20Restaurant-Pilot">Interesse am Restaurant-Pilot melden <span>↗</span></a>
      </section>

      <footer className={styles.footer}><span>© {new Date().getFullYear()} Backyrd</span><Link href="/">backyrd.ch</Link></footer>
    </main>
  );
}
