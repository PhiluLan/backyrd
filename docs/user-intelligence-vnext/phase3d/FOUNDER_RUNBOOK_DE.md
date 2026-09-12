# Founder User Lab – lokales Runbook

## Kennzeichnung

Das Lab ist nur für Founder, CTO und Entwicklung. Es ist kein Nutzerprofil, keine Product-Oberfläche und keine Qualitätsmessung.

## Empfohlener Browser-Start

Ein einziger Befehl prüft den Build, initialisiert bei Bedarf den versionierten lokalen Store und startet ausschließlich auf der Loopback-Adresse:

```bash
npm run user-intelligence-vnext:phase3d:lab:ui
```

Danach ist das Lab unter `http://127.0.0.1:3221` vollständig im Browser bedienbar. Es werden keine externen Services, Production-Daten oder Admin-Routen verwendet. Testnutzer, Situationen, Handlungen, Rebuild, Replay, Privacy-Export, Withdrawal, Reset und Erasure sind in der Oberfläche erreichbar. Destruktive lokale Aktionen verlangen eine Bestätigung.

Die Decision-Aufgabe ist bewusst kein Freitextfeld. Die UI bietet ausschließlich die vier deterministischen Fixture-Aufgaben „Ort finden“, „Café finden“, „Ruhig essen“ und „Etwas Neues entdecken“ als Auswahlliste an. Die Auswahl wird serverseitig an eine versionierte semantische Aufgaben-ID gebunden; technische Decision-Ausführungen bleiben davon getrennte Provenance. Nicht erlaubte Werte werden fail-closed abgewiesen, und Rohtext wird weder im Store noch im User Model persistiert.

Für den Skip-Vergleich gruppiert das Lab nur semantisch passende aktive Skips desselben Testnutzers: gleicher Spot, gleiche Fixture-Aufgabe und gleicher relevanter Context. Unterschiedliche technische Decision-IDs bleiben sichtbar, gehören aber nicht zum Reife-Target. Die normale Ansicht zeigt pro Kandidat beispielsweise „3 von 3 unabhängigen passenden Journeys“ und stellt ausdrücklich klar, dass daraus keine globale Spot- oder Concept-Abneigung entsteht.

## Bestehende CLI

Die CLI bleibt für automatisierte Reproduktion und Entwicklung rückwärtskompatibel:

```bash
npm run user-intelligence-vnext:phase3d:lab -- init
npm run user-intelligence-vnext:phase3d:lab -- apply search
npm run user-intelligence-vnext:phase3d:lab -- apply save
npm run user-intelligence-vnext:phase3d:lab -- apply visit
npm run user-intelligence-vnext:phase3d:lab -- apply matched
npm run user-intelligence-vnext:phase3d:lab -- show
npm run user-intelligence-vnext:phase3d:lab -- report
```

Weitere Presets: `removeSave`, `navigation`, `review`, `smartReview`, `notMatched`, `neutral`, `skip`, `notFit`, `dwell`, `alternative`, `moment` und `momentWithoutAuthority`. `correct-last` erzeugt eine append-only Correction. Der nicht autorisierte Moment wird fail-closed nur als abgewiesener Versuch protokolliert. Die Aktionen werden als kontrollierte Presets erzeugt; niemand muss JSON schreiben. `report` erzeugt lokal eine verständliche HTML-Ansicht und den maschinenlesbaren Bericht.

Für Grenzfälle stehen `apply-same-journey <preset>`, `apply-evening <preset>`, `apply-late <preset>`, `apply-other-spot <preset>` und `retry-last` bereit. Damit lassen sich gleiche Journey, anderer Context, verspätete Lieferung, anderer Spot und deduplizierter Retry ohne freie Eventkonstruktion prüfen.

## Datenschutzaktionen

```bash
npm run user-intelligence-vnext:phase3d:lab -- withdraw
npm run user-intelligence-vnext:phase3d:lab -- reset
npm run user-intelligence-vnext:phase3d:lab -- erase
```

- `withdraw`: widerruft lokalen Evaluation-Consent und entfernt aktive personenbezogene Lab-Daten.
- `reset`: verwirft Modell, Events und Rebuild-Material und startet frisch.
- `erase`: löscht den pseudonymen Testnutzer und seine lokale Datei.
- Privacy-/Legal-Testexport ist in der Browser-App als bewusst getrennter Download verfügbar. Er ist kein Taste-Dashboard und besitzt ausschließlich lokale Test-Authority.

Alle Dateien liegen atomar und mit restriktiven Dateirechten unter `.local/`, werden nicht committed oder synchronisiert und sind keine Production-Daten. Unbekannte Versionen oder manipulierte Integritäts-Hashes werden fail-closed abgewiesen.
