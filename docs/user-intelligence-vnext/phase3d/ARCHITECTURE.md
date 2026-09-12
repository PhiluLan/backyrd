# Phase 3D – Offline Calibration & Founder User Lab

## Grenzen

Das Lab ist `FOUNDER_EVALUATION_ONLY`, `LOCAL_ONLY` und `NOT_PRODUCTION_AUTHORIZED`. Es verarbeitet ausschließlich pseudonyme synthetische Daten. Es ruft weder Decision Runtime noch Supabase auf und besitzt keine Ranking-, Eligibility- oder Deployment-Autorität.

## Datenfluss

1. Ein isolierter Node-Loopback-Server bindet ausschließlich an `127.0.0.1`. Seine Browser-API akzeptiert nur allowlist-validierte Handlungen; Policy, Authority, Signalstärke und Independence sind nicht clientwählbar.
2. Die deutschsprachige Browser-App sendet kontrollierte Aktionen. Freie Suchtexte werden flüchtig durch eine kleine deterministische Fixture-Minimierung in freigegebene Concept- und Context-IDs übersetzt oder als `NOT_CONFIGURED` abgewiesen.
3. Der versionierte lokale Store schreibt atomar unter `.local/`, besitzt einen Integritäts-Hash und enthält keinen Suchrohtext.
4. Ein Preset erzeugt eine streng validierte lokale Handlung ohne Rohsuchtext oder private Daten.
5. Die Handlung durchläuft dieselbe Phase-3C-Observation- und externe Evidence-Anchor-Grenze wie alle synthetischen Product-Policy-Fixtures.
6. Der kanonische Phase-3C-Reducer erzeugt Observation, Interpretation, Conflict, Sufficiency und eine neutrale Production Boundary.
7. Drei Phase-3D-Kandidaten vergleichen ausschließlich die fünf `NOT_CONFIGURED`-Übergänge.
8. Founder-Primäransicht, Timeline, Policy-Vergleich und Rebuild-Kontrollen bleiben verständlich; IDs und Hashes stehen nur in der geschlossenen Expertensicht. Der vollständige Bericht ist ein CI-Artefakt.

## Trust

Kandidatenset, Release und Trust Anchor sind getrennt versioniert. Der Verifier akzeptiert nur den kanonischen Repository-Anchor. Ein selbst erzeugter Ersatz-Root, Rehash oder Production-Relabeling scheitert. Die Phase-3C-Policy bleibt unverändert und runtime-inaktiv.

## World Cohort

Ohne explizites Cohort-Manifest nutzt das Lab drei synthetische Spots. Ein späteres, kanonisches Founder-Cohort-Manifest mit höchstens 40 Spot-IDs wird ausschließlich über `WorldKnowledgeReaderPort` gelesen. Unbekannte oder widersprüchliche World-Eigenschaften bleiben sichtbar; direkte Tabellenkenntnis existiert nicht.

## Lifecycle

Lokale Testdaten verwenden bestehende Lifecycle-Klassen für subject-bound Evaluation Fixtures, Reports und Rebuild-Material. Withdrawal und Reset entfernen Subject Binding, Events, Checkpoint und Rebuild-Material; Erasure entfernt den vollständigen ausgewählten Testnutzer-Record. Der getrennte Privacy-/Legal-Testexport ist keine Product-Profilansicht.
