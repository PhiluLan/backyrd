# Phase 3D – Skip Aggregation & Founder UX Closure

## Root Cause

Die erste Lab-Version gruppierte `QUICK_SKIP` nach `spotId + decisionId + contextHash`. Die `decisionId` bezeichnet jedoch eine einzelne technische Decision-Ausführung. Dadurch erzeugte jede unabhängige Journey ein neues Gruppierungsziel und keine Kandidatenschwelle konnte erreicht werden.

## Korrigierte Identitäten

- Provenance bleibt je Event vollständig getrennt: Subject, Event-/Record-Hash, Source-Evidence-/Chain-Hash, Spot, Journey, Decision-Execution, Context und Zeitpunkt.
- Das Maturity-Ziel ist `subjectBindingHash + spotId + decisionTaskHash + contextHash`.
- `decisionTaskHash` bindet die geschlossene Fixture-Aufgabe an `backyrd.user-intelligence.fixture-decision-task@3d-1`.
- Die konkrete Decision-Execution-ID ist kein Bestandteil des Maturity-Ziels und bleibt ausschließlich Provenance.
- Pro serveraufgelöster Journey zählt höchstens ein aktiver Skip. Inaktive oder korrigierte Skips, Retries und Duplikate erhöhen die Reife nicht.

## Calibration-Grenze

Die drei weiterhin nicht produktiven Kandidaten vergleichen 8, 5 und 3 unabhängige passende Journeys. Ein erreichtes Ziel ist ausschließlich eine sehr schwache, situationsgebundene Calibration-Hypothese; globale Spot-/Concept-Aversion, Ranking und Eligibility bleiben ausgeschlossen.

Der historische Teilentscheidungsstand bleibt unverändert in `PHASE3D_CALIBRATION_DECISIONS.json`. Die spätere Founder-Auswahl für Search Contextual Maturity (3), Search Long-Term Promotion (6), Skip Maturity (3), Concept Taste (3 Spots/3 Experiences) und zweckgetrennte Retention ist append-only in `PHASE3D_FOUNDER_CALIBRATION_DECISIONS.json` gebunden. Phase 3C bleibt unverändert; keine Auswahl ist für Production aktiviert.

## Founder-Ansicht

Die Aufgabe wird aus einer geschlossenen Auswahlliste gewählt. Die normale Ansicht zeigt verständliche deutsche Reifeangaben, das semantische Ziel und die weiterhin geltende Abgrenzung. Technische IDs, Hashes, Authority-Codes und interne Risiko-Codes stehen nur in der Expertensicht.
