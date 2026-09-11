# ADR-004 – Eine freigegebene, runtime-inaktive Product Interpretation Policy

## Status

Accepted for specification; runtime inactive.

## Entscheidung

Phase 3C führt genau eine hybride Policy ein, gebunden an alle 20 Founder-Entscheidungen. Sie übernimmt explizite Outcomes konservativ, neutrale Planning-/Familiarity-Zustände getrennt und Context/Exploration ohne Long-Term-Leakage. Sie ist keine Kopie der Candidates A, B oder C.

Founder Record, Signal Registry und Policy besitzen getrennte Content Hashes und externe Release-/Trust-Anchor-Bindungen mit injizierter Verifikationszeit. Der CTO-Anchor bindet außerdem das vollständige Release-Artefakt; die Release Summary bleibt rein informativ. Selbstkonsistente Ersatzartefakte scheitern gegen den kanonischen Trust-Einstieg. Bestehende Evidence wird vor der Ableitung rekursiv über Phase 2 verifiziert.

## Konsequenzen

- Es existiert eine eindeutige fachliche Semantik, aber keinerlei Runtime-Aktivierung.
- `RelevantUserProjection` bleibt der einzige Decision-Vertrag; die Phase-3C-Ausgabe ist nur Evaluation Preview.
- Die feste Product-Schwelle beträgt ausschließlich drei unabhängige Visits für Familiarity.
- Search-, Skip-, Concept-Promotion- und Retention-Schwellen bleiben sichtbar nicht konfiguriert.
- Current Search Intent und Concept-Promotion-Readiness sind eigene nicht-projectable Zustände und keine Taste-Aussagen.
- Privacy Export besitzt eine eigenständige Legal Authority und ist nicht über die normale Product-Auswertung erreichbar.
- Änderungen erfordern neue Versionen und erneute Founder-/CTO-Autorisierung.
