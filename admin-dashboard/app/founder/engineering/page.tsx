import { EngineeringPanel } from "@/components/founder/EngineeringPanel";

export default function FounderEngineeringPage() {
  return (
    <div className="fcc-page">
      <header className="fcc-pageHeader">
        <div><span className="fcc-wordmark">BACKYRD · FOUNDER</span><h1>Entwicklung</h1><p>Der aktuelle Hauptstand, abgeschlossene Änderungen, offene Arbeiten und automatische Prüfungen auf einen Blick.</p></div>
        <div className="fcc-refreshNote"><span /> Aktualisiert sich alle 45 Sekunden</div>
      </header>
      <EngineeringPanel />
      <section className="fcc-note">
        <strong>Von der Entwicklung zur Launch-Freigabe</strong>
        <p>Abgeschlossene Entwicklungsarbeit kann ein Launch-Kriterium auf <b>Zur Prüfung</b> setzen. Erst ein erfolgreicher Nachweis und eine bewusste Freigabe machen es zu <b>Bestätigt</b>.</p>
      </section>
    </div>
  );
}
