# Existing System Audit

## Ergebnis

Phase 3A ist die belastbare Basis und wird erweitert, nicht ersetzt. Sie trennt Observation und Interpretation, bindet Evidence/Policy/Registry/Reducer extern, besitzt einen echten inkrementellen Reducer, rekursive Verifikation, Lifecycle Execution Evidence und eine nicht-personenbezogene neutrale Projection. Das vollständige Producer-/Consumer-Inventar aus Phase 2 (`../EVENT_SYSTEM_AUDIT.md` und `../event-producer-consumer-matrix.json`) sowie das Taste-/Memory-Audit aus Phase 3A (`../phase3a/EXISTING_TASTE_MEMORY_AUDIT.md`) bleiben die kanonische Detailbasis; Phase 3B ersetzt oder dupliziert diese Inventare nicht.

Die Lücke vor Phase 3B war fachlich: Es gab nur kleine `SYNTHETIC_FIXTURE_ONLY`-Regeln zum Beweis der Architektur, aber keine vollständige Event-Semantics-Registry, keine drei nachvollziehbaren Policy-Kandidaten, keine multidimensionale Calibration-Auswertung und keinen gemeinsamen 34-Szenarien-Vergleich.

Zusätzlich zeigte die Regression eine kanonische Consumer-Inkonsistenz: Die abgenommene Phase-3A-Projection verwendet bei neutralen Ergebnissen absichtlich einen konstanten, nicht-personenbezogenen Subject-Hash. Der Decision-vNext-Testadapter verlangte noch den persönlichen Actor-Hash. Phase 3B passt ausschließlich diesen Consumer-Abgleich an den bestehenden Projection-Contract an; aktive Projektionen bleiben streng usergebunden, Ranking und Eligibility bleiben unverändert.

## Einordnung

| Bestandteil | Einstufung | Phase-3B-Behandlung |
|---|---|---|
| Phase-2 Evidence Chains | KEEP | ausschließliche fachliche Quelle; im Lab über extern akzeptierte synthetische Evidence-Referenzen repräsentiert |
| Observation Records | KEEP | unveränderliche Tatsachenebene |
| Interpretation Records | EXTEND | Calibration Interpretations bleiben eigene, hashgebundene Artefakte |
| Model Authority und Trust Anchor | KEEP | separates Policy- und Evidence-Acceptance-Layer ergänzt |
| Phase-3A Reducer/Checkpoint | KEEP | echter Delta-Pfad bleibt kanonisch; Policy-/Registry-/Reducer-Wechsel verlangt Full Rebuild |
| Phase-3A Interpretation Policy | EXTEND | drei nicht-produktive Kandidaten mit vollständigen Strategiebindungen |
| Globale Phase-3A Sufficiency | REPLACE | für Calibration durch multidimensionale Kennzahlen ergänzt; keine Product-Grenzwerte |
| `RelevantUserProjection` | KEEP | echte Projection bleibt neutral; keine Contract-Kopie |
| Calibration Projection | EXTEND | klar getrennt, `CALIBRATION_ONLY`, ohne Ranking/Eligibility |
| Lifecycle Manifest | EXTEND | Calibration Reports und Calibration Rebuild Material ergänzt |
| Legacy Taste-Faktoren/Eventgewichte | PROHIBITED | keine Übernahme ohne Product-Freigabe |
| Dwell/Quick Skip/Reject-Semantik | UNKNOWN / NEEDS PRODUCT DECISION | fail-closed `NOT_CONFIGURED` |
| Search/Moment/Review-Mood | UNKNOWN / NEEDS PRODUCT DECISION | nur `RESEARCH_ONLY`, nicht projectable |
| World Knowledge | KEEP | Concepts nur über Registry-ID und Event-time Certainty; Konflikte bleiben sichtbar |
| Context | KEEP | separate Bindung; kein Long-Term-Transfer |
| Decision vNext | KEEP | User Intelligence liefert weder Eligibility noch Ranking-Anweisungen |
| Product Producer/Wiring | PROHIBITED | keine Verwendung; spätere Anbindung benötigt eigenen Workstream |

Die maschinenlesbare Entsprechung befindet sich in `compatibility-matrix.json`.
