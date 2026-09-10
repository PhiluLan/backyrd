# ADR-003 — User Model & Learning Kernel

Status: Phase-3A-Foundation, nicht produktiv autorisiert

## Entscheidung

Phase 3A führt nach der kanonischen Evidence Engine eine eigene deterministische Schicht ein:

`Canonical Event → Evidence Chain → Observation Record → Interpretation Record → User Model Snapshot → RelevantUserProjection`

Observation und Interpretation sind getrennte, unveränderliche und hashgebundene Artefakte. Ein Interpretation Record ist nur gültig, wenn die serverseitig injizierte Authority exakt Subject, Consent, Lifecycle, Evidence State, Interpretation Policy, Concept Registry, Reducer und Temporal Policy bindet. Ein selbst erzeugter Hash oder ein Policy-Label ist keine Herkunftsautorität.

## Policy-Grenze

Die Foundation akzeptiert ausschließlich Policies mit `authority: SYNTHETIC_FIXTURE_ONLY` und `productionAuthorized: false`. Der Manifest-Contract hält `productionPolicyConfigured: false`, `retentionConfigured: false`, Recency und Decay als `NOT_CONFIGURED` fest. Es gibt keine freigegebene Backyrd-Signalstärke, kein Gewicht und keinen numerischen Taste Score.

## Domain-Trennung

Long-Term Concept Taste, Recent Preference, Contextual Taste, Aversion, Practical Preference, Direct Spot Affinity und Exploration/Familiarity besitzen getrennte Collections. Positive und negative Evidence kann gleichzeitig bestehen. Direct Spot Affinity setzt strukturell `propagatesToConceptTaste: false`. Contextual Statements setzen `transfersToLongTermTaste: false`.

## Integrität

Der rekursive Verifier baut den gesamten Zustand erneut aus dem autoritativ verifizierten Phase-2-Evidence-State. Dadurch scheitern innere Manipulationen auch dann, wenn Interpretation-, Snapshot- und State-Hashes neu berechnet wurden. Full Rebuild und Incremental Update benutzen denselben Reducer und sind bei identischen semantischen Inputs byte-identisch.

## Decision-Grenze

Der bestehende `RelevantUserProjection`-Contract bleibt kanonisch. Da Phase 3A keine Production Projection Policy besitzt, erzeugt der Compatibility Adapter ausschließlich neutrale, minimierte Projections. User Intelligence erhält weder Eligibility- noch Ranking-Autorität.

## Folgen

- Kein Product Wiring, keine Migration und keine Production-Daten.
- Alte numerische Taste-/Memory-Systeme werden nicht als Zielsemantik übernommen.
- Eine echte Interpretation Policy, Context-Allowlist, Retention und kalibrierte Sufficiency bleiben Founder-/Product-Entscheidungen.
