# Phase 3D – Founder-/CTO-Decision-Pack

Dieses Dokument bewahrt den ursprünglichen Kandidatenvergleich. Der Founder hat anschließend alle fünf Kalibrierungsentscheidungen im append-only Record `backyrd.user-intelligence.calibration-decisions@3d-2` ausgewählt. Die Auswahl ist für die weitere Kalibrierung freigegeben, aber weder Product- noch Runtime-Aktivierung.

## 1. Search Contextual Maturity

- Konservativ: fünf unabhängige Journeys, stabiler Context, sichere Attribution. Vorteil: wenig Fehlpromotion; Risiko: langsames Lernen.
- Ausgewogen: drei unabhängige Journeys. Vorteil: nachvollziehbarer früher Hinweis; Risiko: benötigt gute synthetische Gegenbeispiele.
- Lernfreudig: zwei unabhängige Journeys. Vorteil: schneller Cold Start; Risiko: Reise- oder Fremdsuche kann überbewertet werden.
- Dev-Empfehlung: ausgewogen als nächster Evaluation-Favorit, noch nicht freigeben.
- Founder-Frage: Reichen drei getrennte, gleichgerichtete Suchen im identischen erlaubten Context für eine klar unsichere Context-Hypothese?

## 2. Search Long-Term Promotion

- Konservativ: zehn Journeys, drei Contexts, fünf Spots und positive Experience-Bestätigung.
- Ausgewogen: sechs Journeys, zwei Contexts, drei Spots und positive Experience-Bestätigung.
- Lernfreudig: vier Journeys, zwei Contexts, zwei Spots; keine zwingende Experience-Bestätigung.
- Dev-Empfehlung: konservativ evaluieren; Search bleibt Absicht und darf nicht vorschnell Taste werden.
- Founder-Frage: Muss jede Long-Term-Promotion mindestens eine reale positive Experience enthalten?

## 3. Skip Maturity

- Konservativ: acht unabhängige stabile Ziele plus explizites „passt nicht“ als Bestätigung.
- Ausgewogen: fünf plus Bestätigung.
- Lernfreudig: drei ohne Bestätigung.
- Alle Varianten verbieten globale Spot- oder Concept-Aversion.
- Dev-Empfehlung: konservativ; eine Production-Wirkung erst nach eigener Fehlpromotions-Evaluation.
- Founder-Frage: Soll Skip ohne stärkere Bestätigung überhaupt jemals projectable werden?

## 4. Unterschiedliche Spots für Concept Taste

- Konservativ: fünf verschiedene Spots.
- Ausgewogen: drei verschiedene Spots.
- Lernfreudig: zwei verschiedene Spots.
- Immer erforderlich: unabhängige Experiences, sichere World-Attribution, kein ungelöster Konflikt.
- Dev-Empfehlung: drei als Evaluation-Favorit; zwei Spots sind anfällig für Zufall, fünf lernen langsam.
- Founder-Frage: Reichen drei verschiedene Spots für eine erste begrenzte Concept-Hypothese?

## 5. Retention

- Konservativ: maximal minimieren und jede Klasse separat entscheiden.
- Ausgewogen: purpose-getrennte Klassen mit Legal-/CTO-Entscheid.
- Lernfreudig: Evidence erhaltend, aber weiterhin ohne Dauer.
- Dev-Empfehlung: purpose-getrennte Klassen; keine Dauer ohne Legal Review.
- Founder-/CTO-/Legal-Frage: Welche fachliche Notwendigkeit und gesetzliche Basis gilt je Event Ledger, Evidence, Modell, Report, Attention und Export?

## Eingefrorene Auswahl für den nächsten begrenzten Slice

- Search Contextual Maturity: drei unabhängige semantisch passende Journeys.
- Search Long-Term Readiness: sechs unabhängige Eigennutzer-Journeys; Context bleibt erhalten.
- Skip Maturity: drei unabhängige passende Journeys; nur sehr schwach und situationsgebunden.
- Concept Taste: drei unterschiedliche Spots und drei qualifizierte, gerichtete Experiences mit sicherer Event-time-Attribution.
- Retention: zweckgetrennte Klassen; konkrete Fristen bleiben bis Legal-/CTO-Freigabe unkonfiguriert.

Keine dieser Auswahlen aktiviert Runtime, Ranking, Eligibility, Shadow Traffic oder Production.
