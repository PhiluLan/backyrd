# Phase 3D – Offline Calibration & Founder User Lab

## Grenzen

Das Lab ist `FOUNDER_EVALUATION_ONLY`, `LOCAL_ONLY` und `NOT_PRODUCTION_AUTHORIZED`. Es verarbeitet ausschließlich pseudonyme synthetische Daten. Es ruft weder Decision Runtime noch Supabase auf und besitzt keine Ranking-, Eligibility- oder Deployment-Autorität.

## Datenfluss

1. Ein Preset erzeugt eine streng validierte lokale Handlung ohne Rohsuchtext oder private Daten.
2. Die Handlung durchläuft dieselbe Phase-3C-Observation- und externe Evidence-Anchor-Grenze wie alle synthetischen Product-Policy-Fixtures.
3. Der kanonische Phase-3C-Reducer erzeugt Observation, Interpretation, Conflict, Sufficiency und eine neutrale Production Boundary.
4. Drei Phase-3D-Kandidaten vergleichen ausschließlich die fünf `NOT_CONFIGURED`-Übergänge.
5. Ein verständlicher Founder-Bericht und eine optionale Expertensicht werden erzeugt. Der vollständige Bericht ist ein CI-Artefakt; nur sein kompakter Hashbeleg liegt im Repository.

## Trust

Kandidatenset, Release und Trust Anchor sind getrennt versioniert. Der Verifier akzeptiert nur den kanonischen Repository-Anchor. Ein selbst erzeugter Ersatz-Root, Rehash oder Production-Relabeling scheitert. Die Phase-3C-Policy bleibt unverändert und runtime-inaktiv.

## World Cohort

Ohne explizites Cohort-Manifest nutzt das Lab drei synthetische Spots. Ein späteres, kanonisches Founder-Cohort-Manifest mit höchstens 40 Spot-IDs wird ausschließlich über `WorldKnowledgeReaderPort` gelesen. Unbekannte oder widersprüchliche World-Eigenschaften bleiben sichtbar; direkte Tabellenkenntnis existiert nicht.

## Lifecycle

Lokale Testdaten verwenden bestehende Lifecycle-Klassen für subject-bound Evaluation Fixtures, Reports und Rebuild-Material. Withdrawal leert den aktiven lokalen Zustand, Reset stellt einen frischen pseudonymen Zustand her, Erasure löscht die lokale Datei. Der Legal-Export-Pfad bleibt von einer Product-Profilansicht getrennt.
