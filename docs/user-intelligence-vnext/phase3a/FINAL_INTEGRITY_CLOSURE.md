# Phase 3A — Final Integrity Closure

## Trust entry points

`parseUserModelState` prüft ausschließlich Struktur, erlaubte Contract-Versionen und innere Eigenhashes. Ein dadurch akzeptierter State ist noch nicht vertrauenswürdig.

`verifyUserModelState` ist der kanonische Trust-Einstiegspunkt. Er verifiziert zuerst Phase-2-Evidence rekursiv, bindet anschließend Model Authority, Consent, Lifecycle, Interpretation Policy, Concept Registry, Reducer Release, Temporal- und Projection Policy an einen separat injizierten Trust Anchor und rekonstruiert danach Observations, Interpretations, Attribution, Sufficiency, Konflikte, Snapshot, Pointer und Evidence Checkpoint.

## Externe Model Authority

Ein `UserModelAuthorityRecord` bindet Record-ID/-Hash, Subject, authentifizierten User, Consent-Hash, Lifecycle, Policy-ID/-Version/-Hash, Registry, Reducer Release, Temporal-/Projection-Policy, Retention-Status und Gültigkeit. Ein unabhängiger `UserModelAuthorityTrustAnchor` akzeptiert exakt Record-ID, Record-Hash und Issuer. Die synthetischen Convenience-Fixtures sind `SYNTHETIC_FIXTURE_ONLY` und niemals Production-autorisierend.

## Echter inkrementeller Pfad

`updateUserModel` delegiert den Zielzustand nicht an `buildUserModel`. Der Pfad:

1. verifiziert Previous State und dessen Evidence Checkpoint rekursiv;
2. verifiziert den neuen vollständigen autoritativen Evidence-Ledger;
3. verlangt monotone Ledger-Historie und unveränderte historische World-/Context-Bindings;
4. bestimmt neue oder hashveränderte Chains;
5. übernimmt unveränderte Observations und Interpretations byte-identisch;
6. verarbeitet ausschließlich neue beziehungsweise autorisiert korrigierte Chains;
7. aggregiert daraus Snapshot, Pointer und neuen Checkpoint.

Policy-, Registry-, Reducer- oder Temporal-Wechsel verlangen einen unabhängigen Full Rebuild.

## Full-/Incremental-Paritätsmatrix

| Fall | Ergebnis |
|---|---|
| Nicht leerer Previous State + neues Event | byte-identisch |
| Mehrere unabhängige Journeys | byte-identisch |
| Duplicate/Retry ohne neue kanonische Evidence | byte-identisch |
| Correction eines bestehenden Events | byte-identisch |
| Verspätetes autorisiertes Event | byte-identisch |
| Positive und negative Delta-Evidence | byte-identisch |
| Context-bound Evidence | byte-identisch |
| Direct Spot Affinity | byte-identisch |
| Fehlender Checkpoint-/Ledger-Eintrag | fail-closed |
| Entfernte oder ersetzte Historie/World Binding | fail-closed |
| Policy-, Registry- oder Reducer-Wechsel | Full Rebuild erforderlich |
| Fremder User oder manipulierter Previous State | fail-closed |

## Lifecycle

`planUserModelLifecycle` liefert ausschließlich `PLANNED`. Die Pflichtmenge wird intern aus dem kanonischen Lifecycle Manifest und dessen Hash abgeleitet. `COMPLETED` entsteht nur aus genau einem extern akzeptierten Store-Execution-Record pro Manifest Store. Account Erasure verlangt `DELETE` für jeden personenbezogenen Store; ein nicht-personenbezogener Audit-Rest benötigt den autorisierten Nachweis `personalDataRemaining:false`.

## Projection und Sufficiency

Privacy-neutrale Projections verwenden eine nicht-personenbezogene neutrale Subject-Bindung und eine Identität, die nur Request-/Decision-, Contract-, Projection-Policy- und Reason-Identität enthält. Model-, Snapshot-, Evidence-, Interpretation-, Pointer- und Subject-Hashes besitzen keinen Pfad in die neutrale Projection.

Sufficiency bindet Policy-ID/-Hash, `SYNTHETIC_FIXTURE_ONLY`, `productCalibrated:false`, `productionAuthorized:false`, Limitations und die verwendeten Fixture-Schwellen. Selbst `SUFFICIENT` kann in Phase 3A keine nicht-neutrale Decision Projection erzeugen.

## Production-Grenze

Keine Migration, kein Storage, kein Product Wiring, keine echte Interpretation Policy, keine Production-Retention, kein Ranking und kein Deployment.
