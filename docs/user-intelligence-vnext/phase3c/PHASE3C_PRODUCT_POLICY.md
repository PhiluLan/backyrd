# User Intelligence vNext Phase 3C – Product Interpretation Policy

## Status und Grenze

`backyrd.user-intelligence.interpretation-policy@3c-1` ist die fachlich freigegebene, aber technisch nicht aktivierte Backyrd-Interpretationsspezifikation. Sie ist keine umbenannte Calibration Policy. Ihre Herkunft wird durch den unveränderlichen Founder-Decision-Record, einen Product-Governance-Release und einen separat akzeptierten CTO-Trust-Anchor belegt.

Alle Aktivierungsfelder bleiben `false`: `productionAuthorized`, `runtimeActivated`, `shadowTrafficAuthorized`, `rankingAuthorized` und `eligibilityAuthorized`. Es gibt weder Product Wiring noch Ranking-, Eligibility- oder Deployment-Wirkung.

## Semantik

- Explizites „hat gepasst“ oder „hat nicht gepasst“ benötigt authentifizierte User Action und eine gebundene qualifizierte Experience. Die Aussage betrifft persönliche Passung.
- Review und Visit belegen Experience, nicht Satisfaction. Standard und Smart Review sind lernsemantisch identisch.
- Save ist ein neutraler Direct-Spot-Planning-State; Removal beendet nur diesen Zustand.
- Familiarity entsteht exakt ab drei unabhängigen serververifizierten Visits desselben Spots und ist keine Präferenz.
- Ein Moment stützt nur eine separat autorisierte Experience. Dwell bleibt getrennte, nicht Decision-autorisierte Attention Research Observation.
- Skip und explizites Spot-„passt nicht“ bleiben schwache Spot×Decision×Context-Evidence. Die Reifeschwelle ist nicht konfiguriert.
- Search übernimmt nur minimierte Concept-/Context-IDs. Einzelne Suche ist aktuelle Absicht; weitere Promotionsschwellen bleiben nicht konfiguriert.
- Pro Journey wirkt für gerichtetes Learning nur das stärkste autorisierte Signal. Schwächere Beobachtungen bleiben im Audit.
- Context bleibt gebunden; es gibt kein automatisches Decay und kein „Newest wins“.
- Sicherer allgemeiner Concept Taste verlangt mehrere unabhängige Spots und sichere World Attribution. Die konkrete Mindestanzahl ist nicht konfiguriert.
- Semantische Konflikte bleiben append-only, ungelöst und gerichtet aus dem Evaluation Preview zurückgehalten.

## Qualitative Evidenzklassen

Die Policy kennt ausschließlich `EXPLICIT_STRONG`, `CONTEXTUAL_REPEATED`, `WEAK_CONTEXTUAL_NEGATIVE`, `NEUTRAL_STATE`, `RESEARCH_ONLY` und `NO_TASTE_EFFECT`. Das sind Kategorien, keine Gewichte. Es existieren keine Scores, universellen Confidence-Werte oder Decay-Zeiträume.

## Authority und Verarbeitung

Bestehende kanonische Events passieren zuerst die rekursive Phase-2-Verifikation und den Phase-3B-Adapter. Phase 3C minimiert erst danach. Neue, noch nicht kanonisch produzierte Eventarten existieren ausschließlich als klar markierte synthetische Fixtures mit separater Evaluation Authority. Ein Eigenhash, TypeScript-Cast oder selbst erzeugter Ersatz-Trust-Anchor autorisiert weder Founder Record noch Policy oder Evidence.

`RelevantUserProjection` bleibt der einzige Decision-Port. Phase 3C erzeugt nur einen ausdrücklich nicht produktiven Evaluation Preview und eine leere Production-Boundary-Assertion. Eine spätere echte Projection benötigt einen eigenen Aktivierungsauftrag.

## Offene Übergänge

`searchContextualMaturity`, `searchLongTermPromotion`, `skipMaturity`, `conceptTasteMinimumIndependentSpots` und konkrete `retentionDurations` bleiben `NOT_CONFIGURED` und fail-closed. Automatisches Decay ist `FORBIDDEN`.
