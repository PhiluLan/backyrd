# Founder User Lab – lokales Runbook

## Kennzeichnung

Das Lab ist nur für Founder, CTO und Entwicklung. Es ist kein Nutzerprofil, keine Product-Oberfläche und keine Qualitätsmessung.

## Start

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
- Privacy-/Legal-Export wird nicht über die normale Lab-Ansicht angeboten; dafür bleibt der getrennte autorisierte Phase-3C-Pfad maßgeblich.

Alle Dateien liegen unter `.local/`, werden nicht committed und sind keine Production-Daten.
